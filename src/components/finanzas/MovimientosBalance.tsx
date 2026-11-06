import React, { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { BalanceGeneral } from "../../lib/balanceGeneral";
import type { Gasto } from "../../types";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export default function MovimientosBalance({ data, loading, busy, onEdit, onArchive }: {
  data: BalanceGeneral | null; loading: boolean; busy: boolean;
  onEdit: (gasto: Gasto) => void; onArchive: (gasto: Gasto) => void;
}) {
  const [visible, setVisible] = useState(20);
  return <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
    <div className="p-5">
      <h2 className="text-lg font-bold">Detalle de ingresos y egresos</h2>
      <p className="text-sm text-zinc-500 mt-1">Todos los movimientos, del más reciente al más antiguo. Las compras incluyen sus envíos y comisiones; los cobros incluyen los cargos al cliente. No necesitas capturarlos otra vez.</p>
      <p className="text-xs text-zinc-500 mt-2">Los reembolsos aparecen como ingresos negativos. Los gastos extra se editan aquí; las compras y ventas se gestionan en sus apartados.</p>
    </div>
    {loading ? <p role="status" className="p-5 text-zinc-500">Cargando movimientos…</p> : !data?.movimientos.length ? <p className="px-5 pb-5 text-sm text-zinc-500">No hay ingresos ni egresos registrados.</p> : <>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Historial acumulado de ingresos y egresos</caption>
          <thead className="bg-zinc-50 dark:bg-zinc-800 text-zinc-500"><tr>
            {["Fecha", "Tipo", "Descripción", "Ingreso", "Egreso", "Comentario", "Acciones"].map(label => <th key={label} scope="col" className={`p-4 ${["Ingreso", "Egreso", "Acciones"].includes(label) ? "text-right" : ""}`}>{label}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">{data.movimientos.slice(0, visible).map(row => <tr key={row.id}>
            <td className="p-4 whitespace-nowrap">{row.fecha.toLocaleDateString("es-MX")}</td>
            <td className="p-4 whitespace-nowrap"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${row.ingreso > 0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300"}`}>{row.tipo}</span></td>
            <td className="p-4 min-w-56 max-w-md"><p className="font-medium whitespace-pre-wrap break-words">{row.descripcion}</p>{row.referencia && <p className="mt-1 text-xs text-zinc-500 break-all">Ref. {row.referencia}</p>}</td>
            <td className={`p-4 text-right whitespace-nowrap tabular-nums ${row.ingreso < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>{row.ingreso ? money.format(row.ingreso) : "—"}</td>
            <td className="p-4 text-right whitespace-nowrap tabular-nums text-rose-600 dark:text-rose-400">{row.egreso ? money.format(row.egreso) : "—"}</td>
            <td className="p-4 min-w-40 max-w-xs whitespace-pre-wrap break-words text-zinc-500">{row.comentario || "—"}</td>
            <td className="p-4">{row.gasto ? <div className="flex justify-end gap-1">
              <button type="button" className="btn-icon" aria-label={`Editar ${row.descripcion}`} disabled={busy} onClick={() => onEdit(row.gasto!)}><Pencil className="h-4 w-4" /></button>
              <button type="button" className="btn-icon text-rose-600" aria-label={`Enviar ${row.descripcion} a papelera`} disabled={busy} onClick={() => onArchive(row.gasto!)}><Trash2 className="h-4 w-4" /></button>
            </div> : <span className="block text-right text-zinc-400">—</span>}</td>
          </tr>)}</tbody>
          <tfoot className="bg-zinc-50 dark:bg-zinc-800 font-semibold"><tr>
            <th scope="row" colSpan={3} className="p-4">Total de todo el historial</th>
            <td className="p-4 text-right whitespace-nowrap tabular-nums">{money.format(data.ingresos)}</td>
            <td className="p-4 text-right whitespace-nowrap tabular-nums">{money.format(data.egresos)}</td>
            <td colSpan={2} />
          </tr></tfoot>
        </table>
      </div>
      <div className="p-4 text-center">
        <p className="text-xs text-zinc-500">Mostrando {Math.min(visible, data.movimientos.length)} de {data.movimientos.length} movimientos. Los totales incluyen todo el historial.</p>
        {visible < data.movimientos.length && <button type="button" className="btn-secondary mt-3" onClick={() => setVisible(value => value + 20)}>Cargar más</button>}
      </div>
    </>}
  </section>;
}
