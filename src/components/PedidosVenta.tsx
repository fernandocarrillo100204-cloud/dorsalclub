import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, CircleDollarSign, RefreshCw, Search, Settings2 } from "lucide-react";
import { firestoreService } from "../lib/firebase";
import type { OpcionListaConfigurable, PedidoVenta } from "../types";
import { pedidosPendientesPago, saldoPendientePedidos } from "../lib/pedidosPendientes";
import { mensajeError } from "../lib/errores";
import { money, searchText } from "../lib/presentation";
import { useWorkspace } from "../context/WorkspaceContext";
import { ErrorState, FilterSummary, LoadingState, PageHeader, StatCard } from "./ui/Page";
import Dialog from "./ui/Dialog";
import ConfiguracionModuloModal from "./ConfiguracionModuloModal";

const OrderManager: React.FC<{
  order: PedidoVenta;
  methods: OpcionListaConfigurable[];
  methodsError: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}> = ({ order, methods, methodsError, onClose, onSaved }) => {
  const { confirm, notify } = useWorkspace();
  const [method, setMethod] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);

  const run = async (action: () => Promise<void>, message: string) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
      notify(message);
      await onSaved();
      onClose();
    } catch (cause) {
      setError(mensajeError(cause, "No se pudo actualizar el pedido."));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  const receive = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!Number.isFinite(order.saldo) || order.saldo <= 0 || !method) {
      setError("Selecciona un método de pago para liquidar el saldo pendiente.");
      return;
    }
    if (!(await confirm({
      title: "Confirmar liquidación",
      description: `Recibir ${money.format(order.saldo)} por ${method} y liquidar completamente el pedido ${order.folio}. El pedido saldrá de Por pagar y continuará en Historial de ventas.`,
      confirmLabel: "Sí, liquidar pedido"
    }))) return;
    await run(
      () => firestoreService.registrarPagoPedido(order.venta_id, order.saldo, method),
      `Pedido ${order.folio} liquidado.`
    );
  };

  const cancel = async () => {
    const paid = order.recibido > .009;
    if (!(await confirm({
      title: paid ? "Cancelar y registrar reembolso" : "Cancelar pedido",
      description: paid
        ? `Se cancelará ${order.folio} y se registrará un reembolso por ${money.format(order.recibido)}. Esta acción no envía dinero al cliente.`
        : `Se cancelará ${order.folio} y desaparecerá de pendientes, conservando la trazabilidad de la operación.`,
      confirmLabel: paid ? "Cancelar y registrar reembolso" : "Cancelar pedido",
      danger: true
    }))) return;
    await run(
      () => paid
        ? firestoreService.devolverVentaCompleta(order.venta_id, "Pedido cancelado y reembolsado por el usuario")
        : firestoreService.anularVentaAgrupada(order.venta_id, "Pedido sin pagos cancelado por el usuario"),
      `Pedido ${order.folio} cancelado.`
    );
  };

  const validAmount = Number.isFinite(order.saldo) && order.saldo > 0;

  return (
    <Dialog open title={order.folio}
      description={`${order.cliente_nombre} · ${order.canal_venta_nombre}`}
      onClose={onClose} busy={busy} className="order-dialog">
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-3 order-money">
          <div><small>Total del pedido</small><strong>{money.format(order.total)}</strong></div>
          <div><small>Recibido</small><strong className="text-emerald-600 dark:text-emerald-400">{money.format(order.recibido)}</strong></div>
          <div><small>Por cobrar</small><strong className="text-amber-700 dark:text-amber-400">{money.format(order.saldo)}</strong></div>
        </div>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {order.items.map((item, index) => (
            <div key={`${item.sku}-${index}`} className="flex justify-between gap-4 py-2 text-sm">
              <span><span className="text-zinc-500">{item.cantidad} × </span>{item.sku}</span>
              <strong className="font-medium tabular-nums">{money.format(item.total)}</strong>
            </div>
          ))}
        </div>
        {error && <ErrorState message={error} />}
        <form onSubmit={receive} className="rounded-xl p-4 border border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3">
          <h3 className="text-sm font-semibold">Liquidar pedido</h3>
          <p className="text-xs text-zinc-500">Únicamente se permite cobrar el saldo completo. No se aceptan abonos adicionales después del anticipo inicial.</p>
          {methodsError && <ErrorState message={methodsError} />}
          {!methodsError && !methods.length && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Activa un método de pago en Configuración → Ventas para registrar cobros.
            </p>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="text-xs font-medium">Importe a liquidar · MXN
              <div className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-semibold tabular-nums" aria-label="Importe total a liquidar">
                {money.format(order.saldo)}
              </div>
            </div>
            <label className="text-xs font-medium">Método de pago
              <select required value={method} onChange={event => setMethod(event.target.value)}
                disabled={busy || Boolean(methodsError)}
                className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2">
                <option value="">Seleccionar método</option>
                {methods.map(item => <option key={item.id} value={item.nombre}>{item.nombre}</option>)}
              </select>
            </label>
          </div>
          <button type="submit" disabled={busy || !method || !validAmount || Boolean(methodsError)}
            className="btn-primary w-full">
            <CircleDollarSign className="h-4 w-4" />{busy ? "Guardando…" : "Liquidar pedido"}
          </button>
        </form>
        {(order.recibido <= .009 || order.es_consolidado !== false) && (
          <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 text-right">
            <button type="button" disabled={busy} onClick={cancel}
              className="text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline disabled:opacity-50">
              {order.recibido > .009 ? "Cancelar pedido y registrar reembolso" : "Cancelar pedido"}
            </button>
          </div>
        )}
      </div>
    </Dialog>
  );
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
  const [selectedId, setSelectedId] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const requestRef = useRef(0);

  const load = useCallback(async (refresh = false) => {
    const request = ++requestRef.current;
    refresh ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const [result, config] = await Promise.allSettled([
        firestoreService.getPedidosVenta(),
        firestoreService.getConfiguracionListasDesplegables()
      ]);
      if (request !== requestRef.current) return;
      if (result.status === "fulfilled") setOrders(result.value);
      else setError(mensajeError(result.reason, "No fue posible consultar los pedidos."));
      if (config.status === "fulfilled") {
        setMethods(config.value.metodos_pago_venta.filter(item => item.activa));
        setMethodsError("");
      } else {
        setMethodsError(mensajeError(config.reason, "No se pudieron cargar los métodos de pago. Actualiza para reintentar."));
      }
    } finally {
      if (request === requestRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { requestRef.current += 1; };
  }, [load]);

  // Los pedidos liquidados no se borran: dejan de pertenecer a esta bandeja.
  const pending = useMemo(() => pedidosPendientesPago(orders), [orders]);
  const filtered = useMemo(() => pending
    .filter(order =>
      (!channel || order.canal_venta_nombre === channel) &&
      searchText(`${order.folio} ${order.cliente_nombre} ${order.items.map(item => item.sku).join(" ")}`)
        .includes(searchText(search))
    )
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime()), [pending, search, channel]);
  const selected = pending.find(order => order.venta_id === selectedId);

  return (
    <section className="page-shell space-y-6">
      <PageHeader eyebrow="Ventas" title="Pedidos por pagar"
        description="Consulta los saldos pendientes y liquida los pedidos. Los liquidados permanecen en Historial de ventas."
        actions={<>
          <button type="button" className="btn-secondary" onClick={() => setSettingsOpen(true)}>
            <Settings2 className="h-4 w-4" />Configurar
          </button>
          <button type="button" className="btn-secondary" disabled={loading || refreshing} onClick={() => void load(true)}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />Actualizar
          </button>
        </>} />
      {error && <ErrorState message={error} onRetry={() => void load(true)} />}
      <div className="grid sm:grid-cols-2 gap-3">
        <StatCard label="Pedidos pendientes de pago"
          value={loading || (error && !orders.length) ? "—" : pending.length}
          hint="Sin pagar o con anticipo recibido" />
        <StatCard label="Saldo total por cobrar" tone="warning"
          value={loading || (error && !orders.length) ? "—" : money.format(saldoPendientePedidos(pending))}
          hint="Solo pedidos con saldo pendiente" />
      </div>
      <div className="surface p-4 flex flex-wrap gap-3">
        <label className="relative flex-1 min-w-[190px]">
          <Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
          <input aria-label="Buscar pedidos" value={search} onChange={event => setSearch(event.target.value)}
            placeholder="Cliente, folio o SKU…"
            className="w-full pl-9 pr-3 py-2 bg-transparent border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm" />
        </label>
        <select aria-label="Filtrar pedidos por canal" value={channel} onChange={event => setChannel(event.target.value)}
          className="border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-zinc-900">
          <option value="">Todos los canales</option>
          {[...new Set(pending.map(order => order.canal_venta_nombre))].sort().map(name =>
            <option key={name} value={name}>{name}</option>
          )}
        </select>
      </div>
      <FilterSummary count={filtered.length} noun="pedidos"
        active={Boolean(search || channel)}
        onClear={() => { setSearch(""); setChannel(""); }} />
      {loading ? <LoadingState label="Cargando pedidos por cobrar…" /> :
        error && !orders.length ? null : (
          <div className="order-board pending-only">
            <section className="order-column pedido" aria-label="Por pagar">
              <header>
                <div className="flex items-center gap-2">
                  <CircleDollarSign className="h-4 w-4" />
                  <h2>Por pagar</h2>
                  <span className="column-count">{filtered.length}</span>
                </div>
                <p>Pedidos sin liquidar, con o sin anticipo inicial</p>
              </header>
              <div className="space-y-3">
                {!filtered.length ? (
                  <div className="order-column-empty">
                    {search || channel ? "Sin coincidencias con estos filtros" : "No hay pedidos pendientes de pago"}
                  </div>
                ) : filtered.map(order => (
                  <button type="button" key={order.venta_id} className="order-card"
                    onClick={() => setSelectedId(order.venta_id)}
                    aria-label={`Gestionar cobro del pedido ${order.folio} de ${order.cliente_nombre}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="order-folio">{order.folio}</span>
                      <ArrowUpRight className="h-4 w-4 text-zinc-400" />
                    </div>
                    <h3>{order.cliente_nombre}</h3>
                    <p className="order-channel">
                      {order.canal_venta_nombre} · {order.items.reduce((sum, item) => sum + item.cantidad, 0)} unidades
                    </p>
                    <p className="order-products">
                      {order.items.map(item => `${item.cantidad} × ${item.sku}`).join(" · ")}
                    </p>
                    <div className="order-card-money">
                      <div><small>Total</small><strong>{money.format(order.total)}</strong></div>
                      <div>
                        <small>Saldo por cobrar</small>
                        <strong className="text-amber-700 dark:text-amber-400">{money.format(order.saldo)}</strong>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
      {selected && <OrderManager key={selected.venta_id} order={selected}
        methods={methods} methodsError={methodsError}
        onClose={() => setSelectedId("")} onSaved={() => load(true)} />}
      <ConfiguracionModuloModal isOpen={settingsOpen} module="ventas"
        onClose={() => setSettingsOpen(false)} onSaved={() => load(true)} />
    </section>
  );
}
