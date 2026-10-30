import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Filter, Pencil, Plus, RefreshCw, Search, Trash2, XCircle } from "lucide-react";
import { firestoreService } from "../../lib/firebase";
import { MovimientoFinancieroFila } from "../../types";
import MovimientoFinancieroForm from "./MovimientoFinancieroForm";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export default function MovimientosFinancieros({ onNuevoGasto, onEditarGasto }: { onNuevoGasto: () => void; onEditarGasto: (id: string) => void }) {
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

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const data = await firestoreService.getResumenFinancieroConsolidado({ alcance: "todo" });
      setRows(data.movimientos);
    } catch (cause: any) {
      setError(cause?.message || "No fue posible consultar los movimientos financieros.");
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => rows.filter(row => {
    if (type !== "todos" && row.tipo !== type) return false;
    const day = row.fecha.toISOString().slice(0, 10);
    if (start && day < start) return false;
    if (end && day > end) return false;
    const term = search.trim().toLowerCase();
    return !term || `${row.origen} ${row.concepto} ${row.referencia || ""}`.toLowerCase().includes(term);
  }), [rows, type, start, end, search]);

  const changeClassification = async (row: MovimientoFinancieroFila, value: "operacion" | "inversion_inicial") => {
    if (!row.referencia || (row.tipo !== "compra" && row.tipo !== "gasto")) return;
    setUpdating(row.id); setError("");
    try {
      await firestoreService.setClasificacionFinanciera(row.tipo, row.referencia, value);
      setRows(current => current.map(item => item.id === row.id ? { ...item, clasificacion: value } : item));
    } catch (cause: any) {
      setError(cause?.message || "No fue posible cambiar la clasificación.");
    } finally { setUpdating(""); }
  };

  const annul = async (row: MovimientoFinancieroFila) => {
    if (!row.id.startsWith("manual-") || !row.referencia) return;
    const reason = window.prompt("Motivo de la anulación:");
    if (!reason) return;
    setUpdating(row.id); setError("");
    try { await firestoreService.anularMovimientoFinanciero(row.referencia, reason); await load(true); }
    catch (cause: any) { setError(cause?.message || "No fue posible anular el movimiento."); }
    finally { setUpdating(""); }
  };

  const archiveExpense = async (row: MovimientoFinancieroFila) => {
    if (row.tipo !== "gasto" || !row.editable || !row.referencia) return;
    if (!window.confirm(`¿Enviar el gasto "${row.concepto}" a la Papelera?`)) return;
    setUpdating(row.id); setError("");
    try { await firestoreService.deleteGasto(row.referencia); await load(true); }
    catch (cause: any) { setError(cause?.message || "No fue posible enviar el gasto a la Papelera."); }
    finally { setUpdating(""); }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Movimientos financieros</h1><p className="text-sm text-zinc-500 mt-1">Historial completo de cobros, compras, gastos, capital y ajustes. Las ventas y compras se incorporan automáticamente.</p></div>
        <div className="flex flex-wrap gap-2"><button onClick={onNuevoGasto} className="px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs font-bold">Registrar gasto</button><button onClick={() => setFormOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"><Plus className="w-4 h-4" />Otro movimiento</button><button onClick={() => load(true)} disabled={refreshing} className="p-2 rounded-xl border border-zinc-300 dark:border-zinc-700" aria-label="Actualizar"><RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} /></button></div>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[1.4fr_.8fr_.8fr_.8fr] gap-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
        <label className="relative"><Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar concepto u origen" className="w-full pl-9 pr-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm" /></label>
        <label className="relative"><Filter className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" /><select value={type} onChange={event => setType(event.target.value)} className="w-full pl-9 pr-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm"><option value="todos">Todos los tipos</option><option value="venta">Ventas</option><option value="compra">Compras</option><option value="gasto">Gastos</option><option value="capital">Capital</option><option value="otro_ingreso">Otros ingresos</option><option value="retiro">Retiros</option><option value="ajuste">Ajustes</option></select></label>
        <input type="date" value={start} onChange={event => setStart(event.target.value)} aria-label="Fecha inicial" className="px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm" />
        <input type="date" value={end} onChange={event => setEnd(event.target.value)} aria-label="Fecha final" className="px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm" />
      </div>
      {error && <div className="flex gap-2 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 p-4 text-sm text-rose-700 dark:text-rose-300"><AlertTriangle className="w-4 h-4 shrink-0" />{error}</div>}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-zinc-50 dark:bg-zinc-950 text-[11px] uppercase text-zinc-500"><tr><th className="text-left px-4 py-3">Fecha</th><th className="text-left px-4 py-3">Movimiento</th><th className="text-left px-4 py-3">Origen</th><th className="text-left px-4 py-3">Concepto</th><th className="text-right px-4 py-3">Entrada</th><th className="text-right px-4 py-3">Salida</th><th className="text-left px-4 py-3">Clasificación</th><th className="px-4 py-3"></th></tr></thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">{loading ? <tr><td colSpan={8} className="p-10 text-center text-zinc-500">Cargando movimientos…</td></tr> : filtered.length === 0 ? <tr><td colSpan={8} className="p-10 text-center text-zinc-500">No hay movimientos que coincidan con los filtros.</td></tr> : filtered.map(row => <tr key={row.id} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/30"><td className="px-4 py-3 whitespace-nowrap">{row.fecha.toLocaleDateString("es-MX")}</td><td className="px-4 py-3 capitalize font-semibold">{row.tipo.replace("_", " ")}</td><td className="px-4 py-3 text-zinc-500">{row.origen}</td><td className="px-4 py-3 min-w-52">{row.concepto}</td><td className="px-4 py-3 text-right font-mono text-emerald-600">{row.entrada ? money.format(row.entrada) : "—"}</td><td className="px-4 py-3 text-right font-mono text-rose-600">{row.salida ? money.format(row.salida) : "—"}</td><td className="px-4 py-3">{(row.tipo === "compra" || row.tipo === "gasto") && row.editable && row.referencia ? <select value={row.clasificacion || "operacion"} disabled={updating === row.id} onChange={event => changeClassification(row, event.target.value as "operacion" | "inversion_inicial")} className="px-2 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-xs"><option value="operacion">Operación</option><option value="inversion_inicial">Inversión inicial</option></select> : <span className="text-xs text-zinc-400">No aplica</span>}</td><td className="px-4 py-3 text-right whitespace-nowrap">{row.tipo === "gasto" && row.editable && row.referencia && <><button onClick={() => onEditarGasto(row.referencia!)} className="p-2 rounded-lg text-zinc-400 hover:text-sky-600" title="Editar gasto"><Pencil className="w-4 h-4" /></button><button onClick={() => archiveExpense(row)} disabled={updating === row.id} className="p-2 rounded-lg text-zinc-400 hover:text-rose-600" title="Enviar gasto a Papelera"><Trash2 className="w-4 h-4" /></button></>}{row.id.startsWith("manual-") && <button onClick={() => annul(row)} disabled={updating === row.id} className="p-2 rounded-lg text-zinc-400 hover:text-rose-600" title="Anular movimiento"><XCircle className="w-4 h-4" /></button>}</td></tr>)}</tbody>
        </table></div>
      </div>
      <p className="text-xs text-zinc-500">Mostrando {filtered.length} de {rows.length} movimientos. Esta vista incluye todo el historial; los filtros solo cambian lo visible.</p>
      <MovimientoFinancieroForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={() => load(true)} />
    </div>
  );
}
