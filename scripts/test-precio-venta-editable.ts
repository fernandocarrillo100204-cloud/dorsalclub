import assert from "node:assert/strict";
import { precioPartidaTrasCambioPorcentaje } from "../src/lib/precioVentaEditable";
import { calculateSaleTotals } from "../src/lib/ventasCore";

// El porcentaje configura el precio inicial, pero no inmoviliza la cotización.
const partida = { precioUnitario: 150, precioManual: false };
assert.equal(precioPartidaTrasCambioPorcentaje(partida, 200), 200);
assert.equal(precioPartidaTrasCambioPorcentaje({ precioUnitario: "175.50", precioManual: true }, 220), "175.50");
assert.equal(precioPartidaTrasCambioPorcentaje({ precioUnitario: "0", precioManual: true }, 220), "0");
assert.equal(precioPartidaTrasCambioPorcentaje({ precioUnitario: "", precioManual: true }, 220), "");
assert.equal(precioPartidaTrasCambioPorcentaje({ precioUnitario: 175.5, precioManual: false }, 220), 220, "Restablecer retoma el sugerido del canal");

// Precios manuales distintos por SKU y partida: alimentan los totales y anticipos.
const venta = calculateSaleTotals({
  items: [
    { cantidad: 2, precio_unitario_venta: 175.50, costo_unitario_venta: 100 },
    { cantidad: 1, precio_unitario_venta: 220, costo_unitario_venta: 120 }
  ],
  envio_cobrado_cliente: 40,
  anticipo_porcentaje: 50
});
assert.equal(venta.subtotal, 571);
assert.equal(venta.total, 611);
assert.equal(venta.costoMercancia, 320);
assert.equal(venta.recibido, 305.50);
assert.equal(venta.saldo, 305.50);
console.log("Precios editables por partida y cálculos de venta: aprobados.");
