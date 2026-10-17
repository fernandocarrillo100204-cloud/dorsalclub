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

/**
 * Una venta solo puede anularse sin reembolso cuando nunca recibió dinero y
 * todavía no fue entregada. Los demás casos deben pasar por la devolución para
 * conservar el rastro del reembolso en Finanzas.
 */
export const requiresSaleRefund = (receivedAmount: number, orderStatus?: string): boolean =>
  Math.max(0, Number(receivedAmount) || 0) > 0.009 || orderStatus === "entregado";

export interface SaleIncomeCompositionInput {
  recognizedAmount: number;
  merchandiseSubtotal: number;
  shippingCharged?: number;
  otherCharges?: number;
}

/**
 * Distribuye una entrada (o reembolso) entre los componentes originales de
 * la venta. La asignación proporcional mantiene correcto el desglose de flujo
 * incluso cuando el cliente paga solamente un anticipo.
 */
export const allocateRecognizedSaleIncome = (input: SaleIncomeCompositionInput) => {
  const recognizedAmount = money(Number.isFinite(input.recognizedAmount) ? input.recognizedAmount : 0);
  const merchandiseSubtotal = Math.max(0, Number(input.merchandiseSubtotal) || 0);
  const shippingCharged = Math.max(0, Number(input.shippingCharged) || 0);
  const otherCharges = Math.max(0, Number(input.otherCharges) || 0);
  const saleTotal = merchandiseSubtotal + shippingCharged + otherCharges;

  if (saleTotal <= 0 || recognizedAmount === 0) {
    return { merchandise: recognizedAmount, shipping: 0, other: 0 };
  }

  const merchandise = money(recognizedAmount * merchandiseSubtotal / saleTotal);
  const shipping = money(recognizedAmount * shippingCharged / saleTotal);
  // El último componente absorbe cualquier diferencia de redondeo para que
  // la suma sea exactamente igual al importe reconocido.
  const other = money(recognizedAmount - merchandise - shipping);

  return { merchandise, shipping, other };
};

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
