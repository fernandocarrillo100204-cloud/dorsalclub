import assert from "node:assert/strict";
import { allocateRecognizedSaleIncome, calculateSaleTotals } from "../src/lib/ventasCore";

const directSale = calculateSaleTotals({
  items: [
    { cantidad: 2, precio_unitario_venta: 250, costo_unitario_venta: 100 },
    { cantidad: 1, precio_unitario_venta: 400, costo_unitario_venta: 220 }
  ],
  envio_cobrado_cliente: 100,
  costo_envio_venta: 80,
  anticipo_porcentaje: 100
});
assert.deepEqual(directSale, {
  subtotal: 900,
  costoMercancia: 420,
  total: 1000,
  costosAdicionales: 80,
  costosTotales: 500,
  recibido: 1000,
  saldo: 0,
  estadoPago: "pagado"
});

const preorder = calculateSaleTotals({
  items: [{ cantidad: 3, precio_unitario_venta: 250, costo_unitario_venta: 100 }],
  otros_cargos_cliente: 50,
  otros_costos_venta: 25,
  anticipo_porcentaje: 50
});
assert.equal(preorder.total, 800);
assert.equal(preorder.recibido, 400);
assert.equal(preorder.saldo, 400);
assert.equal(preorder.estadoPago, "anticipo");

assert.deepEqual(allocateRecognizedSaleIncome({
  recognizedAmount: 1000,
  merchandiseSubtotal: 900,
  shippingCharged: 100
}), {
  merchandise: 900,
  shipping: 100,
  other: 0
});

assert.deepEqual(allocateRecognizedSaleIncome({
  recognizedAmount: 400,
  merchandiseSubtotal: 750,
  otherCharges: 50
}), {
  merchandise: 375,
  shipping: 0,
  other: 25
});

assert.deepEqual(allocateRecognizedSaleIncome({
  recognizedAmount: -400,
  merchandiseSubtotal: 750,
  otherCharges: 50
}), {
  merchandise: -375,
  shipping: 0,
  other: -25
});

console.log("Pruebas de dominio de ventas: aprobadas");
