/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { 
  TrendingUp, 
  Calendar, 
  Warehouse, 
  Package, 
  Layers, 
  BarChart3, 
  Sparkles, 
  Filter, 
  RotateCcw, 
  ShoppingBag, 
  Building2, 
  CalendarDays, 
  Info, 
  Scale, 
  X,
  ChevronRight
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell
} from "recharts";
import { Almacen, Producto, ResumenVentaDiaria, PeriodoVenta } from "../types";
import { firestoreService } from "../lib/firebase";
import { useTheme } from "../context/ThemeContext";

interface AnalisisVentasProps {
  almacenes: Almacen[];
  productos: Producto[];
  onNavigateToHistory?: (sku?: string) => void;
}

interface PeriodRange {
  currentStart: Date;
  currentEnd: Date;
  daysElapsed: number;
  formattedRange: string;
}

const MONTH_NAMES_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export default function AnalisisVentas({ almacenes, productos, onNavigateToHistory }: AnalisisVentasProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // Filters state
  const [periodo, setPeriodo] = useState<PeriodoVenta>("esta_semana");
  const [selectedAlmacen, setSelectedAlmacen] = useState<string>("all");
  const [selectedCategoria, setSelectedCategoria] = useState<string>("all");
  const [selectedSku, setSelectedSku] = useState<string>("all");
  const [selectedUnidad, setSelectedUnidad] = useState<string>("all");

  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });

  // Lookup maps
  const productosMap = useMemo(() => {
    const map = new Map<string, Producto>();
    productos.forEach(p => map.set(p.sku.toUpperCase(), p));
    return map;
  }, [productos]);

  const almacenesMap = useMemo(() => {
    const map = new Map<string, Almacen>();
    almacenes.forEach(a => map.set(a.id, a));
    return map;
  }, [almacenes]);

  // Unique categories list
  const categorias = useMemo(() => {
    const set = new Set<string>();
    productos.forEach(p => {
      if (p.categoria && p.categoria.trim()) {
        set.add(p.categoria.trim());
      }
    });
    return Array.from(set).sort();
  }, [productos]);

  // Filter products by selected category
  const productosFiltrados = useMemo(() => {
    if (selectedCategoria === "all") return productos;
    return productos.filter(p => p.categoria === selectedCategoria);
  }, [productos, selectedCategoria]);

  // Unique units of measure list from products catalog
  const unidadesDisponibles = useMemo(() => {
    const set = new Set<string>();
    productos.forEach(p => {
      const u = (p.unidad || "uds").trim();
      if (u) set.add(u);
    });
    if (set.size === 0) set.add("uds");
    return Array.from(set).sort();
  }, [productos]);

  // Category change handler that resets incompatible product
  const handleCategoryChange = (newCat: string) => {
    setSelectedCategoria(newCat);
    if (newCat !== "all" && selectedSku !== "all") {
      const currentProd = productosMap.get(selectedSku);
      if (currentProd && currentProd.categoria !== newCat) {
        setSelectedSku("all");
      }
    }
  };

  // Helper to parse dates accurately
  const normalizeDate = (raw: any): Date => {
    if (!raw) return new Date();
    if (raw instanceof Date) return raw;
    if (typeof raw.toDate === "function") return raw.toDate();
    if (typeof raw.seconds === "number") return new Date(raw.seconds * 1000);
    return new Date(raw);
  };

  // Format date range nicely (e.g., "1–17 ago 2026" or "25 jul – 17 ago 2026")
  const formatDateRangeText = (start: Date, end: Date): string => {
    const startDay = start.getDate();
    const endDay = end.getDate();
    const startMonth = MONTH_NAMES_SHORT[start.getMonth()];
    const endMonth = MONTH_NAMES_SHORT[end.getMonth()];
    const startYear = start.getFullYear();
    const endYear = end.getFullYear();

    if (startYear === endYear) {
      if (startMonth === endMonth) {
        if (startDay === endDay) {
          return `${startDay} ${startMonth} ${startYear}`;
        }
        return `${startDay}–${endDay} ${startMonth} ${startYear}`;
      }
      return `${startDay} ${startMonth} – ${endDay} ${endMonth} ${startYear}`;
    }
    return `${startDay} ${startMonth} ${startYear} – ${endDay} ${endMonth} ${endYear}`;
  };

  // Compute exact Date ranges for the selected period
  const periodRanges: PeriodRange = useMemo(() => {
    const now = new Date();
    let currentStart = new Date();
    let currentEnd = new Date(now.getTime());
    let daysElapsed = 1;

    if (periodo === "esta_semana") {
      // Monday of current week at 00:00:00
      const dayOfWeek = now.getDay();
      const diffToMonday = (dayOfWeek + 6) % 7;
      currentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday, 0, 0, 0, 0);
      currentEnd = new Date(now.getTime());

      const elapsedMs = currentEnd.getTime() - currentStart.getTime();
      daysElapsed = Math.max(1, Math.ceil(elapsedMs / (24 * 60 * 60 * 1000)));
    } else if (periodo === "mes_actual") {
      // 1st day of current month at 00:00:00
      currentStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      currentEnd = new Date(now.getTime());
      daysElapsed = Math.max(1, now.getDate());
    } else if (periodo === "ultimos_30_dias") {
      // Includes today and the 29 previous days (total 30 days)
      const start30 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0);
      currentStart = start30;
      currentEnd = new Date(now.getTime());
      daysElapsed = 30;
    } else if (periodo === "personalizado") {
      // Validated start and end
      let validStartStr = customStartDate;
      let validEndStr = customEndDate;
      if (validStartStr > validEndStr) {
        validEndStr = validStartStr;
      }

      const parsedStart = new Date(validStartStr + "T00:00:00");
      const parsedEnd = new Date(validEndStr + "T23:59:59");
      currentStart = isNaN(parsedStart.getTime()) ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) : parsedStart;
      currentEnd = isNaN(parsedEnd.getTime()) ? new Date() : parsedEnd;

      const durationMs = Math.max(24 * 60 * 60 * 1000, currentEnd.getTime() - currentStart.getTime());
      daysElapsed = Math.max(1, Math.ceil(durationMs / (24 * 60 * 60 * 1000)));
    }

    const formattedRange = formatDateRangeText(currentStart, currentEnd);

    return {
      currentStart,
      currentEnd,
      daysElapsed,
      formattedRange
    };
  }, [periodo, customStartDate, customEndDate]);

  // Scoped date-range sales summaries state
  const [resumenesVentas, setResumenesVentas] = useState<ResumenVentaDiaria[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Optimized query: fetches pre-aggregated daily sales summaries
  useEffect(() => {
    let isMounted = true;
    const fetchSalesSummaries = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await firestoreService.getResumenVentasByDateRange(
          periodRanges.currentStart,
          periodRanges.currentEnd
        );
        if (isMounted) {
          setResumenesVentas(data);
          setLoading(false);
        }
      } catch (err: any) {
        console.error("Error al consultar resúmenes de ventas por rango:", err);
        if (isMounted) {
          setError("No se pudieron cargar los datos de ventas para este periodo.");
          setLoading(false);
        }
      }
    };

    fetchSalesSummaries();

    return () => {
      isMounted = false;
    };
  }, [periodRanges.currentStart.getTime(), periodRanges.currentEnd.getTime()]);

  // Handle custom date inputs with validation
  const handleStartDateChange = (val: string) => {
    setCustomStartDate(val);
    if (val > customEndDate) {
      setCustomEndDate(val);
    }
  };

  const handleEndDateChange = (val: string) => {
    setCustomEndDate(val);
    if (val < customStartDate) {
      setCustomStartDate(val);
    }
  };

  // Filter sales summaries matching active dimension filters
  const filteredSummaries = useMemo(() => {
    return resumenesVentas.filter(r => {
      if (r.cantidad <= 0) return false;

      const sku = (r.sku || "").trim().toUpperCase();
      const prod = productosMap.get(sku);
      const unit = (prod?.unidad || "uds").trim();

      // Category filter
      if (selectedCategoria !== "all" && prod?.categoria !== selectedCategoria) {
        return false;
      }

      // SKU filter
      if (selectedSku !== "all" && sku !== selectedSku.toUpperCase()) {
        return false;
      }

      // Warehouse filter
      if (selectedAlmacen !== "all" && r.almacen_id !== selectedAlmacen) {
        return false;
      }

      // Unit of measure filter
      if (selectedUnidad !== "all" && unit !== selectedUnidad) {
        return false;
      }

      return true;
    });
  }, [resumenesVentas, selectedAlmacen, selectedSku, selectedCategoria, selectedUnidad, productosMap]);

  // Unit of measure breakdown analysis
  const unitAnalysis = useMemo(() => {
    const breakdown: Record<string, number> = {};
    
    filteredSummaries.forEach(r => {
      const prod = productosMap.get((r.sku || "").toUpperCase());
      const u = (prod?.unidad || "uds").trim();
      breakdown[u] = (breakdown[u] || 0) + Number(r.cantidad || 0);
    });

    const distinctUnits = Object.keys(breakdown);
    const isSingleUnit = distinctUnits.length <= 1;
    const activeSingleUnit = distinctUnits.length === 1 ? distinctUnits[0] : (selectedUnidad !== "all" ? selectedUnidad : "uds");

    // Formatted text breakdown e.g. "37 uds · 20 kg"
    const formattedBreakdown = distinctUnits.length > 0 
      ? distinctUnits.map(u => `${breakdown[u]} ${u}`).join(" · ")
      : `0 ${selectedUnidad !== "all" ? selectedUnidad : "uds"}`;

    return {
      breakdown,
      distinctUnits,
      isSingleUnit,
      activeSingleUnit,
      formattedBreakdown
    };
  }, [filteredSummaries, productosMap, selectedUnidad]);

  // Aggregate Metrics from incremental daily summaries
  const metrics = useMemo(() => {
    const totalUnitsSingle = filteredSummaries.reduce((acc, r) => acc + Number(r.cantidad || 0), 0);
    const totalTransactions = filteredSummaries.reduce((acc, r) => acc + (Number(r.total_transacciones) || 1), 0);

    // Top Product
    const productUnitsMap: Record<string, number> = {};
    filteredSummaries.forEach(r => {
      const sku = (r.sku || "").toUpperCase();
      productUnitsMap[sku] = (productUnitsMap[sku] || 0) + Number(r.cantidad || 0);
    });

    let topProductSku = "";
    let topProductUnits = 0;
    Object.entries(productUnitsMap).forEach(([sku, units]) => {
      if (units > topProductUnits) {
        topProductUnits = units;
        topProductSku = sku;
      }
    });
    const topProduct = topProductSku ? productosMap.get(topProductSku) : null;
    const topProductUnit = topProduct ? (topProduct.unidad || "uds") : "uds";

    // Top Warehouse
    const warehouseUnitsMap: Record<string, number> = {};
    filteredSummaries.forEach(r => {
      const wid = r.almacen_id;
      warehouseUnitsMap[wid] = (warehouseUnitsMap[wid] || 0) + Number(r.cantidad || 0);
    });

    let topWarehouseId = "";
    let topWarehouseUnits = 0;
    Object.entries(warehouseUnitsMap).forEach(([wid, units]) => {
      if (units > topWarehouseUnits) {
        topWarehouseUnits = units;
        topWarehouseId = wid;
      }
    });
    const topWarehouse = topWarehouseId ? almacenesMap.get(topWarehouseId) : null;

    // Daily average
    const dailyAverageSingle = (totalUnitsSingle / periodRanges.daysElapsed);

    // Daily average breakdown if multiple units
    const dailyAverageBreakdown = unitAnalysis.distinctUnits.length > 0
      ? unitAnalysis.distinctUnits.map(u => {
          const q = unitAnalysis.breakdown[u] || 0;
          return `${(q / periodRanges.daysElapsed).toFixed(1)} ${u}/día`;
        }).join(" · ")
      : `0.0 ${unitAnalysis.activeSingleUnit}/día`;

    return {
      totalUnitsSingle,
      totalTransactions,
      topProductSku,
      topProductUnits,
      topProduct,
      topProductUnit,
      topWarehouseId,
      topWarehouseUnits,
      topWarehouse,
      dailyAverageSingle,
      dailyAverageBreakdown,
      daysElapsed: periodRanges.daysElapsed
    };
  }, [filteredSummaries, periodRanges, productosMap, almacenesMap, unitAnalysis]);

  // Chart 1: Sales by day (Vertical Bar Chart from pre-aggregated daily summaries)
  const salesByDayData = useMemo(() => {
    const { currentStart, daysElapsed } = periodRanges;
    const daysCount = Math.min(31, Math.max(1, daysElapsed));

    const dayLabels: string[] = [];
    const dayNumbers: number[] = [];
    const currentBuckets: number[] = new Array(daysCount).fill(0);
    const weekdays = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

    for (let i = 0; i < daysCount; i++) {
      const bucketDate = new Date(currentStart.getTime() + i * 24 * 60 * 60 * 1000);
      dayNumbers.push(bucketDate.getDate());
      if (periodo === "esta_semana") {
        const dayIdx = bucketDate.getDay();
        dayLabels.push(`${weekdays[dayIdx]} ${bucketDate.getDate()}`);
      } else if (periodo === "mes_actual") {
        dayLabels.push(`Día ${bucketDate.getDate()}`);
      } else {
        dayLabels.push(`${bucketDate.getDate()}/${bucketDate.getMonth() + 1}`);
      }
    }

    filteredSummaries.forEach(r => {
      let rDate: Date;
      if (r.fecha_str) {
        rDate = new Date(r.fecha_str + "T00:00:00");
      } else {
        rDate = normalizeDate(r.fecha);
      }
      const diffMs = rDate.getTime() - currentStart.getTime();
      const dayIdx = Math.floor(diffMs / (24 * 60 * 60 * 1000));
      if (dayIdx >= 0 && dayIdx < daysCount) {
        currentBuckets[dayIdx] += Number(r.cantidad || 0);
      }
    });

    return dayLabels.map((label, idx) => ({
      dia: label,
      diaNumero: dayNumbers[idx],
      unidades: currentBuckets[idx]
    }));
  }, [filteredSummaries, periodRanges, periodo]);

  // Chart 2: Sales by Product (Horizontal Bar Chart sorted descending)
  const salesByProductData = useMemo(() => {
    const map: Record<string, { sku: string; nombre: string; unidades: number; categoria: string; unidad: string }> = {};

    productosFiltrados.forEach(p => {
      if (selectedSku !== "all" && p.sku !== selectedSku) return;
      if (selectedUnidad !== "all" && (p.unidad || "uds") !== selectedUnidad) return;
      map[p.sku] = {
        sku: p.sku,
        nombre: p.nombre,
        categoria: p.categoria,
        unidad: p.unidad || "uds",
        unidades: 0
      };
    });

    filteredSummaries.forEach(r => {
      const sku = (r.sku || "").toUpperCase();
      if (!map[sku]) {
        const prod = productosMap.get(sku);
        map[sku] = {
          sku,
          nombre: prod ? prod.nombre : sku,
          categoria: prod ? prod.categoria : "General",
          unidad: prod ? (prod.unidad || "uds") : "uds",
          unidades: 0
        };
      }
      map[sku].unidades += Number(r.cantidad || 0);
    });

    const list = Object.values(map);
    list.sort((a, b) => b.unidades - a.unidades);
    return list;
  }, [filteredSummaries, productosFiltrados, selectedSku, selectedUnidad, productosMap]);

  // Chart 3: Sales by Warehouse
  const salesByWarehouseData = useMemo(() => {
    const map: Record<string, { id: string; nombre: string; unidades: number }> = {};

    almacenes.forEach(a => {
      map[a.id] = {
        id: a.id,
        nombre: a.nombre,
        unidades: 0
      };
    });

    filteredSummaries.forEach(r => {
      if (map[r.almacen_id]) {
        map[r.almacen_id].unidades += Number(r.cantidad || 0);
      }
    });

    return Object.values(map);
  }, [almacenes, filteredSummaries]);

  // Peak sales day calculation
  const peakDayInfo = useMemo(() => {
    let peakDayLabel = "";
    let peakDayNumber = 0;
    let peakDayUnits = 0;

    salesByDayData.forEach(d => {
      if (d.unidades > peakDayUnits) {
        peakDayUnits = d.unidades;
        peakDayLabel = d.dia;
        peakDayNumber = d.diaNumero;
      }
    });

    return {
      peakDayLabel,
      peakDayNumber,
      peakDayUnits
    };
  }, [salesByDayData]);

  // Interactive filter helpers
  const handleSelectProductFromChart = (sku: string) => {
    setSelectedSku(prev => prev === sku ? "all" : sku);
  };

  const handleSelectWarehouseFromChart = (almacenId: string) => {
    setSelectedAlmacen(prev => prev === almacenId ? "all" : almacenId);
  };

  const handleResetFilters = () => {
    setPeriodo("esta_semana");
    setSelectedAlmacen("all");
    setSelectedCategoria("all");
    setSelectedSku("all");
    setSelectedUnidad("all");
  };

  const hasActiveFilters = 
    selectedAlmacen !== "all" || 
    selectedCategoria !== "all" || 
    selectedSku !== "all" || 
    selectedUnidad !== "all" || 
    periodo !== "esta_semana";

  return (
    <div className="max-w-7xl mx-auto px-3.5 sm:px-5 lg:px-6 py-5 space-y-4 animate-fadeIn" id="sales-analytics-container">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-[#E2E8F0] dark:border-[#263449] pb-3.5">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-[#ECFDF5] dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-[#059669] dark:text-emerald-400">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-[28px] font-bold text-[#172033] dark:text-[#F8FAFC] tracking-tight leading-tight">Análisis de Ventas</h1>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                Monitoreo comercial y tendencias de salida de mercancía por producto, almacén y periodo
              </p>
            </div>
          </div>
        </div>

        {/* Global actions */}
        <div className="flex items-center space-x-2.5 shrink-0">
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              id="btn-reset-filters"
              className="flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-medium text-[#64748B] dark:text-[#94A3B8] hover:text-[#172033] dark:hover:text-[#F8FAFC] bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-lg hover:bg-[#F1F5F9] dark:hover:bg-[#182235] transition-colors shadow-2xs cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Restablecer</span>
            </button>
          )}
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-[#F8FAFC] dark:bg-[#182235] border border-[#E2E8F0] dark:border-[#263449] text-[11px] text-[#64748B] dark:text-[#94A3B8]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#059669] dark:bg-emerald-400 animate-pulse" />
            <span>Tiempo real activo</span>
          </div>
        </div>
      </div>

      {/* Filter Control Bar */}
      <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-xl p-3 sm:p-3.5 shadow-2xs space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5 text-[#172033] dark:text-[#F8FAFC] font-semibold text-xs">
            <Filter className="h-3.5 w-3.5 text-[#059669] dark:text-emerald-400" />
            <span>Filtros de Análisis Comercial</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-2.5">
          {/* Period Selector */}
          <div>
            <label className="block text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8] mb-1 flex items-center space-x-1">
              <Calendar className="h-3 w-3 text-[#059669] dark:text-emerald-400" />
              <span>Periodo</span>
            </label>
            <select
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value as PeriodoVenta)}
              className="w-full bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#263449] text-[#172033] dark:text-[#F8FAFC] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#059669] dark:focus:border-emerald-500 transition-colors"
            >
              <option value="esta_semana">Esta semana</option>
              <option value="mes_actual">Mes actual</option>
              <option value="ultimos_30_dias">Últimos 30 días</option>
              <option value="personalizado">Personalizado</option>
            </select>
            {/* Real formatted date range display */}
            <div className="text-[10px] font-mono text-[#059669] dark:text-emerald-400 font-medium mt-1 truncate">
              {periodRanges.formattedRange}
            </div>
          </div>

          {/* Warehouse Filter */}
          <div>
            <label className="block text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8] mb-1 flex items-center space-x-1">
              <Warehouse className="h-3 w-3 text-[#059669] dark:text-emerald-400" />
              <span>Almacén</span>
            </label>
            <select
              value={selectedAlmacen}
              onChange={(e) => setSelectedAlmacen(e.target.value)}
              className="w-full bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#263449] text-[#172033] dark:text-[#F8FAFC] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#059669] dark:focus:border-emerald-500 transition-colors"
            >
              <option value="all">Todos los almacenes</option>
              {almacenes.map(alm => (
                <option key={alm.id} value={alm.id}>
                  {alm.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <label className="block text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8] mb-1 flex items-center space-x-1">
              <Layers className="h-3 w-3 text-[#059669] dark:text-emerald-400" />
              <span>Categoría</span>
            </label>
            <select
              value={selectedCategoria}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="w-full bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#263449] text-[#172033] dark:text-[#F8FAFC] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#059669] dark:focus:border-emerald-500 transition-colors"
            >
              <option value="all">Todas las categorías</option>
              {categorias.map(cat => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Product Filter (Filtered by Category) */}
          <div>
            <label className="block text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8] mb-1 flex items-center space-x-1">
              <Package className="h-3 w-3 text-[#059669] dark:text-emerald-400" />
              <span>Producto</span>
            </label>
            <select
              value={selectedSku}
              onChange={(e) => setSelectedSku(e.target.value)}
              className="w-full bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#263449] text-[#172033] dark:text-[#F8FAFC] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#059669] dark:focus:border-emerald-500 transition-colors"
            >
              <option value="all">Todos los productos {selectedCategoria !== "all" ? `(${productosFiltrados.length})` : ""}</option>
              {productosFiltrados.map(p => (
                <option key={p.sku} value={p.sku}>
                  {p.sku} - {p.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Unit of Measure Filter */}
          <div>
            <label className="block text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8] mb-1 flex items-center space-x-1">
              <Scale className="h-3 w-3 text-[#059669] dark:text-emerald-400" />
              <span>Unidad de medida</span>
            </label>
            <select
              value={selectedUnidad}
              onChange={(e) => setSelectedUnidad(e.target.value)}
              className="w-full bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#263449] text-[#172033] dark:text-[#F8FAFC] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#059669] dark:focus:border-emerald-500 transition-colors"
            >
              <option value="all">Todas las unidades</option>
              {unidadesDisponibles.map(u => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Custom Date Range picker if "personalizado" */}
        {periodo === "personalizado" && (
          <div className="pt-2 border-t border-[#E2E8F0] dark:border-[#263449] flex flex-col sm:flex-row items-center gap-3 text-xs text-[#172033] dark:text-[#F8FAFC]">
            <span className="font-semibold text-[#64748B] dark:text-[#94A3B8] text-[11px]">Rango de fechas:</span>
            <div className="flex items-center space-x-2">
              <span className="text-[#64748B] dark:text-[#94A3B8] text-[11px]">Desde:</span>
              <input
                type="date"
                value={customStartDate}
                max={customEndDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#263449] rounded-md px-2 py-1 text-[#172033] dark:text-[#F8FAFC] text-xs focus:border-[#059669] dark:focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-[#64748B] dark:text-[#94A3B8] text-[11px]">Hasta:</span>
              <input
                type="date"
                value={customEndDate}
                min={customStartDate}
                onChange={(e) => handleEndDateChange(e.target.value)}
                className="bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#263449] rounded-md px-2 py-1 text-[#172033] dark:text-[#F8FAFC] text-xs focus:border-[#059669] dark:focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Active interactive filter chips */}
        {(selectedSku !== "all" || selectedAlmacen !== "all" || selectedCategoria !== "all" || selectedUnidad !== "all") && (
          <div className="pt-2 border-t border-[#E2E8F0] dark:border-[#263449] flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-[#64748B] dark:text-[#94A3B8] mr-1">Filtros aplicados:</span>
            
            {selectedSku !== "all" && (
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-[#059669] dark:text-emerald-300">
                <span>Producto: {productosMap.get(selectedSku)?.nombre || selectedSku} ({selectedSku})</span>
                <button
                  onClick={() => setSelectedSku("all")}
                  className="hover:text-emerald-800 dark:hover:text-emerald-100 p-0.5 rounded"
                  title="Quitar filtro de producto"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}

            {selectedAlmacen !== "all" && (
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-cyan-50 dark:bg-cyan-950/50 border border-cyan-200 dark:border-cyan-800 text-cyan-700 dark:text-cyan-300">
                <span>Almacén: {almacenesMap.get(selectedAlmacen)?.nombre || selectedAlmacen}</span>
                <button
                  onClick={() => setSelectedAlmacen("all")}
                  className="hover:text-cyan-900 dark:hover:text-cyan-100 p-0.5 rounded"
                  title="Quitar filtro de almacén"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}

            {selectedCategoria !== "all" && (
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300">
                <span>Categoría: {selectedCategoria}</span>
                <button
                  onClick={() => handleCategoryChange("all")}
                  className="hover:text-indigo-900 dark:hover:text-indigo-100 p-0.5 rounded"
                  title="Quitar filtro de categoría"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}

            {selectedUnidad !== "all" && (
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300">
                <span>Unidad: {selectedUnidad}</span>
                <button
                  onClick={() => setSelectedUnidad("all")}
                  className="hover:text-amber-900 dark:hover:text-amber-100 p-0.5 rounded"
                  title="Quitar filtro de unidad"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Loading & Error States */}
      {loading ? (
        <div className="py-14 text-center text-[#64748B] dark:text-[#94A3B8]">
          <span className="h-6 w-6 border-2 border-[#059669] dark:border-emerald-400 border-t-transparent rounded-full animate-spin inline-block mb-2" />
          <p className="text-xs font-medium">Calculando métricas y análisis de ventas...</p>
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 text-center">
          <p className="text-xs font-semibold">{error}</p>
        </div>
      ) : (
        <>
          {/* Key Metric Cards - Evenly distributed in 4 columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            {/* Card 1: Total Units Sold */}
            <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-xl p-3.5 shadow-2xs relative overflow-hidden flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-[#64748B] dark:text-[#94A3B8] mb-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider">Total vendido</span>
                  <ShoppingBag className="h-3.5 w-3.5 text-[#059669] dark:text-emerald-400" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-[#172033] dark:text-[#F8FAFC] tracking-tight leading-snug">
                  {unitAnalysis.isSingleUnit ? (
                    <>
                      {metrics.totalUnitsSingle}{" "}
                      <span className="text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
                        {unitAnalysis.activeSingleUnit}
                      </span>
                    </>
                  ) : (
                    <span className="text-base sm:text-lg font-bold text-[#172033] dark:text-[#F8FAFC]">
                      {unitAnalysis.formattedBreakdown}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-2 text-[11px] text-[#64748B] dark:text-[#94A3B8] pt-1.5 border-t border-[#E2E8F0] dark:border-[#263449] flex items-center justify-between">
                <span>Total transacciones:</span>
                <span className="font-mono text-[#172033] dark:text-[#F8FAFC] font-medium">
                  {metrics.totalTransactions} operaciones
                </span>
              </div>
            </div>

            {/* Card 2: Top Selling Product */}
            <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-xl p-3.5 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-[#64748B] dark:text-[#94A3B8] mb-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider">Producto más vendido</span>
                  <Package className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="truncate">
                  <div className="text-sm font-bold text-[#172033] dark:text-[#F8FAFC] truncate" title={metrics.topProduct?.nombre || "Sin ventas"}>
                    {metrics.topProduct ? metrics.topProduct.nombre : "Sin ventas"}
                  </div>
                  <div className="text-[11px] font-mono text-[#059669] dark:text-emerald-400 font-medium">
                    {metrics.topProductSku || "—"}
                  </div>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-[#64748B] dark:text-[#94A3B8] pt-1.5 border-t border-[#E2E8F0] dark:border-[#263449] flex items-center justify-between">
                <span>Volumen:</span>
                <span className="font-mono font-semibold text-[#172033] dark:text-[#F8FAFC]">
                  {metrics.topProductUnits} {metrics.topProductUnit}
                </span>
              </div>
            </div>

            {/* Card 3: Top Warehouse */}
            <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-xl p-3.5 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-[#64748B] dark:text-[#94A3B8] mb-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider">Almacén con mayor venta</span>
                  <Building2 className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                </div>
                <div className="truncate">
                  <div className="text-sm font-bold text-[#172033] dark:text-[#F8FAFC] truncate" title={metrics.topWarehouse?.nombre || "Sin ventas"}>
                    {metrics.topWarehouse ? metrics.topWarehouse.nombre : "Sin ventas"}
                  </div>
                  <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate">
                    {metrics.topWarehouse ? metrics.topWarehouse.ubicacion : "—"}
                  </div>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-[#64748B] dark:text-[#94A3B8] pt-1.5 border-t border-[#E2E8F0] dark:border-[#263449] flex items-center justify-between">
                <span>Cantidad vendida:</span>
                <span className="font-mono font-semibold text-[#172033] dark:text-[#F8FAFC]">
                  {metrics.topWarehouseUnits} {unitAnalysis.isSingleUnit ? unitAnalysis.activeSingleUnit : "uds"}
                </span>
              </div>
            </div>

            {/* Card 4: Daily Average */}
            <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-xl p-3.5 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-[#64748B] dark:text-[#94A3B8] mb-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider">Promedio diario</span>
                  <CalendarDays className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-[#172033] dark:text-[#F8FAFC] tracking-tight leading-snug">
                  {unitAnalysis.isSingleUnit ? (
                    <>
                      {metrics.dailyAverageSingle.toFixed(1)}{" "}
                      <span className="text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
                        {unitAnalysis.activeSingleUnit}/día
                      </span>
                    </>
                  ) : (
                    <span className="text-xs sm:text-sm font-bold text-[#172033] dark:text-[#F8FAFC]">
                      {metrics.dailyAverageBreakdown}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-2 text-[11px] text-[#64748B] dark:text-[#94A3B8] pt-1.5 border-t border-[#E2E8F0] dark:border-[#263449] flex items-center justify-between">
                <span>Días evaluados:</span>
                <span className="font-mono text-[#172033] dark:text-[#F8FAFC] font-medium">
                  {metrics.daysElapsed} días
                </span>
              </div>
            </div>
          </div>

          {/* Automated Data Summary Card (Brief Bulleted Lines) */}
          <div className="bg-[#F8FAFC] dark:bg-[#182235] border border-[#E2E8F0] dark:border-[#263449] rounded-xl p-3.5 shadow-2xs">
            <div className="flex items-start space-x-2.5">
              <div className="p-1.5 rounded-lg bg-[#ECFDF5] dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-[#059669] dark:text-emerald-400 shrink-0 mt-0.5">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <div className="space-y-1.5 w-full">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#059669] dark:text-emerald-400">
                  Resumen de Comportamiento Comercial
                </h3>
                
                {filteredSummaries.length === 0 ? (
                  <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                    No se registran salidas de venta en el periodo consultado para los filtros seleccionados.
                  </p>
                ) : (
                  <ul className="text-xs text-[#172033] dark:text-[#F8FAFC] space-y-1">
                    {/* Line 1: Total volume & transactions */}
                    <li className="flex items-start space-x-1.5">
                      <span className="text-[#059669] dark:text-emerald-400 font-bold">•</span>
                      <span>
                        <strong>Total vendido:</strong> {unitAnalysis.isSingleUnit ? `${metrics.totalUnitsSingle} ${unitAnalysis.activeSingleUnit}` : unitAnalysis.formattedBreakdown} a través de {metrics.totalTransactions} operaciones de venta.
                      </span>
                    </li>

                    {/* Line 2: Top product */}
                    {metrics.topProduct && metrics.topProductUnits > 0 && (
                      <li className="flex items-start space-x-1.5">
                        <span className="text-[#059669] dark:text-emerald-400 font-bold">•</span>
                        <span>
                          <strong>Producto más vendido:</strong> {metrics.topProduct.nombre} ({metrics.topProductSku}) con {metrics.topProductUnits} {metrics.topProductUnit}.
                        </span>
                      </li>
                    )}

                    {/* Line 3: Top warehouse */}
                    {metrics.topWarehouse && metrics.topWarehouseUnits > 0 && (
                      <li className="flex items-start space-x-1.5">
                        <span className="text-[#059669] dark:text-emerald-400 font-bold">•</span>
                        <span>
                          <strong>Almacén con mayor venta:</strong> {metrics.topWarehouse.nombre} con {metrics.topWarehouseUnits} {unitAnalysis.isSingleUnit ? unitAnalysis.activeSingleUnit : "uds"}.
                        </span>
                      </li>
                    )}

                    {/* Line 4: Peak day */}
                    {peakDayInfo.peakDayUnits > 0 && (
                      <li className="flex items-start space-x-1.5">
                        <span className="text-[#059669] dark:text-emerald-400 font-bold">•</span>
                        <span>
                          El día {peakDayInfo.peakDayNumber} fue el de mayor venta con {peakDayInfo.peakDayUnits} {unitAnalysis.isSingleUnit ? unitAnalysis.activeSingleUnit : "uds"}.
                        </span>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* Charts Section: Conditioned on unit consistency and data presence */}
          {filteredSummaries.length === 0 ? (
            <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-xl p-8 text-center text-[#64748B] dark:text-[#94A3B8] shadow-2xs">
              <ShoppingBag className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm font-semibold text-[#172033] dark:text-[#F8FAFC]">Sin ventas registradas en este periodo</p>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1 max-w-md mx-auto">
                No se encontraron salidas comerciales de mercancía durante el rango de fechas seleccionado.
              </p>
            </div>
          ) : !unitAnalysis.isSingleUnit ? (
            /* Multi-unit Notice replacing charts */
            <div className="bg-white dark:bg-[#111827] border border-amber-200 dark:border-amber-800/60 rounded-xl p-7 text-center shadow-2xs space-y-3">
              <div className="w-10 h-10 mx-auto rounded-full bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/80">
                <Scale className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#172033] dark:text-[#F8FAFC]">
                  Selecciona una unidad de medida para comparar volúmenes.
                </h4>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1 max-w-md mx-auto">
                  Los resultados actuales combinan productos medidos en distintas unidades ({unitAnalysis.distinctUnits.join(", ")}). Elige una unidad para visualizar las gráficas volumétricas.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {unitAnalysis.distinctUnits.map((u) => (
                  <button
                    key={u}
                    onClick={() => setSelectedUnidad(u)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#F8FAFC] dark:bg-[#182235] hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-[#172033] dark:text-[#F8FAFC] hover:text-[#059669] dark:hover:text-emerald-400 border border-[#E2E8F0] dark:border-[#263449] hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors shadow-2xs cursor-pointer"
                  >
                    Filtrar por {u}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              {/* Chart 1: Ventas por día (Vertical Bar Chart) */}
              <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-xl p-4 shadow-2xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2.5">
                  <div>
                    <h3 className="text-sm font-bold text-[#172033] dark:text-[#F8FAFC] flex items-center space-x-1.5">
                      <BarChart3 className="h-4 w-4 text-[#059669] dark:text-emerald-400" />
                      <span>Ventas por día</span>
                    </h3>
                    <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                      Salidas diarias expresadas en {unitAnalysis.activeSingleUnit}
                    </p>
                  </div>
                </div>

                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={salesByDayData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#263449" : "#F1F5F9"} vertical={false} />
                      <XAxis dataKey="dia" stroke={isDark ? "#94A3B8" : "#94A3B8"} tick={{ fill: isDark ? "#94A3B8" : "#64748B", fontSize: 10 }} />
                      <YAxis stroke={isDark ? "#94A3B8" : "#94A3B8"} tick={{ fill: isDark ? "#94A3B8" : "#64748B", fontSize: 10 }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: isDark ? "#111827" : "#FFFFFF",
                          borderColor: isDark ? "#263449" : "#E2E8F0",
                          borderRadius: "0.5rem",
                          color: isDark ? "#F8FAFC" : "#172033",
                          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                          fontSize: "11px"
                        }}
                        formatter={(val: any) => [`${val} ${unitAnalysis.activeSingleUnit}`, "Ventas"]}
                      />
                      <Bar
                        dataKey="unidades"
                        name="Ventas"
                        fill="#059669"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Sub-grid for Chart 2 & Chart 3 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                {/* Chart 2: Ventas por producto (Horizontal Bar Chart) */}
                <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-xl p-4 shadow-2xs flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2.5">
                    <div>
                      <h3 className="text-sm font-bold text-[#172033] dark:text-[#F8FAFC] flex items-center space-x-1.5">
                        <Package className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                        <span>Ventas por producto</span>
                      </h3>
                      <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                        Ranking en {unitAnalysis.activeSingleUnit} (clic en una barra para filtrar)
                      </p>
                    </div>
                  </div>

                  <div className="h-56 w-full overflow-y-auto">
                    <ResponsiveContainer width="100%" height={Math.max(200, salesByProductData.length * 36)}>
                      <BarChart
                        layout="vertical"
                        data={salesByProductData}
                        margin={{ top: 5, right: 15, left: 15, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#263449" : "#F1F5F9"} horizontal={false} />
                        <XAxis type="number" stroke={isDark ? "#94A3B8" : "#94A3B8"} tick={{ fill: isDark ? "#94A3B8" : "#64748B", fontSize: 10 }} allowDecimals={false} />
                        <YAxis
                          type="category"
                          dataKey="sku"
                          stroke={isDark ? "#94A3B8" : "#94A3B8"}
                          tick={{ fill: isDark ? "#F8FAFC" : "#172033", fontSize: 10, fontWeight: 500 }}
                          width={85}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: isDark ? "#111827" : "#FFFFFF",
                            borderColor: isDark ? "#263449" : "#E2E8F0",
                            borderRadius: "0.5rem",
                            color: isDark ? "#F8FAFC" : "#172033",
                            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                            fontSize: "11px"
                          }}
                          formatter={(val: any, name: any, item: any) => [
                            `${val} ${item.payload.unidad || unitAnalysis.activeSingleUnit} — ${item.payload.nombre}`,
                            "Ventas"
                          ]}
                        />
                        <Bar
                          dataKey="unidades"
                          name="Ventas"
                          radius={[0, 4, 4, 0]}
                          cursor="pointer"
                          onClick={(data: any) => {
                            if (data && data.sku) {
                              handleSelectProductFromChart(data.sku);
                            }
                          }}
                        >
                          {salesByProductData.map((entry) => (
                            <Cell
                              key={`cell-${entry.sku}`}
                              fill={selectedSku === entry.sku ? "#4f46e5" : "#6366f1"}
                              opacity={selectedSku !== "all" && selectedSku !== entry.sku ? 0.35 : 1}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Chart 3: Ventas por almacén */}
                <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-xl p-4 shadow-2xs flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2.5">
                    <div>
                      <h3 className="text-sm font-bold text-[#172033] dark:text-[#F8FAFC] flex items-center space-x-1.5">
                        <Building2 className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                        <span>Ventas por almacén</span>
                      </h3>
                      <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                        Distribución en {unitAnalysis.activeSingleUnit} (clic para filtrar)
                      </p>
                    </div>
                  </div>

                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={salesByWarehouseData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#263449" : "#F1F5F9"} vertical={false} />
                        <XAxis dataKey="nombre" stroke={isDark ? "#94A3B8" : "#94A3B8"} tick={{ fill: isDark ? "#94A3B8" : "#64748B", fontSize: 10 }} />
                        <YAxis stroke={isDark ? "#94A3B8" : "#94A3B8"} tick={{ fill: isDark ? "#94A3B8" : "#64748B", fontSize: 10 }} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: isDark ? "#111827" : "#FFFFFF",
                            borderColor: isDark ? "#263449" : "#E2E8F0",
                            borderRadius: "0.5rem",
                            color: isDark ? "#F8FAFC" : "#172033",
                            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                            fontSize: "11px"
                          }}
                          formatter={(val: any) => [`${val} ${unitAnalysis.activeSingleUnit}`, "Ventas"]}
                        />
                        <Bar
                          dataKey="unidades"
                          name="Ventas"
                          fill="#0891b2"
                          radius={[4, 4, 0, 0]}
                          cursor="pointer"
                          onClick={(data: any) => {
                            if (data && data.id) {
                              handleSelectWarehouseFromChart(data.id);
                            }
                          }}
                        >
                          {salesByWarehouseData.map((entry) => (
                            <Cell
                              key={`alm-${entry.id}`}
                              fill={selectedAlmacen === entry.id ? "#0e7490" : "#0891b2"}
                              opacity={selectedAlmacen !== "all" && selectedAlmacen !== entry.id ? 0.35 : 1}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Related Sales Movements Detail Table */}
          <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-xl shadow-2xs overflow-hidden">
            <div className="p-3 sm:p-3.5 border-b border-[#E2E8F0] dark:border-[#263449] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
              <div>
                <h3 className="text-sm font-bold text-[#172033] dark:text-[#F8FAFC] flex items-center space-x-1.5">
                  <ShoppingBag className="h-4 w-4 text-[#059669] dark:text-emerald-400" />
                  <span>Detalle de Movimientos y Resúmenes de Venta</span>
                </h3>
                <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                  Registros agregados de venta correspondientes a los filtros de periodo, producto, almacén y unidad actuales
                </p>
              </div>
              <div className="flex items-center space-x-2.5">
                <span className="text-[11px] font-mono text-[#64748B] dark:text-[#94A3B8] bg-[#F8FAFC] dark:bg-[#182235] px-2 py-0.5 rounded border border-[#E2E8F0] dark:border-[#263449]">
                  {filteredSummaries.length} registros ({metrics.totalTransactions} transacciones)
                </span>
                {onNavigateToHistory && (
                  <button
                    onClick={() => onNavigateToHistory(selectedSku !== "all" ? selectedSku : undefined)}
                    className="text-xs text-[#059669] dark:text-emerald-400 hover:text-[#047857] dark:hover:text-emerald-300 font-semibold flex items-center space-x-1 transition-colors cursor-pointer"
                  >
                    <span>Ver en Historial</span>
                    <ChevronRight className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {filteredSummaries.length === 0 ? (
              <div className="py-12 text-center text-[#64748B] dark:text-[#94A3B8]">
                <Info className="h-6 w-6 mx-auto mb-1.5 opacity-50" />
                <p className="text-xs font-medium">No hay registros de venta en este periodo con los filtros activos.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F8FAFC] dark:bg-[#182235] text-[#64748B] dark:text-[#94A3B8] text-[11px] font-semibold uppercase tracking-wider border-b border-[#E2E8F0] dark:border-[#263449]">
                      <th className="py-2.5 px-3.5">Fecha</th>
                      <th className="py-2.5 px-3">Producto y SKU</th>
                      <th className="py-2.5 px-3">Almacén</th>
                      <th className="py-2.5 px-3 text-right">Cantidad Vendida</th>
                      <th className="py-2.5 px-3.5 text-right">Operaciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#263449] text-xs sm:text-sm">
                    {filteredSummaries.map((resumen, idx) => {
                      const prod = productosMap.get((resumen.sku || "").toUpperCase());
                      const alm = almacenesMap.get(resumen.almacen_id);
                      const u = prod?.unidad || "uds";
                      const fParts = resumen.fecha_str ? resumen.fecha_str.split("-") : [];
                      const fDisplay = fParts.length === 3 ? `${fParts[2]}/${fParts[1]}/${fParts[0]}` : resumen.fecha_str;

                      return (
                        <tr key={resumen.id || `${resumen.fecha_str}_${resumen.sku}_${resumen.almacen_id}_${idx}`} className="hover:bg-[#F1F5F9] dark:hover:bg-[#182235]/60 transition-colors">
                          <td className="py-2.5 px-3.5 whitespace-nowrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-[#F8FAFC] dark:bg-[#182235] border border-[#E2E8F0] dark:border-[#263449] text-[#059669] dark:text-emerald-400">
                              {fDisplay}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-[#172033] dark:text-[#F8FAFC] leading-tight">{prod ? prod.nombre : resumen.sku}</div>
                            <div className="text-[11px] font-mono text-[#059669] dark:text-emerald-400 font-medium">{resumen.sku}</div>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="font-medium text-[#172033] dark:text-[#F8FAFC] text-xs">{alm ? alm.nombre : resumen.almacen_id}</div>
                            <div className="text-[10px] text-[#64748B] dark:text-[#94A3B8]">{alm ? alm.ubicacion : ""}</div>
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400">
                              -{resumen.cantidad} {u}
                            </span>
                          </td>
                          <td className="py-2.5 px-3.5 text-right font-mono text-xs text-[#64748B] dark:text-[#94A3B8]">
                            {resumen.total_transacciones || 1} {((resumen.total_transacciones || 1) === 1 ? 'salida' : 'salidas')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
