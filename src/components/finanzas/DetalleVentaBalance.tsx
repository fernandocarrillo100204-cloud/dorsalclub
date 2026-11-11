import React from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { BalanceMovimiento } from "../../lib/balanceGeneral";
import type { Producto, Venta } from "../../types";
import {
  estadoVentaActual, etiquetaUnidades, fechaLegible,
  metodoDelMovimiento, resumenCobroVenta
} from "../../lib/detallesFinancierosVenta";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const dateTime = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });

function Field({ label, value }: { label: string; value?: string | null }) {
  return <div className="min-w-0">
    <dt className="text-xs text-zinc-500 dark:text-zinc-400">{label}</dt>
    <dd className={`mt-1 text-sm break-words ${value ? "font-medium text-zinc-900 dark:text-zinc-100" : "text-zinc-400 dark:text-zinc-500"}`}>
      {value || "No registrado"}
    </dd>
  </div>;
}

function Line({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return <div className={`flex items-center justify-between gap-3 py-1.5 ${strong ? "font-semibold text-zinc-900 dark:text-zinc-100" : "text-zinc-600 dark:text-zinc-300"}`}>
    <span>{label}</span>
    <span className="font-mono tabular-nums whitespace-nowrap">{money.format(value)}</span>
  </div>;
}

function Section({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return <section className="space-y-3">
    <div className="flex items-baseline justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-2">
      <h3 className="font-semibold text-sm">{title}</h3>
      {note && <span className="text-xs text-zinc-500">{note}</span>}
    </div>
    {children}
  </section>;
}

export default function DetalleVentaBalance({ movimiento, ventaActual, cargandoVenta = false, errorVenta, productosPorSku }: {
  movimiento: BalanceMovimiento;
  ventaActual?: Venta | null;
  cargandoVenta?: boolean;
  errorVenta?: string;
  productosPorSku?: ReadonlyMap<string, Producto>;
}) {
  if (movimiento.origen?.tipo !== "venta") return null;
  const { registro, partidas } = movimiento.origen;
  const values = resumenCobroVenta(registro, ventaActual, partidas);
  const reembolso = movimiento.ingreso < 0;
  const abono = registro.subtipo === "abono_venta";
  const titulo = reembolso ? "Reembolso registrado" : abono ? "Abono recibido" : "Cobro registrado";
  const fecha = movimiento.fecha.getTime() ? dateTime.format(movimiento.fecha) : "Sin fecha";
  const unidades = partidas.reduce((sum, item) => sum + item.cantidad, 0);
  const statusCurrent = estadoVentaActual(ventaActual);
  const method = metodoDelMovimiento(registro, ventaActual);
  const pagos = ventaActual?.pagos?.filter(item => item.estado !== "anulado") || [];

  return <div className="space-y-6 text-sm">
    <div className="border-b border-zinc-200 dark:border-zinc-800 pb-5 space-y-4">
      <div className="flex flex-wrap gap-4 justify-between items-end">
        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-2 py-1 text-[11px] font-semibold">
            {reembolso ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true"/> : <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden="true"/>}
            {reembolso ? "Devolución" : abono ? "Abono" : "Venta"}
          </span>
          <p className="text-zinc-500 dark:text-zinc-400 text-xs">{titulo}</p>
        </div>
        <strong className={`text-3xl tabular-nums tracking-tight ${reembolso ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
          {money.format(movimiento.ingreso)}
        </strong>
      </div>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="Folio" value={movimiento.referencia} />
        <Field label="Fecha del movimiento" value={fecha} />
        <Field label="Método de este movimiento" value={cargandoVenta && !registro.metodo_pago ? "Consultando…" : method} />
      </dl>
    </div>

    <Section title="Cliente y operación">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
        <Field label="Cliente" value={ventaActual?.cliente_nombre || registro.cliente_nombre} />
        <Field label="Canal de venta" value={ventaActual?.canal_venta_nombre || registro.canal_venta_nombre || registro.canal_venta} />
        <Field label="Estado del pago al registrar" value={registro.estado_pago} />
        <Field label="Estado actual de la venta" value={cargandoVenta ? "Consultando…" : statusCurrent || "No disponible"} />
        <Field label="Responsable de entrega" value={ventaActual?.repartidor_nombre || registro.repartidor_nombre} />
        <Field label="Ubicación de entrega" value={ventaActual?.ubicacion_entrega_nombre || registro.ubicacion_entrega_nombre} />
      </dl>
      {errorVenta && <p role="status" className="text-xs text-amber-700 dark:text-amber-400">No se pudo actualizar el estado de la venta. Se muestran los datos registrados en el movimiento.</p>}
    </Section>

    <Section title="Cobro y saldo" note={values.esActual ? "Estado actual" : "Importes registrados en el movimiento"}>
      <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
        <div className="space-y-1">
          <Line label="Subtotal de mercancía" value={values.mercancia} />
          <Line label="Entrega cobrada al cliente" value={values.envioCliente} />
          {values.otrosHistoricos > 0 && <Line label="Otros cargos históricos" value={values.otrosHistoricos} />}
          <div className="border-t border-zinc-200 dark:border-zinc-800 pt-1.5">
            <Line label="Total de la venta" value={values.total} strong />
          </div>
        </div>
        <div className="bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3.5 space-y-1">
          <Line label={values.esActual ? "Recibido acumulado" : "Recibido al registrar"} value={values.recibido} />
          <Line label={values.esActual ? "Saldo pendiente actual" : "Saldo al registrar"} value={values.pendiente} strong />
          {!values.esActual && <p className="text-[11px] text-zinc-500 mt-2">El estado actual se consulta solo cuando hay una venta maestra disponible.</p>}
        </div>
      </div>
    </Section>

    {pagos.length > 0 && <Section title="Pagos registrados" note={`${pagos.length} ${pagos.length === 1 ? "pago" : "pagos"}`}>
      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[440px] text-xs">
          <thead className="bg-zinc-50 dark:bg-zinc-800/70 text-zinc-500"><tr>
            <th scope="col" className="px-3 py-2.5 text-left">Fecha</th>
            <th scope="col" className="px-3 py-2.5 text-left">Método</th>
            <th scope="col" className="px-3 py-2.5 text-right">Monto</th>
          </tr></thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {pagos.map((pago, index) => <tr key={pago.id || index}>
              <td className="px-3 py-2.5 whitespace-nowrap">{dateTime.format(fechaLegible(pago.fecha))}</td>
              <td className="px-3 py-2.5">{pago.metodo_pago || "No registrado"}</td>
              <td className="px-3 py-2.5 text-right tabular-nums font-medium">{money.format(pago.monto)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </Section>}

    <Section title="Artículos vendidos" note={`${etiquetaUnidades(unidades)} · ${partidas.length} ${partidas.length === 1 ? "partida" : "partidas"}`}>
      {partidas.length ? <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800" role="region" aria-label="Artículos vendidos, tabla desplazable horizontalmente" tabIndex={0}>
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead className="bg-zinc-50 dark:bg-zinc-800/70 text-zinc-500 dark:text-zinc-400"><tr>
            {["Producto", "Marca", "SKU", "Talla", "Drop", "Cantidad", "Precio unitario", "Subtotal"].map((label,i) =>
              <th key={label} scope="col" className={`px-3 py-3 whitespace-nowrap font-semibold ${i >= 5 ? "text-right" : ""}`}>{label}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {partidas.map((item,i)=>{
              const catalogo = productosPorSku?.get(item.sku.trim().toUpperCase());
              return <tr key={item.id || i}>
                <td className="px-3 py-3 min-w-[135px] font-medium">{catalogo?.nombre || item.sku}</td>
                <td className="px-3 py-3">{catalogo?.marca || "No registrada"}</td>
                <td className="px-3 py-3 font-mono whitespace-nowrap">{item.sku}</td>
                <td className="px-3 py-3">{item.talla || "Sin talla"}</td>
                <td className="px-3 py-3 whitespace-nowrap">{item.drop_nombre || item.drop_id || "No registrado"}</td>
                <td className="px-3 py-3 text-right tabular-nums">{item.cantidad}</td>
                <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{typeof item.precio_unitario_venta === "number" ? money.format(item.precio_unitario_venta) : "—"}</td>
                <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap font-semibold">{money.format(item.total_venta ?? ((item.precio_unitario_venta || 0) * item.cantidad))}</td>
              </tr>;
            })}
          </tbody>
          <tfoot className="bg-zinc-50 dark:bg-zinc-800/60 border-t border-zinc-200 dark:border-zinc-700 font-semibold">
            <tr>
              <th scope="row" colSpan={5} className="px-3 py-3">Total de artículos</th>
              <td className="px-3 py-3 text-right tabular-nums">{unidades}</td>
              <td className="px-3 py-3 text-right text-zinc-400">—</td>
              <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{money.format(partidas.reduce((sum,item)=>sum+(item.total_venta ?? (item.precio_unitario_venta || 0)*item.cantidad),0))}</td>
            </tr>
          </tfoot>
        </table>
      </div> : <p className="text-zinc-500 text-sm">No hay partidas de mercancía disponibles para este movimiento.</p>}
      <p className="text-[11px] text-zinc-500">El nombre y la marca de ventas antiguas se consultan del catálogo actual cuando están disponibles; los importes y drops son los registrados al vender.</p>
    </Section>
  </div>;
}
