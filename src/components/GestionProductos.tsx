/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, Edit2, FileUp, Plus, Search, Settings, Trash2, X } from "lucide-react";
import { firestoreService } from "../lib/firebase";
import { etiquetaTipoTalla, filtrarProductosCatalogo } from "../lib/catalogoProductos";
import { COLUMNAS_PLANTILLA_PRODUCTOS, MAX_PRODUCTOS_CSV, datosExportacionProductosCsv, importarProductosCsv } from "../lib/catalogoProductosCsv";
import { downloadCsv } from "../lib/presentation";
import { useWorkspace } from "../context/WorkspaceContext";
import type { MarcaCatalogo, Producto } from "../types";
import ModalCatalogos from "./ModalCatalogos";

interface GestionProductosProps {
  productos?: Producto[];
  onNavigateToMovimiento?: (sku: string) => void; // Firma conservada para llamadas existentes.
}

type TipoTalla = NonNullable<Producto["tipo_talla"]>;

const opcionesTipoTalla: { value: TipoTalla; label: string }[] = [
  { value: "ropa", label: "Ropa (XS, S, M, L, XL...)" },
  { value: "calzado", label: "Calzado (25, 26, 27, 28...)" },
  { value: "unica", label: "Talla única / Sin talla (gorras, accesorios...)" },
  { value: "personalizada", label: "Personalizada (anillos, cinturones, medidas...)" }
];

export default function GestionProductos({ productos: propProductos }: GestionProductosProps) {
  const { notify } = useWorkspace();
  const [internalProductos, setInternalProductos] = useState<Producto[]>([]);
  const [marcas, setMarcas] = useState<MarcaCatalogo[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMarca, setFilterMarca] = useState("all");
  const [isCatalogosOpen, setIsCatalogosOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Producto | null>(null);
  const [productToDelete, setProductToDelete] = useState<Producto | null>(null);
  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const csvFileRef = useRef<HTMLInputElement>(null);
  const [csvPreview, setCsvPreview] = useState<{ nombre: string; productos: Producto[] } | null>(null);
  const [csvError, setCsvError] = useState("");
  const [importandoCsv, setImportandoCsv] = useState(false);
  const [exportandoCsv, setExportandoCsv] = useState(false);

  const [formNombre, setFormNombre] = useState("");
  const [formMarca, setFormMarca] = useState("");
  const [formTipoTalla, setFormTipoTalla] = useState<TipoTalla | "">("");
  const [formSku, setFormSku] = useState("");

  useEffect(() => {
    const unsubMarcas = firestoreService.getMarcasRealtime(setMarcas);
    const unsubProductos = propProductos === undefined
      ? firestoreService.getProductosRealtime(setInternalProductos, error => {
          notify(error?.message || "No se pudo cargar el catálogo.", "error");
        })
      : () => {};
    return () => { unsubMarcas(); unsubProductos(); };
  }, [propProductos]);

  const productos = propProductos ?? internalProductos;
  const visibles = useMemo(
    () => filtrarProductosCatalogo(productos, searchQuery, filterMarca),
    [productos, searchQuery, filterMarca]
  );

  const opcionesMarcaFiltro = useMemo(() =>
    [...new Set([...marcas.map(m => m.nombre), ...productos.map(p => p.marca || "")].filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "es-MX", { sensitivity: "base" })),
    [marcas, productos]);

  const marcasActivas = useMemo(
    () => marcas.filter(m => m.activa !== false && m.en_papelera !== true),
    [marcas]
  );

  const resetForm = () => {
    setEditingProduct(null);
    setFormNombre("");
    setFormMarca("");
    setFormTipoTalla("");
    setFormSku("");
    setGeneralError(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const handleOpenEdit = (producto: Producto) => {
    setEditingProduct(producto);
    setFormNombre(producto.nombre);
    setFormMarca(producto.marca || "");
    setFormTipoTalla(producto.tipo_talla || "personalizada");
    setFormSku(producto.sku);
    setGeneralError(null);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    if (loading) return;
    setIsFormOpen(false);
    resetForm();
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    const nombre = formNombre.trim();
    const marca = formMarca.trim();
    const sku = formSku.trim().toUpperCase();
    if (!nombre || nombre.length > 120 || !marca || !formTipoTalla || !sku || sku.length > 128 || sku.includes("/")) {
      setGeneralError("Completa nombre, marca, tipo de talla y un SKU válido (máximo 128 caracteres, sin /).");
      return;
    }
    if (!editingProduct && productos.some(p => p.sku.trim().toUpperCase() === sku)) {
      setGeneralError(`El SKU "${sku}" ya está registrado.`);
      return;
    }

    setGeneralError(null);
    setLoading(true);
    try {
      if (editingProduct) {
        // El SKU es la identidad de Firestore y los movimientos. No se modifica al editar.
        await firestoreService.updateProducto(editingProduct.sku, { nombre, marca, tipo_talla: formTipoTalla });
        notify("Producto actualizado.");
      } else {
        const producto: Producto = {
          sku,
          producto_base_id: sku,
          nombre,
          marca,
          tipo_talla: formTipoTalla,
          categoria: "General", // Dato interno de compatibilidad, no se solicita.
          unidad: "pieza",
          stock_minimo: 0,
          activo: true,
          precio_costo: 0
        };
        await firestoreService.addProductsBatch([producto]);
        notify("Producto registrado correctamente.");
      }
      setIsFormOpen(false);
      resetForm();
    } catch (error: any) {
      setGeneralError(error?.message || "No se pudo guardar el producto.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!productToDelete || loading) return;
    setLoading(true);
    try {
      await firestoreService.deleteProducts([productToDelete.sku]);
      notify("Producto enviado a Papelera.");
      setProductToDelete(null);
    } catch (error: any) {
      notify(error?.message || "No se pudo eliminar el producto.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDescargarPlantilla = () => {
    downloadCsv("plantilla-productos-dorsalclub.csv", [...COLUMNAS_PLANTILLA_PRODUCTOS], []);
  };

  const handleExportarCatalogo = async () => {
    if (exportandoCsv) return;
    setExportandoCsv(true);
    try {
      // Consulta el catálogo completo, no solo la página ni el filtro visibles.
      const catalogoActual = await firestoreService.getProductos();
      const { columnas, filas } = datosExportacionProductosCsv(catalogoActual);
      downloadCsv(`catalogo-productos-dorsalclub-${new Date().toISOString().slice(0, 10)}.csv`, columnas, filas);
      notify(`Catálogo exportado: ${filas.length} productos.`);
    } catch (error: any) {
      notify(error?.message || "No se pudo exportar el catálogo.", "error");
    } finally {
      setExportandoCsv(false);
    }
  };

  const handleSeleccionCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = event.target.files?.[0];
    event.target.value = "";
    if (!archivo) return;
    setCsvError("");
    setCsvPreview(null);
    if (!archivo.name.toLowerCase().endsWith(".csv")) {
      setCsvError("Selecciona un archivo con extensión .csv.");
      return;
    }
    if (archivo.size > 2 * 1024 * 1024) {
      setCsvError("El CSV supera 2 MB. Divide el archivo en lotes más pequeños.");
      return;
    }
    try {
      const texto = await archivo.text();
      const nuevos = importarProductosCsv(texto, productos);
      setCsvPreview({ nombre: archivo.name, productos: nuevos });
    } catch (error: any) {
      setCsvError(error?.message || "No se pudo leer el archivo CSV.");
    }
  };

  const handleImportarCsv = async () => {
    if (!csvPreview || importandoCsv) return;
    setImportandoCsv(true);
    setCsvError("");
    try {
      // El servicio valida otra vez en Firebase los SKU y aplica un único batch.
      await firestoreService.addProductsBatch(csvPreview.productos);
      notify(`Se importaron ${csvPreview.productos.length} productos correctamente.`);
      setCsvPreview(null);
    } catch (error: any) {
      setCsvError(error?.message || "No se pudieron registrar los productos del CSV.");
    } finally {
      setImportandoCsv(false);
    }
  };

  return (
    <div id="gestion-productos-root" className="page-shell space-y-6">
      <div id="gestion-productos-header" className="page-header">
        <div>
          <p className="page-eyebrow">Inventario</p>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">Productos</h1>
          <p className="page-description">
            Administra los modelos de tu catálogo. Consulta las existencias en Inventario por drops.
          </p>
        </div>
        <div className="page-actions">
          <input
            ref={csvFileRef} type="file" accept=".csv,text/csv" className="sr-only"
            aria-label="Seleccionar archivo CSV de productos" onChange={event => void handleSeleccionCsv(event)}
          />
          <button type="button" className="btn-secondary" onClick={handleDescargarPlantilla} disabled={importandoCsv}>
            <Download className="w-4 h-4" /> Plantilla CSV
          </button>
          <button type="button" className="btn-secondary" onClick={() => csvFileRef.current?.click()} disabled={importandoCsv}>
            <FileUp className="w-4 h-4" /> Importar CSV
          </button>
          <button type="button" className="btn-secondary" onClick={() => void handleExportarCatalogo()} disabled={exportandoCsv || importandoCsv}>
            <Download className="w-4 h-4" /> {exportandoCsv ? "Exportando…" : "Exportar catálogo"}
          </button>
          <button id="btn-gestionar-catalogos" type="button" onClick={() => setIsCatalogosOpen(true)} className="btn-secondary">
            <Settings className="w-4 h-4" /> Configurar productos
          </button>
          <button id="btn-crear-producto" type="button" onClick={handleOpenCreate} className="btn-primary">
            <Plus className="w-4 h-4" /> Nuevo producto
          </button>
        </div>
      </div>

      {csvError && !csvPreview && <p role="alert" className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 p-3 text-sm text-rose-700 dark:text-rose-300">
        {csvError}
      </p>}

      <div id="gestion-productos-filters" className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <div className="relative sm:col-span-2">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="search" aria-label="Buscar productos" placeholder="Buscar por nombre, SKU o marca..."
            value={searchQuery} onChange={event => setSearchQuery(event.target.value)}
            className="w-full pl-9 pr-3.5 py-2.5 text-xs bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <select aria-label="Filtrar por marca" value={filterMarca} onChange={event => setFilterMarca(event.target.value)}
          className="w-full px-3 py-2.5 text-xs font-medium rounded-xl bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white">
          <option value="all">Todas las marcas</option>
          {opcionesMarcaFiltro.map(marca => <option key={marca} value={marca}>{marca}</option>)}
        </select>
      </div>

      <section id="gestion-productos-list" className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 uppercase tracking-wide text-[10px]">
              <tr>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Marca</th>
                <th className="px-4 py-3">Tipo de talla</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {visibles.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-zinc-500">
                  {searchQuery || filterMarca !== "all" ? "No hay productos que coincidan con los filtros." : "Aún no hay productos. Utiliza Nuevo producto para crear el primero."}
                </td></tr>
              ) : visibles.map(producto => (
                <tr key={producto.sku} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                  <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-white">{producto.nombre}</td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{producto.marca || "—"}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{etiquetaTipoTalla(producto.tipo_talla)}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-zinc-900 dark:text-white">{producto.sku}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" onClick={() => handleOpenEdit(producto)}
                        title={`Editar ${producto.nombre}`} aria-label={`Editar producto ${producto.sku}`}
                        className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => setProductToDelete(producto)}
                        title={`Enviar ${producto.nombre} a Papelera`} aria-label={`Eliminar producto ${producto.sku}`}
                        className="p-2 text-zinc-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {csvPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-label="Vista previa de importación CSV" className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-white">Importar productos desde CSV</h2>
                <p className="mt-1 text-xs text-zinc-500 break-all">{csvPreview.nombre}</p>
              </div>
              <button type="button" onClick={() => { setCsvPreview(null); setCsvError(""); }} aria-label="Cerrar importación" disabled={importandoCsv} className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white disabled:opacity-50">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <p className="text-sm font-semibold">{csvPreview.productos.length} productos nuevos listos para importar</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Se crearán únicamente SKU nuevos. No se actualizarán los existentes ni se modificarán existencias, compras o ventas.
                Se admiten hasta {MAX_PRODUCTOS_CSV} productos por archivo. La operación se guarda como un solo lote.
              </p>
              <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                <table className="w-full min-w-[520px] text-left text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-800 text-zinc-500">
                    <tr><th className="p-3">SKU</th><th className="p-3">Nombre</th><th className="p-3">Marca</th><th className="p-3">Tipo de talla</th></tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {csvPreview.productos.slice(0, 8).map(producto => (
                      <tr key={producto.sku}>
                        <td className="p-3 font-mono">{producto.sku}</td>
                        <td className="p-3">{producto.nombre}</td>
                        <td className="p-3">{producto.marca}</td>
                        <td className="p-3">{etiquetaTipoTalla(producto.tipo_talla)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {csvPreview.productos.length > 8 && <p className="text-xs text-zinc-500">Se muestran 8 de {csvPreview.productos.length} productos. Se validó el archivo completo.</p>}
              {csvError && <p role="alert" className="text-xs text-rose-600">{csvError}</p>}
            </div>
            <div className="flex justify-end gap-3 border-t border-zinc-200 dark:border-zinc-800 px-5 py-4">
              <button type="button" disabled={importandoCsv} onClick={() => { setCsvPreview(null); setCsvError(""); }} className="btn-secondary">Cancelar</button>
              <button type="button" disabled={importandoCsv} onClick={() => void handleImportarCsv()} className="btn-primary disabled:opacity-50">
                {importandoCsv ? "Importando…" : `Importar ${csvPreview.productos.length} productos`}
              </button>
            </div>
          </div>
        </div>
      )}

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl">
            <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-zinc-900 dark:text-white">{editingProduct ? "Editar producto" : "Crear nuevo producto"}</h2>
                <p className="mt-1 text-xs text-zinc-500">Las tallas específicas y el costo se registran durante la compra.</p>
              </div>
              <button type="button" onClick={handleCloseForm} disabled={loading} aria-label="Cerrar" className="p-2 text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-5">
              {generalError && <p role="alert" className="text-xs text-rose-600">{generalError}</p>}
              <div>
                <label htmlFor="producto-nombre" className="block mb-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">Nombre comercial *</label>
                <input id="producto-nombre" required maxLength={120} value={formNombre} onChange={event => setFormNombre(event.target.value)}
                  placeholder="Ej. Balenciaga Tape"
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2.5 text-zinc-900 dark:text-white" />
              </div>
              <div>
                <label htmlFor="producto-marca" className="block mb-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">Marca *</label>
                <select id="producto-marca" required value={formMarca} onChange={event => setFormMarca(event.target.value)}
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2.5 text-zinc-900 dark:text-white">
                  <option value="">Seleccionar marca</option>
                  {formMarca && !marcasActivas.some(item => item.nombre === formMarca) && <option value={formMarca}>{formMarca} (existente)</option>}
                  {marcasActivas.map(item => <option key={item.id} value={item.nombre}>{item.nombre}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="producto-tipo-talla" className="block mb-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">Tipo de talla *</label>
                <select id="producto-tipo-talla" required value={formTipoTalla} onChange={event => setFormTipoTalla(event.target.value as TipoTalla | "")}
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2.5 text-zinc-900 dark:text-white">
                  <option value="">Seleccionar tipo de talla</option>
                  {opcionesTipoTalla.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="producto-sku" className="block mb-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">SKU manual *</label>
                <input id="producto-sku" required readOnly={Boolean(editingProduct)} maxLength={128} value={formSku}
                  onChange={event => setFormSku(event.target.value.toUpperCase())} placeholder="Ej. BA-211"
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2.5 font-mono uppercase text-zinc-900 dark:text-white read-only:opacity-60" />
                <p className="mt-1 text-[11px] text-zinc-500">{editingProduct ? "El SKU no puede cambiarse porque identifica compras, ventas e inventario." : "Identificador único asignado por ti."}</p>
              </div>
              <div className="flex justify-between gap-3 border-t border-zinc-200 dark:border-zinc-800 pt-5">
                <button type="button" onClick={handleCloseForm} disabled={loading} className="btn-secondary">Cancelar</button>
                <button type="submit" disabled={loading || !formNombre.trim() || !formMarca.trim() || !formTipoTalla || !formSku.trim()} className="btn-primary disabled:opacity-50">
                  {loading ? "Guardando…" : editingProduct ? "Guardar cambios" : "Crear producto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ModalCatalogos isOpen={isCatalogosOpen} onClose={() => setIsCatalogosOpen(false)} productos={productos} />

      {productToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl space-y-4">
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">¿Enviar {productToDelete.nombre} a Papelera?</h3>
              <p className="mt-2 text-xs text-zinc-500">
                Solo se enviará el SKU {productToDelete.sku}. Se conserva el historial y no se permite retirar productos con existencias en un drop.
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" disabled={loading} onClick={() => setProductToDelete(null)} className="btn-secondary">Cancelar</button>
              <button type="button" disabled={loading} onClick={handleDelete} className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
                {loading ? "Procesando…" : "Enviar a Papelera"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
