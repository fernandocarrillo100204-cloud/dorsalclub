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

/** Solo es válido recibir el saldo completo; la diferencia se calcula en centavos. */
export function validarLiquidacionPedido(saldo: number, monto: number): number {
  const saldoCentavos = Math.round(saldo * 100);
  const montoCentavos = Math.round(monto * 100);
  if (!Number.isFinite(saldo) || saldoCentavos <= 0) {
    throw new Error("Este pedido ya está pagado.");
  }
  if (!Number.isFinite(monto) || montoCentavos !== saldoCentavos) {
    throw new Error(`Solo se permite liquidar el saldo pendiente completo de $${(saldoCentavos / 100).toFixed(2)}.`);
  }
  return saldoCentavos / 100;
}
