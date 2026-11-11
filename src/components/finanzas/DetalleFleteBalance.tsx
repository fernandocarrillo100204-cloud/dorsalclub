import React from "react";
import { ArrowUpRight, Truck } from "lucide-react";
import type { BalanceMovimiento } from "../../lib/balanceGeneral";
import type { Venta } from "../../types";
import { resumenCostoEntrega } from "../../lib/detallesFinancierosVenta";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const dateTime = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short" });

function Field({ label, value }: { label: string; value?: string | null }) {
  return <div className="min-w-0">
    <dt className="text-xs text-zinc-500 dark:text-zinc-400">{label}</dt>
    <dd className={`mt-1 break-words text-sm ${value ? "text-zinc-900 dark:text-zinc-100 font-medium" : "text-zinc-400 dark:text-zinc-500"}`}>{value || "No registrado"}</dd>
  </div>;
}
function MoneyRow({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return <div className={`flex items-center justify-between gap-3 py-2 ${strong ? "font-semibold text-zinc-900 dark:text-zinc-100" : "text-zinc-600 dark:text-zinc-300"}`}>
    <span>{label}</span><span className="font-mono tabular-nums">{money.format(value)}</span>
  </div>;
}

export default function DetalleFleteBalance({ movimiento, ventaActual, onVerVenta }: {
  movimiento: BalanceMovimiento;
  ventaActual?: Venta | null;
  onVerVenta?: () => void;
}) {
  if (movimiento.origen?.tipo !== "venta") return null;
  const registro = movimiento.origen.registro;
  const info = resumenCostoEntrega(registro, movimiento.egreso, ventaActual);
  const soloEntrega = info.otrosCostos <= 0.009 && info.costoEntrega > 0;
  const cliente = ventaActual?.cliente_nombre || registro.cliente_nombre;
  const persona = ventaActual?.repartidor_nombre || registro.repartidor_nombre;
  const destino = ventaActual?.ubicacion_entrega_nombre || registro.ubicacion_entrega_nombre;
  const fecha = movimiento.fecha.getTime() ? dateTime.format(movimiento.fecha) : "Sin fecha";

  return <div className="space-y-6 text-sm">
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-5">
        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-md px-2 py-1 text-[11px] font-semibold">
            <Truck className="h-3.5 w-3.5" aria-hidden="true" />
            {soloEntrega ? "Flete de entrega" : "Costo asociado a la venta"}
          </span>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Egreso registrado</p>
        </div>
        <strong className="text-3xl tracking-tight tabular-nums text-zinc-900 dark:text-zinc-100">{money.format(-info.costoTotal)}</strong>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Quién entregó" value={persona} />
        <Field label="Ubicación de entrega" value={destino} />
        <Field label="Fecha del movimiento" value={fecha} />
        <Field label="Venta relacionada" value={movimiento.referencia} />
      </dl>
    </section>

    <section className="space-y-3">
      <h3 className="text-sm font-semibold border-b border-zinc-200 dark:border-zinc-800 pb-2">Desglose de la entrega</h3>
      <div className="space-y-1">
        {info.costoEntrega > 0 && <MoneyRow label="Costo real de la entrega" value={info.costoEntrega} />}
        {info.otrosCostos > 0 && <MoneyRow label={info.costoEntrega > 0 ? "Otros costos históricos" : "Costo histórico no desglosado"} value={info.otrosCostos} />}
        <MoneyRow label="Costo total del movimiento" value={info.costoTotal} strong />
        <MoneyRow label="Cubierto por el cliente" value={info.cargoCliente} />
        <div className="border-t border-zinc-200 dark:border-zinc-800 pt-2">
          <MoneyRow label="Costo absorbido por el negocio" value={info.absorbido} strong />
        </div>
        {info.excedente > 0 && <MoneyRow label="Cobertura excedente del cliente" value={info.excedente} />}
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        El costo se registra como egreso en Balance general. Lo cubierto por el cliente forma parte del cobro de la venta; aquí no se vuelve a contabilizar.
      </p>
    </section>

    <section className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <dl className="grid gap-2">
          <Field label="Cliente" value={cliente} />
          <Field label="Canal" value={ventaActual?.canal_venta_nombre || registro.canal_venta_nombre} />
        </dl>
        {onVerVenta && <button type="button" className="btn-secondary" onClick={onVerVenta}>
          Ver venta relacionada <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
        </button>}
      </div>
    </section>
  </div>;
}
