import type { Producto } from "../types";

export const etiquetaTipoTalla = (tipo?: Producto["tipo_talla"]): string =>
  tipo === "ropa" ? "Ropa"
  : tipo === "calzado" ? "Calzado"
  : tipo === "unica" ? "Talla única"
  : "Personalizada";

export const filtrarProductosCatalogo = (productos: Producto[], busqueda: string, marca: string): Producto[] => {
  const text = busqueda.trim().toLocaleLowerCase("es-MX");
  const brand = marca.trim().toLocaleLowerCase("es-MX");
  return productos
    .filter(producto => producto.en_papelera !== true)
    .filter(producto => marca === "all" || (producto.marca || "").toLocaleLowerCase("es-MX") === brand)
    .filter(producto => !text || [producto.nombre, producto.sku, producto.marca]
      .some(value => (value || "").toLocaleLowerCase("es-MX").includes(text)))
    .sort((a, b) =>
      a.nombre.localeCompare(b.nombre, "es-MX", { sensitivity: "base" }) ||
      a.sku.localeCompare(b.sku, "es-MX", { sensitivity: "base" })
    );
};
