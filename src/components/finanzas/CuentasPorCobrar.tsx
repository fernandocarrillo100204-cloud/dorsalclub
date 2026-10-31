import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { firestoreService } from "../../lib/firebase";
import { CuentaPorCobrar, OpcionListaConfigurable } from "../../types";
import { mensajeError } from "../../lib/errores";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export default function CuentasPorCobrar() {
  const [accounts, setAccounts] = useState<CuentaPorCobrar[]>([]);
  const [methods, setMethods] = useState<OpcionListaConfigurable[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [paymentMethods, setPaymentMethods] = useState<Record<string, string>>({});
  const requestRef = useRef(0);
  const [hasData, setHasData] = useState(false);

  const load = useCallback(async (refresh = false) => {
    const request = ++requestRef.current;
    refresh ? setRefreshing(true) : setLoading(true); setError("");
    try {
      const [nextAccounts, config] = await Promise.all([firestoreService.getCuentasPorCobrar(), firestoreService.getConfiguracionListasDesplegables()]);
      if (request !== requestRef.current) return;
      setAccounts(nextAccounts); setMethods(config.metodos_pago_venta.filter(item => item.activa));
      setHasData(true);
      setAmounts(Object.fromEntries(nextAccounts.map(account => [account.venta_id, account.pendiente.toFixed(2)])));
    } catch (cause: any) { if (request === requestRef.current) setError(mensajeError(cause, "No fue posible consultar las cuentas por cobrar.")); }
    finally { if (request === requestRef.current) { setLoading(false); setRefreshing(false); } }
  }, []);
  useEffect(() => { load(); return () => { requestRef.current += 1; }; }, [load]);
  const totalPending = useMemo(() => accounts.reduce((sum, item) => sum + item.pendiente, 0), [accounts]);

  const registerPayment = async (account: CuentaPorCobrar) => {
    const amount = Number(amounts[account.venta_id]); const method = paymentMethods[account.venta_id] || "";
    if (!Number.isFinite(amount) || amount <= 0 || amount > account.pendiente) return setError("El pago debe ser mayor a cero y no puede superar el saldo pendiente.");
    if (!method) return setError("Selecciona el método de pago.");
    setBusyId(account.venta_id); setError("");
    try { await firestoreService.registrarPagoPedido(account.venta_id, amount, method); await load(true); }
    catch (cause: any) { setError(cause?.message || "No fue posible registrar el pago."); }
    finally { setBusyId(""); }
  };

  return <div className="space-y-5">
    <header className="flex items-start justify-between gap-4"><div><h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Cuentas por cobrar</h1><p className="text-sm text-zinc-500 mt-1">Saldos vigentes de ventas. Registrar un pago actualiza la venta y el flujo financiero automáticamente.</p></div><button onClick={() => load(true)} disabled={refreshing || loading} className="p-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700" aria-label="Actualizar"><RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} /></button></header>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4"><span className="text-xs text-zinc-500">Saldo total pendiente</span><strong className="block text-2xl font-mono text-amber-600 mt-1">{loading ? "…" : hasData ? money.format(totalPending) : "—"}</strong></div><div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4"><span className="text-xs text-zinc-500">Ventas con saldo</span><strong className="block text-2xl text-zinc-900 dark:text-white mt-1">{loading ? "…" : hasData ? accounts.length : "—"}</strong></div></div>
    {error && <div className="flex gap-2 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 p-4 text-sm text-rose-700 dark:text-rose-300"><AlertTriangle className="w-4 h-4 shrink-0" />{error}</div>}
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-zinc-50 dark:bg-zinc-950 text-[11px] uppercase text-zinc-500"><tr><th className="text-left px-4 py-3">Fecha</th><th className="text-left px-4 py-3">Cliente / venta</th><th className="text-right px-4 py-3">Total</th><th className="text-right px-4 py-3">Cobrado</th><th className="text-right px-4 py-3">Pendiente</th><th className="text-left px-4 py-3">Registrar pago</th></tr></thead><tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">{loading ? <tr><td colSpan={6} className="p-10 text-center text-zinc-500">Cargando cuentas…</td></tr> : accounts.length === 0 ? <tr><td colSpan={6} className="p-10 text-center text-zinc-500">{hasData ? "No hay ventas con saldo pendiente." : "No fue posible consultar las cuentas. Usa Actualizar para reintentar."}</td></tr> : accounts.map(account => <tr key={account.venta_id}><td className="px-4 py-3 whitespace-nowrap">{account.fecha.toLocaleDateString("es-MX")}</td><td className="px-4 py-3"><strong className="block">{account.cliente_nombre}</strong><span className="text-xs text-zinc-500">{account.folio} · {account.canal_venta_nombre}</span></td><td className="px-4 py-3 text-right font-mono">{money.format(account.total)}</td><td className="px-4 py-3 text-right font-mono text-emerald-600">{money.format(account.cobrado)}</td><td className="px-4 py-3 text-right font-mono text-amber-600 font-bold">{money.format(account.pendiente)}</td><td className="px-4 py-3"><div className="grid grid-cols-[110px_150px_auto] gap-2 min-w-[390px]"><input type="number" min="0.01" max={account.pendiente} step="0.01" value={amounts[account.venta_id] || ""} onChange={event => setAmounts(current => ({ ...current, [account.venta_id]: event.target.value }))} className="px-2 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950" aria-label={`Pago para ${account.folio}`} /><select value={paymentMethods[account.venta_id] || ""} onChange={event => setPaymentMethods(current => ({ ...current, [account.venta_id]: event.target.value }))} className="px-2 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950"><option value="">Método</option>{methods.map(item => <option key={item.id} value={item.nombre}>{item.nombre}</option>)}</select><button onClick={() => registerPayment(account)} disabled={busyId !== "" || refreshing || loading} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-50">{busyId === account.venta_id ? "Guardando…" : "Registrar"}</button></div></td></tr>)}</tbody></table></div></div>
  </div>;
}
