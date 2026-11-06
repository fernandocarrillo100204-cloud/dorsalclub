/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, Suspense, lazy } from "react";
import { authService, firestoreService } from "./lib/firebase";
import { Usuario, Producto, NavigationTab } from "./types";
import Sidebar from "./components/Sidebar";
import Login from "./components/Login";
import ErrorBoundary from "./components/ErrorBoundary";
import WorkspaceHeader from "./components/WorkspaceHeader";
import { useWorkspace } from "./context/WorkspaceContext";
import { navigationInfo, navigationParent } from "./lib/navigation";
import { mensajeError } from "./lib/errores";
import { ErrorState, LoadingState } from "./components/ui/Page";
import { motion, AnimatePresence } from "motion/react";

// Carga perezosa con reintento automático ante desincronización de chunks o recarga del servidor
function lazyWithRetry<T extends React.ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      const module = await componentImport();
      // Limpiar indicador de recarga cuando la importación tiene éxito
      sessionStorage.removeItem("antiorder_module_retry");
      return module;
    } catch (error: any) {
      console.warn("Reintentando carga dinámica del módulo...", error);
      try {
        await new Promise((resolve) => setTimeout(resolve, 250));
        const module = await componentImport();
        sessionStorage.removeItem("antiorder_module_retry");
        return module;
      } catch (retryError: any) {
        const isDynamicImportErr =
          error?.message?.includes("dynamically imported module") ||
          retryError?.message?.includes("dynamically imported module") ||
          error?.name === "ChunkLoadError";

        if (isDynamicImportErr) {
          const sessionKey = "antiorder_module_retry";
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

const Compras = lazyWithRetry(() => import("./components/Compras"));
const Ventas = lazyWithRetry(() => import("./components/Ventas"));
const PedidosVenta = lazyWithRetry(() => import("./components/PedidosVenta"));
const HistorialVentas = lazyWithRetry(() => import("./components/HistorialVentas"));
const Historial = lazyWithRetry(() => import("./components/Historial"));
const GestionProductos = lazyWithRetry(() => import("./components/GestionProductos"));
const Drops = lazyWithRetry(() => import("./components/Drops"));
const AnalisisClientes = lazyWithRetry(() => import("./components/AnalisisClientes"));
const Clientes = lazyWithRetry(() => import("./components/Clientes"));
const Finanzas = lazyWithRetry(() => import("./components/Finanzas"));
const Papelera = lazyWithRetry(() => import("./components/Papelera"));
const Configuracion = lazyWithRetry(() => import("./components/Configuracion"));

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
  if (normalized === "/finanzas/gastos" || normalized === "/finanzas/movimientos") {
    return "finanzas_gastos";
  }
  if (normalized === "/finanzas/por-cobrar") return "finanzas_cobrar";
  if (normalized === "/finanzas") {
    return "finanzas";
  }
  if (normalized === "/papelera") {
    return "papelera";
  }
  if (normalized === "/configuracion") {
    return "configuracion";
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
    return "ventas_stock";
  }
  if (normalized === "/ventas/stock") {
    return "ventas_stock";
  }
  if (normalized === "/ventas/bajo-pedido") {
    return "ventas_bajo_pedido";
  }
  if (normalized === "/ventas/paquete-emprendedor") {
    return "ventas_emprendedor";
  }
  if (normalized === "/ventas/mayoreo") {
    return "ventas_mayoreo";
  }
  if (normalized === "/ventas/pedidos") {
    return "ventas_pedidos";
  }
  if (normalized === "/ventas/historial") {
    return "ventas_historial";
  }
  if (normalized === "/transferencias/nueva" || normalized === "/inventario/transferencias") {
    return "drops";
  }
  if (normalized === "/movimientos/nuevo" || normalized === "/movimientos") {
    return "compras_nueva"; // Redirect as instructed
  }
  if (normalized === "/historial" || normalized === "/inventario/movimientos") {
    return "historial";
  }
  if (normalized === "/ventas" || normalized === "/ventas/analisis" || normalized === "/analisis-ventas" || normalized === "/analisis_ventas") {
    return "ventas_historial";
  }
  if (normalized === "/analisis-clientes" || normalized === "/analisis_clientes" || normalized === "/clientes/analisis") {
    return "analisis_clientes";
  }
  if (normalized === "/almacenes" || normalized === "/inventario/almacenes" || normalized === "/configuracion/almacenes") {
    return "drops";
  }
  if (normalized === "/catalogo" || normalized === "/productos" || normalized === "/inventario/productos") {
    return "catalogo";
  }
  if (normalized === "/inventario/drops" || normalized === "/drops") {
    return "drops";
  }
  if (normalized === "/dashboard" || normalized === "/inventario") {
    return "drops";
  }
  if (normalized === "" || normalized === "/") {
    return "compras";
  }
  return "compras";
};

const getPathFromTab = (tab: NavigationTab): string => {
  switch (tab) {
    case "compras":
      return "/compras";
    case "compras_nueva":
      return "/compras/nueva";
    case "ventas_nueva":
    case "ventas_stock":
      return "/ventas/nueva";
    case "ventas_bajo_pedido":
      return "/ventas/bajo-pedido";
    case "ventas_emprendedor":
      return "/ventas/paquete-emprendedor";
    case "ventas_mayoreo":
      return "/ventas/mayoreo";
    case "ventas_pedidos":
      return "/ventas/pedidos";
    case "ventas_historial":
      return "/ventas/historial";
    case "analisis_clientes":
      return "/clientes/analisis";
    case "historial":
      return "/inventario/movimientos";
    case "catalogo":
      return "/inventario/productos";
    case "drops":
      return "/inventario";
    case "clientes":
      return "/clientes";
    case "finanzas":
      return "/finanzas";
    case "finanzas_gastos":
      return "/finanzas/movimientos";
    case "finanzas_cobrar":
      return "/finanzas/por-cobrar";
    case "finanzas_gastos_nuevo":
      return "/finanzas/gastos/nuevo";
    case "papelera":
      return "/papelera";
    case "configuracion":
      return "/configuracion";
    case "movimientos":
      return "/compras/nueva";
    default:
      return "/compras";
  }
};

export default function App() {
  const { guardNavigation, notify } = useWorkspace();
  const historyIndex = useRef(Number(window.history.state?.antiorderIndex) || 0);
  const restoringHistory = useRef(false);
  const navigationPending = useRef(false);
  const historyPromptPending = useRef(false);
  const pendingHistoryIndex = useRef(historyIndex.current);
  const [user, setUser] = useState<Usuario | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  
  // Page / Route state synchronized with browser URL
  const [activeTab, setActiveTab] = useState<NavigationTab>(() => {
    return getTabFromPath(window.location.pathname);
  });
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const [preselectedSku, setPreselectedSku] = useState(() => {
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get("sku") || "";
  });
  const [preselectedDropId, setPreselectedDropId] = useState(() => new URLSearchParams(window.location.search).get("dropId") || "");
  const [preselectedClienteId, setPreselectedClienteId] = useState(() => {
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get("clienteId") || "";
  });
  const [preselectedGastoId, setPreselectedGastoId] = useState(() => {
    return getGastoIdFromPath(window.location.pathname);
  });

  const [productos, setProductos] = useState<Producto[]>([]);
  const [catalogErrors, setCatalogErrors] = useState<Record<string, string>>({});
  const [catalogReady, setCatalogReady] = useState<Record<string, boolean>>({});
  const [catalogVersion, setCatalogVersion] = useState(0);

  // Navigation helper that updates browser history and URL
  const navigateTo = async (tab: NavigationTab, params?: { sku?: string; clienteId?: string; gastoId?: string; dropId?: string }) => {
    let targetPath = "";
    if (tab === "finanzas_gastos_editar") {
      const gId = params?.gastoId || preselectedGastoId;
      targetPath = gId ? `/finanzas/gastos/${gId}/editar` : "/finanzas/gastos";
    } else {
      targetPath = getPathFromTab(tab);
    }
    const sp = new URLSearchParams();
    if (params?.sku) sp.set("sku", params.sku);
    if (params?.dropId) sp.set("dropId", params.dropId);
    if (params?.clienteId) sp.set("clienteId", params.clienteId);
    const qs = sp.toString();
    if (qs) targetPath += `?${qs}`;

    const currentFull = window.location.pathname + window.location.search;
    if (currentFull !== targetPath) {
      if (navigationPending.current) return;
      navigationPending.current = true;
      const staysInSaleForm = navigationParent(activeTab) === "ventas_stock" && navigationParent(tab) === "ventas_stock";
      const accepted = await guardNavigation(staysInSaleForm);
      navigationPending.current = false;
      if (!accepted) return;
      historyIndex.current += 1;
      window.history.pushState({ antiorderIndex: historyIndex.current }, "", targetPath);
    }

    setPreselectedDropId(params?.dropId || "");
    setPreselectedSku(params?.sku || "");
    setPreselectedClienteId(params?.clienteId || "");
    setPreselectedGastoId(params?.gastoId || (tab === "finanzas_gastos_editar" ? preselectedGastoId : ""));
    setActiveTab(tab);
  };

  // Sync state on browser back / forward navigation
  useEffect(() => {
    window.history.replaceState({ ...window.history.state, antiorderIndex: historyIndex.current }, "");
    const handlePopState = async (event: PopStateEvent) => {
      if (restoringHistory.current) { restoringHistory.current = false; return; }
      pendingHistoryIndex.current = typeof event.state?.antiorderIndex === "number" ? event.state.antiorderIndex : historyIndex.current - 1;
      // Multiple Back clicks share one decision and restore from the latest entry.
      if (historyPromptPending.current) return;
      historyPromptPending.current = true;
      navigationPending.current = true;
      const staysInSaleForm = navigationParent(activeTabRef.current) === "ventas_stock" && navigationParent(getTabFromPath(window.location.pathname)) === "ventas_stock";
      const accepted = await guardNavigation(staysInSaleForm);
      historyPromptPending.current = false;
      navigationPending.current = false;
      if (!accepted) {
        const delta = historyIndex.current - pendingHistoryIndex.current;
        if (delta) { restoringHistory.current = true; window.history.go(delta); }
        return;
      }
      historyIndex.current = pendingHistoryIndex.current;
      const tab = getTabFromPath(window.location.pathname);
      const searchParams = new URLSearchParams(window.location.search);
      setPreselectedSku(searchParams.get("sku") || "");
      setPreselectedDropId(searchParams.get("dropId") || "");
      setPreselectedClienteId(searchParams.get("clienteId") || "");
      setPreselectedGastoId(getGastoIdFromPath(window.location.pathname));
      setActiveTab(tab);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [guardNavigation]);

  useEffect(() => {
    document.title = `${navigationInfo(activeTab).title} · antiorder`;
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [activeTab]);

  // Monitor Auth State Changes
  useEffect(() => {
    const unsubscribe = authService.onAuthStateChange((currentUser) => {
      setUser(currentUser);
      setAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  // El catálogo de productos es compartido. La disponibilidad se consulta por drop.
  useEffect(() => {
    const uid = user?.uid;
    if (!uid) {
      setProductos([]);
      setCatalogReady({});
      setCatalogErrors({});
      return;
    }
    setCatalogErrors({});
    const ready = (name: string) => { setCatalogReady(current => ({ ...current, [name]: true })); setCatalogErrors(current => { const next = { ...current }; delete next[name]; return next; }); };
    const failed = (name: string, error: unknown) => setCatalogErrors(current => ({ ...current, [name]: mensajeError(error, `No se pudo cargar ${name}.`) }));

    // Subscribe to products
    const unsubscribeProductos = firestoreService.getProductosRealtime(
      (prodList) => {
        setProductos(prodList);
        ready("productos");
      },
      (error) => {
        console.error("Error en listener de productos:", error);
        failed("productos", error);
      }
    );

    return () => {
      unsubscribeProductos();
    };
  }, [user?.uid, catalogVersion]);

  const handleLogout = async () => {
    if (!(await guardNavigation())) return;
    try {
      await authService.logout();
      setUser(null);
      setPreselectedSku("");
    } catch (err) {
      console.error("Error signing out:", err);
      notify("No se pudo cerrar la sesión. Vuelve a intentarlo.", "error");
    }
  };

  // Render Loading spinner during initial firebase state check
  if (authChecking) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#0B1220] flex flex-col items-center justify-center text-[#64748B] dark:text-[#94A3B8] transition-colors">
        <span className="h-9 w-9 border-3 border-[#059669] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs font-medium text-[#172033] dark:text-[#F8FAFC]">Preparando tu espacio de trabajo…</p>
      </div>
    );
  }

  // Auth Guard
  if (!user) {
    return (
      <Login 
        onLoginSuccess={(u) => {
          setUser(u);
          navigateTo("compras");
        }} 
      />
    );
  }

  const needsCatalogs = ["compras", "compras_nueva", "movimientos", "ventas_nueva", "ventas_stock", "ventas_bajo_pedido", "ventas_emprendedor", "ventas_mayoreo", "catalogo", "drops", "historial", "ventas_historial", "analisis_clientes"].includes(activeTab);
  const catalogsLoading = needsCatalogs && ["productos"].some(key => !catalogReady[key]);
  const catalogsFailed = needsCatalogs && Object.keys(catalogErrors).length > 0;
  return (
    <div className="app-workspace font-sans selection:bg-emerald-100 dark:selection:bg-emerald-950">
      <a href="#workspace-main" className="skip-link">Ir al contenido</a>
      {/* Left Minimalist Sidebar (Desktop permanent + Mobile slide-over) */}
      <Sidebar 
        user={user} 
        activeTab={activeTab} 
        setActiveTab={(tab) => navigateTo(tab)} 
        onLogout={handleLogout} 
      />

      {/* Main content shares its spacing with the desktop sidebar. */}
      <div className="workspace-main">
        <WorkspaceHeader activeTab={activeTab} onNavigate={navigateTo} />
        <main id="workspace-main" tabIndex={-1} className="workspace-content">
          {catalogsFailed && <div className="page-shell pb-0"><ErrorState message={`No se pudo sincronizar ${Object.keys(catalogErrors).join(", ")}. ${Object.values(catalogErrors)[0]}`} onRetry={() => setCatalogVersion(current => current + 1)} /></div>}
          {catalogsLoading ? (!catalogsFailed && <div className="page-shell"><LoadingState label="Cargando catálogos…" /></div>) : <div className="w-full">
            <ErrorBoundary key={navigationParent(activeTab)}>
              <Suspense
                fallback={
                  <div className="page-shell"><LoadingState label="Cargando apartado…" /></div>
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
                      productos={productos}
                      isNewView={activeTab === "compras_nueva" || activeTab === "movimientos"}
                      onNavigate={(tab) => navigateTo(tab)}
                      onNavigateToNew={() => navigateTo("compras_nueva")}
                      onNavigateToHistory={() => navigateTo("compras")}
                    />
                  </motion.div>
                )}

                {/* Ventas: Registro de Salida Comercial */}
                {(["ventas_nueva", "ventas_stock", "ventas_bajo_pedido", "ventas_emprendedor", "ventas_mayoreo"] as NavigationTab[]).includes(activeTab) && (
                  <motion.div
                    key="ventas_nueva"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                  >
                    <Ventas
                      productos={productos}
                      preselectedSku={preselectedSku}
                      preselectedDropId={preselectedDropId}
                      preselectedClienteId={preselectedClienteId}
                      canal={activeTab === "ventas_bajo_pedido" ? "bajo_pedido" : activeTab === "ventas_emprendedor" ? "paquete_emprendedor" : activeTab === "ventas_mayoreo" ? "mayoreo" : "stock"}
                      onCanalChange={(nextCanal) => navigateTo(nextCanal === "bajo_pedido" ? "ventas_bajo_pedido" : nextCanal === "paquete_emprendedor" ? "ventas_emprendedor" : nextCanal === "mayoreo" ? "ventas_mayoreo" : "ventas_stock", { clienteId: preselectedClienteId || undefined })}
                      onSuccess={() => navigateTo(activeTab === "ventas_bajo_pedido" || activeTab === "ventas_mayoreo" ? "ventas_pedidos" : "ventas_historial")}
                      onCancel={() => navigateTo("ventas_historial")}
                    />
                  </motion.div>
                )}

                {activeTab === "ventas_pedidos" && (
                  <motion.div
                    key="ventas_pedidos"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                  >
                    <PedidosVenta />
                  </motion.div>
                )}

                {activeTab === "ventas_historial" && (
                  <motion.div
                    key="ventas_historial"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                  >
                    <HistorialVentas
                      productos={productos}
                      preselectedClienteId={preselectedClienteId}
                      onNavigateToCliente={(clienteId) => navigateTo("clientes", { clienteId })}
                      onNewSale={() => navigateTo("ventas_stock")}
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
                      preselectedClienteId={preselectedClienteId}
                      onNavigateToVenta={(clienteId) => navigateTo("ventas_nueva", { clienteId })}
                      onNavigateToHistory={(clienteId) => navigateTo("ventas_historial", { clienteId })}
                      onNavigateToPedidos={() => navigateTo("ventas_pedidos")}
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

                      productos={productos}
                      preselectedClienteId={preselectedClienteId}
                      onNavigateToClientes={(clienteId) => navigateTo("clientes", { clienteId })}
                      onNavigateToVentaNueva={(clienteId) => navigateTo("ventas_nueva", { clienteId })}
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

                      productos={productos} 

                      onNavigateToMovimiento={(sku) => navigateTo("compras_nueva", { sku })}
                    />
                  </motion.div>
                )}

                {/* Drops: seguimiento de compras y ventas por pedido comercial */}
                {activeTab === "drops" && (
                  <motion.div
                    key="drops"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                  >
                    <Drops onSell={(dropId, sku) => navigateTo("ventas_stock", { dropId, sku })} onPurchases={() => navigateTo("compras")} />
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

                      productos={productos} 
                      preselectedSku={preselectedSku}
                      preselectedClienteId={preselectedClienteId}
                      onClearPreselectedSku={() => setPreselectedSku("")}
                      onNavigateToCliente={(clienteId) => navigateTo("clientes", { clienteId })}
                    />
                  </motion.div>
                )}

                {/* Finanzas: Resumen y Gastos */}
                {(activeTab === "finanzas" || activeTab === "finanzas_gastos" || activeTab === "finanzas_cobrar" || activeTab === "finanzas_gastos_nuevo" || activeTab === "finanzas_gastos_editar") && (
                  <motion.div
                    key="finanzas"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                  >
                    <Finanzas
                      subView={
                        activeTab === "finanzas_gastos_nuevo"
                          ? "nuevo"
                          : activeTab === "finanzas_gastos_editar"
                          ? "editar"
                          : activeTab === "finanzas_gastos"
                          ? "movimientos"
                          : activeTab === "finanzas_cobrar"
                          ? "cobrar"
                          : "resumen"
                      }
                      gastoId={preselectedGastoId}
                      onNavigateToResumen={() => navigateTo("finanzas")}
                      onNavigateToGastos={() => navigateTo("finanzas_gastos")}
                      onNavigateToCobrar={() => navigateTo("finanzas_cobrar")}
                      onNavigateToNuevoGasto={() => navigateTo("finanzas_gastos_nuevo")}
                      onNavigateToEditarGasto={(id) => navigateTo("finanzas_gastos_editar", { gastoId: id })}
                      onNavigateToVentas={() => navigateTo("ventas_historial")}
                      onNavigateToCompras={() => navigateTo("compras")}
                    />
                  </motion.div>
                )}

                {activeTab === "papelera" && (
                  <motion.div
                    key="papelera"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                  >
                    <Papelera />
                  </motion.div>
                )}

                {activeTab === "configuracion" && (
                  <motion.div key="configuracion" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} transition={{ duration: 0.25, ease: "easeInOut" }}>
                    <Configuracion onNavigateToProducts={() => navigateTo("catalogo")} />
                  </motion.div>
                )}
              </AnimatePresence>
            </Suspense>
          </ErrorBoundary>
        </div>}
        </main>
      </div>
    </div>
  );
}
