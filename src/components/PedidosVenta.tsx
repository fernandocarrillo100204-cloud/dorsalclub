import { MoneyInput } from "./ui/NumericInputs";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, CalendarDays, Check, CheckCircle2, CircleDollarSign, Clock3, PackageCheck, RefreshCw, Search, Settings2 } from "lucide-react";
import { firestoreService } from "../lib/firebase";
import { OpcionListaConfigurable, PedidoVenta } from "../types";
import { mensajeError } from "../lib/errores";
import { fechaLocal } from "../lib/lecturasVentas";
import { money, searchText } from "../lib/presentation";
import { useUnsavedChanges, useWorkspace } from "../context/WorkspaceContext";
import { ErrorState, FilterSummary, LoadingState, PageHeader, StatCard } from "./ui/Page";
import Dialog from "./ui/Dialog";
import ConfiguracionModuloModal from "./ConfiguracionModuloModal";

function isOverdue(order: PedidoVenta) {
  return order.estado !== "entregado" && Boolean(order.fecha_estimada && /^\d{4}-\d{2}-\d{2}$/.test(order.fecha_estimada) && order.fecha_estimada < fechaLocal(new Date()));
}

const OrderManager: React.FC<{
  order: PedidoVenta; methods: OpcionListaConfigurable[]; methodsError: string; onClose: () => void; onSaved: () => Promise<void>;
}> = ({ order, methods, methodsError, onClose, onSaved }) => {
  const { confirm, notify } = useWorkspace();
  const [amount, setAmount] = useState(order.saldo > 0 ? order.saldo.toFixed(2) : "");
  const [method, setMethod] = useState("");
  const [date, setDate] = useState(order.fecha_estimada || "");
  const [comments, setComments] = useState(order.comentarios || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const dirty = date !== (order.fecha_estimada || "") || comments !== (order.comentarios || "");
  const markSaved = useUnsavedChanges(dirty, busy);
  const close = async () => {
    if (busy) return;
    if (dirty && !(await confirm({ title: "¿Cerrar sin guardar?", description: "Los cambios en la fecha y comentarios de este pedido no se han guardado.", confirmLabel: "Descartar cambios", danger: true }))) return;
    markSaved(); onClose();
  };
  const run = async (action: () => Promise<void>, message: string) => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError("");
    try { await action(); markSaved(); notify(message); await onSaved(); onClose(); }
    catch (err) { setError(mensajeError(err, "No se pudo actualizar el pedido.")); }
    finally { saving.current = false; setBusy(false); }
  };
  const receive = async (event: React.FormEvent) => {
    event.preventDefault();
    if (dirty) { setError("Guarda primero los cambios de seguimiento antes de registrar un pago."); return; }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || value > order.saldo || !method) { setError("Captura un importe válido, sin superar el saldo, y elige un método de pago."); return; }
    if (!(await confirm({ title: "Confirmar pago recibido", description: `Registrar ${money.format(value)} por ${method} en el pedido ${order.folio}. Confirma únicamente si ya recibiste el dinero.`, confirmLabel: "Sí, registrar pago" }))) return;
    await run(() => firestoreService.registrarPagoPedido(order.venta_id, value, method), `Pago registrado en ${order.folio}.`);
  };
  const deliver = async () => {
    if (!(await confirm({ title: "Confirmar entrega", description: `¿El cliente ya recibió todos los productos del pedido ${order.folio}?`, confirmLabel: "Marcar entregado" }))) return;
    await run(() => firestoreService.actualizarSeguimientoPedido(order.venta_id, { fecha_estimada: date, comentarios: comments, marcar_entregado: true }), `Pedido ${order.folio} entregado.`);
  };
  const cancel = async () => {
    const paid = order.recibido > .009;
    if (!(await confirm({ title: paid ? "Cancelar y registrar reembolso" : "Cancelar pedido", description: paid ? `Se cancelará ${order.folio} y se registrará un reembolso por ${money.format(order.recibido)}. Esto registra la operación; no envía dinero al cliente.` : `El pedido ${order.folio} se retirará del seguimiento.`, confirmLabel: paid ? "Cancelar y registrar reembolso" : "Cancelar pedido", danger: true }))) return;
    await run(() => paid ? firestoreService.devolverVentaCompleta(order.venta_id, "Pedido cancelado y reembolsado por el usuario") : firestoreService.anularVentaAgrupada(order.venta_id, "Pedido sin pagos cancelado por el usuario"), `Pedido ${order.folio} cancelado.`);
  };
  return <Dialog open title={order.folio} description={`${order.cliente_nombre} · ${order.canal_venta_nombre}`} onClose={close} busy={busy} className="order-dialog">
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3 order-money"><div><small>Total del pedido</small><strong>{money.format(order.total)}</strong></div><div><small>Recibido</small><strong className="text-emerald-600 dark:text-emerald-400">{money.format(order.recibido)}</strong></div><div><small>Por cobrar</small><strong>{money.format(order.saldo)}</strong></div></div>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">{order.items.map((item, index) => <div key={`${item.sku}-${index}`} className="flex justify-between gap-4 py-2 text-sm"><span><span className="text-zinc-500">{item.cantidad} × </span>{item.sku}</span><strong className="font-medium tabular-nums">{money.format(item.total)}</strong></div>)}</div>
      {error && <ErrorState message={error} />}
      {order.estado === "pedido" && <form onSubmit={receive} className="rounded-xl p-4 border border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3">
        <h3 className="text-sm font-semibold">Registrar un pago</h3><p className="text-xs text-zinc-500">Solo registra importes que ya hayas recibido.</p>
        {methodsError && <ErrorState message={methodsError} />}
        {!methodsError && !methods.length && <p className="text-xs text-amber-700 dark:text-amber-400">Activa un método de pago en Configuración → Ventas para registrar cobros.</p>}
        <div className="grid sm:grid-cols-2 gap-3"><label className="text-xs font-medium">Importe · MXN<MoneyInput required min="0.01" max={order.saldo}  value={amount} onChange={event => setAmount(event.target.value)} disabled={busy} className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2" /></label><label className="text-xs font-medium">Método de pago<select required value={method} onChange={event => setMethod(event.target.value)} disabled={busy || Boolean(methodsError)} className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2"><option value="">Seleccionar método</option>{methods.map(item => <option key={item.id} value={item.nombre}>{item.nombre}</option>)}</select></label></div>
        <button type="submit" disabled={busy || dirty || !method || !Number.isFinite(Number(amount)) || Number(amount) <= 0 || Number(amount) > order.saldo || Boolean(methodsError)} className="btn-primary w-full"><CircleDollarSign className="h-4 w-4" />{busy ? "Guardando…" : "Registrar pago"}</button>
        {dirty && <p className="text-xs text-amber-700 dark:text-amber-400">Guarda primero la fecha y comentarios si deseas conservar esos cambios.</p>}
      </form>}
      <div className="space-y-3"><h3 className="text-sm font-semibold">Entrega y seguimiento</h3><label className="block text-xs font-medium">Fecha estimada de entrega<input type="date" value={date} disabled={busy || order.estado === "entregado"} onChange={event => setDate(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2" /></label><label className="block text-xs font-medium">Comentarios<textarea rows={3} maxLength={1000} value={comments} disabled={busy || order.estado === "entregado"} onChange={event => setComments(event.target.value)} placeholder="Acuerdos con el cliente o detalles de entrega…" className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm" /></label></div>
      <div className="flex flex-wrap gap-2 justify-end">{order.estado !== "entregado" && <button type="button" disabled={busy || !dirty} className="btn-secondary" onClick={() => run(() => firestoreService.actualizarSeguimientoPedido(order.venta_id, { fecha_estimada: date, comentarios: comments }), `Seguimiento de ${order.folio} actualizado.`)}><Check className="h-4 w-4" />Guardar seguimiento</button>}{order.estado === "pagado" && <button type="button" onClick={deliver} disabled={busy} className="btn-primary"><PackageCheck className="h-4 w-4" />Marcar entregado</button>}</div>
      {(order.recibido <= .009 || order.es_consolidado !== false) && order.estado !== "entregado" && <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800"><button type="button" onClick={cancel} disabled={busy} className="text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline">{order.recibido > .009 ? "Cancelar pedido y registrar reembolso" : "Cancelar pedido"}</button></div>}
    </div>
  </Dialog>;
};

export default function PedidosVenta() {
  const [orders, setOrders] = useState<PedidoVenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [methods, setMethods] = useState<OpcionListaConfigurable[]>([]);
  const [methodsError, setMethodsError] = useState("");
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState("");
  const [lateOnly, setLateOnly] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const requestRef = useRef(0);
  const load = useCallback(async (refresh = false) => {
    const request = ++requestRef.current;
    refresh ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const [result, config] = await Promise.allSettled([firestoreService.getPedidosVenta(), firestoreService.getConfiguracionListasDesplegables()]);
      if (request !== requestRef.current) return;
      if (result.status === "fulfilled") setOrders(result.value);
      else setError(mensajeError(result.reason, "No fue posible consultar los pedidos."));
      if (config.status === "fulfilled") { setMethods(config.value.metodos_pago_venta.filter(item => item.activa)); setMethodsError(""); }
      else setMethodsError(mensajeError(config.reason, "No se pudieron cargar los métodos de pago. Actualiza para reintentar."));
    } finally { if (request === requestRef.current) { setLoading(false); setRefreshing(false); } }
  }, []);
  useEffect(() => { load(); return () => { requestRef.current += 1; }; }, [load]);
  const filtered = useMemo(() => orders.filter(order => (!channel || order.canal_venta_nombre === channel) && (!lateOnly || isOverdue(order)) && searchText(`${order.folio} ${order.cliente_nombre} ${order.items.map(item => item.sku).join(" ")}`).includes(searchText(search)))
    .sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) || (a.fecha_estimada || "9999").localeCompare(b.fecha_estimada || "9999") || b.fecha.getTime() - a.fecha.getTime()), [orders, search, channel, lateOnly]);
  const selected = orders.find(order => order.venta_id === selectedId);
  const columns = [
    { id: "pedido" as const, title: "Por pagar", help: "Anticipo recibido o pago pendiente", icon: CalendarDays },
    { id: "pagado" as const, title: "Por entregar", help: "Pago completo, entrega pendiente", icon: PackageCheck },
    { id: "entregado" as const, title: "Entregados", help: "Pedidos completados", icon: CheckCircle2 }
  ];
  return <section className="page-shell space-y-6">
    <PageHeader eyebrow="Ventas" title="Seguimiento de pedidos" description="Del anticipo a la entrega. Abre un pedido para registrar pagos o actualizar su seguimiento." actions={<><button type="button" className="btn-secondary" onClick={() => setSettingsOpen(true)}><Settings2 className="h-4 w-4" />Configurar</button><button type="button" className="btn-secondary" disabled={loading || refreshing} onClick={() => load(true)}><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />Actualizar</button></>} />
    {error && <ErrorState message={error} onRetry={() => load(true)} />}
    <div className="grid sm:grid-cols-3 gap-3"><StatCard label="Pedidos por completar" value={loading || (error && !orders.length) ? "—" : orders.filter(order => order.estado !== "entregado").length} hint="Por pagar y por entregar" /><StatCard label="Saldo por cobrar" tone="warning" value={loading || (error && !orders.length) ? "—" : money.format(orders.filter(order => order.estado !== "entregado").reduce((sum, order) => sum + order.saldo, 0))} hint="De los pedidos en seguimiento" /><StatCard label="Entregas atrasadas" value={loading || (error && !orders.length) ? "—" : orders.filter(isOverdue).length} hint="Según la fecha estimada registrada" /></div>
    <div className="surface p-4 flex flex-wrap gap-3"><label className="relative flex-1 min-w-[190px]"><Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><input aria-label="Buscar pedidos" value={search} onChange={event => setSearch(event.target.value)} placeholder="Cliente, folio o SKU…" className="w-full pl-9 pr-3 py-2 bg-transparent border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm" /></label><select aria-label="Filtrar pedidos por canal" value={channel} onChange={event => setChannel(event.target.value)} className="border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-zinc-900"><option value="">Todos los canales</option>{[...new Set(orders.map(order => order.canal_venta_nombre))].sort().map(name => <option key={name}>{name}</option>)}</select><label className="inline-flex gap-2 items-center px-2 text-xs font-medium cursor-pointer"><input type="checkbox" checked={lateOnly} onChange={event => setLateOnly(event.target.checked)} />Solo entregas atrasadas</label></div>
    <FilterSummary count={filtered.length} noun="pedidos" active={Boolean(search || channel || lateOnly)} onClear={() => { setSearch(""); setChannel(""); setLateOnly(false); }} />
    {loading ? <LoadingState label="Cargando pedidos…" /> : error && !orders.length ? null : <div className="order-board">{columns.map(column => {
      const items = filtered.filter(order => order.estado === column.id); const Icon = column.icon;
      return <section key={column.id} className={`order-column ${column.id}`} aria-label={column.title}><header><div className="flex items-center gap-2"><Icon className="h-4 w-4" /><h2>{column.title}</h2><span className="column-count">{items.length}</span></div><p>{column.help}</p></header><div className="space-y-3">{!items.length ? <div className="order-column-empty">{search || channel || lateOnly ? "Sin coincidencias con estos filtros" : "No hay pedidos en este estado"}</div> : items.map(order => <button type="button" key={order.venta_id} className="order-card" onClick={() => setSelectedId(order.venta_id)} aria-label={`Gestionar pedido ${order.folio} de ${order.cliente_nombre}`}><div className="flex items-center justify-between gap-2"><span className="order-folio">{order.folio}</span><ArrowUpRight className="h-4 w-4 text-zinc-400" /></div><h3>{order.cliente_nombre}</h3><p className="order-channel">{order.canal_venta_nombre} · {order.items.reduce((sum, item) => sum + item.cantidad, 0)} unidades</p><p className="order-products">{order.items.map(item => `${item.cantidad} × ${item.sku}`).join(" · ")}</p><div className="order-card-money"><div><small>Total</small><strong>{money.format(order.total)}</strong></div><div><small>{order.saldo > .009 ? "Por cobrar" : "Pago completo"}</small><strong className={order.saldo > .009 ? "text-amber-700 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}>{order.saldo > .009 ? money.format(order.saldo) : <CheckCircle2 className="h-4 w-4 ml-auto mt-1" />}</strong></div></div>{order.fecha_estimada && <div className={`order-date ${isOverdue(order) ? "overdue" : ""}`}><Clock3 className="h-3.5 w-3.5" />{isOverdue(order) ? "Entrega atrasada" : "Entrega estimada"} · {new Date(`${order.fecha_estimada}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}</div>}</button>)}</div></section>;
    })}</div>}
    {selected && <OrderManager key={selected.venta_id} order={selected} methods={methods} methodsError={methodsError} onClose={() => setSelectedId("")} onSaved={() => load(true)} />}
    <ConfiguracionModuloModal isOpen={settingsOpen} module="ventas" onClose={() => setSettingsOpen(false)} onSaved={() => load(true)} />
  </section>;
}
