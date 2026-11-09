/** 
 * El porcentaje del canal propone un precio inicial, pero una cotización manual
 * de la partida tiene prioridad hasta que el vendedor decida restablecerla.
 */
export function precioPartidaTrasCambioPorcentaje(
  partida: { precioUnitario: number | string; precioManual: boolean },
  precioSugerido: number | string
): number | string {
  return partida.precioManual ? partida.precioUnitario : precioSugerido;
}
