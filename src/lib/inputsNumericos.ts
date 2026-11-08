/**
 * Normalización de entradas numéricas. El usuario puede editar decimales sin
 * que React elimine el punto final ni que la rueda cambie accidentalmente valores.
 */
export function limpiarImporte(raw: string): string {
  const source = String(raw ?? "").replace(/[$\s]/g, "");
  // Pegar $1,500.25 o 1.500,25 admite separadores de miles habituales.
  let decimal = ".";
  if (source.includes(",") && source.includes(".")) {
    decimal = source.lastIndexOf(",") > source.lastIndexOf(".") ? "," : ".";
  } else if (source.includes(",")) {
    const last = source.lastIndexOf(",");
    const right = source.slice(last + 1);
    decimal = right.length <= 2 ? "," : ".";
  }
  let normalized = "";
  if (decimal === ",") {
    normalized = source.replace(/\./g, "").replace(/,/g, ".");
  } else {
    normalized = source.replace(/,/g, "");
  }
  normalized = normalized.replace(/[^0-9.]/g, "");
  const dot = normalized.indexOf(".");
  if (dot >= 0) {
    normalized = normalized.slice(0, dot + 1) + normalized.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  }
  if (normalized.startsWith(".")) normalized = "0" + normalized;
  return normalized;
}

export function mostrarImporte(value: string | number | null | undefined): string {
  if (value === "" || value === undefined || value === null) return "";
  const numeric = Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return "";
  return numeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function limpiarEntero(raw: string): string {
  return String(raw ?? "").replace(/[^0-9]/g, "").slice(0, 12);
}
