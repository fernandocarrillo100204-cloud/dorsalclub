import { MoneyInput } from "../ui/NumericInputs";
import React, { useCallback, useRef, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { firestoreService, getLocalDateString } from "../../lib/firebase";
import type { Gasto, Producto } from "../../types";
import { useConsulta } from "../../hooks/useConsulta";
import { useUnsavedChanges, useWorkspace } from "../../context/WorkspaceContext";
import { mensajeError } from "../../lib/errores";
import { fechaRegistro } from "../../lib/lecturasVentas";
import { PageHeader } from "../ui/Page";
import Dialog from "../ui/Dialog";
import MovimientosBalance from "./MovimientosBalance";
import ResumenBalance from "./ResumenBalance";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const inputClass = "mt-1 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none";

function GastoExtraForm({ gasto, onClose, onSaved }: { gasto: Gasto | null; onClose: () => void; onSaved: () => void }) {
  const [concepto, setConcepto] = useState(gasto?.concepto || "");
  const [monto, setMonto] = useState(gasto ? String(gasto.monto) : "");
  const [fecha, setFecha] = useState(gasto ? getLocalDateString(fechaRegistro(gasto.fecha)) : "");
  const [notas, setNotas] = useState(gasto?.notas || "");
  const initial = useRef(JSON.stringify([concepto, monto, fecha, notas]));
  const dirty = JSON.stringify([concepto, monto, fecha, notas]) !== initial.current;
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const { confirm, notify } = useWorkspace();
  const markSaved = useUnsavedChanges(dirty, saving);
  const close = async () => {
    if (lock.current) return;
    if (dirty && !await confirm({ title: "¿Descartar cambios?", description: "El gasto no se guardará.", confirmLabel: "Descartar", danger: true })) return;
    markSaved(); onClose();
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lock.current) return;
    const amount = Number(monto), date = new Date(`${fecha}T12:00:00`);
    if (!concepto.trim() || !Number.isFinite(amount) || amount <= 0 || !fecha || !Number.isFinite(date.getTime()) || getLocalDateString(date) !== fecha) { setError("Completa el concepto, un monto mayor a cero y una fecha válida."); return; }
    lock.current = true; setSaving(true); setError("");
    try {
      const values = { concepto: concepto.trim(), monto: amount, fecha: date, fecha_str: fecha, notas: notas.trim() };
      if (gasto?.id) await firestoreService.updateGasto(gasto.id, values);
      else await firestoreService.addGasto({ ...values, categoria: "Otros", clasificacion_financiera: "operacion" });
      markSaved(); notify(gasto ? "Gasto actualizado." : "Gasto registrado.", "success"); onSaved();
    } catch (cause) { setError(mensajeError(cause, "No se pudo guardar el gasto.")); }
    finally { lock.current = false; setSaving(false); }
  };
  return <Dialog open onClose={close} busy={saving} title={gasto ? "Editar gasto extra" : "Registrar gasto extra"} description="Solo gastos que no hayas registrado en compras o ventas.">
    <form onSubmit={save} className="space-y-4">
      <label className="block text-sm font-semibold">Concepto<input autoFocus required maxLength={200} value={concepto} onChange={event => setConcepto(event.target.value)} className={inputClass} placeholder="Ej. Publicidad" disabled={saving} /></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-semibold">Monto (MXN)<MoneyInput required min="0.01"  value={monto} onChange={event => setMonto(event.target.value)} className={inputClass} disabled={saving} /></label><label className="block text-sm font-semibold">Fecha<input required type="date" value={fecha} onChange={event => setFecha(event.target.value)} className={inputClass} disabled={saving} /></label></div>
      <label className="block text-sm font-semibold">Comentario <span className="font-normal text-zinc-500">(opcional)</span><textarea value={notas} onChange={event => setNotas(event.target.value)} rows={3} className={inputClass} disabled={saving} /></label>
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      <div className="flex justify-end gap-2"><button type="button" onClick={close} disabled={saving} className="btn-secondary">Cancelar</button><button type="submit" disabled={saving} className="btn-primary">{saving ? "Guardando…" : "Guardar gasto"}</button></div>
    </form>
  </Dialog>;
}

export default function BalanceGeneral({ productos = [] }: { productos?: Producto[] }) {
  const consult = useCallback(() => firestoreService.getBalanceGeneral(), []);
  const { data, loading, refreshing, error, cargar } = useConsulta("balance-general", consult);
  const [editing, setEditing] = useState<Gasto | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const mutationLock = useRef(false);
  const { confirm, notify } = useWorkspace();
  const archive = async (gasto: Gasto) => {
    if (!gasto.id || mutationLock.current) return;
    mutationLock.current = true;
    try {
      if (!await confirm({ title: "¿Enviar gasto a papelera?", description: `${gasto.concepto} · ${money.format(gasto.monto)}. Dejará de descontarse del balance y podrás restaurarlo desde Papelera.`, confirmLabel: "Enviar a papelera", danger: true })) return;
      setBusy(true); await firestoreService.deleteGasto(gasto.id); notify("Gasto enviado a papelera.", "success"); await cargar();
    } catch (cause) { notify(mensajeError(cause, "No se pudo retirar el gasto."), "error"); }
    finally { mutationLock.current = false; setBusy(false); }
  };
  return <div className="page-shell space-y-6">
    <PageHeader eyebrow="Finanzas" title="Balance general" description="Todo el historial · MXN" actions={<><button type="button" onClick={() => cargar()} disabled={loading || refreshing || busy} className="btn-secondary" aria-label="Actualizar balance"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /></button><button type="button" onClick={() => setEditing(null)} className="btn-primary" disabled={busy}><Plus className="h-4 w-4" />Registrar gasto extra</button></>} />
    {error && <div role="alert" className="rounded-xl border border-rose-300 p-4 text-sm text-rose-600">{error}<button type="button" onClick={() => cargar()} disabled={loading || refreshing} className="ml-3 underline">Reintentar</button>{data && <p className="mt-1">Se muestran los últimos datos válidos; todavía no se pudo actualizar el balance.</p>}</div>}
    {(loading || data) && <>
      <ResumenBalance data={data} loading={loading} />
      <MovimientosBalance data={data} loading={loading} busy={busy || refreshing} productos={productos} onEdit={setEditing} onArchive={archive} />
    </>}
    {editing !== undefined && <GastoExtraForm gasto={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); cargar(); }} />}
  </div>;
}
