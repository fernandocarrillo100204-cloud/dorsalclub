/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Suspense, lazy } from "react";
import { authService, firestoreService } from "./lib/firebase";
import { Usuario, Almacen, Producto, StockItem, NavigationTab } from "./types";
import Sidebar from "./components/Sidebar";
import Login from "./components/Login";
import ErrorBoundary from "./components/ErrorBoundary";
import { motion, AnimatePresence } from "motion/react";

// Carga perezosa con reintento automático ante desincronización de chunks o recarga del servidor
function lazyWithRetry<T extends React.ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      const module = await componentImport();
      // Limpiar indicador de recarga cuando la importación tiene éxito
      sessionStorage.removeItem("dorsalclub_module_retry");
      return module;
    } catch (error: any) {
      console.warn("Reintentando carga dinámica del módulo...", error);
      try {
        await new Promise((resolve) => setTimeout(resolve, 250));
        const module = await componentImport();
        sessionStorage.removeItem("dorsalclub_module_retry");
        return module;
      } catch (retryError: any) {
        const isDynamicImportErr =
          error?.message?.includes("dynamically imported module") ||
          retryError?.message?.includes("dynamically imported module") ||
          error?.name === "ChunkLoadError";

        if (isDynamicImportErr) {
          const sessionKey = "dorsalclub_module_retry";
          const hasReloaded = sessionStorage.getItem(sessionKey);
          if (!hasReloaded) {
            sessionStorage.setItem(sessionKey, "true");
            window.location.reload();
            return new Promise<{ default: T }>(() => {});
          }
        }
        throw retryError;
      }
    }
  });
}

const Dashboard = lazyWithRetry(() => import("./components/Dashboard"));
const Compras = lazyWithRetry(() => import("./components/Compras"));
const Ventas = lazyWithRetry(() => import("./components/Ventas"));
const Transferencias = lazyWithRetry(() => import("./components/Transferencias"));
const Historial = lazyWithRetry(() => import("./components/Historial"));
const GestionAlmacenes = lazyWithRetry(() => import("./components/GestionAlmacenes"));
const GestionProductos = lazyWithRetry(() => import("./components/GestionProductos"));
const AnalisisVentas = lazyWithRetry(() => import("./components/AnalisisVentas"));
const AnalisisClientes = lazyWithRetry(() => import("./components/AnalisisClientes"));
const Clientes = lazyWithRetry(() => import("./components/Clientes"));
const Finanzas = lazyWithRetry(() => import("./components/Finanzas"));

const getGastoIdFromPath = (path: string): string => {
  const match = path.match(/\/finanzas\/gastos\/([^/]+)\/editar\/?$/i);
  return match ? match[1] : "";
};

const getTabFromPath = (path: string): NavigationTab => {
  const normalized = path.toLowerCase().replace(/\/$/, "");
  if (normalized === "/finanzas/gastos/nuevo") {
    return "finanzas_gastos_nuevo";
  }
  if (/^\/finanzas\/gastos\/[^/]+\/editar$/.test(normalized)) {
    return "finanzas_gastos_editar";
  }
  if (normalized === "/finanzas/gastos") {
    return "finanzas_gastos";
  }
  if (normalized === "/finanzas") {
    return "finanzas";
  }
  if (normalized === "/clientes") {
    return "clientes";
  }
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
  if (normalized === "/analisis-clientes" || normalized === "/analisis_clientes") {
    return "analisis_clientes";
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
    case "analisis_clientes":
      return "/analisis-clientes";
    case "historial":
      return "/historial";
    case "almacenes":
      return "/almacenes";
    case "catalogo":
      return "/productos";
    case "clientes":
      return "/clientes";
    case "finanzas":
      return "/finanzas";
    case "finanzas_gastos":
      return "/finanzas/gastos";
    case "finanzas_gastos_nuevo":
      return "/finanzas/gastos/nuevo";
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
  const [preselectedClienteId, setPreselectedClienteId] = useState(() => {
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get("clienteId") || "";
  });
  const [preselectedGastoId, setPreselectedGastoId] = useState(() => {
    return getGastoIdFromPath(window.location.pathname);
  });

  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [stockList, setStockList] = useState<StockItem[]>([]);
  const [almacenesLoaded, setAlmacenesLoaded] = useState(false);
  const [productosLoaded, setProductosLoaded] = useState(false);
  const [stockLoaded, setStockLoaded] = useState(false);

  // Navigation helper that updates browser history and URL
  const navigateTo = (tab: NavigationTab, params?: { sku?: string; almacenId?: string; clienteId?: string; gastoId?: string }) => {
    let targetPath = "";
    if (tab === "finanzas_gastos_editar") {
      const gId = params?.gastoId || preselectedGastoId;
      targetPath = gId ? `/finanzas/gastos/${gId}/editar` : "/finanzas/gastos";
    } else {
      targetPath = getPathFromTab(tab);
    }
    const sp = new URLSearchParams();
    if (params?.sku) sp.set("sku", params.sku);
    if (params?.almacenId) sp.set("almacenId", params.almacenId);
    if (params?.clienteId) sp.set("clienteId", params.clienteId);
    const qs = sp.toString();
    if (qs) targetPath += `?${qs}`;

    const currentFull = window.location.pathname + window.location.search;
    if (currentFull !== targetPath) {
      window.history.pushState({}, "", targetPath);
    }

    setPreselectedSku(params?.sku || "");
    setPreselectedAlmacenId(params?.almacenId || "");
    setPreselectedClienteId(params?.clienteId || "");
    setPreselectedGastoId(params?.gastoId || (tab === "finanzas_gastos_editar" ? preselectedGastoId : ""));
    setActiveTab(tab);
  };

  // Sync state on browser back / forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const tab = getTabFromPath(window.location.pathname);
      const searchParams = new URLSearchParams(window.location.search);
      setPreselectedSku(searchParams.get("sku") || "");
      setPreselectedAlmacenId(searchParams.get("almacenId") || "");
      setPreselectedClienteId(searchParams.get("clienteId") || "");
      setPreselectedGastoId(getGastoIdFromPath(window.location.pathname));
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
    if (!uid) {
      setAlmacenes([]);
      setProductos([]);
      setStockList([]);
      setAlmacenesLoaded(false);
      setProductosLoaded(false);
      setStockLoaded(false);
      return;
    }

    // Subscribe to warehouses
    const unsubscribeAlmacenes = firestoreService.getAlmacenesRealtime(
      (almList) => {
        setAlmacenes(almList);
        setAlmacenesLoaded(true);
      },
      (error) => {
        console.error("Error en listener de almacenes:", error);
        setAlmacenesLoaded(true);
      }
    );

    // Subscribe to products
    const unsubscribeProductos = firestoreService.getProductosRealtime(
      (prodList) => {
        setProductos(prodList);
        setProductosLoaded(true);
      },
      (error) => {
        console.error("Error en listener de productos:", error);
        setProductosLoaded(true);
      }
    );

    // Subscribe to stock
    const unsubscribeStock = firestoreService.getStockRealtime(
      (stkList) => {
        setStockList(stkList);
        setStockLoaded(true);
      },
      (error) => {
        console.error("Error en listener de stock:", error);
        setStockLoaded(true);
      }
    );

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
            <ErrorBoundary>
              <Suspense
                fallback={
                  <div className="min-h-[50vh] flex flex-col items-center justify-center text-zinc-400">
                    <span className="h-7 w-7 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mb-2" />
                    <p className="text-xs">Cargando módulo...</p>
                  </div>
                }
              >
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
                      preselectedClienteId={preselectedClienteId}
                      onSuccess={() => navigateTo("dashboard")}
                      onCancel={() => navigateTo("dashboard")}
                    />
                  </motion.div>
                )}

                {/* Clientes: Catálogo y Fichas Comerciales */}
                {activeTab === "clientes" && (
                  <motion.div
                    key="clientes"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                  >
                    <Clientes
                      onNavigateToVenta={(clienteId) => navigateTo("ventas_nueva", { clienteId })}
                      onNavigateToHistory={(clienteId) => navigateTo("historial", { clienteId })}
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
                      stockList={stockList}
                      loadingStock={!stockLoaded}
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

                {/* Análisis de Clientes */}
                {activeTab === "analisis_clientes" && (
                  <motion.div
                    key="analisis_clientes"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                  >
                    <AnalisisClientes 
                      almacenes={almacenes} 
                      productos={productos}
                      preselectedClienteId={preselectedClienteId}
                      onNavigateToClientes={(clienteId) => navigateTo("clientes", { clienteId })}
                      onNavigateToVentaNueva={(clienteId) => navigateTo("ventas_nueva", { clienteId })}
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
                      preselectedClienteId={preselectedClienteId}
                      onClearPreselectedSku={() => setPreselectedSku("")}
                      onNavigateToCliente={(clienteId) => navigateTo("clientes", { clienteId })}
                    />
                  </motion.div>
                )}

                {/* Finanzas: Resumen y Gastos */}
                {(activeTab === "finanzas" || activeTab === "finanzas_gastos" || activeTab === "finanzas_gastos_nuevo" || activeTab === "finanzas_gastos_editar") && (
                  <motion.div
                    key="finanzas"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                  >
                    <Finanzas
                      almacenes={almacenes}
                      subView={
                        activeTab === "finanzas_gastos_nuevo"
                          ? "nuevo"
                          : activeTab === "finanzas_gastos_editar"
                          ? "editar"
                          : activeTab === "finanzas_gastos"
                          ? "gastos"
                          : "resumen"
                      }
                      gastoId={preselectedGastoId}
                      onNavigateToResumen={() => navigateTo("finanzas")}
                      onNavigateToGastos={() => navigateTo("finanzas_gastos")}
                      onNavigateToNuevoGasto={() => navigateTo("finanzas_gastos_nuevo")}
                      onNavigateToEditarGasto={(id) => navigateTo("finanzas_gastos_editar", { gastoId: id })}
                      onNavigateToVentas={() => navigateTo("analisis_ventas")}
                      onNavigateToCompras={() => navigateTo("compras")}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </Suspense>
          </ErrorBoundary>
        </div>
        </main>
      </div>
    </div>
  );
}
