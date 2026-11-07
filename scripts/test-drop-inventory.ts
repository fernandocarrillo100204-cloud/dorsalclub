import assert from "node:assert/strict";
import { firebaseInMemory } from "./helpers/firestoreMemory";
import { calcularInventarioDrop, calcularInventarioDrops } from "../src/lib/inventarioDrops";
import type { VentaRegistroInput, Venta } from "../src/types";

let localWrites = 0;
Object.defineProperty(globalThis, "localStorage", { value: { getItem: () => null, setItem: () => { localWrites++; }, removeItem: () => {} }, configurable: true });
const { service, data, put, queries, reject, retries } = await firebaseInMemory();
put("productos/TEST", { nombre: "Producto", sku: "TEST", stock_minimo: 0 });
const dropA = await service.addDrop({ nombre: "Drop A", estado: "en_venta" });
const dropB = await service.addDrop({ nombre: "Drop B", estado: "en_venta" });
const purchase = (dropId: string, quantity: number) => service.registerCompraTransaction({
  proveedor: "Proveedor", drop_id: dropId,
  items: [{ sku: "TEST", cantidad: quantity, costo_unitario: 100, subtotal: quantity * 100 }]
});
const purchaseA = await purchase(dropA.id, 2);
await purchase(dropB.id, 3);
const input = (items: { drop_id?: string; cantidad: number; sku?: string }[], deposit = 100): VentaRegistroInput => ({
  items: items.map(item => ({ sku: "TEST", ...item, precio_unitario_venta: 250, costo_unitario_venta: 100 })),
  referencia: "Prueba", cliente_nombre: "Mostrador", canal_venta: "stock", canal_venta_nombre: "Stock", porcentaje_precio: 150,
  afecta_stock: true, anticipo_porcentaje: deposit, minimo_piezas: 1, metodo_pago_inicial: "Efectivo"
});
const balance = async (id: string) => calcularInventarioDrop(id, await service.getDropDetail(id)).find(item => item.sku === "TEST")?.saldo || 0;
const assertNoLocationWrites = () => {
  assert.equal([...data.keys()].some(path => /^(stock|almacenes|resumen_ventas)\//.test(path)), false, "No se mantienen existencias por ubicación.");
  assert.equal(queries.some(query => /^(stock|almacenes|resumen_ventas)$/.test(query.path)), false, "No se consultan colecciones retiradas.");
};
await assert.rejects(purchase("", 1), /Selecciona el drop/);
await assert.rejects(service.deleteProducts(["TEST"]), /existencias en un drop/);
await assert.rejects(service.registerVentaTransaction(input([{ cantidad: 1 }])), /drop/);
await assert.rejects(service.registerVentaTransaction(input([{ drop_id: dropA.id, cantidad: 3 }])), /Disponibilidad insuficiente/);
await assert.rejects(service.registerVentaTransaction(input([{ drop_id: dropA.id, cantidad: 2 }, { drop_id: dropA.id, cantidad: 1 }])), /Disponibilidad insuficiente/);
assertNoLocationWrites();
const mixed = await service.registerVentaTransaction(input([{ drop_id: dropA.id, cantidad: 1 }, { drop_id: dropB.id, cantidad: 2 }]));
let master = data.get("ventas/" + mixed.id) as Venta;
assert.deepEqual(master.drop_ids, [dropA.id, dropB.id]);
assert.equal(master.drop_id, undefined, "Una venta mixta no debe atribuirse entera al primer drop.");
assert.equal(master.total, 750);
assertNoLocationWrites();
assert.equal(await balance(dropA.id), 1);
assert.equal(await balance(dropB.id), 1);
assert.equal(calcularInventarioDrop(dropA.id, await service.getDropDetail(dropA.id))[0].ventaTotal, 250);
await assert.rejects(service.updateVentaDropAssociation(mixed.id, dropB.id), /origen/);
await assert.rejects(service.enviarCompraPapelera(purchaseA.id), /drop|vendida/);
await assert.rejects(service.updateCompraDropAssociation(purchaseA.id, dropB.id), /drop/);
await service.devolverVentaCompleta(mixed.id, "Devolución de prueba");
assertNoLocationWrites();
assert.equal(await balance(dropA.id), 2);
assert.equal(await balance(dropB.id), 3);
await service.enviarVentaPapelera(mixed.id);
const returnedLine = [...data].find(([path, value]) => path.startsWith("movimientos/") && value.venta_id === mixed.id)!;
await service.restaurarMovimientoPapelera(returnedLine[0].split("/")[1]);
assert.equal(await balance(dropA.id), 2, "Restaurar una venta devuelta no debe devolver piezas por segunda vez.");
assert.equal(await balance(dropB.id), 3);
await assert.rejects(service.devolverVentaCompleta(mixed.id, "Otra vez"), /devuelta/);
const unpaid = await service.registerVentaTransaction(input([{ drop_id: dropA.id, cantidad: 1 }, { drop_id: dropB.id, cantidad: 1 }], 0));
await service.enviarVentaPapelera(unpaid.id);
assertNoLocationWrites();
assert.equal(await balance(dropA.id), 2);
const movement = [...data].find(([path, value]) => path.startsWith("movimientos/") && value.venta_id === unpaid.id)!;
await service.restaurarMovimientoPapelera(movement[0].split("/")[1]);
assertNoLocationWrites();
assert.equal(await balance(dropA.id), 1);
await service.anularVentaAgrupada(unpaid.id, "Prueba");
assertNoLocationWrites();
await service.enviarCompraPapelera(purchaseA.id);
assert.equal(await balance(dropA.id), 0);
await service.restaurarCompraPapelera(purchaseA.id);
assert.equal(await balance(dropA.id), 2);
// Dos drops con un mismo SKU: no dividir partidas por ubicaciones ocultas.
await purchase(dropA.id, 2);
const split = await service.registerVentaTransaction(input([{ drop_id: dropB.id, cantidad: 3 }, { drop_id: dropA.id, cantidad: 4 }]));
master = data.get("ventas/" + split.id);
assertNoLocationWrites();
assert.equal(master.items.length, 2);
assert.ok(master.items.every(item => !("almacen_id" in item)));
await service.devolverVentaCompleta(split.id, "Prueba drops");
// Bajo pedido no necesita drop y no consume disponibilidad.
await service.registerVentaTransaction({ ...input([{ cantidad: 30 }]), afecta_stock: false, canal_venta: "bajo_pedido", anticipo_porcentaje: 50 });
assertNoLocationWrites();
assert.equal(await balance(dropA.id), 4);
put("drops/" + dropA.id, { estado: "cerrado" }, true);
await assert.rejects(service.registerVentaTransaction(input([{ drop_id: dropA.id, cantidad: 1 }])), /En venta/);
put("drops/" + dropA.id, { estado: "en_venta" }, true);
// El stock de otro drop NO permite vender más unidades del elegido, incluso con concurrencia.
const concurrent = await Promise.allSettled([
  service.registerVentaTransaction(input([{ drop_id: dropB.id, cantidad: 3 }])),
  service.registerVentaTransaction(input([{ drop_id: dropB.id, cantidad: 3 }]))
]);
assert.equal(concurrent.filter(item => item.status === "fulfilled").length, 1);
assert.ok(retries() > 0, "Debe repetirse el callback al cambiar la revisión de inventario.");
assert.equal(await balance(dropB.id), 0);
assertNoLocationWrites();
// Una restauración tampoco puede consumir saldo de otro drop.
const dropC = await service.addDrop({ nombre: "Drop C", estado: "en_venta" });
await purchase(dropC.id, 1);
const pending = await service.registerVentaTransaction(input([{ drop_id: dropC.id, cantidad: 1 }], 0));
await service.enviarVentaPapelera(pending.id);
await service.registerVentaTransaction(input([{ drop_id: dropC.id, cantidad: 1 }]));
const pendingLine = [...data].find(([path, value]) => path.startsWith("movimientos/") && value.venta_id === pending.id)!;
await assert.rejects(service.restaurarMovimientoPapelera(pendingLine[0].split("/")[1]), /Disponibilidad insuficiente/);
assert.equal(data.get("ventas/" + pending.id).en_papelera, true);
assertNoLocationWrites();
// No existe ningún servicio activo para registrar traslados ni administrar ubicaciones.
assert.equal("registerMovimientoTransaction" in service, false);
assert.equal("addAlmacen" in service, false);
assert.equal("getStockRealtime" in service, false);
assertNoLocationWrites();
// Compatibilidad con ventas antiguas que solo tenían drop_id a nivel maestro.
const completed = concurrent.find(item => item.status === "fulfilled") as PromiseFulfilledResult<{ id: string }>;
const legacyPath = "ventas/" + completed.value.id;
const legacySale = { ...data.get(legacyPath) };
delete legacySale.drop_ids; delete legacySale.inventario_por_drop;
legacySale.items = legacySale.items.map((item: any) => { const { drop_id, drop_nombre, ...rest } = item; return rest; });
put(legacyPath, legacySale);
assert.equal(await balance(dropB.id), 0);
await assert.rejects(service.updateVentaDropAssociation(completed.value.id, dropC.id), /Disponibilidad insuficiente/);
await service.updateVentaDropAssociation(completed.value.id, dropA.id);
assert.equal(await balance(dropA.id), 1);
assert.equal(await balance(dropB.id), 3);
assertNoLocationWrites();
// La entrada de una compra no se suma otra vez; las entradas históricas independientes sí.
const dropD = await service.addDrop({ nombre: "Drop histórico", estado: "en_venta" });
await purchase(dropD.id, 1);
assert.equal(await balance(dropD.id), 1);
put("movimientos/entrada-historica", { tipo: "entrada", sku: "TEST", cantidad: 2, drop_id: dropD.id, estado: "activo", fecha: new Date() });
put("movimientos/transferencia-historica", { tipo: "transferencia", sku: "TEST", cantidad: 90, drop_id: dropD.id, estado: "activo", fecha: new Date() });
assert.equal(await balance(dropD.id), 3, "Una transferencia no crea ni consume piezas de un drop.");
const legacySnapshot = JSON.stringify(data.get("movimientos/transferencia-historica"));
await assert.rejects(service.anularMovimiento("transferencia-historica", "Prueba"), /solo lectura/);
await assert.rejects(service.enviarMovimientoPapelera("transferencia-historica"), /solo lectura/);
await assert.rejects(service.restaurarMovimientoPapelera("transferencia-historica"), /solo lectura/);
assert.equal(JSON.stringify(data.get("movimientos/transferencia-historica")), legacySnapshot);
await service.updateDrop(dropD.id, { nombre: "Drop histórico actualizado" });
assert.equal(JSON.stringify(data.get("movimientos/transferencia-historica")), legacySnapshot, "Renombrar un drop no modifica transferencias retiradas.");
await service.registerVentaTransaction(input([{ drop_id: dropD.id, cantidad: 3 }]));
await assert.rejects(service.anularMovimiento("entrada-historica", "Prueba"), /existencias/);
const historicalOnly = await service.addDrop({ nombre: "Solo entrada histórica", estado: "en_venta" });
put("movimientos/entrada-independiente", { tipo: "entrada", sku: "TEST", cantidad: 1, drop_id: historicalOnly.id, estado: "activo", fecha: new Date() });
await assert.rejects(service.enviarDropPapelera(historicalOnly.id), /movimientos asociados/);
// Vista general: mismos resultados que abrir cada drop; el mismo SKU conserva su origen.
const catalog = await service.getDrops();
const snapshotBeforeGeneral = JSON.stringify([...data]);
const beforeQueries = queries.length;
const general = await service.getDropsDetail(catalog.map(drop => drop.id));
assert.equal(queries.length - beforeQueries, 4, "Cuatro consultas para todo el grupo, no por drop.");
const rows = calcularInventarioDrops(catalog, general);
for (const drop of catalog) {
  const individual = calcularInventarioDrop(drop.id, await service.getDropDetail(drop.id));
  assert.deepEqual(rows.filter(row => row.drop_id === drop.id).map(({ drop_id, drop_nombre, estado, disponible, ...row }) => row), individual);
}
assert.equal(new Set(rows.map(row => JSON.stringify([row.drop_id, row.sku]))).size, rows.length);
assert.ok(rows.filter(row => row.sku === "TEST").length > 1);
assert.ok(calcularInventarioDrops(catalog.map(drop => ({ ...drop, estado: "cerrado" })), general).every(row => row.disponible === 0));
assert.equal(calcularInventarioDrops(catalog.map(drop => ({ ...drop, en_papelera: true })), general).length, 0);
assert.equal(JSON.stringify([...data]), snapshotBeforeGeneral, "Consultar inventario general no escribe datos.");
const emptyQueries = queries.length;
assert.deepEqual(await service.getDropsDetail([]), { compras: [], ventas: [], movimientos: [] });
assert.equal(queries.length, emptyQueries);
// Más de 30 drops: deduplicar ventas que coinciden con varias consultas y grupos.
put("ventas/multi-batch", { id: "multi-batch", drop_id: dropA.id, drop_ids: [dropA.id, dropB.id], items: [{ sku: "TEST", drop_id: dropA.id, cantidad: 1, precio_unitario: 100 }, { sku: "TEST", drop_id: dropB.id, cantidad: 1, precio_unitario: 100 }], fecha: new Date(), estado: "anulado" });
const batchStart = queries.length;
const batched = await service.getDropsDetail([dropA.id, ...Array.from({ length: 30 }, (_, index) => `missing-${index}`), dropB.id, dropA.id]);
assert.equal(queries.length - batchStart, 8);
assert.equal(batched.ventas.filter(sale => sale.id === "multi-batch").length, 1);
assert.ok(queries.slice(batchStart).every(q => q.constraints[0].value.length <= 30));
const beforeError = JSON.stringify([...data]);
reject("compras");
await assert.rejects(service.getDropsDetail(catalog.map(drop => drop.id)), { code: "permission-denied" });
await assert.rejects(service.registerVentaTransaction(input([{ drop_id: dropA.id, cantidad: 1 }])), { code: "permission-denied" });
assert.equal(JSON.stringify([...data]), beforeError, "Un fallo de lectura no debe escribir ninguna parte de la venta.");
assert.equal(localWrites, 0, "No se permite fallback local con Firebase configurado.");
reject("");
assert.ok(queries.filter(query => ["compras", "ventas", "movimientos", "stock"].includes(query.path)).every(query => query.constraints?.some((clause: any) => clause.kind === "where")), "Las consultas de disponibilidad se limitan por drop.");
console.log("Inventario por drops: origen por partida, cantidades, concurrencia, sin almacenes, devoluciones, papelera, pedidos y fallos atómicos aprobados.");
