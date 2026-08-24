/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { firestoreService } from "../lib/firebase";
import { 
  CategoriaCatalogo, 
  MarcaCatalogo, 
  ColorCatalogo, 
  TallaRopaCatalogo, 
  TallaCalzadoCatalogo, 
  UnidadMedidaCatalogo, 
  Producto 
} from "../types";
import { 
  X, 
  Tag, 
  Scale, 
  Plus, 
  Edit3, 
  Check, 
  Power, 
  AlertCircle, 
  Search, 
  Package, 
  Palette,
  Shirt,
  Footprints,
  Bookmark,
  CheckCircle2,
  RefreshCw,
  Info,
  Trash2,
  AlertTriangle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ModalCatalogosProps {
  isOpen: boolean;
  onClose: () => void;
  productos: Producto[];
}

type TabType = "marcas" | "categorias" | "colores" | "tallas_ropa" | "tallas_calzado" | "unidades";

export default function ModalCatalogos({
  isOpen,
  onClose,
  productos
}: ModalCatalogosProps) {
  const [activeTab, setActiveTab] = useState<TabType>("marcas");

  // Catalogs data
  const [marcas, setMarcas] = useState<MarcaCatalogo[]>([]);
  const [categorias, setCategorias] = useState<CategoriaCatalogo[]>([]);
  const [colores, setColores] = useState<ColorCatalogo[]>([]);
  const [tallasRopa, setTallasRopa] = useState<TallaRopaCatalogo[]>([]);
  const [tallasCalzado, setTallasCalzado] = useState<TallaCalzadoCatalogo[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedidaCatalogo[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & filter
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"todos" | "activas" | "desactivadas">("todos");

  // Form states - Marcas
  const [newMarcaNombre, setNewMarcaNombre] = useState("");
  const [editingMarcaId, setEditingMarcaId] = useState<string | null>(null);
  const [editingMarcaNombre, setEditingMarcaNombre] = useState("");

  // Form states - Categorías
  const [newCatNombre, setNewCatNombre] = useState("");
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatNombre, setEditingCatNombre] = useState("");

  // Form states - Colores
  const [newColorNombre, setNewColorNombre] = useState("");
  const [newColorHex, setNewColorHex] = useState("#111827");
  const [editingColorId, setEditingColorId] = useState<string | null>(null);
  const [editingColorNombre, setEditingColorNombre] = useState("");
  const [editingColorHex, setEditingColorHex] = useState("#111827");

  // Form states - Tallas Ropa
  const [newTallaRopaNombre, setNewTallaRopaNombre] = useState("");
  const [editingTallaRopaId, setEditingTallaRopaId] = useState<string | null>(null);
  const [editingTallaRopaNombre, setEditingTallaRopaNombre] = useState("");

  // Form states - Tallas Calzado
  const [newTallaCalzadoNombre, setNewTallaCalzadoNombre] = useState("");
  const [editingTallaCalzadoId, setEditingTallaCalzadoId] = useState<string | null>(null);
  const [editingTallaCalzadoNombre, setEditingTallaCalzadoNombre] = useState("");

  // Form states - Unidades
  const [newUnitNombre, setNewUnitNombre] = useState("");
  const [newUnitAbrev, setNewUnitAbrev] = useState("");
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [editingUnitNombre, setEditingUnitNombre] = useState("");
  const [editingUnitAbrev, setEditingUnitAbrev] = useState("");

  // Feedback states
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Delete confirmation modal state
  const [itemToDelete, setItemToDelete] = useState<{
    type: TabType;
    id: string;
    nombre: string;
    extra?: string;
  } | null>(null);

  // Subscribe to realtime catalogs data
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    // Initial seed if empty
    firestoreService.seedStreetwearCatalogosIfEmpty(false);

    const unsubMarcas = firestoreService.getMarcasRealtime((data) => {
      setMarcas(data);
      setLoading(false);
    });

    const unsubCats = firestoreService.getCategoriasRealtime((data) => {
      setCategorias(data);
    });

    const unsubColores = firestoreService.getColoresRealtime((data) => {
      setColores(data);
    });

    const unsubTallasRopa = firestoreService.getTallasRopaRealtime((data) => {
      setTallasRopa(data);
    });

    const unsubTallasCalz = firestoreService.getTallasCalzadoRealtime((data) => {
      setTallasCalzado(data);
    });

    const unsubUnits = firestoreService.getUnidadesRealtime((data) => {
      setUnidades(data);
    });

    return () => {
      unsubMarcas();
      unsubCats();
      unsubColores();
      unsubTallasRopa();
      unsubTallasCalz();
      unsubUnits();
    };
  }, [isOpen]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setErrorMsg(null);
    setSuccessMsg(null);
    setSearchQuery("");
    setFilterStatus("todos");
    setEditingMarcaId(null);
    setEditingCatId(null);
    setEditingColorId(null);
    setEditingTallaRopaId(null);
    setEditingTallaCalzadoId(null);
    setEditingUnitId(null);
  };

  // Helper counters
  const getProductCountForMarca = (marcaNombre: string): number => {
    const clean = marcaNombre.trim().toLowerCase();
    return productos.filter(p => (p.marca || "").trim().toLowerCase() === clean).length;
  };

  const getProductCountForCategory = (catNombre: string): number => {
    const clean = catNombre.trim().toLowerCase();
    return productos.filter(p => (p.categoria || "").trim().toLowerCase() === clean).length;
  };

  const getProductCountForColor = (colorNombre: string): number => {
    const clean = colorNombre.trim().toLowerCase();
    return productos.filter(p => (p.color || "").trim().toLowerCase() === clean).length;
  };

  const getProductCountForTalla = (tallaNombre: string): number => {
    const clean = tallaNombre.trim().toLowerCase();
    return productos.filter(p => (p.talla || "").trim().toLowerCase() === clean).length;
  };

  const getProductCountForUnit = (unit: UnidadMedidaCatalogo): number => {
    const cleanAbrev = unit.abreviatura.trim().toLowerCase();
    const cleanNom = unit.nombre.trim().toLowerCase();
    return productos.filter(p => {
      const prodUnit = (p.unidad || "").trim().toLowerCase();
      return prodUnit === cleanAbrev || prodUnit === cleanNom;
    }).length;
  };

  // Filtered lists
  const filteredMarcas = useMemo(() => {
    return marcas.filter(m => {
      const matchSearch = m.nombre.toLowerCase().includes(searchQuery.toLowerCase().trim());
      const matchStatus = 
        filterStatus === "todos" ? true :
        filterStatus === "activas" ? m.activa :
        !m.activa;
      return matchSearch && matchStatus;
    });
  }, [marcas, searchQuery, filterStatus]);

  const filteredCategorias = useMemo(() => {
    return categorias.filter(c => {
      const matchSearch = c.nombre.toLowerCase().includes(searchQuery.toLowerCase().trim());
      const matchStatus = 
        filterStatus === "todos" ? true :
        filterStatus === "activas" ? c.activa :
        !c.activa;
      return matchSearch && matchStatus;
    });
  }, [categorias, searchQuery, filterStatus]);

  const filteredColores = useMemo(() => {
    return colores.filter(col => {
      const matchSearch = col.nombre.toLowerCase().includes(searchQuery.toLowerCase().trim());
      const matchStatus = 
        filterStatus === "todos" ? true :
        filterStatus === "activas" ? col.activa :
        !col.activa;
      return matchSearch && matchStatus;
    });
  }, [colores, searchQuery, filterStatus]);

  const filteredTallasRopa = useMemo(() => {
    return tallasRopa.filter(t => {
      const matchSearch = t.nombre.toLowerCase().includes(searchQuery.toLowerCase().trim());
      const matchStatus = 
        filterStatus === "todos" ? true :
        filterStatus === "activas" ? t.activa :
        !t.activa;
      return matchSearch && matchStatus;
    });
  }, [tallasRopa, searchQuery, filterStatus]);

  const filteredTallasCalzado = useMemo(() => {
    return tallasCalzado.filter(t => {
      const matchSearch = t.nombre.toLowerCase().includes(searchQuery.toLowerCase().trim());
      const matchStatus = 
        filterStatus === "todos" ? true :
        filterStatus === "activas" ? t.activa :
        !t.activa;
      return matchSearch && matchStatus;
    });
  }, [tallasCalzado, searchQuery, filterStatus]);

  const filteredUnidades = useMemo(() => {
    return unidades.filter(u => {
      const term = searchQuery.toLowerCase().trim();
      const matchSearch = u.nombre.toLowerCase().includes(term) || u.abreviatura.toLowerCase().includes(term);
      const matchStatus = 
        filterStatus === "todos" ? true :
        filterStatus === "activas" ? u.activa :
        !u.activa;
      return matchSearch && matchStatus;
    });
  }, [unidades, searchQuery, filterStatus]);

  // Handlers - Marcas
  const handleAddMarca = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMarcaNombre.trim()) return;
    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await firestoreService.addMarca(newMarcaNombre);
      setNewMarcaNombre("");
      setSuccessMsg(`Marca "${newMarcaNombre.trim()}" agregada.`);
    } catch (err: any) {
      setErrorMsg(err.message || "Error al agregar marca.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveEditMarca = async (id: string) => {
    if (!editingMarcaNombre.trim()) return;
    setActionLoading(true);
    setErrorMsg(null);
    try {
      await firestoreService.updateMarca(id, { nombre: editingMarcaNombre.trim() });
      setEditingMarcaId(null);
      setSuccessMsg("Marca actualizada.");
    } catch (err: any) {
      setErrorMsg(err.message || "Error al actualizar marca.");
    } finally {
      setActionLoading(false);
    }
  };

  // Handlers - Categorías
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatNombre.trim()) return;
    setActionLoading(true);
    setErrorMsg(null);
    try {
      await firestoreService.addCategoria(newCatNombre);
      setNewCatNombre("");
      setSuccessMsg(`Categoría "${newCatNombre.trim()}" agregada.`);
    } catch (err: any) {
      setErrorMsg(err.message || "Error al agregar categoría.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveEditCategory = async (id: string, oldNombre: string) => {
    if (!editingCatNombre.trim()) return;
    setActionLoading(true);
    setErrorMsg(null);
    try {
      await firestoreService.renameCategoriaAndSyncProducts(id, oldNombre, editingCatNombre.trim());
      setEditingCatId(null);
      setSuccessMsg("Categoría actualizada.");
    } catch (err: any) {
      setErrorMsg(err.message || "Error al actualizar categoría.");
    } finally {
      setActionLoading(false);
    }
  };

  // Handlers - Colores
  const handleAddColor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColorNombre.trim()) return;
    setActionLoading(true);
    setErrorMsg(null);
    try {
      await firestoreService.addColor(newColorNombre, newColorHex);
      setNewColorNombre("");
      setNewColorHex("#111827");
      setSuccessMsg(`Color "${newColorNombre.trim()}" agregado.`);
    } catch (err: any) {
      setErrorMsg(err.message || "Error al agregar color.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveEditColor = async (id: string) => {
    if (!editingColorNombre.trim()) return;
    setActionLoading(true);
    setErrorMsg(null);
    try {
      await firestoreService.updateColor(id, { nombre: editingColorNombre.trim(), codigo_hex: editingColorHex });
      setEditingColorId(null);
      setSuccessMsg("Color actualizado.");
    } catch (err: any) {
      setErrorMsg(err.message || "Error al actualizar color.");
    } finally {
      setActionLoading(false);
    }
  };

  // Handlers - Tallas Ropa
  const handleAddTallaRopa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTallaRopaNombre.trim()) return;
    setActionLoading(true);
    setErrorMsg(null);
    try {
      await firestoreService.addTallaRopa(newTallaRopaNombre);
      setNewTallaRopaNombre("");
      setSuccessMsg(`Talla de ropa "${newTallaRopaNombre.trim()}" agregada.`);
    } catch (err: any) {
      setErrorMsg(err.message || "Error al agregar talla.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveEditTallaRopa = async (id: string) => {
    if (!editingTallaRopaNombre.trim()) return;
    setActionLoading(true);
    setErrorMsg(null);
    try {
      await firestoreService.updateTallaRopa(id, { nombre: editingTallaRopaNombre.trim() });
      setEditingTallaRopaId(null);
      setSuccessMsg("Talla actualizada.");
    } catch (err: any) {
      setErrorMsg(err.message || "Error al actualizar talla.");
    } finally {
      setActionLoading(false);
    }
  };

  // Handlers - Tallas Calzado
  const handleAddTallaCalzado = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTallaCalzadoNombre.trim()) return;
    setActionLoading(true);
    setErrorMsg(null);
    try {
      await firestoreService.addTallaCalzado(newTallaCalzadoNombre);
      setNewTallaCalzadoNombre("");
      setSuccessMsg(`Talla de calzado "${newTallaCalzadoNombre.trim()}" agregada.`);
    } catch (err: any) {
      setErrorMsg(err.message || "Error al agregar talla de calzado.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveEditTallaCalzado = async (id: string) => {
    if (!editingTallaCalzadoNombre.trim()) return;
    setActionLoading(true);
    setErrorMsg(null);
    try {
      await firestoreService.updateTallaCalzado(id, { nombre: editingTallaCalzadoNombre.trim() });
      setEditingTallaCalzadoId(null);
      setSuccessMsg("Talla de calzado actualizada.");
    } catch (err: any) {
      setErrorMsg(err.message || "Error al actualizar talla.");
    } finally {
      setActionLoading(false);
    }
  };

  // Handlers - Unidades
  const handleAddUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUnitNombre.trim() || !newUnitAbrev.trim()) return;
    setActionLoading(true);
    setErrorMsg(null);
    try {
      await firestoreService.addUnidad(newUnitNombre, newUnitAbrev);
      setNewUnitNombre("");
      setNewUnitAbrev("");
      setSuccessMsg(`Unidad "${newUnitNombre.trim()}" agregada.`);
    } catch (err: any) {
      setErrorMsg(err.message || "Error al agregar unidad.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveEditUnit = async (id: string, oldAbrev: string) => {
    if (!editingUnitNombre.trim() || !editingUnitAbrev.trim()) return;
    setActionLoading(true);
    setErrorMsg(null);
    try {
      await firestoreService.renameUnidadAndSyncProducts(id, oldAbrev, editingUnitAbrev.trim(), editingUnitNombre.trim());
      setEditingUnitId(null);
      setSuccessMsg("Unidad actualizada.");
    } catch (err: any) {
      setErrorMsg(err.message || "Error al actualizar unidad.");
    } finally {
      setActionLoading(false);
    }
  };

  // Confirm delete handler
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setActionLoading(true);
    setErrorMsg(null);
    try {
      if (itemToDelete.type === "marcas") {
        await firestoreService.deleteMarca(itemToDelete.id);
      } else if (itemToDelete.type === "categorias") {
        await firestoreService.deleteCategoria(itemToDelete.id);
      } else if (itemToDelete.type === "colores") {
        await firestoreService.deleteColor(itemToDelete.id);
      } else if (itemToDelete.type === "tallas_ropa") {
        await firestoreService.deleteTallaRopa(itemToDelete.id);
      } else if (itemToDelete.type === "tallas_calzado") {
        await firestoreService.deleteTallaCalzado(itemToDelete.id);
      } else if (itemToDelete.type === "unidades") {
        await firestoreService.deleteUnidad(itemToDelete.id);
      }
      setSuccessMsg(`Elemento "${itemToDelete.nombre}" eliminado correctamente.`);
      setItemToDelete(null);
    } catch (err: any) {
      setErrorMsg(err.message || "Error al eliminar.");
    } finally {
      setActionLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div id="modal-catalogos-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        id="modal-catalogos-container"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.2 }}
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div id="modal-catalogos-header" className="px-6 py-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center font-bold shadow-sm">
              <Bookmark className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight">
                Administrar Catálogos
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Marcas, categorías, colores, tallas y unidades de medida
              </p>
            </div>
          </div>
          <button
            id="modal-catalogos-close-btn"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div id="modal-catalogos-tabs" className="flex border-b border-zinc-200 dark:border-zinc-800 px-6 bg-zinc-50 dark:bg-zinc-900/80 overflow-x-auto gap-1">
          <button
            id="tab-marcas"
            onClick={() => handleTabChange("marcas")}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-all ${
              activeTab === "marcas"
                ? "border-zinc-900 text-zinc-900 dark:border-white dark:text-white bg-white dark:bg-zinc-800/60 rounded-t-lg"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
            }`}
          >
            <Bookmark className="w-4 h-4" />
            Marcas ({marcas.length})
          </button>

          <button
            id="tab-categorias"
            onClick={() => handleTabChange("categorias")}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-all ${
              activeTab === "categorias"
                ? "border-zinc-900 text-zinc-900 dark:border-white dark:text-white bg-white dark:bg-zinc-800/60 rounded-t-lg"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
            }`}
          >
            <Tag className="w-4 h-4" />
            Categorías ({categorias.length})
          </button>

          <button
            id="tab-colores"
            onClick={() => handleTabChange("colores")}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-all ${
              activeTab === "colores"
                ? "border-zinc-900 text-zinc-900 dark:border-white dark:text-white bg-white dark:bg-zinc-800/60 rounded-t-lg"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
            }`}
          >
            <Palette className="w-4 h-4" />
            Colores ({colores.length})
          </button>

          <button
            id="tab-tallas-ropa"
            onClick={() => handleTabChange("tallas_ropa")}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-all ${
              activeTab === "tallas_ropa"
                ? "border-zinc-900 text-zinc-900 dark:border-white dark:text-white bg-white dark:bg-zinc-800/60 rounded-t-lg"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
            }`}
          >
            <Shirt className="w-4 h-4" />
            Tallas Ropa ({tallasRopa.length})
          </button>

          <button
            id="tab-tallas-calzado"
            onClick={() => handleTabChange("tallas_calzado")}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-all ${
              activeTab === "tallas_calzado"
                ? "border-zinc-900 text-zinc-900 dark:border-white dark:text-white bg-white dark:bg-zinc-800/60 rounded-t-lg"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
            }`}
          >
            <Footprints className="w-4 h-4" />
            Tallas Calzado ({tallasCalzado.length})
          </button>

          <button
            id="tab-unidades"
            onClick={() => handleTabChange("unidades")}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-all ${
              activeTab === "unidades"
                ? "border-zinc-900 text-zinc-900 dark:border-white dark:text-white bg-white dark:bg-zinc-800/60 rounded-t-lg"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
            }`}
          >
            <Scale className="w-4 h-4" />
            Unidades ({unidades.length})
          </button>
        </div>

        {/* Global Feedback Banners */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 flex items-center gap-3 text-red-700 dark:text-red-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <p className="font-medium flex-1">{errorMsg}</p>
            <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-700">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-center gap-3 text-emerald-700 dark:text-emerald-300 text-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <p className="font-medium flex-1">{successMsg}</p>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-700">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Body Content */}
        <div id="modal-catalogos-content" className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Quick Add Form Section */}
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800">
            {activeTab === "marcas" && (
              <form onSubmit={handleAddMarca} className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex-1 w-full">
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Nueva Marca
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. dorsalclub, Nike, Stüssy..."
                    value={newMarcaNombre}
                    onChange={(e) => setNewMarcaNombre(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white text-zinc-900 dark:text-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={actionLoading || !newMarcaNombre.trim()}
                  className="w-full sm:w-auto px-4 py-2 bg-zinc-900 hover:bg-black dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  Agregar Marca
                </button>
              </form>
            )}

            {activeTab === "categorias" && (
              <form onSubmit={handleAddCategory} className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex-1 w-full">
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Nueva Categoría
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Camisetas, Pantalones, Sudaderas..."
                    value={newCatNombre}
                    onChange={(e) => setNewCatNombre(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white text-zinc-900 dark:text-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={actionLoading || !newCatNombre.trim()}
                  className="w-full sm:w-auto px-4 py-2 bg-zinc-900 hover:bg-black dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  Agregar Categoría
                </button>
              </form>
            )}

            {activeTab === "colores" && (
              <form onSubmit={handleAddColor} className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex-1 w-full">
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Nombre del Color
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Negro Lavado, Blanco Crema, Oliva..."
                    value={newColorNombre}
                    onChange={(e) => setNewColorNombre(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white text-zinc-900 dark:text-white"
                  />
                </div>
                <div className="w-full sm:w-36">
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Muestra Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={newColorHex}
                      onChange={(e) => setNewColorHex(e.target.value)}
                      className="w-9 h-9 p-0.5 rounded-lg border border-zinc-300 dark:border-zinc-700 cursor-pointer bg-white dark:bg-zinc-900"
                    />
                    <input
                      type="text"
                      value={newColorHex}
                      onChange={(e) => setNewColorHex(e.target.value)}
                      placeholder="#111827"
                      className="w-full px-2 py-2 text-xs uppercase bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl focus:outline-none text-zinc-900 dark:text-white"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={actionLoading || !newColorNombre.trim()}
                  className="w-full sm:w-auto px-4 py-2 bg-zinc-900 hover:bg-black dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  Agregar Color
                </button>
              </form>
            )}

            {activeTab === "tallas_ropa" && (
              <form onSubmit={handleAddTallaRopa} className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex-1 w-full">
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Talla de Ropa
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. XS, S, M, L, XL, XXL, Única..."
                    value={newTallaRopaNombre}
                    onChange={(e) => setNewTallaRopaNombre(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white text-zinc-900 dark:text-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={actionLoading || !newTallaRopaNombre.trim()}
                  className="w-full sm:w-auto px-4 py-2 bg-zinc-900 hover:bg-black dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  Agregar Talla
                </button>
              </form>
            )}

            {activeTab === "tallas_calzado" && (
              <form onSubmit={handleAddTallaCalzado} className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex-1 w-full">
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Talla de Calzado (Número / MX / US)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. 26, 26.5, 27, 27.5..."
                    value={newTallaCalzadoNombre}
                    onChange={(e) => setNewTallaCalzadoNombre(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white text-zinc-900 dark:text-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={actionLoading || !newTallaCalzadoNombre.trim()}
                  className="w-full sm:w-auto px-4 py-2 bg-zinc-900 hover:bg-black dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  Agregar Talla Calzado
                </button>
              </form>
            )}

            {activeTab === "unidades" && (
              <form onSubmit={handleAddUnit} className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex-1 w-full">
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Nombre Completo
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Pieza, Par, Caja..."
                    value={newUnitNombre}
                    onChange={(e) => setNewUnitNombre(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white text-zinc-900 dark:text-white"
                  />
                </div>
                <div className="w-full sm:w-36">
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Abreviatura
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="pieza, par"
                    value={newUnitAbrev}
                    onChange={(e) => setNewUnitAbrev(e.target.value.toLowerCase())}
                    className="w-full px-3.5 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white text-zinc-900 dark:text-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={actionLoading || !newUnitNombre.trim() || !newUnitAbrev.trim()}
                  className="w-full sm:w-auto px-4 py-2 bg-zinc-900 hover:bg-black dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  Agregar Unidad
                </button>
              </form>
            )}
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Buscar en el catálogo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white text-zinc-900 dark:text-white"
              />
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <span className="text-xs text-zinc-500 font-medium">Filtrar:</span>
              <select
                value={filterStatus}
                onChange={(e: any) => setFilterStatus(e.target.value)}
                className="px-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-700 dark:text-zinc-300 focus:outline-none"
              >
                <option value="todos">Todos</option>
                <option value="activas">Solo activos</option>
                <option value="desactivadas">Desactivados</option>
              </select>
            </div>
          </div>

          {/* Items List Table */}
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900">
            {/* MARCAS TAB */}
            {activeTab === "marcas" && (
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-semibold">
                  <tr>
                    <th className="py-3 px-4">Marca</th>
                    <th className="py-3 px-4 text-center">Productos Vinculados</th>
                    <th className="py-3 px-4 text-center">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {filteredMarcas.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-zinc-400">
                        No hay marcas registradas.
                      </td>
                    </tr>
                  ) : (
                    filteredMarcas.map((marca) => {
                      const count = getProductCountForMarca(marca.nombre);
                      const isEditing = editingMarcaId === marca.id;

                      return (
                        <tr key={marca.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40">
                          <td className="py-3 px-4 font-medium text-zinc-900 dark:text-white">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editingMarcaNombre}
                                onChange={(e) => setEditingMarcaNombre(e.target.value)}
                                className="px-2 py-1 text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white w-full max-w-xs focus:outline-none"
                              />
                            ) : (
                              <div className="flex items-center gap-2">
                                <Bookmark className="w-3.5 h-3.5 text-zinc-400" />
                                <span>{marca.nombre}</span>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                              {count} {count === 1 ? "producto" : "productos"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              marca.activa 
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/40"
                                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                            }`}>
                              {marca.activa ? "Activa" : "Inactiva"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {isEditing ? (
                                <>
                                  <button
                                    onClick={() => handleSaveEditMarca(marca.id)}
                                    className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-lg"
                                    title="Guardar"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setEditingMarcaId(null)}
                                    className="p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"
                                    title="Cancelar"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => {
                                      setEditingMarcaId(marca.id);
                                      setEditingMarcaNombre(marca.nombre);
                                    }}
                                    className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                                    title="Editar"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => firestoreService.toggleMarcaStatus(marca.id, !marca.activa)}
                                    className={`p-1.5 rounded-lg transition-colors ${
                                      marca.activa 
                                        ? "text-zinc-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                        : "text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                    }`}
                                    title={marca.activa ? "Desactivar" : "Activar"}
                                  >
                                    <Power className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setItemToDelete({ type: "marcas", id: marca.id, nombre: marca.nombre })}
                                    className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                                    title="Eliminar"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}

            {/* CATEGORÍAS TAB */}
            {activeTab === "categorias" && (
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-semibold">
                  <tr>
                    <th className="py-3 px-4">Categoría</th>
                    <th className="py-3 px-4 text-center">Productos Vinculados</th>
                    <th className="py-3 px-4 text-center">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {filteredCategorias.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-zinc-400">
                        No hay categorías registradas.
                      </td>
                    </tr>
                  ) : (
                    filteredCategorias.map((cat) => {
                      const count = getProductCountForCategory(cat.nombre);
                      const isEditing = editingCatId === cat.id;

                      return (
                        <tr key={cat.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40">
                          <td className="py-3 px-4 font-medium text-zinc-900 dark:text-white">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editingCatNombre}
                                onChange={(e) => setEditingCatNombre(e.target.value)}
                                className="px-2 py-1 text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white w-full max-w-xs focus:outline-none"
                              />
                            ) : (
                              <div className="flex items-center gap-2">
                                <Tag className="w-3.5 h-3.5 text-zinc-400" />
                                <span>{cat.nombre}</span>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                              {count} {count === 1 ? "producto" : "productos"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              cat.activa 
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/40"
                                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                            }`}>
                              {cat.activa ? "Activa" : "Inactiva"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {isEditing ? (
                                <>
                                  <button
                                    onClick={() => handleSaveEditCategory(cat.id, cat.nombre)}
                                    className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-lg"
                                    title="Guardar"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setEditingCatId(null)}
                                    className="p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"
                                    title="Cancelar"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => {
                                      setEditingCatId(cat.id);
                                      setEditingCatNombre(cat.nombre);
                                    }}
                                    className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                                    title="Editar"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => firestoreService.toggleCategoriaStatus(cat.id, !cat.activa)}
                                    className={`p-1.5 rounded-lg transition-colors ${
                                      cat.activa 
                                        ? "text-zinc-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                        : "text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                    }`}
                                    title={cat.activa ? "Desactivar" : "Activar"}
                                  >
                                    <Power className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setItemToDelete({ type: "categorias", id: cat.id, nombre: cat.nombre })}
                                    className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                                    title="Eliminar"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}

            {/* COLORES TAB */}
            {activeTab === "colores" && (
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-semibold">
                  <tr>
                    <th className="py-3 px-4">Color</th>
                    <th className="py-3 px-4">Muestra Visual</th>
                    <th className="py-3 px-4 text-center">Variantes Vinculadas</th>
                    <th className="py-3 px-4 text-center">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {filteredColores.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-zinc-400">
                        No hay colores registrados.
                      </td>
                    </tr>
                  ) : (
                    filteredColores.map((color) => {
                      const count = getProductCountForColor(color.nombre);
                      const isEditing = editingColorId === color.id;

                      return (
                        <tr key={color.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40">
                          <td className="py-3 px-4 font-medium text-zinc-900 dark:text-white">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editingColorNombre}
                                onChange={(e) => setEditingColorNombre(e.target.value)}
                                className="px-2 py-1 text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white w-full max-w-xs focus:outline-none"
                              />
                            ) : (
                              <span>{color.nombre}</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {isEditing ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={editingColorHex}
                                  onChange={(e) => setEditingColorHex(e.target.value)}
                                  className="w-7 h-7 rounded border border-zinc-300 dark:border-zinc-700 p-0.5 cursor-pointer"
                                />
                                <input
                                  type="text"
                                  value={editingColorHex}
                                  onChange={(e) => setEditingColorHex(e.target.value)}
                                  className="w-20 px-1.5 py-0.5 text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded text-zinc-900 dark:text-white"
                                />
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-4 h-4 rounded-full border border-zinc-300 dark:border-zinc-700 shadow-inner shrink-0"
                                  style={{ backgroundColor: color.codigo_hex || "#111827" }}
                                />
                                <span className="font-mono text-zinc-500 uppercase text-[11px]">
                                  {color.codigo_hex || "#111827"}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                              {count} {count === 1 ? "variante" : "variantes"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              color.activa 
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/40"
                                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                            }`}>
                              {color.activa ? "Activo" : "Inactivo"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {isEditing ? (
                                <>
                                  <button
                                    onClick={() => handleSaveEditColor(color.id)}
                                    className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-lg"
                                    title="Guardar"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setEditingColorId(null)}
                                    className="p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"
                                    title="Cancelar"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => {
                                      setEditingColorId(color.id);
                                      setEditingColorNombre(color.nombre);
                                      setEditingColorHex(color.codigo_hex || "#111827");
                                    }}
                                    className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                                    title="Editar"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => firestoreService.toggleColorStatus(color.id, !color.activa)}
                                    className={`p-1.5 rounded-lg transition-colors ${
                                      color.activa 
                                        ? "text-zinc-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                        : "text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                    }`}
                                    title={color.activa ? "Desactivar" : "Activar"}
                                  >
                                    <Power className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setItemToDelete({ type: "colores", id: color.id, nombre: color.nombre })}
                                    className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                                    title="Eliminar"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}

            {/* TALLAS ROPA TAB */}
            {activeTab === "tallas_ropa" && (
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-semibold">
                  <tr>
                    <th className="py-3 px-4">Talla Ropa</th>
                    <th className="py-3 px-4 text-center">Variantes Vinculadas</th>
                    <th className="py-3 px-4 text-center">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {filteredTallasRopa.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-zinc-400">
                        No hay tallas de ropa registradas.
                      </td>
                    </tr>
                  ) : (
                    filteredTallasRopa.map((talla) => {
                      const count = getProductCountForTalla(talla.nombre);
                      const isEditing = editingTallaRopaId === talla.id;

                      return (
                        <tr key={talla.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40">
                          <td className="py-3 px-4 font-medium text-zinc-900 dark:text-white">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editingTallaRopaNombre}
                                onChange={(e) => setEditingTallaRopaNombre(e.target.value)}
                                className="px-2 py-1 text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white w-full max-w-xs focus:outline-none"
                              />
                            ) : (
                              <span className="font-semibold">{talla.nombre}</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                              {count} {count === 1 ? "variante" : "variantes"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              talla.activa 
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/40"
                                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                            }`}>
                              {talla.activa ? "Activa" : "Inactiva"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {isEditing ? (
                                <>
                                  <button
                                    onClick={() => handleSaveEditTallaRopa(talla.id)}
                                    className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-lg"
                                    title="Guardar"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setEditingTallaRopaId(null)}
                                    className="p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"
                                    title="Cancelar"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => {
                                      setEditingTallaRopaId(talla.id);
                                      setEditingTallaRopaNombre(talla.nombre);
                                    }}
                                    className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                                    title="Editar"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => firestoreService.toggleTallaRopaStatus(talla.id, !talla.activa)}
                                    className={`p-1.5 rounded-lg transition-colors ${
                                      talla.activa 
                                        ? "text-zinc-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                        : "text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                    }`}
                                    title={talla.activa ? "Desactivar" : "Activar"}
                                  >
                                    <Power className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setItemToDelete({ type: "tallas_ropa", id: talla.id, nombre: talla.nombre })}
                                    className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                                    title="Eliminar"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}

            {/* TALLAS CALZADO TAB */}
            {activeTab === "tallas_calzado" && (
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-semibold">
                  <tr>
                    <th className="py-3 px-4">Talla Calzado (Número)</th>
                    <th className="py-3 px-4 text-center">Variantes Vinculadas</th>
                    <th className="py-3 px-4 text-center">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {filteredTallasCalzado.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-zinc-400">
                        No hay tallas de calzado registradas.
                      </td>
                    </tr>
                  ) : (
                    filteredTallasCalzado.map((talla) => {
                      const count = getProductCountForTalla(talla.nombre);
                      const isEditing = editingTallaCalzadoId === talla.id;

                      return (
                        <tr key={talla.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40">
                          <td className="py-3 px-4 font-medium text-zinc-900 dark:text-white">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editingTallaCalzadoNombre}
                                onChange={(e) => setEditingTallaCalzadoNombre(e.target.value)}
                                className="px-2 py-1 text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white w-full max-w-xs focus:outline-none"
                              />
                            ) : (
                              <span className="font-semibold text-sm">{talla.nombre}</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                              {count} {count === 1 ? "variante" : "variantes"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              talla.activa 
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/40"
                                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                            }`}>
                              {talla.activa ? "Activa" : "Inactiva"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {isEditing ? (
                                <>
                                  <button
                                    onClick={() => handleSaveEditTallaCalzado(talla.id)}
                                    className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-lg"
                                    title="Guardar"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setEditingTallaCalzadoId(null)}
                                    className="p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"
                                    title="Cancelar"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => {
                                      setEditingTallaCalzadoId(talla.id);
                                      setEditingTallaCalzadoNombre(talla.nombre);
                                    }}
                                    className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                                    title="Editar"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => firestoreService.toggleTallaCalzadoStatus(talla.id, !talla.activa)}
                                    className={`p-1.5 rounded-lg transition-colors ${
                                      talla.activa 
                                        ? "text-zinc-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                        : "text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                    }`}
                                    title={talla.activa ? "Desactivar" : "Activar"}
                                  >
                                    <Power className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setItemToDelete({ type: "tallas_calzado", id: talla.id, nombre: talla.nombre })}
                                    className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                                    title="Eliminar"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}

            {/* UNIDADES TAB */}
            {activeTab === "unidades" && (
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-semibold">
                  <tr>
                    <th className="py-3 px-4">Unidad</th>
                    <th className="py-3 px-4">Abreviatura</th>
                    <th className="py-3 px-4 text-center">Productos Vinculados</th>
                    <th className="py-3 px-4 text-center">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {filteredUnidades.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-zinc-400">
                        No hay unidades de medida registradas.
                      </td>
                    </tr>
                  ) : (
                    filteredUnidades.map((unit) => {
                      const count = getProductCountForUnit(unit);
                      const isEditing = editingUnitId === unit.id;

                      return (
                        <tr key={unit.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40">
                          <td className="py-3 px-4 font-medium text-zinc-900 dark:text-white">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editingUnitNombre}
                                onChange={(e) => setEditingUnitNombre(e.target.value)}
                                className="px-2 py-1 text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white w-full max-w-xs focus:outline-none"
                              />
                            ) : (
                              <div className="flex items-center gap-2">
                                <Scale className="w-3.5 h-3.5 text-zinc-400" />
                                <span>{unit.nombre}</span>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-zinc-600 dark:text-zinc-400">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editingUnitAbrev}
                                onChange={(e) => setEditingUnitAbrev(e.target.value.toLowerCase())}
                                className="w-20 px-2 py-1 text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white focus:outline-none"
                              />
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold text-[11px]">
                                {unit.abreviatura}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                              {count} {count === 1 ? "producto" : "productos"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              unit.activa 
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/40"
                                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                            }`}>
                              {unit.activa ? "Activa" : "Inactiva"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {isEditing ? (
                                <>
                                  <button
                                    onClick={() => handleSaveEditUnit(unit.id, unit.abreviatura)}
                                    className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-lg"
                                    title="Guardar"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setEditingUnitId(null)}
                                    className="p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"
                                    title="Cancelar"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => {
                                      setEditingUnitId(unit.id);
                                      setEditingUnitNombre(unit.nombre);
                                      setEditingUnitAbrev(unit.abreviatura);
                                    }}
                                    className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                                    title="Editar"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => firestoreService.toggleUnidadStatus(unit.id, !unit.activa)}
                                    className={`p-1.5 rounded-lg transition-colors ${
                                      unit.activa 
                                        ? "text-zinc-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                        : "text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                    }`}
                                    title={unit.activa ? "Desactivar" : "Activar"}
                                  >
                                    <Power className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setItemToDelete({ type: "unidades", id: unit.id, nombre: unit.nombre })}
                                    className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                                    title="Eliminar"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Footer */}
        <div id="modal-catalogos-footer" className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
          <button
            onClick={async () => {
              if (window.confirm("¿Restaurar los catálogos estándar de streetwear y sneakers?")) {
                setActionLoading(true);
                try {
                  await firestoreService.seedStreetwearCatalogosIfEmpty(true);
                  setSuccessMsg("Catálogos estándar restablecidos con éxito.");
                } catch (e: any) {
                  setErrorMsg(e.message || "Error al restablecer catálogos.");
                } finally {
                  setActionLoading(false);
                }
              }
            }}
            className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white flex items-center gap-1.5 transition-colors font-medium"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Cargar catálogo streetwear inicial
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold rounded-xl bg-zinc-900 hover:bg-black dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 transition-colors"
          >
            Listo
          </button>
        </div>
      </motion.div>

      {/* Delete Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/50 text-red-600 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                ¿Eliminar {itemToDelete.nombre}?
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                Esta acción eliminará el elemento del catálogo. Los productos existentes que ya lo utilicen mantendrán su texto actual.
              </p>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setItemToDelete(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={actionLoading}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
