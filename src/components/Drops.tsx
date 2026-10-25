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
  Plus,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  X
} from "lucide-react";
import { firestoreService } from "../lib/firebase";
import { Compra, Drop, EstadoDrop, Venta } from "../types";

type DetailTab = "productos" | "ventas";

interface ProductDropRow {
  sku: string;
  nombre: string;
  compradas: number;
  vendidas: number;
  restantes: number;
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

export default function Drops() {
  const [drops, setDrops] = useState<Drop[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [compras, setCompras] = useState<Compra[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [activeTab, setActiveTab] = useState<DetailTab>("productos");

  const selectedDrop = drops.find(item => item.id === selectedId) || null;

  const loadDrops = async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const items = await firestoreService.getDrops();
      setDrops(items);
      setSelectedId(current => current && items.some(item => item.id === current) ? current : items[0]?.id || "");
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
    if (!selectedId) {
      setCompras([]);
      setVentas([]);
      return () => { active = false; };
    }
    setDetailLoading(true);
    setDetailError(null);
    firestoreService.getDropDetail(selectedId)
      .then(result => {
        if (!active) return;
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
  }, [selectedId]);

  const activePurchases = useMemo(() => compras.filter(item =>
    (item.estado || "completada") !== "anulada" && item.en_papelera !== true
  ), [compras]);

  const activeSales = useMemo(() => ventas.filter(item =>
    item.estado !== "anulado" && item.estado !== "devuelto" && item.en_papelera !== true
  ), [ventas]);

  const products = useMemo<ProductDropRow[]>(() => {
    const map = new Map<string, ProductDropRow>();
    activePurchases.forEach(compra => {
      compra.items.forEach(item => {
        const sku = String(item.sku || "").trim().toUpperCase();
        if (!sku) return;
        const current = map.get(sku) || {
          sku,
          nombre: item.nombre_producto || sku,
          compradas: 0,
          vendidas: 0,
          restantes: 0,
          costoTotal: 0,
          ventaTotal: 0,
          costoPromedio: 0,
          ventaPromedio: 0,
          porcentajeSobreCosto: null
        };
        current.nombre = item.nombre_producto || current.nombre;
        current.compradas += Number(item.cantidad) || 0;
        current.costoTotal += (Number(item.costo_unitario) || 0) * (Number(item.cantidad) || 0);
        map.set(sku, current);
      });
    });
    activeSales.forEach(venta => {
      venta.items.forEach(item => {
        const sku = String(item.sku || "").trim().toUpperCase();
        if (!sku) return;
        const current = map.get(sku) || {
          sku,
          nombre: sku,
          compradas: 0,
          vendidas: 0,
          restantes: 0,
          costoTotal: 0,
          ventaTotal: 0,
          costoPromedio: 0,
          ventaPromedio: 0,
          porcentajeSobreCosto: null
        };
        current.vendidas += Number(item.cantidad) || 0;
        current.ventaTotal += (Number(item.precio_unitario) || 0) * (Number(item.cantidad) || 0);
        map.set(sku, current);
      });
    });
    return [...map.values()].map(item => {
      const costoPromedio = item.compradas > 0 ? item.costoTotal / item.compradas : 0;
      const ventaPromedio = item.vendidas > 0 ? item.ventaTotal / item.vendidas : 0;
      return {
        ...item,
        restantes: Math.max(0, item.compradas - item.vendidas),
        costoPromedio,
        ventaPromedio,
        porcentajeSobreCosto: item.vendidas > 0 && costoPromedio > 0
          ? ((ventaPromedio - costoPromedio) / costoPromedio) * 100
          : null
      };
    }).sort((a, b) => b.vendidas - a.vendidas || a.nombre.localeCompare(b.nombre, "es"));
  }, [activePurchases, activeSales]);

  const summary = useMemo(() => {
    const compradas = products.reduce((sum, item) => sum + item.compradas, 0);
    const vendidas = products.reduce((sum, item) => sum + item.vendidas, 0);
    const costo = products.reduce((sum, item) => sum + item.costoTotal, 0);
    const ventasTotal = products.reduce((sum, item) => sum + item.ventaTotal, 0);
    const costoEstimadoVendido = products.reduce((sum, item) => sum + item.costoPromedio * item.vendidas, 0);
    return {
      compradas,
      vendidas,
      restantes: Math.max(0, compradas - vendidas),
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

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5" id="drops-page">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
            <Layers3 className="w-6 h-6 text-emerald-500" /> Drops
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Sigue compras, inventario y ventas por pedido comercial, sin ligarlo a un mes.
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
            <div className="text-2xl font-bold text-zinc-900 dark:text-white mt-2">{loading ? "—" : card.value}</div>
          </div>;
        })}
      </section>

      {loading ? (
        <div className="min-h-72 flex items-center justify-center text-zinc-400"><Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando drops…</div>
      ) : drops.length === 0 ? (
        <div className="min-h-72 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 flex flex-col items-center justify-center text-center p-8">
          <Layers3 className="w-10 h-10 text-zinc-300 dark:text-zinc-600 mb-3" />
          <h2 className="font-bold text-zinc-900 dark:text-white">Aún no hay drops</h2>
          <p className="text-xs text-zinc-500 mt-1 max-w-md">Crea el primero y después relaciónalo desde una compra o una venta. No necesita fechas de inicio o fin.</p>
          <button type="button" onClick={() => setIsCreateOpen(true)} className="mt-4 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold">Crear primer drop</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-4 items-start">
          <aside className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
            <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-bold uppercase tracking-wider text-zinc-500">Todos los drops</div>
            <div className="max-h-[660px] overflow-y-auto p-2 space-y-1">
              {drops.map(item => (
                <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`w-full rounded-xl p-3 text-left flex items-center gap-2 border transition-colors ${selectedId === item.id ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/25" : "border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/60"}`}>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-xs text-zinc-900 dark:text-white truncate">{item.nombre}</p>
                    <span className={`inline-flex mt-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${STATUS_META[item.estado].className}`}>{STATUS_META[item.estado].label}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                </button>
              ))}
            </div>
          </aside>

          {selectedDrop && (
            <main className="min-w-0 space-y-4">
              <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{selectedDrop.nombre}</h2>
                      <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-semibold ${STATUS_META[selectedDrop.estado].className}`}>{STATUS_META[selectedDrop.estado].label}</span>
                    </div>
                    {selectedDrop.descripcion && <p className="text-xs text-zinc-500 mt-1">{selectedDrop.descripcion}</p>}
                    <p className="text-[11px] text-zinc-400 mt-2">Creado el {toDate(selectedDrop.creado_at).toLocaleDateString("es-MX")}</p>
                  </div>
                  <div>
                    <label htmlFor="drop-status" className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">Estado</label>
                    <select id="drop-status" value={selectedDrop.estado} onChange={event => handleStatusChange(event.target.value as EstadoDrop)} disabled={updatingStatus} className="h-10 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 text-xs font-semibold text-zinc-900 dark:text-white disabled:opacity-60">
                      <option value="preparacion">Preparación</option>
                      <option value="en_venta">En venta</option>
                      <option value="cerrado">Cerrado</option>
                    </select>
                  </div>
                </div>
              </section>

              {detailError && <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{detailError}</div>}

              <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
                {[
                  { label: "Compradas", value: `${summary.compradas} uds`, icon: Boxes },
                  { label: "Vendidas", value: `${summary.vendidas} uds`, icon: ShoppingCart },
                  { label: "Restantes", value: `${summary.restantes} uds`, icon: PackageCheck },
                  { label: "Avance", value: `${summary.avance.toFixed(1)}%`, icon: TrendingUp },
                  { label: "Compra mercancía", value: money(summary.costo), icon: CircleDollarSign },
                  { label: "Venta mercancía", value: money(summary.ventasTotal), icon: CircleDollarSign },
                  { label: "% sobre costo", value: summary.porcentaje === null ? "—" : `${summary.porcentaje.toFixed(1)}%`, icon: CircleDollarSign }
                ].map(card => {
                  const Icon = card.icon;
                  return <div key={card.label} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                    <Icon className="w-4 h-4 text-emerald-500" />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mt-3">{card.label}</p>
                    <p className="text-lg font-bold text-zinc-900 dark:text-white mt-1">{detailLoading ? "—" : card.value}</p>
                  </div>;
                })}
              </section>

              <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
                <div className="px-4 pt-3 border-b border-zinc-200 dark:border-zinc-800 flex gap-1">
                  <button type="button" onClick={() => setActiveTab("productos")} className={`px-4 py-2.5 text-xs font-bold border-b-2 ${activeTab === "productos" ? "border-emerald-500 text-emerald-600 dark:text-emerald-400" : "border-transparent text-zinc-500"}`}>Productos ({products.length})</button>
                  <button type="button" onClick={() => setActiveTab("ventas")} className={`px-4 py-2.5 text-xs font-bold border-b-2 ${activeTab === "ventas" ? "border-emerald-500 text-emerald-600 dark:text-emerald-400" : "border-transparent text-zinc-500"}`}>Ventas relacionadas ({activeSales.length})</button>
                </div>

                {detailLoading ? (
                  <div className="h-56 flex items-center justify-center text-zinc-400 text-xs"><Loader2 className="w-5 h-5 animate-spin mr-2" />Cargando registros reales…</div>
                ) : activeTab === "productos" ? (
                  products.length === 0 ? <div className="p-10 text-center text-xs text-zinc-500">Este drop todavía no tiene compras ni ventas relacionadas.</div> :
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-[10px] uppercase tracking-wider text-zinc-500">
                        <tr><th className="px-4 py-3">Producto</th><th className="px-3 py-3 text-center">Compradas</th><th className="px-3 py-3 text-center">Vendidas</th><th className="px-3 py-3 text-center">Restantes</th><th className="px-3 py-3 text-right">Precio compra prom.</th><th className="px-3 py-3 text-right">Precio venta prom.</th><th className="px-4 py-3 text-right">% sobre costo</th></tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {products.map(item => <tr key={item.sku} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30">
                          <td className="px-4 py-3"><p className="font-bold text-zinc-900 dark:text-white">{item.nombre}</p><p className="font-mono text-[10px] text-zinc-400 mt-0.5">{item.sku}</p></td>
                          <td className="px-3 py-3 text-center font-semibold">{item.compradas}</td><td className="px-3 py-3 text-center font-semibold text-emerald-600 dark:text-emerald-400">{item.vendidas}</td><td className="px-3 py-3 text-center font-semibold">{item.restantes}</td>
                          <td className="px-3 py-3 text-right font-mono">{item.compradas ? money(item.costoPromedio) : "—"}</td><td className="px-3 py-3 text-right font-mono">{item.vendidas ? money(item.ventaPromedio) : "—"}</td>
                          <td className="px-4 py-3 text-right"><span className={`font-bold ${item.porcentajeSobreCosto === null ? "text-zinc-400" : item.porcentajeSobreCosto >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{item.porcentajeSobreCosto === null ? "—" : `${item.porcentajeSobreCosto.toFixed(1)}%`}</span></td>
                        </tr>)}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  activeSales.length === 0 ? <div className="p-10 text-center text-xs text-zinc-500">Todavía no hay ventas relacionadas con este drop.</div> :
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-[10px] uppercase tracking-wider text-zinc-500"><tr><th className="px-4 py-3">Folio</th><th className="px-3 py-3">Fecha</th><th className="px-3 py-3">Cliente</th><th className="px-3 py-3">Canal</th><th className="px-3 py-3 text-center">Unidades</th><th className="px-4 py-3 text-right">Total mercancía</th></tr></thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">{activeSales.sort((a, b) => toDate(b.fecha).getTime() - toDate(a.fecha).getTime()).map(venta => <tr key={venta.id}><td className="px-4 py-3 font-mono font-bold">{venta.folio}</td><td className="px-3 py-3 text-zinc-500">{toDate(venta.fecha).toLocaleDateString("es-MX")}</td><td className="px-3 py-3 font-semibold">{venta.cliente_nombre}</td><td className="px-3 py-3">{venta.canal_venta_nombre}</td><td className="px-3 py-3 text-center font-bold">{venta.total_unidades}</td><td className="px-4 py-3 text-right font-mono font-bold">{money(venta.subtotal)}</td></tr>)}</tbody>
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
              <div><label htmlFor="drop-name" className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">Nombre *</label><input id="drop-name" required maxLength={100} value={nombre} onChange={event => setNombre(event.target.value)} placeholder="Ej. Drop 3 — Octubre" className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div>
              <div><label htmlFor="drop-description" className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">Descripción (Opcional)</label><textarea id="drop-description" maxLength={500} rows={3} value={descripcion} onChange={event => setDescripcion(event.target.value)} placeholder="Notas internas sobre este pedido o lanzamiento" className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" /></div>
              <p className="text-[11px] text-zinc-500">Se creará en estado <strong>Preparación</strong>. Cuando estés listo para registrar ventas, cámbialo a <strong>En venta</strong>.</p>
            </div>
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2"><button type="button" onClick={() => setIsCreateOpen(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-300">Cancelar</button><button type="submit" disabled={creating || !nombre.trim()} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-2">{creating && <Loader2 className="w-4 h-4 animate-spin" />} Crear drop</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
