import type { Producto, TallaCalzadoCatalogo, TallaRopaCatalogo } from "../types";

export type TipoTalla = NonNullable<Producto["tipo_talla"]>;

// Los productos históricos sin tipo se conservan editables como talla personalizada.
export const tipoTallaDeProducto = (producto?: Pick<Producto, "tipo_talla">): TipoTalla =>
  producto?.tipo_talla || "personalizada";

export const tallaNormalizadaCompra = (tipo: TipoTalla, valor: string): string =>
  tipo === "unica" ? "Única" : valor.trim().replace(/\s+/g, " ");

export function opcionesTallaCompra(
  producto: Producto | undefined,
  tallasRopa: TallaRopaCatalogo[],
  tallasCalzado: TallaCalzadoCatalogo[]
): string[] {
  const tipo = tipoTallaDeProducto(producto);
  const catalogo = tipo === "ropa" ? tallasRopa : tipo === "calzado" ? tallasCalzado : [];
  const tallas = catalogo
    .filter(item => item.activa !== false && item.en_papelera !== true)
    .map(item => item.nombre.trim())
    .filter(Boolean);
  // Una variante histórica puede conservar una talla que ya no figure en el catálogo.
  if (producto?.talla && (tipo === "ropa" || tipo === "calzado")) tallas.push(producto.talla.trim());
  const seen = new Set<string>();
  return tallas.filter(talla => {
    const key = talla.toLocaleUpperCase("es-MX");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function validarTallaCompra(
  producto: Producto | undefined,
  valor: string,
  tallasRopa: TallaRopaCatalogo[],
  tallasCalzado: TallaCalzadoCatalogo[]
): string | null {
  const tipo = tipoTallaDeProducto(producto);
  if (tipo === "unica") return null;
  const talla = tallaNormalizadaCompra(tipo, valor);
  if (!talla) return "Selecciona o escribe la talla del producto.";
  if (talla.length > 40) return "La talla no puede superar 40 caracteres.";
  if (tipo === "ropa" || tipo === "calzado") {
    const validas = opcionesTallaCompra(producto, tallasRopa, tallasCalzado);
    if (!validas.some(opcion => opcion.toLocaleUpperCase("es-MX") === talla.toLocaleUpperCase("es-MX"))) {
      return "Selecciona una talla activa del catálogo correspondiente.";
    }
  }
  return null;
}
