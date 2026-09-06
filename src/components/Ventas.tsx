/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { firestoreService } from "../lib/firebase";
import { Almacen, Producto, StockItem, Cliente, TipoCliente } from "../types";
import ClienteModal from "./ClienteModal";
import {
  TrendingDown,
  QrCode,
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
  Barcode,
  Plus,
  AlertTriangle,
  ChevronDown,
  Check,
  X
} from "lucide-react";

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
  const [sku, setSku] = useState(preselectedSku);
  const [almacenId, setAlmacenId] = useState<string>(preselectedAlmacenId || almacenes[0]?.id || "");
  const [cantidad, setCantidad] = useState<number | string>(1);
  const [precioUnitario, setPrecioUnitario] = useState<number | string>("");
  const [referencia, setReferencia] = useState("");

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

  // QR / Barcode scanner
  const [showScanner, setShowScanner] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const html5QrcodeRef = useRef<any>(null);

  // Sync initial props
  useEffect(() => {
    if (preselectedSku) setSku(preselectedSku);
    if (preselectedAlmacenId) setAlmacenId(preselectedAlmacenId);
    if (preselectedClienteId) setSelectedClienteId(preselectedClienteId);
  }, [preselectedSku, preselectedAlmacenId, preselectedClienteId]);

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

  // Selected product details
  const selectedProduct = useMemo(() => {
    if (!sku) return null;
    return productos.find((p) => p.sku.toLowerCase() === sku.toLowerCase()) || null;
  }, [sku, productos]);

  // Update default unit price when product changes
  useEffect(() => {
    if (selectedProduct && selectedProduct.precio_venta !== undefined) {
      setPrecioUnitario(selectedProduct.precio_venta);
    }
  }, [selectedProduct]);

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

  // Current stock available in selected warehouse
  const availableStock = useMemo(() => {
    if (!sku || !almacenId) return null;
    const stockItem = stockList.find(
      (s) => s.sku.toLowerCase() === sku.toLowerCase() && s.almacen_id === almacenId
    );
    return stockItem ? stockItem.cantidad : 0;
  }, [sku, almacenId, stockList]);

  // Calculated totals
  const numQuantity = Number(cantidad) || 0;
  const unitPriceVal = typeof precioUnitario === "number" ? precioUnitario : parseFloat(String(precioUnitario)) || 0;
  const totalCalculado = unitPriceVal * numQuantity;

  // Scanner controls
  const startScanner = async () => {
    setScannerError(null);
    setShowScanner(true);
    setTimeout(async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const qrCode = new Html5Qrcode("ventas-barcode-reader");
        html5QrcodeRef.current = qrCode;
        await qrCode.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            const cleanText = decodedText.trim().toUpperCase();
            setSku(cleanText);
            stopScanner();
          },
          () => {}
        );
      } catch (err) {
        console.error("Scanner error:", err);
        setScannerError("No se pudo acceder a la cámara. Verifica los permisos.");
      }
    }, 100);
  };

  const stopScanner = () => {
    if (html5QrcodeRef.current) {
      html5QrcodeRef.current
        .stop()
        .then(() => {
          html5QrcodeRef.current?.clear();
          html5QrcodeRef.current = null;
          setShowScanner(false);
        })
        .catch(() => {
          setShowScanner(false);
        });
    } else {
      setShowScanner(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const cleanSku = sku.trim().toUpperCase();
    if (!cleanSku) {
      setFormError("Por favor selecciona o escanea un producto / SKU.");
      return;
    }

    if (!almacenId) {
      setFormError("Por favor selecciona el almacén de despacho.");
      return;
    }

    if (isNaN(numQuantity) || numQuantity <= 0) {
      setFormError("La cantidad debe ser un número entero mayor a cero.");
      return;
    }

    if (availableStock !== null && availableStock < numQuantity) {
      setFormError(
        `Stock insuficiente en el almacén seleccionado. Stock disponible: ${availableStock} uds, solicitado: ${numQuantity} uds.`
      );
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

      const res = await firestoreService.registerMovimientoTransaction({
        sku: cleanSku,
        almacen_id: almacenId,
        tipo: "salida",
        cantidad: numQuantity,
        referencia: fullReference,
        cliente_id: clienteId,
        cliente_nombre: clienteNombre,
        cliente_tipo: clienteTipo,
        precio_unitario_venta: unitPriceVal,
        total_venta: totalCalculado
      });

      setFormSuccess(`¡Venta registrada con éxito! Folio generado: ${res.folio}. El stock ha sido descontado.`);

      setCantidad(1);
      setReferencia("");
      setSelectedClienteId("");

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

      {/* Barcode Scanner Modal/Overlay */}
      {showScanner && (
        <div className="p-4 bg-zinc-900 text-white rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
              <QrCode className="w-4 h-4 text-rose-400" />
              Escáner de Código de Barras / SKU
            </span>
            <button
              type="button"
              onClick={stopScanner}
              className="text-xs text-zinc-400 hover:text-white"
            >
              Cerrar escáner
            </button>
          </div>
          <div id="ventas-barcode-reader" className="w-full max-w-sm mx-auto overflow-hidden rounded-xl bg-black" />
          {scannerError && <p className="text-xs text-rose-400 text-center">{scannerError}</p>}
        </div>
      )}

      {/* Sales Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs space-y-5">
          {/* Product Selection */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                Producto / Variante a Vender <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={startScanner}
                className="text-xs text-rose-500 hover:text-rose-600 flex items-center gap-1 font-semibold"
              >
                <Barcode className="w-3.5 h-3.5" />
                <span>Escanear código de barras</span>
              </button>
            </div>

            <div className="relative">
              <select
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white font-mono"
              >
                <option value="">-- Seleccionar producto por SKU o Nombre --</option>
                {productos.map((prod) => (
                  <option key={prod.sku} value={prod.sku}>
                    [{prod.sku}] {prod.nombre} {prod.talla ? `- Talla: ${prod.talla}` : ""}{" "}
                    {prod.color ? `(${prod.color})` : ""} - Precio: ${prod.precio_venta || 0}
                  </option>
                ))}
              </select>
            </div>

            {/* Selected Product Specs Badge */}
            {selectedProduct && (
              <div className="mt-2 p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-200 dark:border-zinc-700/60 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-rose-500 shrink-0" />
                  <span className="font-bold text-zinc-900 dark:text-white">
                    {selectedProduct.nombre}
                  </span>
                  {selectedProduct.talla && (
                    <span className="px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-700 rounded text-[10px] font-mono">
                      Talla: {selectedProduct.talla}
                    </span>
                  )}
                  {selectedProduct.color && (
                    <span className="px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-700 rounded text-[10px]">
                      {selectedProduct.color}
                    </span>
                  )}
                </div>
                <div className="text-zinc-500 text-[11px] font-mono">
                  Precio sugerido: ${selectedProduct.precio_venta || 0} MXN
                </div>
              </div>
            )}
          </div>

          {/* Warehouse and Stock */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                Almacén de Despacho <span className="text-rose-500">*</span>
              </label>
              <select
                value={almacenId}
                onChange={(e) => setAlmacenId(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white font-medium"
              >
                {almacenes.map((alm) => (
                  <option key={alm.id} value={alm.id}>
                    {alm.nombre}
                  </option>
                ))}
              </select>

              {sku && (
                <div className="mt-1.5 text-[11px] flex items-center gap-1.5">
                  <span className="text-zinc-500">Stock disponible en este almacén:</span>
                  <span
                    className={`font-bold font-mono px-1.5 py-0.5 rounded ${
                      (availableStock || 0) > 0
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                        : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400"
                    }`}
                  >
                    {availableStock !== null ? `${availableStock} uds` : "Consultando..."}
                  </span>
                </div>
              )}
            </div>

            {/* Cantidad a vender */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                Cantidad a Vender <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value === "" ? "" : Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-zinc-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
              />
            </div>
          </div>

          {/* Pricing Row: Unit Price & Calculated Total */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 bg-zinc-50 dark:bg-zinc-800/30 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                Precio Unitario de Venta ($ MXN)
              </label>
              <div className="relative">
                <DollarSign className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={precioUnitario}
                  onChange={(e) => setPrecioUnitario(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white font-mono"
                />
              </div>
              <p className="text-[11px] text-zinc-400 mt-1">
                Editable por venta o toma el precio del catálogo.
              </p>
            </div>

            <div className="flex flex-col justify-center">
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider block mb-1">
                Total de la Venta
              </span>
              <div className="text-xl font-bold font-mono text-zinc-900 dark:text-white">
                ${totalCalculado.toFixed(2)} <span className="text-xs text-zinc-400 font-sans font-normal">MXN</span>
              </div>
              <span className="text-[11px] text-zinc-500 font-mono">
                {numQuantity} uds × ${unitPriceVal.toFixed(2)}
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
          </div>
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
                <span>Confirmar Venta (${totalCalculado.toFixed(2)} MXN)</span>
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
