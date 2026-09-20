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
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
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
import { DatosFinancierosMensuales, PeriodoFinancieroIndex } from "../../types";
import { firestoreService } from "../../lib/firebase";
import {
  getInitialSelectedPeriod,
  getClosestValidPeriod
} from "../../lib/periodosFinancieros";

interface ResumenFinancieroProps {
  onNavigateToGastos: () => void;
  onNavigateToVentas?: () => void;
  onNavigateToCompras?: () => void;
  navigationTabs?: React.ReactNode;
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
  onNavigateToCompras,
  navigationTabs
}) => {
  // Current calendar month and year (Local time)
  const now = useMemo(() => new Date(), []);
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // Available periods list from the lightweight index
  const [availablePeriods, setAvailablePeriods] = useState<PeriodoFinancieroIndex[]>([]);
  const [periodsLoading, setPeriodsLoading] = useState<boolean>(true);
  const [periodsRefreshing, setPeriodsRefreshing] = useState<boolean>(false);
  const [periodsError, setPeriodsError] = useState<string | null>(null);

  // Selected period state
  const [period, setPeriod] = useState<{ month: number; year: number }>({
    month: currentMonth,
    year: currentYear
  });
  const selectedMonth = period.month;
  const selectedYear = period.year;

  // Popover state
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [popoverYear, setPopoverYear] = useState<number>(currentYear);
  const popoverRef = useRef<HTMLDivElement>(null);
  const periodButtonRef = useRef<HTMLButtonElement>(null);

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

  // Popover click outside and Escape handling
  useEffect(() => {
    if (!isPopoverOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        periodButtonRef.current &&
        !periodButtonRef.current.contains(e.target as Node)
      ) {
        setIsPopoverOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsPopoverOpen(false);
        periodButtonRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPopoverOpen]);

  // Available years strictly derived from real records (no hardcoded fixed ranges)
  const availableYears = useMemo(() => {
    const set = new Set<number>();
    availablePeriods.forEach((p) => set.add(p.anio));
    return Array.from(set).sort((a, b) => a - b);
  }, [availablePeriods]);

  // Sync popover year when popover opens
  useEffect(() => {
    if (isPopoverOpen) {
      if (availableYears.includes(selectedYear)) {
        setPopoverYear(selectedYear);
      } else if (availableYears.length > 0) {
        setPopoverYear(availableYears[availableYears.length - 1]);
      }
    }
  }, [isPopoverOpen, selectedYear, availableYears]);

  // Change period atomically to prevent double queries
  const changePeriod = useCallback((newMonth: number, newYear: number) => {
    if (newMonth === selectedMonth && newYear === selectedYear) return;
    setData(null);
    setPeriod({ month: newMonth, year: newYear });
  }, [selectedMonth, selectedYear]);

  // Navigation between real available periods (Jump between existing periods only)
  const currentPeriodKey = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;
  const currentPeriodIndex = availablePeriods.findIndex((p) => p.periodo === currentPeriodKey);

  const hasValidCurrentPeriod = currentPeriodIndex !== -1;
  const canPrevPeriod = hasValidCurrentPeriod && currentPeriodIndex > 0;
  const canNextPeriod = hasValidCurrentPeriod && currentPeriodIndex < availablePeriods.length - 1;

  const handlePrevPeriod = () => {
    if (canPrevPeriod) {
      const prev = availablePeriods[currentPeriodIndex - 1];
      changePeriod(prev.mes, prev.anio);
    }
  };

  const handleNextPeriod = () => {
    if (canNextPeriod) {
      const next = availablePeriods[currentPeriodIndex + 1];
      changePeriod(next.mes, next.anio);
    }
  };

  // Popover year navigation
  const popoverYearIndex = availableYears.indexOf(popoverYear);
  const canPrevPopoverYear = popoverYearIndex > 0;
  const canNextPopoverYear = popoverYearIndex !== -1 && popoverYearIndex < availableYears.length - 1;

  const handlePrevPopoverYear = () => {
    if (canPrevPopoverYear) {
      setPopoverYear(availableYears[popoverYearIndex - 1]);
    }
  };

  const handleNextPopoverYear = () => {
    if (canNextPopoverYear) {
      setPopoverYear(availableYears[popoverYearIndex + 1]);
    }
  };

  // Load available periods from Firestore/Local lightweight index
  const loadAvailablePeriods = useCallback(async (isRefresh: boolean = false): Promise<PeriodoFinancieroIndex[]> => {
    if (isRefresh) {
      setPeriodsRefreshing(true);
    } else {
      setPeriodsLoading(true);
      setPeriodsError(null);
    }

    try {
      const periods = await firestoreService.getPeriodosFinancierosDisponibles(isRefresh);
      setAvailablePeriods(periods);
      setPeriodsError(null);

      // Si hay periodos disponibles, seleccionar el mes actual si existe o el más reciente válido
      if (periods.length > 0) {
        setPeriod((prev) => {
          const key = `${prev.year}-${String(prev.month).padStart(2, "0")}`;
          const exists = periods.some((p) => p.periodo === key);
          if (exists) {
            return prev;
          }
          const initial = getInitialSelectedPeriod(periods, currentYear, currentMonth);
          return { month: initial.month, year: initial.year };
        });
      }

      return periods;
    } catch (err: any) {
      console.error("Error al cargar periodos financieros disponibles:", err);
      const errorMsg = "No fue posible consultar los periodos financieros. Verifica la conexión y los permisos de Firestore.";
      if (!isRefresh) {
        setPeriodsError(errorMsg);
      }
      throw err;
    } finally {
      setPeriodsLoading(false);
      setPeriodsRefreshing(false);
    }
  }, [currentYear, currentMonth]);

  useEffect(() => {
    loadAvailablePeriods(false).catch(() => {
      // Error manejado a través del estado periodsError
    });
  }, [loadAvailablePeriods]);

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
      if (!isSamePeriodValid) {
        setData(null);
      }

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

  // Solo consultar automáticamente si la carga de periodos terminó sin errores y hay periodos disponibles
  useEffect(() => {
    if (!periodsLoading && !periodsError && availablePeriods.length > 0) {
      fetchData(false);
    }
  }, [fetchData, periodsLoading, periodsError, availablePeriods.length]);

  // Actualización manual y re-sincronización de periodos
  const handleRefreshAll = async () => {
    try {
      setRefreshing(true);
      setPeriodsRefreshing(true);
      setError(null);

      let freshPeriods: PeriodoFinancieroIndex[];
      try {
        freshPeriods = await firestoreService.getPeriodosFinancierosDisponibles(true);
        setAvailablePeriods(freshPeriods);
        setPeriodsError(null);
      } catch (pErr) {
        console.error("Error al actualizar periodos disponibles:", pErr);
        // Error al actualizar:
        // Conserva visibles la lista de periodos y las cifras válidas anteriores.
        // Muestra el aviso de error sin sustituir los datos por una lista vacía.
        // No cambies automáticamente el periodo seleccionado.
        // No borres data.
        setError("No fue posible actualizar los periodos financieros. Verifica la conexión y los permisos de Firestore.");
        return;
      }

      if (freshPeriods.length === 0) {
        setData(null);
        return;
      }

      const key = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;
      const stillExists = freshPeriods.some((p) => p.periodo === key);
      if (!stillExists) {
        const closest = getClosestValidPeriod(selectedYear, selectedMonth, freshPeriods);
        changePeriod(closest.month, closest.year);
      } else {
        await fetchData(true);
      }
    } catch (err: any) {
      console.error("Error al refrescar finanzas:", err);
      // Conserva visibles la lista de periodos y las cifras válidas anteriores
      setError(err?.message || "No fue posible actualizar los datos financieros. Verifica la conexión y los permisos.");
    } finally {
      setPeriodsRefreshing(false);
      setRefreshing(false);
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
      {/* 1. Encabezado limpio en su propia fila */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#172033] dark:text-[#F8FAFC]">
          Resumen financiero
        </h1>
        <p className="text-xs sm:text-sm text-[#64748B] dark:text-[#94A3B8] mt-1">
          Entradas y salidas de dinero registradas durante el periodo seleccionado.
        </p>
      </div>

      {/* 2. Barra única horizontal compacta y responsive: Pestañas a la izquierda, Periodo a la derecha */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50/60 dark:bg-slate-900/40 p-1.5 sm:p-2 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-2xs">
        {/* Pestañas de navegación */}
        <div className="flex items-center">
          {navigationTabs}
        </div>

        {/* Controles de Periodo */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 relative">
          <span className="text-xs font-semibold text-[#64748B] dark:text-[#94A3B8] px-1 select-none">
            Periodo
          </span>

          {/* Botón: Periodo anterior */}
          <button
            type="button"
            id="btn-periodo-anterior"
            onClick={handlePrevPeriod}
            disabled={availablePeriods.length === 0 || !canPrevPeriod || initialLoading || periodsLoading || periodsRefreshing}
            aria-label="Periodo anterior"
            title={canPrevPeriod ? "Periodo anterior disponible" : "Primer periodo disponible"}
            className="h-10 w-10 flex items-center justify-center rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors shadow-2xs cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#059669]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {/* Selector central de periodo (Abre popover) */}
          <div className="relative">
            <button
              type="button"
              id="btn-selector-periodo"
              ref={periodButtonRef}
              onClick={() => {
                if (availablePeriods.length > 0 && !periodsLoading && !periodsError) {
                  setIsPopoverOpen((prev) => !prev);
                }
              }}
              disabled={availablePeriods.length === 0 || periodsLoading || Boolean(periodsError)}
              aria-expanded={isPopoverOpen}
              aria-haspopup="dialog"
              aria-label={
                periodsError
                  ? "Error al consultar periodos financieros"
                  : availablePeriods.length === 0
                  ? "No hay periodos con registros"
                  : `Periodo actual: ${monthLabel} ${selectedYear}. Haz clic para ver los meses disponibles`
              }
              className={`h-10 px-3 sm:px-3.5 flex items-center space-x-2 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700/80 text-[#172033] dark:text-[#F8FAFC] text-xs sm:text-sm font-semibold transition-colors shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#059669] ${
                availablePeriods.length === 0 || periodsLoading || Boolean(periodsError)
                  ? "opacity-60 cursor-not-allowed"
                  : "hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              }`}
            >
              <CalendarDays className="h-4 w-4 text-[#059669] shrink-0" />
              <span className="capitalize">
                {periodsLoading
                  ? "Cargando periodos..."
                  : periodsError
                  ? "Error en periodos"
                  : `${monthLabel} ${selectedYear}`}
              </span>
              {availablePeriods.length > 0 && !periodsLoading && !periodsError && (
                <ChevronDown
                  className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-150 ${
                    isPopoverOpen ? "rotate-180" : ""
                  }`}
                />
              )}
            </button>

            {/* Popover compacto de selección de periodo (Sólo con registros reales) */}
            {isPopoverOpen && availablePeriods.length > 0 && (
              <div
                ref={popoverRef}
                role="dialog"
                aria-label="Selector de periodo mensual"
                aria-modal="true"
                className="absolute right-0 top-full mt-2 z-50 w-72 sm:w-80 max-w-[calc(100vw-2rem)] p-3 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl transition-all"
              >
                {/* Encabezado del Popover: Navegación de Años disponibles con registros */}
                <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={handlePrevPopoverYear}
                    disabled={!canPrevPopoverYear}
                    aria-label="Año anterior con registros"
                    title={canPrevPopoverYear ? "Año anterior con registros" : "Primer año con registros"}
                    className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#059669]"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  <div className="flex items-center space-x-1.5">
                    <span className="text-sm font-bold text-[#172033] dark:text-[#F8FAFC]">
                      {popoverYear}
                    </span>
                    <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8] font-medium">
                      ({availablePeriods.filter((p) => p.anio === popoverYear).length}{" "}
                      {availablePeriods.filter((p) => p.anio === popoverYear).length === 1 ? "mes" : "meses"})
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleNextPopoverYear}
                    disabled={!canNextPopoverYear}
                    aria-label="Año siguiente con registros"
                    title={canNextPopoverYear ? "Año siguiente con registros" : "Último año con registros"}
                    className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#059669]"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                {/* Cuadrícula de 12 meses: Solo seleccionables los que tienen registros */}
                <div className="grid grid-cols-3 gap-1.5">
                  {MESES.map((m) => {
                    const periodKey = `${popoverYear}-${String(m.value).padStart(2, "0")}`;
                    const periodData = availablePeriods.find((p) => p.periodo === periodKey);
                    const hasRecords = Boolean(periodData && periodData.totalRegistrosActivos > 0);
                    const isSelected = popoverYear === selectedYear && m.value === selectedMonth;

                    return (
                      <button
                        key={m.value}
                        type="button"
                        disabled={!hasRecords}
                        onClick={() => {
                          if (hasRecords) {
                            changePeriod(m.value, popoverYear);
                            setIsPopoverOpen(false);
                          }
                        }}
                        aria-disabled={!hasRecords}
                        title={
                          hasRecords
                            ? `${m.label} ${popoverYear}: ${periodData?.totalRegistrosActivos} registro(s) activo(s)`
                            : `${m.label} ${popoverYear}: Sin movimientos registrados`
                        }
                        className={`min-h-[38px] px-2 py-1.5 rounded-xl text-xs font-semibold transition-all relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#059669] ${
                          !hasRecords
                            ? "opacity-20 text-slate-400 dark:text-slate-600 bg-transparent cursor-not-allowed select-none"
                            : isSelected
                            ? "bg-[#059669] text-white shadow-xs cursor-pointer"
                            : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 cursor-pointer"
                        }`}
                      >
                        <span>{m.label}</span>
                        {hasRecords && !isSelected && (
                          <span className="absolute bottom-1 right-2 w-1.5 h-1.5 rounded-full bg-[#059669]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Botón: Periodo siguiente */}
          <button
            type="button"
            id="btn-periodo-siguiente"
            onClick={handleNextPeriod}
            disabled={availablePeriods.length === 0 || !canNextPeriod || initialLoading || periodsLoading || periodsRefreshing}
            aria-label="Periodo siguiente"
            title={canNextPeriod ? "Periodo siguiente disponible" : "Último periodo disponible"}
            className="h-10 w-10 flex items-center justify-center rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors shadow-2xs cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#059669]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {/* Botón compacto: Actualizar datos */}
          <button
            type="button"
            id="btn-finanzas-actualizar"
            onClick={handleRefreshAll}
            disabled={initialLoading || refreshing || periodsLoading || periodsRefreshing}
            aria-label="Actualizar datos"
            title="Actualizar datos"
            className="h-10 w-10 flex items-center justify-center rounded-xl bg-white dark:bg-[#111827] hover:bg-slate-50 dark:hover:bg-slate-800 text-[#172033] dark:text-[#F8FAFC] border border-slate-200 dark:border-slate-700/80 transition-colors shadow-2xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#059669]"
          >
            <RefreshCw
              className={`h-4 w-4 text-slate-600 dark:text-slate-300 ${
                refreshing || periodsRefreshing ? "animate-spin text-[#059669]" : ""
              }`}
            />
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

      {/* Error al consultar periodos financieros (Carga inicial) */}
      {periodsError && !data && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl p-6 text-center space-y-3 shadow-2xs">
          <AlertTriangle className="h-8 w-8 text-rose-600 dark:text-rose-400 mx-auto" />
          <h3 className="text-sm font-bold text-rose-900 dark:text-rose-200">
            Error al consultar periodos financieros
          </h3>
          <p className="text-xs text-rose-700 dark:text-rose-300 max-w-md mx-auto">
            {periodsError}
          </p>
          <div>
            <button
              type="button"
              id="btn-reintentar-periodos"
              onClick={() => {
                loadAvailablePeriods(false).catch(() => {});
              }}
              className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700 shadow-xs cursor-pointer transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reintentar</span>
            </button>
          </div>
        </div>
      )}

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

      {/* Error state with retry for monthly data */}
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
              onClick={handleRefreshAll}
              className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700 shadow-xs cursor-pointer transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reintentar</span>
            </button>
          </div>
        </div>
      )}

      {/* Empty state: Carga inicial exitosa sin periodos */}
      {availablePeriods.length === 0 && !periodsLoading && !periodsError && !initialLoading && !error && (
        <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-2xl p-10 sm:p-14 text-center max-w-xl mx-auto shadow-2xs space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 mx-auto flex items-center justify-center">
            <CalendarDays className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-semibold text-[#172033] dark:text-[#F8FAFC]">
              No hay periodos con registros
            </h3>
            <p className="text-xs sm:text-sm text-[#64748B] dark:text-[#94A3B8] max-w-md mx-auto leading-relaxed">
              Aún no existen ventas activas, compras ni gastos registrados en el sistema. Los meses y años disponibles se habilitarán automáticamente a partir de tus movimientos contables reales.
            </p>
          </div>
        </div>
      )}

      {/* Visualización de métricas y gráficas */}
      {!periodsError && availablePeriods.length > 0 && (initialLoading || isDataValidForPeriod) && (
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
