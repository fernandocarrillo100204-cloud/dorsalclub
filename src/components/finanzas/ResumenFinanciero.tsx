import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  ShoppingCart,
  Receipt,
  RotateCcw,
  RefreshCw,
  AlertTriangle,
  Info,
  Calendar,
  ArrowRight,
  PieChart as PieIcon,
  BarChart3,
  Layers
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from "recharts";
import { DatosFinancierosMensuales } from "../../types";
import { firestoreService } from "../../lib/firebase";

interface ResumenFinancieroProps {
  onNavigateToGastos: () => void;
  onNavigateToVentas?: () => void;
  onNavigateToCompras?: () => void;
}

const MESES = [
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" },
  { value: 6, label: "Junio" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" },
  { value: 12, label: "Diciembre" }
];

const COLORS_DONUT = [
  "#0284C7", // Mercancía neta (sky-600)
  "#F59E0B", // Gastos asociados a compras (amber-500)
  "#8B5CF6"  // Otros gastos operativos (violet-500)
];

const CATEGORY_PALETTE = [
  "#10B981", "#3B82F6", "#F59E0B", "#EC4899", "#8B5CF6",
  "#06B6D4", "#F97316", "#64748B", "#14B8A6", "#6366F1"
];

const formatMoney = (val: number): string => {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(val || 0);
};

export const ResumenFinanciero: React.FC<ResumenFinancieroProps> = ({
  onNavigateToGastos,
  onNavigateToVentas,
  onNavigateToCompras
}) => {
  // Current calendar month and year (Local time)
  const now = useMemo(() => new Date(), []);
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // Selected period
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  // Data state
  const [data, setData] = useState<DatosFinancierosMensuales | null>(null);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Detect dark mode for recharts theme
  const [isDark, setIsDark] = useState<boolean>(() => {
    return document.documentElement.classList.contains("dark");
  });

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"]
    });
    return () => observer.disconnect();
  }, []);

  // Available years list (from 2020 up to currentYear + 1)
  const availableYears = useMemo(() => {
    const years: number[] = [];
    for (let y = 2020; y <= currentYear + 1; y++) {
      years.push(y);
    }
    return years;
  }, [currentYear]);

  const isCurrentMonthSelected = selectedMonth === currentMonth && selectedYear === currentYear;

  // Request ID counter to protect against out-of-order responses
  const requestIdRef = useRef<number>(0);
  const dataRef = useRef<DatosFinancierosMensuales | null>(null);
  dataRef.current = data;

  // Validate that data strictly belongs to the currently selected period
  const isDataValidForPeriod = Boolean(
    data && data.year === selectedYear && data.month === selectedMonth
  );

  // Data fetching logic with separation of initialLoading and refreshing, out-of-order protection
  const fetchData = useCallback(async (isRefresh: boolean = false) => {
    const reqId = ++requestIdRef.current;
    const targetYear = selectedYear;
    const targetMonth = selectedMonth;

    const isSamePeriodValid = Boolean(
      dataRef.current &&
      dataRef.current.year === targetYear &&
      dataRef.current.month === targetMonth
    );

    if (isRefresh && isSamePeriodValid) {
      setRefreshing(true);
    } else {
      setInitialLoading(true);
      setRefreshing(false);
      setData(null);
    }
    setError(null);

    try {
      const res = await firestoreService.getDatosFinancierosMensuales(
        targetYear,
        targetMonth,
        isRefresh
      );

      // Si llegó otra respuesta de una petición posterior, descartar
      if (reqId !== requestIdRef.current) {
        return;
      }

      // Validar que el resultado pertenezca exactamente al mes y año actualmente seleccionados
      if (res.year === targetYear && res.month === targetMonth) {
        setData(res);
        setError(null);
      }
    } catch (err: any) {
      if (reqId !== requestIdRef.current) {
        return;
      }
      console.error("Error al cargar datos del resumen financiero:", err);
      // En caso de error, nunca mostrar cifras falsas ni datos obsoletos
      setData(null);

      const rawMsg: string = err?.message || "";
      const isIndexError =
        err?.code === "failed-precondition" ||
        rawMsg.includes("index") ||
        rawMsg.includes("indexes") ||
        rawMsg.includes("The query requires an index") ||
        rawMsg.includes("El índice de Firestore");

      const friendlyMessage = isIndexError
        ? "El índice de Firestore necesario para consultar este periodo no está disponible todavía. Revisa la sección Índices de Firebase y vuelve a intentarlo cuando aparezca como habilitado."
        : rawMsg ||
          "No fue posible consultar los datos financieros del periodo. Verifica tu conexión e inténtalo de nuevo.";

      setError(friendlyMessage);
    } finally {
      if (reqId === requestIdRef.current) {
        setInitialLoading(false);
        setRefreshing(false);
      }
    }
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  const handleResetToCurrentMonth = () => {
    if (selectedMonth !== currentMonth || selectedYear !== currentYear) {
      setData(null);
      setSelectedMonth(currentMonth);
      setSelectedYear(currentYear);
    }
  };

  const monthLabel = useMemo(() => {
    const found = MESES.find(m => m.value === selectedMonth);
    return found ? found.label : `Mes ${selectedMonth}`;
  }, [selectedMonth]);

  // Donut data calculation
  const donutData = useMemo(() => {
    if (!isDataValidForPeriod || !data) return [];
    const items = [
      { name: "Mercancía neta", value: data.mercanciaNeta, color: COLORS_DONUT[0] },
      { name: "Gastos asociados a compras", value: data.gastosAsociadosCompras, color: COLORS_DONUT[1] },
      { name: "Otros gastos", value: data.otrosGastos, color: COLORS_DONUT[2] }
    ];
    // Only return items with value > 0 for rendering slices
    return items.filter(i => i.value > 0);
  }, [data, isDataValidForPeriod]);

  const hasDonutData = donutData.length > 0;

  // Check if daily data has any movements
  const hasDailyMovements = useMemo(() => {
    if (!isDataValidForPeriod || !data || !data.dailyData) return false;
    return data.dailyData.some(d => d.ingresos > 0 || d.egresos > 0);
  }, [data, isDataValidForPeriod]);

  return (
    <div className="space-y-6">
      {/* Header & Month Selector */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#172033] dark:text-[#F8FAFC]">
            Resumen Financiero
          </h1>
          <p className="text-xs sm:text-sm text-[#64748B] dark:text-[#94A3B8] mt-0.5">
            Entradas y salidas de dinero registradas durante el periodo seleccionado.
          </p>
        </div>

        {/* Controls: Month selector, Year selector, Current Month, Refresh */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Month select */}
          <div className="relative">
            <select
              id="select-finanzas-mes"
              value={selectedMonth}
              onChange={(e) => {
                const newMonth = Number(e.target.value);
                if (newMonth !== selectedMonth) {
                  setData(null);
                  setSelectedMonth(newMonth);
                }
              }}
              disabled={initialLoading && !data}
              className="px-3 py-2 pr-8 rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#111827] text-xs sm:text-sm font-medium text-[#172033] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#059669] focus:border-transparent transition-all cursor-pointer shadow-2xs"
            >
              {MESES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Year select */}
          <div className="relative">
            <select
              id="select-finanzas-anio"
              value={selectedYear}
              onChange={(e) => {
                const newYear = Number(e.target.value);
                if (newYear !== selectedYear) {
                  setData(null);
                  setSelectedYear(newYear);
                }
              }}
              disabled={initialLoading && !data}
              className="px-3 py-2 pr-8 rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#111827] text-xs sm:text-sm font-medium text-[#172033] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#059669] focus:border-transparent transition-all cursor-pointer shadow-2xs"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* "Mes actual" button: only shown when not current month */}
          {!isCurrentMonthSelected && (
            <button
              type="button"
              id="btn-finanzas-mes-actual"
              onClick={handleResetToCurrentMonth}
              disabled={initialLoading || refreshing}
              className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[#475569] dark:text-[#CBD5E1] hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-2xs cursor-pointer"
            >
              <Calendar className="h-3.5 w-3.5 text-[#059669]" />
              <span>Mes actual</span>
            </button>
          )}

          {/* "Actualizar" button */}
          <button
            type="button"
            id="btn-finanzas-actualizar"
            onClick={() => fetchData(true)}
            disabled={initialLoading || refreshing}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-white dark:bg-[#111827] hover:bg-slate-50 dark:hover:bg-[#182235] text-[#172033] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] transition-all shadow-2xs cursor-pointer disabled:opacity-50"
            title="Recargar datos desde la base de datos"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 text-[#059669] ${
                refreshing ? "animate-spin" : ""
              }`}
            />
            <span>{refreshing ? "Actualizando..." : "Actualizar"}</span>
          </button>
        </div>
      </div>

      {/* Cash flow recognition disclaimer */}
      <div className="bg-slate-50 dark:bg-[#182235]/60 border border-slate-200 dark:border-[#263449] rounded-xl p-3.5 text-xs text-[#64748B] dark:text-[#94A3B8] flex items-start space-x-3 shadow-2xs">
        <Info className="h-4 w-4 text-[#059669] shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          Este balance representa entradas y salidas registradas durante el mes. La compra de inventario se reconoce completa como salida de efectivo, aunque la mercancía todavía no se haya vendido.
        </p>
      </div>

      {/* Warning for sales without registered amount */}
      {isDataValidForPeriod && data && data.ventasSinImporte > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-xl p-3.5 text-xs text-amber-800 dark:text-amber-300 flex items-start space-x-3 shadow-2xs">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Atención con importes de venta: </span>
            <span>
              Se detectaron <strong>{data.ventasSinImporte}</strong> salida(s) de venta sin importe monetario ni precio unitario en este periodo. No se sumaron a los ingresos para no alterar el flujo de dinero.
            </span>
          </div>
        </div>
      )}

      {/* Error state with retry */}
      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl p-6 text-center space-y-3 shadow-2xs">
          <AlertTriangle className="h-8 w-8 text-rose-600 dark:text-rose-400 mx-auto" />
          <h3 className="text-sm font-bold text-rose-900 dark:text-rose-200">
            Error al consultar datos financieros
          </h3>
          <p className="text-xs text-rose-700 dark:text-rose-300 max-w-md mx-auto">
            {error}
          </p>
          <div>
            <button
              type="button"
              id="btn-reintentar-finanzas"
              onClick={() => fetchData(true)}
              className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700 shadow-xs cursor-pointer transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reintentar</span>
            </button>
          </div>
        </div>
      )}

      {/* Visualización de métricas y gráficas: se muestran skeletons en carga inicial o los datos válidos del periodo */}
      {(initialLoading || isDataValidForPeriod) && (
        <>
          {/* Main Metric Cards (5 Cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* 1. Ingresos por ventas */}
        <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-xl p-4 shadow-2xs flex flex-col justify-between space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[#64748B] dark:text-[#94A3B8]">
              <span className="text-xs font-medium">Ingresos por ventas</span>
              <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-[#059669]">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            {initialLoading ? (
              <div className="h-7 w-28 bg-slate-200 dark:bg-slate-800 rounded animate-pulse my-1" />
            ) : (
              <div className="text-xl sm:text-2xl font-bold text-[#172033] dark:text-[#F8FAFC] font-mono">
                {formatMoney(data?.ingresosVentas || 0)}
              </div>
            )}
            <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
              {initialLoading ? (
                <div className="h-3.5 w-32 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              ) : (
                <span>
                  {data?.numVentas || 0} ventas • {data?.unidadesVendidas || 0} uds
                </span>
              )}
            </div>
          </div>

          {onNavigateToVentas && (
            <button
              type="button"
              id="link-finanzas-ir-ventas"
              onClick={onNavigateToVentas}
              className="inline-flex items-center space-x-1 text-xs font-medium text-[#059669] hover:text-[#047857] dark:text-emerald-400 dark:hover:text-emerald-300 pt-2 border-t border-slate-100 dark:border-slate-800/80 transition-colors cursor-pointer group"
            >
              <span>Ver análisis de ventas</span>
              <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
            </button>
          )}
        </div>

        {/* 2. Compras totales (con desglose pequeño) */}
        <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-xl p-4 shadow-2xs flex flex-col justify-between space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[#64748B] dark:text-[#94A3B8]">
              <span className="text-xs font-medium">Compras totales</span>
              <div className="p-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400">
                <ShoppingCart className="h-4 w-4" />
              </div>
            </div>
            {initialLoading ? (
              <div className="h-7 w-28 bg-slate-200 dark:bg-slate-800 rounded animate-pulse my-1" />
            ) : (
              <div className="text-xl sm:text-2xl font-bold text-[#172033] dark:text-[#F8FAFC] font-mono">
                {formatMoney(data?.comprasTotales || 0)}
              </div>
            )}
            
            {/* Desglose pequeño */}
            <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800/80 space-y-0.5 text-[10.5px] text-[#64748B] dark:text-[#94A3B8]">
              <div className="flex justify-between">
                <span>Mercancía neta:</span>
                <span className="font-mono text-[#172033] dark:text-[#F8FAFC]">
                  {formatMoney(data?.mercanciaNeta || 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Envíos y comisiones:</span>
                <span className="font-mono text-[#172033] dark:text-[#F8FAFC]">
                  {formatMoney(data?.gastosAsociadosCompras || 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Descuentos aplicados:</span>
                <span className="font-mono text-[#172033] dark:text-[#F8FAFC]">
                  {formatMoney(data?.descuentosCompras || 0)}
                </span>
              </div>
            </div>

            <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] pt-1">
              {initialLoading ? (
                <div className="h-3.5 w-32 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              ) : (
                <span>
                  {data?.numCompras || 0} compras • {data?.unidadesCompradas || 0} uds
                </span>
              )}
            </div>
          </div>

          {onNavigateToCompras && (
            <button
              type="button"
              id="link-finanzas-ir-compras"
              onClick={onNavigateToCompras}
              className="inline-flex items-center space-x-1 text-xs font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 pt-2 border-t border-slate-100 dark:border-slate-800/80 transition-colors cursor-pointer group"
            >
              <span>Ver compras</span>
              <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
            </button>
          )}
        </div>

        {/* 3. Otros gastos */}
        <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-xl p-4 shadow-2xs flex flex-col justify-between space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[#64748B] dark:text-[#94A3B8]">
              <span className="text-xs font-medium">Otros gastos</span>
              <div className="p-1.5 rounded-lg bg-violet-50 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400">
                <Receipt className="h-4 w-4" />
              </div>
            </div>
            {initialLoading ? (
              <div className="h-7 w-28 bg-slate-200 dark:bg-slate-800 rounded animate-pulse my-1" />
            ) : (
              <div className="text-xl sm:text-2xl font-bold text-[#172033] dark:text-[#F8FAFC] font-mono">
                {formatMoney(data?.otrosGastos || 0)}
              </div>
            )}
            <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
              {initialLoading ? (
                <div className="h-3.5 w-32 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              ) : (
                <span>{data?.numGastos || 0} gastos operativos</span>
              )}
            </div>
          </div>

          <button
            type="button"
            id="link-finanzas-ir-gastos"
            onClick={onNavigateToGastos}
            className="inline-flex items-center space-x-1 text-xs font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 pt-2 border-t border-slate-100 dark:border-slate-800/80 transition-colors cursor-pointer group"
          >
            <span>Ver historial de gastos</span>
            <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        {/* 4. Egresos totales */}
        <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-xl p-4 shadow-2xs flex flex-col justify-between space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[#64748B] dark:text-[#94A3B8]">
              <span className="text-xs font-medium">Egresos totales</span>
              <div className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400">
                <TrendingDown className="h-4 w-4" />
              </div>
            </div>
            {initialLoading ? (
              <div className="h-7 w-28 bg-slate-200 dark:bg-slate-800 rounded animate-pulse my-1" />
            ) : (
              <div className="text-xl sm:text-2xl font-bold text-[#172033] dark:text-[#F8FAFC] font-mono">
                {formatMoney(data?.egresosTotales || 0)}
              </div>
            )}
            <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
              Compras totales + Otros gastos
            </div>
          </div>

          <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] pt-2 border-t border-slate-100 dark:border-slate-800/80">
            Total salidas del periodo
          </div>
        </div>

        {/* 5. Balance neto de flujo */}
        <div
          className={`border rounded-xl p-4 shadow-2xs flex flex-col justify-between space-y-3 transition-colors ${
            (data?.balanceNetoFlujo || 0) > 0
              ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/80"
              : (data?.balanceNetoFlujo || 0) < 0
              ? "bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/80"
              : "bg-white dark:bg-[#111827] border-[#E2E8F0] dark:border-[#263449]"
          }`}
        >
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[#64748B] dark:text-[#94A3B8]">
              <span className="text-xs font-bold text-[#172033] dark:text-[#F8FAFC]">
                Balance neto de flujo
              </span>
              <div
                className={`p-1.5 rounded-lg ${
                  (data?.balanceNetoFlujo || 0) >= 0
                    ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300"
                    : "bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300"
                }`}
              >
                {(data?.balanceNetoFlujo || 0) >= 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
              </div>
            </div>
            {initialLoading ? (
              <div className="h-7 w-28 bg-slate-200 dark:bg-slate-800 rounded animate-pulse my-1" />
            ) : (
              <div
                className={`text-xl sm:text-2xl font-bold font-mono ${
                  (data?.balanceNetoFlujo || 0) > 0
                    ? "text-emerald-700 dark:text-emerald-400"
                    : (data?.balanceNetoFlujo || 0) < 0
                    ? "text-rose-700 dark:text-rose-400"
                    : "text-[#172033] dark:text-[#F8FAFC]"
                }`}
              >
                {(data?.balanceNetoFlujo || 0) > 0 ? "+" : ""}
                {formatMoney(data?.balanceNetoFlujo || 0)}
              </div>
            )}
            <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
              Ingresos menos egresos
            </div>
          </div>

          <div className="text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8] pt-2 border-t border-slate-200/60 dark:border-slate-800/80">
            Flujo de efectivo del mes
          </div>
        </div>
      </div>

      {/* Charts Section: 2 charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Chart 1: Ingresos contra egresos (Día por día) - 2 cols on lg */}
        <div className="lg:col-span-2 bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-xl p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-[#172033] dark:text-[#F8FAFC] flex items-center space-x-2">
                  <BarChart3 className="h-4 w-4 text-[#059669]" />
                  <span>Ingresos contra egresos</span>
                </h3>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                  Comportamiento diario de flujo monetario durante {monthLabel} de {selectedYear}
                </p>
              </div>
            </div>

            {/* Chart Container */}
            {initialLoading ? (
              <div className="h-64 w-full bg-slate-100 dark:bg-slate-800/40 rounded-lg animate-pulse flex items-center justify-center">
                <span className="text-xs text-slate-400">Cargando gráfica diaria...</span>
              </div>
            ) : !hasDailyMovements ? (
              <div className="h-64 w-full border border-dashed border-slate-200 dark:border-slate-800 rounded-lg flex flex-col items-center justify-center text-center p-6">
                <ShoppingBag className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-xs font-semibold text-[#172033] dark:text-[#F8FAFC]">
                  Sin movimientos registrados en este periodo
                </p>
                <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] mt-1 max-w-sm">
                  No se registraron salidas comerciales, compras ni gastos operativos durante los días de {monthLabel}.
                </p>
              </div>
            ) : (
              <div className="h-64 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data?.dailyData || []}
                    margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={isDark ? "#263449" : "#F1F5F9"}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="diaLabel"
                      stroke={isDark ? "#94A3B8" : "#94A3B8"}
                      tick={{ fill: isDark ? "#94A3B8" : "#64748B", fontSize: 10 }}
                    />
                    <YAxis
                      stroke={isDark ? "#94A3B8" : "#94A3B8"}
                      tick={{ fill: isDark ? "#94A3B8" : "#64748B", fontSize: 10 }}
                      tickFormatter={(val) => `$${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                    />
                    <Tooltip
                      formatter={(val: any) => [formatMoney(Number(val) || 0), ""]}
                      labelFormatter={(label) => `Día ${label} de ${monthLabel}`}
                      contentStyle={{
                        backgroundColor: isDark ? "#111827" : "#FFFFFF",
                        borderColor: isDark ? "#263449" : "#E2E8F0",
                        borderRadius: "0.5rem",
                        color: isDark ? "#F8FAFC" : "#172033",
                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                        fontSize: "12px"
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                      formatter={(value) => {
                        if (value === "ingresos") return "Ingresos por ventas";
                        if (value === "egresos") return "Egresos totales";
                        return value;
                      }}
                    />
                    <Bar
                      dataKey="ingresos"
                      name="ingresos"
                      fill="#059669"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="egresos"
                      name="egresos"
                      fill={isDark ? "#94A3B8" : "#475569"}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] pt-3 border-t border-slate-100 dark:border-slate-800/80 mt-3 flex items-center justify-between">
            <span>Días en {monthLabel}: {data?.dailyData.length || 0}</span>
            <span className="font-mono">
              Balance del mes: {formatMoney(data?.balanceNetoFlujo || 0)}
            </span>
          </div>
        </div>

        {/* Chart 2: Composición de egresos (Dona) & Desglose de otros gastos - 1 col on lg */}
        <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-xl p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm sm:text-base font-bold text-[#172033] dark:text-[#F8FAFC] flex items-center space-x-2">
                <PieIcon className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                <span>Composición de egresos</span>
              </h3>
            </div>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mb-3">
              Distribución de salidas de efectivo
            </p>

            {/* Donut Chart or Polite Empty State */}
            {initialLoading ? (
              <div className="h-48 w-full bg-slate-100 dark:bg-slate-800/40 rounded-lg animate-pulse flex items-center justify-center">
                <span className="text-xs text-slate-400">Cargando composición...</span>
              </div>
            ) : !hasDonutData ? (
              <div className="h-48 w-full border border-dashed border-slate-200 dark:border-slate-800 rounded-lg flex flex-col items-center justify-center text-center p-4">
                <Layers className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-xs font-semibold text-[#172033] dark:text-[#F8FAFC]">
                  Sin egresos registrados en este periodo
                </p>
                <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] mt-1 max-w-xs">
                  No se registraron compras de mercancía ni gastos operativos en el mes seleccionado.
                </p>
              </div>
            ) : (
              <div>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {donutData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val: any) => [formatMoney(Number(val) || 0), ""]}
                        contentStyle={{
                          backgroundColor: isDark ? "#111827" : "#FFFFFF",
                          borderColor: isDark ? "#263449" : "#E2E8F0",
                          borderRadius: "0.5rem",
                          color: isDark ? "#F8FAFC" : "#172033",
                          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                          fontSize: "11px"
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Slices legend */}
                <div className="space-y-1.5 pt-1 text-xs">
                  {donutData.map((slice) => {
                    const pct =
                      data && data.egresosTotales > 0
                        ? ((slice.value / data.egresosTotales) * 100).toFixed(1)
                        : "0";
                    return (
                      <div
                        key={slice.name}
                        className="flex items-center justify-between text-[#172033] dark:text-[#F8FAFC]"
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: slice.color }}
                          />
                          <span className="truncate text-xs text-[#64748B] dark:text-[#94A3B8]">
                            {slice.name}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 shrink-0">
                          <span className="font-mono font-medium text-xs">
                            {formatMoney(slice.value)}
                          </span>
                          <span className="text-[10.5px] text-[#64748B] dark:text-[#94A3B8] w-10 text-right">
                            ({pct}%)
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Desglose de otros gastos por categoría (ordenado de mayor a menor) */}
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
            <h4 className="text-xs font-bold text-[#172033] dark:text-[#F8FAFC] uppercase tracking-wider mb-2">
              Desglose de otros gastos por categoría
            </h4>

            {initialLoading ? (
              <div className="space-y-2">
                <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              </div>
            ) : !data || data.gastosPorCategoria.length === 0 ? (
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] italic">
                Sin otros gastos registrados en este periodo.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {data.gastosPorCategoria.map((cat, idx) => {
                  const barColor = CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length];
                  return (
                    <div
                      key={cat.categoria}
                      className="flex items-center justify-between text-xs py-1 px-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: barColor }}
                        />
                        <span className="truncate text-[#172033] dark:text-[#F8FAFC]">
                          {cat.categoria}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 shrink-0">
                        <span className="font-mono text-xs font-medium text-[#172033] dark:text-[#F8FAFC]">
                          {formatMoney(cat.monto)}
                        </span>
                        <span className="text-[10px] text-[#64748B] dark:text-[#94A3B8] w-9 text-right font-mono">
                          {cat.porcentaje.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )}
</div>
  );
};
