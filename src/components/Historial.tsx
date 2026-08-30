/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from "react";
import { firestoreService } from "../lib/firebase";
import { Movimiento, Almacen, Producto } from "../types";
import { 
  History, 
  Search, 
  ArrowRightLeft, 
  TrendingUp, 
  TrendingDown, 
  SlidersHorizontal,
  FileSpreadsheet,
  Layers,
  User,
  Calendar,
  X,
  Ban,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Loader2,
  ShieldCheck,
  ChevronDown,
  Shirt
} from "lucide-react";

interface HistorialProps {
  almacenes: Almacen[];
  productos: Producto[];
  preselectedSku?: string;
  onClearPreselectedSku?: () => void;
}

export default function Historial({ 
  almacenes, 
  productos, 
  preselectedSku = "", 
  onClearPreselectedSku 
}: HistorialProps) {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [skuFilter, setSkuFilter] = useState(preselectedSku);
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [tipoFilter, setTipoFilter] = useState("all");
  const [estadoFilter, setEstadoFilter] = useState("all"); // "all" | "activo" | "anulado"
  
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDocCursor, setLastDocCursor] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  
  const [movToAnular, setMovToAnular] = useState<Movimiento | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");
  const [isAnulando, setIsAnulando] = useState(false);
  const [anularError, setAnularError] = useState<string | null>(null);
  const [anularSuccess, setAnularSuccess] = useState<string | null>(null);

  // Sync state with prop
  useEffect(() => {
    setSkuFilter(preselectedSku);
  }, [preselectedSku]);

  // Load first page of movements (50 items)
  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setAnularError(null);
    setFetchError(null);
    try {
      const res = await firestoreService.getMovimientosPaginated({
        pageSize: 50,
        skuFilter: skuFilter.trim() || undefined,
        warehouseFilter,
        tipoFilter,
        estadoFilter
      });
      setMovimientos(res.items);
      setLastDocCursor(res.lastDoc);
      setHasMore(res.hasMore);
    } catch (error) {
      console.error("Error al cargar historial de auditoría:", error);
      setFetchError("No se pudieron cargar los registros de auditoría.");
    } finally {
      setLoading(false);
    }
  }, [skuFilter, warehouseFilter, tipoFilter, estadoFilter]);

  // Load next page of 50 items
  const loadNextPage = async () => {
    if (!hasMore || loadingMore || !lastDocCursor) return;
    setLoadingMore(true);
    try {
      const res = await firestoreService.getMovimientosPaginated({
        pageSize: 50,
        lastDoc: lastDocCursor,
        skuFilter: skuFilter.trim() || undefined,
        warehouseFilter,
        tipoFilter,
        estadoFilter
      });
      setMovimientos(prev => [...prev, ...res.items]);
      setLastDocCursor(res.lastDoc);
      setHasMore(res.hasMore);
    } catch (error) {
      console.error("Error al cargar más registros:", error);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  // Execute Anulación
  const handleConfirmAnulacion = async () => {
    if (!movToAnular || !movToAnular.id) return;
    setIsAnulando(true);
    setAnularError(null);
    try {
      const reason = motivoAnulacion.trim() || "Anulación solicitada por el usuario";
      await firestoreService.anularMovimiento(movToAnular.id, reason);
      
      // Update local state without losing pagination position
      setMovimientos(prev => prev.map(m => {
        if (m.id === movToAnular.id) {
          return {
            ...m,
            estado: "anulado",
            anulado_at: new Date(),
            motivo_anulacion: reason
          };
        }
        return m;
      }));

      setAnularSuccess(`Movimiento ${movToAnular.folio || movToAnular.id} anulado correctamente. El stock ha sido revertido.`);
      setTimeout(() => setAnularSuccess(null), 5000);
      setMovToAnular(null);
      setMotivoAnulacion("");
    } catch (error: any) {
      console.error("Error al anular movimiento:", error);
      setAnularError(error.message || "No se pudo anular el movimiento. Verifica el stock disponible para reversión.");
    } finally {
      setIsAnulando(false);
    }
  };

  // Helper product info
  const getProductDetails = (sku: string) => {
    const prod = productos.find(p => p.sku.toLowerCase() === sku.toLowerCase());
    return prod || null;
  };

  // Helper warehouse name
  const getWarehouseName = (id: string): string => {
    const alm = almacenes.find(a => a.id === id);
    return alm ? alm.nombre : "Desconocido";
  };

  return (
    <div className="max-w-7xl mx-auto px-3.5 sm:px-5 lg:px-6 py-5 space-y-6" id="historial-container">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight leading-tight">
            Historial de Auditoría
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Registro transaccional paginado. Anula movimientos con reversión atómica de stock y trazabilidad completa.
          </p>
        </div>
        <div className="shrink-0 flex items-center space-x-2">
          <button
            onClick={loadFirstPage}
            className="text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white font-semibold px-3 py-2 rounded-xl transition-colors inline-flex items-center space-x-1.5 shadow-xs"
            title="Refrescar registro de auditoría"
          >
            <History className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Refrescar Registro</span>
          </button>
        </div>
      </div>

      {/* Preselection notice if navigated from Dashboard */}
      {preselectedSku && (
        <div className="p-3 bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Shirt className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
            <span>
              Filtrando auditoría para SKU: <strong className="font-mono text-zinc-900 dark:text-white">{preselectedSku}</strong>
            </span>
          </div>
          {onClearPreselectedSku && (
            <button
              onClick={() => {
                onClearPreselectedSku();
                setSkuFilter("");
              }}
              className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            >
              Ver todos
            </button>
          )}
        </div>
      )}

      {/* Feedback alerts */}
      {anularSuccess && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="font-semibold">{anularSuccess}</span>
        </div>
      )}
      {anularError && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="font-semibold">{anularError}</span>
        </div>
      )}
      {fetchError && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 rounded-xl text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="font-semibold">{fetchError}</span>
          </div>
          <button
            onClick={loadFirstPage}
            className="font-semibold underline text-amber-800 dark:text-amber-200 hover:opacity-80"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* SKU filter */}
          <div className="relative flex items-center">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-zinc-400">
              <Search className="h-4 w-4" />
            </span>
            <input
              type="text"
              placeholder="Filtrar por SKU exacto..."
              value={skuFilter}
              onChange={(e) => setSkuFilter(e.target.value)}
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-xl py-2 pl-9 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition-colors"
            />
          </div>

          {/* Warehouse Filter */}
          <div className="relative flex items-center">
            <select
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-xl py-2 px-3 text-xs focus:outline-none font-medium"
            >
              <option value="all">Todos los almacenes</option>
              {almacenes.map(alm => (
                <option key={alm.id} value={alm.id}>
                  {alm.nombre} ({alm.ubicacion})
                </option>
              ))}
            </select>
          </div>

          {/* Type Filter */}
          <div className="relative flex items-center">
            <select
              value={tipoFilter}
              onChange={(e) => setTipoFilter(e.target.value)}
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-xl py-2 px-3 text-xs focus:outline-none font-medium"
            >
              <option value="all">Todas las operaciones</option>
              <option value="entrada">Compras y Entradas</option>
              <option value="salida">Ventas</option>
              <option value="transferencia">Transferencias</option>
              <option value="ajuste">Ajustes</option>
            </select>
          </div>

          {/* Estado Filter */}
          <div className="relative flex items-center">
            <select
              value={estadoFilter}
              onChange={(e) => setEstadoFilter(e.target.value)}
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-xl py-2 px-3 text-xs focus:outline-none font-medium"
            >
              <option value="all">Todos los estados</option>
              <option value="activo">Solo Activos</option>
              <option value="anulado">Solo Anulados</option>
            </select>
          </div>
        </div>
      </div>

      {/* Movements Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="py-14 text-center text-zinc-400">
            <span className="h-6 w-6 border-2 border-zinc-900 dark:border-white border-t-transparent rounded-full animate-spin inline-block mb-2" />
            <p className="text-xs">Cargando registros de auditoría...</p>
          </div>
        ) : movimientos.length === 0 ? (
          <div className="py-12 text-center text-zinc-400 space-y-2">
            <History className="h-10 w-10 mx-auto text-zinc-300 dark:text-zinc-600" />
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">No hay movimientos registrados</p>
            <p className="text-xs">Los movimientos registrados aparecerán aquí con su folio y trazabilidad.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" id="tabla-historial">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 font-semibold text-[11px] uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800">
                  <th className="py-3 px-3">Folio</th>
                  <th className="py-3 px-3">Estado</th>
                  <th className="py-3 px-3">Fecha</th>
                  <th className="py-3 px-3">Prenda & SKU</th>
                  <th className="py-3 px-3">Color / Talla</th>
                  <th className="py-3 px-3">Almacén</th>
                  <th className="py-3 px-3">Tipo</th>
                  <th className="py-3 px-3 text-center">Cant.</th>
                  <th className="py-3 px-3">Referencia</th>
                  <th className="py-3 px-3">Usuario</th>
                  <th className="py-3 px-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs">
                {movimientos.map((mov) => {
                  const isAnulado = mov.estado === "anulado";
                  const prod = getProductDetails(mov.sku);

                  let dateStr = "—";
                  const rawDate = mov.fecha || mov.creado_at;
                  if (rawDate) {
                    const d = rawDate instanceof Date ? rawDate : (rawDate as any).toDate ? (rawDate as any).toDate() : new Date(rawDate);
                    dateStr = d.toLocaleString("es-ES", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    });
                  }

                  let badgeColorClass = "";
                  let typeLabel = "";
                  let qtyPrefix = "";
                  let qtyColorClass = "";

                  switch (mov.tipo) {
                    case "entrada":
                      if (mov.compra_id || (mov.referencia && mov.referencia.startsWith("Compra COMP-"))) {
                        badgeColorClass = isAnulado 
                          ? "bg-zinc-100 text-zinc-400" 
                          : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800";
                        typeLabel = "Compra";
                      } else {
                        badgeColorClass = isAnulado 
                          ? "bg-zinc-100 text-zinc-400" 
                          : "bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-400 border border-teal-200 dark:border-teal-800";
                        typeLabel = "Entrada manual";
                      }
                      qtyPrefix = "+";
                      qtyColorClass = isAnulado ? "text-zinc-400 line-through" : "text-emerald-600 dark:text-emerald-400 font-bold";
                      break;
                    case "salida":
                      badgeColorClass = isAnulado 
                        ? "bg-zinc-100 text-zinc-400" 
                        : "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 border border-rose-200 dark:border-rose-800";
                      typeLabel = "Venta";
                      qtyPrefix = "-";
                      qtyColorClass = isAnulado ? "text-zinc-400 line-through" : "text-rose-600 dark:text-rose-400 font-bold";
                      break;
                    case "transferencia":
                      badgeColorClass = isAnulado 
                        ? "bg-zinc-100 text-zinc-400" 
                        : "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-400 border border-sky-200 dark:border-sky-800";
                      typeLabel = "Transferencia";
                      qtyPrefix = "⇆";
                      qtyColorClass = isAnulado ? "text-zinc-400 line-through" : "text-sky-600 dark:text-sky-400 font-semibold";
                      break;
                    case "ajuste":
                      badgeColorClass = isAnulado 
                        ? "bg-zinc-100 text-zinc-400" 
                        : "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border border-amber-200 dark:border-amber-800";
                      typeLabel = "Ajuste";
                      qtyPrefix = "±";
                      qtyColorClass = isAnulado ? "text-zinc-400 line-through" : "text-amber-600 dark:text-amber-400 font-semibold";
                      break;
                  }

                  return (
                    <tr 
                      key={mov.id} 
                      className={`transition-colors ${
                        isAnulado 
                          ? "bg-rose-50/20 dark:bg-rose-950/10 opacity-70 hover:opacity-100" 
                          : "hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40"
                      }`}
                    >
                      {/* Folio */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold border ${
                          isAnulado
                            ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 border-zinc-300 dark:border-zinc-700 line-through"
                            : "bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white"
                        }`}>
                          {mov.folio || "—"}
                        </span>
                      </td>

                      {/* Estado */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {isAnulado ? (
                          <span 
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/80 gap-1"
                            title={mov.motivo_anulacion ? `Motivo: ${mov.motivo_anulacion}` : "Movimiento Anulado"}
                          >
                            <Ban className="h-3 w-3" />
                            <span>Anulado</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>Activo</span>
                          </span>
                        )}
                      </td>

                      {/* Date & Time */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex items-center space-x-1.5 text-zinc-500 dark:text-zinc-400 text-xs">
                          <Calendar className="h-3 w-3 shrink-0" />
                          <span className="font-medium">{dateStr}</span>
                        </div>
                      </td>

                      {/* Product details */}
                      <td className="py-3 px-3">
                        <div className={`font-bold text-zinc-900 dark:text-white leading-tight ${isAnulado ? "line-through text-zinc-400" : ""}`}>
                          {prod ? prod.nombre : mov.sku}
                        </div>
                        <div className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                          {mov.sku}
                        </div>
                      </td>

                      {/* Color / Talla */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {prod ? (
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-zinc-700 dark:text-zinc-300 font-medium">{prod.color || "—"}</span>
                            <span className="text-zinc-400">•</span>
                            <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-bold text-[11px]">
                              {prod.talla || "U"}
                            </span>
                          </div>
                        ) : (
                          <span className="text-zinc-400 text-xs">—</span>
                        )}
                      </td>

                      {/* Origin warehouse */}
                      <td className="py-3 px-3">
                        <div className="font-medium text-zinc-900 dark:text-white text-xs">
                          {getWarehouseName(mov.almacen_id)}
                        </div>
                        {mov.tipo === "transferencia" && mov.almacen_destino_id && (
                          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center mt-0.5">
                            <span>Destino: {getWarehouseName(mov.almacen_destino_id)}</span>
                          </div>
                        )}
                      </td>

                      {/* Movement Type */}
                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${badgeColorClass}`}>
                          {typeLabel}
                        </span>
                      </td>

                      {/* Amount */}
                      <td className={`py-3 px-3 text-center font-mono ${qtyColorClass}`}>
                        {qtyPrefix} {mov.cantidad}
                      </td>

                      {/* Reference string */}
                      <td className="py-3 px-3 text-zinc-500 italic text-xs max-w-xs truncate" title={mov.referencia}>
                        {mov.referencia || "—"}
                        {isAnulado && mov.motivo_anulacion && (
                          <span className="block not-italic text-[10px] text-rose-600 dark:text-rose-400 mt-0.5 truncate font-normal">
                            Motivo: {mov.motivo_anulacion}
                          </span>
                        )}
                      </td>

                      {/* Authorized by */}
                      <td className="py-3 px-3">
                        <div className="flex items-center space-x-1.5 text-xs text-zinc-500">
                          <User className="h-3 w-3 shrink-0" />
                          <span className="truncate max-w-[120px]" title={mov.usuario}>
                            {mov.usuario ? mov.usuario.split("@")[0] : "Usuario"}
                          </span>
                        </div>
                      </td>

                      {/* Action Anular */}
                      <td className="py-3 px-3 text-right">
                        {isAnulado ? (
                          <span 
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400 py-1 px-2 cursor-not-allowed select-none"
                            title="Este movimiento ya fue anulado y su stock revertido"
                          >
                            <Ban className="h-3.5 w-3.5 opacity-50" />
                            <span>Anulado</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            id={`btn-anular-mov-${mov.id}`}
                            onClick={() => {
                              setMovToAnular(mov);
                              setMotivoAnulacion("");
                              setAnularError(null);
                            }}
                            title="Anular movimiento y revertir stock atómicamente"
                            className="p-1.5 text-zinc-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg transition-colors border border-transparent hover:border-amber-200 dark:hover:border-amber-800/80 inline-flex items-center gap-1 text-[11px] font-medium"
                          >
                            <Ban className="h-3.5 w-3.5 text-amber-600" />
                            <span className="hidden sm:inline">Anular</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500">
          <div>
            Mostrando <span className="font-semibold text-zinc-900 dark:text-white">{movimientos.length}</span> registros de auditoría.
          </div>
          {hasMore && (
            <button
              onClick={loadNextPage}
              disabled={loadingMore}
              className="px-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 inline-flex items-center gap-2"
            >
              {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Cargar 50 movimientos más</span>
            </button>
          )}
        </div>
      </div>

      {/* Modal Confirm Anulación */}
      {movToAnular && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  Confirmar Anulación de Movimiento
                </h3>
                <p className="text-xs text-zinc-500 font-mono">
                  {movToAnular.folio || movToAnular.id}
                </p>
              </div>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Esta acción revertirá automáticamente el stock de <strong>{movToAnular.sku}</strong> en el almacén de origen y registrará el movimiento como anulado de forma permanente.
            </p>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Motivo de la anulación *
              </label>
              <input
                type="text"
                required
                placeholder="Ej. Error de captura, producto devuelto..."
                value={motivoAnulacion}
                onChange={(e) => setMotivoAnulacion(e.target.value)}
                className="w-full px-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white focus:outline-none"
              />
            </div>

            {anularError && (
              <p className="text-xs text-rose-600">{anularError}</p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setMovToAnular(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isAnulando || !motivoAnulacion.trim()}
                onClick={handleConfirmAnulacion}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-xs disabled:opacity-50"
              >
                {isAnulando ? "Anulando..." : "Confirmar Anulación"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
