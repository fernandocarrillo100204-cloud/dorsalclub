import assert from "node:assert/strict";
import { opcionesTallaCompra, tallaNormalizadaCompra, tipoTallaDeProducto, validarTallaCompra } from "../src/lib/tallasProducto";
import type { Producto, TallaCalzadoCatalogo, TallaRopaCatalogo } from "../src/types";

const producto = (tipo_talla: Producto["tipo_talla"], talla?: string): Producto => ({
  sku: "TEST-1", nombre: "Modelo", categoria: "General", stock_minimo: 0,
  unidad: "pieza", tipo_talla, talla
});
const ropa: TallaRopaCatalogo[] = [
  { id: "r1", nombre: "M", activa: true },
  { id: "r2", nombre: "L", activa: true },
  { id: "r3", nombre: "XL", activa: false },
  { id: "r4", nombre: "M", activa: true },
  { id: "r5", nombre: "XS", activa: true, en_papelera: true }
];
const calzado: TallaCalzadoCatalogo[] = [
  { id: "c1", nombre: "26", activa: true },
  { id: "c2", nombre: "27", activa: true },
  { id: "c3", nombre: "28", activa: false }
];

assert.deepEqual(opcionesTallaCompra(producto("ropa"), ropa, calzado), ["M", "L"]);
assert.deepEqual(opcionesTallaCompra(producto("calzado"), ropa, calzado), ["26", "27"]);
assert.deepEqual(opcionesTallaCompra(producto("ropa", "XXL"), ropa, calzado), ["M", "L", "XXL"], "Preservar tallas de productos históricos");
assert.equal(validarTallaCompra(producto("ropa"), "m", ropa, calzado), null, "La validación ignora mayúsculas");
assert.match(validarTallaCompra(producto("ropa"), "XXL", ropa, calzado) || "", /catálogo/);
assert.match(validarTallaCompra(producto("calzado"), "28", ropa, calzado) || "", /catálogo/);
assert.equal(validarTallaCompra(producto("calzado"), "26", ropa, calzado), null);
assert.equal(tallaNormalizadaCompra("unica", ""), "Única");
assert.equal(validarTallaCompra(producto("unica"), "", ropa, calzado), null, "Accesorio de talla única no solicita talla");
assert.equal(tallaNormalizadaCompra("personalizada", " 90   cm "), "90 cm");
assert.equal(validarTallaCompra(producto("personalizada"), "90 cm", ropa, calzado), null);
assert.match(validarTallaCompra(producto("personalizada"), "", ropa, calzado) || "", /talla/);
assert.match(validarTallaCompra(producto("personalizada"), "1".repeat(41), ropa, calzado) || "", /40/);
assert.equal(tipoTallaDeProducto(producto(undefined)), "personalizada", "Producto histórico sin tipo conserva captura libre");
console.log("Tallas por tipo: catálogos activos, talla única, personalizadas y compatibilidad histórica correctos.");
