import React, { useEffect, useMemo, useState } from "react";
import { Check, Edit3, MapPin, Plus, Power, Settings, Trash2, UserRound, X } from "lucide-react";
import { firestoreService } from "../lib/firebase";
import { ConfiguracionListasDesplegables, OpcionListaConfigurable } from "../types";

export type ModuloConfigurable = "ventas" | "compras" | "clientes" | "finanzas";
type ConfigKey = keyof ConfiguracionListasDesplegables;

const MODULE_LISTS: Record<Exclude<ModuloConfigurable, "ventas">, Array<{ key: ConfigKey; label: string; singular: string }>> = {
  compras: [{ key: "proveedores_compra", label: "Proveedores", singular: "proveedor" }],
  clientes: [
    { key: "tipos_cliente", label: "Tipos de cliente", singular: "tipo de cliente" },
    { key: "canales_contacto", label: "Canales de contacto", singular: "canal" },
    { key: "origenes_cliente", label: "Orígenes", singular: "origen" }
  ],
  finanzas: [
    { key: "categorias_gasto", label: "Categorías de gasto", singular: "categoría" },
    { key: "metodos_pago_gasto", label: "Métodos de pago", singular: "método de pago" }
  ]
};

interface Props {
  isOpen: boolean;
  module: ModuloConfigurable;
  onClose: () => void;
  onSaved?: () => void;
}

export default function ConfiguracionModuloModal({ isOpen, module, onClose, onSaved }: Props) {
  const definitions = useMemo(() => module === "ventas"
    ? [{ key: "ubicaciones", label: "Ubicaciones de entrega", singular: "ubicación" }, { key: "repartidores", label: "Quién entrega", singular: "persona" }]
    : MODULE_LISTS[module], [module]);
  const [activeKey, setActiveKey] = useState<string>(definitions[0].key);
  const [config, setConfig] = useState<ConfiguracionListasDesplegables | null>(null);
  const [salesLists, setSalesLists] = useState<Record<string, OpcionListaConfigurable[]>>({ ubicaciones: [], repartidores: [] });
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      if (module === "ventas") {
        const [ubicaciones, repartidores] = await Promise.all([firestoreService.getUbicacionesEntrega(), firestoreService.getRepartidores()]);
        setSalesLists({ ubicaciones, repartidores });
      } else {
        setConfig(await firestoreService.getConfiguracionListasDesplegables());
      }
    } catch (err: any) {
      setError(err?.message || "No se pudieron cargar las listas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setActiveKey(definitions[0].key);
    setNewName("");
    setEditingId(null);
    load();
  }, [isOpen, module, definitions]);

  if (!isOpen) return null;
  const currentDefinition = definitions.find(item => item.key === activeKey) || definitions[0];
  const items = module === "ventas" ? salesLists[activeKey] || [] : config?.[activeKey as ConfigKey] || [];

  const persist = async (nextItems: OpcionListaConfigurable[]) => {
    if (!config) return;
    const next = { ...config, [activeKey]: nextItems };
    await firestoreService.saveConfiguracionListasDesplegables(next);
    setConfig(next);
  };

  const add = async () => {
    const nombre = newName.trim();
    if (!nombre) return;
    if (items.some(item => item.nombre.toLowerCase() === nombre.toLowerCase())) {
      setError("Esa opción ya existe.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (module === "ventas") {
        if (activeKey === "ubicaciones") await firestoreService.addUbicacionEntrega(nombre);
        else await firestoreService.addRepartidor(nombre);
        await load();
      } else {
        await persist([...items, { id: `opt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, nombre, activa: true }]);
      }
      setNewName("");
      onSaved?.();
    } catch (err: any) {
      setError(err?.message || "No se pudo agregar la opción.");
    } finally {
      setSaving(false);
    }
  };

  const update = async (item: OpcionListaConfigurable, patch: Partial<OpcionListaConfigurable>) => {
    setSaving(true);
    setError(null);
    try {
      if (module === "ventas") {
        if (activeKey === "ubicaciones") await firestoreService.updateUbicacionEntrega(item.id, patch);
        else await firestoreService.updateRepartidor(item.id, patch);
        await load();
      } else {
        await persist(items.map(option => option.id === item.id ? { ...option, ...patch } : option));
      }
      onSaved?.();
    } catch (err: any) {
      setError(err?.message || "No se pudo actualizar la opción.");
    } finally {
      setSaving(false);
    }
  };

  const archive = async (item: OpcionListaConfigurable) => {
    if (!window.confirm(`¿Quitar "${item.nombre}" de las opciones disponibles? Los registros anteriores conservarán su valor.`)) return;
    if (module !== "ventas") {
      await update(item, { activa: false });
      return;
    }
    setSaving(true);
    try {
      if (activeKey === "ubicaciones") await firestoreService.deleteUbicacionEntrega(item.id);
      else await firestoreService.deleteRepartidor(item.id);
      await load();
      onSaved?.();
    } catch (err: any) {
      setError(err?.message || "No se pudo quitar la opción.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center"><Settings className="w-4 h-4" /></span>
            <div><h2 className="font-bold text-zinc-900 dark:text-white capitalize">Configurar {module}</h2><p className="text-xs text-zinc-500">Edita las opciones disponibles en los desplegables.</p></div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex overflow-x-auto px-4 border-b border-zinc-200 dark:border-zinc-800">
          {definitions.map(definition => <button key={definition.key} type="button" onClick={() => { setActiveKey(definition.key); setEditingId(null); }} className={`px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 ${activeKey === definition.key ? "border-zinc-900 dark:border-white text-zinc-900 dark:text-white" : "border-transparent text-zinc-500"}`}>{definition.label}</button>)}
        </div>
        <div className="p-5 overflow-y-auto space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <input value={newName} onChange={event => setNewName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); add(); } }} placeholder={`Nueva ${currentDefinition.singular}`} className="flex-1 px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white" />
            <button type="button" onClick={add} disabled={saving || !newName.trim()} className="px-4 py-2 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"><Plus className="w-4 h-4" />Agregar</button>
          </div>
          {error && <div className="text-xs text-rose-600 dark:text-rose-400">{error} <button type="button" onClick={load} className="underline font-semibold">Reintentar</button></div>}
          {loading ? <div className="py-10 text-center text-sm text-zinc-400">Cargando opciones…</div> : <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
            {items.length === 0 ? <div className="py-10 text-center text-sm text-zinc-400">Aún no hay opciones registradas.</div> : items.map(item => <div key={item.id} className="flex items-center gap-3 px-4 py-3">
              {module === "ventas" && activeKey === "ubicaciones" ? <MapPin className="w-4 h-4 text-zinc-400" /> : module === "ventas" ? <UserRound className="w-4 h-4 text-zinc-400" /> : null}
              <div className="flex-1 min-w-0">{editingId === item.id ? <input autoFocus value={editingName} onChange={event => setEditingName(event.target.value)} className="w-full px-2 py-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800" /> : <span className={`text-sm font-medium ${item.activa ? "text-zinc-900 dark:text-white" : "text-zinc-400 line-through"}`}>{item.nombre}</span>}</div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${item.activa ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"}`}>{item.activa ? "Activa" : "Inactiva"}</span>
              {editingId === item.id ? <><button type="button" onClick={() => { const nombre = editingName.trim(); if (nombre) update(item, { nombre }).then(() => setEditingId(null)); }} className="p-1.5 text-emerald-600"><Check className="w-4 h-4" /></button><button type="button" onClick={() => setEditingId(null)} className="p-1.5 text-zinc-400"><X className="w-4 h-4" /></button></> : <><button type="button" onClick={() => { setEditingId(item.id); setEditingName(item.nombre); }} className="p-1.5 text-zinc-500" title="Editar"><Edit3 className="w-4 h-4" /></button><button type="button" onClick={() => update(item, { activa: !item.activa })} className="p-1.5 text-zinc-500" title={item.activa ? "Desactivar" : "Activar"}><Power className="w-4 h-4" /></button>{item.activa && <button type="button" onClick={() => archive(item)} className="p-1.5 text-rose-500" title="Quitar"><Trash2 className="w-4 h-4" /></button>}</>}
            </div>)}
          </div>}
        </div>
        <div className="px-5 py-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end"><button type="button" onClick={onClose} className="px-5 py-2 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold">Listo</button></div>
      </div>
    </div>
  );
}
