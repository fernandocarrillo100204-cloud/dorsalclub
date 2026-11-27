import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Producto } from "../src/types";
import { etiquetaTipoTalla, filtrarProductosCatalogo } from "../src/lib/catalogoProductos";
import { COLUMNAS_CSV_PRODUCTOS, COLUMNAS_PLANTILLA_PRODUCTOS, datosExportacionProductosCsv, importarProductosCsv } from "../src/lib/catalogoProductosCsv";
import { buildCsv } from "../src/lib/presentation";

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


const headers = [...COLUMNAS_CSV_PRODUCTOS];
assert.deepEqual(headers, ["sku", "nombre", "marca", "tipo_talla"]);
assert.deepEqual([...COLUMNAS_PLANTILLA_PRODUCTOS], headers, "Plantilla y exportación mantienen el mismo esquema.");
const eliminadas = [
  "color", "talla", "codigo_barras", "precio_venta", "precio_venta_sugerido",
  "stock_minimo", "stock_minimo_almacenes", "id", "en_papelera",
  "precio_costo", "categoria", "unidad", "activo", "producto_base_id",
  "creado_at", "actualizado_at", "desactivado_at"
];
assert.ok(eliminadas.every(campo => !headers.includes(campo as typeof headers[number])));

const toImport = buildCsv(headers, [
  ["A-001", "Camiseta, ejemplo", "Marca prueba", "ropa"],
  ["B-002", 'Gorra con "texto" y salto\nde línea', "Marca dos", "unica"]
]);
const nuevos = importarProductosCsv(toImport);
assert.equal(nuevos.length, 2);
assert.equal(nuevos[0].nombre, "Camiseta, ejemplo");
assert.equal(nuevos[0].sku, "A-001");
assert.equal(nuevos[0].marca, "Marca prueba");
assert.equal(nuevos[0].tipo_talla, "ropa");
assert.equal(nuevos[0].stock_minimo, 0, "Los defaults técnicos no se solicitan en CSV.");
assert.equal(nuevos[0].producto_base_id, "A-001");
assert.equal(nuevos[1].tipo_talla, "unica");
assert.equal(nuevos[1].nombre, 'Gorra con "texto" y salto\nde línea');
assert.ok(!("talla" in nuevos[0]), "La talla específica se asigna en Compras.");
assert.ok(!("precio_venta" in nuevos[0]), "No se asignan precios de venta desde el catálogo.");

const semicolons = "sku;nombre;marca;tipo_talla\r\nS-1;Producto;Prueba;calzado\r\n";
assert.equal(importarProductosCsv(semicolons)[0].tipo_talla, "calzado");
assert.equal(importarProductosCsv("sep=;\r\n" + semicolons)[0].sku, "S-1");
assert.throws(() => importarProductosCsv(toImport, [nuevos[0]]), /ya existe/);
assert.throws(() => importarProductosCsv(buildCsv(headers, [
  ["REPETIDO", "uno", "Marca", "ropa"], ["repetido", "dos", "Marca", "ropa"]
])), /repetido en el archivo/);
assert.throws(() => importarProductosCsv("sku,nombre,marca,tipo_talla\nINV-1,Nombre,Marca,invalido"), /tipo_talla/);
assert.throws(() => importarProductosCsv("sku,nombre,marca,tipo_talla\nINV-1,Nombre,Marca,ropa,extra"), /esperaban 4 columnas/);
assert.throws(() => importarProductosCsv("sku,nombre,marca,tipo_talla\nINV-1,Nombre,Marca,\"ropa"), /faltan cerrar comillas/);
assert.throws(() => importarProductosCsv("sku,nombre,marca,otro_campo\nINV-1,Nombre,Marca,ropa"), /Columnas no reconocidas/);
assert.throws(() => importarProductosCsv("sku,nombre,marca\nINV-1,Nombre,Marca"), /Faltan columnas obligatorias/);
for (const campo of eliminadas) {
  assert.throws(() => importarProductosCsv(buildCsv([...headers, campo], [
    ["NUEVO", "Nombre", "Marca", "ropa", "x"]
  ])), /Columnas no reconocidas/, `La importación ya no debe ofrecer ${campo}.`);
}

const completo: Producto = {
  ...nuevos[0], color: "Azul", talla: "M", codigo_barras: "012345",
  precio_venta: 300, precio_venta_sugerido: 400, stock_minimo: 9,
  stock_minimo_almacenes: { A: 2 }, id: "interno", en_papelera: false,
  precio_costo: 120, categoria: "Archivo", unidad: "par",
  creado_at: new Date("2026-01-01T00:00:00.000Z")
};
const exportado = datosExportacionProductosCsv([completo, { ...nuevos[1], en_papelera: true }]);
assert.deepEqual(exportado.columnas, headers, "La exportación solo muestra los cuatro campos visibles.");
assert.deepEqual(exportado.filas, [["A-001", "Camiseta, ejemplo", "Marca prueba", "ropa"]]);
const reimportado = importarProductosCsv(buildCsv(exportado.columnas, exportado.filas));
assert.equal(reimportado[0].sku, completo.sku);
assert.equal(reimportado[0].nombre, completo.nombre);
assert.equal(reimportado[0].id, undefined);
assert.equal(reimportado[0].talla, undefined);
assert.equal(reimportado[0].precio_venta, undefined);

const view = readFileSync("src/components/GestionProductos.tsx", "utf8");
for (const title of ["Importar CSV", "Exportar catálogo", "Plantilla CSV", "Vista previa de importación CSV"]) {
  assert.ok(view.includes(title), `Falta la opción de Productos: ${title}`);
}
assert.match(view, /getProductos\(\)/, "La exportación usa el catálogo completo, no la búsqueda actual.");
assert.match(view, /SKU, nombre, marca y tipo de talla/, "El usuario debe conocer el esquema simple.");

const memory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key)
}});
const { firestoreService } = await import("../src/lib/firebase");
await firestoreService.addProductsBatch(nuevos);
const guardados = await firestoreService.getProductos();
assert.equal(guardados.length, 2);
assert.equal(guardados.find(p => p.sku === "A-001")?.tipo_talla, "ropa");
assert.equal(guardados.find(p => p.sku === "B-002")?.tipo_talla, "unica");
await assert.rejects(firestoreService.addProductsBatch([nuevos[0], { ...nuevos[1], sku: "C-003" }]), /ya existe/);
assert.equal((await firestoreService.getProductos()).length, 2, "No hay importaciones parciales ante SKU repetido.");
await assert.rejects(firestoreService.addProductsBatch(Array.from({ length: 401 }, (_, i) =>
  ({ ...nuevos[0], sku: `MAX-${i}`, nombre: `Artículo ${i}` }))), /hasta 400/);
assert.equal((await firestoreService.getProductos()).length, 2);

console.log("Catálogo plano: búsqueda, filtros, tipos de talla y registros históricos aprobados.");
