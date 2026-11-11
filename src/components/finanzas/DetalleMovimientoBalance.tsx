import React from "react";
import type { BalanceMovimiento } from "../../lib/balanceGeneral";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const dateTime = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short" });

function Dato({ label, value }: { label: string; value?: string | number | null }) {
  return <div className="min-w-0">
    <dt className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{label}</dt>
    <dd className="mt-0.5 break-words text-sm font-medium text-zinc-900 dark:text-zinc-100">{value === null || value === undefined || value === "" ? "No registrado" : value}</dd>
  </div>;
}
function Importe({ label, value }: { label: string; value?: number }) {
  return <Dato label={label} value={money.format(Number(value) || 0)} />;
}

export default function DetalleMovimientoBalance({ movimiento }: { movimiento: BalanceMovimiento }) {
  const source = movimiento.origen;
  return <div className="space-y-5 text-sm">
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
      <Dato label="Tipo de movimiento" value={movimiento.tipo} />
      <Dato label="Fecha y hora" value={movimiento.fecha.getTime() ? dateTime.format(movimiento.fecha) : "Sin fecha"} />
      <Dato label="Referencia / folio" value={movimiento.referencia} />
      <Dato label="Concepto" value={movimiento.descripcion} />
      <Importe label="Ingreso registrado en esta fila" value={movimiento.ingreso} />
      <Importe label="Egreso registrado en esta fila" value={movimiento.egreso} />
      {movimiento.comentario && <div className="sm:col-span-2"><Dato label="Comentarios" value={movimiento.comentario} /></div>}
    </div>
    {source?.tipo === "venta" && <>
      <h3 className="font-semibold">Datos de la venta</h3>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Dato label="Cliente" value={source.registro.cliente_nombre} />
        <Dato label="Canal de venta" value={source.registro.canal_venta_nombre || source.registro.canal_venta} />
        <Dato label="Estado del pago" value={source.registro.estado_pago} />
        <Dato label="Método de pago" value={source.registro.metodo_pago} />
        <Dato label="Drop" value={source.registro.drop_nombre || source.registro.drop_id} />
        <Dato label="Quién entregó" value={source.registro.repartidor_nombre} />
        <Dato label="Ubicación de entrega" value={source.registro.ubicacion_entrega_nombre} />
        <Importe label="Subtotal de mercancía" value={source.registro.venta_subtotal ?? source.registro.total_venta} />
        <Importe label="Entrega pagada por el negocio" value={source.registro.costo_envio_venta} />
        <Importe label="Entrega cubierta por el cliente" value={source.registro.envio_cobrado_cliente} />
        {source.registro.venta_total_cobrado !== undefined && <Importe label="Total de la venta" value={source.registro.venta_total_cobrado} />}
        {source.registro.venta_saldo_pendiente !== undefined && <Importe label="Saldo pendiente al registrar el movimiento" value={source.registro.venta_saldo_pendiente} />}
      </dl>
      {source.partidas.length > 0 && <div>
        <h3 className="font-semibold mb-2">Productos de la venta</h3>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[440px] text-xs text-left">
            <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500">
              <tr><th className="px-3 py-2">SKU / Talla</th><th className="px-3 py-2 text-right">Cantidad</th><th className="px-3 py-2 text-right">Precio unitario</th><th className="px-3 py-2 text-right">Subtotal</th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {source.partidas.map((item, i) => <tr key={item.id || i}>
                <td className="px-3 py-2">{item.sku}{item.talla ? ` · ${item.talla}` : ""}</td>
                <td className="px-3 py-2 text-right tabular-nums">{item.cantidad}</td>
                <td className="px-3 py-2 text-right tabular-nums">{item.precio_unitario_venta === undefined ? "—" : money.format(item.precio_unitario_venta)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{item.total_venta === undefined ? (item.precio_unitario_venta === undefined ? "—" : money.format(item.precio_unitario_venta * item.cantidad)) : money.format(item.total_venta)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>}
    </>}
    {source?.tipo === "compra" && <>
      <h3 className="font-semibold">Datos de la compra</h3>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Dato label="Proveedor" value={source.registro.proveedor} />
        <Dato label="Drop" value={source.registro.drop_nombre || source.registro.drop_id} />
        <Dato label="Referencia de proveedor" value={source.registro.referencia} />
        <Importe label="Subtotal de mercancía" value={source.registro.subtotal} />
        <Importe label="Flete de compra" value={source.registro.costo_envio} />
        <Importe label="Comisiones" value={source.registro.comisiones} />
        <Importe label="Descuentos" value={source.registro.descuentos} />
        <Importe label="Total de la compra" value={source.registro.total} />
      </dl>
      {(source.registro.items || []).length > 0 && <div>
        <h3 className="font-semibold mb-2">Artículos comprados</h3>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[440px] text-xs text-left">
            <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500">
              <tr><th className="px-3 py-2">Producto / SKU</th><th className="px-3 py-2 text-right">Cantidad</th><th className="px-3 py-2 text-right">Costo unitario</th><th className="px-3 py-2 text-right">Subtotal</th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {(source.registro.items || []).map((item, i) => <tr key={`${item.sku}-${item.talla || ""}-${i}`}>
                <td className="px-3 py-2">{item.nombre_producto || item.sku}{item.talla ? ` · ${item.talla}` : ""}</td>
                <td className="px-3 py-2 text-right tabular-nums">{item.cantidad}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money.format(item.costo_unitario)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money.format(item.subtotal)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>}
    </>}
    {source?.tipo === "gasto" && <>
      <h3 className="font-semibold">Datos del gasto</h3>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Dato label="Categoría" value={source.registro.categoria} />
        <Dato label="Proveedor" value={source.registro.proveedor} />
        <Dato label="Método de pago" value={source.registro.metodo_pago} />
        <Dato label="Referencia" value={source.registro.referencia} />
        <Importe label="Monto" value={source.registro.monto} />
        {source.registro.notas && <div className="sm:col-span-2"><Dato label="Notas" value={source.registro.notas} /></div>}
      </dl>
    </>}
    {source?.tipo === "manual" && <>
      <h3 className="font-semibold">Datos del movimiento anterior</h3>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Dato label="Tipo de registro" value={source.registro.tipo} />
        <Dato label="Método de pago" value={source.registro.metodo_pago} />
        <Importe label="Importe original" value={source.registro.monto} />
        {source.registro.notas && <div className="sm:col-span-2"><Dato label="Notas" value={source.registro.notas} /></div>}
      </dl>
    </>}
  </div>;
}
