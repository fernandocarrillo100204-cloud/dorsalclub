import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { calcularBalanceGeneral } from "../src/lib/balanceGeneral";
import { firebaseInMemory } from "./helpers/firestoreMemory";

const sale: any = { id: "sale", tipo: "salida", cantidad: 1, precio_unitario_venta: 1000 };
const purchase: any = { id: "purchase", subtotal: 400, costo_envio: 50, comisiones: 10, descuentos: 20, total: 440 };
const expense: any = { id: "expense", concepto: "Publicidad", monto: 100, fecha: new Date(2026, 0, 1) };
let value = calcularBalanceGeneral([sale], [purchase], [expense], []);
assert.equal(value.mercanciaComprada, 380);
assert.equal(value.costosCompras, 60);
assert.equal(value.egresos, 540);
assert.equal(value.balance, 460);
assert.equal(calcularBalanceGeneral([], [], [], []).balance, 0);
assert.equal(calcularBalanceGeneral([{ ...sale, estado: "anulado" }], [{ ...purchase, estado: "anulada" }], [{ ...expense, en_papelera: true }], []).balance, 0);
value = calcularBalanceGeneral([sale], [{ ...purchase, clasificacion_financiera: "inversion_inicial" }], [{ ...expense, clasificacion_financiera: "inversion_inicial" }], []);
assert.equal(value.balance, 460, "La inversión inicial no queda oculta por la antigua clasificación.");
const first: any = { ...sale, venta_id: "one", venta_total_recibido: 550, ingreso_reconocido: 550, venta_subtotal: 1000, envio_cobrado_cliente: 100, total_costos_venta: 60 };
const second: any = { ...first, id: "second", ingreso_reconocido: undefined, envio_cobrado_cliente: undefined, total_costos_venta: undefined };
value = calcularBalanceGeneral([first, second], [], [], []);
assert.equal(value.mercanciaCobrada, 500);
assert.equal(value.extrasCobrados, 50);
assert.equal(value.costosVentas, 60);
assert.equal(value.ingresos, 550, "No se suman partidas o montos pendientes como dinero cobrado.");
const payment = { ...first, id: "pay", venta_id: undefined, venta_relacionada_id: "one", subtipo: "abono_venta", total_costos_venta: undefined };
value = calcularBalanceGeneral([first, second, payment], [], [], []);
assert.equal(value.ingresos, 1100);
assert.equal(value.mercanciaCobrada, 1000);
assert.equal(value.extrasCobrados, 100);
const refund = { ...payment, id: "refund", subtipo: "reembolso_venta", ingreso_reconocido: -1100, venta_total_recibido: -1100 };
value = calcularBalanceGeneral([first, second, payment, refund], [], [], []);
assert.equal(value.ingresos, 0);
assert.equal(value.mercanciaCobrada, 0);
assert.equal(value.extrasCobrados, 0);
assert.equal(value.costosVentas, 60, "Devolver mercancía no reembolsa un costo de paquetería pagado.");
assert.equal(calcularBalanceGeneral([{ ...sale, total_venta: 1000, total_cobrado: 1100, envio_cobrado_cliente: 100 }], [], [], []).extrasCobrados, 100);
assert.equal(calcularBalanceGeneral([{ ...sale, precio_unitario_venta: undefined }], [], [], []).ingresos, 0);
value = calcularBalanceGeneral([], [{ ...purchase, descuentos: 450, total: 10 }], [], []);
assert.equal(value.egresos, 10);
assert.equal(value.mercanciaComprada, 0);
assert.equal(value.costosCompras, 10);
value = calcularBalanceGeneral([], [], [], [{ tipo: "aportacion_capital", monto: 500 }, { tipo: "retiro_propietario", monto: 50 }, { tipo: "otro_ingreso", monto: 20, estado: "anulado" }] as any);
assert.equal(value.ingresosAnteriores, 500);
assert.equal(value.salidasAnteriores, 50);
assert.equal(value.balance, 450);

const mixed = calcularBalanceGeneral([
  { ...first, sku: "SKU-A", comentarios_venta: "Entrega personal" },
  { ...second, sku: "SKU-B" }, payment, refund,
  { ...sale, id: "cancelled", estado: "anulado" }
], [{ ...purchase, folio: "COMP-1", notas: "Primer pedido", items: [{ sku: "SKU-COMPRA", cantidad: 2, costo_unitario: 200, subtotal: 400, nombre_producto: "Camisa" }] }], [expense], [{ id: "capital", tipo: "aportacion_capital", monto: 500, concepto: "Capital", notas: "Anterior" }] as any);
assert.equal(mixed.movimientos.length, 7, "Un cobro por venta, abono, devolución, costo, compra, gasto y capital.");
assert.equal(mixed.movimientos.reduce((sum, row) => sum + Math.round(row.ingreso * 100), 0), Math.round(mixed.ingresos * 100));
assert.equal(mixed.movimientos.reduce((sum, row) => sum + Math.round(row.egreso * 100), 0), Math.round(mixed.egresos * 100));
assert.ok(mixed.movimientos.find(row => row.id === "venta-sale")?.descripcion.includes("SKU-A, 1 × SKU-B"));
assert.equal(mixed.movimientos.find(row => row.id === "venta-sale")?.comentario, "Entrega personal");
assert.equal(mixed.movimientos.find(row => row.tipo === "Compra")?.egreso, 440);
assert.equal(mixed.movimientos.find(row => row.tipo === "Compra")?.comentario, "Primer pedido");
assert.equal(mixed.movimientos.find(row => row.tipo === "Reembolso")?.ingreso, -1100);
assert.equal(mixed.movimientos.find(row => row.tipo === "Gasto extra")?.gasto?.id, expense.id);
const { default: MovimientosBalance } = await import("../src/components/finanzas/MovimientosBalance");
const table = renderToStaticMarkup(React.createElement(MovimientosBalance, { data: mixed, loading: false, busy: false, onEdit: () => {}, onArchive: () => {} }));
for (const text of ["Movimientos", "Descripción", "Comentario", "Primer pedido", "Reembolso", "Entrega personal", "Total acumulado"]) assert.ok(table.includes(text));
assert.ok(!table.includes("No necesitas capturarlos otra vez"));
const emptyTable = renderToStaticMarkup(React.createElement(MovimientosBalance, { data: calcularBalanceGeneral([], [], [], []), loading: false, busy: false, onEdit: () => {}, onArchive: () => {} }));
assert.ok(emptyTable.includes("<thead"));
assert.ok(emptyTable.includes("Sin movimientos registrados"));
const { default: ResumenBalance } = await import("../src/components/finanzas/ResumenBalance");
const summary = renderToStaticMarkup(React.createElement(ResumenBalance, { data: mixed, loading: false }));
for (const label of ["Ventas de mercancía cobradas", "Envíos y otros cargos cobrados", "Compras de mercancía", "Envíos y comisiones de compra", "Fletes y otros costos de venta", "Gastos operativos extra", "Otros ingresos anteriores"]) assert.ok(summary.includes(label));
assert.ok(summary.includes("<dl"));
assert.doesNotMatch(summary, /Ver detalle|Ocultar detalle/, "No debe aparecer un botón global en el resumen.");

const many = calcularBalanceGeneral([], [], Array.from({ length: 25 }, (_, i) => ({ ...expense, id: `expense-${i}`, concepto: `Gasto ${i}`, fecha: new Date(2026, 0, i + 1) })), []);
const paged = renderToStaticMarkup(React.createElement(MovimientosBalance, { data: many, loading: false, busy: false, onEdit: () => {}, onArchive: () => {} }));
assert.ok(paged.includes("Cargar más"));
assert.equal((paged.match(/Ver detalle<\/button>/g) || []).length, 20, "Cada fila visible tiene un botón individual.");
assert.equal(mixed.movimientos.every(item => item.origen !== undefined), true, "Toda fila conserva sus datos de origen.");
assert.equal(mixed.movimientos.find(item => item.tipo === "Compra")?.origen?.tipo, "compra");
assert.equal(mixed.movimientos.find(item => item.tipo === "Reembolso")?.origen?.tipo, "venta");
assert.equal(mixed.movimientos.find(item => item.tipo === "Gasto extra")?.origen?.tipo, "gasto");
assert.equal(mixed.movimientos.find(item => item.tipo === "Ingreso anterior")?.origen?.tipo, "manual");

const { default: DetalleMovimientoBalance } = await import("../src/components/finanzas/DetalleMovimientoBalance");
for (const [tipo, expected] of [["Compra", "Proveedor"], ["Gasto extra", "Categoría"], ["Venta", "Cliente"], ["Ingreso anterior", "Tipo de registro"]] as const) {
  const row = mixed.movimientos.find(item => item.tipo === tipo);
  assert.ok(row, `Movimiento ${tipo} existe`);
  const html = renderToStaticMarkup(React.createElement(DetalleMovimientoBalance, { movimiento: row }));
  assert.match(html, /Referencia \/ folio/);
  assert.ok(html.includes(expected), `El detalle de ${tipo} contiene ${expected}`);
}
const purchaseDetail = renderToStaticMarkup(React.createElement(DetalleMovimientoBalance, {
  movimiento: mixed.movimientos.find(item => item.tipo === "Compra")!
}));
assert.match(purchaseDetail, /Artículos comprados/);
assert.match(purchaseDetail, /Flete de compra/);
for (const label of ["Importe del movimiento", "Tipo de movimiento", "Fecha y hora", "Referencia / folio", "Concepto", "Ingreso registrado en esta fila", "Egreso registrado en esta fila", "Proveedor", "Drop", "Referencia de proveedor", "Subtotal de mercancía", "Flete de compra", "Comisiones", "Descuentos", "Total de la compra", "Artículos comprados", "Cantidad", "Costo unitario"]) {
  assert.ok(purchaseDetail.includes(label), `El nuevo diseño debe conservar el dato: ${label}`);
}
assert.ok(purchaseDetail.includes("Desglose de importes"), "Los importes están organizados por sección.");
assert.ok(purchaseDetail.includes("SKU-COMPRA"), "La tabla conserva las partidas.");
assert.ok(purchaseDetail.includes("Camisa"), "La tabla conserva el nombre de producto.");
assert.match(purchaseDetail, /text-3xl/, "Importe principal destacado.");
const saleDetail = renderToStaticMarkup(React.createElement(DetalleMovimientoBalance, {
  movimiento: mixed.movimientos.find(item => item.tipo === "Venta")!
}));
assert.match(saleDetail, /Productos de la venta/);
assert.match(saleDetail, /Precio unitario/);
for (const label of ["Cliente y operación", "Cobro y saldo", "Artículos vendidos", "Entrega cobrada al cliente", "Cliente", "Responsable de entrega", "Ubicación de entrega", "Estado del pago al registrar", "Método de este movimiento"]) {
  assert.ok(saleDetail.includes(label), `El detalle de venta incluye: ${label}`);
}
assert.doesNotMatch(saleDetail, /Costo absorbido por el negocio/, "No se mezcla la ficha de entrega con los cobros.");
const costDetail = renderToStaticMarkup(React.createElement(DetalleMovimientoBalance, {
  movimiento: mixed.movimientos.find(item => item.tipo === "Costo de venta")!
}));
assert.match(costDetail, /Costo absorbido por el negocio/);
assert.doesNotMatch(costDetail, /Artículos vendidos|Productos de la venta/, "El costo de entrega no repite la tabla de mercancía.");
const view = readFileSync(new URL("../src/components/finanzas/MovimientosBalance.tsx", import.meta.url), "utf8");
assert.match(view, /balance-detail-dialog-wide/, "Solo las compras necesitan una ventana de mayor ancho para sus columnas.");


assert.ok(paged.includes("Gasto 24"));
assert.ok(!paged.includes('>Gasto 0<'));
assert.equal(many.egresos, 2500);

const memory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key)
} });
const { firestoreService: service } = await import("../src/lib/firebase");
assert.equal(service.isConfigured(), false);
const created = await service.addGasto({ concepto: "Publicidad", monto: 100, fecha: new Date(2026, 0, 1), categoria: "Otros", notas: "Comentario", proveedor: "Conservar" });
assert.equal((await service.getBalanceGeneral()).balance, -100);
await service.updateGasto(created.id!, { concepto: "Publicidad corregida", monto: 80, notas: "" });
value = await service.getBalanceGeneral();
assert.equal(value.balance, -80);
assert.equal(value.gastos[0].proveedor, "Conservar");
assert.ok(!value.gastos[0].notas);
await service.deleteGasto(created.id!);
assert.equal((await service.getBalanceGeneral()).balance, 0);
await service.restaurarGastoPapelera(created.id!);
assert.equal((await service.getBalanceGeneral()).balance, -80);
const { WorkspaceProvider } = await import("../src/context/WorkspaceContext");
const { default: BalanceGeneral } = await import("../src/components/finanzas/BalanceGeneral");
const markup = renderToStaticMarkup(React.createElement(WorkspaceProvider, { children: React.createElement(BalanceGeneral) }));
for (const title of ["Balance general", "Ingresos totales", "Egresos totales", "Registrar gasto extra", "Envíos y comisiones de compra", "Gastos operativos extra"]) assert.ok(markup.includes(title));
assert.doesNotMatch(markup, /<select|Por mes|Cuentas por cobrar|Caja total|Operación<|recharts/);
assert.match(markup, /Historial acumulado de ingresos y egresos/, "La tabla vuelve a estar siempre visible.");
assert.match(table, /Ver detalle/, "Cada fila de movimientos cargada muestra su propio botón de detalle.");


const remote = await firebaseInMemory();
remote.put("movimientos/1", { ...first, fecha: new Date() });
remote.put("compras/1", { ...purchase, fecha: new Date() });
remote.put("gastos/1", expense);
value = await remote.service.getBalanceGeneral();
assert.equal(value.balance, -50);
assert.deepEqual(remote.queries.map(query => query.path).sort(), ["compras", "gastos", "movimientos", "movimientos_financieros"]);
const before = JSON.stringify([...memory]);
remote.reject("gastos");
await assert.rejects(remote.service.getBalanceGeneral(), { code: "permission-denied" });
assert.equal(JSON.stringify([...memory]), before, "Un fallo remoto no permite fallback ni datos parciales.");
console.log("Balance general: desglose, anticipos, abonos, reembolsos, descuentos, históricos, CRUD de gastos y lecturas sin fallback aprobados.");
