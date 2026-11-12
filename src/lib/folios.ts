/** Folios legibles; la clave técnica en Firebase nunca cambia. */
export type PrefijoFolio = "VTA" | "CMP" | "GTO" | "AJU" | "ENT" | "DEV";

export function generarFolio(prefijo: PrefijoFolio, consecutivo: number): string {
  if (!Number.isSafeInteger(consecutivo) || consecutivo <= 0) {
    throw new Error("Consecutivo de folio inválido.");
  }
  return `${prefijo}-${String(consecutivo).padStart(5, "0")}`;
}

/**
 * Presenta folios históricos con las nuevas siglas, sin migraciones ni cambios
 * en IDs o referencias persistidas. Las liquidaciones y devoluciones conservan
 * el mismo folio visible de su venta.
 */
export function folioComercial(value?: string | null): string {
  const original = (value || "").trim();
  if (!original) return "";
  const relacionado = /^(?:liquidaci[oó]n|abono|reembolso|seguimiento)-(.+)$/i.exec(original);
  if (relacionado) return folioComercial(relacionado[1]);

  const old = /^(salida|vta|comp|compra|cmp|entrada|ent|ajuste|aju|gasto|gto|dev)-0*(\d+)$/i.exec(original);
  if (!old) return original;
  const prefix: Record<string, PrefijoFolio> = {
    salida: "VTA", vta: "VTA", comp: "CMP", compra: "CMP", cmp: "CMP",
    entrada: "ENT", ent: "ENT", ajuste: "AJU", aju: "AJU",
    gasto: "GTO", gto: "GTO", dev: "DEV"
  };
  const numero = Number(old[2]);
  return Number.isSafeInteger(numero) && numero > 0
    ? generarFolio(prefix[old[1].toLowerCase()], numero)
    : original;
}
