/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { firestoreService } from "../lib/firebase";
import { Almacen, Producto, StockItem } from "../types";
import { 
  ArrowRightLeft, 
  QrCode, 
  Settings, 
  CheckCircle, 
  X, 
  AlertCircle, 
  Info,
  Shirt,
  Tag,
  Package,
  Bookmark,
  Layers,
  Search
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface MovimientoFormProps {
  almacenes: Almacen[];
  productos: Producto[];
  preselectedSku?: string;
  preselectedAlmacenId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function MovimientoForm({ 
  almacenes, 
  productos, 
  preselectedSku = "", 
  preselectedAlmacenId = "",
  onSuccess, 
  onCancel 
}: MovimientoFormProps) {
  const [sku, setSku] = useState(preselectedSku);
  const [useCustomSku, setUseCustomSku] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductMarca, setNewProductMarca] = useState("dorsalclub");
  const [newProductCategory, setNewProductCategory] = useState("Camisetas");
  const [newProductColor, setNewProductColor] = useState("Negro");
  const [newProductTalla, setNewProductTalla] = useState("M");
  const [newProductMinStock, setNewProductMinStock] = useState<number | string>(3);
  
  // Stock state for checking current inventory in selected warehouse
  const [stockList, setStockList] = useState<StockItem[]>([]);

  // Selected base product filter for two-step selection
  const [selectedBaseModel, setSelectedBaseModel] = useState<string>("all");
  
  // Warehouses MUST start empty unless explicitly provided via contextual action
  const [almacenId, setAlmacenId] = useState<string>(() => {
    if (preselectedSku && preselectedAlmacenId) {
      return preselectedAlmacenId;
    }
    return "";
  });
  const [almacenDestinoId, setAlmacenDestinoId] = useState<string>("");
  const [tipo, setTipo] = useState<"entrada" | "salida" | "transferencia">("entrada");
  const [cantidad, setCantidad] = useState<number | string>(1);
  const [referencia, setReferencia] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Field-specific validation errors
  const [almacenError, setAlmacenError] = useState<string | null>(null);
  const [almacenDestinoError, setAlmacenDestinoError] = useState<string | null>(null);
  const [skuError, setSkuError] = useState<string | null>(null);

  // QR/Barcode Scanner state
  const [showScanner, setShowScanner] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const html5QrcodeRef = useRef<any>(null);

  // Sync props changes if preselectedSku / preselectedAlmacenId change
  useEffect(() => {
    if (preselectedSku) {
      setSku(preselectedSku);
    }
    if (preselectedAlmacenId) {
      setAlmacenId(preselectedAlmacenId);
    }
  }, [preselectedSku, preselectedAlmacenId]);

  // Form reset utility to clear all fields and validation errors
  const resetForm = () => {
    setSku("");
    setUseCustomSku(false);
    setNewProductName("");
    setNewProductMarca("dorsalclub");
    setNewProductCategory("Camisetas");
    setNewProductColor("Negro");
    setNewProductTalla("M");
    setNewProductMinStock(3);
    setSelectedBaseModel("all");
    setAlmacenId("");
    setAlmacenDestinoId("");
    setTipo("entrada");
    setCantidad(1);
    setReferencia("");
    setFormError(null);
    setAlmacenError(null);
    setAlmacenDestinoError(null);
    setSkuError(null);
    stopScanner();
  };

  // Cancel button handler: resets form and navigates to Dashboard
  const handleCancel = () => {
    resetForm();
    setFormSuccess(null);
    if (onCancel) {
      onCancel();
    }
  };

  // Load real-time stock for live feedback
  useEffect(() => {
    const unsub = firestoreService.getStockRealtime((data) => {
      setStockList(data);
    });
    return () => unsub();
  }, []);

  // Synchronize contextual preselection
  useEffect(() => {
    if (preselectedSku && preselectedAlmacenId) {
      setSku(preselectedSku);
      setAlmacenId(preselectedAlmacenId);
      setUseCustomSku(false);
    } else if (preselectedSku) {
      setSku(preselectedSku);
      setUseCustomSku(false);
    }
  }, [preselectedSku, preselectedAlmacenId]);

  // Selected product object
  const currentProduct = useMemo(() => {
    if (!sku) return null;
    return productos.find(p => p.sku?.toUpperCase() === sku.toUpperCase()) || null;
  }, [sku, productos]);

  // Unique base models list for filter dropdown
  const baseModels = useMemo(() => {
    const map = new Map<string, { baseId: string; nombre: string; marca: string }>();
    productos.forEach(p => {
      const key = p.producto_base_id || p.nombre;
      if (!map.has(key)) {
        map.set(key, {
          baseId: key,
          nombre: p.nombre,
          marca: p.marca || "dorsalclub"
        });
      }
    });
    return Array.from(map.values());
  }, [productos]);

  // Filtered variants to display in the dropdown
  const filteredVariantOptions = useMemo(() => {
    if (selectedBaseModel === "all") {
      return productos;
    }
    return productos.filter(p => (p.producto_base_id || p.nombre) === selectedBaseModel);
  }, [productos, selectedBaseModel]);

  // Current stock quantity for selected SKU in selected warehouse
  const currentOriginStock = useMemo(() => {
    if (!sku || !almacenId) return null;
    const cleanSku = sku.toUpperCase();
    const item = stockList.find(s => s.sku?.toUpperCase() === cleanSku && s.almacen_id === almacenId);
    return item ? item.cantidad : 0;
  }, [sku, almacenId, stockList]);

  // Current total stock across all warehouses
  const currentTotalStock = useMemo(() => {
    if (!sku) return 0;
    const cleanSku = sku.toUpperCase();
    return almacenes.reduce((acc, alm) => {
      const item = stockList.find(s => s.sku?.toUpperCase() === cleanSku && s.almacen_id === alm.id);
      return acc + (item ? item.cantidad : 0);
    }, 0);
  }, [sku, almacenes, stockList]);

  // Handler for changing transaction type
  const handleTipoChange = (newTipo: "entrada" | "salida" | "transferencia") => {
    setTipo(newTipo);
    setAlmacenId("");
    setAlmacenDestinoId("");
    setAlmacenError(null);
    setAlmacenDestinoError(null);
    setFormError(null);
  };

  // QR Scanner management
  const startScanner = async () => {
    setScannerError(null);
    setShowScanner(true);
    
    setTimeout(async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const qrInstance = new Html5Qrcode("qr-scanner-view");
        html5QrcodeRef.current = qrInstance;

        await qrInstance.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: (width, height) => {
              const size = Math.min(width, height) * 0.7;
              return { width: size, height: size * 0.5 };
            }
          },
          (decodedText) => {
            handleScanSuccess(decodedText);
          },
          () => {}
        );
      } catch (err: any) {
        console.error("Failed to start QR scanner:", err);
        setScannerError("No se pudo acceder a la cámara. Por favor concede los permisos o escribe el SKU.");
      }
    }, 300);
  };

  const stopScanner = async () => {
    if (html5QrcodeRef.current) {
      try {
        if (html5QrcodeRef.current.isScanning) {
          await html5QrcodeRef.current.stop();
        }
      } catch (err) {
        console.error("Error stopping scanner:", err);
      }
      html5QrcodeRef.current = null;
    }
    setShowScanner(false);
  };

  const handleScanSuccess = (decodedText: string) => {
    const clean = decodedText.trim().toUpperCase();
    const matchedByBarcode = productos.find(p => p.codigo_barras === clean);
    const matchedBySku = productos.find(p => p.sku?.toUpperCase() === clean);
    
    if (matchedByBarcode) {
      setSku(matchedByBarcode.sku);
      setUseCustomSku(false);
      stopScanner();
    } else if (matchedBySku) {
      setSku(matchedBySku.sku);
      setUseCustomSku(false);
      stopScanner();
    } else {
      setSku(clean);
      stopScanner();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    setAlmacenError(null);
    setAlmacenDestinoError(null);
    setSkuError(null);

    const cleanSku = sku.trim().toUpperCase();
    if (!cleanSku) {
      setSkuError("Debes seleccionar o escribir un SKU.");
      return;
    }

    if (!almacenId) {
      setAlmacenError("Debes seleccionar un almacén.");
      return;
    }

    if (tipo === "transferencia") {
      if (!almacenDestinoId) {
        setAlmacenDestinoError("Debes seleccionar un almacén de destino.");
        return;
      }
      if (almacenId === almacenDestinoId) {
        setAlmacenDestinoError("El almacén de destino no puede ser igual al de origen.");
        return;
      }
    }

    const qty = Number(cantidad);
    if (!qty || qty <= 0) {
      setFormError("La cantidad debe ser mayor a 0.");
      return;
    }

    setLoading(true);
    try {
      if (useCustomSku) {
        const existing = productos.find(p => p.sku?.toUpperCase() === cleanSku);
        if (!existing) {
          await firestoreService.addProducto({
            sku: cleanSku,
            nombre: newProductName.trim() || cleanSku,
            marca: newProductMarca.trim(),
            categoria: newProductCategory.trim(),
            color: newProductColor.trim(),
            talla: newProductTalla.trim(),
            tipo_talla: "ropa",
            unidad: "pieza",
            stock_minimo: Number(newProductMinStock) || 3,
            activo: true
          });
        }
      }

      await firestoreService.registrarMovimiento({
        sku: cleanSku,
        almacen_id: almacenId,
        almacen_destino_id: tipo === "transferencia" ? almacenDestinoId : undefined,
        tipo,
        cantidad: qty,
        referencia: referencia.trim() || undefined
      });

      setFormSuccess(`Movimiento de ${tipo} registrado exitosamente para ${cleanSku}.`);
      resetForm();
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      setFormError(err.message || "Error al procesar el movimiento.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center font-bold shadow-xs shrink-0">
            <ArrowRightLeft className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
              Registrar Movimiento de Inventario
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Entradas, salidas o transferencias entre almacenes en tiempo real
            </p>
          </div>
        </div>
      </div>

      {/* Main Form Card */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs overflow-hidden">
        {/* Camera Scanner View */}
        {showScanner && (
          <div className="p-4 bg-zinc-950 text-white border-b border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold flex items-center gap-2">
                <QrCode className="w-4 h-4 text-emerald-400" />
                Apunta al código de barras o QR de la prenda
              </span>
              <button
                type="button"
                onClick={stopScanner}
                className="text-xs text-zinc-400 hover:text-white"
              >
                Cerrar Cámara
              </button>
            </div>
            <div id="qr-scanner-view" className="w-full max-w-xs mx-auto rounded-xl overflow-hidden bg-black" />
            {scannerError && (
              <p className="text-xs text-rose-400 text-center">{scannerError}</p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Feedback alerts */}
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="font-medium">{formError}</span>
            </div>
          )}
          {formSuccess && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2.5">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span className="font-medium">{formSuccess}</span>
            </div>
          )}

          {/* STEP 1: PRODUCT SELECTION */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
              <Shirt className="w-3.5 h-3.5" />
              1. Selección de Producto y Variante
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              {/* Product Model Filter + Variant Select */}
              <div className="sm:col-span-8 space-y-2">
                {!useCustomSku ? (
                  <>
                    {/* Model filter */}
                    <div className="flex gap-2">
                      <select
                        value={selectedBaseModel}
                        onChange={(e) => {
                          setSelectedBaseModel(e.target.value);
                          setSku("");
                        }}
                        className="w-1/2 px-2.5 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-700 dark:text-zinc-300 focus:outline-none font-medium"
                      >
                        <option value="all">Filtrar por Modelo (Todos)</option>
                        {baseModels.map(m => (
                          <option key={m.baseId} value={m.baseId}>
                            {m.nombre} ({m.marca})
                          </option>
                        ))}
                      </select>

                      {/* Variant Select */}
                      <select
                        value={sku}
                        onChange={(e) => {
                          setSku(e.target.value);
                          setSkuError(null);
                        }}
                        className={`w-1/2 px-2.5 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800 border ${
                          skuError ? "border-rose-500" : "border-zinc-200 dark:border-zinc-700"
                        } rounded-xl text-zinc-900 dark:text-white focus:outline-none font-bold`}
                      >
                        <option value="">-- Seleccionar Variante / SKU --</option>
                        {filteredVariantOptions.map(p => (
                          <option key={p.sku} value={p.sku}>
                            {p.nombre} - {p.color || "Sin color"} / {p.talla || "U"} ({p.sku})
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      SKU Personalizado *
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. DC-HOODIE-BLK-L"
                      value={sku}
                      onChange={(e) => {
                        setSku(e.target.value.toUpperCase());
                        setSkuError(null);
                      }}
                      className="w-full px-3 py-1.5 text-xs font-mono font-bold uppercase bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white focus:outline-none"
                    />
                  </div>
                )}

                {skuError && <p className="text-[11px] text-rose-600 mt-1">{skuError}</p>}
              </div>

              {/* Tools: Scanner & Toggle Custom SKU */}
              <div className="sm:col-span-4 flex gap-2">
                <button
                  type="button"
                  onClick={startScanner}
                  className="flex-1 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-emerald-100 transition-colors"
                >
                  <QrCode className="w-4 h-4" />
                  Escanear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUseCustomSku(!useCustomSku);
                    setSku("");
                  }}
                  className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                  title={useCustomSku ? "Elegir del catálogo" : "Escribir SKU manual"}
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Selected product card summary */}
            {currentProduct && (
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 flex items-center justify-between text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-zinc-900 dark:text-white">{currentProduct.nombre}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-200 dark:bg-zinc-700 font-semibold">{currentProduct.marca || "dorsalclub"}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-zinc-500 dark:text-zinc-400 text-[11px]">
                    <span>Color: <strong>{currentProduct.color || "—"}</strong></span>
                    <span>Talla: <strong>{currentProduct.talla || "—"}</strong></span>
                    <span>SKU: <strong className="font-mono">{currentProduct.sku}</strong></span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-zinc-400 block font-medium">Stock Total</span>
                  <span className="font-bold text-sm text-zinc-900 dark:text-white">{currentTotalStock} {currentProduct.unidad || "pza"}s</span>
                </div>
              </div>
            )}
          </div>

          {/* STEP 2: MOVEMENT TRANSACTION */}
          <div className="space-y-3 border-t border-zinc-100 dark:border-zinc-800 pt-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
              <ArrowRightLeft className="w-3.5 h-3.5" />
              2. Detalles del Movimiento
            </h3>

            {/* Tipo de movimiento */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Tipo de Transacción
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["entrada", "salida", "transferencia"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleTipoChange(t)}
                    className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                      tipo === t
                        ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 border-zinc-900 dark:border-white shadow-xs"
                        : "bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100"
                    }`}
                  >
                    {t === "entrada" && "Entrada"}
                    {t === "salida" && "Salida"}
                    {t === "transferencia" && "Transferencia"}
                  </button>
                ))}
              </div>
            </div>

            {/* Cantidad & Referencia */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Cantidad (Unidades) *
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full px-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-mono font-bold focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Motivo / Referencia (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej. Reabastecimiento drop #2, Venta web, Devolución..."
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            {/* Almacenes Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  {tipo === "transferencia" ? "Almacén de Origen *" : "Almacén Afectado *"}
                </label>
                <select
                  value={almacenId}
                  onChange={(e) => {
                    setAlmacenId(e.target.value);
                    setAlmacenError(null);
                  }}
                  className={`w-full px-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border ${
                    almacenError ? "border-rose-500" : "border-zinc-200 dark:border-zinc-700"
                  } rounded-xl text-zinc-900 dark:text-white font-medium focus:outline-none`}
                >
                  <option value="" disabled>-- Seleccionar almacén --</option>
                  {almacenes.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.nombre} ({a.ubicacion})
                    </option>
                  ))}
                </select>
                {almacenError && <p className="text-[11px] text-rose-600 mt-1">{almacenError}</p>}
                {currentOriginStock !== null && (
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Stock actual en este almacén: <strong className="text-zinc-800 dark:text-zinc-200">{currentOriginStock}</strong>
                  </p>
                )}
              </div>

              {tipo === "transferencia" && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Almacén de Destino *
                  </label>
                  <select
                    value={almacenDestinoId}
                    onChange={(e) => {
                      setAlmacenDestinoId(e.target.value);
                      setAlmacenDestinoError(null);
                    }}
                    className={`w-full px-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border ${
                      almacenDestinoError ? "border-rose-500" : "border-zinc-200 dark:border-zinc-700"
                    } rounded-xl text-zinc-900 dark:text-white font-medium focus:outline-none`}
                  >
                    <option value="" disabled>-- Seleccionar almacén destino --</option>
                    {almacenes.map(a => (
                      <option key={a.id} value={a.id} disabled={a.id === almacenId}>
                        {a.nombre} {a.id === almacenId ? "(Mismo que origen)" : ""}
                      </option>
                    ))}
                  </select>
                  {almacenDestinoError && <p className="text-[11px] text-rose-600 mt-1">{almacenDestinoError}</p>}
                </div>
              )}
            </div>
          </div>

          {/* Footer actions */}
          <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 text-xs font-bold rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-black dark:hover:bg-zinc-100 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? "Procesando..." : "Confirmar Movimiento"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
