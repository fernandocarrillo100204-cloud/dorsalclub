import type { Movimiento } from "../types";
import { fechaRegistro } from "./lecturasVentas";

export interface FleteVenta {
  id: string;
  ventaId?: string;
  folio: string;
  fecha: Date;
  costo: number;
  quienEntrega: string | null;
  ubicacionEntrega: string | null;
}

/**
 * Los fletes se leen de los movimientos de venta que ya alimentan Balance general.
 * No se crea otro gasto en Firebase; cada costo se contabiliza una sola vez.
 * La venta puede tener varias partidas, pero aquí se agrupa por venta/folio.
 */
export function obtenerFletesDeMovimientos(movimientos: Movimiento[]): FleteVenta[] {
  const grouped = new Map<string, FleteVenta & { centavos: number }>();
  for (const item of movimientos) {
    if (item.tipo !== "salida" || item.subtipo || item.en_papelera ||
      ["anulado", "anulada", "inactivo"].includes(item.estado || "")) continue;
    const cost = Number(item.costo_envio_venta);
    if (!Number.isFinite(cost) || cost <= 0) continue;
    const centavos = Math.round(cost * 100);
    if (centavos <= 0) continue;

    const key = item.venta_id || item.folio || item.id || "";
    if (!key) continue;
    const who = (item.repartidor_nombre || "").trim() || null;
    const where = (item.ubicacion_entrega_nombre || "").trim() || null;
    const previous = grouped.get(key);
    if (previous) {
      previous.centavos += centavos;
      previous.costo = previous.centavos / 100;
      if (!previous.quienEntrega && who) previous.quienEntrega = who;
      if (!previous.ubicacionEntrega && where) previous.ubicacionEntrega = where;
      continue;
    }
    grouped.set(key, {
      id: key,
      ventaId: item.venta_id || undefined,
      folio: item.folio || key,
      fecha: fechaRegistro(item.fecha),
      costo: centavos / 100,
      centavos,
      quienEntrega: who,
      ubicacionEntrega: where
    });
  }
  return [...grouped.values()]
    .map(({ centavos: _centavos, ...flete }) => flete)
    .sort((a, b) => b.fecha.getTime() - a.fecha.getTime() || a.folio.localeCompare(b.folio, "es-MX"));
}

export function totalFletes(fletes: FleteVenta[]): number {
  return fletes.reduce((sum, item) => sum + Math.round(item.costo * 100), 0) / 100;
}
