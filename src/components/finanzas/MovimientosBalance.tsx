import React, { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Pencil, Trash2 } from "lucide-react";
import type { BalanceGeneral, BalanceMovimiento } from "../../lib/balanceGeneral";
import Dialog from "../ui/Dialog";
import DetalleMovimientoBalance from "./DetalleMovimientoBalance";
import type { Gasto, Producto, Venta } from "../../types";
import { firestoreService } from "../../lib/firebase";
import { idVentaRelacionada } from "../../lib/detallesFinancierosVenta";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const date = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" });

function CellText({ text, limit = 100 }: { text: string; limit?: number }) {
  if (text.length <= limit) return <span className="whitespace-pre-wrap break-words">{text}</span>;
  return <details className="group"><summary className="cursor-pointer focus-visible:outline-emerald-500 list-none">
    <span className="group-open:hidden">{text.slice(0, limit)}… <span className="text-emerald-700 dark:text-emerald-400 text-xs underline">Ver más</span></span>
    <span className="hidden group-open:inline text-xs underline">Ver menos</span>
  </summary><p className="whitespace-pre-wrap break-words mt-1">{text}</p></details>;
}

export default function MovimientosBalance({ data, loading, busy, productos = [], onEdit, onArchive }: {
  data: BalanceGeneral | null; loading: boolean; busy: boolean;
  productos?: Producto[];
  onEdit: (gasto: Gasto) => void; onArchive: (gasto: Gasto) => void;
}) {
  const marcasPorSku = useMemo(() => new Map(
    productos.filter(producto => producto.marca?.trim()).map(producto => [producto.sku.trim().toUpperCase(), producto.marca!.trim()])
  ), [productos]);
  const productosPorSku = useMemo(() => new Map(
    productos.map(producto => [producto.sku.trim().toUpperCase(), producto])
  ), [productos]);
  const [visible, setVisible] = useState(20);
  const [selected, setSelected] = useState<BalanceMovimiento | null>(null);
  const [master, setMaster] = useState<{ id: string; venta: Venta | null } | null>(null);
  const [masterLoading, setMasterLoading] = useState(false);
  const [masterError, setMasterError] = useState("");
  const cache = useRef(new Map<string, Venta | null>());
  const ventaId = selected?.origen?.tipo === "venta" ? idVentaRelacionada(selected.origen.registro) : "";

  useEffect(() => {
    if (!ventaId) {
      setMasterLoading(false);
      setMasterError("");
      return;
    }
    if (cache.current.has(ventaId)) {
      setMaster({ id: ventaId, venta: cache.current.get(ventaId) ?? null });
      setMasterLoading(false);
      setMasterError("");
      return;
    }
    let cancelled = false;
    setMasterLoading(true);
    setMasterError("");
    void firestoreService.getVentaMaestraById(ventaId).then(venta => {
      if (cancelled) return;
      cache.current.set(ventaId, venta);
      setMaster({ id: ventaId, venta });
      setMasterLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setMasterLoading(false);
      setMasterError("No se pudo consultar la venta actual.");
    });
    return () => { cancelled = true; };
  }, [ventaId]);

  const ventaRelacionada = selected?.tipo === "Costo de venta" && ventaId
    ? data?.movimientos.find(row =>
        row.origen?.tipo === "venta" &&
        row.tipo !== "Costo de venta" &&
        !row.origen.registro.subtipo &&
        idVentaRelacionada(row.origen.registro) === ventaId
      )
    : undefined;
  return <section className="min-w-0 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
    <div className="px-4 sm:px-5 py-4 flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold">Movimientos</h2>
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{loading ? "Cargando…" : `${data?.movimientos.length ?? 0} registros`}</span>
    </div>
    {!loading && !data?.movimientos.length && <p className="px-4 sm:px-5 pb-4 text-sm text-zinc-500 dark:text-zinc-400">Sin movimientos registrados</p>}
      <div className="overflow-x-auto focus-visible:outline-emerald-500" tabIndex={0} role="region" aria-label="Tabla de movimientos, desplazamiento horizontal">
        <table className="w-full min-w-[800px] text-left text-sm">
          <caption className="sr-only">Historial acumulado de ingresos y egresos</caption>
          <thead className="bg-zinc-50 dark:bg-zinc-800 text-zinc-500"><tr>
            {["Fecha", "Tipo", "Descripción", "Ingreso", "Egreso", "Comentario", "Acciones"].map(label => <th key={label} scope="col" className={`p-4 ${["Ingreso", "Egreso", "Acciones"].includes(label) ? "text-right" : ""}`}>{label}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {loading ? <tr><td colSpan={7} className="p-6 text-zinc-500" role="status">Cargando movimientos…</td></tr> : !data?.movimientos.length ? null : data.movimientos.slice(0, visible).map(row => <tr key={row.id} className="align-top hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
            <td className="px-4 py-3 whitespace-nowrap text-zinc-600 dark:text-zinc-300">{row.fecha.getTime() ? date.format(row.fecha) : "Sin fecha"}</td>
            <td className="px-4 py-3 whitespace-nowrap"><span className={`inline-block rounded-md px-2 py-1 text-xs font-medium ${row.ingreso > 0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : row.ingreso < 0 || row.egreso > 0 ? "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}>{row.tipo}</span></td>
            <td className="px-4 py-3 min-w-52 max-w-sm"><div className="font-medium"><CellText text={row.descripcion} /></div>{row.referencia && <details className="mt-1 text-xs text-zinc-500 dark:text-zinc-400"><summary className="cursor-pointer w-fit focus-visible:outline-emerald-500">Referencia</summary><p className="break-all mt-1 select-all">{row.referencia}</p></details>}</td>
            <td className={`px-4 py-3 text-right whitespace-nowrap font-medium tabular-nums ${row.ingreso < 0 ? "text-rose-700 dark:text-rose-400" : row.ingreso > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-400"}`}>{row.ingreso ? money.format(row.ingreso) : "—"}</td>
            <td className={`px-4 py-3 text-right whitespace-nowrap font-medium tabular-nums ${row.egreso ? "text-rose-700 dark:text-rose-400" : "text-zinc-400"}`}>{row.egreso ? money.format(row.egreso) : "—"}</td>
            <td className="px-4 py-3 min-w-36 max-w-xs text-zinc-600 dark:text-zinc-300"><CellText text={row.comentario || "—"} limit={70} /></td>
            <td className="px-4 py-3">
              <div className="flex items-center justify-end gap-2">
                <button type="button" className="btn-secondary whitespace-nowrap" title="Consultar esta operación"
                  aria-label={`Ver detalle de ${row.tipo}: ${row.referencia || row.descripcion}`}
                  onClick={() => setSelected(row)}>
                  <Eye aria-hidden="true" className="h-4 w-4" /> Ver detalle
                </button>
                {row.gasto && <>
                  <button type="button" className="btn-icon" title="Editar gasto" aria-label={`Editar ${row.descripcion}`} disabled={busy} onClick={() => onEdit(row.gasto!)}><Pencil className="h-4 w-4" /></button>
                  <button type="button" className="btn-icon text-rose-600" title="Enviar a papelera" aria-label={`Enviar ${row.descripcion} a papelera`} disabled={busy} onClick={() => onArchive(row.gasto!)}><Trash2 className="h-4 w-4" /></button>
                </>}
              </div>
            </td>
          </tr>)}</tbody>
          {!loading && data && <tfoot className="bg-zinc-50 dark:bg-zinc-800 font-semibold"><tr>
            <th scope="row" colSpan={3} className="p-4">Total acumulado</th>
            <td className="p-4 text-right whitespace-nowrap tabular-nums">{money.format(data.ingresos)}</td>
            <td className="p-4 text-right whitespace-nowrap tabular-nums">{money.format(data.egresos)}</td>
            <td colSpan={2} />
          </tr></tfoot>}
        </table>
      </div>
      {!loading && Boolean(data?.movimientos.length) && <div className="px-4 py-3 flex items-center justify-between gap-3 border-t border-zinc-200 dark:border-zinc-800">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{Math.min(visible, data!.movimientos.length)} de {data!.movimientos.length}</p>
        {visible < data!.movimientos.length && <button type="button" className="btn-secondary" onClick={() => setVisible(value => value + 20)}>Cargar más</button>}
      </div>}
      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)}
        title={!selected ? "Detalle del movimiento" :
          selected.tipo === "Costo de venta"
            ? "Detalle de entrega y costos"
            : `Detalle de ${selected.tipo}`}
        description={selected?.referencia || "Información del registro financiero"}
        className={selected?.origen?.tipo === "compra" ||
          (selected?.origen?.tipo === "venta" && selected.tipo !== "Costo de venta")
          ? "balance-detail-dialog balance-detail-dialog-wide" : "balance-detail-dialog"}>
        {selected && <DetalleMovimientoBalance
          movimiento={selected}
          marcasPorSku={marcasPorSku}
          productosPorSku={productosPorSku}
          ventaActual={master?.id === ventaId ? master.venta : null}
          cargandoVenta={masterLoading || Boolean(ventaId && master?.id !== ventaId && !masterError)}
          errorVenta={masterError}
          onVerVenta={ventaRelacionada ? () => setSelected(ventaRelacionada) : undefined}
        />}
      </Dialog>
  </section>;
}
