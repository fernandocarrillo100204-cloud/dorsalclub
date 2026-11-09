import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateSaleTotals } from "../src/lib/ventasCore";

// El cliente puede cubrir todo, nada o una parte de la entrega.
// El costo del negocio afecta el margen, nunca el total a cobrar.
const ventaParcial = calculateSaleTotals({
  items: [{ cantidad: 2, precio_unitario_venta: 200, costo_unitario_venta: 100 }],
  costo_envio_venta: 100,
  envio_cobrado_cliente: 40,
  anticipo_porcentaje: 50
});
assert.equal(ventaParcial.subtotal, 400);
assert.equal(ventaParcial.total, 440);
assert.equal(ventaParcial.costosAdicionales, 100);
assert.equal(ventaParcial.costosTotales, 300);
assert.equal(ventaParcial.recibido, 220);
assert.equal(ventaParcial.saldo, 220);

const ventaSinCobro = calculateSaleTotals({
  items: [{ cantidad: 1, precio_unitario_venta: 300, costo_unitario_venta: 100 }],
  costo_envio_venta: 80,
  envio_cobrado_cliente: 0,
  anticipo_porcentaje: 100
});
assert.equal(ventaSinCobro.total, 300);
assert.equal(ventaSinCobro.costosTotales, 180);

const source = readFileSync("src/components/Ventas.tsx", "utf8");
const start = source.indexOf("{/* Entrega: únicamente costo real");
const end = source.indexOf("{/* Resumen en tiempo real */}");
assert.ok(start !== -1 && end > start, "Existe la sección simplificada de entrega.");
const section = source.slice(start, end);
assert.equal((section.match(/<MoneyInput\b/g) || []).length, 2, "Solo dos importes editables en entrega.");
assert.match(section, /Costo de la entrega/);
assert.match(section, /Costo cubierto por el cliente/);
for (const old of ["Otros cargos cobrados", "Otros costos asociados", "Concepto de otros"]) {
  assert.ok(!source.includes(old), `Se retiró el campo obsoleto: ${old}`);
}
for (const old of ["otros_cargos_cliente:", "otros_costos_venta:", "concepto_otros_cargos:", "concepto_otros_costos:"]) {
  assert.ok(!source.includes(old), `Nuevas ventas no envían el campo obsoleto: ${old}`);
}
assert.match(source, /costo_envio_venta: costoEnvioFinal/);
assert.match(source, /envio_cobrado_cliente: envioCobradoFinal/);
assert.match(source, /const totalCobrado = totalMercancia \+ envioCobradoNum;/);
console.log("Entrega en ventas: dos campos, costos independientes, subtotales, anticipos y payload aprobados.");
