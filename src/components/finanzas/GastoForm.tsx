/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Receipt, 
  ArrowLeft, 
  Check, 
  AlertCircle, 
  Calendar, 
  DollarSign, 
  CreditCard, 
  Building2, 
  Tag, 
  FileText,
  User,
  Loader2
} from "lucide-react";
import { 
  Almacen, 
  Gasto, 
  CategoriaGasto, 
  MetodoPagoGasto, 
  CATEGORIAS_GASTO, 
  METODOS_PAGO_GASTO 
} from "../../types";
import { firestoreService } from "../../lib/firebase";

interface GastoFormProps {
  mode: "create" | "edit";
  gastoId?: string;
  almacenes: Almacen[];
  onSuccess: () => void;
  onCancel: () => void;
}

export default function GastoForm({
  mode,
  gastoId,
  almacenes,
  onSuccess,
  onCancel
}: GastoFormProps) {
  // STRICT "Empty by default" policy: absolutely no pre-selected, pre-filled or calculated values on new form.
  const [concepto, setConcepto] = useState("");
  const [categoria, setCategoria] = useState<string>("");
  const [monto, setMonto] = useState<string>("");
  const [fecha, setFecha] = useState<string>("");
  const [metodoPago, setMetodoPago] = useState<string>("");
  const [almacenId, setAlmacenId] = useState<string>("");
  const [proveedor, setProveedor] = useState("");
  const [referencia, setReferencia] = useState("");
  const [notas, setNotas] = useState("");

  const [loadingInitial, setLoadingInitial] = useState(mode === "edit");
  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // If in edit mode, fetch the existing expense to populate the form
  useEffect(() => {
    if (mode === "edit" && gastoId) {
      setLoadingInitial(true);
      setInitialLoadError(null);
      firestoreService.getGastoById(gastoId)
        .then((g) => {
          if (!g) {
            setInitialLoadError("No se encontró el registro de gasto solicitado.");
            return;
          }
          setConcepto(g.concepto || "");
          setCategoria(g.categoria || "");
          setMonto(g.monto !== undefined && g.monto !== null ? String(g.monto) : "");
          setFecha(g.fecha_str || "");
          setMetodoPago(g.metodo_pago || "");
          setAlmacenId(g.almacen_id || "");
          setProveedor(g.proveedor || "");
          setReferencia(g.referencia || "");
          setNotas(g.notas || "");
        })
        .catch((err) => {
          console.error("Error al cargar gasto:", err);
          setInitialLoadError("Ocurrió un error al cargar el gasto para edición.");
        })
        .finally(() => {
          setLoadingInitial(false);
        });
    }
  }, [mode, gastoId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validation
    const cleanConcepto = concepto.trim();
    if (!cleanConcepto) {
      setErrorMessage("El concepto o descripción del gasto es obligatorio.");
      return;
    }

    if (!categoria) {
      setErrorMessage("Debes seleccionar una categoría para el gasto.");
      return;
    }

    const numMonto = parseFloat(monto);
    if (!monto || isNaN(numMonto) || numMonto <= 0) {
      setErrorMessage("El monto debe ser una cantidad válida mayor a $0.00 MXN.");
      return;
    }

    if (!fecha) {
      setErrorMessage("La fecha del gasto es obligatoria.");
      return;
    }

    // Parse date in local timezone
    const [year, month, day] = fecha.split("-").map(Number);
    const parsedFecha = new Date(year, month - 1, day, 12, 0, 0);
    if (isNaN(parsedFecha.getTime())) {
      setErrorMessage("La fecha especificada es inválida.");
      return;
    }

    if (!metodoPago) {
      setErrorMessage("Debes seleccionar un método de pago.");
      return;
    }

    const selectedAlm = almacenes.find(a => a.id === almacenId);
    const almacenNombre = selectedAlm ? selectedAlm.nombre : undefined;

    setSaving(true);
    try {
      if (mode === "create") {
        await firestoreService.addGasto({
          concepto: cleanConcepto,
          categoria: categoria as CategoriaGasto,
          monto: numMonto,
          fecha: parsedFecha,
          fecha_str: fecha,
          metodo_pago: metodoPago as MetodoPagoGasto,
          almacen_id: almacenId ? almacenId : undefined,
          almacen_nombre: almacenNombre,
          proveedor: proveedor.trim() ? proveedor.trim() : undefined,
          referencia: referencia.trim() ? referencia.trim() : undefined,
          notas: notas.trim() ? notas.trim() : undefined
        });
      } else if (mode === "edit" && gastoId) {
        await firestoreService.updateGasto(gastoId, {
          concepto: cleanConcepto,
          categoria: categoria as CategoriaGasto,
          monto: numMonto,
          fecha: parsedFecha,
          fecha_str: fecha,
          metodo_pago: metodoPago as MetodoPagoGasto,
          almacen_id: almacenId ? almacenId : undefined,
          almacen_nombre: almacenNombre,
          proveedor: proveedor.trim() ? proveedor.trim() : undefined,
          referencia: referencia.trim() ? referencia.trim() : undefined,
          notas: notas.trim() ? notas.trim() : undefined
        });
      }

      onSuccess();
    } catch (err: any) {
      console.error("Error al guardar gasto:", err);
      setErrorMessage(err?.message || "Ocurrió un error al intentar guardar el gasto.");
      setSaving(false);
    }
  };

  if (loadingInitial) {
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
        <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-xl p-6 sm:p-8 animate-pulse space-y-6">
          <div className="flex items-center space-x-3">
            <div className="h-8 w-8 bg-slate-200 dark:bg-slate-800 rounded-lg" />
            <div className="space-y-2 flex-1">
              <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded w-1/3" />
              <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/4" />
            </div>
          </div>
          <div className="space-y-4 pt-4">
            <div className="h-10 bg-slate-100 dark:bg-slate-800/60 rounded-lg" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="h-10 bg-slate-100 dark:bg-slate-800/60 rounded-lg" />
              <div className="h-10 bg-slate-100 dark:bg-slate-800/60 rounded-lg" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="h-10 bg-slate-100 dark:bg-slate-800/60 rounded-lg" />
              <div className="h-10 bg-slate-100 dark:bg-slate-800/60 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (initialLoadError) {
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-xl p-6 text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-rose-500 mx-auto" />
          <h3 className="text-base font-semibold text-rose-800 dark:text-rose-200">
            Registro no encontrado
          </h3>
          <p className="text-sm text-rose-600 dark:text-rose-300">
            {initialLoadError}
          </p>
          <div className="pt-2">
            <button
              type="button"
              id="gasto-error-back-btn"
              onClick={onCancel}
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg bg-white dark:bg-[#111827] border border-rose-300 dark:border-rose-800 text-sm font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-100/50 dark:hover:bg-rose-900/40 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Volver a gastos</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-3 sm:p-6 space-y-4">
      {/* Top Header / Back navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          id="btn-volver-gastos"
          onClick={onCancel}
          className="inline-flex items-center space-x-2 text-xs sm:text-sm font-medium text-[#64748B] hover:text-[#172033] dark:text-[#94A3B8] dark:hover:text-[#F8FAFC] transition-colors py-1 px-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Volver al historial de gastos</span>
        </button>
      </div>

      {/* Main Form Container */}
      <form 
        onSubmit={handleSubmit}
        className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-xl shadow-xs overflow-hidden"
        id="form-gasto"
      >
        {/* Card Header */}
        <div className="px-5 py-4 border-b border-[#E2E8F0] dark:border-[#263449] flex items-center space-x-3 bg-slate-50/50 dark:bg-[#182235]/40">
          <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 shrink-0">
            <Receipt className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#172033] dark:text-[#F8FAFC]">
              {mode === "create" ? "Registrar Nuevo Gasto" : "Editar Gasto"}
            </h2>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
              {mode === "create" 
                ? "Ingresa los datos del egreso operativo. Todos los campos obligatorios deben completarse manualmente." 
                : "Modifica los datos del egreso operativo registrado."}
            </p>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mx-5 mt-5 p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs sm:text-sm text-rose-800 dark:text-rose-200">
              {errorMessage}
            </div>
          </div>
        )}

        {/* Form Body */}
        <div className="p-5 sm:p-6 space-y-5">
          {/* Concepto */}
          <div>
            <label 
              htmlFor="gasto-concepto"
              className="block text-xs font-semibold uppercase tracking-wider text-[#475569] dark:text-[#94A3B8] mb-1.5"
            >
              Concepto o Descripción <span className="text-rose-500 font-bold">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                id="gasto-concepto"
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                placeholder="Ej. Envío con Estafeta guía #29482, Compra de cajas y cinta, Publicidad Meta..."
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#0F172A] text-[#172033] dark:text-[#F8FAFC] text-sm placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#059669] focus:border-transparent transition-all"
                autoFocus={mode === "create"}
              />
            </div>
          </div>

          {/* Categoría y Monto */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
            {/* Categoría */}
            <div>
              <label 
                htmlFor="gasto-categoria"
                className="block text-xs font-semibold uppercase tracking-wider text-[#475569] dark:text-[#94A3B8] mb-1.5"
              >
                Categoría <span className="text-rose-500 font-bold">*</span>
              </label>
              <div className="relative">
                <select
                  id="gasto-categoria"
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#0F172A] text-[#172033] dark:text-[#F8FAFC] text-sm focus:outline-none focus:ring-2 focus:ring-[#059669] focus:border-transparent transition-all cursor-pointer"
                >
                  <option value="">-- Seleccionar categoría --</option>
                  {CATEGORIAS_GASTO.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Monto */}
            <div>
              <label 
                htmlFor="gasto-monto"
                className="block text-xs font-semibold uppercase tracking-wider text-[#475569] dark:text-[#94A3B8] mb-1.5"
              >
                Monto (MXN) <span className="text-rose-500 font-bold">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#64748B] dark:text-[#94A3B8]">
                  <span className="font-semibold text-sm">$</span>
                </div>
                <input
                  type="number"
                  id="gasto-monto"
                  step="0.01"
                  min="0.01"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-8 pr-3.5 py-2.5 rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#0F172A] text-[#172033] dark:text-[#F8FAFC] text-sm placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#059669] focus:border-transparent transition-all font-mono"
                />
              </div>
            </div>
          </div>

          {/* Fecha y Método de Pago */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
            {/* Fecha */}
            <div>
              <label 
                htmlFor="gasto-fecha"
                className="block text-xs font-semibold uppercase tracking-wider text-[#475569] dark:text-[#94A3B8] mb-1.5"
              >
                Fecha del Gasto <span className="text-rose-500 font-bold">*</span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  id="gasto-fecha"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#0F172A] text-[#172033] dark:text-[#F8FAFC] text-sm focus:outline-none focus:ring-2 focus:ring-[#059669] focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Método de Pago */}
            <div>
              <label 
                htmlFor="gasto-metodo-pago"
                className="block text-xs font-semibold uppercase tracking-wider text-[#475569] dark:text-[#94A3B8] mb-1.5"
              >
                Método de Pago <span className="text-rose-500 font-bold">*</span>
              </label>
              <div className="relative">
                <select
                  id="gasto-metodo-pago"
                  value={metodoPago}
                  onChange={(e) => setMetodoPago(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#0F172A] text-[#172033] dark:text-[#F8FAFC] text-sm focus:outline-none focus:ring-2 focus:ring-[#059669] focus:border-transparent transition-all cursor-pointer"
                >
                  <option value="">-- Seleccionar método de pago --</option>
                  {METODOS_PAGO_GASTO.map((met) => (
                    <option key={met} value={met}>
                      {met}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Almacén y Proveedor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
            {/* Almacén / Sucursal */}
            <div>
              <label 
                htmlFor="gasto-almacen"
                className="block text-xs font-semibold uppercase tracking-wider text-[#475569] dark:text-[#94A3B8] mb-1.5"
              >
                Almacén / Sucursal <span className="text-[#94A3B8] font-normal lowercase">(opcional)</span>
              </label>
              <div className="relative">
                <select
                  id="gasto-almacen"
                  value={almacenId}
                  onChange={(e) => setAlmacenId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#0F172A] text-[#172033] dark:text-[#F8FAFC] text-sm focus:outline-none focus:ring-2 focus:ring-[#059669] focus:border-transparent transition-all cursor-pointer"
                >
                  <option value="">-- Seleccionar almacén (opcional) --</option>
                  {almacenes.map((alm) => (
                    <option key={alm.id} value={alm.id}>
                      {alm.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Proveedor o Beneficiario */}
            <div>
              <label 
                htmlFor="gasto-proveedor"
                className="block text-xs font-semibold uppercase tracking-wider text-[#475569] dark:text-[#94A3B8] mb-1.5"
              >
                Proveedor o Beneficiario <span className="text-[#94A3B8] font-normal lowercase">(opcional)</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="gasto-proveedor"
                  value={proveedor}
                  onChange={(e) => setProveedor(e.target.value)}
                  placeholder="Ej. Paquetexpress, DHL, Meta Platforms, CFE..."
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#0F172A] text-[#172033] dark:text-[#F8FAFC] text-sm placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#059669] focus:border-transparent transition-all"
                />
              </div>
            </div>
          </div>

          {/* Referencia o Folio */}
          <div>
            <label 
              htmlFor="gasto-referencia"
              className="block text-xs font-semibold uppercase tracking-wider text-[#475569] dark:text-[#94A3B8] mb-1.5"
            >
              Referencia / Comprobante / Folio <span className="text-[#94A3B8] font-normal lowercase">(opcional)</span>
            </label>
            <div className="relative">
              <input
                type="text"
                id="gasto-referencia"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Ej. Factura #A-4921, Folio de transferencia #88194, Ticket #102..."
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#0F172A] text-[#172033] dark:text-[#F8FAFC] text-sm placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#059669] focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* Notas */}
          <div>
            <label 
              htmlFor="gasto-notas"
              className="block text-xs font-semibold uppercase tracking-wider text-[#475569] dark:text-[#94A3B8] mb-1.5"
            >
              Notas u Observaciones <span className="text-[#94A3B8] font-normal lowercase">(opcional)</span>
            </label>
            <textarea
              id="gasto-notas"
              rows={3}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Detalles sobre este gasto, justificación o anotaciones para control interno..."
              className="w-full px-3.5 py-2.5 rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#0F172A] text-[#172033] dark:text-[#F8FAFC] text-sm placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#059669] focus:border-transparent transition-all resize-y"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 bg-slate-50 dark:bg-[#182235]/40 border-t border-[#E2E8F0] dark:border-[#263449] flex items-center justify-end space-x-3">
          <button
            type="button"
            id="gasto-cancel-btn"
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 rounded-lg border border-[#CBD5E1] dark:border-[#334155] text-sm font-medium text-[#475569] dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            id="gasto-submit-btn"
            disabled={saving}
            className="inline-flex items-center space-x-2 px-5 py-2 rounded-lg bg-[#059669] hover:bg-[#047857] text-white text-sm font-semibold shadow-xs transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#059669] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Guardando...</span>
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                <span>{mode === "create" ? "Guardar Gasto" : "Actualizar Gasto"}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
