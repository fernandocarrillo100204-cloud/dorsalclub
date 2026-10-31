export function mensajeError(error: unknown, fallback: string): string {
  const code = String((error as any)?.code || "").replace(/^firestore\//, "");
  if (code === "permission-denied") return "Firebase rechazó el acceso. Comprueba que las reglas publicadas correspondan a esta versión del CRM.";
  if (code === "unauthenticated") return "La sesión expiró. Inicia sesión nuevamente.";
  if (code === "unavailable" || code === "deadline-exceeded") return "No fue posible conectar con Firebase. Revisa la conexión y vuelve a intentarlo.";
  if (code === "failed-precondition") return "El índice de Firestore requerido no está habilitado. Publica los índices del proyecto y vuelve a intentarlo cuando estén listos.";
  // No mostrar URLs técnicas ni objetos de Firebase sin procesar.
  if (code) return fallback;
  return error instanceof Error ? error.message : fallback;
}
