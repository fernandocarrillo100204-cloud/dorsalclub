/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { firestoreService } from "../lib/firebase";
import { Compra, CompraItem, Almacen, Producto } from "../types";
import {
  ShoppingBag,
  Plus,
  Search,
  Calendar,
  Warehouse,
  Truck,
  DollarSign,
  FileText,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ChevronDown,
  ChevronRight,
  Eye,
  X,
  Package,
  Receipt,
  Tag,
  ArrowRight,
  Filter,
  RefreshCw,
  Clock,
  Sparkles
} from "lucide-react";

interface ComprasProps {
  almacenes: Almacen[];
  productos: Producto[];
  isNewView?: boolean; // true if on /compras/nueva
  onNavigate?: (tab: "compras" | "compras_nueva") => void;
  onNavigateToNew?: () => void;
  onNavigateToHistory?: () => void;
}

interface NewItemRow {
  sku: string;
  nombre_producto: string;
  variante_label: string;
  cantidad: number | "";
  costo_unitario: number | "";
}

export default function Compras({
  almacenes,
  productos,
  isNewView = false,
  onNavigate,
  onNavigateToNew,
  onNavigateToHistory
}: ComprasProps) {
  const goToHistory = () => {
    if (onNavigateToHistory) onNavigateToHistory();
    else if (onNavigate) onNavigate("compras");
  };

  const goToNew = () => {
    if (onNavigateToNew) onNavigateToNew();
    else if (onNavigate) onNavigate("compras_nueva");
  };

  // Compras list state
  const [compras, setCompras] = useState<Compra[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState("all");
  const [selectedCompraDetail, setSelectedCompraDetail] = useState<Compra | null>(null);

  // Form state (/compras/nueva)
  const [proveedor, setProveedor] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().split("T")[0]);
  const [almacenId, setAlmacenId] = useState(almacenes[0]?.id || "");
  const [referencia, setReferencia] = useState("");
  const [notas, setNotas] = useState("");
  const [costoEnvio, setCostoEnvio] = useState<number | "">("");
  const [comisiones, setComisiones] = useState<number | "">("");
  const [descuentos, setDescuentos] = useState<number | "">("");

  // Items in the current purchase draft
  const [items, setItems] = useState<NewItemRow[]>([
    {
      sku: productos[0]?.sku || "",
      nombre_producto: productos[0]?.nombre || "",
      variante_label: productos[0] ? `${productos[0].color || ""} - Talla ${productos[0].talla || "U"}` : "",
      cantidad: 1,
      costo_unitario: productos[0]?.precio_costo || 0
    }
  ]);

  // Form submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Set default warehouse if none selected
  useEffect(() => {
    if (!almacenId && almacenes.length > 0) {
      setAlmacenId(almacenes[0].id);
    }
  }, [almacenes, almacenId]);

  // Realtime subscription for purchases list
  useEffect(() => {
    setLoadingList(true);
    const unsubscribe = firestoreService.getComprasRealtime((data) => {
      setCompras(data);
      setLoadingList(false);
    });
    return () => unsubscribe();
  }, []);

  // Helper product details
  const getProductBySku = (sku: string) => {
    return productos.find((p) => p.sku.toLowerCase() === sku.toLowerCase());
  };

  const getWarehouseName = (id: string) => {
    const alm = almacenes.find((a) => a.id === id);
    return alm ? `${alm.nombre} (${alm.ubicacion})` : id || "Almacén principal";
  };

  // Form Calculations
  const subtotalItems = useMemo(() => {
    return items.reduce((sum, it) => {
      const qty = typeof it.cantidad === "number" ? it.cantidad : 0;
      const cost = typeof it.costo_unitario === "number" ? it.costo_unitario : 0;
      return sum + qty * cost;
    }, 0);
  }, [items]);

  const totalUnidades = useMemo(() => {
    return items.reduce((sum, it) => {
      const qty = typeof it.cantidad === "number" ? it.cantidad : 0;
      return sum + qty;
    }, 0);
  }, [items]);

  const totalCalculado = useMemo(() => {
    const envio = typeof costoEnvio === "number" ? costoEnvio : 0;
    const com = typeof comisiones === "number" ? comisiones : 0;
    const desc = typeof descuentos === "number" ? descuentos : 0;
    return Math.max(0, subtotalItems + envio + com - desc);
  }, [subtotalItems, costoEnvio, comisiones, descuentos]);

  // Row manipulation handlers
  const handleAddItemRow = () => {
    const firstProd = productos[0];
    setItems((prev) => [
      ...prev,
      {
        sku: firstProd?.sku || "",
        nombre_producto: firstProd?.nombre || "",
        variante_label: firstProd ? `${firstProd.color || ""} - Talla ${firstProd.talla || "U"}` : "",
        cantidad: 1,
        costo_unitario: firstProd?.precio_costo || 0
      }
    ]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (items.length <= 1) {
      setFormError("La compra debe incluir al menos una partida.");
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
    setFormError(null);
  };

  const handleProductSelect = (index: number, sku: string) => {
    const prod = getProductBySku(sku);
    setItems((prev) => {
      const copy = [...prev];
      if (prod) {
        copy[index] = {
          ...copy[index],
          sku: prod.sku,
          nombre_producto: prod.nombre,
          variante_label: `${prod.color || "Estándar"} - Talla ${prod.talla || "U"}`,
          costo_unitario: prod.precio_costo || 0
        };
      } else {
        copy[index] = {
          ...copy[index],
          sku
        };
      }
      return copy;
    });
  };

  const handleItemChange = (index: number, field: "cantidad" | "costo_unitario", val: string) => {
    const num = val === "" ? "" : Math.max(0, parseFloat(val) || 0);
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        [field]: num
      };
      return copy;
    });
  };

  // Submit Purchase
  const handleSubmitPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const prov = proveedor.trim();
    if (!prov) {
      setFormError("Por favor ingresa el nombre o razón social del proveedor.");
      return;
    }

    if (!almacenId) {
      setFormError("Por favor selecciona el almacén de recepción.");
      return;
    }

    if (items.length === 0) {
      setFormError("Debes agregar al menos un producto a la compra.");
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.sku) {
        setFormError(`La partida #${i + 1} no tiene un producto/SKU seleccionado.`);
        return;
      }
      const qty = typeof item.cantidad === "number" ? item.cantidad : 0;
      if (qty <= 0) {
        setFormError(`La cantidad para el producto "${item.nombre_producto || item.sku}" debe ser mayor a 0.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const formattedItems: CompraItem[] = items.map((it) => {
        const qty = typeof it.cantidad === "number" ? it.cantidad : 1;
        const unitCost = typeof it.costo_unitario === "number" ? it.costo_unitario : 0;
        return {
          sku: it.sku.trim().toUpperCase(),
          nombre_producto: it.nombre_producto,
          variante_label: it.variante_label,
          cantidad: qty,
          costo_unitario: unitCost,
          subtotal: qty * unitCost
        };
      });

      const parsedDate = fecha ? new Date(fecha + "T12:00:00") : new Date();

      const res = await firestoreService.registerCompraTransaction({
        proveedor: prov,
        fecha: parsedDate,
        almacen_id: almacenId,
        items: formattedItems,
        costo_envio: typeof costoEnvio === "number" ? costoEnvio : 0,
        comisiones: typeof comisiones === "number" ? comisiones : 0,
        descuentos: typeof descuentos === "number" ? descuentos : 0,
        referencia: referencia.trim(),
        notas: notas.trim()
      });

      setFormSuccess(`¡Compra registrada con éxito! Folio generado: ${res.folio}. El inventario ha sido actualizado.`);

      // Reset form
      setTimeout(() => {
        setProveedor("");
        setReferencia("");
        setNotas("");
        setCostoEnvio("");
        setComisiones("");
        setDescuentos("");
        const firstProd = productos[0];
        setItems([
          {
            sku: firstProd?.sku || "",
            nombre_producto: firstProd?.nombre || "",
            variante_label: firstProd ? `${firstProd.color || ""} - Talla ${firstProd.talla || "U"}` : "",
            cantidad: 1,
            costo_unitario: firstProd?.precio_costo || 0
          }
        ]);
        goToHistory();
      }, 1800);
    } catch (err: any) {
      console.error("Error al registrar compra:", err);
      setFormError(err.message || "No se pudo registrar la compra. Intente nuevamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered purchases list
  const filteredCompras = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return compras.filter((c) => {
      const matchWarehouse = selectedWarehouseFilter === "all" || c.almacen_id === selectedWarehouseFilter;
      if (!matchWarehouse) return false;

      if (!term) return true;
      const inFolio = c.folio?.toLowerCase().includes(term);
      const inProveedor = c.proveedor?.toLowerCase().includes(term);
      const inRef = c.referencia?.toLowerCase().includes(term);
      const inItems = c.items?.some(
        (it) => it.sku.toLowerCase().includes(term) || it.nombre_producto?.toLowerCase().includes(term)
      );

      return inFolio || inProveedor || inRef || inItems;
    });
  }, [compras, searchTerm, selectedWarehouseFilter]);

  // View: Formulario de Nueva Compra por Lote (/compras/nueva)
  if (isNewView) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6" id="compras-nueva-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
              <button
                onClick={goToHistory}
                className="hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                Compras
              </button>
              <span>/</span>
              <span className="text-zinc-900 dark:text-white font-bold">Nueva compra por lote</span>
            </div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">
              Registrar Compra por Lote
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Ingresa múltiples productos y variantes en una sola operación. Se incrementará el stock y registrará el folio de auditoría.
            </p>
          </div>
          <button
            type="button"
            onClick={goToHistory}
            className="self-start sm:self-auto px-3.5 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-xs"
          >
            Volver al historial
          </button>
        </div>

        {/* Feedback Messages */}
        {formSuccess && (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex items-center gap-3 text-emerald-800 dark:text-emerald-300 text-xs">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div>
              <p className="font-bold text-sm">{formSuccess}</p>
              <p className="mt-0.5 text-zinc-500 dark:text-zinc-400">Redirigiendo al historial de compras...</p>
            </div>
          </div>
        )}

        {formError && (
          <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl flex items-center gap-3 text-rose-800 dark:text-rose-300 text-xs">
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600 dark:text-rose-400" />
            <p className="font-semibold">{formError}</p>
          </div>
        )}

        {/* Form Container */}
        <form onSubmit={handleSubmitPurchase} className="space-y-6">
          {/* Section 1: General Purchase Info */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              1. Datos del Proveedor y Recepción
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Proveedor */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Proveedor / Distribuidor <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Nike Oficial, Distribuidora MX..."
                  value={proveedor}
                  onChange={(e) => setProveedor(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition-all font-medium"
                />
              </div>

              {/* Fecha */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Fecha de Compra <span className="text-rose-500">*</span>
                </label>
                <div className="relative flex items-center">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-zinc-400">
                    <Calendar className="h-4 w-4" />
                  </span>
                  <input
                    type="date"
                    required
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl py-2 pl-9 pr-3 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition-all font-medium"
                  />
                </div>
              </div>

              {/* Almacén de recepción */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Almacén de Recepción <span className="text-rose-500">*</span>
                </label>
                <div className="relative flex items-center">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-zinc-400">
                    <Warehouse className="h-4 w-4" />
                  </span>
                  <select
                    required
                    value={almacenId}
                    onChange={(e) => setAlmacenId(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl py-2 pl-9 pr-3 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition-all font-medium"
                  >
                    {almacenes.map((alm) => (
                      <option key={alm.id} value={alm.id}>
                        {alm.nombre} — {alm.ubicacion}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Referencia / Factura */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Factura / Folio Externo / Referencia
                </label>
                <input
                  type="text"
                  placeholder="Ej. FAC-2026-8941"
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition-all font-mono"
                />
              </div>

              {/* Notas */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Notas u Observaciones del Lote
                </label>
                <input
                  type="text"
                  placeholder="Condiciones de entrega, precintos, detalles de embalaje..."
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition-all"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Items / Partidas */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                2. Productos y Variantes del Lote ({items.length} {items.length === 1 ? "partida" : "partidas"})
              </h2>
              <button
                type="button"
                onClick={handleAddItemRow}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-zinc-900 dark:text-white bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar Producto</span>
              </button>
            </div>

            {/* Partidas Table */}
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 font-semibold text-[11px] uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800">
                      <th className="py-2.5 px-3 w-12 text-center">#</th>
                      <th className="py-2.5 px-3 min-w-[280px]">Producto & SKU</th>
                      <th className="py-2.5 px-3 w-28 text-center">Cantidad</th>
                      <th className="py-2.5 px-3 w-36 text-right">Costo Unit. ($)</th>
                      <th className="py-2.5 px-3 w-36 text-right">Subtotal ($)</th>
                      <th className="py-2.5 px-3 w-12 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
                    {items.map((row, idx) => {
                      const rowQty = typeof row.cantidad === "number" ? row.cantidad : 0;
                      const rowCost = typeof row.costo_unitario === "number" ? row.costo_unitario : 0;
                      const rowSubtotal = rowQty * rowCost;

                      return (
                        <tr key={idx} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                          {/* Index */}
                          <td className="py-2.5 px-3 text-center text-zinc-400 font-mono text-[11px]">
                            {idx + 1}
                          </td>

                          {/* Product Selection */}
                          <td className="py-2.5 px-3">
                            <select
                              value={row.sku}
                              onChange={(e) => handleProductSelect(idx, e.target.value)}
                              className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-900 dark:text-white font-medium focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-white"
                            >
                              {productos.map((prod) => (
                                <option key={prod.id || prod.sku} value={prod.sku}>
                                  {prod.sku} — {prod.nombre} ({prod.color || "U"} / {prod.talla || "U"})
                                </option>
                              ))}
                            </select>
                            <div className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-2">
                              <span>SKU: <span className="font-mono text-zinc-600 dark:text-zinc-300 font-semibold">{row.sku}</span></span>
                              {row.variante_label && <span>• {row.variante_label}</span>}
                            </div>
                          </td>

                          {/* Cantidad */}
                          <td className="py-2.5 px-3">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              required
                              value={row.cantidad}
                              onChange={(e) => handleItemChange(idx, "cantidad", e.target.value)}
                              placeholder="Cant"
                              className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-center text-zinc-900 dark:text-white font-bold focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-white"
                            />
                          </td>

                          {/* Costo Unitario */}
                          <td className="py-2.5 px-3">
                            <div className="relative flex items-center">
                              <span className="absolute inset-y-0 left-0 pl-2 flex items-center text-zinc-400 text-xs">$</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                required
                                value={row.costo_unitario}
                                onChange={(e) => handleItemChange(idx, "costo_unitario", e.target.value)}
                                placeholder="0.00"
                                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg pl-5 pr-2 py-1.5 text-xs text-right text-zinc-900 dark:text-white font-semibold focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-white"
                              />
                            </div>
                          </td>

                          {/* Subtotal */}
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-zinc-900 dark:text-white">
                            ${rowSubtotal.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>

                          {/* Delete */}
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItemRow(idx)}
                              className="p-1 text-zinc-400 hover:text-rose-600 transition-colors"
                              title="Eliminar partida"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Add button shortcut */}
            <button
              type="button"
              onClick={handleAddItemRow}
              className="w-full py-2.5 border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>+ Agregar otra partida / SKU a esta compra</span>
            </button>
          </div>

          {/* Section 3: Cost Breakdown & Totals */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Additional expenses */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs space-y-4">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <Truck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                3. Gastos y Descuentos Adicionales
              </h2>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Costo de Envío / Flete ($ MXN)
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-400">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={costoEnvio}
                      onChange={(e) => setCostoEnvio(e.target.value === "" ? "" : parseFloat(e.target.value) || 0)}
                      className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl pl-7 pr-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Comisiones / Aranceles / Impuestos ($ MXN)
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-400">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={comisiones}
                      onChange={(e) => setComisiones(e.target.value === "" ? "" : parseFloat(e.target.value) || 0)}
                      className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl pl-7 pr-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Descuentos Aplicados por Proveedor ($ MXN)
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-400">-$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={descuentos}
                      onChange={(e) => setDescuentos(e.target.value === "" ? "" : parseFloat(e.target.value) || 0)}
                      className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl pl-8 pr-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Financial Summary Card */}
            <div className="bg-zinc-900 text-white rounded-2xl p-5 shadow-md flex flex-col justify-between space-y-4">
              <div>
                <h3 className="text-xs uppercase tracking-widest text-zinc-400 font-bold mb-3 flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-emerald-400" />
                  Resumen de la Compra
                </h3>

                <div className="space-y-2.5 text-xs text-zinc-300 border-b border-zinc-800 pb-4">
                  <div className="flex justify-between">
                    <span>Total Unidades:</span>
                    <span className="font-bold text-white font-mono">{totalUnidades} uds</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Subtotal Partidas ({items.length}):</span>
                    <span className="font-mono font-semibold">${subtotalItems.toFixed(2)}</span>
                  </div>
                  {Number(costoEnvio) > 0 && (
                    <div className="flex justify-between text-zinc-400">
                      <span>+ Envío / Flete:</span>
                      <span className="font-mono">+${Number(costoEnvio).toFixed(2)}</span>
                    </div>
                  )}
                  {Number(comisiones) > 0 && (
                    <div className="flex justify-between text-zinc-400">
                      <span>+ Comisiones / Impuestos:</span>
                      <span className="font-mono">+${Number(comisiones).toFixed(2)}</span>
                    </div>
                  )}
                  {Number(descuentos) > 0 && (
                    <div className="flex justify-between text-emerald-400">
                      <span>- Descuento proveedor:</span>
                      <span className="font-mono">-${Number(descuentos).toFixed(2)}</span>
                    </div>
                  )}
                </div>

                <div className="pt-4 flex justify-between items-baseline">
                  <div>
                    <span className="text-xs text-zinc-400 font-semibold block">Total Liquidación</span>
                    <span className="text-[10px] text-zinc-500">Costo total del lote</span>
                  </div>
                  <span className="text-2xl font-black font-mono text-emerald-400">
                    ${totalCalculado.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={goToHistory}
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-2 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                      <span>Registrando Lote...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Registrar Compra</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    );
  }

  // View: Historial de Compras (/compras)
  return (
    <div className="max-w-7xl mx-auto px-3.5 sm:px-5 lg:px-6 py-5 space-y-6" id="compras-historial-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">
            Compras de Mercancía
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Historial de lotes adquiridos por proveedor, costos unitarios y desglose de recepción en almacén.
          </p>
        </div>

        {/* Primary Action Button */}
        <button
          onClick={goToNew}
          className="inline-flex items-center space-x-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900 rounded-xl font-bold text-xs transition-all shadow-sm self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Registrar compra</span>
        </button>
      </div>

      {/* Stats Quick Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
            Total Lotes Comprados
          </span>
          <span className="text-2xl font-black text-zinc-900 dark:text-white mt-1 block">
            {compras.length}
          </span>
          <span className="text-[10px] text-zinc-400 mt-0.5 block">Lotes registrados en sistema</span>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
            Unidades Ingresadas
          </span>
          <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block">
            {compras.reduce((sum, c) => sum + (c.total_unidades || 0), 0)} uds
          </span>
          <span className="text-[10px] text-zinc-400 mt-0.5 block">Total prendas y calzado sumado a stock</span>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
            Inversión Acumulada
          </span>
          <span className="text-2xl font-black text-zinc-900 dark:text-white font-mono mt-1 block">
            ${compras.reduce((sum, c) => sum + (c.total || 0), 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-zinc-400 mt-0.5 block">Costo total con fletes y aranceles</span>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Search by proveedor, folio, sku */}
          <div className="relative flex items-center sm:col-span-2">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-zinc-400">
              <Search className="h-4 w-4" />
            </span>
            <input
              type="text"
              placeholder="Buscar por proveedor, folio COMP-X, referencia o SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-xl py-2 pl-9 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition-colors"
            />
          </div>

          {/* Warehouse filter */}
          <div className="relative flex items-center">
            <select
              value={selectedWarehouseFilter}
              onChange={(e) => setSelectedWarehouseFilter(e.target.value)}
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-xl py-2 px-3 text-xs focus:outline-none font-medium"
            >
              <option value="all">Todos los almacenes de recepción</option>
              {almacenes.map((alm) => (
                <option key={alm.id} value={alm.id}>
                  {alm.nombre} ({alm.ubicacion})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Compras Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
        {loadingList ? (
          <div className="py-14 text-center text-zinc-400">
            <span className="h-6 w-6 border-2 border-zinc-900 dark:border-white border-t-transparent rounded-full animate-spin inline-block mb-2" />
            <p className="text-xs">Cargando historial de compras...</p>
          </div>
        ) : filteredCompras.length === 0 ? (
          <div className="py-14 text-center space-y-3">
            <ShoppingBag className="w-10 h-10 mx-auto text-zinc-300 dark:text-zinc-600" />
            <div>
              <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                {searchTerm ? "No se encontraron compras coincidentes" : "No hay compras registradas aún"}
              </p>
              <p className="text-xs text-zinc-400 mt-0.5">
                {searchTerm
                  ? "Prueba modificando los filtros de búsqueda o almacén."
                  : "Registra tu primer lote de mercancía para comenzar el control de costos."}
              </p>
            </div>
            {!searchTerm && (
              <button
                onClick={goToNew}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Registrar primera compra</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" id="tabla-compras">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 font-semibold text-[11px] uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800">
                  <th className="py-3 px-3">Folio Lote</th>
                  <th className="py-3 px-3">Fecha</th>
                  <th className="py-3 px-3">Proveedor</th>
                  <th className="py-3 px-3">Almacén Destino</th>
                  <th className="py-3 px-3 text-center">Partidas / Uds</th>
                  <th className="py-3 px-3 text-right">Total Compra</th>
                  <th className="py-3 px-3">Referencia</th>
                  <th className="py-3 px-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs">
                {filteredCompras.map((compra) => {
                  let dateStr = "—";
                  if (compra.fecha) {
                    const d = compra.fecha instanceof Date ? compra.fecha : new Date(compra.fecha);
                    dateStr = d.toLocaleDateString("es-MX", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric"
                    });
                  }

                  return (
                    <tr
                      key={compra.id}
                      className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      {/* Folio */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          {compra.folio || "COMP-—"}
                        </span>
                      </td>

                      {/* Fecha */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex items-center space-x-1.5 text-zinc-600 dark:text-zinc-400">
                          <Calendar className="h-3.5 w-3.5" />
                          <span className="font-medium">{dateStr}</span>
                        </div>
                      </td>

                      {/* Proveedor */}
                      <td className="py-3 px-3">
                        <div className="font-bold text-zinc-900 dark:text-white leading-tight">
                          {compra.proveedor}
                        </div>
                        {compra.creado_por && (
                          <div className="text-[10px] text-zinc-400 mt-0.5">
                            Por: {compra.creado_por}
                          </div>
                        )}
                      </td>

                      {/* Almacén */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-medium text-zinc-800 dark:text-zinc-200 text-xs flex items-center gap-1.5">
                          <Warehouse className="w-3.5 h-3.5 text-zinc-400" />
                          <span>{getWarehouseName(compra.almacen_id)}</span>
                        </div>
                      </td>

                      {/* Partidas / Uds */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-[11px]">
                          <span>{compra.items?.length || 0} art.</span>
                          <span>•</span>
                          <span className="text-emerald-600 dark:text-emerald-400">{compra.total_unidades || 0} uds</span>
                        </span>
                      </td>

                      {/* Total */}
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="font-mono font-bold text-sm text-zinc-900 dark:text-white">
                          ${(compra.total || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        {(compra.costo_envio || compra.comisiones || compra.descuentos) ? (
                          <div className="text-[10px] text-zinc-400">
                            Sub: ${(compra.subtotal || 0).toFixed(2)}
                          </div>
                        ) : null}
                      </td>

                      {/* Referencia */}
                      <td className="py-3 px-3">
                        <span className="text-zinc-600 dark:text-zinc-400 font-mono text-[11px]">
                          {compra.referencia || "—"}
                        </span>
                      </td>

                      {/* Detalle */}
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => setSelectedCompraDetail(compra)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Ver detalle</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal / Detail Drawer for Compra */}
      {selectedCompraDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/40">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  {selectedCompraDetail.folio}
                </span>
                <h3 className="font-bold text-sm text-zinc-900 dark:text-white">
                  Detalle del Lote de Compra
                </h3>
              </div>
              <button
                onClick={() => setSelectedCompraDetail(null)}
                className="p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700">
                <div>
                  <span className="text-[10px] text-zinc-400 uppercase font-semibold block">Proveedor</span>
                  <span className="font-bold text-zinc-900 dark:text-white text-xs">{selectedCompraDetail.proveedor}</span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-400 uppercase font-semibold block">Almacén Recepción</span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200 text-xs">{getWarehouseName(selectedCompraDetail.almacen_id)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-400 uppercase font-semibold block">Fecha Compra</span>
                  <span className="font-medium text-zinc-800 dark:text-zinc-200 text-xs">
                    {selectedCompraDetail.fecha ? new Date(selectedCompraDetail.fecha).toLocaleDateString("es-MX") : "—"}
                  </span>
                </div>
                {selectedCompraDetail.referencia && (
                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase font-semibold block">Referencia / Factura</span>
                    <span className="font-mono text-zinc-700 dark:text-zinc-300 text-xs">{selectedCompraDetail.referencia}</span>
                  </div>
                )}
                {selectedCompraDetail.creado_por && (
                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase font-semibold block">Registrado Por</span>
                    <span className="text-zinc-600 dark:text-zinc-400 text-xs">{selectedCompraDetail.creado_por}</span>
                  </div>
                )}
              </div>

              {/* Items Breakdown Table */}
              <div>
                <h4 className="font-bold text-zinc-900 dark:text-white mb-2 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-500" />
                  Partidas Incluidas ({selectedCompraDetail.items?.length || 0})
                </h4>

                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 font-semibold text-[10px] uppercase border-b border-zinc-200 dark:border-zinc-800">
                        <th className="py-2 px-3">SKU & Producto</th>
                        <th className="py-2 px-3 text-center">Cant.</th>
                        <th className="py-2 px-3 text-right">Costo Unit.</th>
                        <th className="py-2 px-3 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {selectedCompraDetail.items?.map((it, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3">
                            <div className="font-bold text-zinc-900 dark:text-white">{it.nombre_producto || it.sku}</div>
                            <div className="text-[10px] font-mono text-zinc-400">{it.sku} {it.variante_label ? `• ${it.variante_label}` : ""}</div>
                          </td>
                          <td className="py-2 px-3 text-center font-bold text-zinc-900 dark:text-white font-mono">
                            {it.cantidad}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-zinc-600 dark:text-zinc-400">
                            ${(it.costo_unitario || 0).toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-zinc-900 dark:text-white">
                            ${(it.subtotal || 0).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Financial Totals */}
              <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-200 dark:border-zinc-700 space-y-1.5 text-xs">
                <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                  <span>Subtotal Partidas:</span>
                  <span className="font-mono font-semibold">${(selectedCompraDetail.subtotal || 0).toFixed(2)}</span>
                </div>
                {Number(selectedCompraDetail.costo_envio) > 0 && (
                  <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                    <span>+ Flete / Envío:</span>
                    <span className="font-mono">+${Number(selectedCompraDetail.costo_envio).toFixed(2)}</span>
                  </div>
                )}
                {Number(selectedCompraDetail.comisiones) > 0 && (
                  <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                    <span>+ Comisiones / Impuestos:</span>
                    <span className="font-mono">+${Number(selectedCompraDetail.comisiones).toFixed(2)}</span>
                  </div>
                )}
                {Number(selectedCompraDetail.descuentos) > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>- Descuentos proveedor:</span>
                    <span className="font-mono">-${Number(selectedCompraDetail.descuentos).toFixed(2)}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700 flex justify-between font-bold text-sm text-zinc-900 dark:text-white">
                  <span>Total Liquidado:</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-black">
                    ${(selectedCompraDetail.total || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {selectedCompraDetail.notas && (
                <div className="text-xs text-zinc-500 bg-zinc-100 dark:bg-zinc-800 p-2.5 rounded-lg">
                  <strong>Notas:</strong> {selectedCompraDetail.notas}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 flex justify-end">
              <button
                onClick={() => setSelectedCompraDetail(null)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900 rounded-xl text-xs font-bold transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
