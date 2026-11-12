import assert from "node:assert/strict";
import type { PedidoVenta } from "../src/types";
import { pedidosPendientesPago, saldoPendientePedidos, validarLiquidacionPedido } from "../src/lib/pedidosPendientes";

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
console.log("Seguimiento por pagar: solo liquidación final, históricos, historial y saldos aprobados.");
