import type { Movimiento } from "../types";
import { getPeriodoKey } from "./periodosFinancieros";

/**
 * Los registros de salida contienen muchas partidas de una venta pero el índice
 * financiero cuenta UNA venta inicial y UN registro por cada abono/reembolso.
 * Los seguimientos de entrega no crean nuevas ventas financieras.
 */
export function registrosIndiceVenta(
  movimientos: Movimiento[],
  mode: "archivar" | "restaurar"
): Movimiento[] {
  const originales = movimientos.filter(item => item.venta_id && !item.subtipo && item.tipo === "salida");
  const principal = originales.find(item => item.venta_partida === 1) || originales[0];
  const eventos = movimientos.filter(item => item.tipo === "salida" && (item.subtipo === "abono_venta" || item.subtipo === "reembolso_venta"));
  return [principal, ...eventos].filter((item): item is Movimiento => {
    if (!item || !getPeriodoKey(item.fecha)) return false;
    return mode === "archivar"
      ? item.estado !== "anulado" && item.en_papelera !== true
      : item.en_papelera === true && item.estado_antes_papelera !== "anulado" && item.periodo_descontado_papelera === true;
  });
}

export function ajustePeriodosRegistrosVenta(movimientos: Movimiento[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of movimientos) {
    const periodo = getPeriodoKey(item.fecha);
    if (periodo) counts.set(periodo, (counts.get(periodo) || 0) + 1);
  }
  return counts;
}
