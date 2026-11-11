import React from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { BalanceMovimiento } from "../../lib/balanceGeneral";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const dateTime = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short" });

function Dato({ label, value, wide = false }: { label: string; value?: string | number | null; wide?: boolean }) {
  const absent = value === null || value === undefined || value === "";
  return <div className={`min-w-0 ${wide ? "sm:col-span-2" : ""}`}>
    <dt className="text-xs text-zinc-500 dark:text-zinc-400">{label}</dt>
    <dd className={`mt-1 break-words text-sm leading-relaxed ${absent ? "text-zinc-400 dark:text-zinc-500" : "font-medium text-zinc-900 dark:text-zinc-100"}`}>
      {absent ? "No registrado" : value}
    </dd>
  </div>;
}

function Importe({ label, value }: { label: string; value?: number }) {
  return <Dato label={label} value={money.format(Number(value) || 0)} />;
}

function Seccion({ title, children, detail }: { title: string; children: React.ReactNode; detail?: string }) {
  return <section className="space-y-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-2">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
      {detail && <span className="text-xs text-zinc-500 dark:text-zinc-400">{detail}</span>}
    </div>
    {children}
  </section>;
}

function TablaArticulos({ headers, children }: { headers: [string, string, string, string]; children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
    <table className="w-full min-w-[460px] text-left text-xs">
      <thead className="bg-zinc-50 dark:bg-zinc-800/70 text-zinc-500 dark:text-zinc-400">
        <tr>
          {headers.map((header, i) => <th key={header} scope="col" className={`px-3 py-3 font-semibold ${i ? "text-right" : ""}`}>{header}</th>)}
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">{children}</tbody>
    </table>
  </div>;
}

export default function DetalleMovimientoBalance({ movimiento, marcasPorSku }: {
  movimiento: BalanceMovimiento;
  marcasPorSku?: ReadonlyMap<string, string>;
}) {
  const source = movimiento.origen;
  const income = movimiento.ingreso > 0;
  const refund = movimiento.ingreso < 0;
  const amount = movimiento.ingreso !== 0 ? movimiento.ingreso : movimiento.egreso;
  const direction = income ? "Ingreso" : refund ? "Reembolso" : "Egreso";
  const amountColor = income ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-900 dark:text-zinc-100";

  return <div className="space-y-6 text-sm">
    {/* La cifra principal se separa del resto de los datos para facilitar la lectura. */}
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-5">
        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {income ? <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />}
            {direction} · {movimiento.tipo}
          </span>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Importe del movimiento</p>
        </div>
        <strong className={`text-3xl tracking-tight tabular-nums font-semibold ${amountColor}`}>{money.format(amount)}</strong>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
        <Dato label="Tipo de movimiento" value={movimiento.tipo} />
        <Dato label="Fecha y hora" value={movimiento.fecha.getTime() ? dateTime.format(movimiento.fecha) : "Sin fecha"} />
        <Dato label="Referencia / folio" value={movimiento.referencia} />
        <Dato label="Concepto" value={movimiento.descripcion} />
        <Importe label="Ingreso registrado en esta fila" value={movimiento.ingreso} />
        <Importe label="Egreso registrado en esta fila" value={movimiento.egreso} />
        {movimiento.comentario && <Dato wide label="Comentarios" value={movimiento.comentario} />}
      </dl>
    </section>

    {source?.tipo === "venta" && <>
      <Seccion title="Datos de la venta">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <Dato label="Cliente" value={source.registro.cliente_nombre} />
          <Dato label="Canal de venta" value={source.registro.canal_venta_nombre || source.registro.canal_venta} />
          <Dato label="Estado del pago" value={source.registro.estado_pago} />
          <Dato label="Método de pago" value={source.registro.metodo_pago} />
          <Dato label="Drop" value={source.registro.drop_nombre || source.registro.drop_id} />
          <Dato label="Quién entregó" value={source.registro.repartidor_nombre} />
          <Dato label="Ubicación de entrega" value={source.registro.ubicacion_entrega_nombre} />
        </dl>
      </Seccion>
      <Seccion title="Importes de la venta">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <Importe label="Subtotal de mercancía" value={source.registro.venta_subtotal ?? source.registro.total_venta} />
          <Importe label="Entrega pagada por el negocio" value={source.registro.costo_envio_venta} />
          <Importe label="Entrega cubierta por el cliente" value={source.registro.envio_cobrado_cliente} />
          {source.registro.venta_total_cobrado !== undefined && <Importe label="Total de la venta" value={source.registro.venta_total_cobrado} />}
          {source.registro.venta_saldo_pendiente !== undefined && <Importe label="Saldo pendiente al registrar el movimiento" value={source.registro.venta_saldo_pendiente} />}
        </dl>
      </Seccion>
      {source.partidas.length > 0 && <Seccion title="Productos de la venta" detail={`${source.partidas.reduce((sum, item) => sum + item.cantidad, 0)} unidades`}>
        <TablaArticulos headers={["SKU / Talla", "Cantidad", "Precio unitario", "Subtotal"]}>
          {source.partidas.map((item, i) => <tr key={item.id || i} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30">
            <td className="px-3 py-3 font-medium text-zinc-900 dark:text-zinc-100">{item.sku}{item.talla ? <span className="block text-[11px] font-normal text-zinc-500">Talla {item.talla}</span> : null}</td>
            <td className="px-3 py-3 text-right tabular-nums">{item.cantidad}</td>
            <td className="px-3 py-3 text-right tabular-nums">{item.precio_unitario_venta === undefined ? "—" : money.format(item.precio_unitario_venta)}</td>
            <td className="px-3 py-3 text-right tabular-nums font-semibold">{item.total_venta === undefined ? item.precio_unitario_venta === undefined ? "—" : money.format(item.precio_unitario_venta * item.cantidad) : money.format(item.total_venta)}</td>
          </tr>)}
        </TablaArticulos>
      </Seccion>}
    </>}

    {source?.tipo === "compra" && <>
      <Seccion title="Datos de la compra">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <Dato label="Proveedor" value={source.registro.proveedor} />
          <Dato label="Drop" value={source.registro.drop_nombre || source.registro.drop_id} />
          <Dato label="Referencia de proveedor" value={source.registro.referencia} />
        </dl>
      </Seccion>
      <Seccion title="Desglose de importes">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <Importe label="Subtotal de mercancía" value={source.registro.subtotal} />
          <Importe label="Flete de compra" value={source.registro.costo_envio} />
          <Importe label="Comisiones" value={source.registro.comisiones} />
          <Importe label="Descuentos" value={source.registro.descuentos} />
          <div className="sm:col-span-2 border-t border-zinc-200 dark:border-zinc-800 pt-3">
            <Importe label="Total de la compra" value={source.registro.total} />
          </div>
        </dl>
      </Seccion>
      {(source.registro.items || []).length > 0 && <Seccion title="Artículos comprados" detail={`${source.registro.items.reduce((sum, item) => sum + item.cantidad, 0)} unidades · ${source.registro.items.length} partidas`}>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800" role="region" tabIndex={0} aria-label="Artículos comprados, tabla desplazable horizontalmente">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-800/70 text-zinc-500 dark:text-zinc-400">
              <tr>
                {["Producto", "Marca", "SKU", "Talla", "Drop", "Cantidad", "Costo unitario", "Subtotal"].map((header, index) =>
                  <th scope="col" key={header} className={`px-3 py-3 font-semibold whitespace-nowrap ${index >= 5 ? "text-right" : ""}`}>{header}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {source.registro.items.map((item, index) => {
                const marca = item.marca?.trim() || marcasPorSku?.get(item.sku.trim().toUpperCase()) || "No registrada";
                const drop = source.registro.drop_nombre || source.registro.drop_id || "Sin drop asignado";
                return <tr key={`${item.sku}-${item.talla || ""}-${index}`} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30">
                  <td className="px-3 py-3 font-medium text-zinc-900 dark:text-zinc-100 min-w-[145px] break-words">{item.nombre_producto || item.sku}</td>
                  <td className="px-3 py-3 text-zinc-600 dark:text-zinc-300">{marca}</td>
                  <td className="px-3 py-3 text-zinc-600 dark:text-zinc-300 font-mono whitespace-nowrap">{item.sku}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{item.talla || "Única"}</td>
                  <td className="px-3 py-3 text-zinc-600 dark:text-zinc-300 whitespace-nowrap">{drop}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{item.cantidad}</td>
                  <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{money.format(item.costo_unitario)}</td>
                  <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap font-semibold">{money.format(item.subtotal)}</td>
                </tr>;
              })}
            </tbody>
            <tfoot className="bg-zinc-50 dark:bg-zinc-800/60 border-t border-zinc-200 dark:border-zinc-700 font-semibold">
              <tr>
                <th scope="row" colSpan={5} className="px-3 py-3 text-zinc-800 dark:text-zinc-100">Total de partidas</th>
                <td className="px-3 py-3 text-right tabular-nums">{source.registro.items.reduce((sum, item) => sum + item.cantidad, 0)}</td>
                <td className="px-3 py-3 text-right text-zinc-400">—</td>
                <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{money.format(source.registro.items.reduce((sum, item) => sum + item.subtotal, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Seccion>}
    </>}

    {source?.tipo === "gasto" && <Seccion title="Datos del gasto">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
        <Dato label="Categoría" value={source.registro.categoria} />
        <Dato label="Proveedor" value={source.registro.proveedor} />
        <Dato label="Método de pago" value={source.registro.metodo_pago} />
        <Dato label="Referencia" value={source.registro.referencia} />
        <Importe label="Monto" value={source.registro.monto} />
        {source.registro.notas && <Dato wide label="Notas" value={source.registro.notas} />}
      </dl>
    </Seccion>}

    {source?.tipo === "manual" && <Seccion title="Datos del movimiento anterior">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
        <Dato label="Tipo de registro" value={source.registro.tipo} />
        <Dato label="Método de pago" value={source.registro.metodo_pago} />
        <Importe label="Importe original" value={source.registro.monto} />
        {source.registro.notas && <Dato wide label="Notas" value={source.registro.notas} />}
      </dl>
    </Seccion>}
  </div>;
}
