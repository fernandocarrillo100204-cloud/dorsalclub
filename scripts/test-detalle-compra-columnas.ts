import assert from "node:assert/strict";
import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { calcularBalanceGeneral } from "../src/lib/balanceGeneral";
import { firebaseInMemory } from "./helpers/firestoreMemory";
import DetalleMovimientoBalance from "../src/components/finanzas/DetalleMovimientoBalance";

const compra = {
  id: "compra-2", folio: "COMP-6", proveedor: "CHUNCHI",
  fecha: new Date("2026-11-08T12:00:00"), drop_id: "drop-2", drop_nombre: "DROP 2",
  costo_envio: 20, comisiones: 0, descuentos: 0,
  subtotal: 1680, total: 1700,
  items: [
    { sku: "BA-211", nombre_producto: "Balenciaga Tape", talla: "M", cantidad: 3, costo_unitario: 420, subtotal: 1260 },
    { sku: "BA-211", nombre_producto: "Balenciaga Tape", talla: "S", marca: "Balenciaga", cantidad: 1, costo_unitario: 420, subtotal: 420 }
  ]
};
const row = calcularBalanceGeneral([], [compra as any], [], []).movimientos[0];
const html = renderToStaticMarkup(React.createElement(DetalleMovimientoBalance, {
  movimiento: row,
  marcasPorSku: new Map([["BA-211", "Balenciaga"]])
}));
for (const col of ["Producto", "Marca", "SKU", "Talla", "Drop", "Cantidad", "Costo unitario", "Subtotal"]) {
  assert.ok(html.includes(`>${col}</th>`), `Columna presente: ${col}`);
}
assert.equal((html.match(/Balenciaga Tape/g) || []).length >= 2, true);
assert.equal((html.match(/>Balenciaga<\/td>/g) || []).length, 2, "Marca histórica por catálogo y marca registrada.");
assert.equal((html.match(/>DROP 2<\/td>/g) || []).length, 2, "Todas las partidas heredan el drop de su compra.");
assert.match(html, /BA-211/);
assert.match(html, /Total de partidas/);
assert.match(html, />4<\/td>/);
assert.match(html, /\$1,680\.00/, "Total de partidas es costo de artículos, sin gastos de flete.");
assert.match(html, /\$1,700\.00/, "Total de compra sigue incluyendo flete sin duplicarlo.");

const withoutCatalog = renderToStaticMarkup(React.createElement(DetalleMovimientoBalance, { movimiento: row }));
assert.match(withoutCatalog, /No registrada/, "Nunca se inventa la marca de partidas antiguas.");
const unassigned = calcularBalanceGeneral([], [{ ...compra, drop_id: undefined, drop_nombre: undefined } as any], [], []).movimientos[0];
assert.match(renderToStaticMarkup(React.createElement(DetalleMovimientoBalance, { movimiento: unassigned })), /Sin drop asignado/);
const source = readFileSync("src/components/finanzas/MovimientosBalance.tsx", "utf8");
assert.match(source, /balance-detail-dialog-wide/, "Las compras tienen ventana adaptable para las ocho columnas.");
assert.match(source, /productos\.filter/, "Se usa el catálogo ya cargado para completar marcas anteriores.");
assert.match(readFileSync("src/App.tsx", "utf8"), /<Finanzas productos=\{productos\}/, "No se repite una consulta de catálogo.");

// Integración real: la marca queda almacenada como snapshot en cada compra nueva.
const localStore = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => localStore.get(key) ?? null,
    setItem: (key: string, value: string) => { localStore.set(key, value); },
    removeItem: (key: string) => { localStore.delete(key); }
  }
});
const remote = await firebaseInMemory();
remote.put("productos/BA-211", { sku: "BA-211", nombre: "Balenciaga Tape", marca: "Balenciaga", categoria: "General", unidad: "pieza", stock_minimo: 0 });
const drop = await remote.service.addDrop({ nombre: "DROP 2", estado: "en_venta" });
const result = await remote.service.registerCompraTransaction({
  proveedor: "CHUNCHI", drop_id: drop.id,
  items: [{ sku: "BA-211", nombre_producto: "Balenciaga Tape", marca: "Balenciaga", talla: "M", cantidad: 1, costo_unitario: 420, subtotal: 420 }]
});
const stored = (await remote.service.getCompras()).find(item => item.id === result.id);
assert.equal(stored?.items[0]?.marca, "Balenciaga", "La marca se conserva en la operación.");
assert.equal(stored?.drop_id, drop.id, "El drop es la asociación real de la compra.");
assert.equal(stored?.drop_nombre, "DROP 2");
console.log("Detalle de compra: ocho columnas, marca histórica/registrada, drop por partida, totales y persistencia aprobados.");
