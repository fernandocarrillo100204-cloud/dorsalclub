import type { Producto } from "../types";

/** Todos los atributos del modelo Producto, incluidos campos de compatibilidad histórica. */
export const COLUMNAS_CSV_PRODUCTOS = [
  "sku", "nombre", "marca", "tipo_talla", "producto_base_id", "categoria",
  "color", "talla", "codigo_barras", "precio_costo", "precio_venta",
  "precio_venta_sugerido", "stock_minimo", "stock_minimo_almacenes",
  "unidad", "activo", "id", "en_papelera", "creado_at", "actualizado_at", "desactivado_at"
] as const satisfies readonly (keyof Producto)[];

export const COLUMNAS_PLANTILLA_PRODUCTOS = COLUMNAS_CSV_PRODUCTOS.slice(0, 16);
export const MAX_PRODUCTOS_CSV = 400;

type FilaCsv = { celdas: string[]; linea: number };
const OBLIGATORIAS = ["sku", "nombre", "marca", "tipo_talla"];

function detectarSeparador(texto: string): "," | ";" {
  let comas = 0, puntosYComas = 0, enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '"') {
      if (enComillas && texto[i + 1] === '"') i++;
      else enComillas = !enComillas;
    } else if (!enComillas) {
      if (c === "\n" || c === "\r") break;
      if (c === ",") comas++;
      if (c === ";") puntosYComas++;
    }
  }
  return puntosYComas > comas ? ";" : ",";
}

/** Analiza CSV con campos entrecomillados, comillas escapadas y saltos de línea internos. */
function filasCsv(texto: string, separador: "," | ";"): FilaCsv[] {
  const filas: FilaCsv[] = [];
  let celdas: string[] = [], campo = "", enComillas = false, cerradas = false, linea = 1, inicio = 1;
  const cerrarFila = () => {
    celdas.push(campo);
    if (celdas.some(celda => celda.trim())) filas.push({ celdas, linea: inicio });
    celdas = [];
    campo = "";
    cerradas = false;
    inicio = linea + 1;
    if (filas.length > MAX_PRODUCTOS_CSV + 1) throw new Error(`El archivo admite máximo ${MAX_PRODUCTOS_CSV} productos por importación.`);
  };
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else { enComillas = false; cerradas = true; }
      } else {
        campo += c;
        if (c === "\n") linea++;
      }
    } else if (c === '"' && !campo && !cerradas) {
      enComillas = true;
    } else if (c === separador) {
      celdas.push(campo);
      campo = "";
      cerradas = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      cerrarFila();
      linea++;
      inicio = linea;
    } else if (cerradas && !/\s/.test(c)) {
      throw new Error(`CSV mal formado en la línea ${linea}: hay texto después de cerrar las comillas.`);
    } else if (c === '"' && campo) {
      throw new Error(`CSV mal formado en la línea ${linea}: comillas dentro de un campo sin escapar.`);
    } else if (!cerradas) {
      campo += c;
    }
  }
  if (enComillas) throw new Error(`CSV mal formado: faltan cerrar comillas desde la línea ${inicio}.`);
  if (campo || celdas.length || cerradas) cerrarFila();
  return filas;
}

function numero(valor: string, columna: string, linea: number): number | undefined {
  if (!valor.trim()) return undefined;
  const texto = valor.trim().replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(texto)) {
    throw new Error(`Línea ${linea}: "${columna}" debe ser un número positivo o cero.`);
  }
  const resultado = Number(texto);
  if (!Number.isFinite(resultado)) throw new Error(`Línea ${linea}: importe inválido en "${columna}".`);
  return resultado;
}

function booleano(valor: string, columna: string, linea: number): boolean | undefined {
  if (!valor.trim()) return undefined;
  const clave = valor.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (["true", "1", "si", "yes", "activo"].includes(clave)) return true;
  if (["false", "0", "no", "inactivo"].includes(clave)) return false;
  throw new Error(`Línea ${linea}: "${columna}" debe ser true/false o sí/no.`);
}

function diccionarioStock(valor: string, linea: number): Record<string, number> | undefined {
  if (!valor.trim()) return undefined;
  try {
    const dato: unknown = JSON.parse(valor);
    if (!dato || typeof dato !== "object" || Array.isArray(dato) ||
      Object.entries(dato).some(([clave, n]) => !clave || typeof n !== "number" || !Number.isFinite(n) || n < 0)) {
      throw new Error();
    }
    return dato as Record<string, number>;
  } catch {
    throw new Error(`Línea ${linea}: stock_minimo_almacenes debe contener un objeto JSON válido.`);
  }
}

function tipoTalla(valor: string, linea: number): NonNullable<Producto["tipo_talla"]> {
  const clave = valor.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (clave === "ropa" || clave === "calzado" || clave === "personalizada") return clave;
  if (["unica", "talla unica", "sin talla"].includes(clave)) return "unica";
  throw new Error(`Línea ${linea}: tipo_talla debe ser ropa, calzado, unica o personalizada.`);
}

export function importarProductosCsv(texto: string, existentes: Producto[] = []): Producto[] {
  let limpio = texto.replace(/^\uFEFF/, "");
  let separador = detectarSeparador(limpio);
  const excel = /^sep=([;,])\r?\n/i.exec(limpio);
  if (excel) {
    separador = excel[1] as "," | ";";
    limpio = limpio.slice(excel[0].length);
  }
  const filas = filasCsv(limpio, separador);
  if (!filas.length) throw new Error("El CSV está vacío. Descarga la plantilla para ver sus columnas.");
  const columnas = filas[0].celdas.map(valor => valor.trim().toLowerCase());
  if (new Set(columnas).size !== columnas.length) throw new Error("El CSV contiene columnas repetidas.");
  const noReconocidas = columnas.filter(columna => !COLUMNAS_CSV_PRODUCTOS.includes(columna as typeof COLUMNAS_CSV_PRODUCTOS[number]));
  if (noReconocidas.length) throw new Error(`Columnas no reconocidas: ${noReconocidas.join(", ")}.`);
  const faltantes = OBLIGATORIAS.filter(columna => !columnas.includes(columna));
  if (faltantes.length) throw new Error(`Faltan columnas obligatorias: ${faltantes.join(", ")}.`);
  if (filas.length === 1) throw new Error("El CSV solo tiene encabezados; agrega al menos un producto.");
  const vistos = new Set<string>();
  const skusExistentes = new Set(existentes.map(p => p.sku.trim().toUpperCase()));
  return filas.slice(1).map(({ celdas, linea }) => {
    if (celdas.length !== columnas.length) {
      throw new Error(`Línea ${linea}: se esperaban ${columnas.length} columnas y hay ${celdas.length}. Revisa las comas y comillas.`);
    }
    const valores = Object.fromEntries(columnas.map((columna, indice) => [columna, celdas[indice].trim()])) as Record<string, string>;
    const sku = valores.sku.trim().toUpperCase();
    const nombre = valores.nombre.trim();
    const marca = valores.marca.trim();
    if (!sku || sku.length > 128 || sku.includes("/") || /[\r\n]/.test(sku)) throw new Error(`Línea ${linea}: SKU obligatorio, máximo 128 caracteres y sin "/".`);
    if (!nombre || nombre.length > 120) throw new Error(`Línea ${linea}: nombre obligatorio de máximo 120 caracteres.`);
    if (!marca || marca.length > 120) throw new Error(`Línea ${linea}: marca obligatoria de máximo 120 caracteres.`);
    if (vistos.has(sku)) throw new Error(`Línea ${linea}: el SKU ${sku} está repetido en el archivo.`);
    if (skusExistentes.has(sku)) throw new Error(`Línea ${linea}: el SKU ${sku} ya existe. La importación solo da de alta productos nuevos.`);
    vistos.add(sku);
    if (valores.en_papelera && booleano(valores.en_papelera, "en_papelera", linea)) {
      throw new Error(`Línea ${linea}: no se pueden importar productos marcados como Papelera.`);
    }
    const producto: Producto = {
      sku, producto_base_id: valores.producto_base_id || sku, nombre, marca,
      tipo_talla: tipoTalla(valores.tipo_talla, linea),
      categoria: valores.categoria || "General",
      unidad: valores.unidad || "pieza",
      stock_minimo: numero(valores.stock_minimo || "", "stock_minimo", linea) ?? 0,
      activo: booleano(valores.activo || "", "activo", linea) ?? true
    };
    for (const campo of ["color", "talla", "codigo_barras"] as const) {
      if (valores[campo]) producto[campo] = valores[campo];
    }
    for (const campo of ["precio_costo", "precio_venta", "precio_venta_sugerido"] as const) {
      const valor = numero(valores[campo] || "", campo, linea);
      if (valor !== undefined) producto[campo] = valor;
    }
    const stock = diccionarioStock(valores.stock_minimo_almacenes || "", linea);
    if (stock) producto.stock_minimo_almacenes = stock;
    // Campos de solo lectura (id, marcas de tiempo) nunca se escriben desde CSV.
    return producto;
  });
}

function fechaCsv(valor: Producto["creado_at"]): string {
  if (!valor) return "";
  const fecha = valor instanceof Date ? valor :
    new Date(valor.seconds * 1000 + valor.nanoseconds / 1000000);
  return Number.isFinite(fecha.getTime()) ? fecha.toISOString() : "";
}

export function datosExportacionProductosCsv(productos: Producto[]): { columnas: string[]; filas: unknown[][] } {
  const columnas: string[] = [...COLUMNAS_CSV_PRODUCTOS];
  const filas = productos.filter(producto => producto.en_papelera !== true)
    .sort((a, b) => a.sku.localeCompare(b.sku, "es-MX", { sensitivity: "base" }))
    .map(producto => COLUMNAS_CSV_PRODUCTOS.map(campo => {
      const valor = producto[campo];
      if (valor === undefined || valor === null) return "";
      if (campo === "stock_minimo_almacenes") return JSON.stringify(valor);
      if (campo === "creado_at" || campo === "actualizado_at" || campo === "desactivado_at") {
        return fechaCsv(valor as Producto["creado_at"]);
      }
      return valor;
    }));
  return { columnas, filas };
}
