/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { firestoreService } from "../lib/firebase";
import { Almacen, Producto, StockItem } from "../types";
import { 
  Search, 
  Warehouse, 
  AlertTriangle, 
  Layers, 
  TrendingDown, 
  Filter, 
  ArrowRightLeft,
  Plus,
  Tag,
  Building2,
  AlertCircle,
  Shirt,
  Bookmark,
  ShoppingBag,
  ShoppingCart
} from "lucide-react";

interface DashboardProps {
  almacenes: Almacen[];
  productos: Producto[];
  onNavigateToCompra?: (sku?: string, almacenId?: string) => void;
  onNavigateToVenta?: (sku?: string, almacenId?: string) => void;
  onNavigateToTransferencia?: (sku?: string, almacenId?: string) => void;
  onNavigateToMovements?: (sku?: string, almacenId?: string) => void;
  onNavigateToHistory: (sku?: string) => void;
}

export default function Dashboard({ 
  almacenes, 
  productos, 
  onNavigateToCompra,
  onNavigateToVenta,
  onNavigateToTransferencia,
  onNavigateToMovements, 
  onNavigateToHistory 
}: DashboardProps) {
  const [stockList, setStockList] = useState<StockItem[]>([]);
  const [search, setSearch] = useState("");
  const [selectedAlmacen, setSelectedAlmacen] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [stockStatusFilter, setStockStatusFilter] = useState<string>("all"); // 'all' | 'low' | 'out' | 'ok'
  const [loading, setLoading] = useState(true);

  // Load real-time stock
  useEffect(() => {
    setLoading(true);
    const unsubscribe = firestoreService.getStockRealtime((data) => {
      setStockList(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Helper to get stock of a SKU in a specific warehouse
  const getStockQty = (sku: string, almacenId: string): number => {
    if (!sku || !almacenId) return 0;
    const cleanSku = sku.trim().toUpperCase();
    const targetAlmId = firestoreService.normalizeWarehouseId(almacenId, almacenes);
    const record = stockList.find(
      s => s.sku?.trim().toUpperCase() === cleanSku && 
           firestoreService.normalizeWarehouseId(s.almacen_id, almacenes) === targetAlmId
    );
    return record ? Math.max(0, record.cantidad) : 0;
  };

  // Helper to get total stock across all registered warehouses
  const getGlobalStockQty = (sku: string): number => {
    if (!sku) return 0;
    const cleanSku = sku.trim().toUpperCase();
    if (almacenes && almacenes.length > 0) {
      return almacenes.reduce((acc, alm) => acc + getStockQty(cleanSku, alm.id), 0);
    }
    return stockList
      .filter(s => s.sku?.trim().toUpperCase() === cleanSku)
      .reduce((acc, curr) => acc + Math.max(0, curr.cantidad), 0);
  };

  // Registered catalog products
  const effectiveProductos = useMemo(() => {
    const map = new Map<string, Producto>();

    productos.forEach(p => {
      if (p.sku) {
        const cleanSku = p.sku.trim().toUpperCase();
        map.set(cleanSku, {
          ...p,
          sku: cleanSku
        });
      }
    });

    return Array.from(map.values());
  }, [productos]);

  // Distinct categories & brands
  const categorias = useMemo(() => {
    return Array.from(new Set(effectiveProductos.map(p => p.categoria).filter(Boolean))).sort();
  }, [effectiveProductos]);

  const marcas = useMemo(() => {
    return Array.from(new Set(effectiveProductos.map(p => p.marca || "dorsalclub").filter(Boolean))).sort();
  }, [effectiveProductos]);

  // Unique base models count
  const totalBaseModels = useMemo(() => {
    const set = new Set<string>();
    effectiveProductos.forEach(p => {
      set.add(p.producto_base_id || p.nombre.toLowerCase().trim());
    });
    return set.size;
  }, [effectiveProductos]);

  const selectedAlmacenObj = almacenes.find(a => a.id === selectedAlmacen);

  // Helper to get effective minimum stock threshold for a product
  const getProductMinStock = (p: Producto, almId: string): number => {
    if (almId !== "all") {
      const normId = firestoreService.normalizeWarehouseId(almId, almacenes);
      if (p.stock_minimo_almacenes && p.stock_minimo_almacenes[normId] !== undefined) {
        return Number(p.stock_minimo_almacenes[normId]) || 0;
      }
      if (p.stock_minimo_almacenes && p.stock_minimo_almacenes[almId] !== undefined) {
        return Number(p.stock_minimo_almacenes[almId]) || 0;
      }
      return Number(p.stock_minimo) || 0;
    }
    if (p.stock_minimo_almacenes && Object.keys(p.stock_minimo_almacenes).length > 0) {
      const vals = Object.values(p.stock_minimo_almacenes).map(v => Number(v) || 0);
      return Math.max(0, ...vals);
    }
    return Number(p.stock_minimo) || 0;
  };

  // Helper to determine inventory status
  const getProductStatusInfo = (p: Producto, targetAlmacenId: string) => {
    if (targetAlmacenId !== "all") {
      const min = getProductMinStock(p, targetAlmacenId);
      const qty = getStockQty(p.sku, targetAlmacenId);
      if (qty === 0) {
        return {
          status: "out" as const,
          label: "Agotado",
          badgeClass: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800"
        };
      }
      if (min > 0 && qty <= min) {
        return {
          status: "low" as const,
          label: "Stock Crítico",
          badgeClass: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800"
        };
      }
      return {
        status: "ok" as const,
        label: "Conforme",
        badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
      };
    }

    // Global scope check
    let outWarehousesCount = 0;
    let criticalWarehousesCount = 0;

    almacenes.forEach(alm => {
      const min = getProductMinStock(p, alm.id);
      const qty = getStockQty(p.sku, alm.id);
      if (min > 0) {
        if (qty === 0) {
          outWarehousesCount++;
        } else if (qty <= min) {
          criticalWarehousesCount++;
        }
      }
    });

    const hasPerWarehouseAlerts = almacenes.some(alm => getProductMinStock(p, alm.id) > 0);
    if (!hasPerWarehouseAlerts) {
      const globalMin = Number(p.stock_minimo) || 0;
      const globalQty = getGlobalStockQty(p.sku);
      if (globalQty === 0) {
        return {
          status: "out" as const,
          label: "Sin stock",
          badgeClass: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800"
        };
      }
      if (globalMin > 0 && globalQty <= globalMin) {
        return {
          status: "low" as const,
          label: "Stock Crítico",
          badgeClass: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800"
        };
      }
      return {
        status: "ok" as const,
        label: "Conforme",
        badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
      };
    }

    if (outWarehousesCount > 0) {
      return {
        status: "out" as const,
        label: outWarehousesCount === 1 ? "Sin stock en 1 almacén" : `Sin stock en ${outWarehousesCount} almacenes`,
        badgeClass: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800"
      };
    }

    if (criticalWarehousesCount > 0) {
      return {
        status: "low" as const,
        label: criticalWarehousesCount === 1 ? "Crítico en 1 almacén" : `Crítico en ${criticalWarehousesCount} almacenes`,
        badgeClass: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800"
      };
    }

    return {
      status: "ok" as const,
      label: "Conforme",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
    };
  };

  // Calculate unique SKU counts
  const { totalSkusInScope, outOfStockCount, lowStockCount } = useMemo(() => {
    let total = 0;
    let outCount = 0;
    let lowCount = 0;

    effectiveProductos.forEach(p => {
      const statusInfo = getProductStatusInfo(p, selectedAlmacen);
      const stockQty = selectedAlmacen === "all" ? getGlobalStockQty(p.sku) : getStockQty(p.sku, selectedAlmacen);

      if (selectedAlmacen === "all" || stockQty > 0 || statusInfo.status === "out" || statusInfo.status === "low") {
        total++;
      }

      if (statusInfo.status === "out") {
        outCount++;
      } else if (statusInfo.status === "low") {
        lowCount++;
      }
    });

    return {
      totalSkusInScope: selectedAlmacen === "all" ? effectiveProductos.length : total,
      outOfStockCount: outCount,
      lowStockCount: lowCount
    };
  }, [effectiveProductos, selectedAlmacen, stockList, almacenes]);

  // Filtered product listing
  const filteredProductos = effectiveProductos.filter(p => {
    const matchesSearch = 
      p.sku.toLowerCase().includes(search.toLowerCase()) || 
      p.nombre.toLowerCase().includes(search.toLowerCase()) ||
      (p.marca && p.marca.toLowerCase().includes(search.toLowerCase())) ||
      (p.color && p.color.toLowerCase().includes(search.toLowerCase())) ||
      (p.talla && p.talla.toLowerCase().includes(search.toLowerCase())) ||
      p.categoria.toLowerCase().includes(search.toLowerCase());

    const matchesCategory = categoryFilter === "all" || p.categoria === categoryFilter;
    const matchesBrand = brandFilter === "all" || (p.marca || "dorsalclub").toLowerCase() === brandFilter.toLowerCase();

    const statusInfo = getProductStatusInfo(p, selectedAlmacen);
    const stockQty = selectedAlmacen === "all" 
      ? getGlobalStockQty(p.sku) 
      : getStockQty(p.sku, selectedAlmacen);
    
    if (selectedAlmacen !== "all" && stockStatusFilter === "all") {
      if (stockQty <= 0 && statusInfo.status === "ok") {
        return false;
      }
    }

    let matchesStatus = true;
    if (stockStatusFilter === "low") {
      matchesStatus = statusInfo.status === "low";
    } else if (stockStatusFilter === "out") {
      matchesStatus = statusInfo.status === "out";
    } else if (stockStatusFilter === "ok") {
      matchesStatus = statusInfo.status === "ok";
    }

    return matchesSearch && matchesCategory && matchesBrand && matchesStatus;
  });

  return (
    <div className="max-w-7xl mx-auto px-3.5 sm:px-5 lg:px-6 py-5 space-y-6" id="dashboard-container">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight leading-tight">
            Dashboard de Inventario
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Supervisión del stock en tiempo real según modelos, tallas y movimientos registrados
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() => {
              if (onNavigateToCompra) onNavigateToCompra();
              else if (onNavigateToMovements) onNavigateToMovements();
            }}
            className="inline-flex items-center justify-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3.5 py-2 rounded-xl text-xs transition-all shadow-xs"
            title="Registrar nueva compra por lote"
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            <span>Registrar compra</span>
          </button>
          <button
            onClick={() => {
              if (onNavigateToVenta) onNavigateToVenta();
              else if (onNavigateToMovements) onNavigateToMovements();
            }}
            className="inline-flex items-center justify-center space-x-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 font-semibold px-3.5 py-2 rounded-xl text-xs transition-all shadow-xs"
            title="Registrar venta o salida"
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            <span>Registrar venta</span>
          </button>
        </div>
      </div>

      {/* Real-time KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Models */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Modelos Base</span>
            <div className="bg-zinc-100 dark:bg-zinc-800 p-1.5 rounded-lg text-zinc-700 dark:text-zinc-300">
              <Shirt className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <h3 className="text-2xl font-bold text-zinc-900 dark:text-white">{totalBaseModels}</h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              Líneas y modelos de producto
            </p>
          </div>
        </div>

        {/* Total SKUs / Variants */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Variantes / SKUs</span>
            <div className="bg-zinc-100 dark:bg-zinc-800 p-1.5 rounded-lg text-zinc-700 dark:text-zinc-300">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <h3 className="text-2xl font-bold text-zinc-900 dark:text-white">{totalSkusInScope}</h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              {selectedAlmacen === "all" ? "Variantes únicas en catálogo" : "SKUs con stock en sucursal"}
            </p>
          </div>
        </div>

        {/* Bajo Stock Alert */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Stock Crítico</span>
            <div className="bg-amber-50 dark:bg-amber-950/40 p-1.5 rounded-lg text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/80">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <h3 className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {loading ? (
                <span className="h-6 w-10 bg-zinc-100 dark:bg-zinc-800 animate-pulse inline-block rounded" />
              ) : (
                lowStockCount
              )}
            </h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">SKUs por debajo de stock mínimo</p>
          </div>
        </div>

        {/* Sin Stock */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Agotado / Sin Stock</span>
            <div className="bg-rose-50 dark:bg-rose-950/40 p-1.5 rounded-lg text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/80">
              <TrendingDown className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <h3 className="text-2xl font-bold text-rose-600 dark:text-rose-400">
              {loading ? (
                <span className="h-6 w-10 bg-zinc-100 dark:bg-zinc-800 animate-pulse inline-block rounded" />
              ) : (
                outOfStockCount
              )}
            </h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">SKUs con existencias en cero</p>
          </div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search SKU/Name */}
          <div className="relative flex items-center lg:col-span-2">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-zinc-400">
              <Search className="h-4 w-4" />
            </span>
            <input
              type="text"
              placeholder="Buscar por modelo, SKU, marca, color o talla..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-xl py-2 pl-9 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition-colors"
            />
          </div>

          {/* Warehouse Selector */}
          <div className="relative flex items-center">
            <select
              value={selectedAlmacen}
              onChange={(e) => setSelectedAlmacen(e.target.value)}
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-xl py-2 px-3 text-xs focus:outline-none font-medium"
            >
              <option value="all">Todos los almacenes (Red Global)</option>
              {almacenes.map(alm => (
                <option key={alm.id} value={alm.id}>
                  {alm.nombre} ({alm.ubicacion})
                </option>
              ))}
            </select>
          </div>

          {/* Brand Filter */}
          <div className="relative flex items-center">
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-xl py-2 px-3 text-xs focus:outline-none font-medium"
            >
              <option value="all">Todas las marcas</option>
              {marcas.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Stock Alert Status Filter */}
          <div className="relative flex items-center">
            <select
              value={stockStatusFilter}
              onChange={(e) => setStockStatusFilter(e.target.value)}
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-xl py-2 px-3 text-xs focus:outline-none font-medium"
            >
              <option value="all">Todos los estados</option>
              <option value="ok">Stock conforme</option>
              <option value="low">Stock crítico</option>
              <option value="out">Agotado (sin stock)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Grid table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="py-14 text-center text-zinc-400">
            <span className="h-6 w-6 border-2 border-zinc-900 dark:border-white border-t-transparent rounded-full animate-spin inline-block mb-2" />
            <p className="text-xs">Cargando inventario en tiempo real...</p>
          </div>
        ) : filteredProductos.length === 0 ? (
          <div className="py-12 text-center text-zinc-400 space-y-2">
            <Shirt className="h-10 w-10 mx-auto text-zinc-300 dark:text-zinc-600" />
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">No se encontraron productos</p>
            <p className="text-xs">Intenta cambiar los filtros o el texto de búsqueda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" id="stock-grid-table">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 font-semibold text-[11px] uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800">
                  <th className="py-3 px-4">Modelo & Variante</th>
                  <th className="py-3 px-3">Marca</th>
                  <th className="py-3 px-3">Color / Talla</th>
                  <th className="py-3 px-3 text-center">Mín. Requerido</th>
                  
                  {/* Warehouse specific columns */}
                  {selectedAlmacen === "all" ? (
                    <>
                      {almacenes.map(alm => (
                        <th 
                          key={alm.id} 
                          className="py-3 px-3 text-center"
                        >
                          {alm.nombre}
                        </th>
                      ))}
                      <th className="py-3 px-3 text-center font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white">
                        Stock Global
                      </th>
                    </>
                  ) : (
                    <th className="py-3 px-3 text-center font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white border-x border-zinc-200 dark:border-zinc-800">
                      Stock en {selectedAlmacenObj?.nombre || "Almacén"}
                    </th>
                  )}

                  <th className="py-3 px-3 text-center">Estado</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs">
                {filteredProductos.map((prod) => {
                  const globalQty = getGlobalStockQty(prod.sku);
                  
                  const activeQty = selectedAlmacen === "all" 
                    ? globalQty 
                    : getStockQty(prod.sku, selectedAlmacen);

                  const statusInfo = getProductStatusInfo(prod, selectedAlmacen);
                  const minStockToDisplay = getProductMinStock(prod, selectedAlmacen);

                  return (
                    <tr key={prod.sku} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 transition-colors">
                      {/* Name / SKU */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-zinc-900 dark:text-white leading-tight">{prod.nombre}</div>
                        <div className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{prod.sku}</div>
                      </td>

                      {/* Brand */}
                      <td className="py-3 px-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
                          {prod.marca || "dorsalclub"}
                        </span>
                      </td>

                      {/* Color / Talla */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">
                            {prod.color || "Sin color"}
                          </span>
                          <span className="text-zinc-400">•</span>
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-bold text-[11px]">
                            {prod.talla || "U"}
                          </span>
                        </div>
                      </td>

                      {/* Min stock */}
                      <td className="py-3 px-3 text-center font-mono text-zinc-500 dark:text-zinc-400 text-xs">
                        {selectedAlmacen === "all" ? (
                          <span 
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                            title="Mínimos configurados individualmente por almacén"
                          >
                            Por almacén
                          </span>
                        ) : minStockToDisplay > 0 ? (
                          <>
                            {minStockToDisplay} <span className="text-[10px] text-zinc-400">{prod.unidad || "pza"}</span>
                          </>
                        ) : (
                          <span className="text-zinc-400 text-[11px]">Off (0)</span>
                        )}
                      </td>

                      {/* Warehouse stocks / Single selected warehouse stock */}
                      {selectedAlmacen === "all" ? (
                        <>
                          {almacenes.map(alm => {
                            const qty = getStockQty(prod.sku, alm.id);
                            const almMin = getProductMinStock(prod, alm.id);
                            let colorClass = "text-zinc-900 dark:text-white";
                            if (almMin > 0 && qty === 0) colorClass = "text-rose-600 dark:text-rose-400 font-bold";
                            else if (almMin > 0 && qty <= almMin) colorClass = "text-amber-600 dark:text-amber-400 font-bold";

                            return (
                              <td 
                                key={alm.id} 
                                className="py-3 px-3 text-center font-mono text-xs"
                              >
                                <span className={colorClass}>
                                  {qty}
                                </span>
                              </td>
                            );
                          })}

                          {/* Global stock */}
                          <td className="py-3 px-3 text-center font-mono font-bold bg-zinc-50 dark:bg-zinc-800/40 text-xs">
                            <span className={statusInfo.status === "out" ? "text-rose-600 dark:text-rose-400" : statusInfo.status === "low" ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}>
                              {globalQty}
                            </span>
                            <span className="text-[10px] text-zinc-400 ml-1 font-normal">{prod.unidad || "pza"}</span>
                          </td>
                        </>
                      ) : (
                        <td className="py-3 px-3 text-center font-mono font-bold bg-zinc-50 dark:bg-zinc-800/30 border-x border-zinc-200 dark:border-zinc-800">
                          <span className={`text-sm ${
                            statusInfo.status === "out" 
                              ? "text-rose-600 dark:text-rose-400" 
                              : statusInfo.status === "low" 
                              ? "text-amber-600 dark:text-amber-400" 
                              : "text-emerald-600 dark:text-emerald-400"
                          }`}>
                            {activeQty}
                          </span>
                          <span className="text-[11px] text-zinc-400 ml-1 font-normal">{prod.unidad || "pza"}</span>
                        </td>
                      )}

                      {/* Status indicator badge */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusInfo.badgeClass}`}>
                          {statusInfo.label}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {onNavigateToVenta && (
                            <button
                              onClick={() => onNavigateToVenta(prod.sku, selectedAlmacen !== "all" ? selectedAlmacen : undefined)}
                              className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-zinc-500 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400 rounded-lg transition-colors"
                              title="Registrar venta para este SKU"
                            >
                              <ShoppingCart className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {onNavigateToCompra && (
                            <button
                              onClick={() => onNavigateToCompra(prod.sku, selectedAlmacen !== "all" ? selectedAlmacen : undefined)}
                              className="p-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-zinc-500 hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-400 rounded-lg transition-colors"
                              title="Registrar compra para este SKU"
                            >
                              <ShoppingBag className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {onNavigateToTransferencia && almacenes.length > 1 && (
                            <button
                              onClick={() => onNavigateToTransferencia(prod.sku, selectedAlmacen !== "all" ? selectedAlmacen : undefined)}
                              className="p-1.5 hover:bg-sky-50 dark:hover:bg-sky-950/40 text-zinc-500 hover:text-sky-600 dark:text-zinc-400 dark:hover:text-sky-400 rounded-lg transition-colors"
                              title="Transferir entre almacenes"
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => onNavigateToHistory(prod.sku)}
                            className="text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 transition-colors"
                            title="Ver trazabilidad de este SKU"
                          >
                            Auditoría
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footnote information */}
      <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1">
        <p>
          Mostrando {filteredProductos.length} {selectedAlmacen === "all" ? "variantes registradas en red global" : `artículos en ${selectedAlmacenObj?.nombre || 'el almacén seleccionado'}`}.
        </p>
        <p className="flex items-center">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
          Tiempo real activo
        </p>
      </div>
    </div>
  );
}
