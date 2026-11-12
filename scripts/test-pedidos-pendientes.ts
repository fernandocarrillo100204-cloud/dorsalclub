import assert from "node:assert/strict";
import type { PedidoVenta } from "../src/types";
import { pedidosPendientesPago, saldoPendientePedidos, validarLiquidacionPedido } from "../src/lib/pedidosPendientes";
import { construirPedidos, leerVenta } from "../src/lib/lecturasVentas";
import type { Movimiento } from "../src/types";
import { readFileSync } from "node:fs";

const makeOrder = (id: string, estado: PedidoVenta["estado"], saldo: number): PedidoVenta => ({
  venta_id: id, folio: id, cliente_nombre: "Cliente de prueba",
  canal_venta: "bajo_pedido", canal_venta_nombre: "Bajo pedido",
  fecha: new Date("2026-11-08T12:00:00"), total: 1000, recibido: 1000 - saldo,
  saldo, estado, items: [{ sku: "SKU-1", cantidad: 1, precio_unitario: 1000, total: 1000 }]
});

const orders = [
  makeOrder("pendiente", "pedido", 1000),
  makeOrder("anticipo", "pedido", 250),
  makeOrder("pagado", "pagado", 0),
  makeOrder("pagado-sin-entregar", "pagado", 0),
  makeOrder("entregado", "entregado", 0),
  makeOrder("saldo-residual", "pedido", 0.005),
  makeOrder("entregado-anomalo", "entregado", 200)
];
assert.deepEqual(pedidosPendientesPago(orders).map(item => item.venta_id), ["pendiente", "anticipo"]);
assert.equal(saldoPendientePedidos(orders), 1250);
assert.deepEqual(pedidosPendientesPago([]), []);
assert.equal(saldoPendientePedidos([]), 0);
assert.equal(validarLiquidacionPedido(500, 500), 500);
assert.throws(() => validarLiquidacionPedido(500, 200), /liquidar el saldo pendiente completo/);
assert.throws(() => validarLiquidacionPedido(500, 600), /liquidar el saldo pendiente completo/);
assert.throws(() => validarLiquidacionPedido(0, 0), /ya está pagado/);
assert.throws(() => validarLiquidacionPedido(500, Number.NaN), /liquidar/);
assert.equal(pedidosPendientesPago([makeOrder("liquidado", "pagado", 0)]).length, 0);

// Pedidos con pagos parciales históricos siguen visibles para su liquidación final,
// sin tocar los objetos originales de venta.
const before = makeOrder("venta-123", "pedido", 150);
assert.equal(pedidosPendientesPago([before]).length, 1);
const partial = { ...before, saldo: 75, recibido: 925 };
assert.equal(pedidosPendientesPago([partial]).length, 1);
const paid = { ...before, estado: "pagado" as const, saldo: 0, recibido: 1000 };
assert.equal(pedidosPendientesPago([paid]).length, 0);
assert.equal(before.saldo, 150, "El filtro no debe mutar ni borrar el pedido original.");

// El detalle del pedido debe preservar tallas tanto para ventas nuevas como históricas.
const pedidoNuevo = leerVenta("venta-nueva", {
  folio: "Salida-8", cliente_nombre: "Ejemplo 1", afecta_stock: false, canal_venta: "bajo_pedido",
  canal_venta_nombre: "Bajo pedido", fecha: "2026-11-11", total: 1000, recibido: 500, saldo: 500,
  ubicacion_entrega_nombre: "San Pedro", repartidor_nombre: "Daniel",
  items: [{ sku: "BA-211", talla: "M", cantidad: 3, precio_unitario: 100, total: 300 }]
});
const pedidoViejo: Movimiento = {
  id: "partida-legado", venta_id: "venta-legada", folio: "Salida-4", sku: "BA-211", talla: "L",
  tipo: "salida", cantidad: 2, referencia: "", usuario: "test", fecha: new Date("2026-10-01"),
  afecta_stock: false, canal_venta: "bajo_pedido", cliente_nombre: "Cliente legado",
  ubicacion_entrega_nombre: "Cumbres", precio_unitario_venta: 100, total_venta: 200,
  venta_total_cobrado: 200, venta_total_recibido: 100
};
const pedidosConTallas = construirPedidos([pedidoNuevo], [pedidoViejo]);
assert.equal(pedidosConTallas.find(item => item.venta_id === "venta-nueva")?.items[0].talla, "M");
assert.equal(pedidosConTallas.find(item => item.venta_id === "venta-nueva")?.ubicacion_entrega_nombre, "San Pedro");
assert.equal(pedidosConTallas.find(item => item.venta_id === "venta-legada")?.items[0].talla, "L");
assert.equal(pedidosConTallas.find(item => item.venta_id === "venta-legada")?.ubicacion_entrega_nombre, "Cumbres");
const detailView = readFileSync("src/components/PedidosVenta.tsx", "utf8");
for (const label of ["Artículos a entregar", "Entregar en", "Ubicación no registrada", "Talla:", "Liquidar pedido"]) {
  assert.ok(detailView.includes(label), `El detalle debe incluir: ${label}`);
}
console.log("Seguimiento por pagar: solo liquidación final, históricos, historial y saldos aprobados.");
