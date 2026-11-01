import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, RefreshCw, Search } from "lucide-react";
import { firestoreService } from "../../lib/firebase";
import { CuentaPorCobrar, OpcionListaConfigurable } from "../../types";
import { mensajeError } from "../../lib/errores";
import { fechaLocal } from "../../lib/lecturasVentas";
import { downloadCsv, money, searchText } from "../../lib/presentation";
import { useUnsavedChanges, useWorkspace } from "../../context/WorkspaceContext";
import { ErrorState, FilterSummary, PageHeader, StatCard } from "../ui/Page";

export default function CuentasPorCobrar({ navigationTabs, headerActions, configVersion = 0 }: {
  navigationTabs?: React.ReactNode; headerActions?: React.ReactNode; configVersion?: number;
}) {
  const { confirm, notify } = useWorkspace();
  const [accounts, setAccounts] = useState<CuentaPorCobrar[]>([]);
  const [methods, setMethods] = useState<OpcionListaConfigurable[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [paymentMethods, setPaymentMethods] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const requestRef = useRef(0);
  const savingRef = useRef(false);
  const [hasData, setHasData] = useState(false);
  useUnsavedChanges(false, Boolean(busyId));

  const load = useCallback(async (refresh = false) => {
    const request = ++requestRef.current;
    refresh ? setRefreshing(true) : setLoading(true); setError("");
    try {
      const [nextAccounts, config] = await Promise.all([firestoreService.getCuentasPorCobrar(), firestoreService.getConfiguracionListasDesplegables()]);
      if (request !== requestRef.current) return;
      setAccounts(nextAccounts); setMethods(config.metodos_pago_venta.filter(item => item.activa));
      setHasData(true);
      setAmounts(Object.fromEntries(nextAccounts.map(account => [account.venta_id, account.pendiente.toFixed(2)])));
    } catch (cause) { if (request === requestRef.current) setError(mensajeError(cause, "No fue posible consultar las cuentas por cobrar.")); }
    finally { if (request === requestRef.current) { setLoading(false); setRefreshing(false); } }
  }, []);
  useEffect(() => { load(); return () => { requestRef.current += 1; }; }, [load, configVersion]);
  const totalPending = useMemo(() => accounts.reduce((sum, item) => sum + item.pendiente, 0), [accounts]);
  const filtered = useMemo(() => accounts.filter(account => searchText(`${account.cliente_nombre} ${account.folio} ${account.canal_venta_nombre}`).includes(searchText(search))), [accounts, search]);

  const registerPayment = async (account: CuentaPorCobrar) => {
    if (savingRef.current) return;
    const amount = Number(amounts[account.venta_id]); const method = paymentMethods[account.venta_id] || "";
    if (!Number.isFinite(amount) || amount <= 0 || amount > account.pendiente) { setError("El pago debe ser mayor a cero y no puede superar el saldo pendiente."); return; }
    if (!methods.some(item => item.nombre === method)) { setError("Selecciona un método de pago vigente."); return; }
    savingRef.current = true;
    try {
      if (!(await confirm({ title: "Confirmar pago recibido", description: `Registrar ${money.format(amount)} por ${method} para ${account.cliente_nombre}, venta ${account.folio}. Confirma únicamente si ya recibiste el dinero.`, confirmLabel: "Sí, registrar pago" }))) return;
      setBusyId(account.venta_id); setError("");
      await firestoreService.registrarPagoPedido(account.venta_id, amount, method);
      notify(`Pago registrado en ${account.folio}.`);
      await load(true);
    } catch (cause) { setError(mensajeError(cause, "No fue posible registrar el pago.")); }
    finally { savingRef.current = false; setBusyId(""); }
  };

  return <div className="space-y-5">
    <PageHeader eyebrow="Finanzas" title="Cuentas por cobrar" description="Saldos pendientes de tus ventas. Registra un pago únicamente cuando hayas recibido el dinero." actions={<>
      {headerActions}
      <button type="button" className="btn-secondary" disabled={loading || !filtered.length} onClick={() => downloadCsv("cuentas-por-cobrar.csv", ["Fecha", "Cliente", "Venta", "Canal", "Total MXN", "Cobrado MXN", "Pendiente MXN"], filtered.map(account => [fechaLocal(account.fecha), account.cliente_nombre, account.folio, account.canal_venta_nombre, account.total, account.cobrado, account.pendiente]))}><Download className="h-4 w-4" />Exportar</button>
      <button type="button" onClick={() => load(true)} disabled={refreshing || loading || Boolean(busyId)} className="btn-secondary"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />Actualizar</button>
    </>} />
    {navigationTabs}
    <div className="grid sm:grid-cols-2 gap-3"><StatCard label="Saldo total pendiente" value={loading || !hasData ? "—" : money.format(totalPending)} hint="Todas las ventas con saldo vigente" tone="warning" /><StatCard label="Ventas con saldo" value={loading || !hasData ? "—" : accounts.length} hint="Se actualizan al registrar sus cobros" /></div>
    {error && <ErrorState message={error} onRetry={busyId ? undefined : () => load(true)} />}
    <label className="relative block max-w-lg"><Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><input value={search} onChange={event => setSearch(event.target.value)} aria-label="Buscar cuentas por cliente, folio o canal" placeholder="Buscar cliente, folio o canal…" className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" /></label>
    {!loading && hasData && <FilterSummary count={filtered.length} noun="ventas con saldo" active={Boolean(search)} onClear={() => setSearch("")} />}
    <div className="surface overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
      <thead><tr><th className="text-left px-4 py-3">Fecha</th><th className="text-left px-4 py-3">Cliente / venta</th><th className="text-right px-4 py-3">Total</th><th className="text-right px-4 py-3">Cobrado</th><th className="text-right px-4 py-3">Pendiente</th><th className="text-left px-4 py-3">Registrar pago</th></tr></thead>
      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {loading ? <tr><td colSpan={6} className="p-10 text-center text-zinc-500">Cargando cuentas…</td></tr> : !filtered.length ? <tr><td colSpan={6} className="p-10 text-center text-zinc-500">{!hasData ? "No fue posible consultar las cuentas. Usa Actualizar para reintentar." : search ? "No hay cuentas que coincidan con la búsqueda." : "No hay ventas con saldo pendiente."}</td></tr> : filtered.map(account => <tr key={account.venta_id}>
          <td className="px-4 py-3 whitespace-nowrap">{account.fecha.toLocaleDateString("es-MX")}</td>
          <td className="px-4 py-3"><strong className="block">{account.cliente_nombre}</strong><span className="text-xs text-zinc-500">{account.folio} · {account.canal_venta_nombre}</span></td>
          <td className="px-4 py-3 text-right tabular-nums">{money.format(account.total)}</td><td className="px-4 py-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{money.format(account.cobrado)}</td><td className="px-4 py-3 text-right tabular-nums text-amber-700 dark:text-amber-400 font-semibold">{money.format(account.pendiente)}</td>
          <td className="px-4 py-3"><div className="grid grid-cols-[110px_150px_auto] gap-2 min-w-[390px]">
            <input disabled={Boolean(busyId) || refreshing} type="number" min="0.01" max={account.pendiente} step="0.01" value={amounts[account.venta_id] || ""} onChange={event => setAmounts(current => ({ ...current, [account.venta_id]: event.target.value }))} className="px-2 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950" aria-label={`Importe del pago para ${account.folio}`} />
            <select disabled={Boolean(busyId) || refreshing} aria-label={`Método de pago para ${account.folio}`} value={paymentMethods[account.venta_id] || ""} onChange={event => setPaymentMethods(current => ({ ...current, [account.venta_id]: event.target.value }))} className="px-2 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950"><option value="">Método</option>{methods.map(item => <option key={item.id} value={item.nombre}>{item.nombre}</option>)}</select>
            <button type="button" onClick={() => registerPayment(account)} disabled={Boolean(busyId) || refreshing || loading} className="btn-primary">{busyId === account.venta_id ? "Guardando…" : "Registrar"}</button>
          </div></td>
        </tr>)}
      </tbody>
    </table></div></div>
    {hasData && !methods.length && <p className="text-sm text-amber-700 dark:text-amber-400">Activa un método de pago en Configuración → Ventas para registrar cobros.</p>}
  </div>;
}
