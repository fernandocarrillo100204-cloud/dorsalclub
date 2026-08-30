/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { firestoreService } from "../lib/firebase";
import { Almacen, Producto, StockItem } from "../types";
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
  Hash,
  ArrowRight,
  Warehouse,
  Barcode
} from "lucide-react";

interface VentasProps {
  almacenes: Almacen[];
  productos: Producto[];
  preselectedSku?: string;
  preselectedAlmacenId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function Ventas({
  almacenes,
  productos,
  preselectedSku = "",
  preselectedAlmacenId = "",
  onSuccess,
  onCancel
}: VentasProps) {
  const [sku, setSku] = useState(preselectedSku);
  const [almacenId, setAlmacenId] = useState<string>(preselectedAlmacenId || almacenes[0]?.id || "");
  const [cantidad, setCantidad] = useState<number | string>(1);
  const [referencia, setReferencia] = useState("");
  const [cliente, setCliente] = useState("");

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
  }, [preselectedSku, preselectedAlmacenId]);

  // Subscribe to stock
  useEffect(() => {
    const unsub = firestoreService.getStockRealtime((items) => {
      setStockList(items);
    });
    return () => unsub();
  }, []);

  // Selected product details
  const selectedProduct = useMemo(() => {
    if (!sku) return null;
    return productos.find((p) => p.sku.toLowerCase() === sku.toLowerCase()) || null;
  }, [sku, productos]);

  // Current stock available in selected warehouse
  const availableStock = useMemo(() => {
    if (!sku || !almacenId) return null;
    const stockItem = stockList.find(
      (s) => s.sku.toLowerCase() === sku.toLowerCase() && s.almacen_id === almacenId
    );
    return stockItem ? stockItem.cantidad : 0;
  }, [sku, almacenId, stockList]);

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

    const numQty = Number(cantidad);
    if (isNaN(numQty) || numQty <= 0) {
      setFormError("La cantidad debe ser un número entero mayor a cero.");
      return;
    }

    if (availableStock !== null && availableStock < numQty) {
      setFormError(
        `Stock insuficiente en el almacén seleccionado. Stock disponible: ${availableStock} uds, solicitado: ${numQty} uds.`
      );
      return;
    }

    setLoading(true);
    try {
      const fullReference = [
        referencia.trim() ? `Ref: ${referencia.trim()}` : "",
        cliente.trim() ? `Cliente: ${cliente.trim()}` : ""
      ]
        .filter(Boolean)
        .join(" | ") || "Venta de mostrador / Tienda";

      const res = await firestoreService.registerMovimientoTransaction({
        sku: cleanSku,
        almacen_id: almacenId,
        tipo: "salida",
        cantidad: numQty,
        referencia: fullReference
      });

      setFormSuccess(`¡Venta registrada con éxito! Folio generado: ${res.folio}. El stock ha sido descontado.`);

      setCantidad(1);
      setReferencia("");
      setCliente("");

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
          Descuenta unidades vendidas en tienda física o canales digitales y actualiza el análisis comercial en vivo.
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
                className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline"
              >
                <Barcode className="w-3.5 h-3.5" />
                <span>Escanear Código</span>
              </button>
            </div>

            <select
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-zinc-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
            >
              <option value="">-- Seleccionar producto del catálogo --</option>
              {productos.map((prod) => (
                <option key={prod.id || prod.sku} value={prod.sku}>
                  {prod.sku} — {prod.nombre} ({prod.color || "U"} / {prod.talla || "U"}) - ${prod.precio_venta || 0}
                </option>
              ))}
            </select>

            {selectedProduct && (
              <div className="mt-2.5 p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-200 dark:border-zinc-700 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <span className="font-bold text-zinc-900 dark:text-white block">{selectedProduct.nombre}</span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Marca: {selectedProduct.marca || "dorsalclub"} • Color: {selectedProduct.color || "—"} • Talla: {selectedProduct.talla || "U"}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-zinc-400 block uppercase font-semibold">Precio de Venta</span>
                  <span className="font-bold font-mono text-zinc-900 dark:text-white text-sm">
                    ${(selectedProduct.precio_venta || 0).toFixed(2)} MXN
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Warehouse and Quantity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Almacén de despacho */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                Almacén de Despacho <span className="text-rose-500">*</span>
              </label>
              <div className="relative flex items-center">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                  <Warehouse className="w-4 h-4" />
                </span>
                <select
                  required
                  value={almacenId}
                  onChange={(e) => setAlmacenId(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl pl-9 pr-3 py-2.5 text-xs text-zinc-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
                >
                  {almacenes.map((alm) => (
                    <option key={alm.id} value={alm.id}>
                      {alm.nombre} — {alm.ubicacion}
                    </option>
                  ))}
                </select>
              </div>

              {/* Stock in this warehouse indicator */}
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
              {selectedProduct && typeof cantidad === "number" && (
                <div className="mt-1.5 text-[11px] text-zinc-500 flex justify-between">
                  <span>Total estimado venta:</span>
                  <span className="font-bold text-zinc-900 dark:text-white font-mono">
                    ${((selectedProduct.precio_venta || 0) * cantidad).toFixed(2)} MXN
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Reference & Customer */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Cliente / Destinatario (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ej. Juan Pérez / Mostrador"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-semibold text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            disabled={loading || (availableStock !== null && availableStock < Number(cantidad))}
            className="px-6 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900 font-bold text-xs transition-all shadow-sm flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span>Registrando Venta...</span>
              </>
            ) : (
              <>
                <TrendingDown className="w-4 h-4 text-rose-500" />
                <span>Registrar Venta</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
