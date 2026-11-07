import assert from "node:assert/strict";
import type { Producto } from "../src/types";
import { etiquetaTipoTalla, filtrarProductosCatalogo } from "../src/lib/catalogoProductos";

const productos: Producto[] = [
  { sku: "BA-211", nombre: "Balenciaga Tape", marca: "Balenciaga", tipo_talla: "unica", categoria: "General", stock_minimo: 0, unidad: "pieza" },
  { sku: "LEG-M", nombre: "Modelo histórico", marca: "Nike", tipo_talla: "ropa", talla: "M", categoria: "Ropa", stock_minimo: 0, unidad: "pieza" },
  { sku: "LEG-L", nombre: "Modelo histórico", marca: "Nike", tipo_talla: "ropa", talla: "L", categoria: "Ropa", stock_minimo: 0, unidad: "pieza" },
  { sku: "DEL-1", nombre: "Papelera", marca: "Nike", categoria: "General", stock_minimo: 0, unidad: "pieza", en_papelera: true },
  { sku: "OLD-1", nombre: "Cinturón", marca: "Stüssy", categoria: "Accesorios", stock_minimo: 0, unidad: "pieza" },
  { sku: "INACTIVE", nombre: "Registro anterior", marca: "Nike", categoria: "Ropa", stock_minimo: 0, unidad: "pieza", activo: false }
];

const todos = filtrarProductosCatalogo(productos, "", "all");
assert.equal(todos.length, 5, "Se excluye Papelera, no se pierden productos antiguos.");
assert.equal(todos.filter(p => p.nombre === "Modelo histórico").length, 2, "Variantes históricas se conservan por SKU.");
assert.equal(new Set(todos.map(p => p.sku)).size, todos.length, "Una sola fila por SKU.");
assert.equal(filtrarProductosCatalogo(productos, "ba-211", "all")[0]?.nombre, "Balenciaga Tape");
assert.equal(filtrarProductosCatalogo(productos, "stüssy", "all")[0]?.sku, "OLD-1");
assert.equal(filtrarProductosCatalogo(productos, "modelo", "nike").length, 2);
assert.equal(filtrarProductosCatalogo(productos, "modelo", "Balenciaga").length, 0);
assert.equal(etiquetaTipoTalla("ropa"), "Ropa");
assert.equal(etiquetaTipoTalla("calzado"), "Calzado");
assert.equal(etiquetaTipoTalla("unica"), "Talla única");
assert.equal(etiquetaTipoTalla("personalizada"), "Personalizada");
assert.equal(etiquetaTipoTalla(undefined), "Personalizada", "Los tipos históricos sin especificar no se presuponen como talla única.");
console.log("Catálogo plano: búsqueda, filtros, tipos de talla y registros históricos aprobados.");
