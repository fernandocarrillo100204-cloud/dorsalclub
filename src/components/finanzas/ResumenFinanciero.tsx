import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarDays, CircleDollarSign, RefreshCw, TrendingUp, WalletCards } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { firestoreService } from "../../lib/firebase";
import { PeriodoFinancieroIndex, ResumenFinancieroConsolidado } from "../../types";
import { useConsulta } from "../../hooks/useConsulta";
import { mensajeError } from "../../lib/errores";

interface Props {
  onNavigateToGastos: () => void;
  onNavigateToVentas?: () => void;
  onNavigateToCompras?: () => void;
  navigationTabs?: React.ReactNode;
}

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const monthName = (year: number, month: number) => new Date(year, month - 1, 1).toLocaleDateString("es-MX", { month: "long", year: "numeric" });

export const ResumenFinanciero: React.FC<Props> = ({ onNavigateToGastos, onNavigateToVentas, onNavigateToCompras, navigationTabs }) => {
  const now = useMemo(() => new Date(), []);
  const [scope, setScope] = useState<"todo" | "mes">("todo");
  const [periods, setPeriods] = useState<PeriodoFinancieroIndex[]>([]);
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [view, setView] = useState<"operacion" | "caja">("operacion");
  const [periodsError, setPeriodsError] = useState("");

  const loadPeriods = useCallback(async () => {
    const list = await firestoreService.getPeriodosFinancierosDisponibles(true);
    setPeriods(list);
    setPeriodsError("");
    setPeriod(current => list.length && !list.some(item => item.periodo === current) ? list[list.length - 1].periodo : current);
  }, []);

  const queryKey = scope === "todo" ? "todo" : period;
  const consult = useCallback(async () => {
    if (queryKey === "todo") return firestoreService.getResumenFinancieroConsolidado({ alcance: "todo" });
    const [year, month] = queryKey.split("-").map(Number);
    return firestoreService.getResumenFinancieroConsolidado({ alcance: "mes", year, month });
  }, [queryKey]);
  const { data, loading, refreshing, error, cargar } = useConsulta<ResumenFinancieroConsolidado>(queryKey, consult);
  const load = async () => {
    await Promise.all([
      cargar(),
      loadPeriods().catch(cause => setPeriodsError(mensajeError(cause, "No fue posible consultar los periodos disponibles.")))
    ]);
  };

  useEffect(() => {
    firestoreService.getPeriodosFinancierosDisponibles().then(list => {
      setPeriods(list);
      setPeriod(current => list.length && !list.some(item => item.periodo === current) ? list[list.length - 1].periodo : current);
    }).catch(cause => setPeriodsError(mensajeError(cause, "No fue posible consultar los periodos disponibles.")));
  }, []);

  const result = view === "operacion" ? data?.flujoOperativo || 0 : data?.movimientoCaja || 0;
  const resultLabel = view === "operacion" ? "Flujo operativo" : "Movimiento neto de caja";
  const chartData = useMemo(() => {
    if (!data) return [];
    const grouped = new Map<string, { clave: string; etiqueta: string; ingresos: number; egresos: number }>();
    if (scope === "mes") {
      const [year, month] = period.split("-").map(Number);
      for (let day = 1; day <= new Date(year, month, 0).getDate(); day++) {
        const clave = String(day).padStart(2, "0");
        grouped.set(clave, { clave, etiqueta: String(day), ingresos: 0, egresos: 0 });
      }
    }
    data.movimientos.forEach(item => {
      if (view === "operacion" && (item.tipo === "capital" || item.tipo === "retiro" || item.tipo === "ajuste" || item.clasificacion === "inversion_inicial")) return;
      const key = scope === "mes" ? String(item.fecha.getDate()).padStart(2, "0") : `${item.fecha.getFullYear()}-${String(item.fecha.getMonth() + 1).padStart(2, "0")}`;
      const label = scope === "mes" ? String(item.fecha.getDate()) : item.fecha.toLocaleDateString("es-MX", { month: "short", year: "2-digit" });
      const point = grouped.get(key) || { clave: key, etiqueta: label, ingresos: 0, egresos: 0 };
      point.ingresos += item.entrada;
      point.egresos += item.salida;
      grouped.set(key, point);
    });
    return Array.from(grouped.values()).sort((a, b) => a.clave.localeCompare(b.clave));
  }, [data, scope, view, period]);
  const cards = [
    { label: "Ventas cobradas", value: data?.ingresosVentas || 0, detail: `${data?.numVentas || 0} ventas con movimiento`, color: "text-emerald-600" },
    { label: "Otros ingresos", value: data?.otrosIngresos || 0, detail: "No incluye aportaciones de capital", color: "text-sky-600" },
    { label: "Egresos operativos", value: data?.egresosOperativos || 0, detail: "Compras + gastos + costos de venta", color: "text-rose-600" },
    { label: "Inversión inicial", value: data?.inversionInicial || 0, detail: "Separada de la operación", color: "text-amber-600" },
    { label: "Pendiente por cobrar", value: data?.pendientePorCobrar || 0, detail: `${data?.numCuentasPorCobrar || 0} ventas con saldo`, color: "text-amber-600" },
    { label: resultLabel, value: result, detail: view === "operacion" ? "Entradas operativas − egresos operativos" : "Incluye capital, inversión, retiros y ajustes", color: result >= 0 ? "text-emerald-600" : "text-rose-600" }
  ];

  return <div className="space-y-6">
    <header><h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Resumen financiero</h1><p className="text-sm text-zinc-500 mt-1">Entradas, salidas, capital y cuentas por cobrar con información tomada de los registros reales.</p></header>
    <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 p-2">
      <div>{navigationTabs}</div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 p-1"><button onClick={() => setScope("todo")} className={`px-3 py-2 rounded-lg text-xs font-bold ${scope === "todo" ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900" : "text-zinc-500"}`}>Todo el historial</button><button onClick={() => setScope("mes")} className={`px-3 py-2 rounded-lg text-xs font-bold ${scope === "mes" ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900" : "text-zinc-500"}`}>Por mes</button></div>
        {scope === "mes" && <label className="relative"><CalendarDays className="absolute left-3 top-2.5 w-4 h-4 text-emerald-600" /><select value={period} onChange={event => setPeriod(event.target.value)} disabled={periods.length === 0} className="pl-9 pr-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm font-semibold">{periods.length === 0 && <option value={period}>Sin periodos</option>}{periods.map(item => <option key={item.periodo} value={item.periodo}>{monthName(item.anio, item.mes)}</option>)}</select></label>}
        <button onClick={load} disabled={refreshing || loading} className="p-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950" aria-label="Actualizar"><RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} /></button>
      </div>
    </div>
    <div className="rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/20 p-3 text-xs text-sky-800 dark:text-sky-300">Este módulo muestra flujo de efectivo, no utilidad contable. Las ventas se reconocen cuando se cobra dinero y las compras se reconocen completas cuando se registran.</div>
    {periodsError && <div role="alert" className="text-xs text-rose-600">{periodsError}</div>}
    {error && <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 p-4 text-sm text-rose-700 dark:text-rose-300"><AlertTriangle className="w-4 h-4 shrink-0" /><div>{error}<button type="button" onClick={load} disabled={loading || refreshing} className="block mt-2 font-bold underline">Reintentar</button>{data && <p className="mt-1 text-xs">Se conservan los últimos datos válidos de este mismo periodo.</p>}</div></div>}
    {(data || loading) && <>
    <div className="flex justify-end"><div className="inline-flex rounded-xl bg-zinc-100 dark:bg-zinc-800 p-1"><button onClick={() => setView("operacion")} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${view === "operacion" ? "bg-white dark:bg-zinc-900 shadow-sm" : "text-zinc-500"}`}>Operación</button><button onClick={() => setView("caja")} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${view === "caja" ? "bg-white dark:bg-zinc-900 shadow-sm" : "text-zinc-500"}`}>Caja total</button></div></div>
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">{cards.map(card => <div key={card.label} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4"><span className="text-xs font-semibold text-zinc-500">{card.label}</span>{loading ? <div className="h-8 w-32 mt-2 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" /> : <strong className={`block mt-1 text-2xl font-mono ${card.color}`}>{money.format(card.value)}</strong>}<span className="block text-[11px] text-zinc-400 mt-2">{loading ? "Consultando registros…" : card.detail}</span></div>)}</div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"><div className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-600" /><h2 className="font-bold">Entradas contra salidas</h2></div><p className="text-xs text-zinc-500 mt-1">{scope === "todo" ? `Agrupado por mes durante todo el historial · vista ${view === "operacion" ? "operativa" : "de caja total"}` : `Comportamiento diario de ${monthName(Number(period.slice(0, 4)), Number(period.slice(5, 7)))}`}</p><div className="h-72 mt-5">{loading ? <div className="h-full rounded-xl bg-zinc-100 dark:bg-zinc-800 animate-pulse" /> : !chartData.length ? <div className="h-full flex items-center justify-center text-sm text-zinc-500">No hay movimientos en este alcance.</div> : <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} /><XAxis dataKey="etiqueta" fontSize={11} /><YAxis fontSize={11} tickFormatter={value => `$${Number(value).toLocaleString("es-MX")}`} /><Tooltip formatter={(value) => money.format(Number(value))} /><Bar dataKey="ingresos" name="Entradas" fill="#059669" radius={[4, 4, 0, 0]} /><Bar dataKey="egresos" name="Salidas" fill="#64748b" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>}</div></div>
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4"><div className="flex items-center gap-2"><WalletCards className="w-4 h-4 text-sky-600" /><h2 className="font-bold">Caja total</h2></div><div className="space-y-3 text-sm"><div className="flex justify-between"><span className="text-zinc-500">Aportaciones</span><strong className="font-mono text-emerald-600">{money.format(data?.aportacionesCapital || 0)}</strong></div><div className="flex justify-between"><span className="text-zinc-500">Retiros</span><strong className="font-mono text-rose-600">{money.format(data?.retirosPropietario || 0)}</strong></div><div className="flex justify-between"><span className="text-zinc-500">Ajustes de entrada</span><strong className="font-mono">{money.format(data?.ajustesEntrada || 0)}</strong></div><div className="flex justify-between"><span className="text-zinc-500">Ajustes de salida</span><strong className="font-mono">{money.format(data?.ajustesSalida || 0)}</strong></div><div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-between"><span className="font-bold">Movimiento neto</span><strong className={`font-mono ${data && data.movimientoCaja < 0 ? "text-rose-600" : "text-emerald-600"}`}>{money.format(data?.movimientoCaja || 0)}</strong></div></div><p className="text-[11px] text-zinc-500">Representa el cambio calculado de la caja según los movimientos registrados. No consulta el saldo de una cuenta bancaria.</p></div>
    </div>
    </>}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><button onClick={onNavigateToVentas} className="flex items-center justify-between p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm font-bold">Ver ventas <ArrowRight className="w-4 h-4" /></button><button onClick={onNavigateToCompras} className="flex items-center justify-between p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm font-bold">Ver compras <ArrowRight className="w-4 h-4" /></button><button onClick={onNavigateToGastos} className="flex items-center justify-between p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm font-bold">Ver gastos <ArrowRight className="w-4 h-4" /></button></div>
    <div className="flex gap-2 text-xs text-zinc-500"><CircleDollarSign className="w-4 h-4 shrink-0" /><p><strong>Flujo operativo:</strong> ventas cobradas + otros ingresos − compras operativas − gastos operativos − costos asociados a ventas. <strong>Movimiento de caja:</strong> además incorpora inversión inicial, aportaciones, retiros y ajustes.</p></div>
  </div>;
};

export default ResumenFinanciero;
