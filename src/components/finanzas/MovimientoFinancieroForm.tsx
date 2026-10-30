import React, { useEffect, useState } from "react";
import { AlertCircle, X } from "lucide-react";
import { firestoreService } from "../../lib/firebase";
import { OpcionListaConfigurable, TipoMovimientoFinanciero } from "../../types";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const types: Array<{ value: TipoMovimientoFinanciero; label: string; help: string }> = [
  { value: "aportacion_capital", label: "Aportación de capital", help: "Dinero que el propietario incorpora al negocio; no es una venta." },
  { value: "otro_ingreso", label: "Otro ingreso", help: "Entrada operativa que no proviene de una venta registrada." },
  { value: "retiro_propietario", label: "Retiro del propietario", help: "Dinero que sale del negocio para el propietario; no es un gasto operativo." },
  { value: "ajuste_entrada", label: "Ajuste de caja — entrada", help: "Corrección excepcional de una diferencia positiva de caja." },
  { value: "ajuste_salida", label: "Ajuste de caja — salida", help: "Corrección excepcional de una diferencia negativa de caja." }
];

export default function MovimientoFinancieroForm({ open, onClose, onSaved }: Props) {
  const [tipo, setTipo] = useState<TipoMovimientoFinanciero | "">("");
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState("");
  const [metodoPago, setMetodoPago] = useState("");
  const [notas, setNotas] = useState("");
  const [methods, setMethods] = useState<OpcionListaConfigurable[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    firestoreService.getConfiguracionListasDesplegables()
      .then(config => setMethods(config.metodos_pago_gasto.filter(item => item.activa)))
      .catch(() => setMethods([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving) onClose(); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open, saving, onClose]);

  if (!open) return null;
  const selectedType = types.find(item => item.value === tipo);
  const requiresExplanation = tipo === "ajuste_entrada" || tipo === "ajuste_salida";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!tipo) return setError("Selecciona el tipo de movimiento.");
    const parsedAmount = Number(monto);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return setError("Captura un monto mayor a cero.");
    if (!fecha) return setError("Selecciona la fecha del movimiento.");
    setSaving(true);
    try {
      await firestoreService.addMovimientoFinanciero({
        tipo,
        concepto,
        monto: parsedAmount,
        fecha: new Date(`${fecha}T12:00:00`),
        fecha_str: fecha,
        metodo_pago: metodoPago || undefined,
        notas: notas || undefined
      });
      setTipo(""); setConcepto(""); setMonto(""); setFecha(""); setMetodoPago(""); setNotas("");
      onSaved();
      onClose();
    } catch (cause: any) {
      setError(cause?.message || "No fue posible guardar el movimiento.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/55 p-4 flex items-center justify-center" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <form onSubmit={submit} className="w-full max-w-xl max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl">
        <header className="sticky top-0 bg-white dark:bg-zinc-900 flex items-start justify-between gap-4 p-5 border-b border-zinc-200 dark:border-zinc-800 z-10">
          <div><h2 className="font-bold text-zinc-900 dark:text-white">Registrar movimiento financiero</h2><p className="text-xs text-zinc-500 mt-1">Solo para movimientos que no sean ventas, compras ni gastos.</p></div>
          <button type="button" onClick={onClose} disabled={saving} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </header>
        <div className="p-5 space-y-4">
          {error && <div className="flex gap-2 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-300"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
          <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Tipo *
            <select value={tipo} onChange={event => setTipo(event.target.value as TipoMovimientoFinanciero)} className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950">
              <option value="">Seleccionar tipo</option>{types.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          {selectedType && <p className="-mt-2 text-[11px] text-zinc-500">{selectedType.help}</p>}
          <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Concepto *
            <input value={concepto} onChange={event => setConcepto(event.target.value)} maxLength={200} placeholder="Describe claramente el movimiento" className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950" />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Monto (MXN) *<input type="number" min="0.01" step="0.01" value={monto} onChange={event => setMonto(event.target.value)} className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950" /></label>
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Fecha *<input type="date" value={fecha} onChange={event => setFecha(event.target.value)} className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950" /></label>
          </div>
          <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Método de pago (opcional)
            <select value={metodoPago} onChange={event => setMetodoPago(event.target.value)} className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950"><option value="">Sin especificar</option>{methods.map(item => <option key={item.id} value={item.nombre}>{item.nombre}</option>)}</select>
          </label>
          <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Comentario {requiresExplanation ? "*" : "(opcional)"}
            <textarea value={notas} onChange={event => setNotas(event.target.value)} rows={3} maxLength={500} placeholder={requiresExplanation ? "Explica por qué es necesario el ajuste" : "Información adicional"} className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 resize-none" />
          </label>
        </div>
        <footer className="sticky bottom-0 bg-white dark:bg-zinc-900 flex justify-end gap-2 p-4 border-t border-zinc-200 dark:border-zinc-800"><button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm font-semibold">Cancelar</button><button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50">{saving ? "Guardando…" : "Guardar movimiento"}</button></footer>
      </form>
    </div>
  );
}
