/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, CircleDollarSign, LoaderCircle, PackageCheck, RefreshCw, Save, Trash2 } from "lucide-react";
import { firestoreService } from "../lib/firebase";
import { PedidoVenta } from "../types";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

const PedidoCard: React.FC<{ pedido: PedidoVenta; onChanged: () => Promise<void> }> = ({ pedido, onChanged }) => {
  const [amount, setAmount] = useState(pedido.saldo > 0 ? pedido.saldo.toFixed(2) : "");
  const [estimatedDate, setEstimatedDate] = useState(pedido.fecha_estimada || "");
  const [comments, setComments] = useState(pedido.comentarios || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      await onChanged();
    } catch (err: any) {
      setError(err?.message || "No fue posible actualizar el pedido.");
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = () => {
    if (!window.confirm(`¿Cancelar el pedido ${pedido.folio}? Esta acción lo retirará del seguimiento.`)) return;
    run(() => firestoreService.anularVentaAgrupada(pedido.venta_id, "Pedido cancelado por el usuario"));
  };

  return (
    <article className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">{pedido.canal_venta_nombre}</p>
          <h3 className="font-bold text-zinc-900 dark:text-white">{pedido.cliente_nombre}</h3>
          <p className="text-xs text-zinc-500">{pedido.folio} · {pedido.fecha.toLocaleDateString("es-MX")}</p>
        </div>
        <button type="button" onClick={cancelOrder} disabled={busy} className="p-2 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50" aria-label={`Cancelar ${pedido.folio}`} title="Cancelar pedido">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-1 text-sm">
        {pedido.items.map((item, index) => (
          <div key={`${item.sku}-${index}`} className="flex justify-between gap-3 text-zinc-600 dark:text-zinc-300">
            <span className="truncate">{item.cantidad} × {item.sku}</span>
            <span className="font-medium">{money.format(item.total)}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 p-3 text-xs">
        <div><span className="block text-zinc-500">Total</span><strong className="text-zinc-900 dark:text-white">{money.format(pedido.total)}</strong></div>
        <div><span className="block text-zinc-500">Pagado</span><strong className="text-emerald-600">{money.format(pedido.recibido)}</strong></div>
        <div><span className="block text-zinc-500">Saldo</span><strong className={pedido.saldo > 0 ? "text-amber-600" : "text-zinc-900 dark:text-white"}>{money.format(pedido.saldo)}</strong></div>
      </div>

      {pedido.estado === "pedido" && (
        <div className="flex gap-2">
          <label className="flex-1">
            <span className="sr-only">Importe del pago</span>
            <input type="number" min="0.01" max={pedido.saldo} step="0.01" value={amount} onChange={event => setAmount(event.target.value)} disabled={busy} className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm" />
          </label>
          <button type="button" onClick={() => run(() => firestoreService.registrarPagoPedido(pedido.venta_id, Number(amount)))} disabled={busy || Number(amount) <= 0} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50">
            Registrar pago
          </button>
        </div>
      )}

      <div className="grid gap-2">
        <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
          Fecha estimada
          <input type="date" value={estimatedDate} onChange={event => setEstimatedDate(event.target.value)} disabled={busy || pedido.estado === "entregado"} className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm" />
        </label>
        <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
          Comentarios
          <textarea value={comments} onChange={event => setComments(event.target.value)} disabled={busy || pedido.estado === "entregado"} rows={2} placeholder="Detalles de seguimiento..." className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm resize-none" />
        </label>
      </div>

      {pedido.estado !== "entregado" && (
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => run(() => firestoreService.actualizarSeguimientoPedido(pedido.venta_id, { fecha_estimada: estimatedDate, comentarios: comments }))} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-bold text-zinc-700 dark:text-zinc-200 disabled:opacity-50">
            <Save className="w-3.5 h-3.5" /> Guardar
          </button>
          {pedido.estado === "pagado" && (
            <button type="button" onClick={() => run(() => firestoreService.actualizarSeguimientoPedido(pedido.venta_id, { fecha_estimada: estimatedDate, comentarios: comments, marcar_entregado: true }))} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold disabled:opacity-50">
              <PackageCheck className="w-3.5 h-3.5" /> Marcar entregado
            </button>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </article>
  );
};

export const PedidosVenta: React.FC = () => {
  const [orders, setOrders] = useState<PedidoVenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      setOrders(await firestoreService.getPedidosVenta());
    } catch (err: any) {
      setError(err?.message || "No fue posible consultar los pedidos.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const columns = useMemo(() => [
    { id: "pedido" as const, title: "Pedido por el cliente", icon: CalendarDays, help: "Pedidos con saldo pendiente" },
    { id: "pagado" as const, title: "Pagado", icon: CircleDollarSign, help: "Pedidos liquidados por entregar" },
    { id: "entregado" as const, title: "Entregado", icon: CheckCircle2, help: "Pedidos finalizados" }
  ], []);

  return (
    <section className="max-w-[1600px] mx-auto px-5 sm:px-7 py-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Seguimiento de pedidos</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Pedidos de Bajo pedido y Mayoreo, desde el anticipo hasta la entrega.</p>
        </div>
        <button type="button" onClick={() => load(true)} disabled={refreshing} className="p-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 disabled:opacity-50" aria-label="Actualizar pedidos" title="Actualizar pedidos">
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </header>

      {error && <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-300">{error}</div>}

      {loading ? (
        <div className="h-52 flex items-center justify-center text-zinc-500"><LoaderCircle className="w-6 h-6 animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
          {columns.map(column => {
            const columnOrders = orders.filter(order => order.estado === column.id);
            const Icon = column.icon;
            return (
              <div key={column.id} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/40 p-3 min-h-48">
                <div className="flex items-center justify-between gap-3 px-1 pb-3">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-emerald-600" />
                    <div><h2 className="font-bold text-sm text-zinc-900 dark:text-white">{column.title}</h2><p className="text-[11px] text-zinc-500">{column.help}</p></div>
                  </div>
                  <span className="min-w-7 h-7 px-2 inline-flex items-center justify-center rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-bold">{columnOrders.length}</span>
                </div>
                <div className="space-y-3">
                  {columnOrders.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-8 text-center text-xs text-zinc-500">No hay pedidos en este apartado.</div>
                  ) : columnOrders.map(order => <PedidoCard key={order.venta_id} pedido={order} onChanged={() => load(true)} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default PedidosVenta;
