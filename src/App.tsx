/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { authService, firestoreService } from "./lib/firebase";
import { Usuario, Almacen, Producto, StockItem, NavigationTab } from "./types";
import Sidebar from "./components/Sidebar";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import Compras from "./components/Compras";
import Ventas from "./components/Ventas";
import Transferencias from "./components/Transferencias";
import Historial from "./components/Historial";
import GestionAlmacenes from "./components/GestionAlmacenes";
import GestionProductos from "./components/GestionProductos";
import AnalisisVentas from "./components/AnalisisVentas";
import { motion, AnimatePresence } from "motion/react";

const getTabFromPath = (path: string): NavigationTab => {
  const normalized = path.toLowerCase().replace(/\/$/, "");
  if (normalized === "/compras/nueva") {
    return "compras_nueva";
  }
  if (normalized === "/compras") {
    return "compras";
  }
  if (normalized === "/ventas/nueva") {
    return "ventas_nueva";
  }
  if (normalized === "/transferencias/nueva") {
    return "transferencias_nueva";
  }
  if (normalized === "/movimientos/nuevo" || normalized === "/movimientos") {
    return "compras_nueva"; // Redirect as instructed
  }
  if (normalized === "/historial") {
    return "historial";
  }
  if (normalized === "/ventas" || normalized === "/analisis-ventas" || normalized === "/analisis_ventas") {
    return "analisis_ventas";
  }
  if (normalized === "/almacenes") {
    return "almacenes";
  }
  if (normalized === "/catalogo" || normalized === "/productos") {
    return "catalogo";
  }
  if (normalized === "/dashboard" || normalized === "" || normalized === "/") {
    return "dashboard";
  }
  return "dashboard";
};

const getPathFromTab = (tab: NavigationTab): string => {
  switch (tab) {
    case "compras":
      return "/compras";
    case "compras_nueva":
      return "/compras/nueva";
    case "ventas_nueva":
      return "/ventas/nueva";
    case "transferencias_nueva":
      return "/transferencias/nueva";
    case "analisis_ventas":
    case "ventas":
      return "/ventas";
    case "historial":
      return "/historial";
    case "almacenes":
      return "/almacenes";
    case "catalogo":
      return "/productos";
    case "movimientos":
      return "/compras/nueva";
    case "dashboard":
    default:
      return "/dashboard";
  }
};

export default function App() {
  const [user, setUser] = useState<Usuario | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  
  // Page / Route state synchronized with browser URL
  const [activeTab, setActiveTab] = useState<NavigationTab>(() => {
    return getTabFromPath(window.location.pathname);
  });
  const [preselectedSku, setPreselectedSku] = useState(() => {
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get("sku") || "";
  });
  const [preselectedAlmacenId, setPreselectedAlmacenId] = useState(() => {
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get("almacenId") || "";
  });

  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [stockList, setStockList] = useState<StockItem[]>([]);

  // Navigation helper that updates browser history and URL
  const navigateTo = (tab: NavigationTab, params?: { sku?: string; almacenId?: string }) => {
    let targetPath = getPathFromTab(tab);
    if (params?.sku) {
      const sp = new URLSearchParams();
      sp.set("sku", params.sku);
      if (params.almacenId) sp.set("almacenId", params.almacenId);
      targetPath += `?${sp.toString()}`;
    }

    const currentFull = window.location.pathname + window.location.search;
    if (currentFull !== targetPath) {
      window.history.pushState({}, "", targetPath);
    }

    setPreselectedSku(params?.sku || "");
    setPreselectedAlmacenId(params?.almacenId || "");
    setActiveTab(tab);
  };

  // Sync state on browser back / forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const tab = getTabFromPath(window.location.pathname);
      const searchParams = new URLSearchParams(window.location.search);
      setPreselectedSku(searchParams.get("sku") || "");
      setPreselectedAlmacenId(searchParams.get("almacenId") || "");
      setActiveTab(tab);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Monitor Auth State Changes
  useEffect(() => {
    const unsubscribe = authService.onAuthStateChange((currentUser) => {
      setUser(currentUser);
      setAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to real-time warehouses, products, and stock updates globally
  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;

    // Subscribe to warehouses
    const unsubscribeAlmacenes = firestoreService.getAlmacenesRealtime((almList) => {
      setAlmacenes(almList);
    });

    // Subscribe to products
    const unsubscribeProductos = firestoreService.getProductosRealtime((prodList) => {
      setProductos(prodList);
    });

    // Subscribe to stock
    const unsubscribeStock = firestoreService.getStockRealtime((stkList) => {
      setStockList(stkList);
    });

    return () => {
      unsubscribeAlmacenes();
      unsubscribeProductos();
      unsubscribeStock();
    };
  }, [user?.uid]);

  const handleLogout = async () => {
    try {
      await authService.logout();
      setUser(null);
      setPreselectedSku("");
      setPreselectedAlmacenId("");
    } catch (err) {
      console.error("Error signing out:", err);
    }
  };

  // Render Loading spinner during initial firebase state check
  if (authChecking) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#0B1220] flex flex-col items-center justify-center text-[#64748B] dark:text-[#94A3B8] transition-colors">
        <span className="h-9 w-9 border-3 border-[#059669] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs font-medium text-[#172033] dark:text-[#F8FAFC]">Iniciando entorno de inventario...</p>
      </div>
    );
  }

  // Auth Guard
  if (!user) {
    return (
      <Login 
        onLoginSuccess={(u) => {
          setUser(u);
          const targetTab = getTabFromPath(window.location.pathname);
          setActiveTab(targetTab);
        }} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#0B1220] text-[#172033] dark:text-[#F8FAFC] flex flex-col md:flex-row font-sans selection:bg-[#ECFDF5] dark:selection:bg-emerald-950/60 selection:text-[#059669] dark:selection:text-emerald-400 transition-colors duration-200">
      {/* Left Minimalist Sidebar (Desktop permanent + Mobile slide-over) */}
      <Sidebar 
        user={user} 
        activeTab={activeTab} 
        setActiveTab={(tab) => navigateTo(tab)} 
        onLogout={handleLogout} 
      />

      {/* Main Content Area: offsets for 224px fixed desktop sidebar */}
      <div className="flex-1 flex flex-col min-w-0 md:pl-[224px]">
        <main className="flex-1 w-full relative min-h-screen overflow-x-hidden">
          <div className="w-full">
            <AnimatePresence mode="wait">
              {/* Compras: Historial y Formulario Lote */}
              {(activeTab === "compras" || activeTab === "compras_nueva" || activeTab === "movimientos") && (
                <motion.div
                  key="compras"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                >
                  <Compras
                    almacenes={almacenes}
                    productos={productos}
                    isNewView={activeTab === "compras_nueva" || activeTab === "movimientos"}
                    onNavigate={(tab) => navigateTo(tab)}
                    onNavigateToNew={() => navigateTo("compras_nueva")}
                    onNavigateToHistory={() => navigateTo("compras")}
                  />
                </motion.div>
              )}

              {/* Ventas: Registro de Salida Comercial */}
              {activeTab === "ventas_nueva" && (
                <motion.div
                  key="ventas_nueva"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                >
                  <Ventas
                    almacenes={almacenes}
                    productos={productos}
                    preselectedSku={preselectedSku}
                    preselectedAlmacenId={preselectedAlmacenId}
                    onSuccess={() => navigateTo("dashboard")}
                    onCancel={() => navigateTo("dashboard")}
                  />
                </motion.div>
              )}

              {/* Transferencias entre Almacenes */}
              {activeTab === "transferencias_nueva" && (
                <motion.div
                  key="transferencias_nueva"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                >
                  <Transferencias
                    almacenes={almacenes}
                    productos={productos}
                    preselectedSku={preselectedSku}
                    preselectedAlmacenId={preselectedAlmacenId}
                    onSuccess={() => navigateTo("dashboard")}
                    onCancel={() => navigateTo("dashboard")}
                  />
                </motion.div>
              )}

              {/* Dashboard */}
              {activeTab === "dashboard" && (
                <motion.div
                  key="dashboard"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                >
                  <Dashboard 
                    almacenes={almacenes} 
                    productos={productos} 
                    onNavigateToCompra={(sku, almId) => navigateTo("compras_nueva", { sku, almacenId: almId })}
                    onNavigateToVenta={(sku, almId) => navigateTo("ventas_nueva", { sku, almacenId: almId })}
                    onNavigateToTransferencia={(sku, almId) => navigateTo("transferencias_nueva", { sku, almacenId: almId })}
                    onNavigateToHistory={(sku) => navigateTo("historial", { sku })}
                  />
                </motion.div>
              )}

              {/* Análisis de Ventas */}
              {(activeTab === "analisis_ventas" || activeTab === "ventas") && (
                <motion.div
                  key="analisis_ventas"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                >
                  <AnalisisVentas 
                    almacenes={almacenes} 
                    productos={productos} 
                    onNavigateToHistory={(sku) => navigateTo("historial", { sku })}
                  />
                </motion.div>
              )}

              {/* Almacenes */}
              {activeTab === "almacenes" && (
                <motion.div
                  key="almacenes"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                >
                  <GestionAlmacenes 
                    almacenes={almacenes}
                    productos={productos} 
                    stockList={stockList}
                  />
                </motion.div>
              )}

              {/* Catálogo de Productos */}
              {activeTab === "catalogo" && (
                <motion.div
                  key="catalogo"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                >
                  <GestionProductos 
                    almacenes={almacenes}
                    productos={productos}
                    stockList={stockList}
                    onNavigateToMovimiento={(sku) => navigateTo("compras_nueva", { sku })}
                  />
                </motion.div>
              )}

              {/* Historial de Movimientos */}
              {activeTab === "historial" && (
                <motion.div
                  key="historial"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                >
                  <Historial 
                    almacenes={almacenes} 
                    productos={productos} 
                    preselectedSku={preselectedSku}
                    onClearPreselectedSku={() => setPreselectedSku("")}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
