import React, { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, ChevronRight, Command, Plus, Search, WifiOff } from "lucide-react";
import { NavigationTab } from "../types";
import { navigationGroups, navigationInfo, utilityNavigation } from "../lib/navigation";
import { searchText } from "../lib/presentation";
import Dialog from "./ui/Dialog";

export default function WorkspaceHeader({ activeTab, onNavigate }: { activeTab: NavigationTab; onNavigate: (tab: NavigationTab) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [offline, setOffline] = useState(!navigator.onLine);
  const location = navigationInfo(activeTab);
  const items = useMemo(() => [
    ...navigationGroups.flatMap(group => group.items.map(item => ({ ...item, section: group.label }))),
    ...utilityNavigation.map(item => ({ ...item, section: "Administración" }))
  ], []);
  const results = useMemo(() => items.filter(item => searchText(`${item.label} ${item.section} ${item.keywords}`).includes(searchText(query))), [items, query]);
  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k" && !document.querySelector("dialog[open], [role=dialog]")) {
        event.preventDefault(); setQuery(""); setActive(0); setOpen(true);
      }
    };
    const connection = () => setOffline(!navigator.onLine);
    document.addEventListener("keydown", keys);
    window.addEventListener("online", connection); window.addEventListener("offline", connection);
    return () => { document.removeEventListener("keydown", keys); window.removeEventListener("online", connection); window.removeEventListener("offline", connection); };
  }, []);
  useEffect(() => { if (open) document.getElementById(`workspace-result-${active}`)?.scrollIntoView({ block: "nearest" }); }, [active, open]);
  const navigate = (tab: NavigationTab) => { setOpen(false); onNavigate(tab); };
  return <>
    <header className="workspace-header">
      <nav aria-label="Ubicación actual" className="workspace-breadcrumb"><span>{location.section}</span><ChevronRight className="h-3.5 w-3.5" /><strong>{location.title}</strong></nav>
      <div className="flex items-center gap-2 shrink-0">
        <button type="button" className="workspace-search" aria-label="Buscar apartado, Control K" onClick={() => { setQuery(""); setActive(0); setOpen(true); }}><Search className="h-4 w-4" /><span>Ir a un apartado…</span><kbd><Command className="h-3 w-3" /> K</kbd></button>
        <button type="button" className="btn-primary" onClick={() => onNavigate("ventas_stock")}><Plus className="h-4 w-4" /><span className="hidden sm:inline">Registrar venta</span><span className="sm:hidden">Venta</span></button>
      </div>
    </header>
    {offline && <div className="connection-banner" role="status"><WifiOff className="h-4 w-4 shrink-0" />Sin conexión. Revisa tu conexión antes de registrar operaciones.</div>}
    <Dialog open={open} onClose={() => setOpen(false)} title="¿A dónde quieres ir?" description="Busca un apartado del CRM. Atajo: Ctrl / ⌘ K." className="command-dialog">
      <div className="command-search"><Search className="h-5 w-5" /><input autoFocus placeholder="Ventas, pedidos, clientes, productos…" value={query}
        aria-label="Buscar apartado" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="workspace-results" aria-activedescendant={results[active] ? `workspace-result-${active}` : undefined}
        onChange={event => setQuery(event.target.value)} onKeyDown={event => {
          if (event.key === "ArrowDown") { event.preventDefault(); setActive(index => results.length ? (index + 1) % results.length : 0); }
          if (event.key === "ArrowUp") { event.preventDefault(); setActive(index => results.length ? (index - 1 + results.length) % results.length : 0); }
          if (event.key === "Enter" && results[active]) { event.preventDefault(); navigate(results[active].id); }
        }} /></div>
      <div id="workspace-results" role="listbox" aria-label="Apartados" className="command-results">
        {results.length === 0 ? <p className="p-8 text-center text-sm text-zinc-500">No hay apartados con ese nombre.</p> : results.map((item, index) => {
          const Icon = item.icon;
          return <button key={item.id} id={`workspace-result-${index}`} role="option" aria-selected={active === index} type="button" className={`command-option ${active === index ? "active" : ""}`} onPointerMove={() => setActive(index)} onClick={() => navigate(item.id)}><Icon className="h-4 w-4" /><span><strong>{item.label}</strong><small>{item.section}</small></span><ArrowUpRight className="h-4 w-4" /></button>;
        })}
      </div>
      <p className="command-hint">↑ ↓ para recorrer · Enter para abrir · Esc para cerrar</p>
    </Dialog>
  </>;
}
