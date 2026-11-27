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

const headers = ["sku", "nombre", "marca", "tipo_talla", "producto_base_id", "categoria",
  "color", "talla", "codigo_barras", "precio_costo", "precio_venta", "precio_venta_sugerido",
  "stock_minimo", "stock_minimo_almacenes", "unidad", "activo"];
assert.ok(COLUMNAS_PLANTILLA_PRODUCTOS.includes("sku"));
assert.ok(COLUMNAS_CSV_PRODUCTOS.includes("creado_at"));
assert.ok(COLUMNAS_CSV_PRODUCTOS.includes("actualizado_at"));
assert.ok(COLUMNAS_CSV_PRODUCTOS.includes("en_papelera"));
assert.ok(COLUMNAS_CSV_PRODUCTOS.includes("stock_minimo_almacenes"));
const toImport = buildCsv(headers, [
  ["A-001", "Camiseta, ejemplo", "Marca prueba", "ropa", "", "General", "Rojo", "", "000123456789",
    150.5, 300.25, 330, 0, '{"Tienda":2}', "pieza", "false"],
  ["B-002", "Gorra con \"texto\" y salto\nde línea", "Marca dos", "unica", "", "General", "", "", "",
    0, "", "", "", "", "pieza", "true"]
]);
const nuevos = importarProductosCsv(toImport);
assert.equal(nuevos.length, 2);
assert.equal(nuevos[0].nombre, "Camiseta, ejemplo");
assert.equal(nuevos[0].codigo_barras, "000123456789", "Código de barras conserva ceros iniciales.");
assert.equal(nuevos[0].precio_costo, 150.5);
assert.equal(nuevos[0].precio_venta, 300.25);
assert.equal(nuevos[0].precio_venta_sugerido, 330);
assert.deepEqual(nuevos[0].stock_minimo_almacenes, { Tienda: 2 });
assert.equal(nuevos[0].activo, false);
assert.equal(nuevos[1].tipo_talla, "unica");
assert.equal(nuevos[1].nombre, 'Gorra con "texto" y salto\nde línea');
assert.equal(nuevos[1].precio_costo, 0);
assert.equal(nuevos[1].activo, true);
assert.equal(nuevos[0].producto_base_id, "A-001");

const semicolons = "sku;nombre;marca;tipo_talla\r\nS-1;Producto;Prueba;calzado\r\n";
assert.equal(importarProductosCsv(semicolons)[0].tipo_talla, "calzado");
assert.equal(importarProductosCsv("sep=;\r\n" + semicolons)[0].sku, "S-1");
assert.throws(() => importarProductosCsv(toImport, [nuevos[0]]), /ya existe/);
assert.throws(() => importarProductosCsv(buildCsv(["sku", "nombre", "marca", "tipo_talla"], [
  ["REPETIDO", "uno", "Marca", "ropa"], ["repetido", "dos", "Marca", "ropa"]
])), /repetido en el archivo/);
assert.throws(() => importarProductosCsv("sku,nombre,marca,tipo_talla\nINV-1,Nombre,Marca,invalido"), /tipo_talla/);
assert.throws(() => importarProductosCsv("sku,nombre,marca,tipo_talla\nINV-1,Nombre,Marca,ropa,extra"), /esperaban 4 columnas/);
assert.throws(() => importarProductosCsv("sku,nombre,marca,tipo_talla\nINV-1,Nombre,Marca,\"ropa"), /faltan cerrar comillas/);
assert.throws(() => importarProductosCsv("sku,nombre,marca,tipo_talla\nINV-1,Nombre,Marca,ropa\nINV-2,Otro,Marca,ropa\nINV-3,Otro 2,Marca,ropa".replace(/,tipo_talla/, ",otro_campo")), /Columnas no reconocidas/);
assert.throws(() => importarProductosCsv(buildCsv(headers, [
  ["G-1", "Nombre", "Marca", "ropa", "", "", "", "", "", "", "", "", "", "{mal json}", "", ""]
])), /stock_minimo_almacenes/);
assert.throws(() => importarProductosCsv(buildCsv(["sku","nombre","marca","tipo_talla","en_papelera"], [
  ["X-1","Nombre","Marca","ropa","true"]
])), /Papelera/);

const completo: Producto = {
  ...nuevos[0], id: "identificador-historico", creado_at: new Date("2026-01-01T00:00:00.000Z"),
  actualizado_at: { seconds: 1767225600, nanoseconds: 0 }, en_papelera: false
};
const exportado = datosExportacionProductosCsv([completo, { ...nuevos[1], en_papelera: true }]);
assert.equal(exportado.filas.length, 1, "No exporta los registros eliminados.");
assert.equal(exportado.columnas.length, COLUMNAS_CSV_PRODUCTOS.length, "Todos los campos del modelo van en el encabezado.");
assert.equal(exportado.filas[0][exportado.columnas.indexOf("id")], "identificador-historico");
assert.equal(exportado.filas[0][exportado.columnas.indexOf("creado_at")], "2026-01-01T00:00:00.000Z");
assert.equal(exportado.filas[0][exportado.columnas.indexOf("stock_minimo_almacenes")], '{"Tienda":2}');
const reimportado = importarProductosCsv(buildCsv(exportado.columnas, exportado.filas));
assert.equal(reimportado[0].sku, "A-001");
assert.equal(reimportado[0].nombre, "Camiseta, ejemplo");
assert.equal(reimportado[0].id, undefined, "La exportación puede usarse como entrada; los metadatos no se restauran.");
const view = readFileSync("src/components/GestionProductos.tsx", "utf8");
for (const title of ["Importar CSV", "Exportar catálogo", "Plantilla CSV", "Vista previa de importación CSV"]) {
  assert.ok(view.includes(title), `Falta la opción de Productos: ${title}`);
}
assert.match(view, /getProductos\(\)/, "La exportación usa el catálogo completo, no la búsqueda actual.");

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
assert.equal(guardados.find(p => p.sku === "A-001")?.precio_venta, 300.25);
assert.deepEqual(guardados.find(p => p.sku === "A-001")?.stock_minimo_almacenes, { Tienda: 2 });
await assert.rejects(firestoreService.addProductsBatch([nuevos[0], { ...nuevos[1], sku: "C-003" }]), /ya existe/);
assert.equal((await firestoreService.getProductos()).length, 2, "No hay importaciones parciales ante SKU repetido.");
await assert.rejects(firestoreService.addProductsBatch(Array.from({ length: 401 }, (_, i) =>
  ({ ...nuevos[0], sku: `MAX-${i}`, nombre: `Artículo ${i}` }))), /hasta 400/);
assert.equal((await firestoreService.getProductos()).length, 2);

console.log("Catálogo plano: búsqueda, filtros, tipos de talla y registros históricos aprobados.");
