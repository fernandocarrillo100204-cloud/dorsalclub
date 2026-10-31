import type { Movimiento, PedidoVenta, Venta } from "../types";

export const fechaRegistro = (value: any): Date => {
  const date = value instanceof Date ? value
    : typeof value?.toDate === "function" ? value.toDate()
    : typeof value?.seconds === "number" ? new Date(value.seconds * 1000)
    : new Date(value ?? NaN);
  return Number.isFinite(date.getTime()) ? date : new Date(0);
};

export const fechaLocal = (value: Date): string =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

const amount = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const active = (item: { estado?: string; en_papelera?: boolean }) =>
  item.estado !== "anulado" && item.estado !== "devuelto" && item.en_papelera !== true;

export const leerMovimiento = (id: string, data: any): Movimiento => ({
  ...data,
  id,
  fecha: fechaRegistro(data.fecha),
  cantidad: amount(data.cantidad),
  referencia: String(data.referencia || ""),
  usuario: String(data.usuario || ""),
  estado: data.estado || "activo",
  ...(data.anulado_at ? { anulado_at: fechaRegistro(data.anulado_at) } : {})
});

export const leerVenta = (id: string, data: any): Venta => ({
  ...data,
  id,
  folio: String(data.folio || id),
  fecha: fechaRegistro(data.fecha),
  fecha_str: data.fecha_str || fechaLocal(fechaRegistro(data.fecha)),
  items: Array.isArray(data.items) ? data.items.filter(Boolean).map((item: any) => ({
    ...item, sku: String(item.sku || ""), cantidad: amount(item.cantidad),
    precio_unitario: amount(item.precio_unitario), costo_unitario: amount(item.costo_unitario),
    total: amount(item.total), costo_total: amount(item.costo_total)
  })) : [],
  pagos: Array.isArray(data.pagos) ? data.pagos.filter(Boolean).map((pago: any) => ({
    ...pago, monto: amount(pago.monto), fecha: fechaRegistro(pago.fecha), estado: pago.estado || "activo"
  })) : [],
  subtotal: amount(data.subtotal), total: amount(data.total), recibido: amount(data.recibido), saldo: amount(data.saldo),
  total_unidades: amount(data.total_unidades), envio_cobrado_cliente: amount(data.envio_cobrado_cliente),
  otros_cargos_cliente: amount(data.otros_cargos_cliente), costo_envio_venta: amount(data.costo_envio_venta),
  otros_costos_venta: amount(data.otros_costos_venta), costo_mercancia: amount(data.costo_mercancia),
  costos_totales: amount(data.costos_totales), porcentaje_precio: amount(data.porcentaje_precio),
  anticipo_porcentaje: amount(data.anticipo_porcentaje),
  afecta_stock: data.afecta_stock !== false,
  cliente_nombre: String(data.cliente_nombre || "Venta sin cliente / Mostrador"),
  canal_venta: data.canal_venta || "stock", canal_venta_nombre: data.canal_venta_nombre || "Venta directa",
  estado: data.estado || "activo", estado_pago: data.estado_pago || "pendiente",
  creado_at: fechaRegistro(data.creado_at || data.fecha), actualizado_at: fechaRegistro(data.actualizado_at || data.fecha),
  ...(data.entregado_at ? { entregado_at: fechaRegistro(data.entregado_at) } : {}),
  ...(data.anulado_at ? { anulado_at: fechaRegistro(data.anulado_at) } : {})
});

/** Una única reconstrucción para la ficha del cliente y el tablero de pedidos. */
export const construirPedidos = (ventas: Venta[], movimientos: Movimiento[]): PedidoVenta[] => {
  // Incluye también maestros anulados/archivados para que sus partidas antiguas no reaparezcan.
  const masterIds = new Set(ventas.map(item => item.id));
  const groups = new Map<string, Movimiento[]>();
  const events = new Map<string, Movimiento[]>();
  movimientos.filter(active).forEach(item => {
    if (item.venta_relacionada_id) {
      events.set(item.venta_relacionada_id, [...(events.get(item.venta_relacionada_id) || []), item]);
    } else if (item.venta_id && !masterIds.has(item.venta_id) && item.afecta_stock === false &&
      (item.canal_venta === "bajo_pedido" || item.canal_venta === "mayoreo")) {
      groups.set(item.venta_id, [...(groups.get(item.venta_id) || []), item]);
    }
  });
  const legacy: PedidoVenta[] = [];
  groups.forEach((items, ventaId) => {
    const ordered = [...items].sort((a, b) => (a.venta_partida || 0) - (b.venta_partida || 0));
    const first = ordered[0];
    const saleEvents = (events.get(ventaId) || []).sort((a, b) => fechaRegistro(a.fecha).getTime() - fechaRegistro(b.fecha).getTime());
    if (saleEvents.some(item => item.subtipo === "reembolso_venta")) return;
    const tracking = [...saleEvents].reverse().find(item => item.subtipo === "seguimiento_pedido");
    const total = typeof first.venta_total_cobrado === "number" ? first.venta_total_cobrado
      : ordered.reduce((sum, item) => sum + amount(item.total_cobrado ?? item.total_venta), 0);
    const initial = typeof first.venta_total_recibido === "number" ? first.venta_total_recibido
      : ordered.reduce((sum, item) => sum + amount(item.ingreso_reconocido), 0);
    const recibido = Math.min(total, money(Math.max(0, initial) + saleEvents.filter(item => item.subtipo === "abono_venta")
      .reduce((sum, item) => sum + Math.max(0, amount(item.ingreso_reconocido)), 0)));
    const saldo = Math.max(0, money(total - recibido));
    legacy.push({
      venta_id: ventaId, es_consolidado: false, folio: first.folio || ventaId,
      cliente_id: first.cliente_id, cliente_nombre: first.cliente_nombre || "Cliente sin nombre",
      canal_venta: first.canal_venta as PedidoVenta["canal_venta"],
      canal_venta_nombre: first.canal_venta_nombre || (first.canal_venta === "mayoreo" ? "Mayoreo" : "Bajo pedido"),
      fecha: fechaRegistro(first.fecha), total, recibido, saldo,
      estado: tracking?.pedido_estado === "entregado" || first.pedido_estado === "entregado" ? "entregado" : saldo <= 0 ? "pagado" : "pedido",
      fecha_estimada: tracking?.pedido_fecha_estimada ?? first.pedido_fecha_estimada,
      comentarios: tracking?.pedido_comentarios ?? first.pedido_comentarios ?? first.comentarios_venta,
      ubicacion_entrega_nombre: first.ubicacion_entrega_nombre, repartidor_nombre: first.repartidor_nombre,
      items: ordered.map(item => ({ sku: item.sku, cantidad: amount(item.cantidad), precio_unitario: amount(item.precio_unitario_venta), total: amount(item.total_venta) }))
    });
  });
  const masters: PedidoVenta[] = ventas.filter(item => active(item) && item.afecta_stock === false &&
    (item.canal_venta === "bajo_pedido" || item.canal_venta === "mayoreo")).map(item => ({
    venta_id: item.id, es_consolidado: true, folio: item.folio, cliente_id: item.cliente_id,
    cliente_nombre: item.cliente_nombre, canal_venta: item.canal_venta as PedidoVenta["canal_venta"],
    canal_venta_nombre: item.canal_venta_nombre, fecha: fechaRegistro(item.fecha), total: item.total,
    recibido: item.recibido, saldo: item.saldo,
    estado: item.estado_pedido === "entregado" ? "entregado" : item.saldo <= 0 ? "pagado" : "pedido",
    fecha_estimada: item.fecha_estimada, comentarios: item.comentarios_pedido ?? item.comentarios,
    ubicacion_entrega_nombre: item.ubicacion_entrega_nombre, repartidor_nombre: item.repartidor_nombre,
    items: item.items.map(line => ({ sku: line.sku, cantidad: line.cantidad, precio_unitario: line.precio_unitario, total: line.total })), pagos: item.pagos
  }));
  return [...masters, ...legacy].sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
};
