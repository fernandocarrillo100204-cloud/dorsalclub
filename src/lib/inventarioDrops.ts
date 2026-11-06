import type { Compra, Movimiento, Venta, VentaPartidaInput } from "../types";

export interface InventarioDropFila {
  sku: string;
  nombre: string;
  compradas: number;
  vendidas: number;
  saldo: number;
  costoTotal: number;
  ventaTotal: number;
}
export interface DetalleInventarioDrop {
  compras: Compra[];
  ventas: Venta[];
  movimientos: Movimiento[];
}
export const skuNormalizado = (sku: string) => String(sku || "").trim().toUpperCase();
export const dropsDeVenta = (venta: Pick<Venta, "drop_id" | "drop_ids" | "items">): string[] =>
  [...new Set([venta.drop_id, ...(venta.drop_ids || []), ...(venta.items || []).map(item => item.drop_id)].filter((id): id is string => Boolean(id)))];
const activo = (item: { estado?: string; en_papelera?: boolean }) =>
  !item.en_papelera && !["anulado", "anulada", "devuelto"].includes(item.estado || "");

/** Una sola fórmula para Inventario y Registrar venta. No cuenta pedidos ni duplica partidas. */
export function calcularInventarioDrop(dropId: string, data: DetalleInventarioDrop): InventarioDropFila[] {
  const rows = new Map<string, InventarioDropFila>();
  const row = (sku: string) => {
    const key = skuNormalizado(sku);
    if (!rows.has(key)) rows.set(key, { sku: key, nombre: key, compradas: 0, vendidas: 0, saldo: 0, costoTotal: 0, ventaTotal: 0 });
    return rows.get(key)!;
  };
  data.compras.filter(item => item.drop_id === dropId && activo(item)).forEach(compra => {
    (compra.items || []).forEach(item => {
      const current = row(item.sku);
      current.nombre = item.nombre_producto || current.nombre;
      current.compradas += Number(item.cantidad) || 0;
      current.costoTotal += (Number(item.costo_unitario) || 0) * (Number(item.cantidad) || 0);
    });
  });
  data.movimientos.filter(item => item.drop_id === dropId && activo(item) && item.tipo === "entrada" &&
    item.afecta_stock !== false && !item.compra_id && !item.subtipo && !item.venta_relacionada_id && !item.venta_id).forEach(item => {
    const current = row(item.sku);
    current.compradas += Number(item.cantidad) || 0;
    current.costoTotal += (Number(item.costo_unitario) || 0) * (Number(item.cantidad) || 0);
  });
  const masters = new Set(data.ventas.map(venta => venta.id));
  data.ventas.filter(venta => activo(venta) && venta.afecta_stock !== false).forEach(venta => {
    (venta.items || []).filter(item => (item.drop_id || venta.drop_id) === dropId).forEach(item => {
      const current = row(item.sku);
      current.vendidas += Number(item.cantidad) || 0;
      current.ventaTotal += (Number(item.precio_unitario) || 0) * (Number(item.cantidad) || 0);
    });
  });
  // Salidas históricas sin documento maestro. Los reembolsos y abonos no son mercancía.
  data.movimientos.filter(item => item.drop_id === dropId && activo(item) && item.tipo === "salida" &&
    item.afecta_stock !== false && !item.subtipo && !(item.venta_id && masters.has(item.venta_id))).forEach(item => {
    const current = row(item.sku);
    current.vendidas += Number(item.cantidad) || 0;
    current.ventaTotal += Number(item.total_venta) || (Number(item.precio_unitario_venta) || 0) * item.cantidad;
  });
  return [...rows.values()].filter(item => item.sku).map(item => ({ ...item, saldo: item.compradas - item.vendidas }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es") || a.sku.localeCompare(b.sku));
}

export function validarDemandaDrops(items: Pick<VentaPartidaInput, "sku" | "drop_id" | "cantidad">[], inventarios: Map<string, InventarioDropFila[]>) {
  const demand = new Map<string, { drop: string; sku: string; cantidad: number }>();
  for (const item of items) {
    if (!item.drop_id) throw new Error(`Selecciona el drop de origen de ${item.sku}.`);
    const sku = skuNormalizado(item.sku);
    const key = JSON.stringify([item.drop_id, sku]);
    demand.set(key, { drop: item.drop_id, sku, cantidad: (demand.get(key)?.cantidad || 0) + item.cantidad });
  }
  demand.forEach(item => {
    const available = inventarios.get(item.drop)?.find(row => row.sku === item.sku)?.saldo || 0;
    if (available < item.cantidad) throw new Error(`Disponibilidad insuficiente de ${item.sku} en el drop seleccionado. Quedan ${Math.max(0, available)} piezas y solicitas ${item.cantidad}. Actualiza Inventario para revisar.`);
  });
}
