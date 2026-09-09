/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { 
  UserCheck, 
  Search, 
  Calendar, 
  DollarSign, 
  ShoppingBag, 
  Package, 
  Clock, 
  ExternalLink, 
  MessageCircle, 
  Edit2, 
  RefreshCw, 
  AlertCircle, 
  ChevronRight, 
  TrendingUp, 
  Filter, 
  Sparkles, 
  Layers, 
  ArrowUpRight, 
  X,
  Phone,
  Instagram,
  User,
  CheckCircle2,
  CalendarDays,
  Hash,
  ShoppingBag as ShoppingBagIcon
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell
} from "recharts";
import { 
  Cliente, 
  Movimiento, 
  Almacen, 
  Producto, 
  TipoCliente 
} from "../types";
import { firestoreService } from "../lib/firebase";
import { useTheme } from "../context/ThemeContext";
import ClienteModal from "./ClienteModal";

interface AnalisisClientesProps {
  almacenes: Almacen[];
  productos: Producto[];
  preselectedClienteId?: string;
  onNavigateToClientes?: (clienteId?: string) => void;
  onNavigateToVentaNueva?: (clienteId?: string) => void;
}

type PeriodoAnalisis = "30d" | "3m" | "6m" | "anio_actual" | "todo";

interface SkuMetrics {
  sku: string;
  unidades: number;
  totalMxn: number;
}

interface VentaAgrupada {
  folio: string;
  fecha: Date;
  referencia?: string;
  usuario?: string;
  items: Movimiento[];
  totalUnidades: number;
  totalMxn: number;
}

const MONTH_NAMES_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export default function AnalisisClientes({
  almacenes,
  productos,
  preselectedClienteId,
  onNavigateToClientes,
  onNavigateToVentaNueva
}: AnalisisClientesProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // Clientes state
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(true);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);

  // Search in customer selector
  const [searchTerm, setSearchTerm] = useState("");
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);

  // Movements state for the selected client
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMovs, setLoadingMovs] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [movsError, setMovsError] = useState<string | null>(null);

  // Period filter
  const [periodo, setPeriodo] = useState<PeriodoAnalisis>("todo");

  // Chart type toggle
  const [chartType, setChartType] = useState<"area" | "bar">("area");

  // Modal edit cliente
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Lookup map for products
  const productosMap = useMemo(() => {
    const map = new Map<string, Producto>();
    productos.forEach(p => map.set(p.sku.toUpperCase(), p));
    return map;
  }, [productos]);

  // Lookup map for warehouses
  const almacenesMap = useMemo(() => {
    const map = new Map<string, Almacen>();
    almacenes.forEach(a => map.set(a.id, a));
    return map;
  }, [almacenes]);

  // Load clients catalogue on mount
  useEffect(() => {
    let isMounted = true;
    const unsubscribe = firestoreService.getClientesRealtime(
      (data) => {
        if (!isMounted) return;
        setClientes(data);
        setLoadingClientes(false);

        // Preselect client if provided via URL or prop
        if (preselectedClienteId && !selectedCliente) {
          const found = data.find(c => c.id === preselectedClienteId);
          if (found) {
            setSelectedCliente(found);
          }
        }
      },
      (err) => {
        if (!isMounted) return;
        console.warn("Aviso al cargar clientes para análisis:", err);
        setLoadingClientes(false);
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [preselectedClienteId]);

  // Normalize date helper
  const normalizeDate = useCallback((raw: any): Date => {
    if (!raw) return new Date();
    if (raw instanceof Date) return raw;
    if (typeof raw.toDate === "function") return raw.toDate();
    if (typeof raw.seconds === "number") return new Date(raw.seconds * 1000);
    return new Date(raw);
  }, []);

  // Fetch initial batch of movements when a client is selected
  const loadClientMovimientos = useCallback(async (clienteId: string) => {
    setLoadingMovs(true);
    setMovsError(null);
    setMovimientos([]);
    setLastDoc(null);
    setHasMore(false);

    try {
      const res = await firestoreService.getMovimientosByClientePaginated({
        clienteId,
        pageSize: 50
      });

      setMovimientos(res.items);
      setLastDoc(res.lastDoc);
      setHasMore(res.hasMore);
    } catch (err: any) {
      console.error("Error al consultar movimientos del cliente:", err);
      setMovsError(err?.message || "No se pudieron obtener las compras del cliente. Revisa la conexión o permisos.");
    } finally {
      setLoadingMovs(false);
    }
  }, []);

  // Handler when user selects a client
  const handleSelectCliente = (cliente: Cliente) => {
    setSelectedCliente(cliente);
    setIsSelectorOpen(false);
    setSearchTerm("");
    loadClientMovimientos(cliente.id || "");
  };

  // Handler for pagination "Cargar más"
  const handleLoadMore = async () => {
    if (!selectedCliente?.id || !lastDoc || loadingMore) return;
    setLoadingMore(true);

    try {
      const res = await firestoreService.getMovimientosByClientePaginated({
        clienteId: selectedCliente.id,
        pageSize: 50,
        lastDoc
      });

      setMovimientos(prev => [...prev, ...res.items]);
      setLastDoc(res.lastDoc);
      setHasMore(res.hasMore);
    } catch (err: any) {
      console.error("Error al cargar más compras del cliente:", err);
      setMovsError("Error al cargar más registros. Intenta nuevamente.");
    } finally {
      setLoadingMore(false);
    }
  };

  // Filter clients for selector search
  const filteredClientesList = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return clientes;
    const termNoSymbols = term.replace(/[@\s-]/g, "");

    return clientes.filter(c => {
      const matchName = (c.nombre_completo || "").toLowerCase().includes(term) ||
                        (c.nombre_normalizado || "").includes(term);
      const matchIg = (c.instagram || "").toLowerCase().includes(term) ||
                      (c.instagram_normalizado || "").includes(termNoSymbols);
      const cleanPhone = (c.telefono || "").replace(/\D/g, "");
      const matchPhone = cleanPhone.includes(termNoSymbols) || (c.telefono || "").includes(term);
      return matchName || matchIg || matchPhone;
    });
  }, [clientes, searchTerm]);

  // Date threshold based on selected period filter
  const periodDateThreshold = useMemo((): Date | null => {
    const now = new Date();
    switch (periodo) {
      case "30d": {
        const d = new Date(now);
        d.setDate(d.getDate() - 30);
        d.setHours(0, 0, 0, 0);
        return d;
      }
      case "3m": {
        const d = new Date(now);
        d.setMonth(d.getMonth() - 3);
        d.setHours(0, 0, 0, 0);
        return d;
      }
      case "6m": {
        const d = new Date(now);
        d.setMonth(d.getMonth() - 6);
        d.setHours(0, 0, 0, 0);
        return d;
      }
      case "anio_actual": {
        return new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      }
      case "todo":
      default:
        return null;
    }
  }, [periodo]);

  // Filter movements by validity: tipo == "salida", estado != "anulado", cliente_id == selectedCliente.id, and period
  const filteredMovimientos = useMemo(() => {
    if (!selectedCliente?.id) return [];

    return movimientos.filter(m => {
      if (m.tipo !== "salida") return false;
      if (m.estado === "anulado") return false;
      if (m.cliente_id !== selectedCliente.id) return false;

      if (periodDateThreshold) {
        const mDate = normalizeDate(m.fecha);
        if (mDate < periodDateThreshold) return false;
      }

      return true;
    });
  }, [movimientos, selectedCliente, periodDateThreshold, normalizeDate]);

  // Group movements by folio/sale for purchase tracking
  const ventasAgrupadas = useMemo((): VentaAgrupada[] => {
    const map = new Map<string, Movimiento[]>();

    filteredMovimientos.forEach(m => {
      // Use folio or id or timestamp group
      const folioKey = (m.folio && m.folio.trim()) 
        ? m.folio.trim() 
        : `Venta-${normalizeDate(m.fecha).toISOString().slice(0, 10)}_${m.id || ""}`;
      
      const list = map.get(folioKey) || [];
      list.push(m);
      map.set(folioKey, list);
    });

    const result: VentaAgrupada[] = [];
    map.forEach((items, folio) => {
      let totalUnits = 0;
      let totalMxn = 0;
      let earliestDate = normalizeDate(items[0]?.fecha);
      const ref = items[0]?.referencia;
      const usr = items[0]?.usuario;

      items.forEach(item => {
        const qty = Number(item.cantidad) || 0;
        totalUnits += qty;
        const itemTotal = typeof item.total_venta === "number"
          ? item.total_venta
          : (typeof item.precio_unitario_venta === "number" ? item.precio_unitario_venta * qty : 0);
        totalMxn += itemTotal;

        const d = normalizeDate(item.fecha);
        if (d > earliestDate) {
          earliestDate = d;
        }
      });

      result.push({
        folio,
        fecha: earliestDate,
        referencia: ref,
        usuario: usr,
        items,
        totalUnidades: totalUnits,
        totalMxn
      });
    });

    // Sort ventas descending by date
    result.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
    return result;
  }, [filteredMovimientos, normalizeDate]);

  // Commercial Metrics & Indicators
  const metrics = useMemo(() => {
    let totalComprado = 0;
    let unidadesAdquiridas = 0;
    let fechaUltimaCompra: Date | null = null;
    const skuMap = new Map<string, { sku: string; unidades: number; totalMxn: number }>();

    filteredMovimientos.forEach(m => {
      const qty = Number(m.cantidad) || 0;
      unidadesAdquiridas += qty;

      const val = typeof m.total_venta === "number"
        ? m.total_venta
        : (typeof m.precio_unitario_venta === "number" ? m.precio_unitario_venta * qty : 0);
      totalComprado += val;

      const d = normalizeDate(m.fecha);
      if (!fechaUltimaCompra || d > fechaUltimaCompra) {
        fechaUltimaCompra = d;
      }

      const skuKey = (m.sku || "").trim().toUpperCase();
      const existing = skuMap.get(skuKey) || { sku: skuKey, unidades: 0, totalMxn: 0 };
      existing.unidades += qty;
      existing.totalMxn += val;
      skuMap.set(skuKey, existing);
    });

    const numeroCompras = ventasAgrupadas.length;
    const ticketPromedio = numeroCompras > 0 ? totalComprado / numeroCompras : 0;

    let diasDesdeUltimaCompra: number | null = null;
    if (fechaUltimaCompra) {
      const diffMs = new Date().getTime() - (fechaUltimaCompra as Date).getTime();
      diasDesdeUltimaCompra = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    }

    // Top product
    let topProductSku = "";
    let topProductUnits = 0;
    let topProductMxn = 0;

    skuMap.forEach((data, sku) => {
      if (data.unidades > topProductUnits) {
        topProductUnits = data.unidades;
        topProductSku = sku;
        topProductMxn = data.totalMxn;
      }
    });

    const topProduct = topProductSku ? productosMap.get(topProductSku) : null;

    return {
      totalComprado,
      numeroCompras,
      unidadesAdquiridas,
      ticketPromedio,
      fechaUltimaCompra,
      diasDesdeUltimaCompra,
      topProductSku,
      topProductUnits,
      topProductMxn,
      topProduct,
      skuMap
    };
  }, [filteredMovimientos, ventasAgrupadas, productosMap, normalizeDate]);

  // Ranking of top purchased products
  const rankingProductos = useMemo(() => {
    const list: SkuMetrics[] = Array.from(metrics.skuMap.values());
    list.sort((a, b) => b.unidades - a.unidades || b.totalMxn - a.totalMxn);

    return list.map((item: SkuMetrics) => {
      const prod = productosMap.get(item.sku);
      return {
        sku: item.sku,
        unidades: item.unidades,
        totalMxn: item.totalMxn,
        nombre: prod?.nombre || "Producto desconocido",
        marca: prod?.marca || "",
        categoria: prod?.categoria || "General",
        color: prod?.color,
        talla: prod?.talla,
        unidad: prod?.unidad || "uds"
      };
    });
  }, [metrics.skuMap, productosMap]);

  // Chart data: "Compras a través del tiempo"
  const chartData = useMemo(() => {
    if (filteredMovimientos.length === 0) return [];

    const now = new Date();
    const bucketsMap = new Map<string, { label: string; fechaKey: string; importe: number; comprasSet: Set<string>; unidades: number }>();

    if (periodo === "30d") {
      // Last 30 daily buckets
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const key = `${y}-${m}-${day}`;
        const label = `${d.getDate()} ${MONTH_NAMES_SHORT[d.getMonth()]}`;
        bucketsMap.set(key, { label, fechaKey: key, importe: 0, comprasSet: new Set<string>(), unidades: 0 });
      }

      filteredMovimientos.forEach(m => {
        const d = normalizeDate(m.fecha);
        const y = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const key = `${y}-${mo}-${day}`;

        const bucket = bucketsMap.get(key);
        if (bucket) {
          const qty = Number(m.cantidad) || 0;
          const val = typeof m.total_venta === "number" 
            ? m.total_venta 
            : (typeof m.precio_unitario_venta === "number" ? m.precio_unitario_venta * qty : 0);
          bucket.importe += val;
          bucket.unidades += qty;
          const saleId = m.folio || m.id || `${m.sku}_${d.getTime()}`;
          bucket.comprasSet.add(saleId);
        }
      });
    } else if (periodo === "3m") {
      // Weekly buckets across 12-13 weeks
      for (let i = 12; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i * 7);
        const weekNum = Math.ceil((d.getDate() - 1 - d.getDay()) / 7);
        const key = `w_${d.getFullYear()}_${d.getMonth()}_${weekNum}`;
        const label = `Sem ${d.getDate()} ${MONTH_NAMES_SHORT[d.getMonth()]}`;
        if (!bucketsMap.has(key)) {
          bucketsMap.set(key, { label, fechaKey: key, importe: 0, comprasSet: new Set<string>(), unidades: 0 });
        }
      }

      filteredMovimientos.forEach(m => {
        const d = normalizeDate(m.fecha);
        const weekNum = Math.ceil((d.getDate() - 1 - d.getDay()) / 7);
        const key = `w_${d.getFullYear()}_${d.getMonth()}_${weekNum}`;

        let bucket = bucketsMap.get(key);
        if (!bucket) {
          const label = `Sem ${d.getDate()} ${MONTH_NAMES_SHORT[d.getMonth()]}`;
          bucket = { label, fechaKey: key, importe: 0, comprasSet: new Set<string>(), unidades: 0 };
          bucketsMap.set(key, bucket);
        }
        const qty = Number(m.cantidad) || 0;
        const val = typeof m.total_venta === "number" 
          ? m.total_venta 
          : (typeof m.precio_unitario_venta === "number" ? m.precio_unitario_venta * qty : 0);
        bucket.importe += val;
        bucket.unidades += qty;
        const saleId = m.folio || m.id || `${m.sku}_${d.getTime()}`;
        bucket.comprasSet.add(saleId);
      });
    } else {
      // Monthly buckets
      const monthsCount = periodo === "6m" ? 6 : periodo === "anio_actual" ? (now.getMonth() + 1) : 12;

      for (let i = monthsCount - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = `${MONTH_NAMES_SHORT[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
        bucketsMap.set(key, { label, fechaKey: key, importe: 0, comprasSet: new Set<string>(), unidades: 0 });
      }

      filteredMovimientos.forEach(m => {
        const d = normalizeDate(m.fecha);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        let bucket = bucketsMap.get(key);
        if (!bucket) {
          const label = `${MONTH_NAMES_SHORT[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
          bucket = { label, fechaKey: key, importe: 0, comprasSet: new Set<string>(), unidades: 0 };
          bucketsMap.set(key, bucket);
        }
        const qty = Number(m.cantidad) || 0;
        const val = typeof m.total_venta === "number" 
          ? m.total_venta 
          : (typeof m.precio_unitario_venta === "number" ? m.precio_unitario_venta * qty : 0);
        bucket.importe += val;
        bucket.unidades += qty;
        const saleId = m.folio || m.id || `${m.sku}_${d.getTime()}`;
        bucket.comprasSet.add(saleId);
      });
    }

    return Array.from(bucketsMap.values()).map(b => ({
      label: b.label,
      importe: Math.round(b.importe * 100) / 100,
      compras: b.comprasSet.size,
      unidades: b.unidades
    }));
  }, [filteredMovimientos, periodo, normalizeDate]);

  // Format currency
  const formatMxn = (val: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(val);
  };

  // Format date readable
  const formatDateReadable = (d: any) => {
    if (!d) return "—";
    const dateObj = normalizeDate(d);
    if (isNaN(dateObj.getTime())) return "—";
    return dateObj.toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  };

  // Badge styles by customer type
  const getTipoBadge = (tipo: TipoCliente) => {
    switch (tipo) {
      case "mayorista":
        return "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20";
      case "emprendedor":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20";
      case "minorista":
      default:
        return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20";
    }
  };

  // WhatsApp & Instagram links
  const formatWhatsAppLink = (phone?: string) => {
    if (!phone) return null;
    const clean = phone.replace(/\D/g, "");
    if (!clean) return null;
    return `https://wa.me/${clean}`;
  };

  const formatInstagramLink = (ig?: string) => {
    if (!ig) return null;
    const clean = ig.trim().replace(/^@+/, "");
    if (!clean) return null;
    return `https://instagram.com/${clean}`;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 select-none" id="analisis-clientes-view">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                Análisis de clientes
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Consulta indicadores de compra, métricas individuales y comportamiento por cliente
              </p>
            </div>
          </div>
        </div>

        {/* Quick action back to general Clientes module if needed */}
        {onNavigateToClientes && (
          <button
            type="button"
            onClick={() => onNavigateToClientes()}
            className="self-start md:self-auto text-xs font-semibold px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 text-zinc-600 dark:text-zinc-300 transition-colors flex items-center gap-1.5"
          >
            <span>Ver Directorio de Clientes</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Customer Selector & Search Toolbar */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs space-y-3" id="cliente-selector-container">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
              Cliente a analizar:
            </span>
          </div>

          {selectedCliente && (
            <button
              type="button"
              onClick={() => {
                setSelectedCliente(null);
                setMovimientos([]);
              }}
              className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cambiar cliente</span>
            </button>
          )}
        </div>

        {/* Selector Input / Dropdown Button */}
        <div className="relative">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
              <input
                type="text"
                id="cliente-search-input"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setIsSelectorOpen(true);
                }}
                onFocus={() => setIsSelectorOpen(true)}
                placeholder={selectedCliente ? `${selectedCliente.nombre_completo} (Buscar otro por nombre, @instagram o teléfono...)` : "Buscar cliente por nombre, @instagram o teléfono..."}
                className="w-full pl-10 pr-10 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <button
              type="button"
              id="cliente-dropdown-toggle"
              onClick={() => setIsSelectorOpen(!isSelectorOpen)}
              className="px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-200 transition-colors flex items-center gap-1.5 shrink-0"
            >
              <span>{isSelectorOpen ? "Cerrar lista" : "Desplegar lista"}</span>
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isSelectorOpen ? "rotate-90" : ""}`} />
            </button>
          </div>

          {/* Results Dropdown */}
          {isSelectorOpen && (
            <div className="absolute z-30 left-0 right-0 mt-2 max-h-72 overflow-y-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {loadingClientes ? (
                <div className="p-4 text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  <span>Cargando clientes...</span>
                </div>
              ) : filteredClientesList.length === 0 ? (
                <div className="p-6 text-center space-y-2">
                  <p className="text-xs text-zinc-400">No se encontraron clientes con "{searchTerm}"</p>
                  {onNavigateToClientes && (
                    <button
                      type="button"
                      onClick={() => onNavigateToClientes()}
                      className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline inline-block"
                    >
                      Registrar nuevo cliente en el directorio
                    </button>
                  )}
                </div>
              ) : (
                filteredClientesList.map((c) => {
                  const isCurrent = selectedCliente?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      id={`select-cliente-${c.id}`}
                      onClick={() => handleSelectCliente(c)}
                      className={`w-full p-3 text-left hover:bg-emerald-50/60 dark:hover:bg-emerald-950/20 transition-colors flex items-center justify-between gap-3 ${
                        isCurrent ? "bg-emerald-50/80 dark:bg-emerald-950/40 font-semibold" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                            {c.nombre_completo}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider shrink-0 ${getTipoBadge(c.tipo_cliente)}`}>
                            {c.tipo_cliente}
                          </span>
                          {(c.estado || "activo") === "inactivo" && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 font-medium">
                              Inactivo
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                          {c.instagram && (
                            <span className="flex items-center gap-1 font-mono">
                              <Instagram className="w-3 h-3 text-zinc-400" />
                              @{c.instagram.replace(/^@+/, "")}
                            </span>
                          )}
                          {c.telefono && (
                            <span className="flex items-center gap-1 font-mono">
                              <Phone className="w-3 h-3 text-zinc-400" />
                              {c.telefono}
                            </span>
                          )}
                          {c.canal_preferido && (
                            <span className="text-[11px] text-zinc-400">
                              Canal: {c.canal_preferido}
                            </span>
                          )}
                        </div>
                      </div>

                      {isCurrent ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-bold shrink-0">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Seleccionado</span>
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-400 hover:text-emerald-600 font-medium shrink-0">
                          Seleccionar
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* INITIAL STATE: When no client is selected yet */}
      {!selectedCliente && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-12 text-center space-y-4 shadow-xs" id="cliente-empty-selection">
          <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
            <UserCheck className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Selecciona un cliente para consultar su actividad
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Utiliza el buscador superior para elegir a un cliente por nombre, Instagram o teléfono. Podrás visualizar sus métricas comerciales, historial completo de ventas, ranking de prendas y gráficos temporales.
            </p>
          </div>

          {/* Quick list of first 5 clients for 1-click discovery */}
          {clientes.length > 0 && (
            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800/60 max-w-xl mx-auto">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block mb-3">
                Clientes recientes para selección rápida
              </span>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {clientes.slice(0, 6).map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelectCliente(c)}
                    className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800/70 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:border-emerald-500/40 border border-zinc-200 dark:border-zinc-700/70 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-200 transition-all flex items-center gap-1.5"
                  >
                    <span>{c.nombre_completo}</span>
                    <span className="text-[10px] text-zinc-400 font-normal">({c.tipo_cliente})</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SELECTED CLIENT VIEW */}
      {selectedCliente && (
        <div className="space-y-6" id="cliente-activity-content">
          {/* 3. Compact Customer Card */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-xs relative overflow-hidden" id="ficha-cliente-compacta">
            {/* Top row: Name, Badge, Actions */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-zinc-100 dark:border-zinc-800/60">
              <div className="flex items-start sm:items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-bold text-lg flex items-center justify-center shadow-xs shrink-0">
                  {selectedCliente.nombre_completo.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg sm:text-xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
                      {selectedCliente.nombre_completo}
                    </h2>
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border uppercase tracking-wider ${getTipoBadge(selectedCliente.tipo_cliente)}`}>
                      {selectedCliente.tipo_cliente}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                      (selectedCliente.estado || "activo") === "activo"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-zinc-200 dark:bg-zinc-800 text-zinc-500"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        (selectedCliente.estado || "activo") === "activo" ? "bg-emerald-500" : "bg-zinc-400"
                      }`} />
                      {(selectedCliente.estado || "activo") === "activo" ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Canal preferido: <strong className="text-zinc-700 dark:text-zinc-200">{selectedCliente.canal_preferido || "WhatsApp"}</strong>
                    {selectedCliente.origen && (
                      <> • Origen: <span className="text-zinc-700 dark:text-zinc-200">{selectedCliente.origen}</span></>
                    )}
                  </p>
                </div>
              </div>

              {/* Action Buttons: Editar, Instagram, WhatsApp */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  id="btn-editar-cliente"
                  onClick={() => setIsEditModalOpen(true)}
                  className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-200 transition-colors flex items-center gap-1.5"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Editar cliente</span>
                </button>

                {selectedCliente.instagram && formatInstagramLink(selectedCliente.instagram) && (
                  <a
                    href={formatInstagramLink(selectedCliente.instagram)!}
                    target="_blank"
                    rel="noreferrer"
                    id="btn-abrir-instagram"
                    className="px-3 py-1.5 bg-gradient-to-r from-purple-500/10 to-pink-500/10 hover:from-purple-500/20 hover:to-pink-500/20 border border-purple-500/20 text-purple-700 dark:text-purple-300 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <Instagram className="w-3.5 h-3.5" />
                    <span>Instagram</span>
                    <ExternalLink className="w-3 h-3 opacity-70" />
                  </a>
                )}

                {selectedCliente.telefono && formatWhatsAppLink(selectedCliente.telefono) && (
                  <a
                    href={formatWhatsAppLink(selectedCliente.telefono)!}
                    target="_blank"
                    rel="noreferrer"
                    id="btn-abrir-whatsapp"
                    className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                    <ExternalLink className="w-3 h-3 opacity-70" />
                  </a>
                )}

                {onNavigateToVentaNueva && (
                  <button
                    type="button"
                    id="btn-nueva-venta-cliente"
                    onClick={() => onNavigateToVentaNueva(selectedCliente.id)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>Nueva Venta</span>
                  </button>
                )}
              </div>
            </div>

            {/* Bottom row: Details & notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-4 text-xs">
              <div>
                <span className="text-[11px] text-zinc-400 block font-medium">Teléfono / Celular:</span>
                <span className="text-zinc-800 dark:text-zinc-200 font-mono font-medium">
                  {selectedCliente.telefono || "No registrado"}
                </span>
              </div>

              <div>
                <span className="text-[11px] text-zinc-400 block font-medium">Instagram:</span>
                <span className="text-zinc-800 dark:text-zinc-200 font-mono font-medium">
                  {selectedCliente.instagram ? `@${selectedCliente.instagram.replace(/^@+/, "")}` : "No registrado"}
                </span>
              </div>

              <div>
                <span className="text-[11px] text-zinc-400 block font-medium">Próximo seguimiento:</span>
                <span className="text-zinc-800 dark:text-zinc-200 font-medium">
                  {selectedCliente.proximo_seguimiento ? formatDateReadable(selectedCliente.proximo_seguimiento) : "Sin agendar"}
                </span>
              </div>

              <div>
                <span className="text-[11px] text-zinc-400 block font-medium">Notas internas:</span>
                <span className="text-zinc-700 dark:text-zinc-300 truncate block" title={selectedCliente.notas || ""}>
                  {selectedCliente.notas || "Sin notas adicionales"}
                </span>
              </div>
            </div>
          </div>

          {/* 5. Period Filter Toolbar */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3" id="periodo-toolbar">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-zinc-400 shrink-0" />
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                Periodo:
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtro de periodo">
              {(
                [
                  { id: "30d", label: "Últimos 30 días" },
                  { id: "3m", label: "Últimos 3 meses" },
                  { id: "6m", label: "Últimos 6 meses" },
                  { id: "anio_actual", label: "Año actual" },
                  { id: "todo", label: "Todo el historial" }
                ] as const
              ).map((p) => {
                const isActive = periodo === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    id={`periodo-btn-${p.id}`}
                    onClick={() => setPeriodo(p.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      isActive
                        ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xs"
                        : "bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700/70"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error Message with Retry */}
          {movsError && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-between gap-3 text-rose-700 dark:text-rose-400 text-xs">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{movsError}</span>
              </div>
              <button
                type="button"
                onClick={() => selectedCliente?.id && loadClientMovimientos(selectedCliente.id)}
                className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold shrink-0 cursor-pointer"
              >
                Reintentar
              </button>
            </div>
          )}

          {/* Initial Loading Skeleton */}
          {loadingMovs ? (
            <div className="space-y-4 animate-pulse">
              {/* KPIs Skeleton */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                {[...Array(7)].map((_, i) => (
                  <div key={i} className="h-20 bg-zinc-200 dark:bg-zinc-800 rounded-2xl" />
                ))}
              </div>
              {/* Chart Skeleton */}
              <div className="h-64 bg-zinc-200 dark:bg-zinc-800 rounded-3xl" />
              {/* Tables Skeleton */}
              <div className="h-48 bg-zinc-200 dark:bg-zinc-800 rounded-3xl" />
            </div>
          ) : filteredMovimientos.length === 0 ? (
            /* 9. Empty state: Client has no sales in selected period */
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-12 text-center space-y-4 shadow-xs" id="cliente-sin-ventas-estado">
              <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-400 mx-auto flex items-center justify-center">
                <ShoppingBag className="w-7 h-7" />
              </div>
              <div className="max-w-md mx-auto space-y-1.5">
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  {movimientos.length === 0
                    ? "Este cliente aún no registra compras"
                    : "No se registran compras en el periodo seleccionado"}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  {movimientos.length === 0
                    ? "Al registrar ventas con folio y vincular a este cliente, aquí se calcularán automáticamente todos sus indicadores, rankings y gráficas."
                    : "Cambia el filtro de periodo a 'Todo el historial' para consultar las ventas anteriores."}
                </p>
              </div>

              {movimientos.length > 0 && periodo !== "todo" ? (
                <button
                  type="button"
                  onClick={() => setPeriodo("todo")}
                  className="px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-xs"
                >
                  <RotateCcwIcon className="w-3.5 h-3.5" />
                  <span>Ver todo el historial</span>
                </button>
              ) : onNavigateToVentaNueva ? (
                <button
                  type="button"
                  onClick={() => onNavigateToVentaNueva(selectedCliente.id)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-xs"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Registrar primera venta</span>
                </button>
              ) : null}
            </div>
          ) : (
            /* 4. Commercial Indicators / KPIs Cards */
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3" id="kpis-cliente-grid">
                {/* Total Comprado */}
                <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block">
                    Total Comprado
                  </span>
                  <span className="text-base sm:text-lg font-black font-mono text-zinc-900 dark:text-white mt-1 block">
                    {formatMxn(metrics.totalComprado)}
                  </span>
                  <span className="text-[10px] text-zinc-400 mt-0.5 block">MXN acumulado</span>
                </div>

                {/* Número de Compras */}
                <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block">
                    Número de Compras
                  </span>
                  <span className="text-base sm:text-lg font-black font-mono text-zinc-900 dark:text-white mt-1 block">
                    {metrics.numeroCompras}
                  </span>
                  <span className="text-[10px] text-zinc-400 mt-0.5 block">Ventas agrupadas</span>
                </div>

                {/* Unidades Adquiridas */}
                <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block">
                    Unidades Adquiridas
                  </span>
                  <span className="text-base sm:text-lg font-black font-mono text-zinc-900 dark:text-white mt-1 block">
                    {metrics.unidadesAdquiridas}
                  </span>
                  <span className="text-[10px] text-zinc-400 mt-0.5 block">Prendas / Pares</span>
                </div>

                {/* Ticket Promedio */}
                <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block">
                    Ticket Promedio
                  </span>
                  <span className="text-base sm:text-lg font-black font-mono text-zinc-900 dark:text-white mt-1 block">
                    {formatMxn(metrics.ticketPromedio)}
                  </span>
                  <span className="text-[10px] text-zinc-400 mt-0.5 block">Por venta</span>
                </div>

                {/* Última Compra */}
                <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block">
                    Última Compra
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white mt-1 block truncate">
                    {metrics.fechaUltimaCompra ? formatDateReadable(metrics.fechaUltimaCompra) : "—"}
                  </span>
                  <span className="text-[10px] text-zinc-400 mt-0.5 block">Fecha de salida</span>
                </div>

                {/* Días desde última compra */}
                <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block">
                    Días sin comprar
                  </span>
                  <span className="text-base sm:text-lg font-black font-mono text-zinc-900 dark:text-white mt-1 block">
                    {metrics.diasDesdeUltimaCompra !== null ? `${metrics.diasDesdeUltimaCompra} d` : "—"}
                  </span>
                  <span className="text-[10px] text-zinc-400 mt-0.5 block">
                    {metrics.diasDesdeUltimaCompra === 0 ? "Compró hoy" : metrics.diasDesdeUltimaCompra !== null ? `Hace ${metrics.diasDesdeUltimaCompra} días` : "—"}
                  </span>
                </div>

                {/* Producto Más Comprado */}
                <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs col-span-2 sm:col-span-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block">
                    Top Producto
                  </span>
                  <span className="text-xs font-bold text-zinc-900 dark:text-white mt-1 block truncate" title={metrics.topProduct?.nombre || metrics.topProductSku}>
                    {metrics.topProduct?.nombre || metrics.topProductSku || "—"}
                  </span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-semibold mt-0.5 block">
                    {metrics.topProductUnits > 0 ? `${metrics.topProductUnits} unidades` : "—"}
                  </span>
                </div>
              </div>

              {/* 6. Main Chart: "Compras a través del tiempo" */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-xs space-y-4" id="grafica-compras-tiempo">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                        Compras a través del tiempo
                      </h3>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Evolución del importe comprado en MXN y número de compras por intervalo
                    </p>
                  </div>

                  {/* Chart type toggle (Area vs Bar) */}
                  <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setChartType("area")}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                        chartType === "area"
                          ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs"
                          : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                      }`}
                    >
                      Línea
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartType("bar")}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                        chartType === "bar"
                          ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs"
                          : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                      }`}
                    >
                      Barras
                    </button>
                  </div>
                </div>

                {chartData.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center text-center p-6 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
                    <AlertCircle className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mb-2" />
                    <p className="text-xs text-zinc-400 font-medium">Sin compras registradas en este periodo</p>
                  </div>
                ) : (
                  <div className="h-64 sm:h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      {chartType === "area" ? (
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                          <defs>
                            <linearGradient id="clientSalesGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#27272a" : "#f4f4f5"} />
                          <XAxis
                            dataKey="label"
                            stroke={isDark ? "#71717a" : "#a1a1aa"}
                            fontSize={11}
                            tickLine={false}
                            interval="preserveStartEnd"
                          />
                          <YAxis
                            stroke={isDark ? "#71717a" : "#a1a1aa"}
                            fontSize={11}
                            tickLine={false}
                            tickFormatter={(val) => `$${val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}`}
                          />
                          <Tooltip content={<CustomChartTooltip />} />
                          <Area
                            type="monotone"
                            dataKey="importe"
                            stroke="#10b981"
                            strokeWidth={2.5}
                            fillOpacity={1}
                            fill="url(#clientSalesGradient)"
                          />
                        </AreaChart>
                      ) : (
                        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#27272a" : "#f4f4f5"} />
                          <XAxis
                            dataKey="label"
                            stroke={isDark ? "#71717a" : "#a1a1aa"}
                            fontSize={11}
                            tickLine={false}
                            interval="preserveStartEnd"
                          />
                          <YAxis
                            stroke={isDark ? "#71717a" : "#a1a1aa"}
                            fontSize={11}
                            tickLine={false}
                            tickFormatter={(val) => `$${val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}`}
                          />
                          <Tooltip content={<CustomChartTooltip />} />
                          <Bar dataKey="importe" fill="#10b981" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* 7. Bottom Sections: Ranking & Recent Sales History */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="detalles-cliente-grid">
                {/* Ranking de productos más comprados */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                        Ranking de productos más comprados
                      </h3>
                    </div>
                    <span className="text-[11px] text-zinc-400 font-mono">
                      {rankingProductos.length} modelos
                    </span>
                  </div>

                  {rankingProductos.length === 0 ? (
                    <div className="p-8 text-center text-xs text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
                      No hay productos registrados en este periodo.
                    </div>
                  ) : (
                    <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800/60 text-xs">
                      {rankingProductos.map((item, idx) => (
                        <div
                          key={item.sku}
                          className="p-3 bg-white dark:bg-zinc-900/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-5 h-5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-mono text-[11px] font-bold flex items-center justify-center shrink-0">
                              #{idx + 1}
                            </span>
                            <div className="min-w-0">
                              <span className="font-bold text-zinc-900 dark:text-white truncate block">
                                {item.nombre}
                              </span>
                              <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-zinc-400 font-mono">
                                <span>SKU: {item.sku}</span>
                                {item.marca && <span>• {item.marca}</span>}
                                {item.talla && <span>• Talla: {item.talla}</span>}
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="font-bold font-mono text-zinc-900 dark:text-white block">
                              {item.unidades} {item.unidad}
                            </span>
                            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono font-semibold block">
                              {formatMxn(item.totalMxn)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Historial de ventas recientes */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                        Historial de ventas recientes
                      </h3>
                    </div>
                    <span className="text-[11px] text-zinc-400 font-mono">
                      {ventasAgrupadas.length} compras en lista
                    </span>
                  </div>

                  {ventasAgrupadas.length === 0 ? (
                    <div className="p-8 text-center text-xs text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
                      No hay compras registradas en este periodo.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800/60 text-xs">
                        {ventasAgrupadas.map((v) => (
                          <div
                            key={v.folio}
                            className="p-3.5 bg-white dark:bg-zinc-900/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors space-y-2"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-zinc-900 dark:text-white">
                                  {v.folio}
                                </span>
                                <span className="text-[11px] text-zinc-400">
                                  {formatDateReadable(v.fecha)}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="font-mono font-extrabold text-zinc-900 dark:text-white">
                                  {formatMxn(v.totalMxn)}
                                </span>
                              </div>
                            </div>

                            {/* Products in this sale */}
                            <div className="space-y-1 pt-1 border-t border-zinc-100 dark:border-zinc-800/40">
                              {v.items.map((item, i) => {
                                const prod = productosMap.get(item.sku);
                                const itemVal = typeof item.total_venta === "number"
                                  ? item.total_venta
                                  : (typeof item.precio_unitario_venta === "number" ? item.precio_unitario_venta * item.cantidad : 0);

                                return (
                                  <div key={i} className="flex items-center justify-between text-[11px] text-zinc-600 dark:text-zinc-300">
                                    <span className="truncate pr-2">
                                      {item.cantidad}x {prod?.nombre || item.sku}
                                      {prod?.talla ? ` (${prod.talla})` : ""}
                                    </span>
                                    <span className="font-mono text-zinc-400 shrink-0">
                                      {formatMxn(itemVal)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-0.5">
                              <span>Total: {v.totalUnidades} prendas</span>
                              {v.referencia && <span className="italic truncate max-w-[200px]">Ref: {v.referencia}</span>}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Pagination "Cargar más" (50 registros) */}
                      {hasMore && (
                        <div className="pt-2 text-center">
                          <button
                            type="button"
                            id="btn-cargar-mas-compras"
                            onClick={handleLoadMore}
                            disabled={loadingMore}
                            className="w-full py-2.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-zinc-800 dark:text-zinc-200 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                          >
                            {loadingMore ? (
                              <>
                                <span className="w-3.5 h-3.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                                <span>Cargando más ventas...</span>
                              </>
                            ) : (
                              <>
                                <span>Cargar 50 compras anteriores</span>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Edit Cliente Modal */}
      {selectedCliente && (
        <ClienteModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          clienteToEdit={selectedCliente}
          existingClientes={clientes}
          onClienteSaved={(saved) => {
            setIsEditModalOpen(false);
            setSelectedCliente(saved);
          }}
        />
      )}
    </div>
  );
}

// Custom Tooltip for Chart
function CustomChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload;

  return (
    <div className="p-3 bg-zinc-900 text-white border border-zinc-700 rounded-xl shadow-xl text-xs space-y-1">
      <span className="font-bold text-zinc-300 block border-b border-zinc-800 pb-1">
        {data.label || label}
      </span>
      <div className="flex items-center justify-between gap-4">
        <span className="text-zinc-400">Importe comprado:</span>
        <strong className="font-mono text-emerald-400">
          ${Number(data.importe || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN
        </strong>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-zinc-400">Número de compras:</span>
        <strong className="font-mono text-white">
          {data.compras || 0}
        </strong>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-zinc-400">Unidades adquiridas:</span>
        <strong className="font-mono text-zinc-300">
          {data.unidades || 0}
        </strong>
      </div>
    </div>
  );
}

function RotateCcwIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}
