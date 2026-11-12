import type { Compra, Gasto, Movimiento, MovimientoFinancieroManual } from "../types";
import { allocateRecognizedSaleIncome } from "./ventasCore";
import { fechaRegistro } from "./lecturasVentas";
import { costoVentaEfectivamentePagado } from "./fletesVentas";

const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const cents = (value: number) => Math.round(value * 100);
const active = (item: { estado?: string; en_papelera?: boolean }) => !item.en_papelera && !["anulado", "anulada", "inactivo"].includes(item.estado || "");

export interface BalanceMovimiento {
  id: string;
  referencia: string;
  fecha: Date;
  tipo: string;
  descripcion: string;
  comentario: string;
  ingreso: number;
  egreso: number;
  gasto?: Gasto;
  origen?:
    | { tipo: "venta"; registro: Movimiento; partidas: Movimiento[] }
    | { tipo: "compra"; registro: Compra }
    | { tipo: "gasto"; registro: Gasto }
    | { tipo: "manual"; registro: MovimientoFinancieroManual };
}

/** Flujo acumulado. El costo de mercancía vendida nunca se vuelve a restar. */
export function calcularBalanceGeneral(sales: Movimiento[], purchases: Compra[], expenses: Gasto[], manual: MovimientoFinancieroManual[]) {
  const movimientos: BalanceMovimiento[] = [];
  const add = (row: BalanceMovimiento) => movimientos.push({ ...row, ingreso: cents(row.ingreso) / 100, egreso: cents(row.egreso) / 100 });
  const partidas = new Map<string, Movimiento[]>();
  sales.filter(active).filter(item => !item.subtipo).forEach(item => {
    const key = item.venta_id || item.id || "";
    const items = partidas.get(key) || [];
    items.push(item);
    partidas.set(key, items);
  });
  let merchandise = 0, extras = 0, purchaseGoods = 0, purchaseCosts = 0, saleCosts = 0, extraCosts = 0, historicIn = 0, historicOut = 0;
  for (const sale of sales.filter(active)) {
    if (sale.tipo !== "salida" || sale.subtipo === "seguimiento_pedido") continue;
    const charged = Math.max(0, number(sale.envio_cobrado_cliente)) + Math.max(0, number(sale.otros_cargos_cliente));
    const modern = typeof sale.venta_total_recibido === "number";
    const subtotal = modern ? number(sale.venta_subtotal) : typeof sale.total_venta === "number" ? number(sale.total_venta) : number(sale.precio_unitario_venta) * number(sale.cantidad);
    const received = modern ? number(sale.ingreso_reconocido) : typeof sale.total_cobrado === "number" ? number(sale.total_cobrado) : subtotal + charged;
    const allocation = allocateRecognizedSaleIncome({ recognizedAmount: received, merchandiseSubtotal: subtotal, shippingCharged: charged });
    merchandise += cents(allocation.merchandise);
    extras += cents(allocation.shipping + allocation.other);
    const referencia = sale.venta_id || sale.venta_relacionada_id || sale.folio || sale.id || "";
    const movimientosVenta = partidas.get(sale.venta_id || sale.venta_relacionada_id || sale.id || "") || [];
    const productos = movimientosVenta.map(item => `${item.cantidad} × ${item.sku}`).join(", ");
    const tipo = sale.subtipo === "reembolso_venta" ? "Reembolso" : sale.subtipo === "abono_venta" ? "Abono" : sale.estado_pago === "anticipo" ? "Anticipo" : "Venta";
    const base = { referencia: sale.folio || referencia, fecha: fechaRegistro(sale.fecha), comentario: sale.comentarios_venta || "" };
    const income = (cents(allocation.merchandise) + cents(allocation.shipping + allocation.other)) / 100;
    if (income !== 0) add({ ...base, id: `venta-${sale.id || movimientos.length}`, tipo, descripcion: [productos || sale.referencia || "Cobro de venta", sale.cliente_nombre].filter(Boolean).join(" · "), ingreso: income, egreso: 0, origen: { tipo: "venta", registro: sale, partidas: movimientosVenta } });
    // Abonos y reembolsos no vuelven a reconocer costos de envío.
    if (!sale.subtipo) {
      const cost = costoVentaEfectivamentePagado(sale);
      saleCosts += cents(cost);
      if (cents(cost) !== 0) add({ ...base, id: `costo-${sale.id || movimientos.length}`, tipo: "Costo de venta", descripcion: ["Envíos y otros costos", productos, sale.concepto_otros_costos].filter(Boolean).join(" · "), ingreso: 0, egreso: cost, origen: { tipo: "venta", registro: sale, partidas: movimientosVenta } });
    }
  }
  for (const purchase of purchases.filter(active)) {
    const associated = Math.max(0, number(purchase.costo_envio)) + Math.max(0, number(purchase.comisiones));
    const subtotal = typeof purchase.subtotal === "number" ? number(purchase.subtotal) : (purchase.items || []).reduce((sum, item) => sum + number(item.cantidad) * number(item.costo_unitario), 0);
    const total = Math.max(0, typeof purchase.total === "number" ? number(purchase.total) : subtotal + associated - number(purchase.descuentos));
    // El descuento reduce mercancía primero; si excede su valor, reduce los cargos.
    const costs = Math.min(total, associated);
    purchaseGoods += cents(total - costs);
    purchaseCosts += cents(costs);
    add({ id: `compra-${purchase.id || movimientos.length}`, referencia: purchase.folio || purchase.id || "", fecha: fechaRegistro(purchase.fecha), tipo: "Compra", descripcion: [purchase.drop_nombre, purchase.proveedor, (purchase.items || []).map(item => `${item.cantidad} × ${item.nombre_producto || item.sku}`).join(", ")].filter(Boolean).join(" · ") || "Compra de mercancía", comentario: purchase.notas || "", ingreso: 0, egreso: (cents(total - costs) + cents(costs)) / 100, origen: { tipo: "compra", registro: purchase } });
  }
  const gastos = expenses.filter(active).map(item => ({ ...item, fecha: fechaRegistro(item.fecha) })).sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  gastos.forEach(item => {
    extraCosts += cents(number(item.monto));
    add({ id: `gasto-${item.id || movimientos.length}`, referencia: item.id || "", fecha: item.fecha, tipo: "Gasto extra", descripcion: item.concepto, comentario: item.notas || "", ingreso: 0, egreso: number(item.monto), gasto: item, origen: { tipo: "gasto", registro: item } });
  });
  manual.filter(active).forEach(item => {
    const entrada = ["otro_ingreso", "aportacion_capital", "ajuste_entrada"].includes(item.tipo);
    const salida = ["retiro_propietario", "ajuste_salida"].includes(item.tipo);
    if (entrada) historicIn += cents(number(item.monto));
    if (salida) historicOut += cents(number(item.monto));
    if (entrada || salida) add({ id: `manual-${item.id || movimientos.length}`, referencia: item.id || "", fecha: fechaRegistro(item.fecha), tipo: entrada ? "Ingreso anterior" : "Salida anterior", descripcion: item.concepto, comentario: item.notas || "", ingreso: entrada ? number(item.monto) : 0, egreso: salida ? number(item.monto) : 0, origen: { tipo: "manual", registro: item } });
  });
  movimientos.sort((a, b) => b.fecha.getTime() - a.fecha.getTime() || a.id.localeCompare(b.id));
  const ingresos = merchandise + extras + historicIn;
  const egresos = purchaseGoods + purchaseCosts + saleCosts + extraCosts + historicOut;
  return { mercanciaCobrada: merchandise / 100, extrasCobrados: extras / 100, mercanciaComprada: purchaseGoods / 100,
    costosCompras: purchaseCosts / 100, costosVentas: saleCosts / 100, gastosExtra: extraCosts / 100,
    ingresosAnteriores: historicIn / 100, salidasAnteriores: historicOut / 100,
    ingresos: ingresos / 100, egresos: egresos / 100, balance: (ingresos - egresos) / 100, gastos, movimientos };
}
export type BalanceGeneral = ReturnType<typeof calcularBalanceGeneral>;
