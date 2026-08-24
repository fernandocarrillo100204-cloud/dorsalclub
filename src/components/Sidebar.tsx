/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { 
  ShoppingBag,
  ShoppingCart,
  ArrowRightLeft,
  History, 
  LayoutDashboard, 
  TrendingUp, 
  Warehouse, 
  Package, 
  LogOut, 
  Menu, 
  X,
  User as UserIcon,
  Sun,
  Moon,
  Tag
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Usuario, NavigationTab } from "../types";
import { useTheme } from "../context/ThemeContext";

interface SidebarProps {
  user: Usuario;
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  onLogout: () => void;
}

interface NavItem {
  id: NavigationTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  matchActive?: (current: NavigationTab) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  { 
    id: "compras", 
    label: "Compras", 
    icon: ShoppingBag,
    matchActive: (curr) => curr === "compras" || curr === "compras_nueva"
  },
  { 
    id: "ventas_nueva", 
    label: "Ventas", 
    icon: ShoppingCart,
    matchActive: (curr) => curr === "ventas_nueva"
  },
  { 
    id: "transferencias_nueva", 
    label: "Transferencias", 
    icon: ArrowRightLeft,
    matchActive: (curr) => curr === "transferencias_nueva"
  },
  { 
    id: "historial", 
    label: "Historial", 
    icon: History,
    matchActive: (curr) => curr === "historial"
  },
  { 
    id: "dashboard", 
    label: "Dashboard", 
    icon: LayoutDashboard,
    matchActive: (curr) => curr === "dashboard"
  },
  { 
    id: "analisis_ventas", 
    label: "Análisis de ventas", 
    icon: TrendingUp,
    matchActive: (curr) => curr === "analisis_ventas" || curr === "ventas"
  },
  { 
    id: "almacenes", 
    label: "Almacenes", 
    icon: Warehouse,
    matchActive: (curr) => curr === "almacenes"
  },
  { 
    id: "catalogo", 
    label: "Productos", 
    icon: Package,
    matchActive: (curr) => curr === "catalogo"
  },
];

export default function Sidebar({ user, activeTab, setActiveTab, onLogout }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const handleSelectTab = (tab: NavigationTab) => {
    setActiveTab(tab);
    setMobileOpen(false);
  };

  // Shared navigation items component
  const NavContent = () => (
    <div className="flex flex-col h-full justify-between select-none">
      {/* Top Branding & Navigation */}
      <div className="flex flex-col">
        {/* Brand Header */}
        <div className="px-3.5 py-3 border-b border-[#E2E8F0] dark:border-[#263449]">
          <div className="flex items-center space-x-2.5">
            <div className="bg-[#0F172A] dark:bg-[#1E293B] border border-[#1E293B] dark:border-[#334155] p-1.5 rounded-lg text-white shrink-0 shadow-xs">
              <Tag className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold tracking-tight text-[#172033] dark:text-[#F8FAFC] leading-tight lowercase">
                dorsalclub
              </h1>
              <p className="text-[10px] text-[#64748B] dark:text-[#94A3B8] font-medium leading-tight mt-0.5 truncate">
                Inventario de streetwear y sneakers
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Links (14px text) */}
        <nav className="p-2 space-y-1" aria-label="Navegación principal">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.matchActive ? item.matchActive(activeTab) : activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                id={`nav-item-${item.id}`}
                onClick={() => handleSelectTab(item.id)}
                className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-all text-left ${
                  isActive
                    ? "bg-[#ECFDF5] dark:bg-emerald-950/40 text-[#059669] dark:text-emerald-400 font-semibold border-l-2 border-[#059669] dark:border-emerald-500 pl-2"
                    : "text-[#64748B] dark:text-[#94A3B8] hover:text-[#172033] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#111827] font-normal"
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-[#059669] dark:text-emerald-400" : "text-[#64748B] dark:text-[#94A3B8]"}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Section: Theme Toggle & User Profile & Logout */}
      <div className="flex flex-col border-t border-[#E2E8F0] dark:border-[#263449] bg-white/80 dark:bg-[#111827]">
        {/* Theme Mode Selector (above user profile) */}
        <div className="p-2.5 pb-2 border-b border-[#E2E8F0]/70 dark:border-[#263449]/70">
          <button
            type="button"
            id="theme-toggle-btn"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#64748B] hover:text-[#172033] dark:text-[#94A3B8] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#182235] border border-[#E2E8F0] dark:border-[#263449] bg-white dark:bg-[#0F172A] transition-all focus:outline-none focus:ring-2 focus:ring-[#059669]"
          >
            <div className="flex items-center space-x-2">
              {theme === "dark" ? (
                <Sun className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              ) : (
                <Moon className="h-3.5 w-3.5 text-slate-600 shrink-0" />
              )}
              <span>{theme === "dark" ? "Modo claro" : "Modo oscuro"}</span>
            </div>
            <span className="text-[10px] font-semibold text-[#64748B] dark:text-[#94A3B8]">
              {theme === "dark" ? "Oscuro" : "Claro"}
            </span>
          </button>
        </div>

        {/* User Info & Logout */}
        <div className="p-3 pt-2.5">
          <div className="flex items-center space-x-2 mb-2 px-1">
            <div className="h-7 w-7 rounded-md bg-[#ECFDF5] dark:bg-emerald-950/60 border border-emerald-200/80 dark:border-emerald-800/70 flex items-center justify-center text-[#059669] dark:text-emerald-400 shrink-0">
              <UserIcon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-[#64748B] dark:text-[#94A3B8] font-medium leading-none">Usuario</p>
              <p 
                className="text-xs font-semibold text-[#172033] dark:text-[#F8FAFC] truncate mt-0.5" 
                title={user.email}
              >
                {user.email}
              </p>
            </div>
          </div>

          <button
            type="button"
            id="sidebar-logout-btn"
            onClick={() => {
              setMobileOpen(false);
              onLogout();
            }}
            className="w-full flex items-center justify-center space-x-1.5 px-2.5 py-1.5 text-xs font-medium text-[#64748B] dark:text-[#94A3B8] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-[#E2E8F0] dark:border-[#263449] hover:border-rose-200 dark:hover:border-rose-900/50 rounded-lg transition-all focus:outline-none"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* ---------------------------------------------------- */}
      {/* DESKTOP PERMANENT SIDEBAR (~224px) */}
      {/* ---------------------------------------------------- */}
      <aside 
        className="hidden md:flex fixed inset-y-0 left-0 z-40 w-[224px] bg-[#F8FAFC] dark:bg-[#182235] border-r border-[#E2E8F0] dark:border-[#263449] flex-col justify-between transition-colors duration-200"
        id="desktop-sidebar"
      >
        <NavContent />
      </aside>

      {/* ---------------------------------------------------- */}
      {/* MOBILE TOP BAR WITH MENU TOGGLE */}
      {/* ---------------------------------------------------- */}
      <header 
        className="md:hidden sticky top-0 z-30 bg-white/95 dark:bg-[#111827]/95 backdrop-blur-md border-b border-[#E2E8F0] dark:border-[#263449] px-3.5 py-2.5 flex items-center justify-between transition-colors duration-200"
        id="mobile-top-header"
      >
        <div className="flex items-center space-x-2">
          <div className="bg-[#0F172A] dark:bg-[#1E293B] border border-[#1E293B] dark:border-[#334155] p-1 rounded-md text-white shadow-xs">
            <Tag className="h-3.5 w-3.5 text-white" />
          </div>
          <div>
            <span className="font-bold text-base text-[#172033] dark:text-[#F8FAFC] tracking-tight lowercase">dorsalclub</span>
            <p className="text-[10px] text-[#64748B] dark:text-[#94A3B8] font-medium -mt-0.5">Inventario de streetwear y sneakers</p>
          </div>
        </div>

        <button
          type="button"
          id="mobile-menu-toggle-btn"
          onClick={() => setMobileOpen(true)}
          className="p-1.5 text-[#64748B] dark:text-[#94A3B8] hover:text-[#172033] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#182235] rounded-lg transition-colors focus:outline-none"
          aria-label="Abrir menú de navegación"
          title="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* ---------------------------------------------------- */}
      {/* MOBILE SLIDE-OVER DRAWER */}
      {/* ---------------------------------------------------- */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />

            {/* Slide-out Sidebar Panel */}
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 260 }}
              className="relative w-[224px] max-w-[80vw] bg-[#F8FAFC] dark:bg-[#182235] border-r border-[#E2E8F0] dark:border-[#263449] flex flex-col justify-between shadow-xl z-10"
              id="mobile-drawer-sidebar"
            >
              {/* Close Button Inside Drawer */}
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="absolute top-3 right-3 p-1 text-[#64748B] dark:text-[#94A3B8] hover:text-[#172033] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#111827] rounded-lg transition-colors z-20"
                aria-label="Cerrar menú"
                title="Cerrar menú"
              >
                <X className="h-4 w-4" />
              </button>

              <NavContent />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
