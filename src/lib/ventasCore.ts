export interface SaleCalculationItem {
  cantidad: number;
  precio_unitario_venta: number;
  costo_unitario_venta: number;
}

export interface SaleCalculationInput {
  items: SaleCalculationItem[];
  envio_cobrado_cliente?: number;
  otros_cargos_cliente?: number;
  costo_envio_venta?: number;
  otros_costos_venta?: number;
  anticipo_porcentaje: number;
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const calculateSaleTotals = (input: SaleCalculationInput) => {
  const subtotal = money(input.items.reduce((sum, item) => sum + item.cantidad * item.precio_unitario_venta, 0));
  const costoMercancia = money(input.items.reduce((sum, item) => sum + item.cantidad * item.costo_unitario_venta, 0));
  const total = money(subtotal + (input.envio_cobrado_cliente || 0) + (input.otros_cargos_cliente || 0));
  const costosAdicionales = money((input.costo_envio_venta || 0) + (input.otros_costos_venta || 0));
  const anticipo = Math.min(100, Math.max(0, input.anticipo_porcentaje));
  const recibido = money(total * anticipo / 100);
  const saldo = money(Math.max(0, total - recibido));
  return {
    subtotal,
    costoMercancia,
    total,
    costosAdicionales,
    costosTotales: money(costoMercancia + costosAdicionales),
    recibido,
    saldo,
    estadoPago: saldo > 0 ? "anticipo" as const : "pagado" as const
  };
};
