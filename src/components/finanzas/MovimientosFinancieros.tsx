import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, Filter, Pencil, Plus, RefreshCw, Search, Trash2, XCircle } from "lucide-react";
import { firestoreService } from "../../lib/firebase";
import { MovimientoFinancieroFila } from "../../types";
import MovimientoFinancieroForm from "./MovimientoFinancieroForm";
import { fechaLocal } from "../../lib/lecturasVentas";
import { mensajeError } from "../../lib/errores";
import { downloadCsv, searchText } from "../../lib/presentation";
import { useUnsavedChanges, useWorkspace } from "../../context/WorkspaceContext";
import { FilterSummary, PageHeader } from "../ui/Page";
import Dialog from "../ui/Dialog";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export default function MovimientosFinancieros({ onNuevoGasto, onEditarGasto, navigationTabs, headerActions }: { onNuevoGasto: () => void; onEditarGasto: (id: string) => void; navigationTabs?: React.ReactNode; headerActions?: React.ReactNode }) {
  const { confirm, notify } = useWorkspace();
  const [rows, setRows] = useState<MovimientoFinancieroFila[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("todos");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [updating, setUpdating] = useState("");
  const requestRef = useRef(0);
  const mutationRef = useRef(false);
  const [annulTarget, setAnnulTarget] = useState<MovimientoFinancieroFila | null>(null);
  const [reason, setReason] = useState("");
  useUnsavedChanges(false, Boolean(updating));

  const load = useCallback(async (refresh = false) => {
    const request = ++requestRef.current;
    refresh ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const data = await firestoreService.getResumenFinancieroConsolidado({ alcance: "todo" });
      if (request !== requestRef.current) return;
      setRows(data.movimientos);
    } catch (cause: any) {
      if (request === requestRef.current) setError(mensajeError(cause, "No fue posible consultar los movimientos financieros."));
    } finally {
      if (request === requestRef.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);
  useEffect(() => { load(); return () => { requestRef.current += 1; }; }, [load]);

  const filtered = useMemo(() => rows.filter(row => {
    if (type !== "todos" && row.tipo !== type) return false;
    const day = fechaLocal(row.fecha);
    if (start && day < start) return false;
    if (end && day > end) return false;
    const term = searchText(search);
    return !term || searchText(`${row.origen} ${row.concepto} ${row.referencia || ""}`).includes(term);
  }), [rows, type, start, end, search]);

  const changeClassification = async (row: MovimientoFinancieroFila, value: "operacion" | "inversion_inicial") => {
    if (mutationRef.current) return;
    if (!row.referencia || (row.tipo !== "compra" && row.tipo !== "gasto")) return;
    mutationRef.current = true;
    setUpdating(row.id); setError("");
    try {
      await firestoreService.setClasificacionFinanciera(row.tipo, row.referencia, value);
      setRows(current => current.map(item => item.id === row.id ? { ...item, clasificacion: value } : item));
    } catch (cause: any) {
      setError(cause?.message || "No fue posible cambiar la clasificación.");
    } finally { mutationRef.current = false; setUpdating(""); }
  };

  const annul = async (row: MovimientoFinancieroFila) => {
    if (mutationRef.current || !row.id.startsWith("manual-") || !row.referencia || !reason.trim()) return;
    mutationRef.current = true;
    setUpdating(row.id); setError("");
    try { await firestoreService.anularMovimientoFinanciero(row.referencia, reason.trim()); setAnnulTarget(null); setReason(""); notify("Movimiento anulado."); await load(true); }
    catch (cause) { setError(mensajeError(cause, "No fue posible anular el movimiento.")); }
    finally { mutationRef.current = false; setUpdating(""); }
  };

  const archiveExpense = async (row: MovimientoFinancieroFila) => {
    if (mutationRef.current || row.tipo !== "gasto" || !row.editable || !row.referencia) return;
    if (!(await confirm({ title: "Enviar gasto a la papelera", description: `El gasto “${row.concepto}” dejará de aparecer en el balance. Podrás restaurarlo desde la papelera.`, confirmLabel: "Enviar a la papelera", danger: true }))) return;
    if (mutationRef.current) return;
    mutationRef.current = true;
    setUpdating(row.id); setError("");
    try { await firestoreService.deleteGasto(row.referencia); notify("Gasto enviado a la papelera."); await load(true); }
    catch (cause: any) { setError(cause?.message || "No fue posible enviar el gasto a la Papelera."); }
    finally { mutationRef.current = false; setUpdating(""); }
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Finanzas" title="Movimientos de dinero" description="Cobros, compras, gastos y capital en un solo historial. Las ventas y compras se incorporan automáticamente." actions={<>
        {headerActions}
        <button type="button" disabled={loading || !filtered.length} className="btn-secondary" onClick={() => downloadCsv("movimientos-de-dinero.csv", ["Fecha", "Tipo", "Origen", "Concepto", "Entrada MXN", "Salida MXN", "Clasificación"], filtered.map(row => [fechaLocal(row.fecha), row.tipo, row.origen, row.concepto, row.entrada, row.salida, row.clasificacion || ""]))}><Download className="h-4 w-4" />Exportar</button>
        <button type="button" onClick={() => load(true)} disabled={refreshing || loading || Boolean(updating)} className="btn-icon" aria-label="Actualizar movimientos"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /></button>
        <button type="button" onClick={() => setFormOpen(true)} disabled={Boolean(updating)} className="btn-secondary">Otro movimiento</button>
        <button type="button" onClick={onNuevoGasto} disabled={Boolean(updating)} className="btn-primary"><Plus className="h-4 w-4" />Registrar gasto</button>
      </>} />
      {navigationTabs}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[1.4fr_.8fr_.8fr_.8fr] gap-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
        <label className="relative"><Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" /><input aria-label="Buscar movimientos por concepto u origen" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar concepto u origen" className="w-full pl-9 pr-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm" /></label>
        <label className="relative"><Filter className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" /><select aria-label="Filtrar por tipo de movimiento" value={type} onChange={event => setType(event.target.value)} className="w-full pl-9 pr-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm"><option value="todos">Todos los tipos</option><option value="venta">Ventas</option><option value="compra">Compras</option><option value="gasto">Gastos</option><option value="capital">Capital</option><option value="otro_ingreso">Otros ingresos</option><option value="retiro">Retiros</option><option value="ajuste">Ajustes</option></select></label>
        <input type="date" value={start} onChange={event => setStart(event.target.value)} aria-label="Fecha inicial" className="px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm" />
        <input type="date" value={end} onChange={event => setEnd(event.target.value)} aria-label="Fecha final" className="px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm" />
      </div>
      {error && <div className="flex gap-2 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 p-4 text-sm text-rose-700 dark:text-rose-300"><AlertTriangle className="w-4 h-4 shrink-0" />{error}</div>}
      {!loading && <FilterSummary count={filtered.length} noun="movimientos" active={Boolean(search || start || end || type !== "todos")} onClear={() => { setSearch(""); setStart(""); setEnd(""); setType("todos"); }} />}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-zinc-50 dark:bg-zinc-950 text-[11px] uppercase text-zinc-500"><tr><th className="text-left px-4 py-3">Fecha</th><th className="text-left px-4 py-3">Movimiento</th><th className="text-left px-4 py-3">Origen</th><th className="text-left px-4 py-3">Concepto</th><th className="text-right px-4 py-3">Entrada</th><th className="text-right px-4 py-3">Salida</th><th className="text-left px-4 py-3">Clasificación</th><th className="px-4 py-3"></th></tr></thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">{loading ? <tr><td colSpan={8} className="p-10 text-center text-zinc-500">Cargando movimientos…</td></tr> : filtered.length === 0 ? <tr><td colSpan={8} className="p-10 text-center text-zinc-500">{error ? "No fue posible completar la consulta. Usa Actualizar para reintentar." : "No hay movimientos que coincidan con los filtros."}</td></tr> : filtered.map(row => <tr key={row.id} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/30"><td className="px-4 py-3 whitespace-nowrap">{row.fecha.toLocaleDateString("es-MX")}</td><td className="px-4 py-3 capitalize font-semibold">{row.tipo.replace("_", " ")}</td><td className="px-4 py-3 text-zinc-500">{row.origen}</td><td className="px-4 py-3 min-w-52">{row.concepto}</td><td className="px-4 py-3 text-right font-mono text-emerald-600">{row.entrada ? money.format(row.entrada) : "—"}</td><td className="px-4 py-3 text-right font-mono text-rose-600">{row.salida ? money.format(row.salida) : "—"}</td><td className="px-4 py-3">{(row.tipo === "compra" || row.tipo === "gasto") && row.editable && row.referencia ? <select aria-label={`Clasificación de ${row.concepto}`} value={row.clasificacion || "operacion"} disabled={Boolean(updating) || refreshing} onChange={event => changeClassification(row, event.target.value as "operacion" | "inversion_inicial")} className="px-2 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-xs"><option value="operacion">Operación</option><option value="inversion_inicial">Inversión inicial</option></select> : <span className="text-xs text-zinc-400">No aplica</span>}</td><td className="px-4 py-3 text-right whitespace-nowrap">{row.tipo === "gasto" && row.editable && row.referencia && <><button onClick={() => onEditarGasto(row.referencia!)} className="p-2 rounded-lg text-zinc-400 hover:text-sky-600" title="Editar gasto"><Pencil className="w-4 h-4" /></button><button onClick={() => archiveExpense(row)} disabled={Boolean(updating) || refreshing} className="p-2 rounded-lg text-zinc-400 hover:text-rose-600" title="Enviar gasto a Papelera"><Trash2 className="w-4 h-4" /></button></>}{row.id.startsWith("manual-") && <button onClick={() => { setError(""); setReason(""); setAnnulTarget(row); }} disabled={Boolean(updating) || refreshing} className="p-2 rounded-lg text-zinc-400 hover:text-rose-600" title="Anular movimiento"><XCircle className="w-4 h-4" /></button>}</td></tr>)}</tbody>
        </table></div>
      </div>
      <p className="text-xs text-zinc-500">Mostrando {filtered.length} de {rows.length} movimientos. Esta vista incluye todo el historial; los filtros solo cambian lo visible.</p>
      <MovimientoFinancieroForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={() => load(true)} />
      <Dialog open={Boolean(annulTarget)} title="Anular movimiento" description={annulTarget ? `Se excluirá “${annulTarget.concepto}” del balance. El registro se conserva con su motivo de anulación.` : undefined} busy={Boolean(updating)} onClose={() => setAnnulTarget(null)} footer={<><button type="button" className="btn-secondary" disabled={Boolean(updating)} onClick={() => setAnnulTarget(null)}>Volver</button><button type="button" className="btn-danger" disabled={Boolean(updating) || !reason.trim()} onClick={() => annulTarget && annul(annulTarget)}>{updating ? "Anulando…" : "Anular movimiento"}</button></>}>
        <label className="block text-sm font-medium">Motivo de anulación<textarea autoFocus value={reason} onChange={event => setReason(event.target.value)} maxLength={500} disabled={Boolean(updating)} rows={3} className="mt-2 w-full px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-transparent" /></label>
        {error && <p role="alert" className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      </Dialog>
    </div>
  );
}
