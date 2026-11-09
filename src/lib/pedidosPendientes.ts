import type { PedidoVenta } from "../types";

/**
 * El seguimiento es una bandeja de cobranza, no un archivo de entregas.
 * No altera ni borra las ventas: solo selecciona pedidos con saldo pendiente.
 */
export const pedidosPendientesPago = (pedidos: PedidoVenta[]): PedidoVenta[] =>
  pedidos.filter(pedido =>
    pedido.estado === "pedido" &&
    Number.isFinite(pedido.saldo) &&
    pedido.saldo > 0.009
  );

export const saldoPendientePedidos = (pedidos: PedidoVenta[]): number =>
  Math.round(pedidosPendientesPago(pedidos).reduce((total, pedido) => total + pedido.saldo, 0) * 100) / 100;
