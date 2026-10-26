/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from "react";
import { ArchiveRestore, RefreshCw, Search, Trash2, AlertCircle, Loader2, X, CheckCircle2 } from "lucide-react";
import { firestoreService } from "../lib/firebase";
import { PapeleraItem, PapeleraTipo } from "../types";

const TYPE_LABELS: Record<PapeleraTipo, string> = {
  cliente: "Cliente",
  drop: "Drop",
  venta: "Venta",
  movimiento: "Movimiento",
  compra: "Compra",
  gasto: "Gasto",
  producto: "Producto",
  almacen: "Almacén",
  categoria: "Categoría",
  marca: "Marca",
  color: "Color",
  talla_ropa: "Talla de ropa",
  talla_calzado: "Talla de calzado",
  unidad: "Unidad",
  ubicacion_entrega: "Ubicación de entrega",
  repartidor: "Persona que entrega"
};

export default function Papelera() {
  const [items, setItems] = useState<PapeleraItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<PapeleraTipo | "todos">("todos");
  const [restoringKey, setRestoringKey] = useState<string | null>(null);
  const [showEmptyConfirm, setShowEmptyConfirm] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [emptying, setEmptying] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const loadItems = async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await firestoreService.getPapeleraItems());
    } catch (err: any) {
      console.error("Error al cargar Papelera:", err);
      setError(err?.message || "No se pudo cargar la Papelera.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter(item => {
      if (typeFilter !== "todos" && item.tipo !== typeFilter) return false;
      if (!term) return true;
      return `${item.titulo} ${item.detalle} ${TYPE_LABELS[item.tipo]}`.toLowerCase().includes(term);
    });
  }, [items, search, typeFilter]);

  const restoreItem = async (item: PapeleraItem) => {
    if (!window.confirm(`¿Restaurar ${TYPE_LABELS[item.tipo].toLowerCase()} “${item.titulo}”? Volverá a estar activo en el sistema.`)) return;
    setRestoringKey(item.key);
    setError(null);
    try {
      await firestoreService.restaurarPapeleraItem(item);
      setItems(current => current.filter(entry => entry.key !== item.key));
    } catch (err: any) {
      setError(err?.message || "No se pudo restaurar el registro.");
    } finally {
      setRestoringKey(null);
    }
  };

  const emptyTrash = async () => {
    if (confirmationText.trim().toUpperCase() !== "VACIAR" || emptying) return;
    setEmptying(true);
    setError(null);
    setSuccess(null);
    try {
      const deletedCount = await firestoreService.vaciarPapelera();
      setItems([]);
      setSearch("");
      setTypeFilter("todos");
      setShowEmptyConfirm(false);
      setConfirmationText("");
      setSuccess(
        deletedCount === 1
          ? "Se eliminó permanentemente 1 documento de la Papelera."
          : `Se eliminaron permanentemente ${deletedCount} documentos de la Papelera.`
      );
    } catch (err: any) {
      console.error("Error al vaciar la Papelera:", err);
      const message = err?.message || "No se pudo vaciar la Papelera.";
      await loadItems();
      setError(message);
    } finally {
      setEmptying(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-3.5 sm:px-5 lg:px-6 py-5 space-y-6" id="papelera-page">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Trash2 className="h-6 w-6 text-zinc-500" />
            <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-white">Papelera</h1>
          </div>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Registros desactivados que puedes restaurar o eliminar definitivamente.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button type="button" onClick={loadItems} disabled={loading || emptying} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </button>
          <button type="button" onClick={() => { setShowEmptyConfirm(true); setConfirmationText(""); setError(null); }} disabled={loading || emptying || items.length === 0 || restoringKey !== null} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed">
            <Trash2 className="h-4 w-4" />
            Vaciar papelera
          </button>
        </div>
      </div>

      {success && (
        <div className="flex items-start gap-2 p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300" role="status">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="text-sm">{success}</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300" role="alert">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <label className="relative flex-1">
          <span className="sr-only">Buscar en Papelera</span>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar registro..." className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </label>
        <select value={typeFilter} onChange={event => setTypeFilter(event.target.value as PapeleraTipo | "todos")} className="px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
          <option value="todos">Todos los tipos</option>
          {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="grid gap-3" aria-label="Cargando Papelera">
          {[1, 2, 3].map(item => <div key={item} className="h-20 rounded-xl bg-zinc-100 dark:bg-zinc-800 animate-pulse" />)}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="py-16 text-center rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700">
          <Trash2 className="h-9 w-9 mx-auto text-zinc-300 dark:text-zinc-600" />
          <h2 className="mt-3 font-semibold text-zinc-800 dark:text-zinc-200">{items.length === 0 ? "La Papelera está vacía" : "No hay coincidencias"}</h2>
          <p className="mt-1 text-sm text-zinc-500">{items.length === 0 ? "Los registros que desactives aparecerán aquí." : "Prueba con otra búsqueda o tipo de registro."}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredItems.map(item => (
            <div key={item.key} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">{TYPE_LABELS[item.tipo]}</span>
                  {item.fecha && <span className="text-xs text-zinc-400">{item.fecha.toLocaleString("es-MX")}</span>}
                </div>
                <h3 className="mt-2 font-semibold text-zinc-900 dark:text-white truncate">{item.titulo}</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate">{item.detalle}</p>
              </div>
              <button type="button" onClick={() => restoreItem(item)} disabled={restoringKey !== null} className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                <ArchiveRestore className={`h-4 w-4 ${restoringKey === item.key ? "animate-pulse" : ""}`} />
                {restoringKey === item.key ? "Restaurando..." : "Restaurar"}
              </button>
            </div>
          ))}
        </div>
      )}

      {showEmptyConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="empty-trash-title">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300">
                  <Trash2 className="h-5 w-5" />
                </span>
                <div>
                  <h2 id="empty-trash-title" className="text-lg font-bold text-zinc-900 dark:text-white">Vaciar papelera</h2>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Se eliminarán definitivamente todos los registros de la Papelera.</p>
                </div>
              </div>
              <button type="button" onClick={() => { if (!emptying) { setShowEmptyConfirm(false); setConfirmationText(""); } }} disabled={emptying} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" aria-label="Cerrar confirmación">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
              <strong>{items.length} {items.length === 1 ? "registro visible" : "registros visibles"}</strong>. Esta acción no puede deshacerse. No se modificará nuevamente el inventario porque estos registros ya fueron desactivados previamente.
            </div>

            <label className="mt-4 block text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Escribe <span className="font-mono text-rose-600 dark:text-rose-400">VACIAR</span> para confirmar
              <input autoFocus value={confirmationText} onChange={event => setConfirmationText(event.target.value)} disabled={emptying} className="mt-2 w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2.5 text-sm font-mono uppercase outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-60" placeholder="VACIAR" />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => { setShowEmptyConfirm(false); setConfirmationText(""); }} disabled={emptying} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50">Cancelar</button>
              <button type="button" onClick={emptyTrash} disabled={confirmationText.trim().toUpperCase() !== "VACIAR" || emptying} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {emptying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {emptying ? "Eliminando..." : "Eliminar definitivamente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
