/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { 
  Receipt, 
  Plus, 
  Search, 
  Filter, 
  Calendar, 
  Building2, 
  CreditCard, 
  Tag, 
  Eye, 
  Edit, 
  Trash2, 
  X, 
  RotateCcw, 
  AlertCircle,
  Clock,
  User,
  FileText,
  DollarSign,
  ChevronDown
} from "lucide-react";
import { 
  Almacen, 
  Gasto, 
  CATEGORIAS_GASTO, 
  METODOS_PAGO_GASTO 
} from "../../types";
import { firestoreService, isRealFirebase } from "../../lib/firebase";

interface GastosHistorialProps {
  almacenes: Almacen[];
  onNuevoGasto: () => void;
  onEditarGasto: (gastoId: string) => void;
}

export default function GastosHistorial({
  almacenes,
  onNuevoGasto,
  onEditarGasto
}: GastosHistorialProps) {
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissNotice, setDismissNotice] = useState(false);

  // Filters state
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategoria, setSelectedCategoria] = useState<string>("all");
  const [selectedAlmacen, setSelectedAlmacen] = useState<string>("all");
  const [selectedMetodoPago, setSelectedMetodoPago] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [proveedorFilter, setProveedorFilter] = useState<string>("");

  // Modals state
  const [selectedGastoDetail, setSelectedGastoDetail] = useState<Gasto | null>(null);
  const [gastoToDelete, setGastoToDelete] = useState<Gasto | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Carga paginada única
  const loadInitialGastos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await firestoreService.getGastosPaginated({ pageSize: 50 });
      setGastos(res.items);
      setLastDoc(res.lastDoc);
      setHasMore(res.hasMore);
    } catch (err: any) {
      console.error("Error al cargar historial de gastos:", err);
      const isPermission = err?.code === "permission-denied" || (err?.message && (err.message.includes("permission") || err.message.includes("Missing or insufficient")));
      if (isPermission) {
        setError("Permiso denegado en Firestore. Revisa las reglas de seguridad para la colección /gastos en Firebase Console.");
      } else {
        setError("No se pudieron cargar los registros de gastos: " + (err?.message || "Error al conectar con la base de datos."));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitialGastos();
  }, [loadInitialGastos]);

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore || !lastDoc) return;
    setLoadingMore(true);
    try {
      const res = await firestoreService.getGastosPaginated({ pageSize: 50, lastDoc });
      setGastos((prev) => {
        const existingIds = new Set(prev.map((g) => g.id));
        const newItems = res.items.filter((g) => !existingIds.has(g.id));
        return [...prev, ...newItems];
      });
      setLastDoc(res.lastDoc);
      setHasMore(res.hasMore);
    } catch (err: any) {
      console.error("Error al cargar más gastos:", err);
      alert("Error al cargar la siguiente página de gastos: " + (err?.message || "Error de conexión"));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleRetry = () => {
    loadInitialGastos();
  };

  const handleResetFilters = () => {
    setSearchTerm("");
    setSelectedCategoria("all");
    setSelectedAlmacen("all");
    setSelectedMetodoPago("all");
    setStartDate("");
    setEndDate("");
    setProveedorFilter("");
  };

  const hasActiveFilters = useMemo(() => {
    return (
      searchTerm.trim() !== "" ||
      selectedCategoria !== "all" ||
      selectedAlmacen !== "all" ||
      selectedMetodoPago !== "all" ||
      startDate !== "" ||
      endDate !== "" ||
      proveedorFilter.trim() !== ""
    );
  }, [searchTerm, selectedCategoria, selectedAlmacen, selectedMetodoPago, startDate, endDate, proveedorFilter]);

  // Client-side filtering
  const filteredGastos = useMemo(() => {
    return gastos.filter((g) => {
      // Category
      if (selectedCategoria !== "all" && g.categoria !== selectedCategoria) {
        return false;
      }
      // Warehouse
      if (selectedAlmacen !== "all") {
        if (selectedAlmacen === "sin_almacen") {
          if (g.almacen_id) return false;
        } else if (g.almacen_id !== selectedAlmacen) {
          return false;
        }
      }
      // Payment method
      if (selectedMetodoPago !== "all") {
        if (selectedMetodoPago === "sin_especificar") {
          if (g.metodo_pago) return false;
        } else if (g.metodo_pago !== selectedMetodoPago) {
          return false;
        }
      }
      // Date range
      if (startDate && g.fecha_str < startDate) {
        return false;
      }
      if (endDate && g.fecha_str > endDate) {
        return false;
      }
      // Provider filter
      if (proveedorFilter.trim()) {
        const term = proveedorFilter.toLowerCase().trim();
        if (!g.proveedor || !g.proveedor.toLowerCase().includes(term)) {
          return false;
        }
      }
      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const matchesConcepto = g.concepto.toLowerCase().includes(term);
        const matchesProv = g.proveedor ? g.proveedor.toLowerCase().includes(term) : false;
        const matchesRef = g.referencia ? g.referencia.toLowerCase().includes(term) : false;
        const matchesNotas = g.notas ? g.notas.toLowerCase().includes(term) : false;
        if (!matchesConcepto && !matchesProv && !matchesRef && !matchesNotas) {
          return false;
        }
      }
      return true;
    });
  }, [gastos, selectedCategoria, selectedAlmacen, selectedMetodoPago, startDate, endDate, proveedorFilter, searchTerm]);

  // Total summary of filtered results
  const totalMontoFiltrado = useMemo(() => {
    return filteredGastos.reduce((acc, g) => acc + (Number(g.monto) || 0), 0);
  }, [filteredGastos]);

  // Delete handler
  const confirmDelete = async () => {
    if (!gastoToDelete || !gastoToDelete.id) return;
    setDeleting(true);
    try {
      await firestoreService.deleteGasto(gastoToDelete.id);
      setGastos((prev) => prev.filter((g) => g.id !== gastoToDelete.id));
      setGastoToDelete(null);
    } catch (err: any) {
      console.error("Error al eliminar gasto:", err);
      alert("No se pudo eliminar el gasto: " + (err?.message || "Error al conectar con la base de datos."));
    } finally {
      setDeleting(false);
    }
  };

  // Helper format currency
  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 2
    }).format(amount);
  };

  // Format date helper
  const formatDateDisplay = (fechaStr: string) => {
    if (!fechaStr) return "-";
    const [year, month, day] = fechaStr.split("-");
    if (!year || !month || !day) return fechaStr;
    return `${day}/${month}/${year}`;
  };

  // Badge styling for categories
  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case "Envíos y paquetería":
        return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/60";
      case "Empaque":
        return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60";
      case "Publicidad":
        return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900/60";
      case "Comisiones de plataformas":
      case "Comisiones bancarias":
        return "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900/60";
      case "Transporte y gasolina":
        return "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-900/60";
      case "Renta":
      case "Servicios":
        return "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900/60";
      case "Sueldos":
        return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60";
      case "Impuestos y aranceles":
        return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60";
      case "Devoluciones":
        return "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/60";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4 p-3 sm:p-6" id="finanzas-gastos-page">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-xl p-4 sm:p-5 shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-lg bg-[#ECFDF5] dark:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-800 text-[#059669] dark:text-emerald-400 shrink-0">
            <Receipt className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[#172033] dark:text-[#F8FAFC]">
              Gastos Operativos
            </h1>
            <p className="text-xs sm:text-sm text-[#64748B] dark:text-[#94A3B8] mt-0.5">
              Registro, consulta y administración del historial de egresos de Dorsalclub
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            id="btn-nuevo-gasto"
            onClick={onNuevoGasto}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg bg-[#059669] hover:bg-[#047857] text-white text-xs sm:text-sm font-semibold shadow-xs transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#059669]"
          >
            <Plus className="h-4 w-4" />
            <span>Registrar gasto</span>
          </button>
        </div>
      </div>

      {/* Error state if any */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-center justify-between">
          <div className="flex items-center space-x-3 text-xs sm:text-sm text-rose-800 dark:text-rose-200">
            <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={handleRetry}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-[#111827] border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-100/50"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Aviso de modo emulador local solo si Firebase no está configurado */}
      {!isRealFirebase && !dismissNotice && (
        <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between gap-3 text-amber-800 dark:text-amber-300 text-xs">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500 shrink-0" />
            <span>
              <strong>Modo de persistencia local activo:</strong> Las credenciales de Firebase no están configuradas en el entorno. La aplicación opera temporalmente con almacenamiento local en este navegador.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setDismissNotice(true)}
            className="text-amber-700 dark:text-amber-400 hover:underline shrink-0 text-xs font-medium cursor-pointer"
          >
            Entendido
          </button>
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-xl p-4 shadow-xs space-y-3">
        {/* Main Search and Quick Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Text Search */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#94A3B8]">
              <Search className="h-4 w-4" />
            </div>
            <input
              type="text"
              id="filtro-gasto-buscar"
              placeholder="Buscar en registros cargados…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#0F172A] text-xs sm:text-sm text-[#172033] dark:text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#059669] focus:border-transparent transition-all"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-[#94A3B8] hover:text-[#475569]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Categoría Filter */}
          <div>
            <select
              id="filtro-gasto-categoria"
              value={selectedCategoria}
              onChange={(e) => setSelectedCategoria(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#0F172A] text-xs sm:text-sm text-[#172033] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#059669] focus:border-transparent transition-all cursor-pointer"
            >
              <option value="all">Todas las categorías</option>
              {CATEGORIAS_GASTO.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Método de Pago Filter */}
          <div>
            <select
              id="filtro-gasto-metodo"
              value={selectedMetodoPago}
              onChange={(e) => setSelectedMetodoPago(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#0F172A] text-xs sm:text-sm text-[#172033] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#059669] focus:border-transparent transition-all cursor-pointer"
            >
              <option value="all">Todos los métodos de pago</option>
              {METODOS_PAGO_GASTO.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value="sin_especificar">Sin especificar</option>
            </select>
          </div>

          {/* Almacén Filter */}
          <div>
            <select
              id="filtro-gasto-almacen"
              value={selectedAlmacen}
              onChange={(e) => setSelectedAlmacen(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#0F172A] text-xs sm:text-sm text-[#172033] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#059669] focus:border-transparent transition-all cursor-pointer"
            >
              <option value="all">Todos los almacenes / sucursales</option>
              {almacenes.map((alm) => (
                <option key={alm.id} value={alm.id}>
                  {alm.nombre}
                </option>
              ))}
              <option value="sin_almacen">Sin almacén específico (General)</option>
            </select>
          </div>
        </div>

        {/* Secondary Date Range and Provider Filter */}
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3 pt-1 border-t border-slate-100 dark:border-slate-800/80">
          {/* Fecha Desde */}
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8] shrink-0">Desde:</span>
            <input
              type="date"
              id="filtro-gasto-fecha-inicio"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#0F172A] text-xs text-[#172033] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#059669]"
            />
          </div>

          {/* Fecha Hasta */}
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8] shrink-0">Hasta:</span>
            <input
              type="date"
              id="filtro-gasto-fecha-fin"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#0F172A] text-xs text-[#172033] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#059669]"
            />
          </div>

          {/* Proveedor text filter */}
          <div>
            <input
              type="text"
              id="filtro-gasto-proveedor"
              placeholder="Filtrar por proveedor..."
              value={proveedorFilter}
              onChange={(e) => setProveedorFilter(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#0F172A] text-xs text-[#172033] dark:text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#059669]"
            />
          </div>

          {/* Reset Filters button */}
          <div className="flex items-center justify-end">
            {hasActiveFilters && (
              <button
                type="button"
                id="btn-limpiar-filtros-gastos"
                onClick={handleResetFilters}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-[#64748B] hover:text-[#172033] dark:text-[#94A3B8] dark:hover:text-[#F8FAFC] hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Restablecer filtros</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filtered Summary strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-[#64748B] dark:text-[#94A3B8]">
        <div>
          {hasActiveFilters ? (
            <span>
              Mostrando <strong className="font-semibold text-[#172033] dark:text-[#F8FAFC]">{filteredGastos.length}</strong> de{" "}
              <strong className="font-semibold text-[#172033] dark:text-[#F8FAFC]">{gastos.length}</strong> registros cargados (filtrados)
            </span>
          ) : (
            <span>
              Mostrando <strong className="font-semibold text-[#172033] dark:text-[#F8FAFC]">{filteredGastos.length}</strong> de{" "}
              <strong className="font-semibold text-[#172033] dark:text-[#F8FAFC]">{gastos.length}</strong> registros cargados
            </span>
          )}
        </div>
        <div className="flex items-center space-x-1.5">
          <span>Total en vista:</span>
          <span className="font-bold text-sm text-[#172033] dark:text-[#F8FAFC] font-mono">
            {formatMoney(totalMontoFiltrado)}
          </span>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#182235]/60 border-b border-[#E2E8F0] dark:border-[#263449] text-[#475569] dark:text-[#94A3B8] font-semibold text-[11px] uppercase tracking-wider">
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-4">Concepto / Descripción</th>
                <th className="py-3 px-4">Categoría</th>
                <th className="py-3 px-4">Método</th>
                <th className="py-3 px-4">Almacén</th>
                <th className="py-3 px-4">Proveedor</th>
                <th className="py-3 px-4 text-right">Monto (MXN)</th>
                <th className="py-3 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#263449]/60 text-[#172033] dark:text-[#F8FAFC]">
              {loading ? (
                // Skeletons inside table for polite initial loading (NO large spinners)
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={`skeleton-${idx}`} className="animate-pulse">
                    <td className="py-3.5 px-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-20" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-48" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-24" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-20" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-24" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-24" /></td>
                    <td className="py-3.5 px-4 text-right"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-16 ml-auto" /></td>
                    <td className="py-3.5 px-4 text-center"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-16 mx-auto" /></td>
                  </tr>
                ))
              ) : filteredGastos.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 px-4 text-center">
                    <div className="max-w-sm mx-auto space-y-3">
                      <div className="h-10 w-10 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[#64748B]">
                        <Receipt className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-semibold text-[#172033] dark:text-[#F8FAFC]">
                        No se encontraron registros de gastos
                      </p>
                      <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                        {hasActiveFilters
                          ? "Intenta cambiar o limpiar los filtros seleccionados para ver más resultados."
                          : "Comienza registrando el primer egreso operativo de la empresa."}
                      </p>
                      {hasActiveFilters ? (
                        <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                          <button
                            type="button"
                            onClick={handleResetFilters}
                            className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-[#059669] hover:text-[#047857] hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg transition-colors cursor-pointer"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            <span>Restablecer filtros</span>
                          </button>
                          {hasMore && (
                            <button
                              type="button"
                              onClick={handleLoadMore}
                              disabled={loadingMore}
                              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-[#172033] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#0F172A] hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <ChevronDown className="h-3.5 w-3.5 text-[#64748B] dark:text-[#94A3B8]" />
                              <span>Cargar más de Firestore</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={onNuevoGasto}
                          className="mt-2 inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#059669] text-white hover:bg-[#047857] shadow-xs"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Registrar gasto</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredGastos.map((gasto) => (
                  <tr 
                    key={gasto.id} 
                    className="hover:bg-slate-50/80 dark:hover:bg-[#182235]/40 transition-colors"
                  >
                    {/* Fecha */}
                    <td className="py-3 px-4 font-mono text-xs text-[#64748B] dark:text-[#94A3B8] whitespace-nowrap">
                      {formatDateDisplay(gasto.fecha_str)}
                    </td>

                    {/* Concepto */}
                    <td className="py-3 px-4">
                      <div className="font-medium text-[#172033] dark:text-[#F8FAFC] max-w-xs truncate" title={gasto.concepto}>
                        {gasto.concepto}
                      </div>
                      {gasto.referencia && (
                        <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate mt-0.5">
                          Ref: {gasto.referencia}
                        </div>
                      )}
                    </td>

                    {/* Categoría */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${getCategoryColor(gasto.categoria)}`}>
                        {gasto.categoria}
                      </span>
                    </td>

                    {/* Método de Pago */}
                    <td className="py-3 px-4 text-xs text-[#64748B] dark:text-[#94A3B8] whitespace-nowrap">
                      {gasto.metodo_pago || <span className="italic text-slate-400 dark:text-slate-500">Sin especificar</span>}
                    </td>

                    {/* Almacén */}
                    <td className="py-3 px-4 text-xs text-[#64748B] dark:text-[#94A3B8] whitespace-nowrap">
                      {gasto.almacen_nombre || (gasto.almacen_id ? "Almacén asignado" : <span className="italic text-slate-400">General</span>)}
                    </td>

                    {/* Proveedor */}
                    <td className="py-3 px-4 text-xs text-[#64748B] dark:text-[#94A3B8] whitespace-nowrap">
                      {gasto.proveedor || <span className="text-slate-300 dark:text-slate-600">-</span>}
                    </td>

                    {/* Monto */}
                    <td className="py-3 px-4 text-right whitespace-nowrap font-mono font-semibold text-[#172033] dark:text-[#F8FAFC]">
                      {formatMoney(gasto.monto)}
                    </td>

                    {/* Acciones */}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center space-x-1">
                        {/* Ver Detalle */}
                        <button
                          type="button"
                          id={`btn-ver-gasto-${gasto.id}`}
                          onClick={() => setSelectedGastoDetail(gasto)}
                          title="Ver detalle del gasto"
                          aria-label="Ver detalle del gasto"
                          className="p-1.5 text-[#64748B] hover:text-[#172033] dark:text-[#94A3B8] dark:hover:text-[#F8FAFC] hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                        >
                          <Eye className="h-4 w-4" />
                        </button>

                        {/* Editar */}
                        <button
                          type="button"
                          id={`btn-editar-gasto-${gasto.id}`}
                          onClick={() => gasto.id && onEditarGasto(gasto.id)}
                          title="Editar gasto"
                          aria-label="Editar gasto"
                          className="p-1.5 text-[#64748B] hover:text-[#059669] dark:text-[#94A3B8] dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-md transition-colors"
                        >
                          <Edit className="h-4 w-4" />
                        </button>

                        {/* Eliminar */}
                        <button
                          type="button"
                          id={`btn-eliminar-gasto-${gasto.id}`}
                          onClick={() => setGastoToDelete(gasto)}
                          title="Eliminar gasto"
                          aria-label="Eliminar gasto"
                          className="p-1.5 text-[#64748B] hover:text-rose-600 dark:text-[#94A3B8] dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-md transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer / Pagination Controls */}
        <div className="px-4 py-3 border-t border-[#E2E8F0] dark:border-[#263449] bg-slate-50/75 dark:bg-[#182235]/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#64748B] dark:text-[#94A3B8]">
          <div className="flex items-center space-x-2">
            <span>
              {hasActiveFilters ? (
                <>
                  Mostrando <strong className="text-[#172033] dark:text-[#F8FAFC]">{filteredGastos.length}</strong> de{" "}
                  <strong className="text-[#172033] dark:text-[#F8FAFC]">{gastos.length}</strong> registros cargados (filtrados)
                </>
              ) : (
                <>
                  Mostrando <strong className="text-[#172033] dark:text-[#F8FAFC]">{filteredGastos.length}</strong> de{" "}
                  <strong className="text-[#172033] dark:text-[#F8FAFC]">{gastos.length}</strong> registros cargados
                </>
              )}
            </span>
          </div>

          <div className="flex items-center space-x-3">
            {hasMore && (
              <button
                type="button"
                id="btn-cargar-mas-gastos"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#0F172A] hover:bg-slate-50 dark:hover:bg-[#1E293B] text-[#172033] dark:text-[#F8FAFC] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs cursor-pointer"
              >
                {loadingMore ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-[#059669] border-t-transparent rounded-full animate-spin" />
                    <span>Cargando más...</span>
                  </>
                ) : (
                  <>
                    <span>Cargar más</span>
                    <ChevronDown className="h-3.5 w-3.5 text-[#64748B] dark:text-[#94A3B8]" />
                  </>
                )}
              </button>
            )}

            {!hasMore && gastos.length > 0 && !loading && (
              <span className="text-[11px] text-slate-400 dark:text-slate-500 italic">
                Todos los registros cargados
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* DETALLE MODAL */}
      {/* ---------------------------------------------------- */}
      {selectedGastoDetail && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-xl max-w-lg w-full shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-[#E2E8F0] dark:border-[#263449] flex items-center justify-between bg-slate-50/50 dark:bg-[#182235]/40">
              <div className="flex items-center space-x-2.5">
                <Receipt className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="font-bold text-base text-[#172033] dark:text-[#F8FAFC]">
                  Detalle del Gasto
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedGastoDetail(null)}
                className="text-[#94A3B8] hover:text-[#475569] dark:hover:text-white p-1 rounded-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-4 text-xs sm:text-sm">
              {/* Concepto & Monto */}
              <div className="p-3.5 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 flex items-start justify-between gap-3">
                <div>
                  <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Concepto</span>
                  <p className="font-semibold text-sm sm:text-base text-[#172033] dark:text-[#F8FAFC] mt-0.5">
                    {selectedGastoDetail.concepto}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Monto Total</span>
                  <p className="font-bold text-base sm:text-lg text-emerald-700 dark:text-emerald-400 font-mono mt-0.5">
                    {formatMoney(selectedGastoDetail.monto)}
                  </p>
                </div>
              </div>

              {/* Grid with fields */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <span className="text-[10px] font-medium text-[#64748B] dark:text-[#94A3B8] uppercase">Fecha</span>
                  <p className="font-medium text-[#172033] dark:text-[#F8FAFC] mt-0.5">
                    {formatDateDisplay(selectedGastoDetail.fecha_str)}
                  </p>
                </div>

                <div>
                  <span className="text-[10px] font-medium text-[#64748B] dark:text-[#94A3B8] uppercase">Categoría</span>
                  <p className="mt-0.5">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium border ${getCategoryColor(selectedGastoDetail.categoria)}`}>
                      {selectedGastoDetail.categoria}
                    </span>
                  </p>
                </div>

                <div>
                  <span className="text-[10px] font-medium text-[#64748B] dark:text-[#94A3B8] uppercase">Método de Pago</span>
                  <p className="font-medium text-[#172033] dark:text-[#F8FAFC] mt-0.5">
                    {selectedGastoDetail.metodo_pago || <span className="italic text-slate-400 dark:text-slate-500">Sin especificar</span>}
                  </p>
                </div>

                <div>
                  <span className="text-[10px] font-medium text-[#64748B] dark:text-[#94A3B8] uppercase">Almacén / Sucursal</span>
                  <p className="font-medium text-[#172033] dark:text-[#F8FAFC] mt-0.5">
                    {selectedGastoDetail.almacen_nombre || (selectedGastoDetail.almacen_id ? "Almacén asignado" : "General / Sin almacén")}
                  </p>
                </div>

                <div>
                  <span className="text-[10px] font-medium text-[#64748B] dark:text-[#94A3B8] uppercase">Proveedor o Beneficiario</span>
                  <p className="font-medium text-[#172033] dark:text-[#F8FAFC] mt-0.5">
                    {selectedGastoDetail.proveedor || "No especificado"}
                  </p>
                </div>

                <div>
                  <span className="text-[10px] font-medium text-[#64748B] dark:text-[#94A3B8] uppercase">Folio / Referencia</span>
                  <p className="font-medium text-[#172033] dark:text-[#F8FAFC] mt-0.5">
                    {selectedGastoDetail.referencia || "Sin referencia"}
                  </p>
                </div>
              </div>

              {/* Observaciones */}
              {selectedGastoDetail.notas && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] font-medium text-[#64748B] dark:text-[#94A3B8] uppercase">Notas u Observaciones</span>
                  <p className="text-xs text-[#334155] dark:text-[#CBD5E1] mt-1 bg-slate-50 dark:bg-[#0F172A] p-2.5 rounded-lg whitespace-pre-line border border-slate-100 dark:border-slate-800">
                    {selectedGastoDetail.notas}
                  </p>
                </div>
              )}

              {/* Footer Metadata */}
              <div className="pt-2 text-[10px] text-[#94A3B8] flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
                <span>Registrado por: {selectedGastoDetail.creado_por}</span>
                {selectedGastoDetail.id && <span>ID: {selectedGastoDetail.id}</span>}
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="px-5 py-3.5 bg-slate-50 dark:bg-[#182235]/40 border-t border-[#E2E8F0] dark:border-[#263449] flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => {
                  const id = selectedGastoDetail.id;
                  setSelectedGastoDetail(null);
                  if (id) onEditarGasto(id);
                }}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-[#CBD5E1] dark:border-[#334155] text-xs font-semibold text-[#172033] dark:text-[#F8FAFC] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <Edit className="h-3.5 w-3.5" />
                <span>Editar este gasto</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedGastoDetail(null)}
                className="px-3.5 py-1.5 rounded-lg bg-[#059669] text-white text-xs font-semibold hover:bg-[#047857] transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* DELETE CONFIRMATION MODAL */}
      {/* ---------------------------------------------------- */}
      {gastoToDelete && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-xl max-w-md w-full shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 space-y-3">
              <div className="flex items-center space-x-3 text-rose-600 dark:text-rose-400">
                <div className="p-2 bg-rose-50 dark:bg-rose-950/50 rounded-lg border border-rose-200 dark:border-rose-900">
                  <Trash2 className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-base text-[#172033] dark:text-[#F8FAFC]">
                  ¿Eliminar este registro de gasto?
                </h3>
              </div>

              <p className="text-xs sm:text-sm text-[#64748B] dark:text-[#94A3B8]">
                Esta acción eliminará de forma permanente el gasto:
              </p>
              
              <div className="p-3 bg-slate-50 dark:bg-[#0F172A] rounded-lg border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                <p className="font-semibold text-[#172033] dark:text-[#F8FAFC]">
                  {gastoToDelete.concepto}
                </p>
                <p className="text-[#64748B] dark:text-[#94A3B8]">
                  Fecha: {formatDateDisplay(gastoToDelete.fecha_str)} • Monto: <span className="font-mono font-bold text-rose-600 dark:text-rose-400">{formatMoney(gastoToDelete.monto)}</span>
                </p>
              </div>

              <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                Esta acción no se puede deshacer.
              </p>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 dark:bg-[#182235]/40 border-t border-[#E2E8F0] dark:border-[#263449] flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setGastoToDelete(null)}
                disabled={deleting}
                className="px-3.5 py-1.5 rounded-lg border border-[#CBD5E1] dark:border-[#334155] text-xs font-medium text-[#475569] dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
              >
                {deleting ? "Eliminando..." : "Eliminar gasto"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
