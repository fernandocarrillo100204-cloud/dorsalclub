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
assert.equal(before.costosVentas, 190.5);
assert.equal(before.egresos, after.egresos, "Consultar Fletes no duplica egresos.");
assert.equal(before.balance, after.balance);
const { default: Fletes } = await import("../src/components/finanzas/Fletes");
const output = renderToStaticMarkup(React.createElement(Fletes));
assert.match(output, /Costo total de fletes/);
const fletesView = readFileSync("src/components/finanzas/Fletes.tsx", "utf8");
assert.match(fletesView, /Quién entregó/);
assert.match(fletesView, /Ubicación de entrega/);
console.log("Fletes: registros históricos, costos, responsables, destinos y balance sin duplicación aprobados.");
