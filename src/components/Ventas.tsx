/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { firestoreService } from "../lib/firebase";
import { Almacen, Producto, StockItem, Cliente, TipoCliente, VentaPartidaInput, normalizeOptionalMoney } from "../types";
import ClienteModal from "./ClienteModal";
import {
  TrendingDown,
  CheckCircle,
  AlertCircle,
  Package,
  Layers,
  Search,
  ShoppingCart,
  DollarSign,
  User,
  Users,
  Hash,
  ArrowRight,
  Warehouse,
  Plus,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Truck,
  Check,
  X,
  Trash2
} from "lucide-react";

interface VentaItemDraft {
  id: string;
  sku: string;
  almacenId: string;
  cantidad: number | string;
  precioUnitario: number | string;
}

let nextVentaItemId = 0;

const createVentaItem = (sku = "", almacenId = "", precioUnitario: number | string = ""): VentaItemDraft => ({
  id: `venta-item-${++nextVentaItemId}`,
  sku,
  almacenId,
  cantidad: 1,
  precioUnitario
});

interface VentasProps {
  almacenes: Almacen[];
  productos: Producto[];
  preselectedSku?: string;
  preselectedAlmacenId?: string;
  preselectedClienteId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function Ventas({
  almacenes,
  productos,
  preselectedSku = "",
  preselectedAlmacenId = "",
  preselectedClienteId = "",
  onSuccess,
  onCancel
}: VentasProps) {
  const [items, setItems] = useState<VentaItemDraft[]>(() => {
    const initialProduct = productos.find((product) => product.sku === preselectedSku);
    return [createVentaItem(
      preselectedSku,
      preselectedAlmacenId || almacenes[0]?.id || "",
      initialProduct?.precio_venta ?? ""
    )];
  });
  const [referencia, setReferencia] = useState("");

  // Opciones y ajustes de venta (envío y costos adicionales)
  const [isAjustesOpen, setIsAjustesOpen] = useState(false);
  const [envioCobradoCliente, setEnvioCobradoCliente] = useState<string>("");
  const [otrosCargosCliente, setOtrosCargosCliente] = useState<string>("");
  const [conceptoOtrosCargos, setConceptoOtrosCargos] = useState<string>("");
  const [costoEnvioVenta, setCostoEnvioVenta] = useState<string>("");
  const [otrosCostosVenta, setOtrosCostosVenta] = useState<string>("");
  const [conceptoOtrosCostos, setConceptoOtrosCostos] = useState<string>("");
  const [comentariosVenta, setComentariosVenta] = useState<string>("");

  // Client Selection State
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [selectedClienteId, setSelectedClienteId] = useState<string>(preselectedClienteId || "");
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [clientSearchText, setClientSearchText] = useState("");
  const [isClienteModalOpen, setIsClienteModalOpen] = useState(false);
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  const [stockList, setStockList] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Sync initial props
  useEffect(() => {
    if (preselectedSku || preselectedAlmacenId) {
      setItems((current) => current.map((item, index) => {
        if (index !== 0) return item;
        const nextSku = preselectedSku || item.sku;
        const selectedProduct = productos.find((product) => product.sku === nextSku);
        return {
          ...item,
          sku: nextSku,
          almacenId: preselectedAlmacenId || item.almacenId,
          precioUnitario: preselectedSku ? selectedProduct?.precio_venta ?? "" : item.precioUnitario
        };
      }));
    }
    if (preselectedClienteId) setSelectedClienteId(preselectedClienteId);
  }, [preselectedSku, preselectedAlmacenId, preselectedClienteId, productos]);

  // Close client dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(event.target as Node)) {
        setIsClientDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Subscribe to stock
  useEffect(() => {
    const unsub = firestoreService.getStockRealtime((items) => {
      setStockList(items);
    });
    return () => unsub();
  }, []);

  // Subscribe to clientes
  useEffect(() => {
    const unsub = firestoreService.getClientesRealtime((items) => {
      setClientes(items);
    });
    return () => unsub();
  }, []);

  // Selected client details
  const selectedCliente = useMemo(() => {
    if (!selectedClienteId || selectedClienteId === "mostrador") return null;
    return clientes.find((c) => c.id === selectedClienteId) || null;
  }, [selectedClienteId, clientes]);

  const isClienteInactivo = useMemo(() => {
    return selectedCliente?.estado === "inactivo";
  }, [selectedCliente]);

  // Filtered clients for the dropdown
  const filteredDropdownClientes = useMemo(() => {
    const term = clientSearchText.trim().toLowerCase();
    if (!term) return clientes;
    const termClean = term.replace(/[@\s-]/g, "");

    return clientes.filter((c) => {
      const matchName = c.nombre_normalizado?.includes(term) || c.nombre_completo.toLowerCase().includes(term);
      const matchIg = c.instagram_normalizado?.includes(termClean) || c.instagram?.toLowerCase().includes(term);
      const phoneClean = c.telefono ? String(c.telefono).replace(/\D/g, "") : "";
      const matchPhone = phoneClean.includes(termClean) || (c.telefono && c.telefono.includes(term));
      return matchName || matchIg || matchPhone;
    });
  }, [clientes, clientSearchText]);

  const updateItem = (id: string, patch: Partial<VentaItemDraft>) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const handleItemSkuChange = (id: string, nextSku: string) => {
    const selectedProduct = productos.find((product) => product.sku === nextSku);
    updateItem(id, {
      sku: nextSku,
      precioUnitario: selectedProduct?.precio_venta ?? ""
    });
  };

  const addItem = () => {
    setItems((current) => [
      ...current,
      createVentaItem("", current[0]?.almacenId || almacenes[0]?.id || "")
    ]);
  };

  const removeItem = (id: string) => {
    setItems((current) => current.length === 1 ? current : current.filter((item) => item.id !== id));
  };

  const getAvailableStock = (item: VentaItemDraft): number | null => {
    if (!item.sku || !item.almacenId) return null;
    const stockItem = stockList.find(
      (stock) => stock.sku.toLowerCase() === item.sku.toLowerCase() && stock.almacen_id === item.almacenId
    );
    return stockItem ? stockItem.cantidad : 0;
  };

  const totalUnidades = items.reduce((sum, item) => sum + (Number(item.cantidad) || 0), 0);
  const totalMercancia = items.reduce((sum, item) => {
    const quantity = Number(item.cantidad) || 0;
    const unitPrice = Number(item.precioUnitario) || 0;
    return sum + Math.max(0, quantity * unitPrice);
  }, 0);

  const parseNumField = (val: string): number => {
    try {
      return normalizeOptionalMoney(val);
    } catch {
      return 0;
    }
  };

  const envioCobradoNum = parseNumField(envioCobradoCliente);
  const otrosCargosNum = parseNumField(otrosCargosCliente);
  const costoEnvioNum = parseNumField(costoEnvioVenta);
  const otrosCostosNum = parseNumField(otrosCostosVenta);

  const totalCobrado = totalMercancia + envioCobradoNum + otrosCargosNum;
  const totalCostosVenta = costoEnvioNum + otrosCostosNum;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (items.length === 0) {
      setFormError("Agrega al menos un producto a la venta.");
      return;
    }

    const normalizedItems: VentaPartidaInput[] = [];
    const usedStockKeys = new Set<string>();

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const cleanSku = item.sku.trim().toUpperCase();
      const quantity = Number(item.cantidad);
      const unitPrice = Number(item.precioUnitario);

      if (!cleanSku) {
        setFormError(`Selecciona el producto de la partida ${index + 1}.`);
        return;
      }
      if (!item.almacenId) {
        setFormError(`Selecciona el almacén de la partida ${index + 1}.`);
        return;
      }
      if (!Number.isInteger(quantity) || quantity <= 0) {
        setFormError(`La cantidad de la partida ${index + 1} debe ser un número entero mayor a cero.`);
        return;
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        setFormError(`El precio de la partida ${index + 1} debe ser un número válido mayor o igual a cero.`);
        return;
      }

      const stockKey = `${cleanSku}_${item.almacenId}`;
      if (usedStockKeys.has(stockKey)) {
        setFormError(`El producto ${cleanSku} está repetido para el mismo almacén. Unifica su cantidad en una sola partida.`);
        return;
      }
      usedStockKeys.add(stockKey);

      const availableStock = getAvailableStock(item);
      if (availableStock !== null && availableStock < quantity) {
        setFormError(
          `Stock insuficiente para ${cleanSku}. Disponible: ${availableStock} uds, solicitado: ${quantity} uds.`
        );
        return;
      }

      normalizedItems.push({
        sku: cleanSku,
        almacen_id: item.almacenId,
        cantidad: quantity,
        precio_unitario_venta: unitPrice
      });
    }

    // Validar importes y costos opcionales con normalizeOptionalMoney
    let envioCobradoValidated = 0;
    let otrosCargosValidated = 0;
    let costoEnvioValidated = 0;
    let otrosCostosValidated = 0;

    try {
      envioCobradoValidated = normalizeOptionalMoney(envioCobradoCliente);
    } catch {
      setFormError("El envío cobrado al cliente debe ser un número válido mayor o igual a cero.");
      return;
    }

    try {
      otrosCargosValidated = normalizeOptionalMoney(otrosCargosCliente);
    } catch {
      setFormError("Los otros cargos cobrados al cliente deben ser un número válido mayor o igual a cero.");
      return;
    }

    try {
      costoEnvioValidated = normalizeOptionalMoney(costoEnvioVenta);
    } catch {
      setFormError("El costo real del envío debe ser un número válido mayor o igual a cero.");
      return;
    }

    try {
      otrosCostosValidated = normalizeOptionalMoney(otrosCostosVenta);
    } catch {
      setFormError("Los otros costos asociados deben ser un número válido mayor o igual a cero.");
      return;
    }

    setLoading(true);
    try {
      // Determine client snapshot values
      const isMostrador = !selectedClienteId || selectedClienteId === "mostrador";
      const clienteNombre = isMostrador ? "Venta sin cliente / Mostrador" : selectedCliente?.nombre_completo || "Cliente";
      const clienteTipo = isMostrador ? undefined : selectedCliente?.tipo_cliente;
      const clienteId = isMostrador ? undefined : selectedCliente?.id;

      const fullReference = [
        referencia.trim() ? `Ref: ${referencia.trim()}` : "",
        `Cliente: ${clienteNombre}`
      ]
        .filter(Boolean)
        .join(" | ");

      const envioCobradoFinal = envioCobradoValidated > 0 ? envioCobradoValidated : undefined;
      const otrosCargosFinal = otrosCargosValidated > 0 ? otrosCargosValidated : undefined;
      const conceptoOtrosCargosFinal = otrosCargosFinal && conceptoOtrosCargos.trim() ? conceptoOtrosCargos.trim() : undefined;

      const costoEnvioFinal = costoEnvioValidated > 0 ? costoEnvioValidated : undefined;
      const otrosCostosFinal = otrosCostosValidated > 0 ? otrosCostosValidated : undefined;
      const conceptoOtrosCostosFinal = otrosCostosFinal && conceptoOtrosCostos.trim() ? conceptoOtrosCostos.trim() : undefined;

      const cleanComentarios = comentariosVenta.trim();
      const comentariosVentaFinal = cleanComentarios ? cleanComentarios.slice(0, 500) : undefined;

      const res = await firestoreService.registerVentaTransaction({
        items: normalizedItems,
        referencia: fullReference,
        cliente_id: clienteId,
        cliente_nombre: clienteNombre,
        cliente_tipo: clienteTipo,
        envio_cobrado_cliente: envioCobradoFinal,
        otros_cargos_cliente: otrosCargosFinal,
        concepto_otros_cargos: conceptoOtrosCargosFinal,
        costo_envio_venta: costoEnvioFinal,
        otros_costos_venta: otrosCostosFinal,
        concepto_otros_costos: conceptoOtrosCostosFinal,
        comentarios_venta: comentariosVentaFinal
      });

      setFormSuccess(
        `¡Venta registrada con éxito! Folio: ${res.folio}. ${res.movimientosCount} ${res.movimientosCount === 1 ? "partida registrada" : "partidas registradas"}.`
      );

      setItems([createVentaItem("", almacenes[0]?.id || "")]);
      setReferencia("");
      setSelectedClienteId("");
      setEnvioCobradoCliente("");
      setOtrosCargosCliente("");
      setConceptoOtrosCargos("");
      setCostoEnvioVenta("");
      setOtrosCostosVenta("");
      setConceptoOtrosCostos("");
      setComentariosVenta("");
      setIsAjustesOpen(false);

      if (onSuccess) {
        setTimeout(() => onSuccess(), 1500);
      }
    } catch (err: any) {
      console.error("Error al registrar venta:", err);
      setFormError(err.message || "Error al procesar la venta.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6" id="ventas-page">
      {/* Header */}
      <div className="pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
          <ShoppingCart className="w-6 h-6 text-rose-500" />
          Registrar Venta / Despacho
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Descuenta unidades vendidas en mostrador o asociadas a un cliente con trazabilidad comercial completa.
        </p>
      </div>

      {/* Feedback Messages */}
      {formSuccess && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex items-center gap-3 text-emerald-800 dark:text-emerald-300 text-xs">
          <CheckCircle className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p className="font-bold">{formSuccess}</p>
        </div>
      )}

      {formError && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl flex items-center gap-3 text-rose-800 dark:text-rose-300 text-xs">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 dark:text-rose-400" />
          <p className="font-semibold">{formError}</p>
        </div>
      )}

      {/* Sales Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs space-y-5">
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                  Productos de la venta <span className="text-rose-500">*</span>
                </h2>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Agrega todas las prendas del mismo pedido antes de confirmar.
                </p>
              </div>
              <button
                type="button"
                onClick={addItem}
                disabled={items.length >= 50}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 text-xs font-bold hover:bg-rose-100 dark:hover:bg-rose-950/50 disabled:opacity-50"
                id="agregar-producto-venta-btn"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar producto
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => {
                const selectedProduct = productos.find((product) => product.sku === item.sku) || null;
                const availableStock = getAvailableStock(item);
                const quantity = Number(item.cantidad) || 0;
                const unitPrice = Number(item.precioUnitario) || 0;
                const lineTotal = Math.max(0, quantity * unitPrice);

                return (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/20 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-[11px] font-bold flex items-center justify-center">
                          {index + 1}
                        </span>
                        <span className="text-xs font-bold text-zinc-900 dark:text-white">
                          Partida {index + 1}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        disabled={items.length === 1}
                        className="p-2 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400"
                        aria-label={`Eliminar partida ${index + 1}`}
                        title={items.length === 1 ? "La venta debe conservar al menos una partida" : "Eliminar producto"}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                        Producto / Variante
                      </label>
                      <select
                        value={item.sku}
                        onChange={(event) => handleItemSkuChange(item.id, event.target.value)}
                        className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white font-mono"
                      >
                        <option value="">-- Seleccionar producto por SKU o nombre --</option>
                        {productos.map((product) => (
                          <option key={product.sku} value={product.sku}>
                            [{product.sku}] {product.nombre} {product.talla ? `- Talla: ${product.talla}` : ""}{" "}
                            {product.color ? `(${product.color})` : ""} - ${product.precio_venta || 0}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="lg:col-span-2">
                        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                          Almacén de despacho
                        </label>
                        <select
                          value={item.almacenId}
                          onChange={(event) => updateItem(item.id, { almacenId: event.target.value })}
                          className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
                        >
                          {almacenes.map((warehouse) => (
                            <option key={warehouse.id} value={warehouse.id}>{warehouse.nombre}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                          Cantidad
                        </label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={item.cantidad}
                          onChange={(event) => updateItem(item.id, {
                            cantidad: event.target.value === "" ? "" : Math.max(1, parseInt(event.target.value, 10) || 1)
                          })}
                          className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-xs font-bold text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                          Precio unitario
                        </label>
                        <div className="relative">
                          <DollarSign className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.precioUnitario}
                            onChange={(event) => updateItem(item.id, { precioUnitario: event.target.value })}
                            placeholder="0.00"
                            className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl pl-9 pr-3 py-2.5 text-xs font-bold text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white font-mono"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800 text-[11px]">
                      <div className="flex flex-wrap items-center gap-2 text-zinc-500">
                        {selectedProduct && (
                          <span className="inline-flex items-center gap-1">
                            <Package className="w-3.5 h-3.5 text-rose-500" />
                            {selectedProduct.nombre}
                            {selectedProduct.talla ? ` · Talla ${selectedProduct.talla}` : ""}
                          </span>
                        )}
                        {item.sku && (
                          <span className={`px-2 py-0.5 rounded-full font-mono font-bold ${
                            (availableStock || 0) >= quantity
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                              : "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400"
                          }`}>
                            Stock: {availableStock ?? 0} uds
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-sm font-bold text-zinc-900 dark:text-white">
                        ${lineTotal.toFixed(2)} MXN
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between rounded-xl bg-zinc-100 dark:bg-zinc-800 px-4 py-3 text-xs">
              <span className="font-semibold text-zinc-600 dark:text-zinc-300">
                {items.length} {items.length === 1 ? "producto" : "productos"} · {totalUnidades} unidades
              </span>
              <span className="font-mono font-bold text-zinc-900 dark:text-white">
                Subtotal: ${totalMercancia.toFixed(2)} MXN
              </span>
            </div>
          </div>

          {/* Customer Selection & Ticket Reference */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Searchable Client Selector */}
            <div className="relative" ref={clientDropdownRef}>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-rose-500" />
                  <span>Cliente / Comprador</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsClienteModalOpen(true)}
                  className="text-xs text-rose-500 hover:text-rose-600 font-bold flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Nuevo cliente</span>
                </button>
              </div>

              {/* Selector Trigger Button */}
              <div
                onClick={() => setIsClientDropdownOpen(!isClientDropdownOpen)}
                className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-zinc-900 dark:text-white cursor-pointer flex items-center justify-between gap-2 focus:ring-2 focus:ring-zinc-900"
              >
                <div className="truncate">
                  {selectedClienteId === "mostrador" ? (
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                      🏪 Venta sin cliente / Mostrador
                    </span>
                  ) : selectedCliente ? (
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-bold text-zinc-900 dark:text-white truncate">
                        {selectedCliente.nombre_completo}
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-zinc-200 dark:bg-zinc-700 capitalize">
                        {selectedCliente.tipo_cliente}
                      </span>
                      {selectedCliente.telefono && (
                        <span className="text-zinc-400 text-[11px] font-mono">
                          {selectedCliente.telefono}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-zinc-400">
                      — Seleccionar cliente o elegir mostrador —
                    </span>
                  )}
                </div>
                <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
              </div>

              {/* Inactive Client Warning */}
              {isClienteInactivo && selectedCliente && (
                <div className="mt-2 p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center gap-2 text-amber-800 dark:text-amber-300 text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>
                    <strong>Advertencia:</strong> El cliente <em>{selectedCliente.nombre_completo}</em> está marcado como inactivo. Puedes continuar con la venta si lo requieres.
                  </span>
                </div>
              )}

              {/* Dropdown Menu */}
              {isClientDropdownOpen && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl overflow-hidden max-h-64 flex flex-col">
                  {/* Search inside dropdown */}
                  <div className="p-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2" />
                      <input
                        type="text"
                        placeholder="Buscar por nombre, Instagram o teléfono..."
                        value={clientSearchText}
                        onChange={(e) => setClientSearchText(e.target.value)}
                        className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none"
                        autoFocus
                      />
                    </div>
                  </div>

                  {/* Options list */}
                  <div className="overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/60 flex-1">
                    {/* Explicit Mostrador Option */}
                    <div
                      onClick={() => {
                        setSelectedClienteId("mostrador");
                        setIsClientDropdownOpen(false);
                      }}
                      className={`p-2.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer flex items-center justify-between ${
                        selectedClienteId === "mostrador" ? "bg-rose-50/50 dark:bg-rose-950/20 font-bold text-rose-600 dark:text-rose-400" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span>🏪</span>
                        <span>Venta sin cliente / Mostrador</span>
                      </div>
                      {selectedClienteId === "mostrador" && <Check className="w-3.5 h-3.5 text-rose-500" />}
                    </div>

                    {/* Clientes list */}
                    {filteredDropdownClientes.map((c) => {
                      const isSelected = selectedClienteId === c.id;
                      return (
                        <div
                          key={c.id}
                          onClick={() => {
                            setSelectedClienteId(c.id || "");
                            setIsClientDropdownOpen(false);
                          }}
                          className={`p-2.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer flex items-center justify-between ${
                            isSelected ? "bg-rose-50/50 dark:bg-rose-950/20 font-bold text-rose-600 dark:text-rose-400" : ""
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-zinc-900 dark:text-white truncate">
                                {c.nombre_completo}
                              </span>
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 capitalize">
                                {c.tipo_cliente}
                              </span>
                              {c.estado === "inactivo" && (
                                <span className="px-1 py-0.2 rounded text-[9px] bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-bold">
                                  Inactivo
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-zinc-400 flex items-center gap-2 mt-0.5">
                              {c.telefono && <span>📞 {c.telefono}</span>}
                              {c.instagram && <span>📷 @{c.instagram.replace(/^@+/, "")}</span>}
                              {c.ciudad && <span>📍 {c.ciudad}</span>}
                            </div>
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
                        </div>
                      );
                    })}

                    {filteredDropdownClientes.length === 0 && (
                      <div className="p-4 text-center text-xs text-zinc-400">
                        No se encontraron clientes coincidentes.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Ticket reference */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Folio Ticket / Pedido E-commerce (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ej. TICKET-#1045 o SHOP-9821"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white font-mono"
              />
              <p className="text-[11px] text-zinc-400 mt-1">
                Identificador de venta externa o canal de despacho.
              </p>
            </div>

            {/* Comentarios de la venta */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Comentarios / Observaciones (Opcional)
                </label>
                <span className={`text-[11px] font-mono ${comentariosVenta.length >= 480 ? "text-amber-500 font-bold" : "text-zinc-400"}`}>
                  {comentariosVenta.length}/500
                </span>
              </div>
              <textarea
                rows={2}
                maxLength={500}
                placeholder="Notas internas de la venta, condiciones acordadas, detalles de entrega..."
                value={comentariosVenta}
                onChange={(e) => setComentariosVenta(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white resize-none"
                id="comentarios-venta-textarea"
              />
              <p className="text-[11px] text-zinc-400 mt-1">
                Observaciones visibles en el historial y detalle de la venta.
              </p>
            </div>
          </div>
        </div>

        {/* Sección colapsable: Envío y ajustes opcionales */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
          <button
            type="button"
            onClick={() => setIsAjustesOpen(!isAjustesOpen)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
            id="toggle-ajustes-envio-btn"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-300">
                <Truck className="w-4 h-4 text-rose-500" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-zinc-900 dark:text-white">
                    Envío y ajustes opcionales
                  </span>
                  {(envioCobradoNum > 0 || otrosCargosNum > 0 || costoEnvioNum > 0 || otrosCostosNum > 0) && (
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                      Ajustes activos
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Registra cobros de envío, cargos adicionales o costos asumidos por el negocio.
                </p>
              </div>
            </div>
            <div className="text-zinc-400">
              {isAjustesOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
          </button>

          {isAjustesOpen && (
            <div className="p-4 pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-5">
              {/* Subsección: Importes cobrados al cliente */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                  <span>Importes cobrados al cliente</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Envío cobrado al cliente
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-zinc-400 text-xs">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={envioCobradoCliente}
                        onChange={(e) => setEnvioCobradoCliente(e.target.value)}
                        className="w-full pl-7 pr-3 py-2 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
                        id="envio-cobrado-cliente-input"
                      />
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      Importe adicional incluido en el cobro al cliente.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Otros cargos cobrados al cliente
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-zinc-400 text-xs">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={otrosCargosCliente}
                        onChange={(e) => setOtrosCargosCliente(e.target.value)}
                        className="w-full pl-7 pr-3 py-2 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
                        id="otros-cargos-cliente-input"
                      />
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      Cargos adicionales como empaque especial o personalización.
                    </p>
                  </div>

                  {otrosCargosNum > 0 && (
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                        Concepto de otros cargos
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. Empaque para regalo, personalización de prenda"
                        value={conceptoOtrosCargos}
                        onChange={(e) => setConceptoOtrosCargos(e.target.value)}
                        className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
                        id="concepto-otros-cargos-input"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Divisor */}
              <div className="border-t border-zinc-200 dark:border-zinc-800/60" />

              {/* Subsección: Costos pagados por el negocio */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                  <span>Costos pagados por el negocio</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Costo real del envío
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-zinc-400 text-xs">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={costoEnvioVenta}
                        onChange={(e) => setCostoEnvioVenta(e.target.value)}
                        className="w-full pl-7 pr-3 py-2 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
                        id="costo-envio-venta-input"
                      />
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      Importe pagado por el negocio a la paquetería.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Otros costos asociados a la venta
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-zinc-400 text-xs">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={otrosCostosVenta}
                        onChange={(e) => setOtrosCostosVenta(e.target.value)}
                        className="w-full pl-7 pr-3 py-2 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
                        id="otros-costos-venta-input"
                      />
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      Empaque, comisión, seguro u otro costo directo.
                    </p>
                  </div>

                  {otrosCostosNum > 0 && (
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                        Concepto de otros costos
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. Caja reforzada, comisión de pasarela"
                        value={conceptoOtrosCostos}
                        onChange={(e) => setConceptoOtrosCostos(e.target.value)}
                        className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
                        id="concepto-otros-costos-input"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Resumen en tiempo real */}
        <div className="bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between items-center text-zinc-600 dark:text-zinc-400">
              <span>Subtotal de mercancía</span>
              <span className="font-mono font-medium">${totalMercancia.toFixed(2)} MXN</span>
            </div>
            {envioCobradoNum > 0 && (
              <div className="flex justify-between items-center text-zinc-600 dark:text-zinc-400">
                <span>+ Envío cobrado al cliente</span>
                <span className="font-mono font-medium">+${envioCobradoNum.toFixed(2)} MXN</span>
              </div>
            )}
            {otrosCargosNum > 0 && (
              <div className="flex justify-between items-center text-zinc-600 dark:text-zinc-400">
                <span>+ Otros cargos {conceptoOtrosCargos.trim() ? `(${conceptoOtrosCargos.trim()})` : ""}</span>
                <span className="font-mono font-medium">+${otrosCargosNum.toFixed(2)} MXN</span>
              </div>
            )}
            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700 flex justify-between items-center text-sm font-bold text-zinc-900 dark:text-white">
              <span>= Total a cobrar al cliente</span>
              <span className="font-mono text-rose-600 dark:text-rose-400">${totalCobrado.toFixed(2)} MXN</span>
            </div>
          </div>

          {(costoEnvioNum > 0 || otrosCostosNum > 0) && (
            <div className="pt-3 border-t border-dashed border-zinc-200 dark:border-zinc-700 space-y-1.5 text-xs">
              <div className="font-semibold text-zinc-700 dark:text-zinc-300 text-[11px] uppercase tracking-wider">
                Costos asumidos por el negocio
              </div>
              {costoEnvioNum > 0 && (
                <div className="flex justify-between items-center text-zinc-500 dark:text-zinc-400">
                  <span>- Costo real del envío</span>
                  <span className="font-mono">-${costoEnvioNum.toFixed(2)} MXN</span>
                </div>
              )}
              {otrosCostosNum > 0 && (
                <div className="flex justify-between items-center text-zinc-500 dark:text-zinc-400">
                  <span>- Otros costos {conceptoOtrosCostos.trim() ? `(${conceptoOtrosCostos.trim()})` : ""}</span>
                  <span className="font-mono">-${otrosCostosNum.toFixed(2)} MXN</span>
                </div>
              )}
              <div className="pt-1.5 border-t border-zinc-200/80 dark:border-zinc-700/80 flex justify-between items-center font-semibold text-zinc-700 dark:text-zinc-300">
                <span>= Total de costos asociados</span>
                <span className="font-mono text-zinc-900 dark:text-white">${totalCostosVenta.toFixed(2)} MXN</span>
              </div>
              <p className="text-[10px] text-zinc-400 italic">
                * Estos costos son asumidos por el negocio y no afectan el total cobrado al cliente.
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
              Cancelar
            </button>
          )}

          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
            id="confirmar-venta-btn"
          >
            {loading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Registrando venta...</span>
              </>
            ) : (
              <>
                <ShoppingCart className="w-4 h-4" />
                <span>Confirmar Venta (${totalCobrado.toFixed(2)} MXN)</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Reusable Client Modal */}
      <ClienteModal
        isOpen={isClienteModalOpen}
        onClose={() => setIsClienteModalOpen(false)}
        existingClientes={clientes}
        onClienteSaved={(newCliente) => {
          setIsClienteModalOpen(false);
          if (newCliente.id) {
            setSelectedClienteId(newCliente.id);
          }
        }}
      />
    </div>
  );
}
