import React, { useEffect, useState } from "react";
import { ChevronDown, LogOut, Menu, Moon, Sun } from "lucide-react";
import { NavigationTab, Usuario } from "../types";
import { useTheme } from "../context/ThemeContext";
import { navigationGroups, navigationParent, utilityNavigation } from "../lib/navigation";
import Dialog from "./ui/Dialog";

interface SidebarProps { user: Usuario; activeTab: NavigationTab; setActiveTab: (tab: NavigationTab) => void; onLogout: () => void }

export default function Sidebar({ user, activeTab, setActiveTab, onLogout }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeParent = navigationParent(activeTab);
  const activeGroup = navigationGroups.find(group => group.items.some(item => item.id === activeParent))?.id;
  const [expanded, setExpanded] = useState(activeGroup || "compras");
  const { theme, toggleTheme } = useTheme();
  useEffect(() => { if (activeGroup) setExpanded(activeGroup); }, [activeGroup]);
  const navigate = (tab: NavigationTab) => { setMobileOpen(false); setActiveTab(tab); };
  const content = <>
    <div className="sidebar-brand"><img src="/antiorder-logo.jpg" alt="" /><span>antiorder<span className="brand-dot">.</span></span></div>
    <div className="sidebar-label">ESPACIO DE TRABAJO</div>
    <nav className="sidebar-navigation" aria-label="Navegación principal">
      {navigationGroups.map(group => {
        const Icon = group.icon; const isOpen = expanded === group.id;
        return <div key={group.id} className="sidebar-group">
          <button type="button" className={`sidebar-group-button ${activeGroup === group.id ? "selected" : ""}`} onClick={() => setExpanded(isOpen ? "" : group.id)} aria-expanded={isOpen}>
            <Icon className="h-[18px] w-[18px]" /><span>{group.label}</span><ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
          </button>
          {isOpen && <div className="sidebar-children">{group.items.map(item => <button type="button" key={item.id} onClick={() => navigate(item.id)} aria-current={activeParent === item.id ? "page" : undefined} className={`sidebar-link ${activeParent === item.id ? "active" : ""}`}>{item.label}</button>)}</div>}
        </div>;
      })}
      <div className="sidebar-utilities">{utilityNavigation.map(item => {
        const Icon = item.icon;
        return <button key={item.id} type="button" onClick={() => navigate(item.id)} aria-current={activeParent === item.id ? "page" : undefined} className={`sidebar-group-button ${activeParent === item.id ? "selected" : ""}`}><Icon className="h-[18px] w-[18px]" /><span>{item.label}</span></button>;
      })}</div>
    </nav>
    <footer className="sidebar-footer">
      <button type="button" className="sidebar-theme" onClick={toggleTheme}>{theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}<span>{theme === "dark" ? "Modo claro" : "Modo oscuro"}</span><span className="text-[11px] opacity-60">Apariencia</span></button>
      <div className="sidebar-account"><span className="account-avatar">{(user.nombre || user.email || "A").slice(0, 1).toUpperCase()}</span><div><strong>{user.nombre || user.email.split("@")[0]}</strong><small title={user.email}>{user.email}</small></div><button type="button" className="btn-icon" title="Cerrar sesión" aria-label="Cerrar sesión" onClick={() => { setMobileOpen(false); onLogout(); }}><LogOut className="h-4 w-4" /></button></div>
    </footer>
  </>;
  return <>
    <aside className="desktop-sidebar" aria-label="Menú de Antiorder">{content}</aside>
    <div className="mobile-brand-bar"><div className="flex items-center gap-2"><img src="/antiorder-logo.jpg" alt="" className="h-8 w-8 rounded-lg dark:invert" /><strong className="text-lg tracking-tight">antiorder.</strong></div><button type="button" className="btn-icon" onClick={() => setMobileOpen(true)} aria-label="Abrir menú de navegación"><Menu className="h-5 w-5" /></button></div>
    <Dialog open={mobileOpen} onClose={() => setMobileOpen(false)} title="Navegación" className="mobile-nav-dialog"><div className="mobile-nav-content">{content}</div></Dialog>
  </>;
}
