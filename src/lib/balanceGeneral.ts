import type { Compra, Gasto, Movimiento, MovimientoFinancieroManual } from "../types";
import { allocateRecognizedSaleIncome } from "./ventasCore";
import { fechaRegistro } from "./lecturasVentas";

const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const cents = (value: number) => Math.round(value * 100);
const active = (item: { estado?: string; en_papelera?: boolean }) => !item.en_papelera && !["anulado", "anulada", "inactivo"].includes(item.estado || "");

/** Flujo acumulado. El costo de mercancía vendida nunca se vuelve a restar. */
export function calcularBalanceGeneral(sales: Movimiento[], purchases: Compra[], expenses: Gasto[], manual: MovimientoFinancieroManual[]) {
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
    // Abonos y reembolsos no vuelven a reconocer costos de envío.
    if (!sale.subtipo) saleCosts += cents(Math.max(0, typeof sale.total_costos_venta === "number" ? number(sale.total_costos_venta) : number(sale.costo_envio_venta) + number(sale.otros_costos_venta)));
  }
  for (const purchase of purchases.filter(active)) {
    const associated = Math.max(0, number(purchase.costo_envio)) + Math.max(0, number(purchase.comisiones));
    const subtotal = typeof purchase.subtotal === "number" ? number(purchase.subtotal) : (purchase.items || []).reduce((sum, item) => sum + number(item.cantidad) * number(item.costo_unitario), 0);
    const total = Math.max(0, typeof purchase.total === "number" ? number(purchase.total) : subtotal + associated - number(purchase.descuentos));
    // El descuento reduce mercancía primero; si excede su valor, reduce los cargos.
    const costs = Math.min(total, associated);
    purchaseGoods += cents(total - costs);
    purchaseCosts += cents(costs);
  }
  const gastos = expenses.filter(active).map(item => ({ ...item, fecha: fechaRegistro(item.fecha) })).sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  gastos.forEach(item => { extraCosts += cents(number(item.monto)); });
  manual.filter(active).forEach(item => {
    if (["otro_ingreso", "aportacion_capital", "ajuste_entrada"].includes(item.tipo)) historicIn += cents(number(item.monto));
    if (["retiro_propietario", "ajuste_salida"].includes(item.tipo)) historicOut += cents(number(item.monto));
  });
  const ingresos = merchandise + extras + historicIn;
  const egresos = purchaseGoods + purchaseCosts + saleCosts + extraCosts + historicOut;
  return { mercanciaCobrada: merchandise / 100, extrasCobrados: extras / 100, mercanciaComprada: purchaseGoods / 100,
    costosCompras: purchaseCosts / 100, costosVentas: saleCosts / 100, gastosExtra: extraCosts / 100,
    ingresosAnteriores: historicIn / 100, salidasAnteriores: historicOut / 100,
    ingresos: ingresos / 100, egresos: egresos / 100, balance: (ingresos - egresos) / 100, gastos };
}
export type BalanceGeneral = ReturnType<typeof calcularBalanceGeneral>;
