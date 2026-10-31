/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  Loader2,
  Package,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  User,
  WalletCards
} from "lucide-react";
import { firestoreService } from "../lib/firebase";
import { mensajeError } from "../lib/errores";
import { Almacen, Cliente, Drop, Movimiento, Producto, Venta, getSubtotalVenta } from "../types";

interface HistorialVentasProps {
  almacenes: Almacen[];
  productos: Producto[];
  preselectedClienteId?: string;
  onNavigateToCliente?: (clienteId: string) => void;
}

interface VentaAgrupada {
  key: string;
  principal: Movimiento;
  items: Movimiento[];
  fecha: Date;
  folio: string;
  clienteId?: string;
  clienteNombre: string;
  canal: string;
  estado: "activo" | "anulado" | "devuelto";
  estadoPago: "pagado" | "anticipo" | "pendiente";
  unidades: number;
  total: number;
  recibido: number;
  saldo: number;
  master: boolean;
  dropId?: string;
}

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2
});

const asDate = (value: Movimiento["fecha"]): Date => {
  if (value instanceof Date) return value;
  if (value && typeof (value as any).toDate === "function") return (value as any).toDate();
  if (value && typeof (value as any).seconds === "number") return new Date((value as any).seconds * 1000);
  return new Date();
};

const isSaleItem = (movimiento: Movimiento): boolean =>
  movimiento.tipo === "salida" &&
  movimiento.subtipo !== "abono_venta" &&
  movimiento.subtipo !== "seguimiento_pedido" &&
  movimiento.subtipo !== "reembolso_venta" &&
  movimiento.sku?.trim().toUpperCase() !== "ABONO";

export default function HistorialVentas({
  almacenes,
  productos,
  preselectedClienteId = "",
  onNavigateToCliente
}: HistorialVentasProps) {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [ventasMaestras, setVentasMaestras] = useState<Venta[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [drops, setDrops] = useState<Drop[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);
  const [masterLastDoc, setMasterLastDoc] = useState<any>(null);
  const [masterHasMore, setMasterHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [clienteFilter, setClienteFilter] = useState(preselectedClienteId || "all");
  const [canalFilter, setCanalFilter] = useState("all");
  const [estadoFilter, setEstadoFilter] = useState("all");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [ventaToCancel, setVentaToCancel] = useState<VentaAgrupada | null>(null);
  const [ventaToReturn, setVentaToReturn] = useState<VentaAgrupada | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    if (preselectedClienteId) setClienteFilter(preselectedClienteId);
  }, [preselectedClienteId]);

  useEffect(() => {
    let active = true;
    firestoreService.getClientes()
      .then((items) => {
        if (active) setClientes(items);
      })
      .catch(() => {
        if (active) setClientes([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    firestoreService.getDrops().then(setDrops).catch(() => setDrops([]));
  }, []);

  const loadFirstPage = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    try {
      const [result, masterResult] = await Promise.all([
        firestoreService.getMovimientosPaginated({ pageSize: 100, tipoFilter: "salida" }),
        firestoreService.getVentasMaestrasPaginated({ pageSize: 50 })
      ]);
      if (request !== requestRef.current) return;
      setMovimientos(result.items);
      setVentasMaestras(masterResult.items);
      setLastDoc(result.lastDoc);
      setHasMore(result.hasMore);
      setMasterLastDoc(masterResult.lastDoc);
      setMasterHasMore(masterResult.hasMore);
    } catch (loadError) {
      if (request !== requestRef.current) return;
      console.error("Error al cargar el historial de ventas:", loadError);
      setMovimientos([]);
      setVentasMaestras([]);
      setLastDoc(null);
      setHasMore(false);
      setMasterLastDoc(null);
      setMasterHasMore(false);
      setError(mensajeError(loadError, "No se pudo cargar el historial de ventas."));
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFirstPage();
    return () => { requestRef.current += 1; };
  }, [loadFirstPage]);

  const loadMore = async () => {
    if ((!hasMore && !masterHasMore) || loadingMore || loading) return;
    const request = requestRef.current;
    setLoadingMore(true);
    setError(null);
    try {
      const [legacyResult, masterResult] = await Promise.all([
        hasMore && lastDoc ? firestoreService.getMovimientosPaginated({ pageSize: 100, lastDoc, tipoFilter: "salida" }) : Promise.resolve(null),
        masterHasMore && masterLastDoc ? firestoreService.getVentasMaestrasPaginated({ pageSize: 50, lastDoc: masterLastDoc }) : Promise.resolve(null)
      ]);
      if (request !== requestRef.current) return;
      if (legacyResult) {
        setMovimientos((current) => {
          const byId = new Map(current.map((item) => [item.id, item]));
          legacyResult.items.forEach((item) => byId.set(item.id, item));
          return Array.from(byId.values());
        });
        setLastDoc(legacyResult.lastDoc);
        setHasMore(legacyResult.hasMore);
      }
      if (masterResult) {
        setVentasMaestras(current => {
          const byId = new Map(current.map(item => [item.id, item]));
          masterResult.items.forEach(item => byId.set(item.id, item));
          return Array.from(byId.values());
        });
        setMasterLastDoc(masterResult.lastDoc);
        setMasterHasMore(masterResult.hasMore);
      }
    } catch (loadError) {
      if (request !== requestRef.current) return;
      console.error("Error al cargar más ventas:", loadError);
      setError(mensajeError(loadError, "No se pudieron cargar ventas anteriores."));
    } finally {
      if (request === requestRef.current) setLoadingMore(false);
    }
  };

  const ventas = useMemo<VentaAgrupada[]>(() => {
    const masterIds = new Set(ventasMaestras.map(item => item.id));
    const groups = new Map<string, Movimiento[]>();
    movimientos.filter(item => isSaleItem(item) && (!item.venta_id || !masterIds.has(item.venta_id))).forEach((movimiento) => {
      const key = movimiento.venta_id || movimiento.folio || movimiento.id || `${asDate(movimiento.fecha).getTime()}-${movimiento.sku}`;
      const current = groups.get(key) || [];
      current.push(movimiento);
      groups.set(key, current);
    });

    const legacy = Array.from(groups.entries()).map(([key, rawItems]) => {
      const items = [...rawItems].sort((a, b) => (a.venta_partida || 1) - (b.venta_partida || 1));
      const principal = items[0];
      const subtotal = typeof principal.venta_subtotal === "number"
        ? principal.venta_subtotal
        : items.reduce((sum, item) => sum + getSubtotalVenta(item), 0);
      const total = typeof principal.venta_total_cobrado === "number"
        ? principal.venta_total_cobrado
        : typeof principal.total_cobrado === "number"
          ? principal.total_cobrado
          : subtotal + (principal.envio_cobrado_cliente || 0) + (principal.otros_cargos_cliente || 0);
      const recibido = typeof principal.venta_total_recibido === "number"
        ? principal.venta_total_recibido
        : typeof principal.ingreso_reconocido === "number"
          ? principal.ingreso_reconocido
          : total;
      const pagosPosteriores = movimientos
        .filter(item => item.venta_relacionada_id === key && item.subtipo === "abono_venta" && item.estado !== "anulado")
        .reduce((sum, item) => sum + Math.max(0, Number(item.ingreso_reconocido) || 0), 0);
      const recibidoActual = Math.min(total, recibido + pagosPosteriores);
      const saldo = Math.max(total - recibidoActual, 0);
      const estadoPago = saldo > 0 ? (recibidoActual > 0 ? "anticipo" : "pendiente") : "pagado";

      return {
        key,
        principal,
        items,
        fecha: asDate(principal.fecha),
        folio: principal.folio || key,
        clienteId: principal.cliente_id,
        clienteNombre: principal.cliente_nombre || "Venta sin cliente / Mostrador",
        canal: principal.canal_venta_nombre || principal.canal_venta || "Venta directa",
        estado: items.every((item) => item.estado === "anulado") ? "anulado" : "activo",
        estadoPago,
        unidades: items.reduce((sum, item) => sum + (Number(item.cantidad) || 0), 0),
        total,
        recibido: recibidoActual,
        saldo,
        master: false,
        dropId: principal.drop_id
      };
    });

    const masters: VentaAgrupada[] = ventasMaestras.map(venta => {
      const fecha = venta.fecha instanceof Date ? venta.fecha : new Date(venta.fecha.seconds * 1000);
      const items: Movimiento[] = venta.items.map((item, index) => ({
        id: `${venta.id}_${index + 1}`,
        folio: venta.folio,
        venta_id: venta.id,
        venta_partida: index + 1,
        venta_total_partidas: venta.items.length,
        sku: item.sku,
        almacen_id: item.almacen_id,
        tipo: "salida",
        cantidad: item.cantidad,
        referencia: venta.folio,
        usuario: venta.creado_por,
        fecha,
        estado: venta.estado === "anulado" ? "anulado" : venta.estado === "devuelto" ? "devuelto" : "activo",
        cliente_id: venta.cliente_id,
        cliente_nombre: venta.cliente_nombre,
        canal_venta: venta.canal_venta,
        canal_venta_nombre: venta.canal_venta_nombre,
        afecta_stock: venta.afecta_stock,
        precio_unitario_venta: item.precio_unitario,
        costo_unitario_venta: item.costo_unitario,
        total_venta: item.total,
        comentarios_venta: venta.comentarios
      }));
      return {
        key: venta.id,
        principal: items[0],
        items,
        fecha,
        folio: venta.folio,
        clienteId: venta.cliente_id,
        clienteNombre: venta.cliente_nombre,
        canal: venta.canal_venta_nombre,
        estado: venta.estado === "anulado" ? "anulado" : venta.estado === "devuelto" ? "devuelto" : "activo",
        estadoPago: venta.estado_pago,
        unidades: venta.total_unidades,
        total: venta.total,
        recibido: venta.recibido,
        saldo: venta.saldo,
        master: true,
        dropId: venta.drop_id
      };
    });

    return [...masters, ...legacy].sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  }, [movimientos, ventasMaestras]);

  const canales = useMemo<string[]>(
    () => Array.from(new Set<string>(ventas.map((venta) => venta.canal))).sort((a, b) => a.localeCompare(b, "es")),
    [ventas]
  );

  const filteredVentas = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es");
    return ventas.filter((venta) => {
      if (clienteFilter === "mostrador" && venta.clienteId) return false;
      if (clienteFilter !== "all" && clienteFilter !== "mostrador" && venta.clienteId !== clienteFilter) return false;
      if (canalFilter !== "all" && venta.canal !== canalFilter) return false;
      if (estadoFilter !== "all" && venta.estado !== estadoFilter) return false;
      if (!term) return true;
      return [
        venta.folio,
        venta.clienteNombre,
        venta.canal,
        ...venta.items.flatMap((item) => {
          const product = productos.find((candidate) => candidate.sku === item.sku);
          return [item.sku, product?.nombre || ""];
        })
      ].some((value) => value.toLocaleLowerCase("es").includes(term));
    });
  }, [ventas, clienteFilter, canalFilter, estadoFilter, search, productos]);

  const productName = (sku: string) => productos.find((product) => product.sku === sku)?.nombre || sku;
  const warehouseName = (id: string) => almacenes.find((warehouse) => warehouse.id === id)?.nombre || "Almacén no disponible";

  const cancelSale = async () => {
    if (!ventaToCancel || (!ventaToCancel.master && !ventaToCancel.principal?.id) || !cancelReason.trim()) return;
    setProcessingId(ventaToCancel.key);
    setError(null);
    try {
      await firestoreService.anularVentaAgrupada(ventaToCancel.key, cancelReason.trim());
      if (ventaToCancel.master) {
        setVentasMaestras(current => current.map(item => item.id === ventaToCancel.key ? { ...item, estado: "anulado", motivo_anulacion: cancelReason.trim(), anulado_at: new Date() } : item));
      } else {
        setMovimientos((current) => current.map((item) => item.venta_id === ventaToCancel.key || item.id === ventaToCancel.principal.id ? { ...item, estado: "anulado", motivo_anulacion: cancelReason.trim(), anulado_at: new Date() } : item));
      }
      setSuccess(`La venta ${ventaToCancel.folio} fue anulada y su inventario se revirtió.`);
      setVentaToCancel(null);
      setCancelReason("");
    } catch (cancelError: any) {
      setError(cancelError?.message || "No se pudo anular la venta.");
    } finally {
      setProcessingId(null);
    }
  };

  const archiveSale = async (venta: VentaAgrupada) => {
    if (!venta.master && !venta.principal?.id) return;
    if (!window.confirm(`¿Enviar la venta ${venta.folio} a la Papelera? Podrás restaurarla después.`)) return;
    setProcessingId(venta.key);
    setError(null);
    try {
      await firestoreService.enviarVentaPapelera(venta.key);
      setVentasMaestras(current => current.filter(item => item.id !== venta.key));
      setMovimientos((current) => current.filter((item) => item.venta_id !== venta.key));
      setSuccess(`La venta ${venta.folio} se envió a la Papelera.`);
    } catch (archiveError: any) {
      setError(archiveError?.message || "No se pudo enviar la venta a la Papelera.");
    } finally {
      setProcessingId(null);
    }
  };

  const returnSale = async () => {
    if (!ventaToReturn || !returnReason.trim()) return;
    setProcessingId(ventaToReturn.key);
    setError(null);
    try {
      await firestoreService.devolverVentaCompleta(ventaToReturn.key, returnReason.trim());
      setVentasMaestras(current => current.map(item => item.id === ventaToReturn.key ? { ...item, estado: "devuelto", saldo: 0, monto_reembolsado: item.recibido, motivo_devolucion: returnReason.trim(), devuelto_at: new Date() } : item));
      setSuccess(`La venta ${ventaToReturn.folio} fue devuelta, el stock se reintegró y el reembolso quedó registrado.`);
      setVentaToReturn(null);
      setReturnReason("");
    } catch (returnError: any) {
      setError(returnError?.message || "No se pudo registrar la devolución.");
    } finally {
      setProcessingId(null);
    }
  };

  const updateSaleDrop = async (venta: VentaAgrupada, nextDropId: string) => {
    if (!venta.master) return;
    setProcessingId(venta.key);
    setError(null);
    setSuccess(null);
    try {
      await firestoreService.updateVentaDropAssociation(venta.key, nextDropId || undefined);
      const drop = drops.find(item => item.id === nextDropId);
      setVentasMaestras(current => current.map(item => item.id === venta.key ? { ...item, drop_id: nextDropId || undefined, drop_nombre: drop?.nombre, actualizado_at: new Date() } : item));
      setMovimientos(current => current.map(item => item.venta_id === venta.key ? { ...item, drop_id: nextDropId || undefined, drop_nombre: drop?.nombre } : item));
      setSuccess(nextDropId ? `La venta ${venta.folio} ahora pertenece a ${drop?.nombre || "otro drop"}.` : `La venta ${venta.folio} quedó sin drop asociado.`);
    } catch (associationError: any) {
      setError(associationError?.message || "No se pudo cambiar el drop de la venta.");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <History className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            Historial de ventas
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Cada venta aparece una sola vez, con todas sus partidas, cobros y estado.</p>
        </div>
        <button type="button" onClick={loadFirstPage} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      {success && <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />{success}</div>}
      {error && <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-sm text-rose-700 dark:text-rose-300 flex items-center justify-between gap-3"><span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{error}</span><button type="button" onClick={loadFirstPage} className="font-bold underline">Reintentar</button></div>}

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <label className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Folio, cliente, producto o SKU" className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
        </label>
        <select value={clienteFilter} onChange={(event) => setClienteFilter(event.target.value)} className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500">
          <option value="all">Todos los clientes</option>
          <option value="mostrador">Venta sin cliente / Mostrador</option>
          {clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nombre_completo}</option>)}
        </select>
        <select value={canalFilter} onChange={(event) => setCanalFilter(event.target.value)} className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500">
          <option value="all">Todos los canales</option>
          {canales.map((canal) => <option key={canal} value={canal}>{canal}</option>)}
        </select>
        <select value={estadoFilter} onChange={(event) => setEstadoFilter(event.target.value)} className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500">
          <option value="all">Todos los estados</option>
          <option value="activo">Solo activas</option>
          <option value="anulado">Solo anuladas</option>
          <option value="devuelto">Solo devueltas</option>
        </select>
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-20 text-center text-zinc-500"><Loader2 className="h-7 w-7 animate-spin mx-auto mb-3" /><p className="text-sm">Cargando ventas...</p></div>
        ) : filteredVentas.length === 0 ? (
          <div className="py-20 px-6 text-center"><WalletCards className="h-11 w-11 mx-auto text-zinc-300 dark:text-zinc-600 mb-3" /><p className="font-semibold text-zinc-900 dark:text-white">No hay ventas coincidentes</p><p className="text-sm text-zinc-500 mt-1">Las ventas reales registradas aparecerán aquí.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left">
              <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-500">
                <tr><th className="px-4 py-3">Folio y fecha</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Canal</th><th className="px-4 py-3">Productos</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Pago</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3 text-right">Acciones</th></tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-sm">
                {filteredVentas.map((venta) => {
                  const expanded = expandedKey === venta.key;
                  const processing = processingId === venta.key;
                  return (
                    <React.Fragment key={venta.key}>
                      <tr className={venta.estado === "anulado" ? "bg-rose-50/30 dark:bg-rose-950/10 text-zinc-500" : "hover:bg-zinc-50/70 dark:hover:bg-zinc-800/30"}>
                        <td className="px-4 py-4 whitespace-nowrap"><div className="font-mono font-bold text-zinc-900 dark:text-white">{venta.folio}</div><div className="text-xs text-zinc-500 mt-1 flex items-center gap-1"><CalendarDays className="h-3 w-3" />{venta.fecha.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}</div></td>
                        <td className="px-4 py-4">{venta.clienteId && onNavigateToCliente ? <button type="button" onClick={() => onNavigateToCliente(venta.clienteId!)} className="font-semibold text-left hover:text-emerald-600 hover:underline inline-flex items-center gap-1"><User className="h-3.5 w-3.5" />{venta.clienteNombre}</button> : <span className="font-medium">{venta.clienteNombre}</span>}</td>
                        <td className="px-4 py-4"><span className="inline-flex rounded-full bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 px-2.5 py-1 text-xs font-semibold">{venta.canal}</span></td>
                        <td className="px-4 py-4"><button type="button" onClick={() => setExpandedKey(expanded ? null : venta.key)} className="text-left group"><span className="font-semibold group-hover:text-emerald-600">{venta.items.length} {venta.items.length === 1 ? "producto" : "productos"} · {venta.unidades} uds.</span><span className="block text-xs text-zinc-500 mt-1 max-w-[260px] truncate">{venta.items.map((item) => productName(item.sku)).join(", ")}</span></button></td>
                        <td className="px-4 py-4 text-right whitespace-nowrap"><div className="font-bold text-zinc-900 dark:text-white">{money.format(venta.total)}</div>{venta.saldo > 0 && <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">Saldo {money.format(venta.saldo)}</div>}</td>
                        <td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${venta.estadoPago === "pagado" ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300" : venta.estadoPago === "anticipo" ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"}`}>{venta.estadoPago === "pagado" ? "Pagado" : venta.estadoPago === "anticipo" ? "Anticipo" : "Pendiente"}</span></td>
                        <td className="px-4 py-4">{venta.estado === "anulado" ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400"><Ban className="h-3.5 w-3.5" />Anulada</span> : venta.estado === "devuelto" ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 dark:text-violet-400"><RotateCcw className="h-3.5 w-3.5" />Devuelta</span> : <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" />Activa</span>}</td>
                        <td className="px-4 py-4"><div className="flex items-center justify-end gap-1"><button type="button" onClick={() => setExpandedKey(expanded ? null : venta.key)} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800" title="Ver detalle" aria-label={`Ver detalle de ${venta.folio}`}>{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>{venta.estado === "activo" && venta.master && venta.recibido > 0.009 && <button type="button" onClick={() => setVentaToReturn(venta)} disabled={processing} className="p-2 rounded-lg text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/30 disabled:opacity-50" title="Registrar devolución completa" aria-label={`Devolver ${venta.folio}`}><RotateCcw className="h-4 w-4" /></button>}{venta.estado === "activo" && venta.recibido <= 0.009 && <button type="button" onClick={() => setVentaToCancel(venta)} disabled={processing} className="p-2 rounded-lg text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50" title="Anular venta sin pagos" aria-label={`Anular ${venta.folio}`}><Ban className="h-4 w-4" /></button>}<button type="button" onClick={() => archiveSale(venta)} disabled={processing} className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-50" title="Enviar a Papelera" aria-label={`Enviar ${venta.folio} a la Papelera`}>{processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button></div></td>
                      </tr>
                      {expanded && <tr className="bg-zinc-50/80 dark:bg-zinc-950/30"><td colSpan={8} className="px-5 py-4"><div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-2"><label htmlFor={`sale-drop-${venta.key}`} className="text-xs font-bold text-zinc-600 dark:text-zinc-300">Drop asociado</label><select id={`sale-drop-${venta.key}`} value={venta.dropId || ""} onChange={event => updateSaleDrop(venta, event.target.value)} disabled={!venta.master || processing} className="max-w-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-xs disabled:opacity-60"><option value="">Sin drop</option>{drops.map(drop => <option key={drop.id} value={drop.id}>{drop.nombre} · {drop.estado === "preparacion" ? "Preparación" : drop.estado === "en_venta" ? "En venta" : "Cerrado"}</option>)}</select>{!venta.master && <span className="text-[11px] text-zinc-500">Las ventas anteriores al historial consolidado conservan su asociación original.</span>}</div><div className="grid gap-2"><div className="grid grid-cols-[minmax(0,1fr)_100px_120px_140px] gap-3 text-[11px] uppercase tracking-wide text-zinc-500 px-2"><span>Producto</span><span className="text-center">Cantidad</span><span>Almacén</span><span className="text-right">Importe</span></div>{venta.items.map((item) => <div key={item.id || `${venta.key}-${item.sku}`} className="grid grid-cols-[minmax(0,1fr)_100px_120px_140px] gap-3 items-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2.5"><span><strong className="block truncate">{productName(item.sku)}</strong><small className="font-mono text-zinc-500">{item.sku}</small></span><span className="text-center font-semibold">{item.cantidad}</span><span className="text-xs text-zinc-500 truncate">{warehouseName(item.almacen_id)}</span><span className="text-right font-semibold">{money.format(getSubtotalVenta(item))}</span></div>)}</div>{venta.principal?.comentarios_venta && <p className="mt-3 text-xs text-zinc-500"><strong>Comentarios:</strong> {venta.principal?.comentarios_venta}</p>}</td></tr>}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(hasMore || masterHasMore) && !loading && <div className="text-center"><button type="button" onClick={loadMore} disabled={loadingMore} className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-5 py-2.5 text-sm font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-60">{loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}Cargar ventas anteriores</button></div>}

      {ventaToCancel && <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="cancel-sale-title"><div className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl p-5"><h2 id="cancel-sale-title" className="text-lg font-bold text-zinc-900 dark:text-white">Anular {ventaToCancel.folio}</h2><p className="text-sm text-zinc-500 mt-1">Se revertirá el inventario de todas las partidas. La venta seguirá visible para auditoría.</p><label className="block mt-4 text-sm font-semibold">Motivo de anulación<textarea autoFocus value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} rows={3} placeholder="Escribe el motivo..." className="mt-2 w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500" /></label><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => { setVentaToCancel(null); setCancelReason(""); }} className="rounded-xl px-4 py-2 text-sm font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800">Cancelar</button><button type="button" onClick={cancelSale} disabled={!cancelReason.trim() || processingId === ventaToCancel.key} className="inline-flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 text-sm font-bold disabled:opacity-50">{processingId === ventaToCancel.key && <Loader2 className="h-4 w-4 animate-spin" />}Confirmar anulación</button></div></div></div>}
      {ventaToReturn && <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="return-sale-title"><div className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl p-5"><h2 id="return-sale-title" className="text-lg font-bold text-zinc-900 dark:text-white">Devolver {ventaToReturn.folio}</h2><p className="text-sm text-zinc-500 mt-1">Se reintegrarán todas las unidades al stock y se registrará un reembolso por {money.format(ventaToReturn.recibido)}. Esta acción queda en la auditoría.</p><label className="block mt-4 text-sm font-semibold">Motivo de devolución<textarea autoFocus value={returnReason} onChange={(event) => setReturnReason(event.target.value)} rows={3} placeholder="Ej. talla incorrecta, defecto, cambio solicitado..." className="mt-2 w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500" /></label><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => { setVentaToReturn(null); setReturnReason(""); }} className="rounded-xl px-4 py-2 text-sm font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800">Cancelar</button><button type="button" onClick={returnSale} disabled={!returnReason.trim() || processingId === ventaToReturn.key} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 text-sm font-bold disabled:opacity-50">{processingId === ventaToReturn.key && <Loader2 className="h-4 w-4 animate-spin" />}Confirmar devolución</button></div></div></div>}
    </div>
  );
}
