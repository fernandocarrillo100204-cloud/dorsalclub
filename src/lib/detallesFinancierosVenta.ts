import type { Movimiento, Venta } from "../types";
import { fechaRegistro } from "./lecturasVentas";

const num = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const moneyRound = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const etiquetaUnidades = (cantidad: number): string =>
  `${cantidad} ${cantidad === 1 ? "unidad" : "unidades"}`;

export function idVentaRelacionada(registro: Movimiento): string {
  return registro.venta_id || registro.venta_relacionada_id || "";
}

export function estadoVentaActual(venta: Venta | null | undefined): string | null {
  if (!venta) return null;
  if (venta.estado === "devuelto") return "Devuelta";
  if (venta.estado === "devuelto_parcial") return "Devolución parcial";
  if (venta.estado === "anulado") return "Anulada";
  if (venta.estado_pedido === "entregado") return venta.saldo > 0.009 ? "Entregada · saldo pendiente" : "Entregada";
  return venta.estado_pago || null;
}

/** Solo se toma de la venta maestra cuando se trata del pago inicial.
 * Un abono o un reembolso puede tener un método diferente: nunca atribuirle
 * automáticamente el método del primer pago. */
export function metodoDelMovimiento(registro: Movimiento, venta: Venta | null | undefined): string | null {
  const recorded = registro.metodo_pago?.trim();
  if (recorded) return recorded;
  if (registro.subtipo) return null;
  const masterMethod = venta?.metodo_pago_inicial?.trim();
  if (masterMethod) return masterMethod;
  return venta?.pagos?.find(p => p.id === "inicial" && p.estado !== "anulado")?.metodo_pago || null;
}

export function resumenCobroVenta(registro: Movimiento, venta: Venta | null | undefined, partidas: Movimiento[]) {
  const mercancia = venta ? num(venta.subtotal) :
    typeof registro.venta_subtotal === "number" ? registro.venta_subtotal :
    partidas.reduce((total, item) => total + num(item.total_venta ?? num(item.precio_unitario_venta) * num(item.cantidad)), 0);
  const envioCliente = venta ? num(venta.envio_cobrado_cliente) : num(registro.envio_cobrado_cliente);
  const otrosHistoricos = venta ? num(venta.otros_cargos_cliente) : num(registro.otros_cargos_cliente);
  const total = venta ? num(venta.total) :
    typeof registro.venta_total_cobrado === "number" ? registro.venta_total_cobrado : mercancia + envioCliente + otrosHistoricos;
  const recibido = venta ? num(venta.recibido) : num(registro.venta_total_recibido);
  const pendiente = venta ? num(venta.saldo) :
    typeof registro.venta_saldo_pendiente === "number" ? registro.venta_saldo_pendiente : Math.max(0, total - recibido);
  return {
    mercancia: moneyRound(mercancia),
    envioCliente: moneyRound(envioCliente),
    otrosHistoricos: moneyRound(otrosHistoricos),
    total: moneyRound(total),
    recibido: moneyRound(recibido),
    pendiente: moneyRound(pendiente),
    esActual: Boolean(venta)
  };
}

export function resumenCostoEntrega(registro: Movimiento, costoMovimiento: number, venta: Venta | null | undefined) {
  // Los movimientos antiguos podían incluir otros costos junto con el flete.
  const costoEntrega = num(registro.costo_envio_venta) ||
    (venta ? num(venta.costo_envio_venta) : 0);
  const cargoCliente = venta ? num(venta.envio_cobrado_cliente) : num(registro.envio_cobrado_cliente);
  const otrosCostos = Math.max(0, moneyRound(costoMovimiento - costoEntrega));
  const absorbido = moneyRound(Math.max(0, costoMovimiento - cargoCliente));
  const excedente = moneyRound(Math.max(0, cargoCliente - costoMovimiento));
  return {
    costoEntrega: moneyRound(costoEntrega),
    cargoCliente: moneyRound(cargoCliente),
    otrosCostos,
    absorbido,
    excedente,
    costoTotal: moneyRound(costoMovimiento)
  };
}

export function fechaLegible(value: unknown): Date {
  return fechaRegistro(value);
}
