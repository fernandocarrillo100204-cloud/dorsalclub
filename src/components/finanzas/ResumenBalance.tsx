import React from "react";
import type { BalanceGeneral } from "../../lib/balanceGeneral";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export default function ResumenBalance({ data, loading }: { data: BalanceGeneral | null; loading: boolean }) {
  const amount = (value?: number, prominent = false) => loading
    ? <span aria-label="Cargando importe" className={`inline-block rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse ${prominent ? "h-7 w-28" : "h-4 w-20"}`} />
    : <span className="tabular-nums whitespace-nowrap">{money.format(value ?? 0)}</span>;
  const row = (label: string, value?: number) => <div key={label} className="flex items-baseline justify-between gap-4 py-2">
    <dt className="text-zinc-600 dark:text-zinc-300">{label}</dt><dd className="font-medium shrink-0">{amount(value)}</dd>
  </div>;
  return <section aria-label="Resumen acumulado" className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
    <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-zinc-200 dark:divide-zinc-800">
      <div className="p-4 sm:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3 mb-1">
          <h2 className="text-sm font-semibold">Ingresos totales</h2><strong className="text-xl text-emerald-700 dark:text-emerald-400">{amount(data?.ingresos, true)}</strong>
        </div>
        <dl className="text-sm">
          {row("Ventas de mercancía cobradas", data?.mercanciaCobrada)}
          {row("Envíos y otros cargos cobrados", data?.extrasCobrados)}
          {Boolean(data?.ingresosAnteriores) && row("Otros ingresos anteriores", data?.ingresosAnteriores)}
        </dl>
      </div>
      <div className="p-4 sm:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3 mb-1">
          <h2 className="text-sm font-semibold">Egresos totales</h2><strong className="text-xl text-rose-700 dark:text-rose-400">{amount(data?.egresos, true)}</strong>
        </div>
        <dl className="text-sm">
          {row("Compras de mercancía", data?.mercanciaComprada)}
          {row("Envíos y comisiones de compra", data?.costosCompras)}
          {row("Envíos y otros costos de venta", data?.costosVentas)}
          {row("Gastos operativos extra", data?.gastosExtra)}
          {Boolean(data?.salidasAnteriores) && row("Otras salidas anteriores", data?.salidasAnteriores)}
        </dl>
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 px-4 sm:px-5 py-4">
      <h2 className="font-semibold" title="Ingresos menos egresos. Flujo registrado, no utilidad.">Balance general</h2>
      <strong className={`text-2xl ${(data?.balance || 0) > 0 ? "text-emerald-700 dark:text-emerald-400" : (data?.balance || 0) < 0 ? "text-rose-700 dark:text-rose-400" : "text-zinc-600 dark:text-zinc-300"}`}>{amount(data?.balance, true)}</strong>
    </div>
  </section>;
}
