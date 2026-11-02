import assert from "node:assert/strict";
import { firebaseInMemory } from "./helpers/firestoreMemory";
import { calcularInventarioDrop } from "../src/lib/inventarioDrops";
import type { VentaRegistroInput, Venta } from "../src/types";

let localWrites = 0;
Object.defineProperty(globalThis, "localStorage", { value: { getItem: () => null, setItem: () => { localWrites++; }, removeItem: () => {} }, configurable: true });
const { service, data, put, queries, reject, retries } = await firebaseInMemory();
put("almacenes/a", { nombre: "A", ubicacion: "Local" });
put("almacenes/b", { nombre: "B", ubicacion: "Local" });
put("productos/TEST", { nombre: "Producto", sku: "TEST", stock_minimo: 0 });
const dropA = await service.addDrop({ nombre: "Drop A", estado: "en_venta" });
const dropB = await service.addDrop({ nombre: "Drop B", estado: "en_venta" });
const purchase = (dropId: string, quantity: number, warehouse = "a") => service.registerCompraTransaction({
  proveedor: "Proveedor", almacen_id: warehouse, drop_id: dropId,
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
const physical = () => [...data].filter(([path]) => path.startsWith("stock/")).reduce((sum, [, value]) => sum + value.cantidad, 0);
await assert.rejects(service.registerVentaTransaction(input([{ cantidad: 1 }])), /drop/);
await assert.rejects(service.registerVentaTransaction(input([{ drop_id: dropA.id, cantidad: 3 }])), /Disponibilidad insuficiente/);
await assert.rejects(service.registerVentaTransaction(input([{ drop_id: dropA.id, cantidad: 2 }, { drop_id: dropA.id, cantidad: 1 }])), /Disponibilidad insuficiente/);
assert.equal(physical(), 5);
const mixed = await service.registerVentaTransaction(input([{ drop_id: dropA.id, cantidad: 1 }, { drop_id: dropB.id, cantidad: 2 }]));
let master = data.get("ventas/" + mixed.id) as Venta;
assert.deepEqual(master.drop_ids, [dropA.id, dropB.id]);
assert.equal(master.drop_id, undefined, "Una venta mixta no debe atribuirse entera al primer drop.");
assert.equal(master.total, 750);
assert.equal(physical(), 2, "Dos partidas con mismo SKU y ubicación se descuentan juntas.");
assert.equal(await balance(dropA.id), 1);
assert.equal(await balance(dropB.id), 1);
assert.equal(calcularInventarioDrop(dropA.id, await service.getDropDetail(dropA.id))[0].ventaTotal, 250);
await assert.rejects(service.updateVentaDropAssociation(mixed.id, dropB.id), /origen/);
await assert.rejects(service.enviarCompraPapelera(purchaseA.id), /drop|vendida/);
await assert.rejects(service.updateCompraDropAssociation(purchaseA.id, dropB.id), /drop/);
await service.devolverVentaCompleta(mixed.id, "Devolución de prueba");
assert.equal(physical(), 5, "La devolución suma todas las partidas aunque compartan ubicación.");
assert.equal(await balance(dropA.id), 2);
assert.equal(await balance(dropB.id), 3);
await assert.rejects(service.devolverVentaCompleta(mixed.id, "Otra vez"), /devuelta/);
const unpaid = await service.registerVentaTransaction(input([{ drop_id: dropA.id, cantidad: 1 }, { drop_id: dropB.id, cantidad: 1 }], 0));
await service.enviarVentaPapelera(unpaid.id);
assert.equal(physical(), 5);
assert.equal(await balance(dropA.id), 2);
const movement = [...data].find(([path, value]) => path.startsWith("movimientos/") && value.venta_id === unpaid.id)!;
await service.restaurarMovimientoPapelera(movement[0].split("/")[1]);
assert.equal(physical(), 3);
assert.equal(await balance(dropA.id), 1);
await service.anularVentaAgrupada(unpaid.id, "Prueba");
assert.equal(physical(), 5);
await service.enviarCompraPapelera(purchaseA.id);
assert.equal(await balance(dropA.id), 0);
await service.restaurarCompraPapelera(purchaseA.id);
assert.equal(await balance(dropA.id), 2);
// Dos ubicaciones, un único origen comercial, reversión exacta a cada ubicación.
await purchase(dropA.id, 2, "b");
const split = await service.registerVentaTransaction(input([{ drop_id: dropB.id, cantidad: 3 }, { drop_id: dropA.id, cantidad: 4 }]));
master = data.get("ventas/" + split.id);
assert.equal(physical(), 0);
assert.equal(new Set(master.items.map(item => item.almacen_id)).size, 2);
await service.devolverVentaCompleta(split.id, "Prueba ubicaciones");
assert.equal(data.get("stock/TEST_a").cantidad, 5);
assert.equal(data.get("stock/TEST_b").cantidad, 2);
// Bajo pedido no necesita drop y no consume disponibilidad.
await service.registerVentaTransaction({ ...input([{ cantidad: 30 }]), afecta_stock: false, canal_venta: "bajo_pedido", anticipo_porcentaje: 50 });
assert.equal(physical(), 7);
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
assert.equal(physical(), 4);
// Una restauración tampoco puede consumir saldo de otro drop.
const dropC = await service.addDrop({ nombre: "Drop C", estado: "en_venta" });
await purchase(dropC.id, 1);
const pending = await service.registerVentaTransaction(input([{ drop_id: dropC.id, cantidad: 1 }], 0));
await service.enviarVentaPapelera(pending.id);
await service.registerVentaTransaction(input([{ drop_id: dropC.id, cantidad: 1 }]));
const pendingLine = [...data].find(([path, value]) => path.startsWith("movimientos/") && value.venta_id === pending.id)!;
await assert.rejects(service.restaurarMovimientoPapelera(pendingLine[0].split("/")[1]), /Disponibilidad insuficiente/);
assert.equal(data.get("ventas/" + pending.id).en_papelera, true);
assert.equal(physical(), 4);
// Las transferencias mueven ubicación, no alteran el saldo comercial del drop.
const beforeTransfer = await balance(dropA.id);
await service.registerMovimientoTransaction({ sku: "TEST", almacen_id: "a", almacen_destino_id: "b", cantidad: 1, tipo: "transferencia", referencia: "Prueba" });
assert.equal(await balance(dropA.id), beforeTransfer);
assert.equal(physical(), 4);
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
assert.equal(physical(), 4);
const beforeError = JSON.stringify([...data]);
reject("compras");
await assert.rejects(service.registerVentaTransaction(input([{ drop_id: dropA.id, cantidad: 1 }])), { code: "permission-denied" });
assert.equal(JSON.stringify([...data]), beforeError, "Un fallo de lectura no debe escribir ninguna parte de la venta.");
assert.equal(localWrites, 0, "No se permite fallback local con Firebase configurado.");
reject("");
assert.ok(queries.filter(query => ["compras", "ventas", "movimientos", "stock"].includes(query.path)).every(query => query.constraints?.some((clause: any) => clause.kind === "where")), "Las consultas de disponibilidad se limitan por drop o por SKU.");
console.log("Inventario por drops: origen por partida, cantidades, concurrencia, ubicaciones internas, devoluciones, papelera, pedidos y fallos atómicos aprobados.");
