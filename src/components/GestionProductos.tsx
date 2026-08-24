/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { firestoreService } from "../lib/firebase";
import { 
  Producto, 
  StockItem, 
  Almacen, 
  CategoriaCatalogo, 
  MarcaCatalogo,
  ColorCatalogo,
  TallaRopaCatalogo,
  TallaCalzadoCatalogo,
  UnidadMedidaCatalogo 
} from "../types";
import ModalCatalogos from "./ModalCatalogos";
import { 
  Package, 
  Plus, 
  Edit2, 
  Trash2, 
  Search, 
  X, 
  Check, 
  AlertCircle, 
  AlertTriangle, 
  Upload, 
  FileText,
  Warehouse,
  ArrowRight,
  Sparkles,
  Info,
  Layers,
  Palette,
  Shirt,
  Footprints,
  Bookmark,
  Tag,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Copy,
  Barcode,
  DollarSign,
  Power
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface GestionProductosProps {
  almacenes?: Almacen[];
  productos?: Producto[];
  stockList?: StockItem[];
  onNavigateToMovimiento?: (sku: string) => void;
}

interface VariantFormRow {
  id: string;
  color: string;
  talla: string;
  sku: string;
  codigo_barras: string;
  precio_venta_sugerido: number | string;
  stock_minimo_almacenes: Record<string, number | string>;
  stock_minimo: number | string;
  activo: boolean;
}

// Generate base ID helper
function generateBaseId(brand: string, name: string): string {
  const cleanBrand = brand.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4) || "dc";
  const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "prod";
  const rand = Math.random().toString(36).substring(2, 7);
  return `${cleanBrand}-${cleanName}-${rand}`;
}

// Generate suggested SKU helper
function generateSku(marca: string, nombre: string, color: string, talla: string): string {
  const pMarca = (marca || "DC").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3) || "DC";
  const pNombre = (nombre || "PROD")
    .toUpperCase()
    .split(/\s+/)
    .map(w => w.slice(0, 3))
    .join("")
    .slice(0, 6) || "PRD";
  const pColor = (color || "GEN").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3) || "GEN";
  const pTalla = (talla || "U").toUpperCase().replace(/[^A-Z0-9.]/g, "") || "U";
  
  return `${pMarca}-${pNombre}-${pColor}-${pTalla}`;
}

export default function GestionProductos({ 
  almacenes: propAlmacenes, 
  productos: propProductos,
  stockList: propStockList,
  onNavigateToMovimiento 
}: GestionProductosProps) {
  const [internalProductos, setInternalProductos] = useState<Producto[]>(propProductos || []);
  const [internalStockList, setInternalStockList] = useState<StockItem[]>(propStockList || []);
  const [internalAlmacenes, setInternalAlmacenes] = useState<Almacen[]>(propAlmacenes || []);

  // Catalogs
  const [catalogMarcas, setCatalogMarcas] = useState<MarcaCatalogo[]>([]);
  const [catalogCategorias, setCatalogCategorias] = useState<CategoriaCatalogo[]>([]);
  const [catalogColores, setCatalogColores] = useState<ColorCatalogo[]>([]);
  const [catalogTallasRopa, setCatalogTallasRopa] = useState<TallaRopaCatalogo[]>([]);
  const [catalogTallasCalzado, setCatalogTallasCalzado] = useState<TallaCalzadoCatalogo[]>([]);
  const [catalogUnidades, setCatalogUnidades] = useState<UnidadMedidaCatalogo[]>([]);

  const productos = propProductos ?? internalProductos;
  const stockList = propStockList ?? internalStockList;
  const almacenes = propAlmacenes ?? internalAlmacenes;

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMarca, setFilterMarca] = useState("all");
  const [filterCategoria, setFilterCategoria] = useState("all");
  const [filterTipoTalla, setFilterTipoTalla] = useState("all");
  const [filterEstado, setFilterEstado] = useState("all"); // "all" | "activos" | "inactivos" | "stock_bajo"

  // Modals state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCatalogosOpen, setIsCatalogosOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<{ id: string; sku: string; nombre: string; isBase?: boolean } | null>(null);

  // Expanded base products in view
  const [expandedBaseIds, setExpandedBaseIds] = useState<Record<string, boolean>>({});

  // Prompt after creation: "¿Deseas registrar su entrada inicial?"
  const [createdProductPrompt, setCreatedProductPrompt] = useState<Producto | null>(null);

  // Form State
  const [editingBaseId, setEditingBaseId] = useState<string | null>(null);
  const [editingSingleProductId, setEditingSingleProductId] = useState<string | null>(null);
  const [formNombre, setFormNombre] = useState("");
  const [formMarca, setFormMarca] = useState("dorsalclub");
  const [formCategoria, setFormCategoria] = useState("Camisetas");
  const [formTipoTalla, setFormTipoTalla] = useState<"ropa" | "calzado" | "unica">("ropa");
  const [formUnidad, setFormUnidad] = useState("pieza");
  
  // Variants rows in form
  const [variantRows, setVariantRows] = useState<VariantFormRow[]>([]);

  // Matrix generation drawer inside form
  const [matrixColors, setMatrixColors] = useState<string[]>([]);
  const [matrixSizes, setMatrixSizes] = useState<string[]>([]);
  const [matrixPrice, setMatrixPrice] = useState<number | string>(799);
  const [matrixMinStock, setMatrixMinStock] = useState<number | string>(3);
  const [isMatrixOpen, setIsMatrixOpen] = useState(false);

  // Form submission feedback
  const [submitLoading, setSubmitLoading] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Realtime subscriptions
  useEffect(() => {
    let unsubProds = () => {};
    let unsubStock = () => {};
    let unsubAlm = () => {};

    if (!propProductos) {
      unsubProds = firestoreService.getProductosRealtime((data) => setInternalProductos(data));
    }
    if (!propStockList) {
      unsubStock = firestoreService.getStockRealtime((data) => setInternalStockList(data));
    }
    if (!propAlmacenes) {
      unsubAlm = firestoreService.getAlmacenesRealtime((data) => setInternalAlmacenes(data));
    }

    const unsubMarcas = firestoreService.getMarcasRealtime((data) => setCatalogMarcas(data));
    const unsubCats = firestoreService.getCategoriasRealtime((data) => setCatalogCategorias(data));
    const unsubColores = firestoreService.getColoresRealtime((data) => setCatalogColores(data));
    const unsubTallasRopa = firestoreService.getTallasRopaRealtime((data) => setCatalogTallasRopa(data));
    const unsubTallasCalz = firestoreService.getTallasCalzadoRealtime((data) => setCatalogTallasCalzado(data));
    const unsubUnits = firestoreService.getUnidadesRealtime((data) => setCatalogUnidades(data));

    return () => {
      unsubProds();
      unsubStock();
      unsubAlm();
      unsubMarcas();
      unsubCats();
      unsubColores();
      unsubTallasRopa();
      unsubTallasCalz();
      unsubUnits();
    };
  }, [propProductos, propStockList, propAlmacenes]);

  // Group products by base product
  const groupedProducts = useMemo(() => {
    const groups: Record<string, {
      baseId: string;
      nombre: string;
      marca: string;
      categoria: string;
      tipo_talla: "ropa" | "calzado" | "unica";
      unidad: string;
      variants: Producto[];
      totalStock: number;
      minPrice: number;
      maxPrice: number;
      hasLowStock: boolean;
    }> = {};

    productos.forEach(p => {
      const baseKey = p.producto_base_id || `legacy-${p.nombre.toLowerCase().trim()}`;
      
      if (!groups[baseKey]) {
        groups[baseKey] = {
          baseId: baseKey,
          nombre: p.nombre,
          marca: p.marca || "dorsalclub",
          categoria: p.categoria || "General",
          tipo_talla: p.tipo_talla || "ropa",
          unidad: p.unidad || "pieza",
          variants: [],
          totalStock: 0,
          minPrice: Infinity,
          maxPrice: -Infinity,
          hasLowStock: false
        };
      }

      groups[baseKey].variants.push(p);

      // Calculate total stock for this variant
      const variantStock = almacenes.reduce((acc, alm) => {
        const item = stockList.find(s => s.sku?.toUpperCase() === p.sku?.toUpperCase() && s.almacen_id === alm.id);
        return acc + (item ? item.cantidad : 0);
      }, 0);

      groups[baseKey].totalStock += variantStock;

      const price = Number(p.precio_venta_sugerido) || 0;
      if (price > 0) {
        if (price < groups[baseKey].minPrice) groups[baseKey].minPrice = price;
        if (price > groups[baseKey].maxPrice) groups[baseKey].maxPrice = price;
      }

      // Check min stock alert
      const minStock = Number(p.stock_minimo) || 0;
      if (minStock > 0 && variantStock <= minStock) {
        groups[baseKey].hasLowStock = true;
      }
    });

    return Object.values(groups);
  }, [productos, stockList, almacenes]);

  // Filtered grouped products
  const filteredGroups = useMemo(() => {
    return groupedProducts.filter(g => {
      const term = searchQuery.toLowerCase().trim();
      const matchesSearch = !term || (
        g.nombre.toLowerCase().includes(term) ||
        g.marca.toLowerCase().includes(term) ||
        g.categoria.toLowerCase().includes(term) ||
        g.variants.some(v => 
          v.sku.toLowerCase().includes(term) || 
          (v.color && v.color.toLowerCase().includes(term)) ||
          (v.talla && v.talla.toLowerCase().includes(term)) ||
          (v.codigo_barras && v.codigo_barras.toLowerCase().includes(term))
        )
      );

      const matchesMarca = filterMarca === "all" || g.marca.toLowerCase() === filterMarca.toLowerCase();
      const matchesCategoria = filterCategoria === "all" || g.categoria.toLowerCase() === filterCategoria.toLowerCase();
      const matchesTipoTalla = filterTipoTalla === "all" || g.tipo_talla === filterTipoTalla;
      
      let matchesEstado = true;
      if (filterEstado === "activos") {
        matchesEstado = g.variants.some(v => v.activo !== false);
      } else if (filterEstado === "inactivos") {
        matchesEstado = g.variants.every(v => v.activo === false);
      } else if (filterEstado === "stock_bajo") {
        matchesEstado = g.hasLowStock || g.totalStock === 0;
      }

      return matchesSearch && matchesMarca && matchesCategoria && matchesTipoTalla && matchesEstado;
    });
  }, [groupedProducts, searchQuery, filterMarca, filterCategoria, filterTipoTalla, filterEstado]);

  // Helper for single variant stock calculation
  const getVariantStock = (sku: string, almacenId?: string): number => {
    if (!sku) return 0;
    const cleanSku = sku.toUpperCase();
    if (almacenId) {
      const found = stockList.find(s => s.sku?.toUpperCase() === cleanSku && s.almacen_id === almacenId);
      return found ? found.cantidad : 0;
    }
    return almacenes.reduce((acc, alm) => {
      const found = stockList.find(s => s.sku?.toUpperCase() === cleanSku && s.almacen_id === alm.id);
      return acc + (found ? found.cantidad : 0);
    }, 0);
  };

  // Helper to open creation modal
  const handleOpenCreateModal = () => {
    setEditingBaseId(null);
    setEditingSingleProductId(null);
    setFormNombre("");
    setFormMarca(catalogMarcas[0]?.nombre || "dorsalclub");
    setFormCategoria(catalogCategorias[0]?.nombre || "Camisetas");
    setFormTipoTalla("ropa");
    setFormUnidad("pieza");
    setFormErrors({});
    setGeneralError(null);
    setIsMatrixOpen(false);

    // Initial default variant
    const defaultColor = catalogColores[0]?.nombre || "Negro Lavado";
    const defaultTalla = catalogTallasRopa[0]?.nombre || "M";
    const initialSku = generateSku("dorsalclub", "Modelo", defaultColor, defaultTalla);

    const initialMinMap: Record<string, number | string> = {};
    almacenes.forEach(alm => {
      initialMinMap[alm.id] = 3;
    });

    setVariantRows([{
      id: Math.random().toString(36).substring(2, 9),
      color: defaultColor,
      talla: defaultTalla,
      sku: initialSku,
      codigo_barras: "",
      precio_venta_sugerido: 799,
      stock_minimo_almacenes: initialMinMap,
      stock_minimo: 3,
      activo: true
    }]);

    setIsFormOpen(true);
  };

  // Helper to open edit for an entire base model or adding variants
  const handleOpenEditModel = (group: typeof groupedProducts[0]) => {
    setEditingBaseId(group.baseId);
    setEditingSingleProductId(null);
    setFormNombre(group.nombre);
    setFormMarca(group.marca);
    setFormCategoria(group.categoria);
    setFormTipoTalla(group.tipo_talla);
    setFormUnidad(group.unidad);
    setFormErrors({});
    setGeneralError(null);
    setIsMatrixOpen(false);

    const rows: VariantFormRow[] = group.variants.map(v => {
      const minMap: Record<string, number | string> = {};
      almacenes.forEach(alm => {
        minMap[alm.id] = v.stock_minimo_almacenes?.[alm.id] ?? v.stock_minimo ?? 3;
      });

      return {
        id: v.id || v.sku,
        color: v.color || "Sin especificar",
        talla: v.talla || "Sin especificar",
        sku: v.sku,
        codigo_barras: v.codigo_barras || "",
        precio_venta_sugerido: v.precio_venta_sugerido ?? 0,
        stock_minimo_almacenes: minMap,
        stock_minimo: v.stock_minimo ?? 3,
        activo: v.activo !== false
      };
    });

    setVariantRows(rows);
    setIsFormOpen(true);
  };

  // Add single variant row to form
  const handleAddVariantRow = () => {
    const availableColor = catalogColores[0]?.nombre || "Negro";
    const availableTalla = formTipoTalla === "calzado" 
      ? (catalogTallasCalzado[0]?.nombre || "27") 
      : (catalogTallasRopa[0]?.nombre || "M");
    
    const suggestedSku = generateSku(formMarca, formNombre, availableColor, availableTalla);

    const minMap: Record<string, number | string> = {};
    almacenes.forEach(alm => {
      minMap[alm.id] = 3;
    });

    setVariantRows(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        color: availableColor,
        talla: availableTalla,
        sku: suggestedSku,
        codigo_barras: "",
        precio_venta_sugerido: variantRows[0]?.precio_venta_sugerido || 799,
        stock_minimo_almacenes: minMap,
        stock_minimo: 3,
        activo: true
      }
    ]);
  };

  // Remove variant row
  const handleRemoveVariantRow = (rowId: string) => {
    if (variantRows.length <= 1) {
      setGeneralError("El producto debe tener al menos una variante.");
      return;
    }
    setVariantRows(prev => prev.filter(r => r.id !== rowId));
  };

  // Update variant row field
  const handleUpdateVariantField = (rowId: string, field: keyof VariantFormRow, value: any) => {
    setVariantRows(prev => prev.map(row => {
      if (row.id !== rowId) return row;
      const updated = { ...row, [field]: value };
      
      // Auto-update SKU suggestion if color or talla changes and user hasn't heavily customized SKU
      if (field === "color" || field === "talla") {
        if (!editingBaseId) {
          const autoSku = generateSku(formMarca, formNombre, updated.color, updated.talla);
          updated.sku = autoSku;
        }
      }
      return updated;
    }));
  };

  // Apply quick matrix generation
  const handleGenerateMatrix = () => {
    if (matrixColors.length === 0 || matrixSizes.length === 0) {
      setGeneralError("Selecciona al menos un color y una talla para generar combinaciones.");
      return;
    }

    const newRows: VariantFormRow[] = [];
    const minMap: Record<string, number | string> = {};
    almacenes.forEach(alm => {
      minMap[alm.id] = matrixMinStock;
    });

    matrixColors.forEach(col => {
      matrixSizes.forEach(sz => {
        const sku = generateSku(formMarca, formNombre, col, sz);
        newRows.push({
          id: Math.random().toString(36).substring(2, 9),
          color: col,
          talla: sz,
          sku: sku,
          codigo_barras: "",
          precio_venta_sugerido: Number(matrixPrice) || 0,
          stock_minimo_almacenes: { ...minMap },
          stock_minimo: Number(matrixMinStock) || 0,
          activo: true
        });
      });
    });

    setVariantRows(newRows);
    setIsMatrixOpen(false);
    setGeneralError(null);
  };

  // Form submission: Validate and save batch
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    setFormErrors({});

    if (!formNombre.trim()) {
      setFormErrors(prev => ({ ...prev, nombre: "El nombre del producto es obligatorio" }));
      return;
    }

    // Validation for variants
    const skusSet = new Set<string>();
    const comboSet = new Set<string>();
    let hasDupes = false;

    for (let i = 0; i < variantRows.length; i++) {
      const row = variantRows[i];
      const cleanSku = (row.sku || "").trim().toUpperCase();
      
      if (!cleanSku) {
        setGeneralError(`La variante en la fila ${i + 1} no tiene un SKU válido.`);
        return;
      }

      if (skusSet.has(cleanSku)) {
        setGeneralError(`SKU duplicado "${cleanSku}" detectado en múltiples variantes.`);
        return;
      }
      skusSet.add(cleanSku);

      // Check if SKU already exists in other products
      const existingWithSameSku = productos.find(p => p.sku?.toUpperCase() === cleanSku);
      if (existingWithSameSku) {
        // If not editing this same product variant, it's a conflict
        if (!editingBaseId || existingWithSameSku.producto_base_id !== editingBaseId) {
          setGeneralError(`El SKU "${cleanSku}" ya está registrado en otro producto.`);
          return;
        }
      }

      const combo = `${row.color.trim().toLowerCase()}_${row.talla.trim().toLowerCase()}`;
      if (comboSet.has(combo)) {
        setGeneralError(`Combinación de color "${row.color}" y talla "${row.talla}" repetida.`);
        return;
      }
      comboSet.add(combo);
    }

    setSubmitLoading(true);
    try {
      const baseId = editingBaseId || generateBaseId(formMarca, formNombre);

      const productsToSave: Omit<Producto, "id">[] = variantRows.map(row => {
        const minStockNum = Number(row.stock_minimo) || 0;
        const priceNum = Number(row.precio_venta_sugerido) || 0;

        return {
          producto_base_id: baseId,
          nombre: formNombre.trim(),
          marca: formMarca.trim(),
          categoria: formCategoria.trim(),
          tipo_talla: formTipoTalla,
          unidad: formUnidad.trim(),
          color: row.color.trim(),
          talla: row.talla.trim(),
          sku: row.sku.trim().toUpperCase(),
          codigo_barras: (row.codigo_barras || "").trim(),
          precio_venta_sugerido: priceNum >= 0 ? priceNum : 0,
          stock_minimo: minStockNum,
          stock_minimo_almacenes: row.stock_minimo_almacenes as Record<string, number>,
          activo: row.activo
        };
      });

      if (editingBaseId) {
        // For editing, update existing and create new variants
        for (const item of productsToSave) {
          const existing = productos.find(p => p.sku === item.sku);
          if (existing) {
            await firestoreService.updateProducto(existing.id, item);
          } else {
            await firestoreService.addProducto(item);
          }
        }
      } else {
        // Atomic batch add
        await firestoreService.addProductsBatch(productsToSave);
      }

      setIsFormOpen(false);
      setEditingBaseId(null);
      
      // Prompt user if they want to register initial stock for the first created variant
      if (!editingBaseId && productsToSave.length > 0) {
        const first = productsToSave[0];
        setCreatedProductPrompt({
          id: first.sku,
          ...first
        } as Producto);
      }
    } catch (err: any) {
      setGeneralError(err.message || "Error al guardar el producto.");
    } finally {
      setSubmitLoading(false);
    }
  };

  // Toggle single variant active status
  const handleToggleVariantStatus = async (productoId: string, currentStatus: boolean) => {
    try {
      await firestoreService.toggleProductoStatus(productoId, !currentStatus);
    } catch (e: any) {
      alert("Error al cambiar estado: " + e.message);
    }
  };

  // Delete product confirmation
  const handleConfirmDelete = async () => {
    if (!productToDelete) return;
    setSubmitLoading(true);
    try {
      if (productToDelete.isBase) {
        // Delete all variants of base model
        const toDelete = productos.filter(p => p.producto_base_id === productToDelete.id || `legacy-${p.nombre.toLowerCase().trim()}` === productToDelete.id);
        for (const p of toDelete) {
          await firestoreService.deleteProducto(p.sku);
        }
      } else {
        // Delete single variant
        await firestoreService.deleteProducto(productToDelete.sku);
      }
      setIsDeleteModalOpen(false);
      setProductToDelete(null);
    } catch (err: any) {
      alert(err.message || "Error al eliminar producto.");
    } finally {
      setSubmitLoading(false);
    }
  };

  const toggleExpand = (baseId: string) => {
    setExpandedBaseIds(prev => ({
      ...prev,
      [baseId]: !prev[baseId]
    }));
  };

  return (
    <div id="gestion-productos-root" className="space-y-6">
      {/* Top Header Card */}
      <div id="gestion-productos-header" className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center font-bold shadow-sm">
            <Shirt className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">
              Catálogo de Productos y Variantes
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Gestión centralizada de modelos, colores, tallas y SKUs para streetwear
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            id="btn-gestionar-catalogos"
            onClick={() => setIsCatalogosOpen(true)}
            className="px-4 py-2.5 text-xs font-semibold rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 transition-colors flex items-center gap-2"
          >
            <Bookmark className="w-4 h-4" />
            Catálogos (Marcas, Colores, Tallas)
          </button>

          <button
            id="btn-crear-producto"
            onClick={handleOpenCreateModal}
            className="px-4 py-2.5 text-xs font-semibold rounded-xl bg-zinc-900 dark:bg-white hover:bg-black dark:hover:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Crear Producto
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div id="gestion-productos-filters" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        {/* Search */}
        <div className="relative lg:col-span-2">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar por modelo, SKU, marca, color o código de barras..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white text-zinc-900 dark:text-white"
          />
        </div>

        {/* Marca filter */}
        <div>
          <select
            value={filterMarca}
            onChange={(e) => setFilterMarca(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none text-zinc-900 dark:text-white font-medium"
          >
            <option value="all">Todas las Marcas</option>
            {catalogMarcas.map(m => (
              <option key={m.id} value={m.nombre}>{m.nombre}</option>
            ))}
          </select>
        </div>

        {/* Categoria filter */}
        <div>
          <select
            value={filterCategoria}
            onChange={(e) => setFilterCategoria(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none text-zinc-900 dark:text-white font-medium"
          >
            <option value="all">Todas las Categorías</option>
            {catalogCategorias.map(c => (
              <option key={c.id} value={c.nombre}>{c.nombre}</option>
            ))}
          </select>
        </div>

        {/* Tipo / Estado filter */}
        <div>
          <select
            value={filterEstado}
            onChange={(e) => setFilterEstado(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none text-zinc-900 dark:text-white font-medium"
          >
            <option value="all">Todos los Estados</option>
            <option value="activos">Solo Activos</option>
            <option value="inactivos">Inactivos</option>
            <option value="stock_bajo">Stock Crítico / Agotado</option>
          </select>
        </div>
      </div>

      {/* Main List: Grouped by Model */}
      <div id="gestion-productos-list" className="space-y-3">
        {filteredGroups.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 p-12 text-center rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3">
            <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 mx-auto flex items-center justify-center">
              <Shirt className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
              No se encontraron productos
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
              {searchQuery ? "Intenta con otros términos de búsqueda." : "Comienza agregando tu primer modelo y sus variantes con el botón Crear Producto."}
            </p>
          </div>
        ) : (
          filteredGroups.map(group => {
            const isExpanded = expandedBaseIds[group.baseId] !== false; // expanded by default
            const colorDotMap: Record<string, string> = {};
            catalogColores.forEach(c => {
              colorDotMap[c.nombre.toLowerCase()] = c.codigo_hex;
            });

            return (
              <div
                key={group.baseId}
                className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-xs transition-all"
              >
                {/* Group Header Row */}
                <div 
                  className="px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-zinc-50/50 dark:bg-zinc-800/20 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 cursor-pointer border-b border-zinc-100 dark:border-zinc-800/60"
                  onClick={() => toggleExpand(group.baseId)}
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-zinc-900 dark:text-white tracking-tight">
                          {group.nombre}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
                          {group.marca}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                          {group.categoria}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        <span>{group.variants.length} {group.variants.length === 1 ? "variante" : "variantes"}</span>
                        <span>•</span>
                        <span>Tipo: {group.tipo_talla === "calzado" ? "Calzado" : group.tipo_talla === "unica" ? "Talla Única" : "Ropa"}</span>
                        <span>•</span>
                        <span>Unidad: {group.unidad}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 justify-between md:justify-end" onClick={(e) => e.stopPropagation()}>
                    {/* Price Range */}
                    <div className="text-right">
                      <span className="text-[11px] text-zinc-400 block font-medium">Precio sugerido</span>
                      <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                        {group.minPrice === Infinity 
                          ? "$0.00 MXN" 
                          : group.minPrice === group.maxPrice
                            ? `$${group.minPrice.toLocaleString()} MXN`
                            : `$${group.minPrice.toLocaleString()} - $${group.maxPrice.toLocaleString()} MXN`}
                      </span>
                    </div>

                    {/* Stock status pill */}
                    <div className="text-right">
                      <span className="text-[11px] text-zinc-400 block font-medium">Stock total</span>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        group.totalStock === 0
                          ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800"
                          : group.hasLowStock
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                            : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                      }`}>
                        {group.totalStock} {group.unidad}s
                      </span>
                    </div>

                    {/* Actions menu */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEditModel(group)}
                        className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                        title="Editar modelo y variantes"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setProductToDelete({
                            id: group.baseId,
                            sku: group.variants[0]?.sku || "",
                            nombre: group.nombre,
                            isBase: true
                          });
                          setIsDeleteModalOpen(true);
                        }}
                        className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors"
                        title="Eliminar modelo completo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Variants Table */}
                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-50/70 dark:bg-zinc-800/40 text-zinc-400 font-semibold border-b border-zinc-100 dark:border-zinc-800">
                        <tr>
                          <th className="py-2.5 px-4">Color</th>
                          <th className="py-2.5 px-4">Talla</th>
                          <th className="py-2.5 px-4">SKU</th>
                          <th className="py-2.5 px-4">Código Barras</th>
                          <th className="py-2.5 px-4 text-right">Precio Venta</th>
                          <th className="py-2.5 px-4 text-center">Stock por Almacén</th>
                          <th className="py-2.5 px-4 text-center">Total</th>
                          <th className="py-2.5 px-4 text-center">Estado</th>
                          <th className="py-2.5 px-4 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                        {group.variants.map(variant => {
                          const varStock = getVariantStock(variant.sku);
                          const isLow = (Number(variant.stock_minimo) || 0) > 0 && varStock <= (Number(variant.stock_minimo) || 0);
                          const hexColor = colorDotMap[(variant.color || "").toLowerCase()] || "#111827";

                          return (
                            <tr key={variant.sku} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                              {/* Color */}
                              <td className="py-3 px-4 font-medium text-zinc-900 dark:text-white">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="w-3.5 h-3.5 rounded-full border border-zinc-300 dark:border-zinc-700 shadow-inner shrink-0"
                                    style={{ backgroundColor: hexColor }}
                                  />
                                  <span>{variant.color || "Sin especificar"}</span>
                                </div>
                              </td>

                              {/* Talla */}
                              <td className="py-3 px-4">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
                                  {variant.talla || "U"}
                                </span>
                              </td>

                              {/* SKU */}
                              <td className="py-3 px-4 font-mono font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                                {variant.sku}
                              </td>

                              {/* Código de barras */}
                              <td className="py-3 px-4 font-mono text-zinc-500 dark:text-zinc-400">
                                {variant.codigo_barras || "—"}
                              </td>

                              {/* Precio de venta */}
                              <td className="py-3 px-4 text-right font-semibold text-zinc-900 dark:text-white">
                                ${Number(variant.precio_venta_sugerido || 0).toLocaleString()} MXN
                              </td>

                              {/* Stock por almacén breakdown */}
                              <td className="py-3 px-4 text-center">
                                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                  {almacenes.map(alm => {
                                    const qty = getVariantStock(variant.sku, alm.id);
                                    return (
                                      <span
                                        key={alm.id}
                                        className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-medium"
                                        title={`${alm.nombre}: ${qty}`}
                                      >
                                        {alm.nombre.slice(0, 3)}: <strong className="text-zinc-900 dark:text-white">{qty}</strong>
                                      </span>
                                    );
                                  })}
                                </div>
                              </td>

                              {/* Total Stock */}
                              <td className="py-3 px-4 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                  varStock === 0
                                    ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                                    : isLow
                                      ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                                      : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                                }`}>
                                  {varStock}
                                </span>
                              </td>

                              {/* Status */}
                              <td className="py-3 px-4 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                  variant.activo !== false
                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                                    : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                                }`}>
                                  {variant.activo !== false ? "Activo" : "Inactivo"}
                                </span>
                              </td>

                              {/* Actions */}
                              <td className="py-3 px-4 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {onNavigateToMovimiento && (
                                    <button
                                      onClick={() => onNavigateToMovimiento(variant.sku)}
                                      className="p-1.5 text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors font-medium flex items-center gap-1"
                                      title="Registrar entrada/salida para este SKU"
                                    >
                                      <Warehouse className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleToggleVariantStatus(variant.id, variant.activo !== false)}
                                    className={`p-1.5 rounded-lg transition-colors ${
                                      variant.activo !== false
                                        ? "text-zinc-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                        : "text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                    }`}
                                    title={variant.activo !== false ? "Desactivar variante" : "Activar variante"}
                                  >
                                    <Power className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setProductToDelete({
                                        id: variant.id,
                                        sku: variant.sku,
                                        nombre: `${group.nombre} (${variant.color} / ${variant.talla})`,
                                        isBase: false
                                      });
                                      setIsDeleteModalOpen(true);
                                    }}
                                    className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors"
                                    title="Eliminar variante"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
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
            );
          })
        )}
      </div>

      {/* CREATE / EDIT PRODUCT MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-5xl my-8 flex flex-col shadow-2xl overflow-hidden max-h-[90vh]"
          >
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center font-bold">
                  <Shirt className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                    {editingBaseId ? "Editar Producto y Variantes" : "Crear Nuevo Producto"}
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Define la información base del modelo y genera sus variantes por color y talla
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                className="p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmitForm} className="flex-1 overflow-y-auto p-6 space-y-6">
              {generalError && (
                <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="font-medium">{generalError}</span>
                </div>
              )}

              {/* SECTION 1: BASE PRODUCT DETAILS */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                  <Package className="w-3.5 h-3.5" />
                  1. Información General del Modelo
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  {/* Nombre */}
                  <div className="lg:col-span-2">
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                      Nombre Comercial del Modelo *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Heavyweight Boxy Tee, Cargo Pants..."
                      value={formNombre}
                      onChange={(e) => setFormNombre(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white text-zinc-900 dark:text-white font-medium"
                    />
                    {formErrors.nombre && (
                      <p className="text-[11px] text-rose-600 mt-1">{formErrors.nombre}</p>
                    )}
                  </div>

                  {/* Marca */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                      Marca *
                    </label>
                    <select
                      value={formMarca}
                      onChange={(e) => setFormMarca(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none text-zinc-900 dark:text-white font-medium"
                    >
                      {catalogMarcas.map(m => (
                        <option key={m.id} value={m.nombre}>{m.nombre}</option>
                      ))}
                      {catalogMarcas.length === 0 && <option value="dorsalclub">dorsalclub</option>}
                    </select>
                  </div>

                  {/* Categoria */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                      Categoría *
                    </label>
                    <select
                      value={formCategoria}
                      onChange={(e) => setFormCategoria(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none text-zinc-900 dark:text-white font-medium"
                    >
                      {catalogCategorias.map(c => (
                        <option key={c.id} value={c.nombre}>{c.nombre}</option>
                      ))}
                      {catalogCategorias.length === 0 && <option value="Camisetas">Camisetas</option>}
                    </select>
                  </div>

                  {/* Tipo de Talla */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                      Tipo de Talla
                    </label>
                    <select
                      value={formTipoTalla}
                      onChange={(e: any) => setFormTipoTalla(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none text-zinc-900 dark:text-white font-medium"
                    >
                      <option value="ropa">Ropa (XS, S, M, L, XL...)</option>
                      <option value="calzado">Calzado (25, 26, 27, 28...)</option>
                      <option value="unica">Talla Única (Accesorios/Gorras)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION 2: VARIANTS MATRIX GENERATOR / BUILDER */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-zinc-100 dark:border-zinc-800 pt-5">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5" />
                      2. Variantes del Producto ({variantRows.length})
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Cada fila representa una variante vendible con su propio SKU y control de inventario
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsMatrixOpen(!isMatrixOpen)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5 transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-zinc-900 dark:text-white" />
                      Generador Rápido de Combinaciones
                    </button>

                    <button
                      type="button"
                      onClick={handleAddVariantRow}
                      className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-black dark:hover:bg-zinc-100 flex items-center gap-1.5 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Agregar Fila
                    </button>
                  </div>
                </div>

                {/* Quick Matrix Expandable Box */}
                {isMatrixOpen && (
                  <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/80 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4" />
                        Selecciona múltiples colores y tallas para autogenerar todas las filas:
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsMatrixOpen(false)}
                        className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Colors selection checkboxes */}
                    <div>
                      <span className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1.5">
                        Colores a incluir:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {catalogColores.map(c => {
                          const selected = matrixColors.includes(c.nombre);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setMatrixColors(prev => 
                                  selected ? prev.filter(x => x !== c.nombre) : [...prev, c.nombre]
                                );
                              }}
                              className={`px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-all ${
                                selected 
                                  ? "bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900 dark:border-white shadow-xs" 
                                  : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700"
                              }`}
                            >
                              <span
                                className="w-2.5 h-2.5 rounded-full border border-black/20 shrink-0"
                                style={{ backgroundColor: c.codigo_hex }}
                              />
                              {c.nombre}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Sizes selection checkboxes */}
                    <div>
                      <span className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1.5">
                        Tallas a incluir ({formTipoTalla === "calzado" ? "Calzado" : "Ropa"}):
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {(formTipoTalla === "calzado" ? catalogTallasCalzado : catalogTallasRopa).map(t => {
                          const selected = matrixSizes.includes(t.nombre);
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                setMatrixSizes(prev => 
                                  selected ? prev.filter(x => x !== t.nombre) : [...prev, t.nombre]
                                );
                              }}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                                selected 
                                  ? "bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900 dark:border-white" 
                                  : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700"
                              }`}
                            >
                              {t.nombre}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 pt-2 border-t border-zinc-200/60 dark:border-zinc-700/60">
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-zinc-500 font-medium">Precio base:</label>
                        <input
                          type="number"
                          value={matrixPrice}
                          onChange={(e) => setMatrixPrice(e.target.value)}
                          className="w-24 px-2 py-1 text-xs bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-zinc-500 font-medium">Stock mínimo:</label>
                        <input
                          type="number"
                          value={matrixMinStock}
                          onChange={(e) => setMatrixMinStock(e.target.value)}
                          className="w-20 px-2 py-1 text-xs bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleGenerateMatrix}
                        className="ml-auto px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors"
                      >
                        Generar {matrixColors.length * matrixSizes.length} Variantes
                      </button>
                    </div>
                  </div>
                )}

                {/* Variants Table in Form */}
                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 font-semibold border-b border-zinc-200 dark:border-zinc-800">
                      <tr>
                        <th className="py-2.5 px-3">Color</th>
                        <th className="py-2.5 px-3">Talla</th>
                        <th className="py-2.5 px-3">SKU Único *</th>
                        <th className="py-2.5 px-3">Código Barras</th>
                        <th className="py-2.5 px-3">Precio MXN</th>
                        <th className="py-2.5 px-3">Stock Mínimo</th>
                        <th className="py-2.5 px-3 text-center">Activo</th>
                        <th className="py-2.5 px-3 text-right">Quitar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {variantRows.map((row, idx) => (
                        <tr key={row.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40">
                          {/* Color select */}
                          <td className="py-2.5 px-3">
                            <select
                              value={row.color}
                              onChange={(e) => handleUpdateVariantField(row.id, "color", e.target.value)}
                              className="w-full px-2.5 py-1 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white font-medium"
                            >
                              {catalogColores.map(c => (
                                <option key={c.id} value={c.nombre}>{c.nombre}</option>
                              ))}
                              {catalogColores.length === 0 && <option value="Negro">Negro</option>}
                            </select>
                          </td>

                          {/* Talla select */}
                          <td className="py-2.5 px-3">
                            {formTipoTalla === "unica" ? (
                              <span className="text-xs font-semibold px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded text-zinc-700 dark:text-zinc-300">
                                Única
                              </span>
                            ) : (
                              <select
                                value={row.talla}
                                onChange={(e) => handleUpdateVariantField(row.id, "talla", e.target.value)}
                                className="w-full px-2.5 py-1 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white font-semibold"
                              >
                                {(formTipoTalla === "calzado" ? catalogTallasCalzado : catalogTallasRopa).map(t => (
                                  <option key={t.id} value={t.nombre}>{t.nombre}</option>
                                ))}
                                {catalogTallasRopa.length === 0 && <option value="M">M</option>}
                              </select>
                            )}
                          </td>

                          {/* SKU input */}
                          <td className="py-2.5 px-3 font-mono">
                            <input
                              type="text"
                              required
                              value={row.sku}
                              onChange={(e) => handleUpdateVariantField(row.id, "sku", e.target.value.toUpperCase().replace(/\s+/g, "-"))}
                              className="w-full px-2.5 py-1 text-xs uppercase bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white font-bold tracking-tight focus:outline-none"
                            />
                          </td>

                          {/* Código de barras */}
                          <td className="py-2.5 px-3">
                            <input
                              type="text"
                              placeholder="Opcional"
                              value={row.codigo_barras}
                              onChange={(e) => handleUpdateVariantField(row.id, "codigo_barras", e.target.value)}
                              className="w-full px-2.5 py-1 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white font-mono focus:outline-none"
                            />
                          </td>

                          {/* Precio venta */}
                          <td className="py-2.5 px-3">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={row.precio_venta_sugerido}
                              onChange={(e) => handleUpdateVariantField(row.id, "precio_venta_sugerido", Number(e.target.value))}
                              className="w-24 px-2 py-1 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white font-semibold focus:outline-none"
                            />
                          </td>

                          {/* Stock mínimo */}
                          <td className="py-2.5 px-3">
                            <input
                              type="number"
                              min="0"
                              value={row.stock_minimo}
                              onChange={(e) => handleUpdateVariantField(row.id, "stock_minimo", Number(e.target.value))}
                              className="w-20 px-2 py-1 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white focus:outline-none"
                            />
                          </td>

                          {/* Activo checkbox */}
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={row.activo}
                              onChange={(e) => handleUpdateVariantField(row.id, "activo", e.target.checked)}
                              className="w-4 h-4 rounded text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                            />
                          </td>

                          {/* Remove button */}
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              disabled={variantRows.length <= 1}
                              onClick={() => handleRemoveVariantRow(row.id)}
                              className="p-1 text-zinc-400 hover:text-rose-600 disabled:opacity-30 rounded-md"
                              title="Quitar variante"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="border-t border-zinc-200 dark:border-zinc-800 pt-5 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={submitLoading}
                  className="px-6 py-2.5 text-xs font-bold rounded-xl bg-zinc-900 dark:bg-white hover:bg-black dark:hover:bg-zinc-100 text-white dark:text-zinc-900 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                >
                  {submitLoading ? (
                    <span>Guardando...</span>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>{editingBaseId ? "Guardar Cambios" : `Crear Modelo y ${variantRows.length} Variantes`}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* MODAL CATALOGOS */}
      <ModalCatalogos
        isOpen={isCatalogosOpen}
        onClose={() => setIsCatalogosOpen(false)}
        productos={productos}
      />

      {/* MODAL DELETE CONFIRMATION */}
      {isDeleteModalOpen && productToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                ¿Eliminar {productToDelete.nombre}?
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                {productToDelete.isBase 
                  ? "Esta acción eliminará el modelo y todas sus variantes asociadas. El historial de movimientos previos se conservará."
                  : "Esta acción eliminará la variante seleccionada del catálogo."}
              </p>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={submitLoading}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-700 text-white transition-colors disabled:opacity-50"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PROMPT INITIAL STOCK ENTRY MODAL */}
      {createdProductPrompt && onNavigateToMovimiento && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                ¡Producto creado con éxito!
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                Se guardó <strong className="text-zinc-800 dark:text-zinc-200">{createdProductPrompt.nombre}</strong>. ¿Deseas registrar la entrada inicial de inventario ahora?
              </p>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setCreatedProductPrompt(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Más tarde
              </button>
              <button
                onClick={() => {
                  const sku = createdProductPrompt.sku;
                  setCreatedProductPrompt(null);
                  onNavigateToMovimiento(sku);
                }}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-zinc-900 dark:bg-white hover:bg-black dark:hover:bg-zinc-100 text-white dark:text-zinc-900 transition-colors flex items-center gap-1.5"
              >
                <span>Registrar Entrada</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
