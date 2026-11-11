import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { calcularBalanceGeneral } from "../src/lib/balanceGeneral";
import {
  etiquetaUnidades, estadoVentaActual, metodoDelMovimiento,
  resumenCostoEntrega, resumenCobroVenta
} from "../src/lib/detallesFinancierosVenta";
import { firebaseInMemory } from "./helpers/firestoreMemory";
import DetalleMovimientoBalance from "../src/components/finanzas/DetalleMovimientoBalance";
import type { Movimiento, Producto, Venta } from "../src/types";

const original: Movimiento = {
  id: "mov-1", folio: "Salida-5", venta_id: "venta-5",
  sku: "BA-211", talla: "M", cantidad: 1, tipo: "salida",
  fecha: new Date("2026-11-10T23:24:00"), referencia: "ejemplo 1", usuario: "Prueba",
  estado_pago: "anticipo", canal_venta: "stock", canal_venta_nombre: "Stock",
  cliente_nombre: "ejemplo 1", venta_partida: 1,
  precio_unitario_venta: 1050, costo_unitario_venta: 420, total_venta: 1050,
  drop_id: "drop-1", drop_nombre: "DROP 1",
  venta_total_recibido: 1050, ingreso_reconocido: 1050,
  venta_subtotal: 1050, venta_total_cobrado: 1050, venta_saldo_pendiente: 0,
  costo_envio_venta: 25, total_costos_venta: 25,
  repartidor_nombre: "Fernando", ubicacion_entrega_nombre: "Galerías Monterrey"
};
const balance = calcularBalanceGeneral([original], [], [], []);
assert.equal(balance.ingresos, 1050);
assert.equal(balance.egresos, 25);
assert.equal(balance.balance, 1025);
const sale = balance.movimientos.find(row => row.tipo === "Anticipo");
const cost = balance.movimientos.find(row => row.tipo === "Costo de venta");
assert.ok(sale && cost);

const master = {
  id: "venta-5", folio: "Salida-5", cliente_nombre: "ejemplo 1",
  canal_venta: "stock", canal_venta_nombre: "Stock", fecha: new Date("2026-11-10T23:24:00"),
  subtotal: 1050, total: 1050, recibido: 1050, saldo: 0,
  envio_cobrado_cliente: 0, otros_cargos_cliente: 0,
  costo_envio_venta: 25, otros_costos_venta: 0,
  estado: "activo", estado_pago: "pagado", estado_pedido: "entregado",
  metodo_pago_inicial: "Transferencia",
  repartidor_nombre: "Fernando", ubicacion_entrega_nombre: "Galerías Monterrey",
  pagos: [{ id: "inicial", monto: 1050, metodo_pago: "Transferencia", fecha: new Date("2026-11-10T23:24:00"), usuario: "Prueba", estado: "activo" }]
} as Venta;
assert.equal(metodoDelMovimiento(original, master), "Transferencia", "La lectura usa el método real del pago inicial.");
assert.equal(estadoVentaActual(master), "Entregada", "El estado actual no sobrescribe la fotografía histórica.");
assert.equal(metodoDelMovimiento({ ...original, subtipo: "abono_venta", metodo_pago: undefined }, master), null, "No se inventa método de abono.");
assert.equal(metodoDelMovimiento({ ...original, subtipo: "abono_venta", metodo_pago: "Efectivo" }, master), "Efectivo");
assert.equal(etiquetaUnidades(1), "1 unidad");
assert.equal(etiquetaUnidades(2), "2 unidades");

const product: Producto = { sku: "BA-211", nombre: "Balenciaga Tape", marca: "Balenciaga", categoria: "General", unidad: "pieza", stock_minimo: 0 };
const productMap = new Map([["BA-211", product]]);
const saleHtml = renderToStaticMarkup(React.createElement(DetalleMovimientoBalance, {
  movimiento: sale, ventaActual: master, productosPorSku: productMap
}));
assert.match(saleHtml, /Cobro registrado/);
assert.match(saleHtml, /Cliente y operación/);
assert.match(saleHtml, /Cobro y saldo/);
assert.match(saleHtml, /Estado del pago al registrar/);
assert.match(saleHtml, /Estado actual de la venta/);
assert.match(saleHtml, /Transferencia/);
assert.match(saleHtml, /Entregada/);
assert.match(saleHtml, /Pagos registrados/);
assert.match(saleHtml, /1 unidad/);
assert.match(saleHtml, /Balenciaga Tape/);
assert.match(saleHtml, /DROP 1/);
for (const col of ["Producto", "Marca", "SKU", "Talla", "Drop", "Cantidad", "Precio unitario", "Subtotal"]) {
  assert.ok(saleHtml.includes(`>${col}</th>`), `Falta la columna ${col}`);
}
assert.doesNotMatch(saleHtml, /Costo absorbido por el negocio/, "La ficha de cobro no debe convertirse en ficha de flete.");
const noMasterHtml = renderToStaticMarkup(React.createElement(DetalleMovimientoBalance, { movimiento: sale }));
assert.match(noMasterHtml, /Recibido al registrar/);
assert.match(noMasterHtml, /No disponible/, "Si no hay venta maestra, no se inventa estado actual.");

const costHtml = renderToStaticMarkup(React.createElement(DetalleMovimientoBalance, {
  movimiento: cost, ventaActual: master, onVerVenta: () => {}
}));
for (const required of ["Flete de entrega", "Egreso registrado", "Costo real de la entrega", "Cubierto por el cliente", "Costo absorbido por el negocio", "Fernando", "Galerías Monterrey", "Ver venta relacionada"]) {
  assert.ok(costHtml.includes(required), `El flete debe incluir ${required}`);
}
assert.doesNotMatch(costHtml, /Artículos vendidos|Precio unitario|Pagos registrados|Cobro y saldo/, "El detalle del flete no duplica productos ni cobros.");
assert.equal(resumenCostoEntrega(original, cost.egreso, master).absorbido, 25);
assert.equal(resumenCostoEntrega(original, cost.egreso, { ...master, envio_cobrado_cliente: 10 }).absorbido, 15);
assert.equal(resumenCostoEntrega(original, cost.egreso, { ...master, envio_cobrado_cliente: 30 }).excedente, 5);
assert.equal(resumenCobroVenta(original, master, [original]).total, 1050);
const historic = resumenCostoEntrega({ ...original, costo_envio_venta: 25 }, 45, null);
assert.equal(historic.otrosCostos, 20);
const historicCost = { ...cost, egreso: 45 };
const historicHtml = renderToStaticMarkup(React.createElement(DetalleMovimientoBalance, { movimiento: historicCost }));
assert.match(historicHtml, /Otros costos históricos/, "Los costos históricos adicionales no se atribuyen falsamente al flete.");

// Consulta puntual: no es necesario recorrer todo el historial para resolver método y estado actual.
const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); },
  removeItem: (key: string) => { storage.delete(key); }
}});
const remote = await firebaseInMemory();
remote.put("ventas/venta-5", master);
const fetched = await remote.service.getVentaMaestraById("venta-5");
assert.equal(fetched?.metodo_pago_inicial, "Transferencia");
assert.equal(fetched?.estado_pago, "pagado");
assert.equal(await remote.service.getVentaMaestraById("no-existe"), null);
assert.equal(balance.ingresos, 1050, "La presentación no altera ingresos.");
assert.equal(balance.egresos, 25, "La presentación no duplica el flete.");
console.log("Detalles de venta y flete: pago actual, cobertura, 8 columnas, historial y balance aprobados.");
