import type { Movimiento } from "../types";
import { fechaRegistro } from "./lecturasVentas";

/**
 * El balance es flujo de efectivo: el flete solo egresa cuando está pagado.
 * Se mantienen los demás costos asociados a la venta sin duplicarlos.
 * Los fletes históricos sin estado de pago explícito siguen pendientes.
 */
export function costoVentaEfectivamentePagado(venta: Pick<Movimiento, "costo_envio_venta" | "otros_costos_venta" | "total_costos_venta" | "estado_pago_flete">): number {
  const envio = Math.max(0, Number(venta.costo_envio_venta) || 0);
  const total = typeof venta.total_costos_venta === "number" && Number.isFinite(venta.total_costos_venta)
    ? Math.max(0, venta.total_costos_venta)
    : envio + Math.max(0, Number(venta.otros_costos_venta) || 0);
  const otros = Math.max(0, Math.round((total - envio) * 100) / 100);
  return Math.round((otros + (venta.estado_pago_flete === "pagado" ? envio : 0)) * 100) / 100;
}

export interface FleteVenta {
  id: string;
  ventaId?: string;
  folio: string;
  fecha: Date;
  costo: number;
  quienEntrega: string | null;
  ubicacionEntrega: string | null;
  cliente: string | null;
  canal: string | null;
  cubiertoCliente: number;
  estadoPago: "pagado" | "pendiente" | null;
  pagadoAt: Date | null;
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
    const cliente = (item.cliente_nombre || "").trim() || null;
    const canal = (item.canal_venta_nombre || "").trim() || null;
    const cubiertoCliente = Math.max(0, Number(item.envio_cobrado_cliente) || 0);
    const estadoPago = item.estado_pago_flete === "pagado" || item.estado_pago_flete === "pendiente"
      ? item.estado_pago_flete : null;
    const pagadoAt = item.flete_pagado_at ? fechaRegistro(item.flete_pagado_at) : null;
    const previous = grouped.get(key);
    if (previous) {
      previous.centavos += centavos;
      previous.costo = previous.centavos / 100;
      if (!previous.quienEntrega && who) previous.quienEntrega = who;
      if (!previous.ubicacionEntrega && where) previous.ubicacionEntrega = where;
      if (!previous.cliente && cliente) previous.cliente = cliente;
      if (!previous.canal && canal) previous.canal = canal;
      previous.cubiertoCliente += cubiertoCliente;
      if (!previous.estadoPago && estadoPago) previous.estadoPago = estadoPago;
      if (!previous.pagadoAt && pagadoAt) previous.pagadoAt = pagadoAt;
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
      ubicacionEntrega: where,
      cliente,
      canal,
      cubiertoCliente,
      estadoPago,
      pagadoAt
    });
  }
  return [...grouped.values()]
    .map(({ centavos: _centavos, ...flete }) => flete)
    .sort((a, b) => b.fecha.getTime() - a.fecha.getTime() || a.folio.localeCompare(b.folio, "es-MX"));
}

export function totalFletes(fletes: FleteVenta[]): number {
  return fletes.reduce((sum, item) => sum + Math.round(item.costo * 100), 0) / 100;
}

/** Los costos de flete viven en el movimiento original de venta.
 * Al editar, preservar cualquier otro costo histórico y evitar duplicar
 * egresos cuando la venta contiene varias partidas. */
export function repartirCostoFlete(
  movimientos: Movimiento[],
  nuevoCosto: number
): Array<{ id: string; costo_envio_venta: number; total_costos_venta: number; venta_total_costos: number }> {
  if (!Number.isFinite(nuevoCosto) || nuevoCosto <= 0 || nuevoCosto > 999999999.99 ||
    Math.abs(Math.round(nuevoCosto * 100) - nuevoCosto * 100) > 0.00001) {
    throw new Error("El costo del flete debe ser mayor a cero y tener máximo dos decimales.");
  }
  const originales = movimientos.filter(item =>
    item.tipo === "salida" && !item.subtipo && !item.en_papelera && item.estado !== "anulado");
  if (!originales.length || !originales.some(item => Number(item.costo_envio_venta) > 0)) {
    throw new Error("No existe un flete activo asociado a esta venta.");
  }
  const primario = originales.find(item => item.venta_partida === 1 && Number(item.costo_envio_venta) > 0) ||
    originales.find(item => Number(item.costo_envio_venta) > 0)!;
  const updates = originales.map(item => {
    const anterior = Math.max(0, Number(item.costo_envio_venta) || 0);
    const totalAnterior = typeof item.total_costos_venta === "number" ?
      Math.max(0, item.total_costos_venta) : anterior + Math.max(0, Number(item.otros_costos_venta) || 0);
    const otros = Math.max(0, Math.round((totalAnterior - anterior) * 100) / 100);
    return {
      id: item.id || "",
      costo_envio_venta: item === primario ? Math.round(nuevoCosto * 100) / 100 : 0,
      total_costos_venta: otros + (item === primario ? Math.round(nuevoCosto * 100) / 100 : 0),
      venta_total_costos: 0
    };
  });
  const totalVenta = Math.round(updates.reduce((sum, item) => sum + item.total_costos_venta, 0) * 100) / 100;
  return updates.map(item => ({ ...item, venta_total_costos: totalVenta }));
}

/** Mes del registro de entrega, en horario local. */
export function mesFlete(fecha: Date): string {
  if (!(fecha instanceof Date) || !Number.isFinite(fecha.getTime()) || fecha.getTime() === 0) return "";
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
}

export function mesesConFletes(fletes: FleteVenta[]): string[] {
  return [...new Set(fletes.map(item => mesFlete(item.fecha)).filter(Boolean))].sort().reverse();
}

export interface AdeudoRepartidor {
  repartidor: string;
  entregasPendientes: number;
  totalPendiente: number;
  entregasPagadas: number;
  totalPagado: number;
  totalFletes: number;
  importeTotal: number;
}

/** Resume todo el periodo por repartidor; fletes sin estado confirmado son pendientes.
 * Acumula en centavos para conservar importes exactos y evitar duplicaciones.
 */
export function adeudosPorRepartidor(fletes: FleteVenta[]): AdeudoRepartidor[] {
  const grouped = new Map<string, {
    repartidor: string;
    pendientes: number;
    centavosPendientes: number;
    pagados: number;
    centavosPagados: number;
  }>();
  for (const flete of fletes) {
    const repartidor = flete.quienEntrega?.trim() || "Sin repartidor asignado";
    const key = repartidor.toLocaleLowerCase("es-MX");
    const item = grouped.get(key) || { repartidor, pendientes: 0, centavosPendientes: 0, pagados: 0, centavosPagados: 0 };
    if (flete.estadoPago === "pagado") {
      item.pagados += 1;
      item.centavosPagados += Math.round(flete.costo * 100);
    } else {
      item.pendientes += 1;
      item.centavosPendientes += Math.round(flete.costo * 100);
    }
    grouped.set(key, item);
  }
  return [...grouped.values()]
    .map(item => ({
      repartidor: item.repartidor,
      entregasPendientes: item.pendientes,
      totalPendiente: item.centavosPendientes / 100,
      entregasPagadas: item.pagados,
      totalPagado: item.centavosPagados / 100,
      totalFletes: item.pendientes + item.pagados,
      importeTotal: (item.centavosPendientes + item.centavosPagados) / 100
    }))
    .sort((a, b) => b.totalPendiente - a.totalPendiente || a.repartidor.localeCompare(b.repartidor, "es-MX"));
}
