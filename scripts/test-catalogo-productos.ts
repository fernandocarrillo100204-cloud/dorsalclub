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
assert.deepEqual(headers, ["sku", "nombre", "marca", "tipo_talla", "costo"]);
assert.deepEqual([...COLUMNAS_PLANTILLA_PRODUCTOS], headers, "La plantilla usa las mismas cinco columnas.");
const eliminadas = [
  "color", "talla", "codigo_barras", "precio_venta", "precio_venta_sugerido",
  "stock_minimo", "stock_minimo_almacenes", "id", "en_papelera",
  "precio_costo", "categoria", "unidad", "activo", "producto_base_id",
  "creado_at", "actualizado_at", "desactivado_at"
];
assert.ok(eliminadas.every(campo => !headers.includes(campo as typeof headers[number])));

const toImport = buildCsv(headers, [
  ["A-001", "Camiseta, ejemplo", "Marca prueba", "ropa", 150.5],
  ["B-002", 'Gorra con "texto" y salto\nde línea', "Marca dos", "unica", ""],
  ["C-003", "Tenis", "Marca tres", "calzado", "0"]
]);
const nuevos = importarProductosCsv(toImport);
assert.equal(nuevos.length, 3);
assert.equal(nuevos[0].nombre, "Camiseta, ejemplo");
assert.equal(nuevos[0].sku, "A-001");
assert.equal(nuevos[0].marca, "Marca prueba");
assert.equal(nuevos[0].tipo_talla, "ropa");
assert.equal(nuevos[0].precio_costo, 150.5);
assert.equal(nuevos[0].stock_minimo, 0, "El mínimo técnico no se solicita en CSV.");
assert.equal(nuevos[0].producto_base_id, "A-001");
assert.equal(nuevos[1].tipo_talla, "unica");
assert.equal(nuevos[1].nombre, 'Gorra con "texto" y salto\nde línea');
assert.equal(nuevos[1].precio_costo, undefined, "No rellenar automáticamente un costo que no se proporcionó.");
assert.equal(nuevos[2].precio_costo, 0, "Permitir costo cero explícito.");
assert.ok(!("talla" in nuevos[0]), "La talla específica se asigna en Compras.");
assert.ok(!("precio_venta" in nuevos[0]), "El costo no debe confundirse con el precio de venta.");

const semicolons = "sku;nombre;marca;tipo_talla;costo\r\nS-1;Producto;Prueba;calzado;450,75\r\n";
assert.equal(importarProductosCsv(semicolons)[0].precio_costo, 450.75);
assert.equal(importarProductosCsv("sep=;\r\n" + semicolons)[0].sku, "S-1");
const antiguoFormato = "sku,nombre,marca,tipo_talla\r\nANT-1,Producto viejo,Marca,ropa\r\n";
assert.equal(importarProductosCsv(antiguoFormato)[0].precio_costo, undefined, "Los CSV anteriores siguen siendo importables.");

assert.throws(() => importarProductosCsv(toImport, [nuevos[0]]), /ya existe/);
assert.throws(() => importarProductosCsv(buildCsv(headers, [
  ["REPETIDO", "uno", "Marca", "ropa", 50], ["repetido", "dos", "Marca", "ropa", 50]
])), /repetido en el archivo/);
assert.throws(() => importarProductosCsv("sku,nombre,marca,tipo_talla,costo\nINV-1,Nombre,Marca,invalido,50"), /tipo_talla/);
assert.throws(() => importarProductosCsv("sku,nombre,marca,tipo_talla,costo\nINV-1,Nombre,Marca,ropa,50,extra"), /esperaban 5 columnas/);
assert.throws(() => importarProductosCsv("sku,nombre,marca,tipo_talla,costo\nINV-1,Nombre,Marca,\"ropa,50"), /faltan cerrar comillas/);
assert.throws(() => importarProductosCsv("sku,nombre,marca,otro_campo,costo\nINV-1,Nombre,Marca,ropa,50"), /Columnas no reconocidas/);
assert.throws(() => importarProductosCsv("sku,nombre,marca,costo\nINV-1,Nombre,Marca,50"), /Faltan columnas obligatorias/);
for (const invalid of ["-1", "abc", "2.999", "=5", "1e3", "1,999"]) {
  assert.throws(() => importarProductosCsv(buildCsv(headers, [["X-1", "Nombre", "Marca", "ropa", invalid]])),
    /costo inválido/, "Debe rechazar el costo " + invalid);
}
for (const campo of eliminadas) {
  assert.throws(() => importarProductosCsv(buildCsv([...headers, campo], [
    ["NUEVO", "Nombre", "Marca", "ropa", 75, "x"]
  ])), /Columnas no reconocidas/, "No volver a introducir la columna " + campo);
}

const completo: Producto = {
  ...nuevos[0], color: "Azul", talla: "M", codigo_barras: "012345",
  precio_venta: 300, precio_venta_sugerido: 400, stock_minimo: 9,
  stock_minimo_almacenes: { A: 2 }, id: "interno", en_papelera: false,
  precio_costo: 120, categoria: "Archivo", unidad: "par",
  creado_at: new Date("2026-01-01T00:00:00.000Z")
};
const exportado = datosExportacionProductosCsv([completo, { ...nuevos[1], en_papelera: true }]);
assert.deepEqual(exportado.columnas, headers);
assert.deepEqual(exportado.filas, [["A-001", "Camiseta, ejemplo", "Marca prueba", "ropa", 120]]);
const reimportado = importarProductosCsv(buildCsv(exportado.columnas, exportado.filas));
assert.equal(reimportado[0].sku, completo.sku);
assert.equal(reimportado[0].nombre, completo.nombre);
assert.equal(reimportado[0].precio_costo, 120, "El costo se conserva en exportación e importación.");
assert.equal(reimportado[0].id, undefined);
assert.equal(reimportado[0].talla, undefined);
assert.equal(reimportado[0].precio_venta, undefined);
const sinCosto = datosExportacionProductosCsv([{ ...nuevos[1] }]);
assert.equal(sinCosto.filas[0][4], "", "Un costo no registrado se exporta como celda vacía.");

const comprasUI = readFileSync("src/components/Compras.tsx", "utf8");
assert.doesNotMatch(comprasUI, /costo_unitario: prod\.precio_costo \|\| 0/,
  "Una compra no debe rellenar costo 0 si el producto carece de costo.");
assert.match(comprasUI, /costo_unitario: typeof prod\.precio_costo/,
  "Una compra debe conservar costo vacío hasta que el usuario lo indique.");
assert.match(comprasUI, /Ingresa un costo unitario válido/,
  "Una compra sin costo explícito debe generar una validación.");
assert.match(comprasUI, /nombre_producto: ""[\s\S]{0,100}costo_unitario: ""/,
  "Cambiar o quitar el SKU debe limpiar el costo que pertenecía al producto anterior.");

const view = readFileSync("src/components/GestionProductos.tsx", "utf8");
for (const title of ["Importar CSV", "Exportar catálogo", "Plantilla CSV", "Vista previa de importación CSV", "Costo unitario"]) {
  assert.ok(view.includes(title), "Falta la opción en Productos: " + title);
}
assert.match(view, /getProductos\(\)/, "La exportación usa el catálogo completo, no la búsqueda actual.");
assert.match(view, /SKU, nombre, marca, tipo de talla y costo unitario/, "Mostrar explicación de los cinco campos.");
assert.match(view, /updateProducto\(editingProduct\.sku/, "El costo es editable en el catálogo.");
assert.match(view, /precio_costo: costo/, "La edición guarda el costo sin modificar compras pasadas.");

const memory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key)
}});
const { firestoreService } = await import("../src/lib/firebase");
await firestoreService.addProductsBatch(nuevos);
let guardados = await firestoreService.getProductos();
assert.equal(guardados.length, 3);
assert.equal(guardados.find(p => p.sku === "A-001")?.precio_costo, 150.5);
assert.equal(guardados.find(p => p.sku === "B-002")?.precio_costo, undefined);
await firestoreService.updateProducto("A-001", { precio_costo: 225.75 });
guardados = await firestoreService.getProductos();
assert.equal(guardados.find(p => p.sku === "A-001")?.precio_costo, 225.75);
await assert.rejects(firestoreService.addProductsBatch([nuevos[0], { ...nuevos[1], sku: "NUEVO" }]), /ya existe/);
assert.equal((await firestoreService.getProductos()).length, 3, "No hay importaciones parciales ante SKU repetido.");
await assert.rejects(firestoreService.addProductsBatch(Array.from({ length: 401 }, (_, i) =>
  ({ ...nuevos[0], sku: "MAX-" + i, nombre: "Artículo " + i }))), /hasta 400/);
assert.equal((await firestoreService.getProductos()).length, 3);


// Integridad del catálogo: el SKU es la identidad, no el nombre del modelo.
const mismoNombre = [
  { ...nuevos[0], sku: "D-004", precio_costo: 200 },
  { ...nuevos[0], sku: "E-005", marca: "Otra marca", precio_costo: 250 }
];
await firestoreService.addProductsBatch(mismoNombre);
assert.equal((await firestoreService.getProductos()).length, 5,
  "Permitir nombres comerciales iguales con SKU distintos; las tallas no crean SKU nuevos.");

await assert.rejects(firestoreService.addProductsBatch([
  { ...nuevos[0], sku: "INVALIDO-1", precio_costo: Number.NaN }
]), /costo/, "No convertir silenciosamente costos inválidos a cero.");
await assert.rejects(firestoreService.addProductsBatch([
  { ...nuevos[0], sku: "INVALIDO-2", precio_costo: -1 }
]), /costo/, "No permitir costos negativos.");
await assert.rejects(firestoreService.updateProducto("A-001", { precio_costo: -50 }), /costo/);
await assert.rejects(firestoreService.updateProducto("A-001", { precio_costo: 12.345 }), /costo/);
await firestoreService.updateProducto("A-001", { precio_costo: null });
assert.equal((await firestoreService.getProductos()).find(p => p.sku === "A-001")?.precio_costo, undefined,
  "Dejar el costo vacío lo elimina, no lo reemplaza por cero.");
await firestoreService.updateProducto("A-001", { precio_costo: 230.5 });
assert.equal((await firestoreService.getProductos()).find(p => p.sku === "A-001")?.precio_costo, 230.5);
await assert.rejects(firestoreService.updateProducto("SKU-FANTASMA", {
  nombre: "No puede crearse desde una edición"
}), /ya no está disponible/, "No crear un producto fantasma desde una edición atrasada.");
assert.equal((await firestoreService.getProductos()).length, 5);

// Transporte Firestore simulado: verifica transacciones reales y concurrencia sin red.
const { firebaseInMemory } = await import("./helpers/firestoreMemory");
const remote = await firebaseInMemory();
const remoto = remote.service;
assert.equal(remoto.isConfigured(), true);
await remoto.addProductsBatch([
  { ...nuevos[0], sku: "RX-01", precio_costo: 550 },
  { ...nuevos[0], sku: "RX-02", marca: "Marca distinta", precio_costo: 750 }
]);
assert.equal(remote.data.get("productos/RX-01")?.precio_costo, 550);
assert.equal(remote.data.get("productos/RX-02")?.precio_costo, 750);
await assert.rejects(remoto.addProductsBatch([
  { ...nuevos[0], sku: "RX-03" },
  { ...nuevos[0], sku: "RX-01", precio_costo: 1 }
]), /ya existe/, "El lote debe ser atómico incluso con un SKU existente.");
assert.equal(remote.data.has("productos/RX-03"), false);

const concurrentes = await Promise.allSettled([
  remoto.addProductsBatch([{ ...nuevos[0], sku: "RX-RACE", nombre: "Primera", precio_costo: 111 }]),
  remoto.addProductsBatch([{ ...nuevos[0], sku: "RX-RACE", nombre: "Segunda", precio_costo: 222 }])
]);
assert.equal(concurrentes.filter(result => result.status === "fulfilled").length, 1,
  "Dos importaciones concurrentes no pueden sobrescribir el mismo SKU.");
assert.equal(concurrentes.filter(result => result.status === "rejected").length, 1);
assert.ok([111, 222].includes(remote.data.get("productos/RX-RACE")?.precio_costo));

await assert.rejects(remoto.updateProducto("SKU-FANTASMA", { nombre: "No existe" }),
  /ya no está disponible/);
assert.equal(remote.data.has("productos/SKU-FANTASMA"), false);
await remoto.updateProducto("RX-01", { precio_costo: 600 });
assert.equal(remote.data.get("productos/RX-01")?.precio_costo, 600);
await remoto.updateProducto("RX-01", { precio_costo: null });
assert.equal(remote.data.get("productos/RX-01")?.precio_costo, undefined,
  "En Firestore un costo borrado debe desaparecer de los campos del producto.");
await remoto.updateProducto("RX-01", { precio_costo: 600 });
await assert.rejects(remoto.updateProducto("RX-01", { precio_costo: Number.POSITIVE_INFINITY }), /costo/);
assert.equal(remote.data.get("productos/RX-01")?.precio_costo, 600);

const loteCompleto = Array.from({ length: 400 }, (_, i) => ({
  ...nuevos[0], sku: "L-" + String(i).padStart(3, "0"), nombre: "Producto " + i
}));
await remoto.addProductsBatch(loteCompleto);
assert.equal(remote.data.has("productos/L-399"), true, "El límite permitido de 400 es compatible con transacciones.");

console.log("Catálogo plano: búsqueda, filtros, tipos de talla y registros históricos aprobados.");
