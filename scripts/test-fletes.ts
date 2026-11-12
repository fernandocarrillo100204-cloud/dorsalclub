import assert from "node:assert/strict";
import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { Movimiento } from "../src/types";
import { obtenerFletesDeMovimientos, totalFletes } from "../src/lib/fletesVentas";
import { firebaseInMemory } from "./helpers/firestoreMemory";

const fecha = new Date("2026-11-08T12:00:00");
const create = (id: string, costo: number, extra: Partial<Movimiento> = {}): Movimiento => ({
  id, folio: id, sku: "TEST", tipo: "salida", cantidad: 1, referencia: "Cliente",
  usuario: "ventas@prueba.mx", fecha,
  costo_envio_venta: costo,
  ...extra
});
const events = [
  create("primero", 120, { venta_id: "venta-uno", folio: "Salida-1", repartidor_nombre: "Daniel", ubicacion_entrega_nombre: "San Nicolás" }),
  create("segundo", 30.5, { venta_id: "venta-uno", folio: "Salida-1" }),
  create("sin-datos", 40, { fecha: new Date("2026-11-07T12:00:00") }),
  create("anulado", 60, { estado: "anulado" }),
  create("papelera", 50, { en_papelera: true }),
  create("abono", 70, { subtipo: "abono_venta" }),
  create("otro", 0),
  create("sin-venta", 90, { tipo: "entrada" }),
  create("invalido", Number.NaN),
];
const rows = obtenerFletesDeMovimientos(events);
assert.equal(rows.length, 2, "Un flete por venta y sin cancelados.");
assert.equal(rows[0].folio, "Salida-1");
assert.equal(rows[0].costo, 150.5, "Las partidas de una venta se consolidan sin duplicar registros.");
assert.equal(rows[0].quienEntrega, "Daniel");
assert.equal(rows[0].ubicacionEntrega, "San Nicolás");
assert.equal(rows[1].quienEntrega, null, "Las ventas históricas pueden carecer de responsable.");
assert.equal(rows[1].ubicacionEntrega, null, "Las ventas históricas pueden carecer de destino.");
assert.equal(totalFletes(rows), 190.5);
assert.equal(totalFletes([]), 0);
assert.equal(events[0].costo_envio_venta, 120, "La vista no modifica el costo original.");

// La consulta debe recuperar solo los movimientos con flete; no crea una nueva
// colección de gastos ni altera el total contable registrado en Balance general.
const remote = await firebaseInMemory();
remote.put("movimientos/primero", events[0]);
remote.put("movimientos/segundo", events[1]);
remote.put("movimientos/sin-datos", events[2]);
remote.put("movimientos/anulado", events[3]);
remote.put("movimientos/otro", events[6]);
const fetched = await remote.service.getFletesVentas();
assert.equal(fetched.length, 2);
assert.equal(totalFletes(fetched), 190.5);
assert.ok(remote.queries.some(q => q.path === "movimientos" && q.constraints?.some((c: any) => c.kind === "where" && c.field === "costo_envio_venta" && c.op === ">")), "Consulta indexada por costos positivos.");
const before = await remote.service.getBalanceGeneral();
await remote.service.getFletesVentas();
const after = await remote.service.getBalanceGeneral();
assert.equal(before.costosVentas, 0, "Sin confirmación de pago no se registra egreso por fletes.");
assert.equal(before.egresos, after.egresos, "Consultar Fletes no duplica egresos.");
assert.equal(before.balance, after.balance);
// SSR no dispone de almacenamiento del navegador; simularlo al montar el componente.
const local = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => { local.set(key, value); },
    removeItem: (key: string) => { local.delete(key); }
  }
});
const { default: Fletes } = await import("../src/components/finanzas/Fletes");
const output = renderToStaticMarkup(React.createElement(Fletes));
assert.match(output, /Costo total de fletes/);
const fletesView = readFileSync("src/components/finanzas/Fletes.tsx", "utf8");
assert.match(fletesView, /Quién entregó/);
assert.match(fletesView, /Ubicación de entrega/);
// Integración completa: registrar una venta con entrega alimenta automáticamente Fletes.
const integration = await firebaseInMemory();
integration.put("productos/SKU-ENTREGA", { sku: "SKU-ENTREGA", nombre: "Prenda de prueba", stock_minimo: 0, categoria: "General", unidad: "pieza" });
const createdSale = await integration.service.registerVentaTransaction({
  items: [{ sku: "SKU-ENTREGA", cantidad: 1, precio_unitario_venta: 200, costo_unitario_venta: 100 }],
  referencia: "Venta con entrega", cliente_nombre: "Cliente prueba",
  canal_venta: "bajo_pedido", canal_venta_nombre: "Bajo pedido",
  porcentaje_precio: 100, afecta_stock: false, anticipo_porcentaje: 100,
  minimo_piezas: 1, metodo_pago_inicial: "Efectivo",
  costo_envio_venta: 80, envio_cobrado_cliente: 40,
  ubicacion_entrega_id: "ubi-1", ubicacion_entrega_nombre: "Apodaca",
  repartidor_id: "repartidor-1", repartidor_nombre: "Alicia"
});
const autoFletes = await integration.service.getFletesVentas();
assert.equal(autoFletes.length, 1);
assert.equal(autoFletes[0].ventaId, createdSale.id);
assert.equal(autoFletes[0].costo, 80);
assert.equal(autoFletes[0].quienEntrega, "Alicia");
assert.equal(autoFletes[0].ubicacionEntrega, "Apodaca");
const autoBalance = await integration.service.getBalanceGeneral();
assert.equal(autoBalance.costosVentas, 0, "El flete recién registrado no es egreso hasta marcarlo pagado.");
await integration.service.actualizarFleteVenta(autoFletes[0], { estadoPago: "pagado" });
assert.equal((await integration.service.getBalanceGeneral()).costosVentas, 80, "Un flete pagado se registra una sola vez.");

console.log("Fletes: registros históricos, ventas reales, costos, responsables, destinos y balance sin duplicación aprobados.");
