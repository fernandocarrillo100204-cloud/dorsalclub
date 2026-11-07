/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Layers3,
  Loader2,
  PackageCheck,
  Pencil,
  Plus,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  Trash2,
  X
} from "lucide-react";
import { firestoreService } from "../lib/firebase";
import { Compra, Drop, EstadoDrop, Venta, Movimiento } from "../types";
import { useWorkspace } from "../context/WorkspaceContext";

import { calcularInventarioDrops } from "../lib/inventarioDrops";
import { searchText } from "../lib/presentation";

type DetailTab = "productos" | "ventas";
const ALL_DROPS = "__todos__";

interface ProductDropRow {
  drop_id: string;
  drop_nombre: string;
  estado: EstadoDrop;
  sku: string;
  nombre: string;
  tallas: Record<string, number>;
  compradas: number;
  vendidas: number;
  restantes: number;
  disponible: number;
  costoTotal: number;
  ventaTotal: number;
  costoPromedio: number;
  ventaPromedio: number;
  porcentajeSobreCosto: number | null;
}

const STATUS_META: Record<EstadoDrop, { label: string; className: string }> = {
  preparacion: {
    label: "Preparación",
    className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
  },
  en_venta: {
    label: "En venta",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
  },
  cerrado: {
    label: "Cerrado",
    className: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700"
  }
};

const money = (value: number) => value.toLocaleString("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const toDate = (value: any): Date => {
  if (value instanceof Date) return value;
  if (value?.toDate) return value.toDate();
  if (value?.seconds) return new Date(value.seconds * 1000);
  return new Date(value || Date.now());
};

export default function Drops({ onSell, onPurchases }: { onSell: (dropId: string, sku: string) => void; onPurchases: () => void }) {
  const { confirm } = useWorkspace();
  const [drops, setDrops] = useState<Drop[]>([]);
  const [selectedId, setSelectedId] = useState(ALL_DROPS);
  const [compras, setCompras] = useState<Compra[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [detailVersion, setDetailVersion] = useState(0);
  const [detailId, setDetailId] = useState("");
  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState("todos");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [editNombre, setEditNombre] = useState("");
  const [editDescripcion, setEditDescripcion] = useState("");
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [activeTab, setActiveTab] = useState<DetailTab>("productos");

  const selectedDrop = drops.find(item => item.id === selectedId) || null;
  const allDrops = selectedId === ALL_DROPS;
  const selectionKey = JSON.stringify(allDrops ? drops.map(item => item.id).sort() : selectedId ? [selectedId] : []);
  const scopedSaleItems = (venta: Venta) => venta.items.filter(item => allDrops
    ? drops.some(drop => drop.id === (item.drop_id || venta.drop_id))
    : (item.drop_id || venta.drop_id) === selectedId);

  const loadDrops = async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const items = await firestoreService.getDrops();
      setDrops(items);
      if (manual) setDetailVersion(value => value + 1);
      setSelectedId(current => current === ALL_DROPS || items.some(item => item.id === current) ? current : ALL_DROPS);
    } catch (err: any) {
      setError(err?.message || "No se pudieron cargar los drops.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadDrops(); }, []);

  useEffect(() => {
    let active = true;
    const ids = JSON.parse(selectionKey) as string[];
    if (!ids.length) {
      setCompras([]);
      setVentas([]);
      setMovimientos([]); setDetailId(selectionKey); setDetailLoading(false); setDetailError(null);
      return () => { active = false; };
    }
    setDetailLoading(true);
    setCompras([]); setVentas([]); setMovimientos([]); setDetailId("");
    setDetailError(null);
    (selectedId === ALL_DROPS ? firestoreService.getDropsDetail(ids) : firestoreService.getDropDetail(selectedId))
      .then(result => {
        if (!active) return;
        setDetailId(selectionKey);
        setMovimientos(result.movimientos);
        setCompras(result.compras);
        setVentas(result.ventas);
      })
      .catch((err: any) => {
        if (!active) return;
        setCompras([]);
        setVentas([]);
        setDetailError(err?.message || "No se pudo cargar el detalle del drop.");
      })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selectedId, detailVersion, selectionKey]);

  const activeSales = useMemo(() => detailId === selectionKey ? ventas.filter(item => item.estado !== "anulado" && item.estado !== "devuelto" && !item.en_papelera) : [], [ventas, detailId, selectionKey]);
  const products = useMemo<ProductDropRow[]>(() => {
    if (detailId !== selectionKey) return [];
    return calcularInventarioDrops(allDrops ? drops : selectedDrop ? [selectedDrop] : [], { compras, ventas, movimientos }).map(item => {
      const costoPromedio = item.compradas > 0 ? item.costoTotal / item.compradas : 0;
      const ventaPromedio = item.vendidas > 0 ? item.ventaTotal / item.vendidas : 0;
      return { ...item, restantes: item.saldo,
        costoPromedio, ventaPromedio,
        porcentajeSobreCosto: item.vendidas > 0 && costoPromedio > 0 ? (ventaPromedio - costoPromedio) / costoPromedio * 100 : null
      };
    });
  }, [selectionKey, detailId, compras, ventas, movimientos, allDrops, drops, selectedDrop]);
  const visibleProducts = products.filter(item => searchText(item.sku + " " + item.nombre + " " + item.drop_nombre).includes(searchText(search)) &&
    (availability === "todos" || (availability === "disponibles" && item.disponible > 0) || (availability === "agotados" && item.restantes === 0) || (availability === "revisar" && (item.restantes < 0))));
  const detailReady = !detailLoading && !detailError && detailId === selectionKey;

  const summary = useMemo(() => {
    const compradas = products.reduce((sum, item) => sum + item.compradas, 0);
    const vendidas = products.reduce((sum, item) => sum + item.vendidas, 0);
    const costo = products.reduce((sum, item) => sum + item.costoTotal, 0);
    const ventasTotal = products.reduce((sum, item) => sum + item.ventaTotal, 0);
    const costoEstimadoVendido = products.reduce((sum, item) => sum + item.costoPromedio * item.vendidas, 0);
    return {
      compradas,
      vendidas,
      restantes: compradas - vendidas,
      disponibles: products.reduce((sum, item) => sum + item.disponible, 0),
      avance: compradas > 0 ? (vendidas / compradas) * 100 : 0,
      costo,
      ventasTotal,
      porcentaje: costoEstimadoVendido > 0
        ? ((ventasTotal - costoEstimadoVendido) / costoEstimadoVendido) * 100
        : null
    };
  }, [products]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const created = await firestoreService.addDrop({ nombre, descripcion, estado: "preparacion" });
      setDrops(current => [created, ...current]);
      setSelectedId(created.id);
      setNombre("");
      setDescripcion("");
      setIsCreateOpen(false);
    } catch (err: any) {
      setError(err?.message || "No se pudo crear el drop.");
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (estado: EstadoDrop) => {
    if (!selectedDrop || selectedDrop.estado === estado) return;
    setUpdatingStatus(true);
    setDetailError(null);
    try {
      await firestoreService.updateDrop(selectedDrop.id, { estado });
      setDrops(current => current.map(item => item.id === selectedDrop.id
        ? { ...item, estado, actualizado_at: new Date() }
        : item
      ));
    } catch (err: any) {
      setDetailError(err?.message || "No se pudo cambiar el estado del drop.");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const openEdit = () => {
    if (!selectedDrop) return;
    setEditNombre(selectedDrop.nombre);
    setEditDescripcion(selectedDrop.descripcion || "");
    setIsEditOpen(true);
  };

  const handleEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedDrop) return;
    setSavingEdit(true);
    setDetailError(null);
    try {
      await firestoreService.updateDrop(selectedDrop.id, { nombre: editNombre, descripcion: editDescripcion });
      setDrops(current => current.map(item => item.id === selectedDrop.id ? { ...item, nombre: editNombre.trim(), descripcion: editDescripcion.trim() || undefined, actualizado_at: new Date() } : item));
      setIsEditOpen(false);
    } catch (err: any) {
      setDetailError(err?.message || "No se pudo editar el drop.");
    } finally {
      setSavingEdit(false);
    }
  };

  const archiveSelectedDrop = async () => {
    if (!selectedDrop || archiving) return;
    if (!(await confirm({ title: "Enviar drop a la papelera", description: `Se enviará “${selectedDrop.nombre}” a la papelera. Solo es posible si ya no tiene compras ni ventas asociadas.`, confirmLabel: "Enviar a la papelera", danger: true }))) return;
    setArchiving(true);
    setDetailError(null);
    try {
      await firestoreService.enviarDropPapelera(selectedDrop.id);
      const remaining = drops.filter(item => item.id !== selectedDrop.id);
      setDrops(remaining);
      setSelectedId(ALL_DROPS);
    } catch (err: any) {
      setDetailError(err?.message || "No se pudo enviar el drop a la Papelera.");
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="page-shell space-y-6" id="drops-page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Inventario</p>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
            Inventario por drops
          </h1>
          <p className="page-description">
            Consulta las piezas de cada drop, valida su disponibilidad y registra ventas desde aquí.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => loadDrops(true)} disabled={refreshing} className="h-10 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2 disabled:opacity-60">
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} /> Actualizar
          </button>
          <button type="button" onClick={() => setIsCreateOpen(true)} className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2">
            <Plus className="w-4 h-4" /> Nuevo drop
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> <span className="flex-1">{error}</span>
          <button type="button" onClick={() => loadDrops()} className="font-bold underline">Reintentar</button>
        </div>
      )}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total", value: drops.length, icon: Layers3 },
          { label: "Preparación", value: drops.filter(item => item.estado === "preparacion").length, icon: Boxes },
          { label: "En venta", value: drops.filter(item => item.estado === "en_venta").length, icon: TrendingUp },
          { label: "Cerrados", value: drops.filter(item => item.estado === "cerrado").length, icon: CheckCircle2 }
        ].map(card => {
          const Icon = card.icon;
          return <div key={card.label} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
            <div className="flex items-center justify-between text-zinc-400"><span className="text-[11px] font-bold uppercase tracking-wider">{card.label}</span><Icon className="w-4 h-4" /></div>
            <div className="text-2xl font-bold text-zinc-900 dark:text-white mt-2">{loading || error ? "—" : card.value}</div>
          </div>;
        })}
      </section>

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between text-xs text-zinc-500">
        <span>La disponibilidad se calcula con las entradas y ventas de cada drop. Las devoluciones recuperan las piezas; los pedidos sin stock no las descuentan.</span>
        <button type="button" onClick={onPurchases} className="btn-secondary shrink-0">Asignar compras a un drop</button>
      </div>
      {loading ? (
        <div className="min-h-72 flex items-center justify-center text-zinc-400"><Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando drops…</div>
      ) : error && drops.length === 0 ? null : drops.length === 0 ? (
        <div className="min-h-72 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 flex flex-col items-center justify-center text-center p-8">
          <Layers3 className="w-10 h-10 text-zinc-300 dark:text-zinc-600 mb-3" />
          <h2 className="font-bold text-zinc-900 dark:text-white">Aún no hay drops</h2>
          <p className="text-xs text-zinc-500 mt-1 max-w-md">Crea un drop, asocia sus compras y cámbialo a En venta cuando esté listo. Los drops no dependen de un mes.</p>
          <button type="button" onClick={() => setIsCreateOpen(true)} className="mt-4 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold">Crear primer drop</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-4 items-start">
          <aside className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
            <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-bold uppercase tracking-wider text-zinc-500">Drops</div>
            <div className="max-h-[660px] overflow-y-auto p-2 space-y-1">
              <button type="button" aria-pressed={allDrops} onClick={() => setSelectedId(ALL_DROPS)} className={`w-full rounded-xl p-3 text-left flex items-center gap-2 border ${allDrops ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/25" : "border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/60"}`}>
                <Layers3 className="w-4 h-4 text-emerald-500" /><span className="flex-1 font-bold text-xs">Todos los drops</span><ChevronRight className="w-4 h-4 text-zinc-400" />
              </button>
              {drops.map(item => (
                <button key={item.id} type="button" aria-pressed={selectedId === item.id} onClick={() => setSelectedId(item.id)} className={`w-full rounded-xl p-3 text-left flex items-center gap-2 border transition-colors ${selectedId === item.id ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/25" : "border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/60"}`}>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-xs text-zinc-900 dark:text-white truncate">{item.nombre}</p>
                    <span className={`inline-flex mt-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${STATUS_META[item.estado].className}`}>{STATUS_META[item.estado].label}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                </button>
              ))}
            </div>
          </aside>

          {(allDrops || selectedDrop) && (
            <main className="min-w-0 space-y-4">
              <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{allDrops ? "Inventario general" : selectedDrop!.nombre}</h2>
                      {selectedDrop && <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-semibold ${STATUS_META[selectedDrop.estado].className}`}>{STATUS_META[selectedDrop.estado].label}</span>}
                    </div>
                    {selectedDrop?.descripcion && <p className="text-xs text-zinc-500 mt-1">{selectedDrop.descripcion}</p>}
                    <p className="text-[11px] text-zinc-400 mt-2">{allDrops ? `${drops.length} drops` : `Creado el ${toDate(selectedDrop!.creado_at).toLocaleDateString("es-MX")}`}</p>
                  </div>
                  {selectedDrop && <div className="flex flex-wrap items-end gap-2">
                    <button type="button" onClick={openEdit} className="h-10 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold inline-flex items-center gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-800"><Pencil className="w-4 h-4" />Editar</button>
                    <div><label htmlFor="drop-status" className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">Estado</label><select id="drop-status" value={selectedDrop.estado} onChange={event => handleStatusChange(event.target.value as EstadoDrop)} disabled={updatingStatus} className="h-10 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 text-xs font-semibold text-zinc-900 dark:text-white disabled:opacity-60"><option value="preparacion">Preparación</option><option value="en_venta">En venta</option><option value="cerrado">Cerrado</option></select></div>
                    <button type="button" onClick={archiveSelectedDrop} disabled={archiving} title="Enviar a Papelera" aria-label={`Enviar ${selectedDrop.nombre} a la Papelera`} className="h-10 w-10 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 inline-flex items-center justify-center hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-50">{archiving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}</button>
                  </div>}
                </div>
              </section>

              {detailError && <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{detailError}</div>}

              <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
                {[
                  { label: "Compradas", value: `${summary.compradas} uds`, icon: Boxes },
                  { label: "Vendidas", value: `${summary.vendidas} uds`, icon: ShoppingCart },
                  { label: "Disponibles", value: `${summary.disponibles} uds`, icon: PackageCheck },
                  { label: "Avance", value: `${summary.avance.toFixed(1)}%`, icon: TrendingUp },
                  { label: "Compra mercancía", value: money(summary.costo), icon: CircleDollarSign },
                  { label: "Venta mercancía", value: money(summary.ventasTotal), icon: CircleDollarSign },
                  { label: "% sobre costo", value: summary.porcentaje === null ? "—" : `${summary.porcentaje.toFixed(1)}%`, icon: CircleDollarSign }
                ].map(card => {
                  const Icon = card.icon;
                  return <div key={card.label} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                    <Icon className="w-4 h-4 text-emerald-500" />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mt-3">{card.label}</p>
                    <p className="text-lg font-bold text-zinc-900 dark:text-white mt-1">{!detailReady ? "—" : card.value}</p>
                  </div>;
                })}
              </section>

              <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
                <div className="px-4 pt-3 border-b border-zinc-200 dark:border-zinc-800 flex gap-1">
                  <button type="button" onClick={() => setActiveTab("productos")} className={`px-4 py-2.5 text-xs font-bold border-b-2 ${activeTab === "productos" ? "border-emerald-500 text-emerald-600 dark:text-emerald-400" : "border-transparent text-zinc-500"}`}>Productos ({products.length})</button>
                  <button type="button" onClick={() => setActiveTab("ventas")} className={`px-4 py-2.5 text-xs font-bold border-b-2 ${activeTab === "ventas" ? "border-emerald-500 text-emerald-600 dark:text-emerald-400" : "border-transparent text-zinc-500"}`}>Ventas relacionadas ({activeSales.length})</button>
                </div>

                {detailError ? <div className="p-8 text-center"><p className="text-sm text-rose-500">No se pudo validar el inventario.</p><button type="button" onClick={() => setDetailVersion(value => value + 1)} className="btn-secondary mt-3">Reintentar</button></div> : !detailReady ? (
                  <div className="h-56 flex items-center justify-center text-zinc-400 text-xs"><Loader2 className="w-5 h-5 animate-spin mr-2" />Cargando registros reales…</div>
                ) : activeTab === "productos" ? (
                  products.length === 0 ? <div className="p-10 text-center text-xs text-zinc-500">No hay productos registrados en esta selección.</div> :
                  <div>
                    <div className="flex flex-col sm:flex-row gap-2 p-3"><input aria-label="Buscar producto, SKU o drop" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por producto, SKU o drop" className="min-w-0 flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-transparent px-3 py-2 text-xs" /><select aria-label="Filtrar disponibilidad" value={availability} onChange={event => setAvailability(event.target.value)} className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-xs"><option value="todos">Todos los productos</option><option value="disponibles">Disponibles</option><option value="agotados">Agotados</option><option value="revisar">Por revisar</option></select></div>
                    <div className="overflow-x-auto"><table className="w-full text-left text-xs">
                      <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-[10px] uppercase tracking-wider text-zinc-500">
                        <tr><th className="px-4 py-3">Producto</th>{allDrops && <th className="px-3 py-3">Drop</th>}<th className="px-3 py-3 text-center">Compradas</th><th className="px-3 py-3 text-center">Vendidas</th><th className="px-3 py-3 text-center">Saldo del drop</th><th className="px-3 py-3 text-center">Disponibles</th><th className="px-3 py-3 text-right">Precio compra prom.</th><th className="px-3 py-3 text-right">Precio venta prom.</th><th className="px-4 py-3 text-right">% sobre costo</th><th className="px-3 py-3">Acción</th></tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {visibleProducts.map(item => <tr key={JSON.stringify([item.drop_id, item.sku])} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30">
                          <td className="px-4 py-3"><p className="font-bold text-zinc-900 dark:text-white">{item.nombre}</p><p className="font-mono text-[10px] text-zinc-400 mt-0.5">{item.sku}</p>{Object.keys(item.tallas).length > 0 && <p className="text-[10px] mt-1 text-zinc-500">Tallas: {Object.entries(item.tallas).map(([size, quantity]) => `${size}: ${quantity}`).join(" · ")}</p>}</td>
                          {allDrops && <td className="px-3 py-3"><button type="button" className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline text-left" onClick={() => setSelectedId(item.drop_id)}>{item.drop_nombre}</button></td>}
                          <td className="px-3 py-3 text-center font-semibold">{item.compradas}</td><td className="px-3 py-3 text-center font-semibold text-emerald-600 dark:text-emerald-400">{item.vendidas}</td><td className="px-3 py-3 text-center font-semibold">{item.restantes}</td><td className="px-3 py-3 text-center"><strong className="text-emerald-600 dark:text-emerald-400">{item.disponible}</strong>{item.restantes < 0 ? <p className="text-[10px] text-amber-600">Revisar existencias</p> : item.estado !== "en_venta" ? <p className="text-[10px] text-zinc-500">{STATUS_META[item.estado].label}</p> : item.disponible === 0 ? <p className="text-[10px] text-zinc-500">Agotado</p> : null}</td>
                          <td className="px-3 py-3 text-right font-mono">{item.compradas ? money(item.costoPromedio) : "—"}</td><td className="px-3 py-3 text-right font-mono">{item.vendidas ? money(item.ventaPromedio) : "—"}</td>
                          <td className="px-4 py-3 text-right"><span className={`font-bold ${item.porcentajeSobreCosto === null ? "text-zinc-400" : item.porcentajeSobreCosto >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{item.porcentajeSobreCosto === null ? "—" : `${item.porcentajeSobreCosto.toFixed(1)}%`}</span></td>
                          <td className="px-3 py-3"><button type="button" onClick={() => onSell(item.drop_id, item.sku)} disabled={item.disponible <= 0} className="btn-secondary text-xs" aria-label={`Vender ${item.nombre} del drop ${item.drop_nombre}`}>Vender</button></td>
                        </tr>)}
                      </tbody>
                    </table></div>
                    {visibleProducts.length === 0 && <p className="p-8 text-center text-xs text-zinc-500">No hay productos que coincidan con los filtros.</p>}
                  </div>
                ) : (
                  activeSales.length === 0 ? <div className="p-10 text-center text-xs text-zinc-500">No hay ventas relacionadas con esta selección.</div> :
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-[10px] uppercase tracking-wider text-zinc-500"><tr><th className="px-4 py-3">Folio</th><th className="px-3 py-3">Fecha</th><th className="px-3 py-3">Cliente</th><th className="px-3 py-3">Canal</th><th className="px-3 py-3 text-center">Unidades</th><th className="px-4 py-3 text-right">Total mercancía</th></tr></thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">{[...activeSales].sort((a, b) => toDate(b.fecha).getTime() - toDate(a.fecha).getTime()).map(venta => <tr key={venta.id}><td className="px-4 py-3 font-mono font-bold">{venta.folio}</td><td className="px-3 py-3 text-zinc-500">{toDate(venta.fecha).toLocaleDateString("es-MX")}</td><td className="px-3 py-3 font-semibold">{venta.cliente_nombre}</td><td className="px-3 py-3">{venta.canal_venta_nombre}</td><td className="px-3 py-3 text-center font-bold">{scopedSaleItems(venta).reduce((sum, item) => sum + item.cantidad, 0)}</td><td className="px-4 py-3 text-right font-mono font-bold">{money(scopedSaleItems(venta).reduce((sum, item) => sum + item.precio_unitario * item.cantidad, 0))}</td></tr>)}</tbody>
                    </table>
                  </div>
                )}
                <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/30 text-[10px] text-zinc-500">
                  % sobre costo = (precio promedio de venta − costo promedio de compra) ÷ costo promedio de compra. No representa utilidad contable.
                </div>
              </section>
            </main>
          )}
        </div>
      )}

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="new-drop-title">
          <form onSubmit={handleCreate} className="w-full max-w-lg rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between"><div><h2 id="new-drop-title" className="font-bold text-zinc-900 dark:text-white">Nuevo drop</h2><p className="text-xs text-zinc-500 mt-0.5">No está ligado a un mes ni requiere fecha de cierre.</p></div><button type="button" onClick={() => setIsCreateOpen(false)} aria-label="Cerrar" className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"><X className="w-4 h-4" /></button></div>
            <div className="p-5 space-y-4">
              <div><label htmlFor="drop-name" className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">Nombre *</label><input id="drop-name" required maxLength={100} value={nombre} onChange={event => setNombre(event.target.value)} placeholder="Ej. Drop 3 — Streetwear" className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div>
              <div><label htmlFor="drop-description" className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">Descripción (Opcional)</label><textarea id="drop-description" maxLength={500} rows={3} value={descripcion} onChange={event => setDescripcion(event.target.value)} placeholder="Notas internas sobre este pedido o lanzamiento" className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" /></div>
              <p className="text-[11px] text-zinc-500">Se creará en estado <strong>Preparación</strong>. Cuando estés listo para registrar ventas, cámbialo a <strong>En venta</strong>.</p>
            </div>
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2"><button type="button" onClick={() => setIsCreateOpen(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-300">Cancelar</button><button type="submit" disabled={creating || !nombre.trim()} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-2">{creating && <Loader2 className="w-4 h-4 animate-spin" />} Crear drop</button></div>
          </form>
        </div>
      )}

      {isEditOpen && selectedDrop && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="edit-drop-title">
          <form onSubmit={handleEdit} className="w-full max-w-lg rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between"><h2 id="edit-drop-title" className="font-bold text-zinc-900 dark:text-white">Editar drop</h2><button type="button" onClick={() => setIsEditOpen(false)} aria-label="Cerrar" className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"><X className="w-4 h-4" /></button></div>
            <div className="p-5 space-y-4">
              <div><label htmlFor="edit-drop-name" className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">Nombre *</label><input id="edit-drop-name" required maxLength={100} value={editNombre} onChange={event => setEditNombre(event.target.value)} className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div>
              <div><label htmlFor="edit-drop-description" className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">Descripción (Opcional)</label><textarea id="edit-drop-description" maxLength={500} rows={3} value={editDescripcion} onChange={event => setEditDescripcion(event.target.value)} className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" /></div>
            </div>
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2"><button type="button" onClick={() => setIsEditOpen(false)} className="px-4 py-2 rounded-xl text-xs font-semibold">Cancelar</button><button type="submit" disabled={savingEdit || !editNombre.trim()} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-50 inline-flex items-center gap-2">{savingEdit && <Loader2 className="w-4 h-4 animate-spin" />}Guardar cambios</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
