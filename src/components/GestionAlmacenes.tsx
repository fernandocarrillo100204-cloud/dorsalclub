/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { firestoreService } from "../lib/firebase";
import { Almacen, StockItem, Producto } from "../types";
import { 
  Warehouse, 
  Plus, 
  Edit2, 
  Trash2, 
  MapPin, 
  AlertTriangle, 
  Search, 
  X, 
  Check, 
  AlertCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface GestionAlmacenesProps {
  almacenes?: Almacen[];
  productos?: Producto[];
  stockList?: StockItem[];
}

export default function GestionAlmacenes({ 
  almacenes: propAlmacenes, 
  productos = [], 
  stockList: propStockList 
}: GestionAlmacenesProps) {
  const [internalAlmacenes, setInternalAlmacenes] = useState<Almacen[]>(propAlmacenes || []);
  const [internalStockList, setInternalStockList] = useState<StockItem[]>(propStockList || []);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Modal and Form States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedAlmacen, setSelectedAlmacen] = useState<Almacen | null>(null);
  const [nombre, setNombre] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const almacenes = propAlmacenes ?? internalAlmacenes;
  const stockList = propStockList ?? internalStockList;

  // Fallback subscriptions only if props are not provided
  useEffect(() => {
    if (propAlmacenes && propStockList) return;

    setLoading(true);
    let unsubAlm = () => {};
    let unsubStock = () => {};

    if (!propAlmacenes) {
      unsubAlm = firestoreService.getAlmacenesRealtime((data) => {
        setInternalAlmacenes(data);
        setLoading(false);
      });
    }

    if (!propStockList) {
      unsubStock = firestoreService.getStockRealtime((data) => {
        setInternalStockList(data);
      });
    }

    return () => {
      unsubAlm();
      unsubStock();
    };
  }, [propAlmacenes, propStockList]);

  // Filtered warehouses
  const filteredAlmacenes = almacenes.filter(alm => {
    const query = searchQuery.toLowerCase();
    return (
      alm.nombre.toLowerCase().includes(query) ||
      alm.ubicacion.toLowerCase().includes(query)
    );
  });

  // Check if a warehouse has stock registered (with normalized warehouse matching)
  const getWarehouseStockStatus = (almacenId: string) => {
    const normId = firestoreService.normalizeWarehouseId(almacenId, almacenes);
    const warehouseStock = stockList.filter(item => 
      firestoreService.normalizeWarehouseId(item.almacen_id, almacenes) === normId
    );
    const totalUnits = warehouseStock.reduce((acc, curr) => acc + curr.cantidad, 0);
    const uniqueItemsCount = warehouseStock.filter(item => item.cantidad > 0).length;
    
    return {
      hasStock: totalUnits > 0,
      totalUnits,
      uniqueItemsCount
    };
  };

  // Open Form modal (for Add or Edit)
  const openFormModal = (almacen: Almacen | null = null) => {
    setFormError(null);
    if (almacen) {
      setSelectedAlmacen(almacen);
      setNombre(almacen.nombre);
      setUbicacion(almacen.ubicacion);
    } else {
      setSelectedAlmacen(null);
      setNombre("");
      setUbicacion("");
    }
    setIsFormOpen(true);
  };

  // Open Delete confirmation modal
  const openDeleteModal = (almacen: Almacen) => {
    setSelectedAlmacen(almacen);
    setIsDeleteOpen(true);
  };

  // Handle Form Submit
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim() || !ubicacion.trim()) {
      setFormError("Todos los campos son obligatorios.");
      return;
    }

    setSubmitLoading(true);
    setFormError(null);

    try {
      if (selectedAlmacen) {
        // Edit mode
        await firestoreService.updateAlmacen(selectedAlmacen.id, {
          nombre: nombre.trim(),
          ubicacion: ubicacion.trim()
        });
      } else {
        // Add mode
        await firestoreService.addAlmacen({
          nombre: nombre.trim(),
          ubicacion: ubicacion.trim()
        });
      }
      setIsFormOpen(false);
    } catch (err: any) {
      console.error("Error saving warehouse:", err);
      setFormError(err.message || "Ocurrió un error al guardar el almacén.");
    } finally {
      setSubmitLoading(false);
    }
  };

  // Handle Delete execution
  const handleDeleteSubmit = async () => {
    if (!selectedAlmacen) return;
    
    const { hasStock } = getWarehouseStockStatus(selectedAlmacen.id);
    if (hasStock) {
      alert("No se puede eliminar un almacén con stock registrado.");
      return;
    }

    setSubmitLoading(true);
    try {
      await firestoreService.deleteAlmacen(selectedAlmacen.id);
      setIsDeleteOpen(false);
    } catch (err: any) {
      console.error("Error deleting warehouse:", err);
      alert(err.message || "Error al eliminar el almacén.");
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-3.5 sm:px-5 lg:px-6 py-5" id="gestion-almacenes-view">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-5 gap-3">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-bold text-[#172033] dark:text-[#F8FAFC] tracking-tight leading-tight">
            Gestión de Almacenes
          </h1>
          <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
            Administra las sedes físicas, ubicaciones y puntos de distribución de la empresa.
          </p>
        </div>
        <div className="shrink-0">
          <button
            onClick={() => openFormModal(null)}
            className="w-full md:w-auto bg-[#059669] hover:bg-[#047857] text-white font-semibold px-3.5 py-2 rounded-lg transition-all shadow-xs flex items-center justify-center space-x-1.5 text-xs focus:outline-none"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Agregar almacén</span>
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-[#F8FAFC] dark:bg-[#182235] border border-[#E2E8F0] dark:border-[#263449] rounded-xl p-3.5 mb-4 shadow-xs">
        <div className="relative max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-3.5 w-3.5 text-[#64748B] dark:text-[#94A3B8]" />
          </div>
          <input
            type="text"
            placeholder="Buscar por nombre o ubicación..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#263449] text-[#172033] dark:text-[#F8FAFC] text-xs sm:text-sm rounded-lg focus:outline-none focus:border-[#059669] dark:focus:border-emerald-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery("")} 
              className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-[#64748B] dark:text-[#94A3B8] hover:text-[#172033] dark:hover:text-[#F8FAFC]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Warehouse Listing */}
      {loading ? (
        <div className="py-14 text-center text-[#64748B] dark:text-[#94A3B8]">
          <span className="h-6 w-6 border-2 border-[#059669] dark:border-emerald-400 border-t-transparent rounded-full animate-spin inline-block mb-2" />
          <p className="text-xs font-medium">Cargando catálogo de almacenes...</p>
        </div>
      ) : filteredAlmacenes.length === 0 ? (
        <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-xl p-8 text-center shadow-xs">
          <div className="bg-[#F8FAFC] dark:bg-[#182235] inline-flex p-3 rounded-full text-slate-400 dark:text-slate-500 mb-2.5">
            <Warehouse className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-[#172033] dark:text-[#F8FAFC] mb-0.5">No se encontraron almacenes</h3>
          <p className="text-xs text-[#64748B] dark:text-[#94A3B8] max-w-sm mx-auto">
            {searchQuery ? "Prueba a cambiar los términos de búsqueda o agrega un nuevo almacén." : "Comienza agregando tu primer almacén físico para registrar stock."}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-hidden bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-xl shadow-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E2E8F0] dark:border-[#263449] bg-[#F8FAFC] dark:bg-[#182235] text-[11px] font-semibold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider">
                  <th className="py-2.5 px-4">Nombre de Almacén</th>
                  <th className="py-2.5 px-4">Ubicación</th>
                  <th className="py-2.5 px-4">Estado de Stock</th>
                  <th className="py-2.5 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#263449] text-xs sm:text-sm">
                {filteredAlmacenes.map((alm) => {
                  const { hasStock, totalUnits, uniqueItemsCount } = getWarehouseStockStatus(alm.id);
                  return (
                    <tr key={alm.id} className="hover:bg-[#F1F5F9] dark:hover:bg-[#182235] transition-colors group">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center space-x-2">
                          <div className="bg-[#ECFDF5] dark:bg-emerald-950/40 p-1.5 rounded-md text-[#059669] dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                            <Warehouse className="h-3.5 w-3.5" />
                          </div>
                          <span className="font-semibold text-[#172033] dark:text-[#F8FAFC] group-hover:text-[#059669] dark:group-hover:text-emerald-400 transition-colors">
                            {alm.nombre}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center space-x-1.5 text-[#64748B] dark:text-[#94A3B8] text-xs">
                          <MapPin className="h-3 w-3 text-[#64748B] dark:text-[#94A3B8] shrink-0" />
                          <span>{alm.ubicacion}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        {hasStock ? (
                          <div className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <span className="h-1.5 w-1.5 bg-[#059669] dark:bg-emerald-400 rounded-full" />
                            <span>{totalUnits} {totalUnits === 1 ? "unidad" : "unidades"} · {uniqueItemsCount} {uniqueItemsCount === 1 ? "producto" : "productos"}</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#F8FAFC] dark:bg-[#182235] text-[#64748B] dark:text-[#94A3B8] border border-[#E2E8F0] dark:border-[#263449]">
                            <span className="h-1.5 w-1.5 bg-slate-400 dark:bg-slate-500 rounded-full" />
                            <span>Sin stock</span>
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() => openFormModal(alm)}
                            className="p-1.5 text-[#64748B] dark:text-[#94A3B8] hover:text-[#059669] dark:hover:text-emerald-400 hover:bg-[#F1F5F9] dark:hover:bg-[#1f2d42] rounded-md transition-colors"
                            title="Editar Almacén"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => openDeleteModal(alm)}
                            className="p-1.5 text-[#64748B] dark:text-[#94A3B8] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-md transition-colors"
                            title="Eliminar Almacén"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Grid/Card View */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filteredAlmacenes.map((alm) => {
              const { hasStock, totalUnits, uniqueItemsCount } = getWarehouseStockStatus(alm.id);
              return (
                <div key={alm.id} className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-xl p-3.5 space-y-2.5 shadow-xs">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="bg-[#ECFDF5] dark:bg-emerald-950/40 p-2 rounded-lg text-[#059669] dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                        <Warehouse className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-[#172033] dark:text-[#F8FAFC] text-sm">{alm.nombre}</h4>
                      </div>
                    </div>
                    <div className="flex space-x-1">
                      <button
                        onClick={() => openFormModal(alm)}
                        className="p-1.5 text-[#64748B] dark:text-[#94A3B8] hover:text-[#059669] dark:hover:text-emerald-400 hover:bg-[#F1F5F9] dark:hover:bg-[#1f2d42] rounded-md transition-colors"
                        title="Editar Almacén"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => openDeleteModal(alm)}
                        className="p-1.5 text-[#64748B] dark:text-[#94A3B8] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-md transition-colors"
                        title="Eliminar Almacén"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5 text-[#64748B] dark:text-[#94A3B8] text-xs">
                    <MapPin className="h-3.5 w-3.5 text-[#64748B] dark:text-[#94A3B8] shrink-0" />
                    <span>{alm.ubicacion}</span>
                  </div>

                  <div className="pt-2 border-t border-[#E2E8F0] dark:border-[#263449] flex justify-between items-center text-[11px]">
                    <span className="text-[#64748B] dark:text-[#94A3B8]">Estado:</span>
                    {hasStock ? (
                      <span className="px-2 py-0.5 rounded-full font-medium bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        {totalUnits} {totalUnits === 1 ? "unidad" : "unidades"} · {uniqueItemsCount} {uniqueItemsCount === 1 ? "producto" : "productos"}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full font-medium bg-[#F8FAFC] dark:bg-[#182235] text-[#64748B] dark:text-[#94A3B8] border border-[#E2E8F0] dark:border-[#263449]">
                        Sin stock
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ADD/EDIT MODAL DIALOG */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsFormOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="relative w-full max-w-md bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-2xl p-5 shadow-xl overflow-hidden"
            >
              {/* Close Button */}
              <button
                onClick={() => setIsFormOpen(false)}
                className="absolute top-3.5 right-3.5 p-1 text-[#64748B] dark:text-[#94A3B8] hover:text-[#172033] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#182235] rounded-md transition-all"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="mb-4 flex items-center space-x-2.5">
                <div className="bg-[#ECFDF5] dark:bg-emerald-950/40 p-2 rounded-lg text-[#059669] dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  <Warehouse className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#172033] dark:text-[#F8FAFC]">
                    {selectedAlmacen ? "Editar Almacén" : "Nuevo Almacén Físico"}
                  </h3>
                  <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                    Ingresa los datos correspondientes para la sucursal de inventario.
                  </p>
                </div>
              </div>

              <form onSubmit={handleFormSubmit} className="space-y-3.5">
                {formError && (
                  <div className="bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 px-3 py-2 rounded-lg flex items-start space-x-2 text-xs">
                    <AlertCircle className="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5" />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[#172033] dark:text-[#F8FAFC] uppercase tracking-wider">
                    Nombre del Almacén <span className="text-[#059669] dark:text-emerald-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Almacén Poniente"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#263449] text-[#172033] dark:text-[#F8FAFC] text-xs sm:text-sm rounded-lg focus:outline-none focus:border-[#059669] dark:focus:border-emerald-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[#172033] dark:text-[#F8FAFC] uppercase tracking-wider">
                    Ubicación Física <span className="text-[#059669] dark:text-emerald-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Barcelona, España"
                    value={ubicacion}
                    onChange={(e) => setUbicacion(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#263449] text-[#172033] dark:text-[#F8FAFC] text-xs sm:text-sm rounded-lg focus:outline-none focus:border-[#059669] dark:focus:border-emerald-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="px-3.5 py-2 bg-white dark:bg-[#182235] hover:bg-[#F1F5F9] dark:hover:bg-[#1f2d42] border border-[#E2E8F0] dark:border-[#263449] text-[#64748B] dark:text-[#94A3B8] hover:text-[#172033] dark:hover:text-[#F8FAFC] font-semibold rounded-lg text-xs transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitLoading}
                    className="px-4 py-2 bg-[#059669] hover:bg-[#047857] text-white font-bold rounded-lg text-xs transition-all flex items-center space-x-1.5 disabled:opacity-50 shadow-xs"
                  >
                    {submitLoading ? (
                      <span className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : null}
                    <span>{selectedAlmacen ? "Guardar cambios" : "Crear almacén"}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DELETE CONFIRMATION MODAL */}
      <AnimatePresence>
        {isDeleteOpen && selectedAlmacen && (() => {
          const { hasStock, totalUnits, uniqueItemsCount } = getWarehouseStockStatus(selectedAlmacen.id);
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsDeleteOpen(false)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
              />

              {/* Modal Body */}
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 10 }}
                className="relative w-full max-w-sm bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-2xl p-4 sm:p-5 shadow-xl overflow-hidden"
              >
                {/* Close Button */}
                <button
                  onClick={() => setIsDeleteOpen(false)}
                  className="absolute top-3 right-3 p-1 text-[#64748B] dark:text-[#94A3B8] hover:text-[#172033] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#182235] rounded-md transition-all"
                >
                  <X className="h-4 w-4" />
                </button>

                <div className="flex flex-col items-center text-center p-1">
                  <div className={`p-2.5 rounded-full mb-3 border ${hasStock ? "bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400" : "bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400"}`}>
                    <AlertTriangle className="h-6 w-6" />
                  </div>

                  <h3 className="text-base font-bold text-[#172033] dark:text-[#F8FAFC]">
                    {hasStock ? "No se puede eliminar el almacén" : "¿Eliminar almacén físico?"}
                  </h3>
                  
                  <p className="text-[#64748B] dark:text-[#94A3B8] text-xs mt-1.5 leading-relaxed">
                    {hasStock 
                      ? "Este almacén contiene stock registrado en el sistema. Para evitar la pérdida accidental de datos, primero debes transferir o retirar la mercadería existente de esta sede."
                      : `¿Estás seguro de que deseas eliminar el almacén "${selectedAlmacen.nombre}"? Esta acción no se puede deshacer.`}
                  </p>

                  {/* Stock Details Box if blocked */}
                  {hasStock && (
                    <div className="w-full mt-3 bg-[#F8FAFC] dark:bg-[#182235] rounded-lg p-2.5 border border-[#E2E8F0] dark:border-[#263449] text-left font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8] space-y-1">
                      <p className="text-amber-700 dark:text-amber-400 font-semibold mb-0.5">Inventario activo detectado:</p>
                      <div className="flex justify-between">
                        <span>Items de catálogo:</span>
                        <span className="text-[#172033] dark:text-[#F8FAFC]">{uniqueItemsCount} distintos</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Unidades totales:</span>
                        <span className="text-[#172033] dark:text-[#F8FAFC]">{totalUnits} unidades</span>
                      </div>
                    </div>
                  )}

                  <div className="w-full mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsDeleteOpen(false)}
                      className="w-full sm:w-auto px-3.5 py-2 bg-white dark:bg-[#182235] hover:bg-[#F1F5F9] dark:hover:bg-[#1f2d42] border border-[#E2E8F0] dark:border-[#263449] text-[#64748B] dark:text-[#94A3B8] hover:text-[#172033] dark:hover:text-[#F8FAFC] font-semibold rounded-lg text-xs transition-colors"
                    >
                      {hasStock ? "Entendido" : "Cancelar"}
                    </button>
                    {!hasStock && (
                      <button
                        type="button"
                        onClick={handleDeleteSubmit}
                        disabled={submitLoading}
                        className="w-full sm:w-auto px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs transition-all flex items-center justify-center space-x-1.5 disabled:opacity-50 shadow-xs"
                      >
                        {submitLoading ? (
                          <span className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : null}
                        <span>Eliminar Almacén</span>
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
