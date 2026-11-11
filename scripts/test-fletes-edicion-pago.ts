import assert from "node:assert/strict";
import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { firebaseInMemory } from "./helpers/firestoreMemory";
import { repartirCostoFlete, obtenerFletesDeMovimientos } from "../src/lib/fletesVentas";
import type { Movimiento } from "../src/types";

const now = new Date("2026-11-11T12:00:00");
const move = (id: string, cost: number, extra: Partial<Movimiento> = {}): Movimiento => ({
  id, sku: "SKU", tipo: "salida", cantidad: 1, referencia: "", usuario: "test",
  fecha: now, folio: "Salida-22", venta_id: "venta-22",
  costo_envio_venta: cost, total_costos_venta: cost, venta_partida: 1,
  ...extra
});
const base = [
  move("first", 40, { total_costos_venta: 50 }),
  move("second", 20, { venta_partida: 2, total_costos_venta: 20 })
];
const updated = repartirCostoFlete(base, 65.5);
assert.deepEqual(updated.map(item => item.costo_envio_venta), [65.5, 0]);
assert.deepEqual(updated.map(item => item.total_costos_venta), [75.5, 0], "Costos distintos del flete deben preservarse.");
assert.deepEqual(updated.map(item => item.venta_total_costos), [75.5, 75.5]);
assert.equal(base[0].costo_envio_venta, 40, "No se debe mutar el movimiento original.");
for (const invalid of [0, -1, NaN, Infinity, 1.234, 1000000000]) {
  assert.throws(() => repartirCostoFlete(base, invalid), /costo del flete/i);
}
assert.deepEqual(obtenerFletesDeMovimientos(base).map(flete => flete.costo), [60]);

// El simulador de Firebase se ejecuta en Node y necesita almacenamiento de prueba.
const localStorageDatos = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => localStorageDatos.get(key) ?? null,
    setItem: (key: string, value: string) => { localStorageDatos.set(key, value); },
    removeItem: (key: string) => { localStorageDatos.delete(key); }
  }
});
// Edición transaccional, con varias partidas y sin repetir el costo de entrega.
const remote = await firebaseInMemory();
remote.put("productos/SKU-A", { sku: "SKU-A", nombre: "Producto A", stock_minimo: 0, categoria: "General", unidad: "pieza" });
remote.put("productos/SKU-B", { sku: "SKU-B", nombre: "Producto B", stock_minimo: 0, categoria: "General", unidad: "pieza" });
const sale = await remote.service.registerVentaTransaction({
  referencia: "Prueba de fletes", cliente_nombre: "Cliente prueba",
  canal_venta: "bajo_pedido", canal_venta_nombre: "Bajo pedido",
  porcentaje_precio: 100, afecta_stock: false, anticipo_porcentaje: 100,
  minimo_piezas: 1, metodo_pago_inicial: "Efectivo",
  ubicacion_entrega_id: "ubi", ubicacion_entrega_nombre: "Galerías Monterrey",
  repartidor_id: "rep", repartidor_nombre: "Fernando",
  costo_envio_venta: 80, envio_cobrado_cliente: 25,
  items: [
    { sku: "SKU-A", cantidad: 1, precio_unitario_venta: 200, costo_unitario_venta: 100 },
    { sku: "SKU-B", cantidad: 1, precio_unitario_venta: 150, costo_unitario_venta: 75 }
  ]
});
const initialList = await remote.service.getFletesVentas();
assert.equal(initialList.length, 1);
assert.equal(initialList[0].ventaId, sale.id);
assert.equal(initialList[0].costo, 80);
assert.equal(initialList[0].cubiertoCliente, 25);
assert.equal(initialList[0].quienEntrega, "Fernando");
assert.equal(initialList[0].ubicacionEntrega, "Galerías Monterrey");
assert.equal(initialList[0].estadoPago, null, "No inventar un estado de pago para ventas antiguas.");
const initialBalance = await remote.service.getBalanceGeneral();
assert.equal(initialBalance.costosVentas, 80);

await remote.service.actualizarFleteVenta(initialList[0], { estadoPago: "pendiente" });
let flete = (await remote.service.getFletesVentas())[0];
assert.equal(flete.estadoPago, "pendiente");
assert.equal(flete.pagadoAt, null);
assert.equal((await remote.service.getBalanceGeneral()).balance, initialBalance.balance, "Marcar pendiente no crea otro egreso.");
await remote.service.actualizarFleteVenta(flete, { estadoPago: "pagado" });
flete = (await remote.service.getFletesVentas())[0];
assert.equal(flete.estadoPago, "pagado");
assert.ok(flete.pagadoAt instanceof Date);
assert.equal(remote.data.get(`ventas/${sale.id}`).estado_pago_flete, "pagado");
assert.equal((await remote.service.getBalanceGeneral()).balance, initialBalance.balance, "Marcar pagado no duplica el costo.");

await remote.service.actualizarFleteVenta(flete, { costo: 135.5 });
flete = (await remote.service.getFletesVentas())[0];
assert.equal(flete.costo, 135.5);
assert.equal(flete.estadoPago, "pagado", "Editar costo conserva estado.");
const movs = [...remote.data.entries()].filter(([key,value]) => key.startsWith("movimientos/") && value.venta_id === sale.id);
assert.equal(movs.length, 2);
assert.equal(movs.reduce((sum,[,value]) => sum + (value.costo_envio_venta || 0), 0), 135.5);
assert.equal(movs.reduce((sum,[,value]) => sum + (value.total_costos_venta || 0), 0), 135.5);
assert.equal(remote.data.get(`ventas/${sale.id}`).costo_envio_venta, 135.5);
assert.equal((await remote.service.getBalanceGeneral()).costosVentas, 135.5);
assert.equal((await remote.service.getBalanceGeneral()).balance, initialBalance.balance - 55.5);
assert.equal(remote.data.get(`ventas/${sale.id}`).envio_cobrado_cliente, 25, "Editar flete no cambia el cobro al cliente.");
assert.equal(remote.data.get(`ventas/${sale.id}`).total, 375, "Editar flete no modifica el total de venta.");
assert.equal((await remote.service.getFletesVentas()).length, 1, "El mismo flete no se duplica.");

await remote.service.actualizarFleteVenta(flete, { estadoPago: "pendiente" });
flete = (await remote.service.getFletesVentas())[0];
assert.equal(flete.estadoPago, "pendiente");
assert.equal(flete.pagadoAt, null);
assert.ok(!("flete_pagado_at" in remote.data.get(`ventas/${sale.id}`)), "Cambiar a pendiente borra la fecha de pago.");
await assert.rejects(remote.service.actualizarFleteVenta(flete, { costo: 0 }), /costo del flete/i);
assert.equal((await remote.service.getFletesVentas())[0].costo, 135.5);

const historical = await firebaseInMemory();
historical.put("movimientos/partida-1", move("partida-1", 40, { venta_total_costos: 60, total_costos_venta: 50 }));
historical.put("movimientos/partida-2", move("partida-2", 20, { venta_partida: 2, total_costos_venta: 20 }));
const old = (await historical.service.getFletesVentas())[0];
assert.equal(old.costo, 60);
await historical.service.actualizarFleteVenta(old, { costo: 65.5 });
assert.equal((await historical.service.getFletesVentas())[0].costo, 65.5);
assert.equal((await historical.service.getBalanceGeneral()).costosVentas, 75.5, "Costo de flete nuevo + otros costos históricos.");
assert.equal(historical.data.get("movimientos/partida-2").costo_envio_venta, 0);

const view = readFileSync("src/components/finanzas/Fletes.tsx", "utf8");
for (const label of ["Detalle", "Editar", "Marcar pagado", "Marcar pendiente", "Costo absorbido por el negocio"]) {
  assert.ok(view.includes(label), `Acción o campo disponible: ${label}`);
}
const { default: Fletes } = await import("../src/components/finanzas/Fletes");
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: () => null, setItem: () => {}, removeItem: () => {}
}});
assert.match(renderToStaticMarkup(React.createElement(Fletes)), /Costo total de fletes/);
console.log("Fletes: edición, estatus pagado/pendiente, histórico, balance, cobro de cliente y detalle aprobados.");
