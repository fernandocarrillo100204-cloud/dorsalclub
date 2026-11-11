import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleDashed, Eye, Pencil, RefreshCw, Search } from "lucide-react";
import { firestoreService } from "../../lib/firebase";
import type { Venta } from "../../types";
import { mensajeError } from "../../lib/errores";
import { type FleteVenta, totalFletes } from "../../lib/fletesVentas";
import { useConsulta } from "../../hooks/useConsulta";
import { ErrorState, FilterSummary, LoadingState, PageHeader, StatCard } from "../ui/Page";
import { MoneyInput } from "../ui/NumericInputs";
import Dialog from "../ui/Dialog";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const date = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" });
const dateTime = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });
const pageSize = 30;

function Dato({ label, value }: { label: string; value?: string | null }) {
  return <div className="min-w-0">
    <dt className="text-xs text-zinc-500 dark:text-zinc-400">{label}</dt>
    <dd className={`mt-1 break-words text-sm ${value ? "font-medium text-zinc-900 dark:text-zinc-100" : "text-zinc-400"}`}>{value || "No registrado"}</dd>
  </div>;
}
function Importe({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return <div className={`flex items-center justify-between gap-3 py-1.5 text-sm ${strong ? "font-semibold" : "text-zinc-600 dark:text-zinc-300"}`}>
    <span>{label}</span><span className="font-mono tabular-nums whitespace-nowrap">{money.format(value)}</span>
  </div>;
}
function PagoRepartidor({ estado }: { estado: FleteVenta["estadoPago"] }) {
  return <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${estado === "pagado"
    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
    : estado === "pendiente"
      ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}>
    {estado === "pagado" ? "Pagado" : estado === "pendiente" ? "Pendiente" : "Sin confirmar"}
  </span>;
}

export default function Fletes() {
  const consultar = useCallback(() => firestoreService.getFletesVentas(), []);
  const { data, loading, refreshing, error, cargar } = useConsulta("fletes-ventas", consultar);
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(pageSize);
  const [detalle, setDetalle] = useState<FleteVenta | null>(null);
  const [editando, setEditando] = useState<FleteVenta | null>(null);
  const [importe, setImporte] = useState("");
  const [busyId, setBusyId] = useState("");
  const [actionError, setActionError] = useState("");
  const [master, setMaster] = useState<Venta | null>(null);
  const [masterLoading, setMasterLoading] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es-MX");
    if (!term) return data || [];
    return (data || []).filter(item =>
      [item.folio, item.quienEntrega, item.ubicacionEntrega]
        .some(value => (value || "").toLocaleLowerCase("es-MX").includes(term))
    );
  }, [data, search]);

  useEffect(() => {
    const id = detalle?.ventaId;
    if (!id) {
      setMaster(null);
      setMasterLoading(false);
      return;
    }
    let cancelled = false;
    setMaster(null);
    setMasterLoading(true);
    void firestoreService.getVentaMaestraById(id)
      .then(venta => { if (!cancelled) setMaster(venta); })
      .catch(() => { if (!cancelled) setMaster(null); })
      .finally(() => { if (!cancelled) setMasterLoading(false); });
    return () => { cancelled = true; };
  }, [detalle?.ventaId]);

  const abrirEdicion = (flete: FleteVenta) => {
    setActionError("");
    setEditando(flete);
    setImporte(flete.costo.toFixed(2));
  };

  const guardarImporte = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editando || busyId) return;
    const monto = Number(importe);
    if (!Number.isFinite(monto) || monto <= 0 || monto > 999999999.99 ||
      Math.abs(monto * 100 - Math.round(monto * 100)) > 0.00001) {
      setActionError("Ingresa un costo mayor a cero con máximo dos decimales.");
      return;
    }
    setBusyId(editando.id);
    setActionError("");
    try {
      await firestoreService.actualizarFleteVenta(editando, { costo: monto });
      setEditando(null);
      await cargar();
    } catch (cause) {
      setActionError(mensajeError(cause, "No se pudo actualizar el costo del flete."));
    } finally {
      setBusyId("");
    }
  };

  const actualizarEstado = async (flete: FleteVenta, estadoPago: "pagado" | "pendiente") => {
    if (busyId) return;
    setBusyId(flete.id);
    setActionError("");
    try {
      await firestoreService.actualizarFleteVenta(flete, { estadoPago });
      setDetalle(current => current?.id === flete.id ? {
        ...current, estadoPago, pagadoAt: estadoPago === "pagado" ? new Date() : null
      } : current);
      await cargar();
    } catch (cause) {
      setActionError(mensajeError(cause, "No se pudo cambiar el estado de pago al repartidor."));
    } finally {
      setBusyId("");
    }
  };

  const recibidoCliente = master ? Number(master.envio_cobrado_cliente) || 0 : detalle?.cubiertoCliente || 0;
  const costoAbsorbido = Math.max(0, (detalle?.costo || 0) - recibidoCliente);

  return <div className="page-shell space-y-6">
    <PageHeader eyebrow="Finanzas" title="Fletes"
      description="Costo de cada entrega, quién la realizó y su destino."
      actions={<button type="button" className="btn-secondary" aria-label="Actualizar fletes"
        disabled={loading || refreshing || Boolean(busyId)} onClick={() => void cargar()}>
        <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />Actualizar
      </button>}
    />
    {error && <ErrorState message={error} onRetry={() => void cargar()} />}
    {actionError && !editando && <ErrorState message={actionError} onRetry={() => { setActionError(""); void cargar(); }} />}
    <div className="grid gap-3 sm:grid-cols-2">
      <StatCard label="Costo total de fletes" tone="warning"
        value={loading && !data ? "—" : money.format(totalFletes(data || []))}
        hint="Costo registrado en ventas, pagado o pendiente" />
      <StatCard label="Entregas con costo registrado"
        value={loading && !data ? "—" : (data || []).length}
        hint="Ventas activas con costo de entrega" />
    </div>
    <div className="surface p-4">
      <label className="relative block">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
        <input type="search" aria-label="Buscar fletes" value={search}
          onChange={event => { setSearch(event.target.value); setVisible(pageSize); }}
          placeholder="Buscar por folio, quién entregó o ubicación…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
      </label>
    </div>
    <FilterSummary count={filtered.length} noun="fletes" active={Boolean(search)}
      onClear={() => { setSearch(""); setVisible(pageSize); }} />
    <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      {loading && !data ? <LoadingState label="Cargando fletes…" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Venta / folio</th>
                <th className="px-4 py-3">Quién entregó</th>
                <th className="px-4 py-3">Ubicación de entrega</th>
                <th className="px-4 py-3 text-right">Costo del flete</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {filtered.length === 0 ? <tr><td colSpan={6} className="px-5 py-12 text-center text-zinc-500">
                {error && !data ? "No se pudieron cargar los fletes." : search ? "No se encontraron fletes con esa búsqueda." : "Todavía no hay entregas con un costo registrado."}
              </td></tr> : filtered.slice(0, visible).map(flete => (
                <tr key={flete.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                  <td className="px-4 py-3 whitespace-nowrap text-zinc-600 dark:text-zinc-300">
                    {flete.fecha.getTime() ? date.format(flete.fecha) : "Sin fecha"}
                  </td>
                  <td className="px-4 py-3 font-medium">{flete.folio}</td>
                  <td className="px-4 py-3">{flete.quienEntrega || <span className="text-amber-600 dark:text-amber-400">No registrado</span>}</td>
                  <td className="px-4 py-3">{flete.ubicacionEntrega || <span className="text-amber-600 dark:text-amber-400">No registrada</span>}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums font-semibold">{money.format(flete.costo)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button type="button" className="btn-secondary text-xs" disabled={Boolean(busyId)}
                        onClick={() => { setActionError(""); setDetalle(flete); }} aria-label={`Ver detalle del flete ${flete.folio}`}>
                        <Eye className="h-3.5 w-3.5" />Detalle
                      </button>
                      <button type="button" className="btn-secondary text-xs" disabled={Boolean(busyId)}
                        onClick={() => abrirEdicion(flete)} aria-label={`Editar costo del flete ${flete.folio}`}>
                        <Pencil className="h-3.5 w-3.5" />Editar
                      </button>
                      <div className="flex items-center gap-2">
                        <PagoRepartidor estado={flete.estadoPago}/>
                        <button type="button" className="btn-secondary text-xs" disabled={Boolean(busyId)}
                          aria-label={`${flete.estadoPago === "pagado" ? "Marcar pendiente" : "Marcar pagado"} al repartidor de ${flete.folio}`}
                          onClick={() => void actualizarEstado(flete, flete.estadoPago === "pagado" ? "pendiente" : "pagado")}>
                          {flete.estadoPago === "pagado" ? <CircleDashed className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          {busyId === flete.id ? "Guardando…" : flete.estadoPago === "pagado" ? "Marcar pendiente" : "Marcar pagado"}
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > visible && <div className="border-t border-zinc-200 dark:border-zinc-800 px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-xs text-zinc-500">{Math.min(filtered.length, visible)} de {filtered.length}</span>
            <button type="button" className="btn-secondary" onClick={() => setVisible(count => count + pageSize)}>Cargar más</button>
          </div>}
        </div>
      )}
    </section>
    <p className="text-xs text-zinc-500 dark:text-zinc-400">
      Los fletes pendientes se muestran aquí sin descontarse del balance. Solo al marcarlos como pagados
      se contabilizan como egreso, una sola vez. Otros costos de venta mantienen su registro.
    </p>

    <Dialog open={Boolean(detalle)} onClose={() => setDetalle(null)}
      title="Detalle del flete" description={detalle?.folio} busy={Boolean(busyId)}
      className="balance-detail-dialog">
      {detalle && <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-4">
          <div className="space-y-1"><p className="text-xs text-zinc-500">Costo real de entrega</p>
            <strong className="text-3xl font-semibold tabular-nums">{money.format(detalle.costo)}</strong></div>
          <PagoRepartidor estado={detalle.estadoPago}/>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          <Dato label="Venta relacionada" value={detalle.folio}/>
          <Dato label="Fecha de registro" value={dateTime.format(detalle.fecha)}/>
          <Dato label="Cliente" value={master?.cliente_nombre || detalle.cliente}/>
          <Dato label="Canal" value={master?.canal_venta_nombre || detalle.canal}/>
          <Dato label="Quién entregó" value={master?.repartidor_nombre || detalle.quienEntrega}/>
          <Dato label="Ubicación de entrega" value={master?.ubicacion_entrega_nombre || detalle.ubicacionEntrega}/>
          {detalle.pagadoAt && <Dato label="Fecha en que se marcó pagado" value={dateTime.format(detalle.pagadoAt)}/>}
        </dl>
        {masterLoading && <p className="text-xs text-zinc-500">Consultando la venta relacionada…</p>}
        <section className="space-y-2 border-t border-zinc-200 dark:border-zinc-800 pt-3">
          <h3 className="text-sm font-semibold">Desglose del flete</h3>
          <Importe label="Costo de la entrega" value={detalle.costo}/>
          <Importe label="Cubierto por el cliente" value={recibidoCliente}/>
          <div className="border-t border-zinc-200 dark:border-zinc-800 pt-2">
            <Importe label="Costo absorbido por el negocio" value={costoAbsorbido} strong/>
          </div>
          {recibidoCliente > detalle.costo && <Importe label="Cobertura excedente del cliente" value={recibidoCliente - detalle.costo}/>}
        </section>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 dark:border-zinc-800 pt-4">
          <p className="text-xs text-zinc-500">El estado de pago al repartidor no afecta lo cobrado al cliente.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" disabled={Boolean(busyId)}
              onClick={() => void actualizarEstado(detalle, "pendiente")}>Marcar pendiente</button>
            <button type="button" className="btn-primary" disabled={Boolean(busyId)}
              onClick={() => void actualizarEstado(detalle, "pagado")}>Marcar pagado</button>
          </div>
        </div>
      </div>}
    </Dialog>

    <Dialog open={Boolean(editando)} onClose={() => { setEditando(null); setActionError(""); }}
      title="Editar costo del flete" description={editando?.folio} busy={Boolean(busyId)}>
      <form onSubmit={guardarImporte} className="space-y-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Modificarás el costo de la entrega vinculado a esta venta. Solo afectará al Balance general si el flete está pagado. No modifica el precio cobrado al cliente.
        </p>
        <label className="block text-xs font-semibold">
          Costo real · MXN
          <MoneyInput required min="0.01" value={importe} onChange={event => setImporte(event.target.value)}
            disabled={Boolean(busyId)}
            className="mt-2 w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2.5 text-base font-mono" />
        </label>
        {actionError && <ErrorState message={actionError}/>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" disabled={Boolean(busyId)}
            onClick={() => { setEditando(null); setActionError(""); }}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={Boolean(busyId) || !importe || Number(importe) <= 0}>
            {busyId ? "Guardando…" : "Guardar costo"}
          </button>
        </div>
      </form>
    </Dialog>
  </div>;
}
