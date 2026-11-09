import React, { useCallback, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { firestoreService } from "../../lib/firebase";
import { totalFletes } from "../../lib/fletesVentas";
import { useConsulta } from "../../hooks/useConsulta";
import { ErrorState, FilterSummary, LoadingState, PageHeader, StatCard } from "../ui/Page";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const date = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" });
const pageSize = 30;

export default function Fletes() {
  const consultar = useCallback(() => firestoreService.getFletesVentas(), []);
  const { data, loading, refreshing, error, cargar } = useConsulta("fletes-ventas", consultar);
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(pageSize);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es-MX");
    if (!term) return data || [];
    return (data || []).filter(item =>
      [item.folio, item.quienEntrega, item.ubicacionEntrega]
        .some(value => (value || "").toLocaleLowerCase("es-MX").includes(term))
    );
  }, [data, search]);

  return <div className="page-shell space-y-6">
    <PageHeader
      eyebrow="Finanzas"
      title="Fletes"
      description="Costo de cada entrega, quién la realizó y su destino."
      actions={<button type="button" className="btn-secondary" aria-label="Actualizar fletes"
        disabled={loading || refreshing} onClick={() => void cargar()}>
        <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />Actualizar
      </button>}
    />
    {error && <ErrorState message={error} onRetry={() => void cargar()} />}
    <div className="grid gap-3 sm:grid-cols-2">
      <StatCard label="Costo total de fletes" tone="warning"
        value={loading && !data ? "—" : money.format(totalFletes(data || []))}
        hint="Importe pagado por el negocio" />
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
          <table className="w-full min-w-[740px] text-left text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Venta / folio</th>
                <th className="px-4 py-3">Quién entregó</th>
                <th className="px-4 py-3">Ubicación de entrega</th>
                <th className="px-4 py-3 text-right">Costo del flete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {filtered.length === 0 ? <tr><td colSpan={5} className="px-5 py-12 text-center text-zinc-500">
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
      Los fletes provienen de las ventas registradas. Sus costos ya se descuentan en Balance general y no se contabilizan dos veces.
      Las ventas anteriores pueden no incluir el responsable o destino.
    </p>
  </div>;
}
