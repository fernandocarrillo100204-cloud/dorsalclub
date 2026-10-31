/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getFirestore,
  initializeFirestore,
  collection, 
  doc, 
  getDocs, 
  getDoc,
  setDoc,
  addDoc, 
  onSnapshot, 
  runTransaction, 
  writeBatch,
  query, 
  where, 
  orderBy,
  limit,
  startAfter,
  Timestamp,
  deleteField
} from "firebase/firestore";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  User as FirebaseUser
} from "firebase/auth";
import { 
  Almacen, 
  Producto, 
  StockItem, 
  Movimiento, 
  VentaRegistroInput,
  Venta,
  PagoVenta,
  Usuario, 
  CategoriaCatalogo, 
  MarcaCatalogo,
  ColorCatalogo,
  TallaRopaCatalogo,
  TallaCalzadoCatalogo,
  UnidadMedidaCatalogo,
  UbicacionEntregaCatalogo,
  RepartidorCatalogo,
  ConfiguracionListasDesplegables,
  ConfiguracionVentas,
  CanalVentaId,
  OpcionListaConfigurable,
  ResumenVentaDiaria,
  Compra,
  CompraItem,
  Cliente,
  TipoCliente,
  CanalPreferido,
  OrigenCliente,
  EstadoCliente,
  Gasto,
  CategoriaGasto,
  MetodoPagoGasto,
  CATEGORIAS_GASTO,
  METODOS_PAGO_GASTO,
  DatosFinancierosMensuales,
  FinanzasDiaPunto,
  PeriodoFinancieroIndex,
  PedidoVenta,
  PapeleraItem,
  PapeleraTipo,
  Drop,
  EstadoDrop,
  MovimientoFinancieroManual,
  TipoMovimientoFinanciero,
  CuentaPorCobrar,
  ResumenFinancieroConsolidado,
  MovimientoFinancieroFila
} from "../types";
import {
  getPeriodoKey,
  getPeriodContribution,
  computeNewPeriodIndexData,
  applyPeriodIndexDeltas,
  getPeriodosFinancierosDisponibles,
  clearPeriodosFinancierosCache
} from "./periodosFinancieros";
import { allocateRecognizedSaleIncome, calculateSaleTotals, getMissingDropSkus, requiresSaleRefund } from "./ventasCore";
import { construirPedidos, fechaRegistro, leerMovimiento, leerVenta } from "./lecturasVentas";

// Detect if Firebase config is present in environment variables
const metaEnv = (import.meta as any).env || {};
const firebaseConfig = {
  apiKey: metaEnv.VITE_FIREBASE_API_KEY || "",
  authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: metaEnv.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: metaEnv.VITE_FIREBASE_APP_ID || ""
};

const isConfigured = Boolean(
  firebaseConfig.apiKey && 
  firebaseConfig.projectId && 
  firebaseConfig.apiKey !== "MY_FIREBASE_API_KEY" &&
  firebaseConfig.apiKey !== "your-api-key" &&
  !firebaseConfig.apiKey.includes("your-") &&
  !firebaseConfig.projectId.includes("your-") &&
  firebaseConfig.apiKey.length > 15
);

// Initialize Firebase if configured
let realApp;
let realDb: any = null;
let realAuth: any = null;

if (isConfigured) {
  try {
    realApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    try {
      realDb = initializeFirestore(realApp, {
        experimentalForceLongPolling: true,
        ignoreUndefinedProperties: true
      });
    } catch {
      realDb = getFirestore(realApp);
    }
    realAuth = getAuth(realApp);
    console.log("Firebase inicializado exitosamente.");
  } catch (error) {
    console.error("Error al inicializar Firebase:", error);
    realDb = null;
    realAuth = null;
  }
} else {
  console.log("Firebase no configurado. Operando en modo Emulador Local (localStorage).");
}

// --- HELPER PARA FECHAS LOCALES Y-M-D ---
export function getLocalDateString(date: Date | { seconds: number; nanoseconds: number } | any): string {
  if (!date) {
    date = new Date();
  }
  const d = date instanceof Date 
    ? date 
    : (typeof date?.toDate === "function" ? date.toDate() : (date?.seconds ? new Date(date.seconds * 1000) : new Date(date)));
  
  if (isNaN(d.getTime())) {
    const fallback = new Date();
    const y = fallback.getFullYear();
    const m = String(fallback.getMonth() + 1).padStart(2, "0");
    const day = String(fallback.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// --- LOCAL STORAGE HIGH-FIDELITY EMULATOR (SOLO CUANDO FIREBASE NO ESTÁ CONFIGURADO) ---
const STORAGE_PREFIX = "inventario_mvp_";

export const getLocalStorageItem = <T>(key: string, defaultValue: T): T => {
  const value = localStorage.getItem(STORAGE_PREFIX + key);
  if (!value) return defaultValue;
  try {
    return JSON.parse(value) as T;
  } catch (e) {
    console.error(`Error parsing localStorage key ${key}:`, e);
    return defaultValue;
  }
};

export const setLocalStorageItem = <T>(key: string, value: T): void => {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.error(`Error writing to localStorage key ${key}:`, e);
  }
};

// Listeners for local emulator reactivity
const listeners = {
  almacenes: [] as ((data: Almacen[]) => void)[],
  productos: [] as ((data: Producto[]) => void)[],
  stock: [] as ((data: StockItem[]) => void)[],
  movimientos: [] as ((data: Movimiento[]) => void)[],
  compras: [] as ((data: Compra[]) => void)[],
  categorias: [] as ((data: CategoriaCatalogo[]) => void)[],
  marcas: [] as ((data: MarcaCatalogo[]) => void)[],
  colores: [] as ((data: ColorCatalogo[]) => void)[],
  tallas_ropa: [] as ((data: TallaRopaCatalogo[]) => void)[],
  tallas_calzado: [] as ((data: TallaCalzadoCatalogo[]) => void)[],
  unidades: [] as ((data: UnidadMedidaCatalogo[]) => void)[],
  ubicaciones_entrega: [] as ((data: UbicacionEntregaCatalogo[]) => void)[],
  repartidores: [] as ((data: RepartidorCatalogo[]) => void)[],
  clientes: [] as ((data: Cliente[]) => void)[],
  gastos: [] as ((data: Gasto[]) => void)[],
  auth: [] as ((user: Usuario | null) => void)[]
};

const notifyListeners = (key: keyof typeof listeners, data: any) => {
  listeners[key].forEach(cb => {
    try {
      cb(data);
    } catch (err) {
      console.error(`Error notifying listener for ${key}:`, err);
    }
  });
};

const normalizeMarcasFavoritasIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value
      .filter((id): id is string => typeof id === "string")
      .map(id => id.trim())
      .filter(Boolean)
  )];
};

const rebrandLegacyName = (value?: string): string | undefined => {
  if (!value) return value;
  return value.trim().toLowerCase() === "dorsalclub" ? "antiorder" : value;
};

const rebrandLegacyProduct = (producto: Producto): Producto => ({
  ...producto,
  marca: rebrandLegacyName(producto.marca)
});

const rebrandLegacyCatalogBrand = (marca: MarcaCatalogo): MarcaCatalogo => ({
  ...marca,
  nombre: rebrandLegacyName(marca.nombre) || marca.nombre
});

const getLocalClientes = (): Cliente[] => (
  getLocalStorageItem<Cliente[]>("clientes", []).map(cliente => ({
    ...cliente,
    marcas_favoritas_ids: normalizeMarcasFavoritasIds(cliente.marcas_favoritas_ids)
  }))
);

// Initialize empty keys in local emulator mode only if they do not already exist
const initializeLocalEmulator = () => {
  if (isConfigured) return;

  if (localStorage.getItem(STORAGE_PREFIX + "almacenes") === null) {
    setLocalStorageItem("almacenes", []);
  }
  if (localStorage.getItem(STORAGE_PREFIX + "productos") === null) {
    setLocalStorageItem("productos", []);
  }
  if (localStorage.getItem(STORAGE_PREFIX + "stock") === null) {
    setLocalStorageItem("stock", {});
  }
  if (localStorage.getItem(STORAGE_PREFIX + "movimientos") === null) {
    setLocalStorageItem("movimientos", []);
  }
  if (localStorage.getItem(STORAGE_PREFIX + "compras") === null) {
    setLocalStorageItem("compras", []);
  }
  if (localStorage.getItem(STORAGE_PREFIX + "resumen_ventas") === null) {
    setLocalStorageItem("resumen_ventas", {});
  }
  if (localStorage.getItem(STORAGE_PREFIX + "contadores_movimientos") === null) {
    setLocalStorageItem("contadores_movimientos", {
      entrada: 0,
      salida: 0,
      transferencia: 0,
      ajuste: 0,
      compra: 0
    });
  }
  if (localStorage.getItem(STORAGE_PREFIX + "categorias") === null) {
    setLocalStorageItem("categorias", []);
  }
  if (localStorage.getItem(STORAGE_PREFIX + "unidades") === null) {
    setLocalStorageItem("unidades", []);
  }
  if (localStorage.getItem(STORAGE_PREFIX + "clientes") === null) {
    setLocalStorageItem("clientes", []);
  }
  if (localStorage.getItem(STORAGE_PREFIX + "gastos") === null) {
    setLocalStorageItem("gastos", []);
  }
};

initializeLocalEmulator();

export const isRealFirebase = isConfigured;
export const getRealDb = () => realDb;

// --- SERVICIO DE AUTENTICACIÓN ---
export const authService = {
  isConfigured: () => isConfigured,

  login: async (email: string, pass: string): Promise<Usuario> => {
    return authService.loginWithEmail(email, pass);
  },

  loginWithGoogle: async (): Promise<Usuario> => {
    if (isConfigured && realAuth) {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(realAuth, provider);
      const userObj: Usuario = {
        uid: result.user.uid,
        email: result.user.email || "",
        nombre: result.user.displayName || undefined
      };
      setLocalStorageItem("currentUser", userObj);
      return userObj;
    } else {
      const userObj: Usuario = {
        uid: "local_user_google",
        email: "usuario@antiorder.com",
        nombre: "Usuario"
      };
      setLocalStorageItem("currentUser", userObj);
      notifyListeners("auth", userObj);
      return userObj;
    }
  },

  loginWithEmail: async (email: string, pass: string): Promise<Usuario> => {
    const cleanEmail = (email || "").trim();
    if (!cleanEmail) {
      throw new Error("El correo electrónico es requerido.");
    }

    if (isConfigured && realAuth) {
      const result = await signInWithEmailAndPassword(realAuth, cleanEmail, pass);
      const userObj: Usuario = {
        uid: result.user.uid,
        email: result.user.email || cleanEmail,
        nombre: result.user.displayName || cleanEmail.split("@")[0]
      };
      setLocalStorageItem("currentUser", userObj);
      return userObj;
    } else {
      const userObj: Usuario = {
        uid: "local_" + cleanEmail.replace(/[^a-zA-Z0-9]/g, "_"),
        email: cleanEmail,
        nombre: cleanEmail.split("@")[0]
      };
      setLocalStorageItem("currentUser", userObj);
      notifyListeners("auth", userObj);
      return userObj;
    }
  },

  logout: async (): Promise<void> => {
    if (isConfigured && realAuth) {
      try {
        await signOut(realAuth);
      } catch (err) {
        console.warn("SignOut from Firebase Auth:", err);
      }
    }
    localStorage.removeItem(STORAGE_PREFIX + "currentUser");
    notifyListeners("auth", null);
  },

  onAuthStateChange: (callback: (user: Usuario | null) => void): (() => void) => {
    if (isConfigured && realAuth) {
      let unsubscribeFb = () => {};
      try {
        unsubscribeFb = onAuthStateChanged(
          realAuth,
          (firebaseUser: FirebaseUser | null) => {
            if (firebaseUser) {
              const userObj: Usuario = {
                uid: firebaseUser.uid,
                email: firebaseUser.email || "",
                nombre: firebaseUser.displayName || undefined
              };
              setLocalStorageItem("currentUser", userObj);
              callback(userObj);
            } else {
              localStorage.removeItem(STORAGE_PREFIX + "currentUser");
              callback(null);
            }
          },
          (error) => {
            console.warn("Observador onAuthStateChanged con error:", error);
            localStorage.removeItem(STORAGE_PREFIX + "currentUser");
            callback(null);
          }
        );
      } catch (e) {
        console.warn("No se pudo iniciar onAuthStateChanged:", e);
        localStorage.removeItem(STORAGE_PREFIX + "currentUser");
        callback(null);
      }

      const update = (newUser: Usuario | null) => {
        if (!realAuth.currentUser) {
          callback(newUser);
        }
      };

      listeners.auth.push(update);
      return () => {
        unsubscribeFb();
        listeners.auth = listeners.auth.filter(cb => cb !== update);
      };
    } else {
      const initialUser = getLocalStorageItem<Usuario | null>("currentUser", null);
      callback(initialUser);

      let currentCachedUid = initialUser ? initialUser.uid : null;
      const update = (newUser: Usuario | null) => {
        const newUid = newUser ? newUser.uid : null;
        if (newUid !== currentCachedUid) {
          currentCachedUid = newUid;
          callback(newUser);
        }
      };

      listeners.auth.push(update);
      return () => {
        listeners.auth = listeners.auth.filter(cb => cb !== update);
      };
    }
  },

  getCurrentUser: (): Usuario | null => {
    if (isConfigured && realAuth && realAuth.currentUser) {
      const fbUser = realAuth.currentUser;
      return {
        uid: fbUser.uid,
        email: fbUser.email || "",
        nombre: fbUser.displayName || undefined
      };
    }
    return getLocalStorageItem<Usuario | null>("currentUser", null);
  }
};

// --- CACHÉ EN MEMORIA PARA EL DASHBOARD FINANCIERO MENSUAL ---
const finanzasMonthlyCache = new Map<string, DatosFinancierosMensuales>();

export function clearFinanzasCache(year?: number, month?: number): void {
  if (year && month) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    finanzasMonthlyCache.delete(key);
  } else {
    finanzasMonthlyCache.clear();
    clearPeriodosFinancierosCache();
  }
}

type CatalogoEntrega = UbicacionEntregaCatalogo | RepartidorCatalogo;
type CatalogoEntregaKey = "ubicaciones_entrega" | "repartidores";

const getCatalogoEntrega = async <T extends CatalogoEntrega>(collectionName: string, localKey: CatalogoEntregaKey): Promise<T[]> => {
  if (isConfigured && realDb) {
    const snap = await getDocs(collection(realDb, collectionName));
    const list = snap.docs.map(item => ({ id: item.id, ...item.data() } as T));
    return list.filter(item => item.en_papelera !== true).sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
  }
  return getLocalStorageItem<T[]>(localKey, [])
    .filter(item => item.en_papelera !== true)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
};

const subscribeCatalogoEntrega = <T extends CatalogoEntrega>(collectionName: string, localKey: CatalogoEntregaKey, onUpdate: (items: T[]) => void): (() => void) => {
  const emit = (items: T[]) => onUpdate(items
    .filter(item => item.en_papelera !== true)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })));
  if (isConfigured && realDb) {
    return onSnapshot(collection(realDb, collectionName), snapshot => {
      emit(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as T)));
    }, error => console.error(`Error al consultar ${collectionName}:`, error));
  }
  const update = () => emit(getLocalStorageItem<T[]>(localKey, []));
  update();
  listeners[localKey].push(update as any);
  return () => { listeners[localKey] = listeners[localKey].filter(callback => callback !== update as any) as any; };
};

const addCatalogoEntrega = async <T extends CatalogoEntrega>(collectionName: string, localKey: CatalogoEntregaKey, prefix: string, nombre: string): Promise<string> => {
  const cleanName = nombre.trim();
  if (!cleanName) throw new Error("El nombre es obligatorio.");
  const existing = await getCatalogoEntrega<T>(collectionName, localKey);
  if (existing.some(item => item.nombre.trim().toLowerCase() === cleanName.toLowerCase())) throw new Error(`"${cleanName}" ya existe.`);
  const id = `${prefix}_${Math.random().toString(36).slice(2, 11)}`;
  if (isConfigured && realDb) {
    await setDoc(doc(realDb, collectionName, id), { nombre: cleanName, activa: true, creado: Timestamp.now() });
    return id;
  }
  const list = getLocalStorageItem<T[]>(localKey, []);
  list.push({ id, nombre: cleanName, activa: true, creado: new Date() } as T);
  setLocalStorageItem(localKey, list);
  notifyListeners(localKey, list);
  return id;
};

const updateCatalogoEntrega = async <T extends CatalogoEntrega>(collectionName: string, localKey: CatalogoEntregaKey, id: string, data: Partial<Omit<T, "id">>): Promise<void> => {
  if (isConfigured && realDb) {
    await setDoc(doc(realDb, collectionName, id), data, { merge: true });
    return;
  }
  const list = getLocalStorageItem<T[]>(localKey, []);
  const index = list.findIndex(item => item.id === id);
  if (index === -1) throw new Error("El elemento ya no existe.");
  list[index] = { ...list[index], ...data };
  setLocalStorageItem(localKey, list);
  notifyListeners(localKey, list);
};

const deleteCatalogoEntrega = async <T extends CatalogoEntrega>(collectionName: string, localKey: CatalogoEntregaKey, id: string): Promise<void> => {
  if (isConfigured && realDb) {
    await setDoc(doc(realDb, collectionName, id), { activa: false, en_papelera: true, desactivado_at: Timestamp.now() }, { merge: true });
    return;
  }
  const list = getLocalStorageItem<T[]>(localKey, []);
  const index = list.findIndex(item => item.id === id);
  if (index === -1) throw new Error("El elemento ya no existe.");
  list[index] = { ...list[index], activa: false, en_papelera: true, desactivado_at: new Date() };
  setLocalStorageItem(localKey, list);
  notifyListeners(localKey, list);
};

const makeConfigOptions = (values: string[], prefix: string): OpcionListaConfigurable[] =>
  values.map((nombre, index) => ({ id: `${prefix}_${index + 1}`, nombre, activa: true }));

const DEFAULT_LISTAS_DESPLEGABLES: ConfiguracionListasDesplegables = {
  proveedores_compra: [],
  tipos_cliente: makeConfigOptions(["minorista", "mayorista", "emprendedor"], "tipo"),
  canales_contacto: makeConfigOptions(["WhatsApp", "Instagram", "Llamada telefónica", "Correo electrónico", "Otro"], "canal"),
  origenes_cliente: makeConfigOptions(["Instagram", "Recomendación / Boca a boca", "Tienda física / Showroom", "Evento / Pop-up", "Otro canal"], "origen"),
  categorias_gasto: makeConfigOptions(CATEGORIAS_GASTO, "categoria"),
  metodos_pago_gasto: makeConfigOptions(METODOS_PAGO_GASTO, "pago"),
  metodos_pago_venta: makeConfigOptions(["Efectivo", "Transferencia", "Tarjeta de débito", "Tarjeta de crédito", "Otro"], "pago_venta")
};

const normalizeConfigOptions = (value: unknown, fallback: OpcionListaConfigurable[]): OpcionListaConfigurable[] => {
  if (!Array.isArray(value)) return fallback.map(item => ({ ...item }));
  return value
    .filter(item => item && typeof item === "object" && typeof (item as any).id === "string" && typeof (item as any).nombre === "string")
    .map(item => ({ id: (item as any).id.trim(), nombre: (item as any).nombre.trim(), activa: (item as any).activa !== false }))
    .filter(item => item.id && item.nombre);
};

const normalizeListasConfig = (data?: Partial<ConfiguracionListasDesplegables> | null): ConfiguracionListasDesplegables => ({
  proveedores_compra: normalizeConfigOptions(data?.proveedores_compra, DEFAULT_LISTAS_DESPLEGABLES.proveedores_compra),
  tipos_cliente: normalizeConfigOptions(data?.tipos_cliente, DEFAULT_LISTAS_DESPLEGABLES.tipos_cliente),
  canales_contacto: normalizeConfigOptions(data?.canales_contacto, DEFAULT_LISTAS_DESPLEGABLES.canales_contacto),
  origenes_cliente: normalizeConfigOptions(data?.origenes_cliente, DEFAULT_LISTAS_DESPLEGABLES.origenes_cliente),
  categorias_gasto: normalizeConfigOptions(data?.categorias_gasto, DEFAULT_LISTAS_DESPLEGABLES.categorias_gasto),
  metodos_pago_gasto: normalizeConfigOptions(data?.metodos_pago_gasto, DEFAULT_LISTAS_DESPLEGABLES.metodos_pago_gasto),
  metodos_pago_venta: normalizeConfigOptions(data?.metodos_pago_venta, DEFAULT_LISTAS_DESPLEGABLES.metodos_pago_venta)
});

const DEFAULT_CONFIGURACION_VENTAS: ConfiguracionVentas = {
  canales: {
    stock: { id: "stock", nombre: "Stock", porcentaje: 150, minimo_piezas: 1, afecta_stock: true, anticipo_porcentaje: 100, precio_visible: true },
    bajo_pedido: { id: "bajo_pedido", nombre: "Bajo pedido", porcentaje: 125, minimo_piezas: 3, afecta_stock: false, anticipo_porcentaje: 50, precio_visible: true },
    paquete_emprendedor: { id: "paquete_emprendedor", nombre: "Paquete emprendedor", porcentaje: 110, minimo_piezas: 10, afecta_stock: true, anticipo_porcentaje: 100, precio_visible: true },
    mayoreo: { id: "mayoreo", nombre: "Mayoreo", porcentaje: null, minimo_piezas: 30, afecta_stock: false, anticipo_porcentaje: 50, precio_visible: false }
  }
};

const normalizeConfiguracionVentas = (data?: Partial<ConfiguracionVentas> | null): ConfiguracionVentas => {
  const canales = { ...DEFAULT_CONFIGURACION_VENTAS.canales };
  (Object.keys(canales) as CanalVentaId[]).forEach((id) => {
    const fallback = canales[id];
    const source = data?.canales?.[id];
    if (!source) return;
    const porcentaje = source.porcentaje === null
      ? null
      : Number.isFinite(Number(source.porcentaje)) && Number(source.porcentaje) >= 0
        ? Number(source.porcentaje)
        : fallback.porcentaje;
    canales[id] = {
      ...fallback,
      porcentaje,
      minimo_piezas: Number.isInteger(Number(source.minimo_piezas)) && Number(source.minimo_piezas) > 0 ? Number(source.minimo_piezas) : fallback.minimo_piezas,
      anticipo_porcentaje: Number.isFinite(Number(source.anticipo_porcentaje)) ? Math.min(100, Math.max(0, Number(source.anticipo_porcentaje))) : fallback.anticipo_porcentaje
    };
  });
  return { canales };
};

// --- SERVICIO DE FIRESTORE / INVENTARIO ---
export const firestoreService = {
  isConfigured: () => isConfigured,
  clearFinanzasCache,
  getPeriodosFinancierosDisponibles,
  clearPeriodosFinancierosCache,
  getPeriodoKey,
  getPeriodContribution,
  applyPeriodIndexDeltas,

  getConfiguracionListasDesplegables: async (): Promise<ConfiguracionListasDesplegables> => {
    if (isConfigured && realDb) {
      const snapshot = await getDoc(doc(realDb, "configuracion", "listas_desplegables"));
      return normalizeListasConfig(snapshot.exists() ? snapshot.data() as Partial<ConfiguracionListasDesplegables> : null);
    }
    return normalizeListasConfig(getLocalStorageItem<Partial<ConfiguracionListasDesplegables> | null>("configuracion_listas", null));
  },

  saveConfiguracionListasDesplegables: async (config: ConfiguracionListasDesplegables): Promise<void> => {
    const normalized = normalizeListasConfig(config);
    if (isConfigured && realDb) {
      await setDoc(doc(realDb, "configuracion", "listas_desplegables"), { ...normalized, actualizado_at: Timestamp.now() }, { merge: true });
      return;
    }
    setLocalStorageItem("configuracion_listas", normalized);
  },

  getConfiguracionVentas: async (): Promise<ConfiguracionVentas> => {
    if (isConfigured && realDb) {
      const snapshot = await getDoc(doc(realDb, "configuracion", "ventas"));
      return normalizeConfiguracionVentas(snapshot.exists() ? snapshot.data() as Partial<ConfiguracionVentas> : null);
    }
    return normalizeConfiguracionVentas(getLocalStorageItem<Partial<ConfiguracionVentas> | null>("configuracion_ventas", null));
  },

  saveConfiguracionVentas: async (config: ConfiguracionVentas): Promise<void> => {
    const normalized = normalizeConfiguracionVentas(config);
    if (isConfigured && realDb) {
      await setDoc(doc(realDb, "configuracion", "ventas"), { ...normalized, actualizado_at: Timestamp.now() }, { merge: true });
      return;
    }
    setLocalStorageItem("configuracion_ventas", normalized);
  },

  // --- DROPS / LOTES COMERCIALES ---
  getDrops: async (): Promise<Drop[]> => {
    if (isConfigured && realDb) {
      const snapshot = await getDocs(query(collection(realDb, "drops"), orderBy("creado_at", "desc")));
      return snapshot.docs
        .map(item => ({ id: item.id, ...item.data() } as Drop))
        .filter(item => item.en_papelera !== true);
    }

    return getLocalStorageItem<Drop[]>("drops", [])
      .filter(item => item.en_papelera !== true)
      .sort((a, b) => {
        const aTime = a.creado_at instanceof Date ? a.creado_at.getTime() : Number((a.creado_at as any)?.seconds || 0) * 1000;
        const bTime = b.creado_at instanceof Date ? b.creado_at.getTime() : Number((b.creado_at as any)?.seconds || 0) * 1000;
        return bTime - aTime;
      });
  },

  addDrop: async (input: { nombre: string; descripcion?: string; estado?: EstadoDrop }): Promise<Drop> => {
    const nombre = (input.nombre || "").trim();
    const descripcion = (input.descripcion || "").trim();
    const estado: EstadoDrop = input.estado || "preparacion";
    if (!nombre) throw new Error("El nombre del drop es obligatorio.");
    if (nombre.length > 100) throw new Error("El nombre del drop no puede exceder 100 caracteres.");
    if (descripcion.length > 500) throw new Error("La descripción no puede exceder 500 caracteres.");
    if (!["preparacion", "en_venta", "cerrado"].includes(estado)) throw new Error("El estado del drop no es válido.");

    const usuarioEmail = authService.getCurrentUser()?.email || "sistema@empresa.com";
    if (isConfigured && realDb) {
      const dropRef = doc(collection(realDb, "drops"));
      const now = Timestamp.now();
      const data = {
        nombre,
        ...(descripcion ? { descripcion } : {}),
        estado,
        creado_por: usuarioEmail,
        creado_at: now,
        actualizado_at: now,
        en_papelera: false
      };
      await setDoc(dropRef, data);
      return { id: dropRef.id, ...data } as Drop;
    }

    const list = getLocalStorageItem<Drop[]>("drops", []);
    const now = new Date();
    const created: Drop = {
      id: `drop_${Math.random().toString(36).slice(2, 11)}`,
      nombre,
      ...(descripcion ? { descripcion } : {}),
      estado,
      creado_por: usuarioEmail,
      creado_at: now,
      actualizado_at: now,
      en_papelera: false
    };
    setLocalStorageItem("drops", [created, ...list]);
    return created;
  },

  updateDrop: async (dropId: string, input: { nombre?: string; descripcion?: string; estado?: EstadoDrop }): Promise<void> => {
    const cleanId = (dropId || "").trim();
    if (!cleanId) throw new Error("Selecciona un drop válido.");
    const updates: Record<string, any> = {};
    if (input.nombre !== undefined) {
      const nombre = input.nombre.trim();
      if (!nombre) throw new Error("El nombre del drop es obligatorio.");
      if (nombre.length > 100) throw new Error("El nombre del drop no puede exceder 100 caracteres.");
      updates.nombre = nombre;
    }
    if (input.descripcion !== undefined) {
      const descripcion = input.descripcion.trim();
      if (descripcion.length > 500) throw new Error("La descripción no puede exceder 500 caracteres.");
      updates.descripcion = descripcion;
    }
    if (input.estado !== undefined) {
      if (!["preparacion", "en_venta", "cerrado"].includes(input.estado)) throw new Error("El estado del drop no es válido.");
      updates.estado = input.estado;
    }

    if (isConfigured && realDb) {
      const dropRef = doc(realDb, "drops", cleanId);
      const snapshot = await getDoc(dropRef);
      if (!snapshot.exists() || snapshot.data().en_papelera === true) throw new Error("El drop ya no está disponible.");
      await setDoc(dropRef, { ...updates, actualizado_at: Timestamp.now() }, { merge: true });
      if (updates.nombre) {
        const linkedSnapshots = await Promise.all([
          getDocs(query(collection(realDb, "compras"), where("drop_id", "==", cleanId))),
          getDocs(query(collection(realDb, "ventas"), where("drop_id", "==", cleanId))),
          getDocs(query(collection(realDb, "movimientos"), where("drop_id", "==", cleanId)))
        ]);
        const linkedRefs = linkedSnapshots.flatMap(linked => linked.docs.map(item => item.ref));
        for (let index = 0; index < linkedRefs.length; index += 400) {
          const batch = writeBatch(realDb);
          linkedRefs.slice(index, index + 400).forEach(ref => batch.set(ref, { drop_nombre: updates.nombre }, { merge: true }));
          await batch.commit();
        }
      }
      return;
    }

    const list = getLocalStorageItem<Drop[]>("drops", []);
    const index = list.findIndex(item => item.id === cleanId && item.en_papelera !== true);
    if (index < 0) throw new Error("El drop ya no está disponible.");
    list[index] = { ...list[index], ...updates, actualizado_at: new Date() };
    setLocalStorageItem("drops", list);
    if (updates.nombre) {
      const compras = getLocalStorageItem<Compra[]>("compras", []).map(item => item.drop_id === cleanId ? { ...item, drop_nombre: updates.nombre } : item);
      const ventas = getLocalStorageItem<Venta[]>("ventas_maestras", []).map(item => item.drop_id === cleanId ? { ...item, drop_nombre: updates.nombre } : item);
      const movements = getLocalStorageItem<Movimiento[]>("movimientos", []).map(item => item.drop_id === cleanId ? { ...item, drop_nombre: updates.nombre } : item);
      setLocalStorageItem("compras", compras);
      setLocalStorageItem("ventas_maestras", ventas);
      setLocalStorageItem("movimientos", movements); notifyListeners("movimientos", movements);
    }
  },

  enviarDropPapelera: async (dropId: string): Promise<void> => {
    const cleanId = (dropId || "").trim();
    if (!cleanId) throw new Error("Selecciona un drop válido.");

    if (isConfigured && realDb) {
      const [dropSnapshot, comprasSnapshot, ventasSnapshot] = await Promise.all([
        getDoc(doc(realDb, "drops", cleanId)),
        getDocs(query(collection(realDb, "compras"), where("drop_id", "==", cleanId))),
        getDocs(query(collection(realDb, "ventas"), where("drop_id", "==", cleanId)))
      ]);
      if (!dropSnapshot.exists() || dropSnapshot.data().en_papelera === true) throw new Error("El drop ya no está disponible.");
      if (!comprasSnapshot.empty || !ventasSnapshot.empty) {
        throw new Error("Este drop todavía tiene compras o ventas asociadas. Reasigna esos registros antes de enviarlo a la Papelera.");
      }
      await setDoc(doc(realDb, "drops", cleanId), {
        en_papelera: true,
        desactivado_at: Timestamp.now(),
        estado_antes_papelera: dropSnapshot.data().estado || "preparacion",
        actualizado_at: Timestamp.now()
      }, { merge: true });
      return;
    }

    const drops = getLocalStorageItem<Drop[]>("drops", []);
    const index = drops.findIndex(item => item.id === cleanId && item.en_papelera !== true);
    if (index < 0) throw new Error("El drop ya no está disponible.");
    const hasLinkedPurchases = getLocalStorageItem<Compra[]>("compras", []).some(item => item.drop_id === cleanId);
    const hasLinkedSales = getLocalStorageItem<Venta[]>("ventas_maestras", []).some(item => item.drop_id === cleanId);
    if (hasLinkedPurchases || hasLinkedSales) throw new Error("Este drop todavía tiene compras o ventas asociadas. Reasigna esos registros antes de enviarlo a la Papelera.");
    const now = new Date();
    drops[index] = { ...drops[index], en_papelera: true, desactivado_at: now, estado_antes_papelera: drops[index].estado, actualizado_at: now };
    setLocalStorageItem("drops", drops);
  },

  restaurarDropPapelera: async (dropId: string): Promise<void> => {
    const cleanId = (dropId || "").trim();
    if (!cleanId) throw new Error("Selecciona un drop válido.");
    if (isConfigured && realDb) {
      const dropRef = doc(realDb, "drops", cleanId);
      const snapshot = await getDoc(dropRef);
      if (!snapshot.exists() || snapshot.data().en_papelera !== true) throw new Error("El drop no está en la Papelera.");
      await setDoc(dropRef, {
        en_papelera: false,
        estado: snapshot.data().estado_antes_papelera || snapshot.data().estado || "preparacion",
        desactivado_at: deleteField(),
        estado_antes_papelera: deleteField(),
        actualizado_at: Timestamp.now()
      }, { merge: true });
      return;
    }
    const drops = getLocalStorageItem<Drop[]>("drops", []);
    const index = drops.findIndex(item => item.id === cleanId && item.en_papelera === true);
    if (index < 0) throw new Error("El drop no está en la Papelera.");
    const restored = { ...drops[index], en_papelera: false, estado: drops[index].estado_antes_papelera || drops[index].estado, actualizado_at: new Date() };
    delete restored.desactivado_at;
    delete restored.estado_antes_papelera;
    drops[index] = restored;
    setLocalStorageItem("drops", drops);
  },

  updateCompraDropAssociation: async (compraId: string, dropId?: string): Promise<void> => {
    const cleanCompraId = (compraId || "").trim();
    const cleanDropId = (dropId || "").trim();
    if (!cleanCompraId) throw new Error("Selecciona una compra válida.");
    if (isConfigured && realDb) {
      const compraRef = doc(realDb, "compras", cleanCompraId);
      const [compraSnapshot, dropSnapshot, movementSnapshot] = await Promise.all([
        getDoc(compraRef),
        cleanDropId ? getDoc(doc(realDb, "drops", cleanDropId)) : Promise.resolve(null),
        getDocs(query(collection(realDb, "movimientos"), where("compra_id", "==", cleanCompraId)))
      ]);
      if (!compraSnapshot.exists() || compraSnapshot.data().en_papelera === true) throw new Error("La compra ya no está disponible.");
      if (cleanDropId && (!dropSnapshot?.exists() || dropSnapshot.data().en_papelera === true)) throw new Error("El drop seleccionado ya no está disponible.");
      const dropName = cleanDropId ? String(dropSnapshot?.data()?.nombre || "").trim() : "";
      const values = cleanDropId ? { drop_id: cleanDropId, drop_nombre: dropName } : { drop_id: deleteField(), drop_nombre: deleteField() };
      const batch = writeBatch(realDb);
      batch.set(compraRef, { ...values, actualizado_at: Timestamp.now() }, { merge: true });
      movementSnapshot.docs.forEach(item => batch.set(item.ref, values, { merge: true }));
      await batch.commit();
      return;
    }
    const compras = getLocalStorageItem<Compra[]>("compras", []);
    const index = compras.findIndex(item => item.id === cleanCompraId && item.en_papelera !== true);
    if (index < 0) throw new Error("La compra ya no está disponible.");
    const drop = cleanDropId ? getLocalStorageItem<Drop[]>("drops", []).find(item => item.id === cleanDropId && item.en_papelera !== true) : undefined;
    if (cleanDropId && !drop) throw new Error("El drop seleccionado ya no está disponible.");
    compras[index] = { ...compras[index], drop_id: cleanDropId || undefined, drop_nombre: drop?.nombre, actualizado_at: new Date() };
    setLocalStorageItem("compras", compras);
    const movements = getLocalStorageItem<Movimiento[]>("movimientos", []).map(item => item.compra_id === cleanCompraId ? { ...item, drop_id: cleanDropId || undefined, drop_nombre: drop?.nombre } : item);
    setLocalStorageItem("movimientos", movements); notifyListeners("movimientos", movements);
  },

  updateVentaDropAssociation: async (ventaId: string, dropId?: string): Promise<void> => {
    const cleanVentaId = (ventaId || "").trim();
    const cleanDropId = (dropId || "").trim();
    if (!cleanVentaId) throw new Error("Selecciona una venta válida.");
    if (isConfigured && realDb) {
      const ventaRef = doc(realDb, "ventas", cleanVentaId);
      const [ventaSnapshot, dropSnapshot, purchaseSnapshot, movementSnapshot] = await Promise.all([
        getDoc(ventaRef),
        cleanDropId ? getDoc(doc(realDb, "drops", cleanDropId)) : Promise.resolve(null),
        cleanDropId ? getDocs(query(collection(realDb, "compras"), where("drop_id", "==", cleanDropId))) : Promise.resolve(null),
        getDocs(query(collection(realDb, "movimientos"), where("venta_id", "==", cleanVentaId)))
      ]);
      if (!ventaSnapshot.exists() || ventaSnapshot.data().en_papelera === true) throw new Error("La venta ya no está disponible.");
      if (cleanDropId && (!dropSnapshot?.exists() || dropSnapshot.data().en_papelera === true)) throw new Error("El drop seleccionado ya no está disponible.");
      if (cleanDropId) {
        const allowedSkus = new Set<string>();
        purchaseSnapshot?.docs.forEach(item => {
          const data = item.data();
          if (data.en_papelera === true || data.estado === "anulada") return;
          (Array.isArray(data.items) ? data.items : []).forEach((purchaseItem: any) => allowedSkus.add(String(purchaseItem.sku || "").trim().toUpperCase()));
        });
        const missing = getMissingDropSkus(
          (Array.isArray(ventaSnapshot.data().items) ? ventaSnapshot.data().items : []).map((item: any) => String(item.sku || "")),
          allowedSkus
        );
        if (missing.length) throw new Error(`No puedes asociar esta venta al drop: ${missing.join(", ")} no pertenece a sus compras activas.`);
      }
      const dropName = cleanDropId ? String(dropSnapshot?.data()?.nombre || "").trim() : "";
      const values = cleanDropId ? { drop_id: cleanDropId, drop_nombre: dropName } : { drop_id: deleteField(), drop_nombre: deleteField() };
      const batch = writeBatch(realDb);
      batch.set(ventaRef, { ...values, actualizado_at: Timestamp.now() }, { merge: true });
      movementSnapshot.docs.forEach(item => batch.set(item.ref, values, { merge: true }));
      await batch.commit();
      return;
    }
    const ventas = getLocalStorageItem<Venta[]>("ventas_maestras", []);
    const index = ventas.findIndex(item => item.id === cleanVentaId && item.en_papelera !== true);
    if (index < 0) throw new Error("La venta ya no está disponible.");
    const drop = cleanDropId ? getLocalStorageItem<Drop[]>("drops", []).find(item => item.id === cleanDropId && item.en_papelera !== true) : undefined;
    if (cleanDropId && !drop) throw new Error("El drop seleccionado ya no está disponible.");
    if (cleanDropId) {
      const allowedSkus = new Set(getLocalStorageItem<Compra[]>("compras", []).filter(item => item.drop_id === cleanDropId && item.en_papelera !== true && item.estado !== "anulada").flatMap(item => item.items.map(purchaseItem => purchaseItem.sku.trim().toUpperCase())));
      const missing = getMissingDropSkus(ventas[index].items.map(item => item.sku), allowedSkus);
      if (missing.length) throw new Error(`No puedes asociar esta venta al drop: ${missing.join(", ")} no pertenece a sus compras activas.`);
    }
    ventas[index] = { ...ventas[index], drop_id: cleanDropId || undefined, drop_nombre: drop?.nombre, actualizado_at: new Date() };
    setLocalStorageItem("ventas_maestras", ventas);
    const movements = getLocalStorageItem<Movimiento[]>("movimientos", []).map(item => item.venta_id === cleanVentaId ? { ...item, drop_id: cleanDropId || undefined, drop_nombre: drop?.nombre } : item);
    setLocalStorageItem("movimientos", movements); notifyListeners("movimientos", movements);
  },

  getDropDetail: async (dropId: string): Promise<{ compras: Compra[]; ventas: Venta[] }> => {
    const cleanId = (dropId || "").trim();
    if (!cleanId) return { compras: [], ventas: [] };
    if (isConfigured && realDb) {
      const [comprasSnapshot, ventasSnapshot] = await Promise.all([
        getDocs(query(collection(realDb, "compras"), where("drop_id", "==", cleanId))),
        getDocs(query(collection(realDb, "ventas"), where("drop_id", "==", cleanId)))
      ]);
      return {
        compras: comprasSnapshot.docs.map(item => ({ id: item.id, ...item.data() } as Compra)),
        ventas: ventasSnapshot.docs.map(item => ({ id: item.id, ...item.data() } as Venta))
      };
    }

    return {
      compras: getLocalStorageItem<Compra[]>("compras", []).filter(item => item.drop_id === cleanId),
      ventas: getLocalStorageItem<Venta[]>("ventas_maestras", []).filter(item => item.drop_id === cleanId)
    };
  },

  // --- ALMACENES ---
  getAlmacenes: async (): Promise<Almacen[]> => {
    if (isConfigured && realDb) {
      const snap = await getDocs(collection(realDb, "almacenes"));
      const list: Almacen[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as Almacen);
      });
      return list.filter(almacen => almacen.en_papelera !== true);
    }
    return getLocalStorageItem<Almacen[]>("almacenes", []).filter(almacen => almacen.en_papelera !== true);
  },

  getAlmacenesRealtime: (onUpdate: (almacenes: Almacen[]) => void, onError?: (error: any) => void): (() => void) => {
    if (isConfigured && realDb) {
      return onSnapshot(
        collection(realDb, "almacenes"),
        (snap) => {
          const list: Almacen[] = [];
          snap.forEach(d => {
            list.push({ id: d.id, ...d.data() } as Almacen);
          });
          onUpdate(list.filter(almacen => almacen.en_papelera !== true));
        },
        (error) => {
          console.error("Error en listener de almacenes:", error);
          onUpdate([]);
          if (onError) onError(error);
        }
      );
    }

    const update = () => {
      const list = getLocalStorageItem<Almacen[]>("almacenes", []);
      onUpdate(list.filter(almacen => almacen.en_papelera !== true));
    };
    update();
    listeners.almacenes.push(update);
    return () => {
      listeners.almacenes = listeners.almacenes.filter(cb => cb !== update);
    };
  },

  addAlmacen: async (almacen: Omit<Almacen, "id">): Promise<string> => {
    const nombre = almacen.nombre.trim();
    const ubicacion = almacen.ubicacion.trim();
    if (!nombre || nombre.length > 100) {
      throw new Error("El nombre del almacén es obligatorio y no puede superar 100 caracteres.");
    }
    if (!ubicacion || ubicacion.length > 500) {
      throw new Error("La ubicación física es obligatoria y no puede superar 500 caracteres.");
    }
    const normalizedWarehouse = { ...almacen, nombre, ubicacion };
    if (isConfigured && realDb) {
      const docRef = await addDoc(collection(realDb, "almacenes"), normalizedWarehouse);
      return docRef.id;
    }
    const list = getLocalStorageItem<Almacen[]>("almacenes", []);
    const newId = "alm_" + Math.random().toString(36).substr(2, 9);
    const newItem: Almacen = { id: newId, ...normalizedWarehouse };
    list.push(newItem);
    setLocalStorageItem("almacenes", list);
    notifyListeners("almacenes", list);
    return newId;
  },

  updateAlmacen: async (id: string, data: Partial<Omit<Almacen, "id">>): Promise<void> => {
    const normalizedData = { ...data };
    if (typeof data.nombre === "string") {
      normalizedData.nombre = data.nombre.trim();
      if (!normalizedData.nombre || normalizedData.nombre.length > 100) {
        throw new Error("El nombre del almacén es obligatorio y no puede superar 100 caracteres.");
      }
    }
    if (typeof data.ubicacion === "string") {
      normalizedData.ubicacion = data.ubicacion.trim();
      if (!normalizedData.ubicacion || normalizedData.ubicacion.length > 500) {
        throw new Error("La ubicación física es obligatoria y no puede superar 500 caracteres.");
      }
    }
    if (isConfigured && realDb) {
      const docRef = doc(realDb, "almacenes", id);
      await setDoc(docRef, normalizedData, { merge: true });
      return;
    }
    const list = getLocalStorageItem<Almacen[]>("almacenes", []);
    const index = list.findIndex(a => a.id === id);
    if (index !== -1) {
      list[index] = { ...list[index], ...normalizedData };
      setLocalStorageItem("almacenes", list);
      notifyListeners("almacenes", list);
    }
  },

  deleteAlmacen: async (id: string): Promise<void> => {
    if (isConfigured && realDb) {
      const warehouseSnap = await getDoc(doc(realDb, "almacenes", id));
      const warehouseName = String(warehouseSnap.data()?.nombre || "").trim();
      const warehouseAliases = [...new Set([id, warehouseName].filter(Boolean))];
      const stockSnaps = await Promise.all(warehouseAliases.map(alias => getDocs(query(
        collection(realDb, "stock"),
        where("almacen_id", "==", alias)
      ))));
      const stockDocs = new Map<string, any>();
      stockSnaps.forEach(snapshot => snapshot.docs.forEach(stockDoc => stockDocs.set(stockDoc.id, stockDoc)));
      const totalStock = [...stockDocs.values()].reduce(
        (total, stockDoc) => total + Math.max(0, Number(stockDoc.data()?.cantidad) || 0),
        0
      );
      if (totalStock > 0) {
        throw new Error(
          `No se puede enviar este almacén a la papelera porque todavía contiene ${totalStock} unidades. Transfiere o corrige sus existencias primero.`
        );
      }
      await setDoc(doc(realDb, "almacenes", id), {
        activo: false,
        en_papelera: true,
        desactivado_at: Timestamp.now()
      }, { merge: true });
      return;
    }
    const list = getLocalStorageItem<Almacen[]>("almacenes", []);
    const warehouseName = list.find(warehouse => warehouse.id === id)?.nombre?.trim() || "";
    const warehouseAliases = new Set([id, warehouseName].filter(Boolean));
    const stockMap = getLocalStorageItem<Record<string, StockItem>>("stock", {});
    const totalStock = Object.values(stockMap).reduce(
      (total, item) => warehouseAliases.has(item.almacen_id)
        ? total + Math.max(0, Number(item.cantidad) || 0)
        : total,
      0
    );
    if (totalStock > 0) {
      throw new Error(
        `No se puede enviar este almacén a la papelera porque todavía contiene ${totalStock} unidades. Transfiere o corrige sus existencias primero.`
      );
    }
    const index = list.findIndex(a => a.id === id);
    if (index !== -1) list[index] = { ...list[index], activo: false, en_papelera: true, desactivado_at: new Date() };
    setLocalStorageItem("almacenes", list);
    notifyListeners("almacenes", list);
  },

  normalizeWarehouseId: (rawId: string, almacenesList: Almacen[] = []): string => {
    if (!rawId) return "";
    const clean = rawId.trim();
    const exact = almacenesList.find(a => a.id === clean);
    if (exact) return exact.id;
    const matchName = almacenesList.find(a => a.nombre.toLowerCase().trim() === clean.toLowerCase().trim());
    if (matchName) return matchName.id;
    return clean;
  },

  // --- CLIENTES ---
  getClientes: async (): Promise<Cliente[]> => {
    if (isConfigured && realDb) {
      try {
        const snap = await getDocs(collection(realDb, "clientes"));
        const list: Cliente[] = [];
        snap.forEach(d => {
          const data = d.data();
          list.push({
            id: d.id,
            nombre_completo: data.nombre_completo || "",
            nombre_normalizado: data.nombre_normalizado || (data.nombre_completo || "").trim().toLowerCase().replace(/\s+/g, " "),
            tipo_cliente: data.tipo_cliente || "minorista",
            instagram: data.instagram || "",
            instagram_normalizado: data.instagram_normalizado || (data.instagram ? data.instagram.trim().toLowerCase().replace(/^@+/, "") : ""),
            telefono: data.telefono !== undefined && data.telefono !== null ? String(data.telefono) : "",
            email: data.email || "",
            ciudad: data.ciudad || "",
            canal_preferido: data.canal_preferido || "WhatsApp",
            intereses: data.intereses || "",
            marcas_favoritas_ids: normalizeMarcasFavoritasIds(data.marcas_favoritas_ids),
            origen: data.origen || "Instagram",
            notas: data.notas || "",
            proximo_seguimiento: data.proximo_seguimiento ? (data.proximo_seguimiento.toDate ? data.proximo_seguimiento.toDate() : data.proximo_seguimiento) : null,
            estado: data.estado || "activo",
            en_papelera: data.en_papelera === true,
            desactivado_at: data.desactivado_at ? (data.desactivado_at.toDate ? data.desactivado_at.toDate() : data.desactivado_at) : undefined,
            creado_at: data.creado_at ? (data.creado_at.toDate ? data.creado_at.toDate() : data.creado_at) : new Date(),
            actualizado_at: data.actualizado_at ? (data.actualizado_at.toDate ? data.actualizado_at.toDate() : data.actualizado_at) : new Date(),
            creado_por: data.creado_por || "sistema"
          });
        });
        list.sort((a, b) => {
          const tA = a.creado_at instanceof Date ? a.creado_at.getTime() : (a.creado_at as any)?.seconds ? (a.creado_at as any).seconds * 1000 : 0;
          const tB = b.creado_at instanceof Date ? b.creado_at.getTime() : (b.creado_at as any)?.seconds ? (b.creado_at as any).seconds * 1000 : 0;
          return tB - tA;
        });
        setLocalStorageItem("clientes", list);
        return list.filter(cliente => cliente.en_papelera !== true);
      } catch (err: any) {
        throw new Error(err?.message || "No se pudieron consultar los clientes en Firestore.");
      }
    }
    return getLocalClientes().filter(cliente => cliente.en_papelera !== true);
  },

  getClientesRealtime: (onUpdate: (clientes: Cliente[]) => void, onError?: (error: any) => void): (() => void) => {
    if (isConfigured && realDb) {
      let isUnsubscribed = false;
      let unsubscribeSnapshot: () => void = () => {};

      try {
        unsubscribeSnapshot = onSnapshot(
          collection(realDb, "clientes"),
          (snap) => {
            if (isUnsubscribed) return;
            const list: Cliente[] = [];
            snap.forEach(d => {
              const data = d.data();
              list.push({
                id: d.id,
                nombre_completo: data.nombre_completo || "",
                nombre_normalizado: data.nombre_normalizado || (data.nombre_completo || "").trim().toLowerCase().replace(/\s+/g, " "),
                tipo_cliente: data.tipo_cliente || "minorista",
                instagram: data.instagram || "",
                instagram_normalizado: data.instagram_normalizado || (data.instagram ? data.instagram.trim().toLowerCase().replace(/^@+/, "") : ""),
                telefono: data.telefono !== undefined && data.telefono !== null ? String(data.telefono) : "",
                email: data.email || "",
                ciudad: data.ciudad || "",
                canal_preferido: data.canal_preferido || "WhatsApp",
                intereses: data.intereses || "",
                marcas_favoritas_ids: normalizeMarcasFavoritasIds(data.marcas_favoritas_ids),
                origen: data.origen || "Instagram",
                notas: data.notas || "",
                proximo_seguimiento: data.proximo_seguimiento ? (data.proximo_seguimiento.toDate ? data.proximo_seguimiento.toDate() : data.proximo_seguimiento) : null,
                estado: data.estado || "activo",
                en_papelera: data.en_papelera === true,
                desactivado_at: data.desactivado_at ? (data.desactivado_at.toDate ? data.desactivado_at.toDate() : data.desactivado_at) : undefined,
                creado_at: data.creado_at ? (data.creado_at.toDate ? data.creado_at.toDate() : data.creado_at) : new Date(),
                actualizado_at: data.actualizado_at ? (data.actualizado_at.toDate ? data.actualizado_at.toDate() : data.actualizado_at) : new Date(),
                creado_por: data.creado_por || "sistema"
              });
            });
            list.sort((a, b) => {
              const tA = a.creado_at instanceof Date ? a.creado_at.getTime() : (a.creado_at as any)?.seconds ? (a.creado_at as any).seconds * 1000 : 0;
              const tB = b.creado_at instanceof Date ? b.creado_at.getTime() : (b.creado_at as any)?.seconds ? (b.creado_at as any).seconds * 1000 : 0;
              return tB - tA;
            });
            setLocalStorageItem("clientes", list);
            onUpdate(list.filter(cliente => cliente.en_papelera !== true));
          },
          (error: any) => {
            if (isUnsubscribed) return;
            if (onError) onError(error);
          }
        );
      } catch (err) {
        if (onError) onError(err);
      }

      return () => {
        isUnsubscribed = true;
        try {
          unsubscribeSnapshot();
        } catch {
          // ignore
        }
      };
    }

    const update = () => {
      const list = getLocalClientes();
      onUpdate(list.filter(cliente => cliente.en_papelera !== true));
    };
    update();
    listeners.clientes.push(update);
    return () => {
      listeners.clientes = listeners.clientes.filter(cb => cb !== update);
    };
  },

  addCliente: async (clienteData: {
    nombre_completo: string;
    tipo_cliente: TipoCliente;
    instagram?: string;
    telefono?: string;
    email?: string;
    ciudad?: string;
    canal_preferido?: CanalPreferido | string;
    intereses?: string;
    marcas_favoritas_ids?: string[];
    origen?: OrigenCliente | string;
    notas?: string;
    proximo_seguimiento?: Date | string | null;
    estado?: EstadoCliente;
  }): Promise<Cliente> => {
    const user = authService.getCurrentUser();
    const cleanNombre = (clienteData.nombre_completo || "").trim();
    if (!cleanNombre) {
      throw new Error("El nombre completo del cliente es obligatorio.");
    }
    if (!clienteData.tipo_cliente || !clienteData.tipo_cliente.trim()) {
      throw new Error("El tipo de cliente es obligatorio.");
    }

    const nombre_normalizado = cleanNombre.toLowerCase().replace(/\s+/g, " ");
    const rawIg = (clienteData.instagram || "").trim();
    const instagram_normalizado = rawIg ? rawIg.toLowerCase().replace(/^@+/, "") : "";
    const cleanTel = clienteData.telefono !== undefined && clienteData.telefono !== null && String(clienteData.telefono).trim() !== ""
      ? String(clienteData.telefono).trim()
      : "";

    const estado: EstadoCliente = clienteData.estado || "activo";
    const userEmail = user?.email || "sistema@antiorder.com";
    const marcasFavoritasIds = normalizeMarcasFavoritasIds(clienteData.marcas_favoritas_ids);

    if (isConfigured && realDb) {
      try {
        const docRef = doc(collection(realDb, "clientes"));
        const newClienteData: any = {
          nombre_completo: cleanNombre,
          nombre_normalizado,
          tipo_cliente: clienteData.tipo_cliente,
          instagram: rawIg,
          instagram_normalizado,
          telefono: cleanTel,
          email: (clienteData.email || "").trim(),
          ciudad: (clienteData.ciudad || "").trim(),
          canal_preferido: clienteData.canal_preferido || "WhatsApp",
          intereses: (clienteData.intereses || "").trim(),
          marcas_favoritas_ids: marcasFavoritasIds,
          origen: clienteData.origen || "Instagram",
          notas: (clienteData.notas || "").trim(),
          estado,
          creado_at: Timestamp.now(),
          actualizado_at: Timestamp.now(),
          creado_por: userEmail
        };

        if (clienteData.proximo_seguimiento) {
          newClienteData.proximo_seguimiento = clienteData.proximo_seguimiento instanceof Date 
            ? Timestamp.fromDate(clienteData.proximo_seguimiento)
            : clienteData.proximo_seguimiento;
        } else {
          newClienteData.proximo_seguimiento = null;
        }

        await setDoc(docRef, newClienteData);

        const createdItem: Cliente = {
          id: docRef.id,
          ...newClienteData,
          creado_at: new Date(),
          actualizado_at: new Date()
        };

        const list = getLocalClientes();
        list.unshift(createdItem);
        setLocalStorageItem("clientes", list);
        notifyListeners("clientes", list);

        return createdItem;
      } catch (err: any) {
        throw err;
      }
    }

    const list = getLocalClientes();
    const newId = "cli_" + Math.random().toString(36).substr(2, 9);
    const newLocal: Cliente = {
      id: newId,
      nombre_completo: cleanNombre,
      nombre_normalizado,
      tipo_cliente: clienteData.tipo_cliente,
      instagram: rawIg,
      instagram_normalizado,
      telefono: cleanTel,
      email: (clienteData.email || "").trim(),
      ciudad: (clienteData.ciudad || "").trim(),
      canal_preferido: clienteData.canal_preferido || "WhatsApp",
      intereses: (clienteData.intereses || "").trim(),
      marcas_favoritas_ids: marcasFavoritasIds,
      origen: clienteData.origen || "Instagram",
      notas: (clienteData.notas || "").trim(),
      proximo_seguimiento: clienteData.proximo_seguimiento || null,
      estado,
      creado_at: new Date(),
      actualizado_at: new Date(),
      creado_por: userEmail
    };
    list.unshift(newLocal);
    setLocalStorageItem("clientes", list);
    notifyListeners("clientes", list);
    return newLocal;
  },

  updateCliente: async (id: string, updates: Partial<Cliente>): Promise<void> => {
    if (!id) throw new Error("ID de cliente no proporcionado.");
    
    const patch: any = {
      actualizado_at: isConfigured && realDb ? Timestamp.now() : new Date()
    };

    if (updates.nombre_completo !== undefined) {
      const clean = updates.nombre_completo.trim();
      if (!clean) throw new Error("El nombre completo no puede estar vacío.");
      patch.nombre_completo = clean;
      patch.nombre_normalizado = clean.toLowerCase().replace(/\s+/g, " ");
    }
    if (updates.tipo_cliente !== undefined) {
      if (!updates.tipo_cliente.trim()) {
        throw new Error("Tipo de cliente no válido.");
      }
      patch.tipo_cliente = updates.tipo_cliente;
    }
    if (updates.instagram !== undefined) {
      const rawIg = (updates.instagram || "").trim();
      patch.instagram = rawIg;
      patch.instagram_normalizado = rawIg ? rawIg.toLowerCase().replace(/^@+/, "") : "";
    }
    if (updates.telefono !== undefined) {
      patch.telefono = updates.telefono !== null && updates.telefono !== undefined ? String(updates.telefono).trim() : "";
    }
    if (updates.email !== undefined) patch.email = (updates.email || "").trim();
    if (updates.ciudad !== undefined) patch.ciudad = (updates.ciudad || "").trim();
    if (updates.canal_preferido !== undefined) patch.canal_preferido = updates.canal_preferido;
    if (updates.intereses !== undefined) patch.intereses = (updates.intereses || "").trim();
    if (updates.marcas_favoritas_ids !== undefined) {
      patch.marcas_favoritas_ids = normalizeMarcasFavoritasIds(updates.marcas_favoritas_ids);
    }
    if (updates.origen !== undefined) patch.origen = updates.origen;
    if (updates.notas !== undefined) patch.notas = (updates.notas || "").trim();
    if (updates.proximo_seguimiento !== undefined) {
      if (updates.proximo_seguimiento instanceof Date && isConfigured && realDb) {
        patch.proximo_seguimiento = Timestamp.fromDate(updates.proximo_seguimiento);
      } else {
        patch.proximo_seguimiento = updates.proximo_seguimiento;
      }
    }
    if (updates.estado !== undefined) {
      patch.estado = updates.estado;
    }

    if (isConfigured && realDb) {
      try {
        const docRef = doc(realDb, "clientes", id);
        await setDoc(docRef, patch, { merge: true });

        const list = getLocalClientes();
        const idx = list.findIndex(c => c.id === id);
        if (idx !== -1) {
          list[idx] = { ...list[idx], ...updates, actualizado_at: new Date() };
          setLocalStorageItem("clientes", list);
          notifyListeners("clientes", list);
        }
        return;
      } catch (err: any) {
        throw err;
      }
    }

    const list = getLocalClientes();
    const idx = list.findIndex(c => c.id === id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...patch };
      setLocalStorageItem("clientes", list);
      notifyListeners("clientes", list);
    }
  },

  toggleClienteEstado: async (id: string, nuevoEstado: EstadoCliente): Promise<void> => {
    await firestoreService.updateCliente(id, { estado: nuevoEstado });
  },

  enviarClientePapelera: async (id: string): Promise<void> => {
    if (!id) throw new Error("ID de cliente no proporcionado.");
    const now = isConfigured && realDb ? Timestamp.now() : new Date();
    if (isConfigured && realDb) {
      await setDoc(doc(realDb, "clientes", id), {
        estado: "inactivo",
        en_papelera: true,
        desactivado_at: now,
        actualizado_at: now
      }, { merge: true });
    } else {
      const list = getLocalClientes();
      const index = list.findIndex(cliente => cliente.id === id);
      if (index === -1) throw new Error("El cliente no existe.");
      list[index] = { ...list[index], estado: "inactivo", en_papelera: true, desactivado_at: now, actualizado_at: now };
      setLocalStorageItem("clientes", list);
      notifyListeners("clientes", list);
    }
  },

  restaurarClientePapelera: async (id: string): Promise<void> => {
    if (!id) throw new Error("ID de cliente no proporcionado.");
    if (isConfigured && realDb) {
      await setDoc(doc(realDb, "clientes", id), {
        estado: "activo",
        en_papelera: false,
        desactivado_at: deleteField(),
        actualizado_at: Timestamp.now()
      }, { merge: true });
    } else {
      const list = getLocalClientes();
      const index = list.findIndex(cliente => cliente.id === id);
      if (index === -1) throw new Error("El cliente no existe.");
      const restored = { ...list[index], estado: "activo" as EstadoCliente, en_papelera: false, actualizado_at: new Date() };
      delete restored.desactivado_at;
      list[index] = restored;
      setLocalStorageItem("clientes", list);
      notifyListeners("clientes", list);
    }
  },

  // --- PRODUCTOS ---
  getProductos: async (): Promise<Producto[]> => {
    if (isConfigured && realDb) {
      const snap = await getDocs(collection(realDb, "productos"));
      const list: Producto[] = [];
      snap.forEach(d => {
        list.push({ sku: d.id, ...d.data() } as Producto);
      });
      return list.filter(producto => producto.en_papelera !== true).map(rebrandLegacyProduct);
    }
    return getLocalStorageItem<Producto[]>("productos", []).filter(producto => producto.en_papelera !== true).map(rebrandLegacyProduct);
  },

  getProductosRealtime: (onUpdate: (productos: Producto[]) => void, onError?: (error: any) => void): (() => void) => {
    if (isConfigured && realDb) {
      return onSnapshot(
        collection(realDb, "productos"),
        (snap) => {
          const list: Producto[] = [];
          snap.forEach(d => {
            list.push({ sku: d.id, ...d.data() } as Producto);
          });
          onUpdate(list.filter(producto => producto.en_papelera !== true).map(rebrandLegacyProduct));
        },
        (error) => {
          console.error("Error en listener de productos:", error);
          onUpdate([]);
          if (onError) onError(error);
        }
      );
    }

    const update = () => {
      const list = getLocalStorageItem<Producto[]>("productos", []);
      onUpdate(list.filter(producto => producto.en_papelera !== true).map(rebrandLegacyProduct));
    };
    update();
    listeners.productos.push(update);
    return () => {
      listeners.productos = listeners.productos.filter(cb => cb !== update);
    };
  },

  checkSkuExists: async (sku: string): Promise<boolean> => {
    const cleanSku = sku.trim().toUpperCase();
    if (!cleanSku) return false;
    if (isConfigured && realDb) {
      const docRef = doc(realDb, "productos", cleanSku);
      const docSnap = await getDoc(docRef);
      return docSnap.exists();
    }
    const list = getLocalStorageItem<Producto[]>("productos", []);
    return list.some(p => p.sku?.trim().toUpperCase() === cleanSku);
  },

  addProduct: async (producto: Producto): Promise<void> => {
    return firestoreService.addProductsBatch([producto]);
  },

  addProductsBatch: async (productosList: Producto[]): Promise<void> => {
    if (!productosList || productosList.length === 0) {
      throw new Error("No hay productos o variantes para guardar.");
    }

    // 1. Normalización y validaciones previas de la lista
    const seenSkus = new Set<string>();
    const seenCombos = new Set<string>();

    const normalizedList: Producto[] = productosList.map((p, idx) => {
      const cleanSku = (p.sku || "").trim().toUpperCase();
      if (!cleanSku) {
        throw new Error(`La variante #${idx + 1} no tiene un SKU válido.`);
      }
      if (cleanSku.length > 128) {
        throw new Error(`El SKU de la variante #${idx + 1} no puede superar 128 caracteres.`);
      }
      if (seenSkus.has(cleanSku)) {
        throw new Error(`El SKU "${cleanSku}" está repetido dentro de las variantes a registrar.`);
      }
      seenSkus.add(cleanSku);

      const cleanName = (p.nombre || "").trim();
      if (!cleanName) {
        throw new Error(`La variante #${idx + 1} no tiene un nombre de producto válido.`);
      }
      if (cleanName.length > 120) {
        throw new Error("El nombre del producto no puede superar 120 caracteres.");
      }
      const baseName = cleanName.toLowerCase();
      const color = (p.color || "sin-color").trim().toLowerCase();
      const talla = (p.talla || "sin-talla").trim().toLowerCase();
      const comboKey = `${baseName}|${color}|${talla}`;
      if (seenCombos.has(comboKey)) {
        throw new Error(`Existe una variante repetida con la misma combinación: Color "${p.color || 'Sin color'}" y Talla "${p.talla || 'Sin talla'}".`);
      }
      seenCombos.add(comboKey);

      return {
        ...p,
        sku: cleanSku,
        nombre: cleanName,
        marca: (p.marca || "").trim() || undefined,
        categoria: (p.categoria || "General").trim(),
        color: (p.color || "").trim() || undefined,
        talla: (p.talla || "").trim() || undefined,
        tipo_talla: p.tipo_talla || "ropa",
        codigo_barras: (p.codigo_barras || "").trim() || undefined,
        precio_venta_sugerido: p.precio_venta_sugerido !== undefined ? Math.max(0, Number(p.precio_venta_sugerido) || 0) : undefined,
        stock_minimo: Math.max(0, Number(p.stock_minimo) || 0),
        unidad: (p.unidad || "pieza").trim(),
        activo: p.activo !== false,
        creado_at: new Date()
      };
    });

    // 2. Validación atómica contra base de datos
    if (isConfigured && realDb) {
      // Validar que ningún SKU exista previamente
      for (const item of normalizedList) {
        const docRef = doc(realDb, "productos", item.sku);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          throw new Error(`El SKU "${item.sku}" ya existe en el catálogo.`);
        }
      }

      // Validar combinaciones repetidas con productos existentes del mismo producto base
      const existingProds = await firestoreService.getProductos();
      for (const item of normalizedList) {
        const duplicate = existingProds.find(ep => {
          const sameBase = (item.producto_base_id && ep.producto_base_id === item.producto_base_id) ||
                           (ep.nombre.toLowerCase().trim() === item.nombre.toLowerCase().trim());
          if (!sameBase) return false;
          const epColor = (ep.color || "").trim().toLowerCase();
          const itemColor = (item.color || "").trim().toLowerCase();
          const epTalla = (ep.talla || "").trim().toLowerCase();
          const itemTalla = (item.talla || "").trim().toLowerCase();
          return epColor === itemColor && epTalla === itemTalla;
        });
        if (duplicate) {
          throw new Error(`Ya existe en el catálogo una variante para "${item.nombre}" con Color "${item.color || 'Sin color'}" y Talla "${item.talla || 'Sin talla'}" (SKU existente: ${duplicate.sku}).`);
        }
      }

      // Escritura en batch atómico
      const batch = writeBatch(realDb);
      for (const item of normalizedList) {
        const docRef = doc(realDb, "productos", item.sku);
        batch.set(docRef, {
          producto_base_id: item.producto_base_id || item.sku,
          nombre: item.nombre,
          ...(item.marca ? { marca: item.marca } : {}),
          categoria: item.categoria,
          ...(item.color ? { color: item.color } : {}),
          ...(item.talla ? { talla: item.talla } : {}),
          ...(item.tipo_talla ? { tipo_talla: item.tipo_talla } : {}),
          ...(item.codigo_barras ? { codigo_barras: item.codigo_barras } : {}),
          ...(item.precio_venta_sugerido !== undefined ? { precio_venta_sugerido: item.precio_venta_sugerido } : {}),
          stock_minimo: item.stock_minimo,
          ...(item.stock_minimo_almacenes ? { stock_minimo_almacenes: item.stock_minimo_almacenes } : {}),
          unidad: item.unidad,
          activo: item.activo !== false,
          creado_at: Timestamp.now()
        });
      }

      await batch.commit();
      return;
    }

    // Modo emulador LocalStorage atómico
    const list = getLocalStorageItem<Producto[]>("productos", []);
    for (const item of normalizedList) {
      if (list.some(p => p.sku === item.sku)) {
        throw new Error(`El SKU "${item.sku}" ya existe en el catálogo.`);
      }
      const duplicate = list.find(ep => {
        const sameBase = (item.producto_base_id && ep.producto_base_id === item.producto_base_id) ||
                         (ep.nombre.toLowerCase().trim() === item.nombre.toLowerCase().trim());
        if (!sameBase) return false;
        const epColor = (ep.color || "").trim().toLowerCase();
        const itemColor = (item.color || "").trim().toLowerCase();
        const epTalla = (ep.talla || "").trim().toLowerCase();
        const itemTalla = (item.talla || "").trim().toLowerCase();
        return epColor === itemColor && epTalla === itemTalla;
      });
      if (duplicate) {
        throw new Error(`Ya existe en el catálogo una variante para "${item.nombre}" con Color "${item.color || 'Sin color'}" y Talla "${item.talla || 'Sin talla'}" (SKU existente: ${duplicate.sku}).`);
      }
    }

    const updatedList = [...list, ...normalizedList];
    setLocalStorageItem("productos", updatedList);
    notifyListeners("productos", updatedList);
  },

  updateProduct: async (sku: string, data: Partial<Omit<Producto, "sku">>): Promise<void> => {
    const cleanSku = sku.trim().toUpperCase();
    if (!cleanSku || cleanSku.length > 128) {
      throw new Error("El SKU es obligatorio y no puede superar 128 caracteres.");
    }
    const normalizedData = { ...data };
    if (data.nombre !== undefined) {
      const cleanName = data.nombre.trim();
      if (!cleanName || cleanName.length > 120) {
        throw new Error("El nombre del producto es obligatorio y no puede superar 120 caracteres.");
      }
      normalizedData.nombre = cleanName;
    }
    if (isConfigured && realDb) {
      const docRef = doc(realDb, "productos", cleanSku);
      await setDoc(docRef, {
        ...normalizedData,
        actualizado_at: Timestamp.now()
      }, { merge: true });
      return;
    }
    const list = getLocalStorageItem<Producto[]>("productos", []);
    const index = list.findIndex(p => p.sku === cleanSku);
    if (index !== -1) {
      list[index] = { ...list[index], ...normalizedData, actualizado_at: new Date() };
      setLocalStorageItem("productos", list);
      notifyListeners("productos", list);
    }
  },

  updateProducto: async (sku: string, data: Partial<Omit<Producto, "sku">>): Promise<void> => {
    return firestoreService.updateProduct(sku, data);
  },

  addProducto: async (producto: Producto): Promise<void> => {
    return firestoreService.addProduct(producto);
  },

  toggleProductoStatus: async (sku: string, currentActive: boolean): Promise<void> => {
    return firestoreService.updateProduct(sku, { activo: !currentActive });
  },

  deleteProducts: async (skus: string[]): Promise<void> => {
    const cleanSkus = [...new Set(
      skus.map(sku => sku.trim().toUpperCase()).filter(Boolean)
    )];
    if (cleanSkus.length === 0) return;

    if (isConfigured && realDb) {
      const stockSnaps = await Promise.all(cleanSkus.map(sku => getDocs(query(
        collection(realDb, "stock"),
        where("sku", "==", sku)
      ))));
      const productsWithStock = cleanSkus.flatMap((sku, index) => {
        const units = stockSnaps[index].docs.reduce(
          (total, stockDoc) => total + Math.max(0, Number(stockDoc.data()?.cantidad) || 0),
          0
        );
        return units > 0 ? [{ sku, units }] : [];
      });
      if (productsWithStock.length > 0) {
        const detail = productsWithStock
          .map(item => `${item.sku} (${item.units} uds)`)
          .join(", ");
        throw new Error(
          `No se puede enviar a la papelera porque aún hay existencias: ${detail}. Vende, transfiere o corrige ese stock primero.`
        );
      }

      const batch = writeBatch(realDb);
      const disabledAt = Timestamp.now();
      cleanSkus.forEach(sku => {
        batch.set(doc(realDb, "productos", sku), {
          activo: false,
          en_papelera: true,
          desactivado_at: disabledAt
        }, { merge: true });
      });
      await batch.commit();
      return;
    }

    const stockMap = getLocalStorageItem<Record<string, StockItem>>("stock", {});
    const productsWithStock = cleanSkus.flatMap(sku => {
      const units = Object.values(stockMap).reduce(
        (total, item) => item.sku?.trim().toUpperCase() === sku
          ? total + Math.max(0, Number(item.cantidad) || 0)
          : total,
        0
      );
      return units > 0 ? [{ sku, units }] : [];
    });
    if (productsWithStock.length > 0) {
      const detail = productsWithStock
        .map(item => `${item.sku} (${item.units} uds)`)
        .join(", ");
      throw new Error(
        `No se puede enviar a la papelera porque aún hay existencias: ${detail}. Vende, transfiere o corrige ese stock primero.`
      );
    }

    const list = getLocalStorageItem<Producto[]>("productos", []);
    const disabledAt = new Date();
    cleanSkus.forEach(sku => {
      const index = list.findIndex(p => p.sku.trim().toUpperCase() === sku);
      if (index !== -1) {
        list[index] = { ...list[index], activo: false, en_papelera: true, desactivado_at: disabledAt };
      }
    });
    setLocalStorageItem("productos", list);
    notifyListeners("productos", list);
  },

  deleteProduct: async (sku: string): Promise<void> => {
    return firestoreService.deleteProducts([sku]);
  },

  deleteProducto: async (sku: string): Promise<void> => {
    return firestoreService.deleteProduct(sku);
  },

  registrarMovimiento: async (mov: Omit<Movimiento, "fecha" | "usuario">): Promise<{ id: string; folio: string }> => {
    return firestoreService.registerMovimientoTransaction(mov);
  },

  registerVentaTransaction: async (
    venta: VentaRegistroInput
  ): Promise<{ id: string; folio: string; movimientosCount: number }> => {
    const user = authService.getCurrentUser();
    const usuarioEmail = user ? user.email : "sistema@empresa.com";

    if (!Array.isArray(venta.items) || venta.items.length === 0) {
      throw new Error("Agrega al menos un producto a la venta.");
    }
    if (venta.items.length > 50) {
      throw new Error("Una venta puede contener como máximo 50 partidas.");
    }

    const afectaStock = venta.afecta_stock !== false;
    const normalizedItems = venta.items.map((item, index) => {
      const sku = (item.sku || "").trim().toUpperCase();
      const almacenId = (item.almacen_id || "").trim() || (!afectaStock ? "bajo_pedido" : "");
      const cantidad = Number(item.cantidad);
      const precioUnitario = Number(item.precio_unitario_venta);
      const costoUnitario = Number(item.costo_unitario_venta);

      if (!sku) throw new Error(`Selecciona el producto de la partida ${index + 1}.`);
      if (!almacenId) throw new Error(`Selecciona el almacén de la partida ${index + 1}.`);
      if (!Number.isInteger(cantidad) || cantidad <= 0) {
        throw new Error(`La cantidad de la partida ${index + 1} debe ser un entero mayor a cero.`);
      }
      if (!Number.isFinite(precioUnitario) || precioUnitario < 0) {
        throw new Error(`El precio de la partida ${index + 1} debe ser mayor o igual a cero.`);
      }
      if (!Number.isFinite(costoUnitario) || costoUnitario < 0) {
        throw new Error(`El costo de la partida ${index + 1} debe ser mayor o igual a cero.`);
      }

      return {
        sku,
        almacen_id: almacenId,
        cantidad,
        precio_unitario_venta: Math.round((precioUnitario + Number.EPSILON) * 100) / 100,
        costo_unitario_venta: Math.round((costoUnitario + Number.EPSILON) * 100) / 100,
        total_venta: Math.round((precioUnitario * cantidad + Number.EPSILON) * 100) / 100,
        costo_total: Math.round((costoUnitario * cantidad + Number.EPSILON) * 100) / 100
      };
    });

    const stockKeys = normalizedItems.map(item => `${item.sku}_${item.almacen_id}`);
    if (new Set(stockKeys).size !== stockKeys.length) {
      throw new Error("El mismo producto y almacén aparece más de una vez. Unifica su cantidad en una sola partida.");
    }

    const totalUnidadesVenta = normalizedItems.reduce((sum, item) => sum + item.cantidad, 0);
    const minimoPiezas = Math.max(1, Math.floor(Number(venta.minimo_piezas) || 1));
    if (totalUnidadesVenta < minimoPiezas) {
      throw new Error(`${venta.canal_venta_nombre} requiere un mínimo de ${minimoPiezas} piezas.`);
    }
    const anticipoPorcentaje = Math.min(100, Math.max(0, Number(venta.anticipo_porcentaje) || 0));
    const porcentajePrecio = Number(venta.porcentaje_precio);
    if (!Number.isFinite(porcentajePrecio) || porcentajePrecio < 0) {
      throw new Error("El porcentaje aplicado al precio no es válido.");
    }

    const normalizeOptionalAmount = (value: number | undefined, label: string): number => {
      if (value === undefined) return 0;
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error(`${label} debe ser un número mayor o igual a cero.`);
      }
      return Math.round((amount + Number.EPSILON) * 100) / 100;
    };

    const envioCobrado = normalizeOptionalAmount(venta.envio_cobrado_cliente, "El envío cobrado");
    const otrosCargos = normalizeOptionalAmount(venta.otros_cargos_cliente, "Los otros cargos");
    const costoEnvio = normalizeOptionalAmount(venta.costo_envio_venta, "El costo de envío");
    const otrosCostos = normalizeOptionalAmount(venta.otros_costos_venta, "Los otros costos");
    const calculated = calculateSaleTotals({
      items: normalizedItems,
      envio_cobrado_cliente: envioCobrado,
      otros_cargos_cliente: otrosCargos,
      costo_envio_venta: costoEnvio,
      otros_costos_venta: otrosCostos,
      anticipo_porcentaje: anticipoPorcentaje
    });
    const ventaSubtotal = calculated.subtotal;
    const ventaTotalCobrado = calculated.total;
    const ventaTotalRecibido = calculated.recibido;
    const ventaSaldoPendiente = calculated.saldo;
    const estadoPago = calculated.estadoPago;
    const ventaTotalCostos = calculated.costosAdicionales;
    const costoMercancia = calculated.costoMercancia;
    const metodoPagoInicial = (venta.metodo_pago_inicial || "").trim();
    if (ventaTotalRecibido > 0 && !metodoPagoInicial) {
      throw new Error("Selecciona el método de pago del importe recibido.");
    }
    const now = new Date();
    const todayStr = getLocalDateString(now);
    const periodoKey = getPeriodoKey(now);
    const dropId = (venta.drop_id || "").trim();

    if (isConfigured && realDb) {
      if (dropId) {
        const purchaseSnapshot = await getDocs(query(collection(realDb, "compras"), where("drop_id", "==", dropId)));
        const allowedSkus = new Set<string>();
        purchaseSnapshot.docs.forEach(item => {
          const data = item.data();
          if (data.en_papelera === true || data.estado === "anulada") return;
          (Array.isArray(data.items) ? data.items : []).forEach((purchaseItem: any) => {
            const sku = String(purchaseItem.sku || "").trim().toUpperCase();
            if (sku) allowedSkus.add(sku);
          });
        });
        const missingSkus = getMissingDropSkus(normalizedItems.map(item => item.sku), allowedSkus);
        if (missingSkus.length) {
          throw new Error(`No puedes registrar esta venta en el drop seleccionado: ${[...new Set(missingSkus)].join(", ")} no pertenece a sus compras activas.`);
        }
      }
      const counterRef = doc(realDb, "contadores", "salida");
      const ventaRef = doc(collection(realDb, "ventas"));
      const ventaId = ventaRef.id;
      const movementRefs = normalizedItems.map(() => doc(collection(realDb, "movimientos")));
      const stockRefs = afectaStock ? normalizedItems.map((item) => {
        const key = `${item.sku}_${item.almacen_id}`;
        return { key, ref: doc(realDb!, "stock", key) };
      }) : [];
      const summaryRefs = normalizedItems.map((item) => {
        const key = `${todayStr}_${item.sku}_${item.almacen_id}`;
        return { key, ref: doc(realDb!, "resumen_ventas", key) };
      });
      const periodRef = periodoKey ? doc(realDb, "periodos_financieros", periodoKey) : null;
      const dropRef = dropId ? doc(realDb, "drops", dropId) : null;
      let generatedFolio = "";
      let dropNombre = "";

      await runTransaction(realDb, async (transaction) => {
        const counterSnap = await transaction.get(counterRef);
        const nextNumber = counterSnap.exists() && typeof counterSnap.data()?.ultimo_consecutivo === "number"
          ? counterSnap.data()!.ultimo_consecutivo + 1
          : 1;
        generatedFolio = `Salida-${nextNumber}`;

        const stockSnaps: any[] = [];
        for (const stockEntry of stockRefs) {
          stockSnaps.push(await transaction.get(stockEntry.ref));
        }

        const summarySnaps: any[] = [];
        for (const summaryEntry of summaryRefs) {
          summarySnaps.push(await transaction.get(summaryEntry.ref));
        }

        const periodSnap = periodRef ? await transaction.get(periodRef) : null;
        const dropSnap = dropRef ? await transaction.get(dropRef) : null;
        if (dropRef) {
          if (!dropSnap?.exists() || dropSnap.data()?.en_papelera === true) {
            throw new Error("El drop seleccionado ya no está disponible.");
          }
          if (dropSnap.data()?.estado !== "en_venta") {
            throw new Error("Solo puedes registrar ventas en un drop con estado En venta.");
          }
          dropNombre = String(dropSnap.data()?.nombre || "").trim();
        }

        if (afectaStock) normalizedItems.forEach((item, index) => {
          const currentQty = stockSnaps[index].exists()
            ? Number(stockSnaps[index].data()?.cantidad) || 0
            : 0;
          if (currentQty < item.cantidad) {
            throw new Error(
              `Stock insuficiente para ${item.sku}. Disponible: ${currentQty} uds, solicitado: ${item.cantidad} uds.`
            );
          }
        });

        const operationTimestamp = Timestamp.now();

        normalizedItems.forEach((item, index) => {
          const currentQty = afectaStock && stockSnaps[index]?.exists()
            ? Number(stockSnaps[index].data()?.cantidad) || 0
            : 0;
          const previousSummaryQty = summarySnaps[index]?.exists()
            ? Number(summarySnaps[index].data()?.cantidad) || 0
            : 0;
          const previousSummaryTransactions = summarySnaps[index]?.exists()
            ? Number(summarySnaps[index].data()?.total_transacciones) || 0
            : 0;
          const isPrimaryItem = index === 0;

          if (afectaStock) {
            transaction.set(stockRefs[index].ref, {
              id: stockRefs[index].key,
              sku: item.sku,
              almacen_id: item.almacen_id,
              cantidad: currentQty - item.cantidad,
              actualizado: operationTimestamp
            }, { merge: true });

          }

          transaction.set(summaryRefs[index].ref, {
            id: summaryRefs[index].key,
            fecha_str: todayStr,
            fecha: operationTimestamp,
            sku: item.sku,
            almacen_id: item.almacen_id,
            cantidad: previousSummaryQty + item.cantidad,
            total_transacciones: previousSummaryTransactions + 1,
            actualizado: operationTimestamp
          }, { merge: true });

          transaction.set(movementRefs[index], {
            folio: generatedFolio,
            venta_id: ventaId,
            venta_partida: index + 1,
            venta_total_partidas: normalizedItems.length,
            venta_subtotal: ventaSubtotal,
            venta_total_cobrado: ventaTotalCobrado,
            venta_total_costos: ventaTotalCostos,
            canal_venta: venta.canal_venta,
            canal_venta_nombre: venta.canal_venta_nombre,
            porcentaje_precio: porcentajePrecio,
            afecta_stock: afectaStock,
            anticipo_porcentaje: anticipoPorcentaje,
            venta_total_recibido: ventaTotalRecibido,
            venta_saldo_pendiente: ventaSaldoPendiente,
            estado_pago: estadoPago,
            ...(!afectaStock ? { pedido_estado: estadoPago === "pagado" ? "pagado" : "pedido" } : {}),
            ...(isPrimaryItem ? { ingreso_reconocido: ventaTotalRecibido } : {}),
            sku: item.sku,
            almacen_id: item.almacen_id,
            tipo: "salida",
            cantidad: item.cantidad,
            referencia: venta.referencia,
            usuario: usuarioEmail,
            fecha: operationTimestamp,
            estado: "activo",
            ...(dropId ? { drop_id: dropId, drop_nombre: dropNombre } : {}),
            cliente_nombre: venta.cliente_nombre,
            precio_unitario_venta: item.precio_unitario_venta,
            costo_unitario_venta: item.costo_unitario_venta,
            total_venta: item.total_venta,
            total_cobrado: Math.round((item.total_venta + (isPrimaryItem ? envioCobrado + otrosCargos : 0) + Number.EPSILON) * 100) / 100,
            ...(venta.cliente_id ? { cliente_id: venta.cliente_id } : {}),
            ...(venta.cliente_tipo ? { cliente_tipo: venta.cliente_tipo } : {}),
            ...(isPrimaryItem && envioCobrado > 0 ? { envio_cobrado_cliente: envioCobrado } : {}),
            ...(isPrimaryItem && otrosCargos > 0 ? { otros_cargos_cliente: otrosCargos } : {}),
            ...(isPrimaryItem && otrosCargos > 0 && venta.concepto_otros_cargos ? { concepto_otros_cargos: venta.concepto_otros_cargos } : {}),
            ...(isPrimaryItem && costoEnvio > 0 ? { costo_envio_venta: costoEnvio } : {}),
            ...(isPrimaryItem && otrosCostos > 0 ? { otros_costos_venta: otrosCostos } : {}),
            ...(isPrimaryItem && otrosCostos > 0 && venta.concepto_otros_costos ? { concepto_otros_costos: venta.concepto_otros_costos } : {}),
            ...(isPrimaryItem && ventaTotalCostos > 0 ? { total_costos_venta: ventaTotalCostos } : {}),
            ...(venta.comentarios_venta ? { comentarios_venta: venta.comentarios_venta } : {}),
            ...(venta.ubicacion_entrega_id ? { ubicacion_entrega_id: venta.ubicacion_entrega_id, ubicacion_entrega_nombre: venta.ubicacion_entrega_nombre || "" } : {}),
            ...(venta.repartidor_id ? { repartidor_id: venta.repartidor_id, repartidor_nombre: venta.repartidor_nombre || "" } : {})
          });
        });

        const initialPayments = ventaTotalRecibido > 0 ? [{
          id: "inicial",
          monto: ventaTotalRecibido,
          metodo_pago: metodoPagoInicial,
          fecha: operationTimestamp,
          usuario: usuarioEmail,
          estado: "activo"
        }] : [];

        transaction.set(ventaRef, {
          folio: generatedFolio,
          fecha: operationTimestamp,
          fecha_str: todayStr,
          items: normalizedItems.map(item => ({
            sku: item.sku,
            almacen_id: item.almacen_id,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario_venta,
            costo_unitario: item.costo_unitario_venta,
            total: item.total_venta,
            costo_total: item.costo_total
          })),
          total_unidades: totalUnidadesVenta,
          subtotal: ventaSubtotal,
          envio_cobrado_cliente: envioCobrado,
          otros_cargos_cliente: otrosCargos,
          ...(venta.concepto_otros_cargos ? { concepto_otros_cargos: venta.concepto_otros_cargos } : {}),
          total: ventaTotalCobrado,
          costo_mercancia: costoMercancia,
          costo_envio_venta: costoEnvio,
          otros_costos_venta: otrosCostos,
          ...(venta.concepto_otros_costos ? { concepto_otros_costos: venta.concepto_otros_costos } : {}),
          costos_totales: costoMercancia + ventaTotalCostos,
          ...(venta.cliente_id ? { cliente_id: venta.cliente_id } : {}),
          cliente_nombre: venta.cliente_nombre,
          ...(venta.cliente_tipo ? { cliente_tipo: venta.cliente_tipo } : {}),
          ...(dropId ? { drop_id: dropId, drop_nombre: dropNombre } : {}),
          canal_venta: venta.canal_venta,
          canal_venta_nombre: venta.canal_venta_nombre,
          porcentaje_precio: porcentajePrecio,
          afecta_stock: afectaStock,
          anticipo_porcentaje: anticipoPorcentaje,
          recibido: ventaTotalRecibido,
          saldo: ventaSaldoPendiente,
          estado_pago: estadoPago,
          ...(!afectaStock ? { estado_pedido: estadoPago === "pagado" ? "pagado" : "pedido" } : {}),
          pagos: initialPayments,
          metodo_pago_inicial: metodoPagoInicial,
          ...(venta.comentarios_venta ? { comentarios: venta.comentarios_venta } : {}),
          ...(venta.ubicacion_entrega_id ? { ubicacion_entrega_id: venta.ubicacion_entrega_id, ubicacion_entrega_nombre: venta.ubicacion_entrega_nombre || "" } : {}),
          ...(venta.repartidor_id ? { repartidor_id: venta.repartidor_id, repartidor_nombre: venta.repartidor_nombre || "" } : {}),
          creado_por: usuarioEmail,
          creado_at: operationTimestamp,
          actualizado_at: operationTimestamp,
          estado: "activo",
          en_papelera: false
        });

        transaction.set(counterRef, {
          tipo: "salida",
          ultimo_consecutivo: nextNumber,
          actualizado: operationTimestamp
        }, { merge: true });

        if (periodRef && periodoKey) {
          const updatedPeriod = computeNewPeriodIndexData(
            periodSnap?.exists() ? periodSnap.data() : null,
            periodoKey,
            1,
            0,
            0
          );
          transaction.set(periodRef, updatedPeriod, { merge: true });
        }
      });

      clearFinanzasCache();
      clearPeriodosFinancierosCache();
      return { id: ventaId, folio: generatedFolio, movimientosCount: normalizedItems.length };
    }

    let localDropNombre = "";
    if (dropId) {
      const localDrop = getLocalStorageItem<Drop[]>("drops", []).find(item => item.id === dropId && item.en_papelera !== true);
      if (!localDrop) throw new Error("El drop seleccionado ya no está disponible.");
      if (localDrop.estado !== "en_venta") throw new Error("Solo puedes registrar ventas en un drop con estado En venta.");
      const allowedSkus = new Set(getLocalStorageItem<Compra[]>("compras", [])
        .filter(item => item.drop_id === dropId && item.en_papelera !== true && item.estado !== "anulada")
        .flatMap(item => item.items.map(purchaseItem => purchaseItem.sku.trim().toUpperCase())));
      const missingSkus = getMissingDropSkus(normalizedItems.map(item => item.sku), allowedSkus);
      if (missingSkus.length) throw new Error(`No puedes registrar esta venta en el drop seleccionado: ${[...new Set(missingSkus)].join(", ")} no pertenece a sus compras activas.`);
      localDropNombre = localDrop.nombre;
    }

    const stockMap = getLocalStorageItem<Record<string, StockItem>>("stock", {});
    if (afectaStock) normalizedItems.forEach((item) => {
      const key = `${item.sku}_${item.almacen_id}`;
      const currentQty = stockMap[key]?.cantidad || 0;
      if (currentQty < item.cantidad) {
        throw new Error(`Stock insuficiente para ${item.sku}. Disponible: ${currentQty} uds, solicitado: ${item.cantidad} uds.`);
      }
    });

    const generatedFolio = firestoreService.getNextLocalFolio("salida");
    const ventaId = `venta_${Math.random().toString(36).slice(2, 11)}`;
    const movimientos = getLocalStorageItem<Movimiento[]>("movimientos", []);
    const summaryMap = getLocalStorageItem<Record<string, ResumenVentaDiaria>>("resumen_ventas", {});

    normalizedItems.forEach((item, index) => {
      const stockKey = `${item.sku}_${item.almacen_id}`;
      const currentQty = stockMap[stockKey]?.cantidad || 0;
      const summaryKey = `${todayStr}_${item.sku}_${item.almacen_id}`;
      const previousSummary = summaryMap[summaryKey];
      const isPrimaryItem = index === 0;

      if (afectaStock) {
        stockMap[stockKey] = {
          id: stockKey,
          sku: item.sku,
          almacen_id: item.almacen_id,
          cantidad: currentQty - item.cantidad,
          actualizado: now
        };

      }

      summaryMap[summaryKey] = {
        id: summaryKey,
        fecha_str: todayStr,
        fecha: now,
        sku: item.sku,
        almacen_id: item.almacen_id,
        cantidad: (previousSummary?.cantidad || 0) + item.cantidad,
        total_transacciones: (previousSummary?.total_transacciones || 0) + 1,
        actualizado: now
      };

      movimientos.push({
        id: `${ventaId}_${index + 1}`,
        folio: generatedFolio,
        venta_id: ventaId,
        venta_partida: index + 1,
        venta_total_partidas: normalizedItems.length,
        venta_subtotal: ventaSubtotal,
        venta_total_cobrado: ventaTotalCobrado,
        venta_total_costos: ventaTotalCostos,
        canal_venta: venta.canal_venta,
        canal_venta_nombre: venta.canal_venta_nombre,
        porcentaje_precio: porcentajePrecio,
        afecta_stock: afectaStock,
        anticipo_porcentaje: anticipoPorcentaje,
        venta_total_recibido: ventaTotalRecibido,
        venta_saldo_pendiente: ventaSaldoPendiente,
        estado_pago: estadoPago,
        ...(!afectaStock ? { pedido_estado: estadoPago === "pagado" ? "pagado" : "pedido" } : {}),
        ...(isPrimaryItem ? { ingreso_reconocido: ventaTotalRecibido } : {}),
        sku: item.sku,
        almacen_id: item.almacen_id,
        tipo: "salida",
        cantidad: item.cantidad,
        referencia: venta.referencia,
        usuario: usuarioEmail,
        fecha: now,
        estado: "activo",
        ...(dropId ? { drop_id: dropId, drop_nombre: localDropNombre } : {}),
        cliente_nombre: venta.cliente_nombre,
        precio_unitario_venta: item.precio_unitario_venta,
        costo_unitario_venta: item.costo_unitario_venta,
        total_venta: item.total_venta,
        total_cobrado: Math.round((item.total_venta + (isPrimaryItem ? envioCobrado + otrosCargos : 0) + Number.EPSILON) * 100) / 100,
        ...(venta.cliente_id ? { cliente_id: venta.cliente_id } : {}),
        ...(venta.cliente_tipo ? { cliente_tipo: venta.cliente_tipo } : {}),
        ...(isPrimaryItem && envioCobrado > 0 ? { envio_cobrado_cliente: envioCobrado } : {}),
        ...(isPrimaryItem && otrosCargos > 0 ? { otros_cargos_cliente: otrosCargos } : {}),
        ...(isPrimaryItem && otrosCargos > 0 && venta.concepto_otros_cargos ? { concepto_otros_cargos: venta.concepto_otros_cargos } : {}),
        ...(isPrimaryItem && costoEnvio > 0 ? { costo_envio_venta: costoEnvio } : {}),
        ...(isPrimaryItem && otrosCostos > 0 ? { otros_costos_venta: otrosCostos } : {}),
        ...(isPrimaryItem && otrosCostos > 0 && venta.concepto_otros_costos ? { concepto_otros_costos: venta.concepto_otros_costos } : {}),
        ...(isPrimaryItem && ventaTotalCostos > 0 ? { total_costos_venta: ventaTotalCostos } : {}),
        ...(venta.comentarios_venta ? { comentarios_venta: venta.comentarios_venta } : {}),
        ...(venta.ubicacion_entrega_id ? { ubicacion_entrega_id: venta.ubicacion_entrega_id, ubicacion_entrega_nombre: venta.ubicacion_entrega_nombre || "" } : {}),
        ...(venta.repartidor_id ? { repartidor_id: venta.repartidor_id, repartidor_nombre: venta.repartidor_nombre || "" } : {})
      });
    });

    setLocalStorageItem("stock", stockMap);
    setLocalStorageItem("resumen_ventas", summaryMap);
    setLocalStorageItem("movimientos", movimientos);
    const ventas = getLocalStorageItem<Venta[]>("ventas_maestras", []);
    ventas.unshift({
      id: ventaId,
      folio: generatedFolio,
      fecha: now,
      fecha_str: todayStr,
      items: normalizedItems.map(item => ({ sku: item.sku, almacen_id: item.almacen_id, cantidad: item.cantidad, precio_unitario: item.precio_unitario_venta, costo_unitario: item.costo_unitario_venta, total: item.total_venta, costo_total: item.costo_total })),
      total_unidades: totalUnidadesVenta,
      subtotal: ventaSubtotal,
      envio_cobrado_cliente: envioCobrado,
      otros_cargos_cliente: otrosCargos,
      concepto_otros_cargos: venta.concepto_otros_cargos,
      total: ventaTotalCobrado,
      costo_mercancia: costoMercancia,
      costo_envio_venta: costoEnvio,
      otros_costos_venta: otrosCostos,
      concepto_otros_costos: venta.concepto_otros_costos,
      costos_totales: costoMercancia + ventaTotalCostos,
      cliente_id: venta.cliente_id,
      cliente_nombre: venta.cliente_nombre,
      cliente_tipo: venta.cliente_tipo,
      drop_id: dropId || undefined,
      drop_nombre: dropId ? localDropNombre : undefined,
      canal_venta: venta.canal_venta,
      canal_venta_nombre: venta.canal_venta_nombre,
      porcentaje_precio: porcentajePrecio,
      afecta_stock: afectaStock,
      anticipo_porcentaje: anticipoPorcentaje,
      recibido: ventaTotalRecibido,
      saldo: ventaSaldoPendiente,
      estado_pago: estadoPago,
      estado_pedido: !afectaStock ? (estadoPago === "pagado" ? "pagado" : "pedido") : undefined,
      pagos: ventaTotalRecibido > 0 ? [{ id: "inicial", monto: ventaTotalRecibido, metodo_pago: metodoPagoInicial, fecha: now, usuario: usuarioEmail, estado: "activo" }] : [],
      metodo_pago_inicial: metodoPagoInicial,
      comentarios: venta.comentarios_venta,
      ubicacion_entrega_id: venta.ubicacion_entrega_id,
      ubicacion_entrega_nombre: venta.ubicacion_entrega_nombre,
      repartidor_id: venta.repartidor_id,
      repartidor_nombre: venta.repartidor_nombre,
      creado_por: usuarioEmail,
      creado_at: now,
      actualizado_at: now,
      estado: "activo",
      en_papelera: false
    });
    setLocalStorageItem("ventas_maestras", ventas);
    notifyListeners("stock", stockMap);
    notifyListeners("movimientos", movimientos);
    clearFinanzasCache();
    clearPeriodosFinancierosCache();
    return { id: ventaId, folio: generatedFolio, movimientosCount: normalizedItems.length };
  },

  getVentasMaestrasPaginated: async (options: {
    pageSize?: number;
    lastDoc?: any;
    includeArchived?: boolean;
  } = {}): Promise<{ items: Venta[]; lastDoc: any; hasMore: boolean }> => {
    const pageSize = options.pageSize || 40;
    if (isConfigured && realDb) {
      const constraints: any[] = [orderBy("fecha", "desc"), limit(pageSize + 1)];
      if (options.lastDoc) constraints.push(startAfter(options.lastDoc));
      const snap = await getDocs(query(collection(realDb, "ventas"), ...constraints));
      const hasMore = snap.docs.length > pageSize;
      const selected = snap.docs.slice(0, pageSize);
      const items = selected.map(item => leerVenta(item.id, item.data()))
        .filter(item => options.includeArchived || item.en_papelera !== true);
      return { items, lastDoc: selected.at(-1) || null, hasMore };
    }
    const all = getLocalStorageItem<Venta[]>("ventas_maestras", [])
      .map(item => leerVenta(item.id, item))
      .filter(item => options.includeArchived || item.en_papelera !== true)
      .sort((a, b) => fechaRegistro(b.fecha).getTime() - fechaRegistro(a.fecha).getTime());
    const start = typeof options.lastDoc === "number" ? options.lastDoc : 0;
    const items = all.slice(start, start + pageSize);
    return { items, lastDoc: start + items.length, hasMore: start + items.length < all.length };
  },

  // Estas lecturas pertenecen a una ficha individual, no a todo el sistema.
  // La igualdad por cliente usa el índice automático y trae todas sus partidas
  // y eventos: no corta una venta ni presenta métricas de una página como totales.
  getMovimientosCliente: async (clienteId: string): Promise<Movimiento[]> => {
    if (!clienteId.trim()) throw new Error("Selecciona un cliente.");
    const rows = isConfigured && realDb
      ? (await getDocs(query(collection(realDb, "movimientos"), where("cliente_id", "==", clienteId)))).docs.map(item => leerMovimiento(item.id, item.data()))
      : getLocalStorageItem<Movimiento[]>("movimientos", []).filter(item => item.cliente_id === clienteId).map(item => leerMovimiento(item.id || "", item));
    return rows.filter(item => item.en_papelera !== true)
      .sort((a, b) => fechaRegistro(b.fecha).getTime() - fechaRegistro(a.fecha).getTime());
  },

  getVentasCliente: async (clienteId: string): Promise<Venta[]> => {
    if (!clienteId.trim()) throw new Error("Selecciona un cliente.");
    if (isConfigured && realDb) {
      const snapshot = await getDocs(query(collection(realDb, "ventas"), where("cliente_id", "==", clienteId)));
      return snapshot.docs.map(item => leerVenta(item.id, item.data()));
    }
    return getLocalStorageItem<Venta[]>("ventas_maestras", []).filter(item => item.cliente_id === clienteId).map(item => leerVenta(item.id, item));
  },

  // Los seguimientos legados no siempre tenían cliente_id. Se recuperan por
  // grupos de ventas del cliente, nunca con una lectura global o por cada fila.
  getEventosVentas: async (ventaIds: string[]): Promise<Movimiento[]> => {
    const ids = [...new Set(ventaIds.filter(Boolean))];
    if (!ids.length) return [];
    if (isConfigured && realDb) {
      const groups = Array.from({ length: Math.ceil(ids.length / 10) }, (_, index) => ids.slice(index * 10, index * 10 + 10));
      const snapshots = await Promise.all(groups.map(group => getDocs(query(
        collection(realDb, "movimientos"), where("venta_relacionada_id", "in", group)
      ))));
      return snapshots.flatMap(snapshot => snapshot.docs.map(item => leerMovimiento(item.id, item.data())));
    }
    const allowed = new Set(ids);
    return getLocalStorageItem<Movimiento[]>("movimientos", []).filter(item => allowed.has(item.venta_relacionada_id || ""))
      .map(item => leerMovimiento(item.id || "", item));
  },

  getPedidosVenta: async (): Promise<PedidoVenta[]> => {
    const readMasters = async () => {
      const sales: Venta[] = [];
      let cursor: any = null;
      let hasMore = true;
      while (hasMore) {
        const page = await firestoreService.getVentasMaestrasPaginated({ pageSize: 200, lastDoc: cursor, includeArchived: true });
        sales.push(...page.items);
        cursor = page.lastDoc;
        hasMore = page.hasMore;
      }
      return sales;
    };
    const readMovements = async (tipo: "salida" | "ajuste") => {
      const rows: Movimiento[] = [];
      let cursor: any = null;
      let hasMore = true;
      while (hasMore) {
        const constraints: any[] = [where("tipo", "==", tipo), orderBy("fecha", "desc"), limit(201)];
        if (cursor) constraints.push(startAfter(cursor));
        const snapshot = await getDocs(query(collection(realDb, "movimientos"), ...constraints));
        const page = snapshot.docs.slice(0, 200);
        rows.push(...page.map(item => leerMovimiento(item.id, item.data())));
        cursor = page.at(-1);
        hasMore = snapshot.docs.length > 200;
      }
      return rows;
    };
    if (isConfigured && realDb) {
      const [masters, sales, tracking] = await Promise.all([readMasters(), readMovements("salida"), readMovements("ajuste")]);
      return construirPedidos(masters, [...sales, ...tracking]);
    }
    return construirPedidos(
      getLocalStorageItem<Venta[]>("ventas_maestras", []).map(item => leerVenta(item.id, item)),
      getLocalStorageItem<Movimiento[]>("movimientos", []).map(item => leerMovimiento(item.id || "", item))
    );
  },

  registrarPagoPedido: async (ventaId: string, monto: number, metodoPago: string): Promise<void> => {
    const cleanAmount = Math.round((Number(monto) + Number.EPSILON) * 100) / 100;
    if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) throw new Error("El pago debe ser mayor a cero.");
    const cleanMethod = (metodoPago || "").trim();
    if (!cleanMethod) throw new Error("Selecciona el método de pago.");
    const user = authService.getCurrentUser();
    const now = new Date();
    const periodoKey = getPeriodoKey(now);

    if (isConfigured && realDb) {
      const masterRef = doc(realDb, "ventas", ventaId);
      const masterSnap = await getDoc(masterRef);
      if (masterSnap.exists()) {
        const paymentRef = doc(collection(realDb, "movimientos"));
        const periodRef = periodoKey ? doc(realDb, "periodos_financieros", periodoKey) : null;
        await runTransaction(realDb, async transaction => {
          const currentSale = await transaction.get(masterRef);
          const periodSnap = periodRef ? await transaction.get(periodRef) : null;
          if (!currentSale.exists()) throw new Error("El pedido ya no existe.");
          const data = currentSale.data();
          if (data.estado === "anulado" || data.estado === "devuelto" || data.en_papelera === true) throw new Error("El pedido está cancelado, devuelto o ya no está disponible.");
          const total = Math.max(0, Number(data.total) || 0);
          const currentReceived = Math.max(0, Number(data.recibido) || 0);
          const currentBalance = Math.max(0, Math.round((total - currentReceived + Number.EPSILON) * 100) / 100);
          if (currentBalance <= 0) throw new Error("Este pedido ya está pagado.");
          if (cleanAmount > currentBalance) throw new Error(`El pago no puede superar el saldo de $${currentBalance.toFixed(2)}.`);
          const timestamp = Timestamp.now();
          const nuevoRecibido = Math.round((currentReceived + cleanAmount + Number.EPSILON) * 100) / 100;
          const nuevoSaldo = Math.max(0, Math.round((total - nuevoRecibido + Number.EPSILON) * 100) / 100);
          const payment: PagoVenta = { id: paymentRef.id, monto: cleanAmount, metodo_pago: cleanMethod, fecha: timestamp as any, usuario: user?.email || "Sistema", estado: "activo" };
          const pagos = Array.isArray(data.pagos) ? [...data.pagos, payment] : [payment];
          transaction.update(masterRef, {
            pagos,
            recibido: nuevoRecibido,
            saldo: nuevoSaldo,
            estado_pago: nuevoSaldo === 0 ? "pagado" : "anticipo",
            estado_pedido: nuevoSaldo === 0 ? "pagado" : "pedido",
            actualizado_at: timestamp
          });
          transaction.set(paymentRef, {
            folio: `Abono-${data.folio || ventaId}`,
            venta_relacionada_id: ventaId,
            subtipo: "abono_venta",
            sku: "ABONO",
            almacen_id: "bajo_pedido",
            tipo: "salida",
            cantidad: 1,
            referencia: `Pago de ${data.folio || ventaId}`,
            usuario: user?.email || "Sistema",
            fecha: timestamp,
            estado: "activo",
            cliente_id: data.cliente_id || "",
            cliente_nombre: data.cliente_nombre || "Cliente",
            canal_venta: data.canal_venta,
            canal_venta_nombre: data.canal_venta_nombre,
            afecta_stock: false,
            venta_total_recibido: cleanAmount,
            venta_saldo_pendiente: nuevoSaldo,
            ingreso_reconocido: cleanAmount,
            venta_subtotal: Number(data.subtotal) || 0,
            venta_total_cobrado: total,
            envio_cobrado_cliente: Number(data.envio_cobrado_cliente) || 0,
            otros_cargos_cliente: Number(data.otros_cargos_cliente) || 0,
            total_venta: 0,
            total_cobrado: cleanAmount,
            metodo_pago: cleanMethod,
            estado_pago: nuevoSaldo === 0 ? "pagado" : "anticipo"
          });
          if (periodRef && periodoKey) transaction.set(periodRef, computeNewPeriodIndexData(periodSnap?.exists() ? periodSnap.data() : null, periodoKey, 1, 0, 0), { merge: true });
        });
        clearFinanzasCache();
        clearPeriodosFinancierosCache();
        return;
      }
      const saleQuery = query(collection(realDb, "movimientos"), where("venta_id", "==", ventaId));
      const paymentsQuery = query(collection(realDb, "movimientos"), where("venta_relacionada_id", "==", ventaId));
      const [saleSnap, paymentsSnap] = await Promise.all([getDocs(saleQuery), getDocs(paymentsQuery)]);
      const saleRefs = saleSnap.docs.map(item => item.ref);
      const paymentRefs = paymentsSnap.docs.filter(item => item.data().subtipo === "abono_venta").map(item => item.ref);
      if (saleRefs.length === 0) throw new Error("El pedido ya no existe.");
      const paymentRef = doc(collection(realDb, "movimientos"));
      const periodRef = periodoKey ? doc(realDb, "periodos_financieros", periodoKey) : null;

      await runTransaction(realDb, async transaction => {
        const currentSnaps = [];
        for (const ref of saleRefs) currentSnaps.push(await transaction.get(ref));
        const currentPayments = [];
        for (const ref of paymentRefs) currentPayments.push(await transaction.get(ref));
        const periodSnap = periodRef ? await transaction.get(periodRef) : null;
        const active = currentSnaps.filter(item => item.exists() && (item.data().estado || "activo") !== "anulado");
        if (active.length === 0) throw new Error("El pedido está cancelado o ya no está disponible.");
        const principal = active.find(item => item.data().venta_partida === 1) || active[0];
        const data = principal.data();
        const total = Math.max(0, Number(data.venta_total_cobrado) || 0);
        const initialReceived = Math.max(0, typeof data.venta_total_recibido === "number" ? data.venta_total_recibido : active.reduce((sum, item) => sum + (Number(item.data().ingreso_reconocido) || 0), 0));
        const previousPayments = currentPayments.reduce((sum, item) => sum + (item.exists() && item.data().estado !== "anulado" && item.data().en_papelera !== true ? Math.max(0, Number(item.data().ingreso_reconocido) || 0) : 0), 0);
        const saldoActual = Math.max(0, Math.round((total - initialReceived - previousPayments + Number.EPSILON) * 100) / 100);
        if (saldoActual <= 0) throw new Error("Este pedido ya está pagado.");
        if (cleanAmount > saldoActual) throw new Error(`El pago no puede superar el saldo de $${saldoActual.toFixed(2)}.`);
        const nuevoSaldo = Math.max(0, Math.round((saldoActual - cleanAmount + Number.EPSILON) * 100) / 100);
        const timestamp = Timestamp.now();

        transaction.set(paymentRef, {
          folio: `Abono-${data.folio || ventaId}`,
          venta_relacionada_id: ventaId,
          subtipo: "abono_venta",
          sku: "ABONO",
          almacen_id: "bajo_pedido",
          tipo: "salida",
          cantidad: 1,
          referencia: `Pago de ${data.folio || ventaId}`,
          usuario: user?.email || "Sistema",
          fecha: timestamp,
          estado: "activo",
          cliente_id: data.cliente_id || "",
          cliente_nombre: data.cliente_nombre || "Cliente",
          canal_venta: data.canal_venta,
          canal_venta_nombre: data.canal_venta_nombre,
          afecta_stock: false,
          venta_total_recibido: cleanAmount,
          venta_saldo_pendiente: nuevoSaldo,
          ingreso_reconocido: cleanAmount,
          venta_subtotal: Number(data.venta_subtotal) || 0,
          venta_total_cobrado: total,
          envio_cobrado_cliente: Number(data.envio_cobrado_cliente) || 0,
          otros_cargos_cliente: Number(data.otros_cargos_cliente) || 0,
          metodo_pago: cleanMethod,
          total_venta: 0,
          total_cobrado: cleanAmount,
          estado_pago: nuevoSaldo === 0 ? "pagado" : "anticipo"
        });

        if (periodRef && periodoKey) {
          transaction.set(periodRef, computeNewPeriodIndexData(periodSnap?.exists() ? periodSnap.data() : null, periodoKey, 1, 0, 0), { merge: true });
        }
      });
    } else {
      const movimientos = getLocalStorageItem<Movimiento[]>("movimientos", []);
      const masterSales = getLocalStorageItem<Venta[]>("ventas_maestras", []);
      const masterIndex = masterSales.findIndex(item => item.id === ventaId);
      if (masterIndex >= 0) {
        const sale = masterSales[masterIndex];
        if (sale.estado === "anulado" || sale.estado === "devuelto" || sale.en_papelera) throw new Error("El pedido está cancelado, devuelto o ya no está disponible.");
        if (cleanAmount > sale.saldo) throw new Error(`El pago no puede superar el saldo de $${sale.saldo.toFixed(2)}.`);
        const paymentId = `abono_${Math.random().toString(36).slice(2, 11)}`;
        const nuevoRecibido = Math.round((sale.recibido + cleanAmount + Number.EPSILON) * 100) / 100;
        const nuevoSaldo = Math.max(0, Math.round((sale.total - nuevoRecibido + Number.EPSILON) * 100) / 100);
        masterSales[masterIndex] = { ...sale, recibido: nuevoRecibido, saldo: nuevoSaldo, estado_pago: nuevoSaldo === 0 ? "pagado" : "anticipo", estado_pedido: nuevoSaldo === 0 ? "pagado" : "pedido", actualizado_at: now, pagos: [...sale.pagos, { id: paymentId, monto: cleanAmount, metodo_pago: cleanMethod, fecha: now, usuario: user?.email || "Sistema", estado: "activo" }] };
        movimientos.push({ id: paymentId, folio: `Abono-${sale.folio}`, venta_relacionada_id: ventaId, subtipo: "abono_venta", sku: "ABONO", almacen_id: "bajo_pedido", tipo: "salida", cantidad: 1, referencia: `Pago de ${sale.folio}`, usuario: user?.email || "Sistema", fecha: now, estado: "activo", cliente_id: sale.cliente_id, cliente_nombre: sale.cliente_nombre, canal_venta: sale.canal_venta, canal_venta_nombre: sale.canal_venta_nombre, afecta_stock: false, venta_total_recibido: cleanAmount, venta_saldo_pendiente: nuevoSaldo, ingreso_reconocido: cleanAmount, venta_subtotal: sale.subtotal, venta_total_cobrado: sale.total, envio_cobrado_cliente: sale.envio_cobrado_cliente, otros_cargos_cliente: sale.otros_cargos_cliente, total_venta: 0, total_cobrado: cleanAmount, estado_pago: nuevoSaldo === 0 ? "pagado" : "anticipo" });
        setLocalStorageItem("ventas_maestras", masterSales);
        setLocalStorageItem("movimientos", movimientos);
        notifyListeners("movimientos", movimientos);
        clearFinanzasCache(); clearPeriodosFinancierosCache();
        return;
      }
      const targets = movimientos.filter(item => item.venta_id === ventaId && (item.estado || "activo") !== "anulado");
      if (targets.length === 0) throw new Error("El pedido ya no existe.");
      const principal = targets.find(item => item.venta_partida === 1) || targets[0];
      const total = Math.max(0, Number(principal.venta_total_cobrado) || 0);
      const initialReceived = Math.max(0, typeof principal.venta_total_recibido === "number" ? principal.venta_total_recibido : targets.reduce((sum, item) => sum + (Number(item.ingreso_reconocido) || 0), 0));
      const previousPayments = movimientos.filter(item => item.venta_relacionada_id === ventaId && item.subtipo === "abono_venta" && item.estado !== "anulado" && item.en_papelera !== true).reduce((sum, item) => sum + Math.max(0, Number(item.ingreso_reconocido) || 0), 0);
      const saldoActual = Math.max(0, Math.round((total - initialReceived - previousPayments + Number.EPSILON) * 100) / 100);
      if (saldoActual <= 0) throw new Error("Este pedido ya está pagado.");
      if (cleanAmount > saldoActual) throw new Error(`El pago no puede superar el saldo de $${saldoActual.toFixed(2)}.`);
      const nuevoSaldo = Math.max(0, Math.round((saldoActual - cleanAmount + Number.EPSILON) * 100) / 100);
      movimientos.push({
        id: `abono_${Math.random().toString(36).slice(2, 11)}`,
        folio: `Abono-${principal.folio}`,
        venta_relacionada_id: ventaId,
        subtipo: "abono_venta",
        sku: "ABONO",
        almacen_id: "bajo_pedido",
        tipo: "salida",
        cantidad: 1,
        referencia: `Pago de ${principal.folio}`,
        usuario: user?.email || "Sistema",
        fecha: now,
        estado: "activo",
        cliente_id: principal.cliente_id,
        cliente_nombre: principal.cliente_nombre,
        canal_venta: principal.canal_venta,
        canal_venta_nombre: principal.canal_venta_nombre,
        afecta_stock: false,
        venta_total_recibido: cleanAmount,
        venta_saldo_pendiente: nuevoSaldo,
        ingreso_reconocido: cleanAmount,
        venta_subtotal: Number(principal.venta_subtotal) || 0,
        venta_total_cobrado: total,
        envio_cobrado_cliente: Number(principal.envio_cobrado_cliente) || 0,
        otros_cargos_cliente: Number(principal.otros_cargos_cliente) || 0,
        total_venta: 0,
        total_cobrado: cleanAmount,
        estado_pago: nuevoSaldo === 0 ? "pagado" : "anticipo"
      });
      setLocalStorageItem("movimientos", movimientos);
      notifyListeners("movimientos", movimientos);
    }
    clearFinanzasCache();
    clearPeriodosFinancierosCache();
  },

  actualizarSeguimientoPedido: async (ventaId: string, data: { fecha_estimada?: string; comentarios?: string; marcar_entregado?: boolean }): Promise<void> => {
    const now = new Date();
    if (isConfigured && realDb) {
      const masterRef = doc(realDb, "ventas", ventaId);
      const masterSnap = await getDoc(masterRef);
      if (masterSnap.exists()) {
        await runTransaction(realDb, async transaction => {
          const current = await transaction.get(masterRef);
          if (!current.exists()) throw new Error("El pedido ya no existe.");
          const currentData = current.data();
          if (currentData.estado === "anulado" || currentData.estado === "devuelto" || currentData.en_papelera === true) {
            throw new Error("El pedido está cancelado, devuelto o ya no está disponible.");
          }
          const saldo = Math.max(0, Number(currentData.saldo) || 0);
          if (data.marcar_entregado && saldo > 0.009) {
            throw new Error("Liquida el saldo antes de marcar el pedido como entregado.");
          }
          const changes: Record<string, unknown> = { actualizado_at: Timestamp.now() };
          if (data.fecha_estimada !== undefined) changes.fecha_estimada = data.fecha_estimada;
          if (data.comentarios !== undefined) changes.comentarios_pedido = data.comentarios.trim();
          if (data.marcar_entregado) {
            changes.estado_pedido = "entregado";
            changes.entregado_at = Timestamp.now();
          }
          transaction.update(masterRef, changes);
        });
        return;
      }
      const [saleSnap, eventSnap] = await Promise.all([
        getDocs(query(collection(realDb, "movimientos"), where("venta_id", "==", ventaId))),
        getDocs(query(collection(realDb, "movimientos"), where("venta_relacionada_id", "==", ventaId)))
      ]);
      if (saleSnap.empty) throw new Error("El pedido ya no existe.");
      const principal = saleSnap.docs.find(item => item.data().venta_partida === 1) || saleSnap.docs[0];
      const order = construirPedidos([], [...saleSnap.docs, ...eventSnap.docs].map(item => leerMovimiento(item.id, item.data())))
        .find(item => item.venta_id === ventaId);
      if (!order) throw new Error("El pedido está cancelado o ya no está disponible.");
      if (data.marcar_entregado && order.saldo > 0.009) throw new Error("Liquida el saldo antes de marcar el pedido como entregado.");
      await addDoc(collection(realDb, "movimientos"), {
        folio: `Seguimiento-${principal.data().folio || ventaId}`,
        venta_relacionada_id: ventaId,
        subtipo: "seguimiento_pedido",
        cliente_id: principal.data().cliente_id || "",
        cliente_nombre: principal.data().cliente_nombre || "Cliente",
        sku: "SEGUIMIENTO",
        almacen_id: "bajo_pedido",
        tipo: "ajuste",
        cantidad: 1,
        referencia: `Seguimiento de ${principal.data().folio || ventaId}`,
        usuario: authService.getCurrentUser()?.email || "Sistema",
        fecha: Timestamp.now(),
        estado: "activo",
        ...(data.fecha_estimada !== undefined ? { pedido_fecha_estimada: data.fecha_estimada } : {}),
        ...(data.comentarios !== undefined ? { pedido_comentarios: data.comentarios.trim() } : {}),
        ...(data.marcar_entregado ? { pedido_estado: "entregado", pedido_entregado_at: Timestamp.now() } : {})
      });
      return;
    }
    const movimientos = getLocalStorageItem<Movimiento[]>("movimientos", []);
    const masterSales = getLocalStorageItem<Venta[]>("ventas_maestras", []);
    const masterIndex = masterSales.findIndex(item => item.id === ventaId);
    if (masterIndex >= 0) {
      const sale = masterSales[masterIndex];
      if (sale.estado === "anulado" || sale.estado === "devuelto" || sale.en_papelera) throw new Error("El pedido está cancelado, devuelto o ya no está disponible.");
      if (data.marcar_entregado && sale.saldo > 0.009) throw new Error("Liquida el saldo antes de marcar el pedido como entregado.");
      masterSales[masterIndex] = {
        ...sale,
        ...(data.fecha_estimada !== undefined ? { fecha_estimada: data.fecha_estimada } : {}),
        ...(data.comentarios !== undefined ? { comentarios_pedido: data.comentarios.trim() } : {}),
        ...(data.marcar_entregado ? { estado_pedido: "entregado" as const, entregado_at: now } : {}),
        actualizado_at: now
      };
      setLocalStorageItem("ventas_maestras", masterSales);
      return;
    }
    const targets = movimientos.filter(item => item.venta_id === ventaId);
    if (targets.length === 0) throw new Error("El pedido ya no existe.");
    const principal = targets.find(item => item.venta_partida === 1) || targets[0];
    const order = construirPedidos([], movimientos).find(item => item.venta_id === ventaId);
    if (!order) throw new Error("El pedido está cancelado o ya no está disponible.");
    if (data.marcar_entregado && order.saldo > 0.009) throw new Error("Liquida el saldo antes de marcar el pedido como entregado.");
    movimientos.push({
      id: `seguimiento_${Math.random().toString(36).slice(2, 11)}`,
      folio: `Seguimiento-${principal.folio}`,
      venta_relacionada_id: ventaId,
      subtipo: "seguimiento_pedido",
      cliente_id: principal.cliente_id,
      cliente_nombre: principal.cliente_nombre,
      sku: "SEGUIMIENTO",
      almacen_id: "bajo_pedido",
      tipo: "ajuste",
      cantidad: 1,
      referencia: `Seguimiento de ${principal.folio}`,
      usuario: authService.getCurrentUser()?.email || "Sistema",
      fecha: now,
      estado: "activo",
      ...(data.fecha_estimada !== undefined ? { pedido_fecha_estimada: data.fecha_estimada } : {}),
      ...(data.comentarios !== undefined ? { pedido_comentarios: data.comentarios.trim() } : {}),
      ...(data.marcar_entregado ? { pedido_estado: "entregado", pedido_entregado_at: now } : {})
    });
    setLocalStorageItem("movimientos", movimientos);
    notifyListeners("movimientos", movimientos);
  },

  devolverVentaCompleta: async (ventaId: string, motivo: string): Promise<void> => {
    const cleanReason = motivo.trim();
    if (!cleanReason) throw new Error("Escribe el motivo de la devolución.");
    const userEmail = authService.getCurrentUser()?.email || "Sistema";
    const now = new Date();
    const periodoKey = getPeriodoKey(now);

    if (isConfigured && realDb) {
      const saleRef = doc(realDb, "ventas", ventaId);
      const refundRef = doc(collection(realDb, "movimientos"));
      const periodRef = periodoKey ? doc(realDb, "periodos_financieros", periodoKey) : null;
      await runTransaction(realDb, async transaction => {
        const saleSnap = await transaction.get(saleRef);
        if (!saleSnap.exists()) throw new Error("La venta no existe o es anterior al historial consolidado.");
        const sale = saleSnap.data();
        if (sale.estado === "anulado") throw new Error("Una venta anulada no se puede devolver.");
        if (sale.estado === "devuelto") throw new Error("Esta venta ya fue devuelta.");
        if (sale.en_papelera === true) throw new Error("Restaura la venta antes de devolverla.");
        const items = Array.isArray(sale.items) ? sale.items : [];
        if (items.length === 0) throw new Error("La venta no contiene partidas válidas.");

        const stockEntries = sale.afecta_stock !== false ? items.map((item: any) => {
          const sku = String(item.sku || "").trim().toUpperCase();
          const warehouseId = String(item.almacen_id || "").trim();
          const key = `${sku}_${warehouseId}`;
          return { sku, warehouseId, key, quantity: Number(item.cantidad) || 0, ref: doc(realDb!, "stock", key) };
        }) : [];
        const summaryEntries = items.map((item: any) => {
          const sku = String(item.sku || "").trim().toUpperCase();
          const warehouseId = String(item.almacen_id || "").trim();
          const key = `${String(sale.fecha_str || getLocalDateString(sale.fecha))}_${sku}_${warehouseId}`;
          return { quantity: Number(item.cantidad) || 0, ref: doc(realDb!, "resumen_ventas", key) };
        });
        const stockSnaps: any[] = [];
        for (const entry of stockEntries) stockSnaps.push(await transaction.get(entry.ref));
        const summarySnaps: any[] = [];
        for (const entry of summaryEntries) summarySnaps.push(await transaction.get(entry.ref));
        const periodSnap = periodRef ? await transaction.get(periodRef) : null;
        const timestamp = Timestamp.now();

        stockEntries.forEach((entry: any, index: number) => {
          const current = stockSnaps[index].exists() ? Number(stockSnaps[index].data()?.cantidad) || 0 : 0;
          transaction.set(entry.ref, { id: entry.key, sku: entry.sku, almacen_id: entry.warehouseId, cantidad: current + entry.quantity, actualizado: timestamp }, { merge: true });
        });
        summaryEntries.forEach((entry: any, index: number) => {
          if (!summarySnaps[index].exists()) return;
          const current = Number(summarySnaps[index].data()?.cantidad) || 0;
          const transactions = Number(summarySnaps[index].data()?.total_transacciones) || 0;
          transaction.set(entry.ref, { cantidad: Math.max(0, current - entry.quantity), total_transacciones: Math.max(0, transactions - 1), actualizado: timestamp }, { merge: true });
        });

        const refundAmount = Math.max(0, Number(sale.recibido) || 0);
        transaction.update(saleRef, {
          estado: "devuelto",
          monto_reembolsado: refundAmount,
          motivo_devolucion: cleanReason,
          devuelto_at: timestamp,
          devuelto_por: userEmail,
          saldo: 0,
          actualizado_at: timestamp
        });
        if (refundAmount > 0) {
          transaction.set(refundRef, {
            folio: `Reembolso-${sale.folio || ventaId}`,
            venta_relacionada_id: ventaId,
            subtipo: "reembolso_venta",
            sku: "REEMBOLSO",
            almacen_id: "devoluciones",
            tipo: "salida",
            cantidad: 1,
            unidades_devueltas: Number(sale.total_unidades) || 0,
            referencia: `Devolución de ${sale.folio || ventaId}: ${cleanReason}`,
            usuario: userEmail,
            fecha: timestamp,
            estado: "activo",
            cliente_id: sale.cliente_id || "",
            cliente_nombre: sale.cliente_nombre || "Cliente",
            canal_venta: sale.canal_venta,
            canal_venta_nombre: sale.canal_venta_nombre,
            afecta_stock: false,
            venta_total_recibido: -refundAmount,
            ingreso_reconocido: -refundAmount,
            venta_subtotal: Number(sale.subtotal) || 0,
            venta_total_cobrado: Number(sale.total) || 0,
            envio_cobrado_cliente: Number(sale.envio_cobrado_cliente) || 0,
            otros_cargos_cliente: Number(sale.otros_cargos_cliente) || 0,
            total_venta: -refundAmount,
            total_cobrado: -refundAmount,
            metodo_pago: sale.metodo_pago_inicial || "Método original"
          });
          if (periodRef && periodoKey) transaction.set(periodRef, computeNewPeriodIndexData(periodSnap?.exists() ? periodSnap.data() : null, periodoKey, 1, 0, 0), { merge: true });
        }
      });
      clearFinanzasCache(); clearPeriodosFinancierosCache();
      return;
    }

    const sales = getLocalStorageItem<Venta[]>("ventas_maestras", []);
    const index = sales.findIndex(item => item.id === ventaId);
    if (index === -1) throw new Error("La venta no existe o es anterior al historial consolidado.");
    const sale = sales[index];
    if (sale.estado === "anulado" || sale.estado === "devuelto") throw new Error("Esta venta no está disponible para devolución.");
    const stock = getLocalStorageItem<Record<string, StockItem>>("stock", {});
    const summaries = getLocalStorageItem<Record<string, ResumenVentaDiaria>>("resumen_ventas", {});
    if (sale.afecta_stock) sale.items.forEach(item => {
      const key = `${item.sku}_${item.almacen_id}`;
      stock[key] = { ...(stock[key] || { id: key, sku: item.sku, almacen_id: item.almacen_id }), cantidad: (stock[key]?.cantidad || 0) + item.cantidad, actualizado: now } as StockItem;
    });
    sale.items.forEach(item => {
      const key = `${sale.fecha_str}_${item.sku}_${item.almacen_id}`;
      if (summaries[key]) summaries[key] = { ...summaries[key], cantidad: Math.max(0, summaries[key].cantidad - item.cantidad), total_transacciones: Math.max(0, summaries[key].total_transacciones - 1), actualizado: now };
    });
    sales[index] = { ...sale, estado: "devuelto", monto_reembolsado: sale.recibido, motivo_devolucion: cleanReason, devuelto_at: now, devuelto_por: userEmail, saldo: 0, actualizado_at: now };
    const movements = getLocalStorageItem<Movimiento[]>("movimientos", []);
    if (sale.recibido > 0) movements.push({ id: `refund_${Math.random().toString(36).slice(2, 11)}`, folio: `Reembolso-${sale.folio}`, venta_relacionada_id: ventaId, subtipo: "reembolso_venta", sku: "REEMBOLSO", almacen_id: "devoluciones", tipo: "salida", cantidad: 1, unidades_devueltas: sale.total_unidades, referencia: `Devolución de ${sale.folio}: ${cleanReason}`, usuario: userEmail, fecha: now, estado: "activo", cliente_id: sale.cliente_id, cliente_nombre: sale.cliente_nombre, canal_venta: sale.canal_venta, canal_venta_nombre: sale.canal_venta_nombre, afecta_stock: false, venta_total_recibido: -sale.recibido, ingreso_reconocido: -sale.recibido, venta_subtotal: sale.subtotal, venta_total_cobrado: sale.total, envio_cobrado_cliente: sale.envio_cobrado_cliente, otros_cargos_cliente: sale.otros_cargos_cliente, total_venta: -sale.recibido, total_cobrado: -sale.recibido, metodo_pago: sale.metodo_pago_inicial });
    setLocalStorageItem("ventas_maestras", sales); setLocalStorageItem("stock", stock); setLocalStorageItem("resumen_ventas", summaries); setLocalStorageItem("movimientos", movements);
    notifyListeners("stock", stock); notifyListeners("movimientos", movements); clearFinanzasCache(); clearPeriodosFinancierosCache();
  },

  ensureProductExists: async (sku: string, nombre: string, categoria = "General", stockMinimo = 5, unidad = "uds"): Promise<Producto> => {
    const cleanSku = sku.trim().toUpperCase();
    const productData: Producto = { sku: cleanSku, nombre, categoria, stock_minimo: stockMinimo, unidad };
    if (isConfigured && realDb) {
      const docRef = doc(realDb, "productos", cleanSku);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        await setDoc(docRef, { nombre, categoria, stock_minimo: stockMinimo, unidad });
      }
      return productData;
    }
    const prods = getLocalStorageItem<Producto[]>("productos", []);
    const existing = prods.find(p => p.sku === cleanSku);
    if (!existing) {
      prods.push(productData);
      setLocalStorageItem("productos", prods);
    }
    return existing || productData;
  },

  // --- ATOMIC REAL-TIME STOCK ---
  getStockRealtime: (onUpdate: (stock: StockItem[]) => void, onError?: (error: any) => void): (() => void) => {
    if (isConfigured && realDb) {
      return onSnapshot(
        collection(realDb, "stock"),
        (snap) => {
          const list: StockItem[] = [];
          snap.forEach(d => {
            const data = d.data();
            list.push({
              id: d.id,
              sku: data.sku,
              almacen_id: data.almacen_id,
              cantidad: Number(data.cantidad) || 0,
              actualizado: data.actualizado ? (data.actualizado as Timestamp).toDate() : new Date()
            });
          });
          onUpdate(list);
        },
        (error) => {
          console.error("Error en listener de stock:", error);
          onUpdate([]);
          if (onError) onError(error);
        }
      );
    }

    const update = () => {
      const stockMap = getLocalStorageItem<Record<string, StockItem>>("stock", {});
      onUpdate(Object.values(stockMap));
    };

    update();
    listeners.stock.push(update);
    return () => {
      listeners.stock = listeners.stock.filter(cb => cb !== update);
    };
  },

  getFolioPrefix: (tipo: Movimiento["tipo"]): string => {
    switch (tipo) {
      case "entrada":
        return "Entrada-";
      case "salida":
        return "Salida-";
      case "transferencia":
        return "Transferencia-";
      case "ajuste":
        return "Ajuste-";
      default:
        return "Movimiento-";
    }
  },

  getNextLocalFolio: (tipo: Movimiento["tipo"]): string => {
    const prefix = firestoreService.getFolioPrefix(tipo);
    const counters = getLocalStorageItem<Record<string, number>>("contadores_movimientos", {
      entrada: 0,
      salida: 0,
      transferencia: 0,
      ajuste: 0
    });

    const currentCount = counters[tipo] || 0;
    const nextNumber = currentCount + 1;
    counters[tipo] = nextNumber;
    setLocalStorageItem("contadores_movimientos", counters);

    return `${prefix}${nextNumber}`;
  },

  // --- REGISTRO ATÓMICO DE MOVIMIENTO VÍA RUNTRANSACTION ---
  registerMovimientoTransaction: async (mov: Omit<Movimiento, "fecha" | "usuario">): Promise<{ id: string; folio: string }> => {
    const user = authService.getCurrentUser();
    const usuarioEmail = user ? user.email : "sistema@empresa.com";
    const prefix = firestoreService.getFolioPrefix(mov.tipo);
    const cleanSku = mov.sku.trim().toUpperCase();
    const originAlmId = mov.almacen_id.trim();
    const destAlmId = mov.almacen_destino_id ? mov.almacen_destino_id.trim() : undefined;
    const moveQty = Number(mov.cantidad);

    if (isNaN(moveQty) || moveQty <= 0) {
      throw new Error("La cantidad debe ser un número positivo mayor a cero.");
    }

    if (!cleanSku) {
      throw new Error("El SKU del producto es obligatorio.");
    }

    if (!originAlmId) {
      throw new Error("El almacén de origen es obligatorio.");
    }

    // Fecha local YYYY-MM-DD para resúmenes de ventas
    const now = new Date();
    const todayStr = getLocalDateString(now);

    if (isConfigured && realDb) {
      // EN MODO FIREBASE: Ejecución 100% transaccional en la nube.
      // Si falla, el error se propaga hacia arriba y NUNCA se escribe en localStorage.
      const counterDocRef = doc(realDb, "contadores", mov.tipo);
      const movRef = doc(collection(realDb, "movimientos"));
      const docId = movRef.id;

      const originStockKey = `${cleanSku}_${originAlmId}`;
      const originStockRef = doc(realDb, "stock", originStockKey);

      const destStockKey = destAlmId ? `${cleanSku}_${destAlmId}` : null;
      const destStockRef = destStockKey ? doc(realDb, "stock", destStockKey) : null;

      // Resumen de ventas para salidas
      const summaryKey = `${todayStr}_${cleanSku}_${originAlmId}`;
      const resumenDocRef = mov.tipo === "salida" ? doc(realDb, "resumen_ventas", summaryKey) : null;

      // Índice de periodos financieros para ventas
      const periodoKey = mov.tipo === "salida" ? getPeriodoKey(now) : null;
      const periodRef = (mov.tipo === "salida" && periodoKey) ? doc(realDb, "periodos_financieros", periodoKey) : null;

      let generatedFolio = "";

      await runTransaction(realDb, async (transaction) => {
        // 1. Lectura del contador de folios
        const counterSnap = await transaction.get(counterDocRef);
        let nextNumber = 1;
        if (counterSnap.exists()) {
          const data = counterSnap.data();
          if (typeof data?.ultimo_consecutivo === "number") {
            nextNumber = data.ultimo_consecutivo + 1;
          }
        }
        generatedFolio = `${prefix}${nextNumber}`;

        // 2. Lectura del stock de origen
        const originStockSnap = await transaction.get(originStockRef);
        const currentOriginQty = originStockSnap.exists() ? (Number(originStockSnap.data()?.cantidad) || 0) : 0;

        let newOriginQty = currentOriginQty;
        let newDestQty = 0;

        // 3. Procesamiento y validación de stock
        if (mov.tipo === "entrada") {
          newOriginQty = currentOriginQty + moveQty;
        } else if (mov.tipo === "salida") {
          if (currentOriginQty < moveQty) {
            throw new Error(`Stock insuficiente en el almacén seleccionado. Stock disponible: ${currentOriginQty} uds, solicitado: ${moveQty} uds.`);
          }
          newOriginQty = currentOriginQty - moveQty;
        } else if (mov.tipo === "transferencia") {
          if (!destStockRef || !destAlmId) {
            throw new Error("El almacén de destino es obligatorio para realizar una transferencia.");
          }
          if (originAlmId === destAlmId) {
            throw new Error("El almacén de origen y destino no pueden ser iguales.");
          }
          if (currentOriginQty < moveQty) {
            throw new Error(`Stock insuficiente en el almacén de origen. Stock disponible: ${currentOriginQty} uds, solicitado: ${moveQty} uds.`);
          }

          const destStockSnap = await transaction.get(destStockRef);
          const currentDestQty = destStockSnap.exists() ? (Number(destStockSnap.data()?.cantidad) || 0) : 0;

          newOriginQty = currentOriginQty - moveQty;
          newDestQty = currentDestQty + moveQty;

          // Escritura de stock en destino
          transaction.set(destStockRef, {
            id: destStockKey,
            sku: cleanSku,
            almacen_id: destAlmId,
            cantidad: newDestQty,
            actualizado: Timestamp.now()
          }, { merge: true });
        }

        // 4. Lectura de resumen de ventas e índice de periodos si es salida
        let prevResumenQty = 0;
        let prevResumenTotal = 0;
        if (mov.tipo === "salida" && resumenDocRef) {
          const resumenSnap = await transaction.get(resumenDocRef);
          prevResumenQty = resumenSnap.exists() ? (Number(resumenSnap.data()?.cantidad) || 0) : 0;
          prevResumenTotal = resumenSnap.exists() ? (Number(resumenSnap.data()?.total_transacciones) || 0) : 0;
        }

        const periodSnap = periodRef ? await transaction.get(periodRef) : null;

        if (mov.tipo === "salida" && resumenDocRef) {
          transaction.set(resumenDocRef, {
            id: summaryKey,
            fecha_str: todayStr,
            fecha: Timestamp.now(),
            sku: cleanSku,
            almacen_id: originAlmId,
            cantidad: prevResumenQty + moveQty,
            total_transacciones: prevResumenTotal + 1,
            actualizado: Timestamp.now()
          }, { merge: true });
        }

        // 5. Escritura de stock en origen
        transaction.set(originStockRef, {
          id: originStockKey,
          sku: cleanSku,
          almacen_id: originAlmId,
          cantidad: newOriginQty,
          actualizado: Timestamp.now()
        }, { merge: true });

        // 6. Actualización del contador secuencial
        transaction.set(counterDocRef, {
          tipo: mov.tipo,
          ultimo_consecutivo: nextNumber,
          actualizado: Timestamp.now()
        }, { merge: true });

        // 7. Escritura del documento de movimiento
        transaction.set(movRef, {
          folio: generatedFolio,
          sku: cleanSku,
          almacen_id: originAlmId,
          tipo: mov.tipo,
          cantidad: moveQty,
          referencia: mov.referencia,
          usuario: usuarioEmail,
          fecha: Timestamp.now(),
          estado: "activo",
          ...(mov.compra_id ? { compra_id: mov.compra_id } : {}),
          ...(mov.lote_id ? { lote_id: mov.lote_id } : {}),
          ...(typeof mov.costo_unitario === "number" ? { costo_unitario: mov.costo_unitario } : {}),
          ...(mov.cliente_id ? { cliente_id: mov.cliente_id } : {}),
          ...(mov.cliente_nombre ? { cliente_nombre: mov.cliente_nombre } : {}),
          ...(mov.cliente_tipo ? { cliente_tipo: mov.cliente_tipo } : {}),
          ...(typeof mov.precio_unitario_venta === "number" ? { precio_unitario_venta: mov.precio_unitario_venta } : {}),
          ...(typeof mov.total_venta === "number" ? { total_venta: mov.total_venta } : {}),
          ...(typeof mov.envio_cobrado_cliente === "number" ? { envio_cobrado_cliente: mov.envio_cobrado_cliente } : {}),
          ...(typeof mov.otros_cargos_cliente === "number" ? { otros_cargos_cliente: mov.otros_cargos_cliente } : {}),
          ...(mov.concepto_otros_cargos ? { concepto_otros_cargos: mov.concepto_otros_cargos } : {}),
          ...(typeof mov.costo_envio_venta === "number" ? { costo_envio_venta: mov.costo_envio_venta } : {}),
          ...(typeof mov.otros_costos_venta === "number" ? { otros_costos_venta: mov.otros_costos_venta } : {}),
          ...(mov.concepto_otros_costos ? { concepto_otros_costos: mov.concepto_otros_costos } : {}),
          ...(typeof mov.total_cobrado === "number" ? { total_cobrado: mov.total_cobrado } : {}),
          ...(typeof mov.total_costos_venta === "number" ? { total_costos_venta: mov.total_costos_venta } : {}),
          ...(mov.comentarios_venta ? { comentarios_venta: mov.comentarios_venta } : {}),
          ...(destAlmId ? { almacen_destino_id: destAlmId } : {})
        });

        // 8. Actualización atómica del índice de periodos financieros si es venta
        if (periodRef && periodoKey) {
          const updatedPeriod = computeNewPeriodIndexData(
            periodSnap?.exists() ? periodSnap.data() : null,
            periodoKey,
            1,
            0,
            0
          );
          transaction.set(periodRef, updatedPeriod, { merge: true });
        }
      });

      clearFinanzasCache();
      clearPeriodosFinancierosCache();
      return { id: docId, folio: generatedFolio };
    }

    // --- MODO EMULADOR LOCAL (SOLO CUANDO FIREBASE NO ESTÁ CONFIGURADO) ---
    const stockMap = getLocalStorageItem<Record<string, StockItem>>("stock", {});
    const originKey = `${cleanSku}_${originAlmId}`;
    const currentOrigin = stockMap[originKey]?.cantidad || 0;

    if (mov.tipo === "salida" && currentOrigin < moveQty) {
      throw new Error(`Stock insuficiente en el almacén seleccionado. Stock disponible: ${currentOrigin} uds, solicitado: ${moveQty} uds.`);
    }

    if (mov.tipo === "transferencia") {
      if (!destAlmId) throw new Error("El almacén de destino es obligatorio para transferencias.");
      if (originAlmId === destAlmId) throw new Error("El almacén de origen y destino no pueden ser iguales.");
      if (currentOrigin < moveQty) {
        throw new Error(`Stock insuficiente en el almacén de origen. Stock disponible: ${currentOrigin} uds, solicitado: ${moveQty} uds.`);
      }
    }

    const generatedFolio = firestoreService.getNextLocalFolio(mov.tipo);
    const docId = "mov_" + Math.random().toString(36).substr(2, 9);

    if (mov.tipo === "entrada") {
      stockMap[originKey] = {
        id: originKey,
        sku: cleanSku,
        almacen_id: originAlmId,
        cantidad: currentOrigin + moveQty,
        actualizado: new Date()
      };
    } else if (mov.tipo === "salida") {
      stockMap[originKey] = {
        id: originKey,
        sku: cleanSku,
        almacen_id: originAlmId,
        cantidad: currentOrigin - moveQty,
        actualizado: new Date()
      };

      // Actualizar resumen incremental local
      const summaryMap = getLocalStorageItem<Record<string, ResumenVentaDiaria>>("resumen_ventas", {});
      const summaryKey = `${todayStr}_${cleanSku}_${originAlmId}`;
      const prev = summaryMap[summaryKey];
      summaryMap[summaryKey] = {
        id: summaryKey,
        fecha_str: todayStr,
        fecha: new Date(),
        sku: cleanSku,
        almacen_id: originAlmId,
        cantidad: (prev?.cantidad || 0) + moveQty,
        total_transacciones: (prev?.total_transacciones || 0) + 1,
        actualizado: new Date()
      };
      setLocalStorageItem("resumen_ventas", summaryMap);
    } else if (mov.tipo === "transferencia" && destAlmId) {
      const destKey = `${cleanSku}_${destAlmId}`;
      const currentDest = stockMap[destKey]?.cantidad || 0;

      stockMap[originKey] = {
        id: originKey,
        sku: cleanSku,
        almacen_id: originAlmId,
        cantidad: currentOrigin - moveQty,
        actualizado: new Date()
      };

      stockMap[destKey] = {
        id: destKey,
        sku: cleanSku,
        almacen_id: destAlmId,
        cantidad: currentDest + moveQty,
        actualizado: new Date()
      };
    }

    setLocalStorageItem("stock", stockMap);
    notifyListeners("stock", stockMap);

    const movimientos = getLocalStorageItem<Movimiento[]>("movimientos", []);
    const nuevoMovimiento: Movimiento = {
      id: docId,
      folio: generatedFolio,
      sku: cleanSku,
      almacen_id: originAlmId,
      tipo: mov.tipo,
      cantidad: moveQty,
      referencia: mov.referencia,
      usuario: usuarioEmail,
      fecha: new Date(),
      estado: "activo",
      ...(mov.compra_id ? { compra_id: mov.compra_id } : {}),
      ...(mov.lote_id ? { lote_id: mov.lote_id } : {}),
      ...(typeof mov.costo_unitario === "number" ? { costo_unitario: mov.costo_unitario } : {}),
      ...(mov.cliente_id ? { cliente_id: mov.cliente_id } : {}),
      ...(mov.cliente_nombre ? { cliente_nombre: mov.cliente_nombre } : {}),
      ...(mov.cliente_tipo ? { cliente_tipo: mov.cliente_tipo } : {}),
      ...(typeof mov.precio_unitario_venta === "number" ? { precio_unitario_venta: mov.precio_unitario_venta } : {}),
      ...(typeof mov.total_venta === "number" ? { total_venta: mov.total_venta } : {}),
      ...(typeof mov.envio_cobrado_cliente === "number" ? { envio_cobrado_cliente: mov.envio_cobrado_cliente } : {}),
      ...(typeof mov.otros_cargos_cliente === "number" ? { otros_cargos_cliente: mov.otros_cargos_cliente } : {}),
      ...(mov.concepto_otros_cargos ? { concepto_otros_cargos: mov.concepto_otros_cargos } : {}),
      ...(typeof mov.costo_envio_venta === "number" ? { costo_envio_venta: mov.costo_envio_venta } : {}),
      ...(typeof mov.otros_costos_venta === "number" ? { otros_costos_venta: mov.otros_costos_venta } : {}),
      ...(mov.concepto_otros_costos ? { concepto_otros_costos: mov.concepto_otros_costos } : {}),
      ...(typeof mov.total_cobrado === "number" ? { total_cobrado: mov.total_cobrado } : {}),
      ...(typeof mov.total_costos_venta === "number" ? { total_costos_venta: mov.total_costos_venta } : {}),
      ...(mov.comentarios_venta ? { comentarios_venta: mov.comentarios_venta } : {}),
      ...(destAlmId ? { almacen_destino_id: destAlmId } : {})
    };

    movimientos.push(nuevoMovimiento);
    setLocalStorageItem("movimientos", movimientos);
    notifyListeners("movimientos", movimientos);

    clearFinanzasCache();
    clearPeriodosFinancierosCache();
    return { id: docId, folio: generatedFolio };
  },

  // --- ANULACIÓN ATÓMICA DE UNA VENTA CON VARIAS PARTIDAS ---
  anularVentaAgrupada: async (ventaId: string, motivo = "Anulado por el usuario"): Promise<void> => {
    const user = authService.getCurrentUser();
    const usuarioEmail = user ? user.email : "sistema@empresa.com";

    if (isConfigured && realDb) {
      const ventaQuery = query(
        collection(realDb, "movimientos"),
        where("venta_id", "==", ventaId)
      );
      const relatedQuery = query(collection(realDb, "movimientos"), where("venta_relacionada_id", "==", ventaId));
      const [ventaSnapshot, relatedSnapshot] = await Promise.all([getDocs(ventaQuery), getDocs(relatedQuery)]);
      if (ventaSnapshot.empty) {
        throw new Error("La venta que intentas anular no existe en el sistema.");
      }

      const movementRefs = [...ventaSnapshot.docs, ...relatedSnapshot.docs].map((movementDoc) => movementDoc.ref);
      const masterRef = doc(realDb, "ventas", ventaId);

      await runTransaction(realDb, async (transaction) => {
        const movementSnaps: any[] = [];
        for (const movementRef of movementRefs) {
          movementSnaps.push(await transaction.get(movementRef));
        }
        const masterSnap = await transaction.get(masterRef);

        const movementData = movementSnaps
          .map((snapshot, index) => ({ snapshot, ref: movementRefs[index] }))
          .filter(({ snapshot }) => snapshot.exists())
          .map(({ snapshot, ref }) => ({ ref, data: snapshot.data() }));
        const activeMovements = movementData.filter(({ data }) => data.estado !== "anulado");
        const hadPreviouslyCancelledItems = movementData.some(({ data }) => data.estado === "anulado");

        if (activeMovements.length === 0) {
          throw new Error("Esta venta ya ha sido anulada previamente.");
        }
        if (activeMovements.filter(({ data }) => data.venta_id === ventaId).some(({ data }) => data.tipo !== "salida")) {
          throw new Error("La agrupación contiene movimientos incompatibles y no puede anularse como venta.");
        }

        const saleItemMovements = activeMovements.filter(({ data }) => data.venta_id === ventaId && !data.subtipo);
        const principalMovement = saleItemMovements.find(({ data }) => data.venta_partida === 1)?.data || saleItemMovements[0]?.data;
        const receivedAmount = masterSnap.exists()
          ? Math.max(0, Number(masterSnap.data().recibido) || 0)
          : Math.max(0, Number(principalMovement?.ingreso_reconocido) || Number(principalMovement?.venta_total_recibido) || 0)
            + activeMovements
              .filter(({ data }) => data.venta_relacionada_id === ventaId && data.subtipo === "abono_venta")
              .reduce((sum, { data }) => sum + Math.max(0, Number(data.ingreso_reconocido) || 0), 0);
        const orderStatus = masterSnap.exists()
          ? masterSnap.data().estado_pedido
          : activeMovements.some(({ data }) => data.venta_relacionada_id === ventaId && data.subtipo === "seguimiento_pedido" && data.pedido_estado === "entregado")
            || principalMovement?.pedido_estado === "entregado"
            ? "entregado"
            : principalMovement?.pedido_estado;

        if (requiresSaleRefund(receivedAmount, orderStatus)) {
          throw new Error("Esta venta ya recibió dinero o fue entregada. Registra una devolución para reintegrar el inventario y dejar el reembolso en Finanzas.");
        }
        const inventoryMovements = saleItemMovements.filter(({ data }) => data.afecta_stock !== false);
        const stockEntries = inventoryMovements.map(({ data }) => {
          const sku = String(data.sku || "").trim().toUpperCase();
          const almacenId = String(data.almacen_id || "").trim();
          const key = `${sku}_${almacenId}`;
          return { sku, almacenId, key, ref: doc(realDb!, "stock", key), cantidad: Number(data.cantidad) || 0 };
        });
        const summaryEntries = saleItemMovements.map(({ data }) => {
          const sku = String(data.sku || "").trim().toUpperCase();
          const almacenId = String(data.almacen_id || "").trim();
          const fechaStr = getLocalDateString(data.fecha);
          const key = `${fechaStr}_${sku}_${almacenId}`;
          return { key, ref: doc(realDb!, "resumen_ventas", key), cantidad: Number(data.cantidad) || 0 };
        });
        const periodoKey = getPeriodoKey(saleItemMovements[0]?.data.fecha);
        const periodRef = periodoKey ? doc(realDb, "periodos_financieros", periodoKey) : null;

        const stockSnaps: any[] = [];
        for (const entry of stockEntries) stockSnaps.push(await transaction.get(entry.ref));
        const summarySnaps: any[] = [];
        for (const entry of summaryEntries) summarySnaps.push(await transaction.get(entry.ref));
        const periodSnap = periodRef ? await transaction.get(periodRef) : null;

        if (masterSnap.exists() && masterSnap.data().estado === "devuelto") {
          throw new Error("Una venta devuelta no puede anularse nuevamente.");
        }

        const cancellationTimestamp = Timestamp.now();
        activeMovements.forEach(({ ref }) => {
          transaction.update(ref, {
            estado: "anulado",
            anulado_at: cancellationTimestamp,
            anulado_por: usuarioEmail,
            motivo_anulacion: motivo
          });
        });
        if (masterSnap.exists()) {
          transaction.update(masterRef, {
            estado: "anulado",
            anulado_at: cancellationTimestamp,
            anulado_por: usuarioEmail,
            motivo_anulacion: motivo,
            actualizado_at: cancellationTimestamp
          });
        }

        stockEntries.forEach((entry, index) => {
          const currentQty = stockSnaps[index].exists()
            ? Number(stockSnaps[index].data()?.cantidad) || 0
            : 0;
          transaction.set(entry.ref, {
            id: entry.key,
            sku: entry.sku,
            almacen_id: entry.almacenId,
            cantidad: currentQty + entry.cantidad,
            actualizado: cancellationTimestamp
          }, { merge: true });

        });

        summaryEntries.forEach((entry, index) => {
          if (!summarySnaps[index].exists()) return;
          const previousQty = Number(summarySnaps[index].data()?.cantidad) || 0;
          const previousTransactions = Number(summarySnaps[index].data()?.total_transacciones) || 0;
          transaction.set(entry.ref, {
            cantidad: Math.max(0, previousQty - entry.cantidad),
            total_transacciones: Math.max(0, previousTransactions - 1),
            actualizado: cancellationTimestamp
          }, { merge: true });
        });

        if (periodRef && periodoKey && !hadPreviouslyCancelledItems) {
          const updatedPeriod = computeNewPeriodIndexData(
            periodSnap?.exists() ? periodSnap.data() : null,
            periodoKey,
            -1,
            0,
            0
          );
          transaction.set(periodRef, updatedPeriod, { merge: true });
        }
      });

      clearFinanzasCache();
      clearPeriodosFinancierosCache();
      return;
    }

    const movimientos = getLocalStorageItem<Movimiento[]>("movimientos", []);
    const existingMasterSale = getLocalStorageItem<Venta[]>("ventas_maestras", []).find(item => item.id === ventaId);
    if (existingMasterSale?.estado === "devuelto") throw new Error("Una venta devuelta no puede anularse nuevamente.");
    const groupedIndexes = movimientos
      .map((movement, index) => ({ movement, index }))
      .filter(({ movement }) => movement.venta_id === ventaId || movement.venta_relacionada_id === ventaId);
    const activeItems = groupedIndexes.filter(({ movement }) => movement.estado !== "anulado");

    if (groupedIndexes.length === 0) throw new Error("La venta no existe en el sistema.");
    if (activeItems.length === 0) throw new Error("Esta venta ya ha sido anulada previamente.");

    const saleItems = activeItems.filter(({ movement }) => movement.venta_id === ventaId && !movement.subtipo);
    const principalMovement = saleItems.find(({ movement }) => movement.venta_partida === 1)?.movement || saleItems[0]?.movement;
    const receivedAmount = existingMasterSale
      ? Math.max(0, Number(existingMasterSale.recibido) || 0)
      : Math.max(0, Number(principalMovement?.ingreso_reconocido) || Number(principalMovement?.venta_total_recibido) || 0)
        + activeItems
          .filter(({ movement }) => movement.venta_relacionada_id === ventaId && movement.subtipo === "abono_venta")
          .reduce((sum, { movement }) => sum + Math.max(0, Number(movement.ingreso_reconocido) || 0), 0);
    const orderStatus = existingMasterSale?.estado_pedido === "entregado"
      || activeItems.some(({ movement }) => movement.venta_relacionada_id === ventaId && movement.subtipo === "seguimiento_pedido" && movement.pedido_estado === "entregado")
      || principalMovement?.pedido_estado === "entregado"
      ? "entregado"
      : existingMasterSale?.estado_pedido || principalMovement?.pedido_estado;
    if (requiresSaleRefund(receivedAmount, orderStatus)) {
      throw new Error("Esta venta ya recibió dinero o fue entregada. Registra una devolución para reintegrar el inventario y dejar el reembolso en Finanzas.");
    }

    const stockMap = getLocalStorageItem<Record<string, StockItem>>("stock", {});
    const summaryMap = getLocalStorageItem<Record<string, ResumenVentaDiaria>>("resumen_ventas", {});
    const cancellationDate = new Date();

    activeItems.forEach(({ movement, index }) => {
      const sku = movement.sku.trim().toUpperCase();
      const isSaleItem = movement.venta_id === ventaId && !movement.subtipo;
      if (isSaleItem && movement.afecta_stock !== false) {
        const stockKey = `${sku}_${movement.almacen_id}`;
        const currentQty = stockMap[stockKey]?.cantidad || 0;
        stockMap[stockKey] = {
          id: stockKey,
          sku,
          almacen_id: movement.almacen_id,
          cantidad: currentQty + (Number(movement.cantidad) || 0),
          actualizado: cancellationDate
        };

      }

      const summaryKey = `${getLocalDateString(movement.fecha)}_${sku}_${movement.almacen_id}`;
      if (isSaleItem && summaryMap[summaryKey]) {
        summaryMap[summaryKey] = {
          ...summaryMap[summaryKey],
          cantidad: Math.max(0, summaryMap[summaryKey].cantidad - (Number(movement.cantidad) || 0)),
          total_transacciones: Math.max(0, summaryMap[summaryKey].total_transacciones - 1),
          actualizado: cancellationDate
        };
      }

      movimientos[index] = {
        ...movement,
        estado: "anulado",
        anulado_at: cancellationDate,
        anulado_por: usuarioEmail,
        motivo_anulacion: motivo
      };
    });

    const masterSales = getLocalStorageItem<Venta[]>("ventas_maestras", []);
    const masterIndex = masterSales.findIndex(item => item.id === ventaId);
    if (masterIndex >= 0) {
      masterSales[masterIndex] = {
        ...masterSales[masterIndex],
        estado: "anulado",
        anulado_at: cancellationDate,
        anulado_por: usuarioEmail,
        motivo_anulacion: motivo,
        actualizado_at: cancellationDate
      };
      setLocalStorageItem("ventas_maestras", masterSales);
    }

    setLocalStorageItem("stock", stockMap);
    setLocalStorageItem("resumen_ventas", summaryMap);
    setLocalStorageItem("movimientos", movimientos);
    notifyListeners("stock", stockMap);
    notifyListeners("movimientos", movimientos);
    clearFinanzasCache();
    clearPeriodosFinancierosCache();
  },

  // --- ANULACIÓN ATÓMICA DE MOVIMIENTO VÍA RUNTRANSACTION ---
  anularMovimiento: async (id: string, motivo = "Anulado por el usuario"): Promise<void> => {
    const user = authService.getCurrentUser();
    const usuarioEmail = user ? user.email : "sistema@empresa.com";

    if (isConfigured && realDb) {
      // EN MODO FIREBASE: Si falla o no hay stock para revertir, lanza el error y no toca localStorage
      const movRef = doc(realDb, "movimientos", id);
      const initialMovementSnap = await getDoc(movRef);
      if (!initialMovementSnap.exists()) {
        throw new Error("El movimiento que intentas anular no existe en el sistema.");
      }
      const initialMovementData = initialMovementSnap.data();
      if (initialMovementData.venta_id && Number(initialMovementData.venta_total_partidas) > 1) {
        return firestoreService.anularVentaAgrupada(initialMovementData.venta_id, motivo);
      }

      await runTransaction(realDb, async (transaction) => {
        // 1. Leer el movimiento
        const movSnap = await transaction.get(movRef);
        if (!movSnap.exists()) {
          throw new Error("El movimiento que intentas anular no existe en el sistema.");
        }

        const movData = movSnap.data();

        // 2. Validar que exista y no esté ya anulado
        if (movData.estado === "anulado") {
          throw new Error("Este movimiento ya ha sido anulado previamente. No se puede anular dos veces.");
        }

        const sku = (movData.sku || "").trim().toUpperCase();
        const originAlmId = movData.almacen_id;
        const destAlmId = movData.almacen_destino_id;
        const qty = Number(movData.cantidad) || 0;
        const tipo = movData.tipo;

        // 3. Construir las referencias necesarias según su tipo
        const originStockKey = `${sku}_${originAlmId}`;
        const originStockRef = doc(realDb, "stock", originStockKey);

        const destStockKey = (tipo === "transferencia" && destAlmId) ? `${sku}_${destAlmId}` : null;
        const destStockRef = destStockKey ? doc(realDb, "stock", destStockKey) : null;

        const dateStr = tipo === "salida" ? getLocalDateString(movData.fecha) : null;
        const summaryKey = (tipo === "salida" && dateStr) ? `${dateStr}_${sku}_${originAlmId}` : null;
        const resumenDocRef = summaryKey ? doc(realDb, "resumen_ventas", summaryKey) : null;

        const periodoKey = tipo === "salida" ? getPeriodoKey(movData.fecha) : null;
        const periodRef = (tipo === "salida" && periodoKey) ? doc(realDb, "periodos_financieros", periodoKey) : null;

        // 4. Leer el stock de origen
        const originSnap = await transaction.get(originStockRef);
        const currentOrigin = originSnap.exists() ? (Number(originSnap.data()?.cantidad) || 0) : 0;

        // 5. Si es transferencia, leer el stock de destino
        let destSnap: any = null;
        if (tipo === "transferencia") {
          if (!destAlmId || !destStockRef) {
            throw new Error("Datos de transferencia incompletos: falta almacén de destino.");
          }
          destSnap = await transaction.get(destStockRef);
        }

        // 6. Si es una venta, leer resumen_ventas
        let resumenSnap: any = null;
        if (tipo === "salida" && resumenDocRef) {
          resumenSnap = await transaction.get(resumenDocRef);
        }

        // 7. Si es una venta, leer el documento correspondiente de periodos_financieros
        let periodSnap: any = null;
        if (tipo === "salida" && periodRef) {
          periodSnap = await transaction.get(periodRef);
        }

        // 8. Completar todas las validaciones antes de cualquier escritura
        if (tipo === "entrada") {
          if (currentOrigin < qty) {
            throw new Error(`No se puede anular la entrada: el stock actual (${currentOrigin} uds) en el almacén es menor a la cantidad a revertir (${qty} uds).`);
          }
        } else if (tipo === "transferencia") {
          const currentDest = destSnap && destSnap.exists() ? (Number(destSnap.data()?.cantidad) || 0) : 0;
          if (currentDest < qty) {
            throw new Error(`No se puede anular la transferencia: el almacén de destino no tiene suficiente stock (${currentDest} uds) para devolver las ${qty} uds.`);
          }
        }

        // 9. Solamente después comenzar escrituras (cero lecturas a partir de aquí):

        // 9.1 Actualización de stock
        if (tipo === "entrada") {
          transaction.set(originStockRef, {
            id: originStockKey,
            sku,
            almacen_id: originAlmId,
            cantidad: currentOrigin - qty,
            actualizado: Timestamp.now()
          }, { merge: true });
        } else if (tipo === "salida") {
          transaction.set(originStockRef, {
            id: originStockKey,
            sku,
            almacen_id: originAlmId,
            cantidad: currentOrigin + qty,
            actualizado: Timestamp.now()
          }, { merge: true });
        } else if (tipo === "transferencia") {
          const currentDest = destSnap && destSnap.exists() ? (Number(destSnap.data()?.cantidad) || 0) : 0;
          transaction.set(originStockRef, {
            id: originStockKey,
            sku,
            almacen_id: originAlmId,
            cantidad: currentOrigin + qty,
            actualizado: Timestamp.now()
          }, { merge: true });

          transaction.set(destStockRef!, {
            id: destStockKey!,
            sku,
            almacen_id: destAlmId,
            cantidad: currentDest - qty,
            actualizado: Timestamp.now()
          }, { merge: true });
        }

        // 9.2 Actualización de resumen_ventas
        if (tipo === "salida" && resumenDocRef && resumenSnap && resumenSnap.exists()) {
          const prevQty = Number(resumenSnap.data()?.cantidad) || 0;
          const prevTotal = Number(resumenSnap.data()?.total_transacciones) || 0;
          transaction.set(resumenDocRef, {
            cantidad: Math.max(0, prevQty - qty),
            total_transacciones: Math.max(0, prevTotal - 1),
            actualizado: Timestamp.now()
          }, { merge: true });
        }

        // 9.3 Decremento del índice financiero
        if (tipo === "salida" && periodRef && periodoKey) {
          const updatedPeriod = computeNewPeriodIndexData(
            periodSnap?.exists() ? periodSnap.data() : null,
            periodoKey,
            -1,
            0,
            0
          );
          transaction.set(periodRef, updatedPeriod, { merge: true });
        }

        // 9.4 Actualización del movimiento a estado anulado
        transaction.update(movRef, {
          estado: "anulado",
          anulado_at: Timestamp.now(),
          anulado_por: usuarioEmail,
          motivo_anulacion: motivo
        });
      });

      clearFinanzasCache();
      clearPeriodosFinancierosCache();
      return;
    }

    // --- MODO EMULADOR LOCAL ---
    const movimientos = getLocalStorageItem<Movimiento[]>("movimientos", []);
    const movIndex = movimientos.findIndex(m => m.id === id);

    if (movIndex === -1) {
      throw new Error("El movimiento no existe en el sistema.");
    }

    const mov = movimientos[movIndex];
    if (mov.estado === "anulado") {
      throw new Error("Este movimiento ya ha sido anulado previamente. No se puede anular dos veces.");
    }
    if (mov.venta_id && Number(mov.venta_total_partidas) > 1) {
      return firestoreService.anularVentaAgrupada(mov.venta_id, motivo);
    }

    const sku = (mov.sku || "").trim().toUpperCase();
    const qty = Number(mov.cantidad) || 0;
    const stockMap = getLocalStorageItem<Record<string, StockItem>>("stock", {});
    const originKey = `${sku}_${mov.almacen_id}`;
    const currentOrigin = stockMap[originKey]?.cantidad || 0;

    if (mov.tipo === "entrada") {
      if (currentOrigin < qty) {
        throw new Error(`No se puede anular la entrada: el stock actual (${currentOrigin} uds) en el almacén es menor a la cantidad a revertir (${qty} uds).`);
      }
      stockMap[originKey] = {
        id: originKey,
        sku,
        almacen_id: mov.almacen_id,
        cantidad: currentOrigin - qty,
        actualizado: new Date()
      };
    } else if (mov.tipo === "salida") {
      stockMap[originKey] = {
        id: originKey,
        sku,
        almacen_id: mov.almacen_id,
        cantidad: currentOrigin + qty,
        actualizado: new Date()
      };

      // Descontar del resumen incremental
      const summaryMap = getLocalStorageItem<Record<string, ResumenVentaDiaria>>("resumen_ventas", {});
      const dateStr = getLocalDateString(mov.fecha);
      const summaryKey = `${dateStr}_${sku}_${mov.almacen_id}`;
      if (summaryMap[summaryKey]) {
        const prev = summaryMap[summaryKey];
        summaryMap[summaryKey] = {
          ...prev,
          cantidad: Math.max(0, prev.cantidad - qty),
          total_transacciones: Math.max(0, prev.total_transacciones - 1),
          actualizado: new Date()
        };
        setLocalStorageItem("resumen_ventas", summaryMap);
      }
    } else if (mov.tipo === "transferencia" && mov.almacen_destino_id) {
      const destKey = `${sku}_${mov.almacen_destino_id}`;
      const currentDest = stockMap[destKey]?.cantidad || 0;

      if (currentDest < qty) {
        throw new Error(`No se puede anular la transferencia: el almacén de destino no tiene suficiente stock (${currentDest} uds) para devolver las ${qty} uds.`);
      }

      stockMap[originKey] = {
        id: originKey,
        sku,
        almacen_id: mov.almacen_id,
        cantidad: currentOrigin + qty,
        actualizado: new Date()
      };

      stockMap[destKey] = {
        id: destKey,
        sku,
        almacen_id: mov.almacen_destino_id,
        cantidad: currentDest - qty,
        actualizado: new Date()
      };
    }

    setLocalStorageItem("stock", stockMap);
    notifyListeners("stock", stockMap);

    movimientos[movIndex] = {
      ...mov,
      estado: "anulado",
      anulado_at: new Date(),
      anulado_por: usuarioEmail,
      motivo_anulacion: motivo
    };

    setLocalStorageItem("movimientos", movimientos);
    notifyListeners("movimientos", movimientos);
    clearFinanzasCache();
    clearPeriodosFinancierosCache();
  },

  deleteMovimiento: async (id: string): Promise<void> => {
    await firestoreService.anularMovimiento(id, "Anulación directa de registro");
  },

  enviarMovimientoPapelera: async (id: string): Promise<void> => {
    if (!id) throw new Error("ID de movimiento no proporcionado.");
    if (isConfigured && realDb) {
      const initial = await getDoc(doc(realDb, "movimientos", id));
      if (!initial.exists()) throw new Error("El movimiento no existe.");
      const initialData = initial.data();
      if (initialData.compra_id) return firestoreService.enviarCompraPapelera(initialData.compra_id);
      const masterSaleSnap = initialData.venta_id ? await getDoc(doc(realDb, "ventas", initialData.venta_id)) : null;
      const isReturnedSale = masterSaleSnap?.exists() && masterSaleSnap.data().estado === "devuelto";
      const snapshots = initialData.venta_id
        ? (await Promise.all([
            getDocs(query(collection(realDb, "movimientos"), where("venta_id", "==", initialData.venta_id))),
            getDocs(query(collection(realDb, "movimientos"), where("venta_relacionada_id", "==", initialData.venta_id)))
          ])).flatMap(result => result.docs)
        : [initial];
      const periodoDescontado = !isReturnedSale && snapshots.length > 0
        && snapshots.every(snapshot => snapshot.data().estado !== "anulado")
        && snapshots.some(snapshot => snapshot.data().tipo === "salida");
      if (!isReturnedSale && initialData.estado !== "anulado") await firestoreService.anularMovimiento(id, "Movimiento enviado a Papelera");
      const batch = writeBatch(realDb);
      snapshots.forEach(snapshot => batch.set(snapshot.ref, {
        en_papelera: true,
        desactivado_at: Timestamp.now(),
        estado_antes_papelera: isReturnedSale || snapshot.data().estado === "anulado" ? "anulado" : "activo",
        periodo_descontado_papelera: periodoDescontado
      }, { merge: true }));
      if (initialData.venta_id) {
        batch.set(doc(realDb, "ventas", initialData.venta_id), {
          en_papelera: true,
          desactivado_at: Timestamp.now(),
          estado_antes_papelera: masterSaleSnap?.exists() ? masterSaleSnap.data().estado || "activo" : "activo"
        }, { merge: true });
      }
      await batch.commit();
      return;
    }
    const movimientos = getLocalStorageItem<Movimiento[]>("movimientos", []);
    const selected = movimientos.find(movimiento => movimiento.id === id);
    if (!selected) throw new Error("El movimiento no existe.");
    if (selected.compra_id) return firestoreService.enviarCompraPapelera(selected.compra_id);
    const localMasterSales = getLocalStorageItem<Venta[]>("ventas_maestras", []);
    const localMasterSale = selected.venta_id ? localMasterSales.find(item => item.id === selected.venta_id) : undefined;
    const isReturnedSale = localMasterSale?.estado === "devuelto";
    const previousTargets = movimientos.filter(movimiento => movimiento.id === id || (selected.venta_id && (movimiento.venta_id === selected.venta_id || movimiento.venta_relacionada_id === selected.venta_id)));
    const previousState = new Map<string | undefined, "activo" | "anulado">(
      previousTargets.map(movimiento => [movimiento.id, movimiento.estado === "anulado" ? "anulado" : "activo"])
    );
    const periodoDescontado = !isReturnedSale && previousTargets.length > 0 && previousTargets.every(movimiento => movimiento.estado !== "anulado") && previousTargets.some(movimiento => movimiento.tipo === "salida");
    if (!isReturnedSale && selected.estado !== "anulado") await firestoreService.anularMovimiento(id, "Movimiento enviado a Papelera");
    const updated = getLocalStorageItem<Movimiento[]>("movimientos", []);
    const now = new Date();
    updated.forEach((movimiento, index) => {
      if (movimiento.id === id || (selected.venta_id && (movimiento.venta_id === selected.venta_id || movimiento.venta_relacionada_id === selected.venta_id))) updated[index] = {
        ...movimiento,
        en_papelera: true,
        desactivado_at: now,
        estado_antes_papelera: isReturnedSale ? "anulado" : previousState.get(movimiento.id) || "activo",
        periodo_descontado_papelera: periodoDescontado
      };
    });
    setLocalStorageItem("movimientos", updated);
    if (selected.venta_id) {
      const masterSales = getLocalStorageItem<Venta[]>("ventas_maestras", []);
      const masterIndex = masterSales.findIndex(item => item.id === selected.venta_id);
      if (masterIndex >= 0) {
        masterSales[masterIndex] = { ...masterSales[masterIndex], en_papelera: true, desactivado_at: now, estado_antes_papelera: localMasterSale?.estado || "activo" };
        setLocalStorageItem("ventas_maestras", masterSales);
      }
    }
    notifyListeners("movimientos", updated);
  },

  enviarVentaPapelera: async (ventaId: string): Promise<void> => {
    if (!ventaId) throw new Error("ID de venta no proporcionado.");
    if (isConfigured && realDb) {
      const snapshot = await getDocs(query(collection(realDb, "movimientos"), where("venta_id", "==", ventaId), limit(1)));
      if (snapshot.empty) throw new Error("No se encontraron las partidas de la venta.");
      return firestoreService.enviarMovimientoPapelera(snapshot.docs[0].id);
    }
    const movement = getLocalStorageItem<Movimiento[]>("movimientos", []).find(item => item.venta_id === ventaId);
    if (!movement?.id) throw new Error("No se encontraron las partidas de la venta.");
    return firestoreService.enviarMovimientoPapelera(movement.id);
  },

  restaurarMovimientoPapelera: async (id: string): Promise<void> => {
    if (!id) throw new Error("ID de movimiento no proporcionado.");
    if (isConfigured && realDb) {
      const initial = await getDoc(doc(realDb, "movimientos", id));
      if (!initial.exists()) throw new Error("El movimiento no existe.");
      const initialData = initial.data();
      if (initialData.compra_id) return firestoreService.restaurarCompraPapelera(initialData.compra_id);
      const refs = initialData.venta_id
        ? (await Promise.all([
            getDocs(query(collection(realDb, "movimientos"), where("venta_id", "==", initialData.venta_id))),
            getDocs(query(collection(realDb, "movimientos"), where("venta_relacionada_id", "==", initialData.venta_id)))
          ])).flatMap(result => result.docs.map(item => item.ref))
        : [doc(realDb, "movimientos", id)];
      const masterRef = initialData.venta_id ? doc(realDb, "ventas", initialData.venta_id) : null;

      await runTransaction(realDb, async transaction => {
        const movementSnaps: any[] = [];
        for (const ref of refs) movementSnaps.push(await transaction.get(ref));
        const masterSnap = masterRef ? await transaction.get(masterRef) : null;
        const activeTargets = movementSnaps.filter(snapshot => snapshot.exists() && snapshot.data().en_papelera === true);
        if (activeTargets.length === 0) throw new Error("El movimiento ya está activo.");
        const restorableTargets = activeTargets.filter(snapshot => snapshot.data().estado_antes_papelera !== "anulado");

        const stockDeltas = new Map<string, { sku: string; almacenId: string; delta: number; ref: any }>();
        const addDelta = (sku: string, almacenId: string, delta: number) => {
          const key = `${sku}_${almacenId}`;
          const current = stockDeltas.get(key);
          stockDeltas.set(key, { sku, almacenId, delta: (current?.delta || 0) + delta, ref: doc(realDb!, "stock", key) });
        };
        restorableTargets.forEach(snapshot => {
          const data = snapshot.data();
          const sku = String(data.sku || "").trim().toUpperCase();
          const qty = Number(data.cantidad) || 0;
          if (data.tipo === "salida" && data.afecta_stock !== false) addDelta(sku, data.almacen_id, -qty);
          if (data.tipo === "entrada") addDelta(sku, data.almacen_id, qty);
          if (data.tipo === "transferencia") {
            addDelta(sku, data.almacen_id, -qty);
            if (!data.almacen_destino_id) throw new Error("La transferencia no tiene almacén de destino.");
            addDelta(sku, data.almacen_destino_id, qty);
          }
        });
        const stockEntries = [...stockDeltas.values()];
        const stockSnaps: any[] = [];
        for (const entry of stockEntries) stockSnaps.push(await transaction.get(entry.ref));
        stockEntries.forEach((entry, index) => {
          const currentQty = stockSnaps[index].exists() ? Number(stockSnaps[index].data()?.cantidad) || 0 : 0;
          if (currentQty + entry.delta < 0) throw new Error(`No hay stock suficiente de ${entry.sku} para reactivar la operación.`);
        });

        const saleTargets = restorableTargets.filter(snapshot => snapshot.data().tipo === "salida" && !snapshot.data().subtipo && String(snapshot.data().sku || "").toUpperCase() !== "ABONO");
        const summaryEntries = saleTargets.map(snapshot => {
          const data = snapshot.data();
          const sku = String(data.sku || "").trim().toUpperCase();
          const key = `${getLocalDateString(data.fecha)}_${sku}_${data.almacen_id}`;
          return { ref: doc(realDb!, "resumen_ventas", key), sku, almacenId: data.almacen_id, fecha: data.fecha, fechaStr: getLocalDateString(data.fecha), qty: Number(data.cantidad) || 0 };
        });
        const summarySnaps: any[] = [];
        for (const entry of summaryEntries) summarySnaps.push(await transaction.get(entry.ref));
        const restorePeriodCount = saleTargets.some(snapshot => snapshot.data().periodo_descontado_papelera === true);
        const periodoKey = restorePeriodCount ? getPeriodoKey(saleTargets[0].data().fecha) : null;
        const periodRef = periodoKey ? doc(realDb, "periodos_financieros", periodoKey) : null;
        const periodSnap = periodRef ? await transaction.get(periodRef) : null;
        const now = Timestamp.now();

        stockEntries.forEach((entry, index) => {
          const currentQty = stockSnaps[index].exists() ? Number(stockSnaps[index].data()?.cantidad) || 0 : 0;
          transaction.set(entry.ref, { id: `${entry.sku}_${entry.almacenId}`, sku: entry.sku, almacen_id: entry.almacenId, cantidad: currentQty + entry.delta, actualizado: now }, { merge: true });
        });
        summaryEntries.forEach((entry, index) => {
          const currentQty = summarySnaps[index].exists() ? Number(summarySnaps[index].data()?.cantidad) || 0 : 0;
          const currentTransactions = summarySnaps[index].exists() ? Number(summarySnaps[index].data()?.total_transacciones) || 0 : 0;
          transaction.set(entry.ref, { fecha_str: entry.fechaStr, fecha: entry.fecha, sku: entry.sku, almacen_id: entry.almacenId, cantidad: currentQty + entry.qty, total_transacciones: currentTransactions + 1, actualizado: now }, { merge: true });
        });
        activeTargets.forEach(snapshot => {
          const wasCancelled = snapshot.data().estado_antes_papelera === "anulado";
          transaction.update(snapshot.ref, wasCancelled
            ? { en_papelera: false, desactivado_at: deleteField(), estado_antes_papelera: deleteField(), periodo_descontado_papelera: deleteField() }
            : { estado: "activo", anulado_at: deleteField(), anulado_por: deleteField(), motivo_anulacion: deleteField(), en_papelera: false, desactivado_at: deleteField(), estado_antes_papelera: deleteField(), periodo_descontado_papelera: deleteField() });
        });
        if (masterRef && masterSnap?.exists()) {
          const previousMasterState = masterSnap.data().estado_antes_papelera || masterSnap.data().estado;
          transaction.update(masterRef, previousMasterState === "anulado" || previousMasterState === "devuelto"
            ? { en_papelera: false, desactivado_at: deleteField(), estado_antes_papelera: deleteField(), actualizado_at: now }
            : { estado: "activo", en_papelera: false, desactivado_at: deleteField(), estado_antes_papelera: deleteField(), anulado_at: deleteField(), anulado_por: deleteField(), motivo_anulacion: deleteField(), actualizado_at: now });
        }
        if (periodRef && periodoKey) transaction.set(periodRef, computeNewPeriodIndexData(periodSnap?.exists() ? periodSnap.data() : null, periodoKey, 1, 0, 0), { merge: true });
      });
      clearFinanzasCache(); clearPeriodosFinancierosCache();
      return;
    }

    const movimientos = getLocalStorageItem<Movimiento[]>("movimientos", []);
    const selected = movimientos.find(movimiento => movimiento.id === id);
    if (!selected) throw new Error("El movimiento no existe.");
    if (selected.compra_id) return firestoreService.restaurarCompraPapelera(selected.compra_id);
    const targets = movimientos.filter(movimiento => movimiento.id === id || (selected.venta_id && (movimiento.venta_id === selected.venta_id || movimiento.venta_relacionada_id === selected.venta_id)));
    const restorableTargets = targets.filter(movimiento => movimiento.estado_antes_papelera !== "anulado");
    const stockMap = getLocalStorageItem<Record<string, StockItem>>("stock", {});
    const summaryMap = getLocalStorageItem<Record<string, ResumenVentaDiaria>>("resumen_ventas", {});
    restorableTargets.forEach(movimiento => {
      const sku = movimiento.sku.trim().toUpperCase();
      const qty = Number(movimiento.cantidad) || 0;
      const originKey = `${sku}_${movimiento.almacen_id}`;
      const originQty = stockMap[originKey]?.cantidad || 0;
      if (((movimiento.tipo === "salida" && movimiento.afecta_stock !== false) || movimiento.tipo === "transferencia") && originQty < qty) throw new Error(`No hay stock suficiente de ${sku} para restaurar la operación.`);
    });
    const now = new Date();
    targets.forEach(target => {
      const index = movimientos.findIndex(movimiento => movimiento.id === target.id);
      const wasCancelled = target.estado_antes_papelera === "anulado";
      if (wasCancelled) {
        const restoredCancelled = { ...target, en_papelera: false };
        delete restoredCancelled.desactivado_at; delete restoredCancelled.estado_antes_papelera; delete restoredCancelled.periodo_descontado_papelera;
        movimientos[index] = restoredCancelled;
        return;
      }
      const sku = target.sku.trim().toUpperCase();
      const qty = Number(target.cantidad) || 0;
      const originKey = `${sku}_${target.almacen_id}`;
      const originQty = stockMap[originKey]?.cantidad || 0;
      if (target.tipo === "salida" && target.afecta_stock !== false) stockMap[originKey] = { ...(stockMap[originKey] || { id: originKey, sku, almacen_id: target.almacen_id }), cantidad: originQty - qty, actualizado: now } as StockItem;
      if (target.tipo === "entrada") stockMap[originKey] = { ...(stockMap[originKey] || { id: originKey, sku, almacen_id: target.almacen_id }), cantidad: originQty + qty, actualizado: now } as StockItem;
      if (target.tipo === "transferencia" && target.almacen_destino_id) {
        const destKey = `${sku}_${target.almacen_destino_id}`;
        stockMap[originKey] = { ...stockMap[originKey], cantidad: originQty - qty, actualizado: now };
        stockMap[destKey] = { ...(stockMap[destKey] || { id: destKey, sku, almacen_id: target.almacen_destino_id }), cantidad: (stockMap[destKey]?.cantidad || 0) + qty, actualizado: now } as StockItem;
      }
      if (target.tipo === "salida" && !target.subtipo) {
        const summaryKey = `${getLocalDateString(target.fecha)}_${sku}_${target.almacen_id}`;
        const previous = summaryMap[summaryKey];
        summaryMap[summaryKey] = { id: summaryKey, fecha_str: getLocalDateString(target.fecha), fecha: target.fecha, sku, almacen_id: target.almacen_id, cantidad: (previous?.cantidad || 0) + qty, total_transacciones: (previous?.total_transacciones || 0) + 1, actualizado: now };
      }
      const restored = { ...target, estado: "activo" as const, en_papelera: false };
      delete restored.anulado_at; delete restored.anulado_por; delete restored.motivo_anulacion; delete restored.desactivado_at; delete restored.estado_antes_papelera; delete restored.periodo_descontado_papelera;
      movimientos[index] = restored;
    });
    setLocalStorageItem("stock", stockMap); setLocalStorageItem("resumen_ventas", summaryMap); setLocalStorageItem("movimientos", movimientos);
    if (selected.venta_id) {
      const masterSales = getLocalStorageItem<Venta[]>("ventas_maestras", []);
      const masterIndex = masterSales.findIndex(item => item.id === selected.venta_id);
      if (masterIndex >= 0) {
        const previousState = masterSales[masterIndex].estado_antes_papelera || masterSales[masterIndex].estado;
        const preservedState = previousState === "anulado" || previousState === "devuelto";
        masterSales[masterIndex] = { ...masterSales[masterIndex], estado: preservedState ? previousState : "activo", en_papelera: false, actualizado_at: now };
        delete masterSales[masterIndex].estado_antes_papelera;
        delete masterSales[masterIndex].desactivado_at;
        if (!preservedState) {
          delete masterSales[masterIndex].anulado_at; delete masterSales[masterIndex].anulado_por; delete masterSales[masterIndex].motivo_anulacion;
        }
        setLocalStorageItem("ventas_maestras", masterSales);
      }
    }
    notifyListeners("stock", stockMap); notifyListeners("movimientos", movimientos);
    clearFinanzasCache(); clearPeriodosFinancierosCache();
  },

  // --- HISTORIAL PAGINADO DE AUDITORÍA (50 EN 50) ---
  getMovimientosPaginated: async (options: {
    pageSize?: number;
    lastDoc?: any;
    skuFilter?: string;
    warehouseFilter?: string;
    tipoFilter?: string;
    estadoFilter?: string;
  } = {}): Promise<{
    items: Movimiento[];
    lastDoc: any;
    hasMore: boolean;
    totalLoaded: number;
  }> => {
    const pageSize = options.pageSize || 50;

    if (isConfigured && realDb) {
      try {
        let qConstraints: any[] = [orderBy("fecha", "desc"), limit(pageSize + 1)];

        if (options.skuFilter) {
          qConstraints.unshift(where("sku", "==", options.skuFilter.trim().toUpperCase()));
        }
        if (options.warehouseFilter && options.warehouseFilter !== "all") {
          qConstraints.unshift(where("almacen_id", "==", options.warehouseFilter));
        }
        if (options.tipoFilter && options.tipoFilter !== "all") {
          qConstraints.unshift(where("tipo", "==", options.tipoFilter));
        }
        if (options.estadoFilter && options.estadoFilter !== "all") {
          qConstraints.unshift(where("estado", "==", options.estadoFilter));
        }

        if (options.lastDoc) {
          qConstraints.push(startAfter(options.lastDoc));
        }

        const q = query(collection(realDb, "movimientos"), ...qConstraints);
        const snap = await getDocs(q);

        const docs = snap.docs;
        const hasMore = docs.length > pageSize;
        const itemsToProcess = hasMore ? docs.slice(0, pageSize) : docs;
        const nextLastDoc = itemsToProcess.length > 0 ? itemsToProcess[itemsToProcess.length - 1] : null;

        const list: Movimiento[] = itemsToProcess.filter(d => d.data().en_papelera !== true).map(d => {
          const data = d.data();
          return {
            id: d.id,
            folio: data.folio,
            venta_id: data.venta_id,
            venta_relacionada_id: data.venta_relacionada_id || undefined,
            subtipo: data.subtipo || undefined,
            venta_partida: typeof data.venta_partida === "number" ? data.venta_partida : undefined,
            venta_total_partidas: typeof data.venta_total_partidas === "number" ? data.venta_total_partidas : undefined,
            venta_subtotal: typeof data.venta_subtotal === "number" ? data.venta_subtotal : undefined,
            venta_total_cobrado: typeof data.venta_total_cobrado === "number" ? data.venta_total_cobrado : undefined,
            venta_total_costos: typeof data.venta_total_costos === "number" ? data.venta_total_costos : undefined,
            canal_venta: data.canal_venta || undefined,
            canal_venta_nombre: data.canal_venta_nombre || undefined,
            porcentaje_precio: typeof data.porcentaje_precio === "number" ? data.porcentaje_precio : undefined,
            afecta_stock: typeof data.afecta_stock === "boolean" ? data.afecta_stock : undefined,
            anticipo_porcentaje: typeof data.anticipo_porcentaje === "number" ? data.anticipo_porcentaje : undefined,
            venta_total_recibido: typeof data.venta_total_recibido === "number" ? data.venta_total_recibido : undefined,
            venta_saldo_pendiente: typeof data.venta_saldo_pendiente === "number" ? data.venta_saldo_pendiente : undefined,
            ingreso_reconocido: typeof data.ingreso_reconocido === "number" ? data.ingreso_reconocido : undefined,
            unidades_devueltas: typeof data.unidades_devueltas === "number" ? data.unidades_devueltas : undefined,
            estado_pago: data.estado_pago || undefined,
            sku: data.sku,
            almacen_id: data.almacen_id,
            tipo: data.tipo,
            cantidad: data.cantidad,
            referencia: data.referencia,
            usuario: data.usuario,
            fecha: data.fecha ? (data.fecha as Timestamp).toDate() : new Date(),
            almacen_destino_id: data.almacen_destino_id,
            compra_id: data.compra_id,
            lote_id: data.lote_id,
            costo_unitario: typeof data.costo_unitario === "number" ? data.costo_unitario : undefined,
            cliente_id: data.cliente_id,
            cliente_nombre: data.cliente_nombre,
            cliente_tipo: data.cliente_tipo,
            precio_unitario_venta: typeof data.precio_unitario_venta === "number" ? data.precio_unitario_venta : undefined,
            total_venta: typeof data.total_venta === "number" ? data.total_venta : undefined,
            envio_cobrado_cliente: typeof data.envio_cobrado_cliente === "number" ? data.envio_cobrado_cliente : undefined,
            otros_cargos_cliente: typeof data.otros_cargos_cliente === "number" ? data.otros_cargos_cliente : undefined,
            concepto_otros_cargos: data.concepto_otros_cargos || undefined,
            costo_envio_venta: typeof data.costo_envio_venta === "number" ? data.costo_envio_venta : undefined,
            otros_costos_venta: typeof data.otros_costos_venta === "number" ? data.otros_costos_venta : undefined,
            concepto_otros_costos: data.concepto_otros_costos || undefined,
            total_cobrado: typeof data.total_cobrado === "number" ? data.total_cobrado : undefined,
            total_costos_venta: typeof data.total_costos_venta === "number" ? data.total_costos_venta : undefined,
            comentarios_venta: data.comentarios_venta || undefined,
            ubicacion_entrega_id: data.ubicacion_entrega_id || undefined,
            ubicacion_entrega_nombre: data.ubicacion_entrega_nombre || undefined,
            repartidor_id: data.repartidor_id || undefined,
            repartidor_nombre: data.repartidor_nombre || undefined,
            estado: data.estado || "activo",
            anulado_at: data.anulado_at ? (data.anulado_at as Timestamp).toDate() : undefined,
            anulado_por: data.anulado_por,
            motivo_anulacion: data.motivo_anulacion,
            en_papelera: data.en_papelera === true
          };
        });

        return {
          items: list,
          lastDoc: nextLastDoc,
          hasMore,
          totalLoaded: list.length
        };
      } catch (err: any) {
        if (err?.code === "failed-precondition" || String(err?.message || "").toLowerCase().includes("index")) {
          throw new Error("Falta un índice de Firestore para aplicar estos filtros. Créalo desde el enlace del error en la consola y vuelve a intentarlo cuando esté habilitado.");
        }
        throw err;
      }
    }

    // Modo local
    let movs = getLocalStorageItem<Movimiento[]>("movimientos", []).filter(movimiento => movimiento.en_papelera !== true);
    movs = movs.map(m => ({
      ...m,
      fecha: typeof m.fecha === "string" ? new Date(m.fecha) : m.fecha,
      estado: m.estado || "activo",
      anulado_at: m.anulado_at ? (typeof m.anulado_at === "string" ? new Date(m.anulado_at) : m.anulado_at) : undefined
    }));

    movs.sort((a, b) => {
      const timeA = a.fecha instanceof Date ? a.fecha.getTime() : new Date((a.fecha as any).seconds * 1000).getTime();
      const timeB = b.fecha instanceof Date ? b.fecha.getTime() : new Date((b.fecha as any).seconds * 1000).getTime();
      return timeB - timeA;
    });

    if (options.skuFilter) {
      const s = options.skuFilter.trim().toLowerCase();
      movs = movs.filter(m => 
        m.sku.toLowerCase().includes(s) || 
        (m.folio && m.folio.toLowerCase().includes(s)) ||
        (m.referencia && m.referencia.toLowerCase().includes(s)) ||
        (m.cliente_nombre && m.cliente_nombre.toLowerCase().includes(s)) ||
        (m.comentarios_venta && m.comentarios_venta.toLowerCase().includes(s)) ||
        (m.ubicacion_entrega_nombre && m.ubicacion_entrega_nombre.toLowerCase().includes(s)) ||
        (m.repartidor_nombre && m.repartidor_nombre.toLowerCase().includes(s))
      );
    }
    if (options.warehouseFilter && options.warehouseFilter !== "all") {
      movs = movs.filter(m => m.almacen_id === options.warehouseFilter || m.almacen_destino_id === options.warehouseFilter);
    }
    if (options.tipoFilter && options.tipoFilter !== "all") {
      movs = movs.filter(m => m.tipo === options.tipoFilter);
    }
    if (options.estadoFilter && options.estadoFilter !== "all") {
      movs = movs.filter(m => (m.estado || "activo") === options.estadoFilter);
    }

    const startIndex = typeof options.lastDoc === "number" ? options.lastDoc : 0;
    const pageItems = movs.slice(startIndex, startIndex + pageSize);
    const nextIndex = startIndex + pageItems.length;
    const hasMore = nextIndex < movs.length;

    return {
      items: pageItems,
      lastDoc: nextIndex,
      hasMore,
      totalLoaded: pageItems.length
    };
  },

  getMovimientos: async (skuFilter?: string): Promise<Movimiento[]> => {
    const res = await firestoreService.getMovimientosPaginated({ pageSize: 100, skuFilter });
    return res.items;
  },


  // --- CONSULTA OPTIMIZADA DE RESÚMENES INCREMENTALES DE VENTAS ---
  getResumenVentasByDateRange: async (startDate: Date, endDate: Date): Promise<ResumenVentaDiaria[]> => {
    const startStr = getLocalDateString(startDate);
    const endStr = getLocalDateString(endDate);

    if (isConfigured && realDb) {
      const q = query(
        collection(realDb, "resumen_ventas"),
        where("fecha_str", ">=", startStr),
        where("fecha_str", "<=", endStr)
      );

      const snap = await getDocs(q);
      const list: ResumenVentaDiaria[] = [];

      snap.forEach(d => {
        const data = d.data();
        if (Number(data.cantidad) > 0) {
          list.push({
            id: d.id,
            fecha_str: data.fecha_str,
            fecha: data.fecha ? (data.fecha as Timestamp).toDate() : new Date(),
            sku: data.sku,
            almacen_id: data.almacen_id,
            cantidad: Number(data.cantidad) || 0,
            total_transacciones: Number(data.total_transacciones) || 1,
            actualizado: data.actualizado ? (data.actualizado as Timestamp).toDate() : undefined
          });
        }
      });

      return list;
    }

    // Modo emulador local
    const summaryMap = getLocalStorageItem<Record<string, ResumenVentaDiaria>>("resumen_ventas", {});
    return Object.values(summaryMap).filter(item => {
      const f = item.fecha_str;
      return f >= startStr && f <= endStr && item.cantidad > 0;
    });
  },

  getVentasMaestrasByDateRange: async (startDate: Date, endDate: Date): Promise<Venta[]> => {
    const startMs = startDate.getTime();
    const endMs = endDate.getTime();
    const toDate = (value: any): Date => value?.toDate
      ? value.toDate()
      : value instanceof Date
        ? value
        : value?.seconds
          ? new Date(value.seconds * 1000)
          : new Date(value || Date.now());

    if (isConfigured && realDb) {
      const snap = await getDocs(query(
        collection(realDb, "ventas"),
        where("fecha", ">=", Timestamp.fromDate(startDate)),
        where("fecha", "<=", Timestamp.fromDate(endDate)),
        orderBy("fecha", "desc")
      ));
      return snap.docs.map(snapshot => {
        const data = snapshot.data();
        return {
          ...data,
          id: snapshot.id,
          folio: String(data.folio || snapshot.id),
          fecha: toDate(data.fecha),
          items: Array.isArray(data.items) ? data.items : [],
          estado: data.estado || "activo",
          en_papelera: data.en_papelera === true
        } as Venta;
      });
    }

    return getLocalStorageItem<Venta[]>("ventas_maestras", []).filter(sale => {
      const saleTime = toDate(sale.fecha).getTime();
      return saleTime >= startMs && saleTime <= endMs;
    });
  },

  // Fallback para consultas directas de movimientos de salida si fuera necesario
  getVentasByDateRange: async (startDate: Date, endDate: Date): Promise<Movimiento[]> => {
    const startMs = startDate.getTime();
    const endMs = endDate.getTime();

    if (isConfigured && realDb) {
      const startTimestamp = Timestamp.fromDate(startDate);
      const endTimestamp = Timestamp.fromDate(endDate);

      try {
        const q = query(
          collection(realDb, "movimientos"),
          where("tipo", "==", "salida"),
          where("fecha", ">=", startTimestamp),
          where("fecha", "<=", endTimestamp),
          orderBy("fecha", "desc")
        );

        const snap = await getDocs(q);
        const list: Movimiento[] = [];

        snap.forEach(d => {
          const data = d.data();
          if ((data.estado || "activo") === "anulado" || data.en_papelera === true) return;

          const docDate = data.fecha
            ? (data.fecha as Timestamp).toDate
              ? (data.fecha as Timestamp).toDate()
              : new Date(typeof data.fecha === "string" ? data.fecha : (data.fecha as any).seconds * 1000)
            : new Date();

          list.push({
            id: d.id,
            folio: data.folio,
            venta_id: data.venta_id,
            venta_partida: typeof data.venta_partida === "number" ? data.venta_partida : undefined,
            venta_total_partidas: typeof data.venta_total_partidas === "number" ? data.venta_total_partidas : undefined,
            venta_subtotal: typeof data.venta_subtotal === "number" ? data.venta_subtotal : undefined,
            venta_total_cobrado: typeof data.venta_total_cobrado === "number" ? data.venta_total_cobrado : undefined,
            venta_total_costos: typeof data.venta_total_costos === "number" ? data.venta_total_costos : undefined,
            canal_venta: data.canal_venta || undefined,
            canal_venta_nombre: data.canal_venta_nombre || undefined,
            porcentaje_precio: typeof data.porcentaje_precio === "number" ? data.porcentaje_precio : undefined,
            afecta_stock: typeof data.afecta_stock === "boolean" ? data.afecta_stock : undefined,
            anticipo_porcentaje: typeof data.anticipo_porcentaje === "number" ? data.anticipo_porcentaje : undefined,
            venta_total_recibido: typeof data.venta_total_recibido === "number" ? data.venta_total_recibido : undefined,
            venta_saldo_pendiente: typeof data.venta_saldo_pendiente === "number" ? data.venta_saldo_pendiente : undefined,
            ingreso_reconocido: typeof data.ingreso_reconocido === "number" ? data.ingreso_reconocido : undefined,
            subtipo: data.subtipo || undefined,
            venta_relacionada_id: data.venta_relacionada_id || undefined,
            estado_pago: data.estado_pago || undefined,
            sku: data.sku,
            almacen_id: data.almacen_id,
            tipo: "salida",
            cantidad: Number(data.cantidad) || 0,
            referencia: data.referencia,
            usuario: data.usuario,
            fecha: docDate,
            cliente_id: data.cliente_id,
            cliente_nombre: data.cliente_nombre,
            cliente_tipo: data.cliente_tipo,
            precio_unitario_venta: typeof data.precio_unitario_venta === "number" ? data.precio_unitario_venta : undefined,
            total_venta: typeof data.total_venta === "number" ? data.total_venta : undefined,
            envio_cobrado_cliente: typeof data.envio_cobrado_cliente === "number" ? data.envio_cobrado_cliente : undefined,
            otros_cargos_cliente: typeof data.otros_cargos_cliente === "number" ? data.otros_cargos_cliente : undefined,
            concepto_otros_cargos: data.concepto_otros_cargos || undefined,
            costo_envio_venta: typeof data.costo_envio_venta === "number" ? data.costo_envio_venta : undefined,
            otros_costos_venta: typeof data.otros_costos_venta === "number" ? data.otros_costos_venta : undefined,
            concepto_otros_costos: data.concepto_otros_costos || undefined,
            total_cobrado: typeof data.total_cobrado === "number" ? data.total_cobrado : undefined,
            total_costos_venta: typeof data.total_costos_venta === "number" ? data.total_costos_venta : undefined,
            comentarios_venta: data.comentarios_venta || undefined,
            ubicacion_entrega_id: data.ubicacion_entrega_id || undefined,
            ubicacion_entrega_nombre: data.ubicacion_entrega_nombre || undefined,
            repartidor_id: data.repartidor_id || undefined,
            repartidor_nombre: data.repartidor_nombre || undefined,
            estado: data.estado || "activo"
          });
        });

        return list;
      } catch (err: any) {
        console.error("Error al consultar ventas por rango de fechas en Firestore:", err);
        const isIndexErr =
          err?.code === "failed-precondition" ||
          (err?.message && (err.message.includes("index") || err.message.includes("indexes")));

        if (isIndexErr) {
          throw new Error(
            "El índice de Firestore necesario para consultar este periodo no está disponible todavía. Revisa la sección Índices de Firebase y vuelve a intentarlo cuando aparezca como habilitado."
          );
        }
        throw err;
      }
    }

    const movs = getLocalStorageItem<Movimiento[]>("movimientos", []);
    return movs.filter(m => {
      if (m.tipo !== "salida" || (m.estado || "activo") === "anulado" || m.en_papelera === true) return false;
      const mDate = m.fecha instanceof Date ? m.fecha : new Date(typeof m.fecha === "string" ? m.fecha : (m.fecha as any).seconds * 1000);
      const time = mDate.getTime();
      return time >= startMs && time <= endMs;
    }).map(m => ({
      ...m,
      fecha: m.fecha instanceof Date ? m.fecha : new Date(typeof m.fecha === "string" ? m.fecha : (m.fecha as any).seconds * 1000),
      estado: m.estado || "activo"
    }));
  },

  // --- MÓDULO DE COMPRAS (REGISTRO POR LOTE ATÓMICO) ---
  registerCompraTransaction: async (compraData: {
    proveedor: string;
    fecha?: Date;
    almacen_id: string;
    items: CompraItem[];
    costo_envio?: number;
    comisiones?: number;
    descuentos?: number;
    referencia?: string;
    notas?: string;
    clasificacion_financiera?: "operacion" | "inversion_inicial";
    drop_id?: string;
  }): Promise<{ id: string; folio: string; movimientosCount: number }> => {
    const user = authService.getCurrentUser();
    const usuarioEmail = user ? user.email : "sistema@empresa.com";

    const proveedorClean = (compraData.proveedor || "").trim();
    if (!proveedorClean) {
      throw new Error("El nombre o razón social del proveedor es obligatorio.");
    }

    const almacenId = (compraData.almacen_id || "").trim();
    if (!almacenId) {
      throw new Error("El almacén de recepción es obligatorio.");
    }

    if (!compraData.items || compraData.items.length === 0) {
      throw new Error("Debe incluir al menos un producto/variante en la compra.");
    }

    const validItems: CompraItem[] = [];
    const purchaseSkus = new Set<string>();
    let totalUnidades = 0;
    let subtotal = 0;

    for (const item of compraData.items) {
      const cleanSku = (item.sku || "").trim().toUpperCase();
      const qty = Number(item.cantidad);
      const unitCost = Number(item.costo_unitario);

      if (!cleanSku) {
        throw new Error("Cada partida debe tener un SKU válido.");
      }
      if (isNaN(qty) || qty <= 0) {
        throw new Error(`La cantidad para el SKU ${cleanSku} debe ser mayor a cero.`);
      }
      if (isNaN(unitCost) || unitCost < 0) {
        throw new Error(`El costo unitario para el SKU ${cleanSku} no puede ser negativo.`);
      }
      if (purchaseSkus.has(cleanSku)) {
        throw new Error(`El SKU ${cleanSku} está repetido. Unifica su cantidad en una sola partida.`);
      }
      purchaseSkus.add(cleanSku);

      const itemSubtotal = qty * unitCost;
      totalUnidades += qty;
      subtotal += itemSubtotal;

      validItems.push({
        sku: cleanSku,
        nombre_producto: item.nombre_producto || "",
        variante_label: item.variante_label || "",
        cantidad: qty,
        costo_unitario: unitCost,
        subtotal: itemSubtotal
      });
    }

    const costoEnvio = Number(compraData.costo_envio) || 0;
    const comisiones = Number(compraData.comisiones) || 0;
    const descuentos = Number(compraData.descuentos) || 0;
    const totalCompra = Math.max(0, subtotal + costoEnvio + comisiones - descuentos);

    const purchaseDate = compraData.fecha instanceof Date ? compraData.fecha : new Date();
    const fechaStr = getLocalDateString(purchaseDate);
    const dropId = (compraData.drop_id || "").trim();

    if (isConfigured && realDb) {
      const compraCounterRef = doc(realDb, "contadores", "compra");
      const entradaCounterRef = doc(realDb, "contadores", "entrada");
      const compraDocRef = doc(collection(realDb, "compras"));
      const compraDocId = compraDocRef.id;

      const periodoKey = getPeriodoKey(purchaseDate);
      const periodRef = periodoKey ? doc(realDb, "periodos_financieros", periodoKey) : null;
      const dropRef = dropId ? doc(realDb, "drops", dropId) : null;

      let generatedCompraFolio = "";
      let dropNombre = "";

      await runTransaction(realDb, async (transaction) => {
        // 1. Obtener consecutivo de compras
        const compraCounterSnap = await transaction.get(compraCounterRef);
        let nextCompraNumber = 1;
        if (compraCounterSnap.exists()) {
          const data = compraCounterSnap.data();
          if (typeof data?.ultimo_consecutivo === "number") {
            nextCompraNumber = data.ultimo_consecutivo + 1;
          }
        }
        generatedCompraFolio = `COMP-${nextCompraNumber}`;

        // 2. Obtener consecutivo de entradas
        const entradaCounterSnap = await transaction.get(entradaCounterRef);
        let nextEntradaNumber = 1;
        if (entradaCounterSnap.exists()) {
          const data = entradaCounterSnap.data();
          if (typeof data?.ultimo_consecutivo === "number") {
            nextEntradaNumber = data.ultimo_consecutivo + 1;
          }
        }

        // 2.5 Lectura de stock de todas las partidas y del índice de periodos financieros
        const stockSnaps: any[] = [];
        for (let i = 0; i < validItems.length; i++) {
          const item = validItems[i];
          const stockKey = `${item.sku}_${almacenId}`;
          const stockRef = doc(realDb, "stock", stockKey);
          const snap = await transaction.get(stockRef);
          stockSnaps.push({ stockKey, stockRef, snap, item });
        }

        const periodSnap = periodRef ? await transaction.get(periodRef) : null;
        const dropSnap = dropRef ? await transaction.get(dropRef) : null;
        if (dropRef) {
          if (!dropSnap?.exists() || dropSnap.data()?.en_papelera === true) {
            throw new Error("El drop seleccionado ya no está disponible.");
          }
          if (dropSnap.data()?.estado === "cerrado") {
            throw new Error("No puedes registrar compras en un drop cerrado.");
          }
          dropNombre = String(dropSnap.data()?.nombre || "").trim();
        }

        // 3. Procesar stock y movimientos de cada partida
        for (let i = 0; i < stockSnaps.length; i++) {
          const { stockKey, stockRef, snap, item } = stockSnaps[i];
          const currentQty = snap.exists() ? (Number(snap.data()?.cantidad) || 0) : 0;
          const newQty = currentQty + item.cantidad;

          // Actualizar stock
          transaction.set(stockRef, {
            id: stockKey,
            sku: item.sku,
            almacen_id: almacenId,
            cantidad: newQty,
            actualizado: Timestamp.now()
          }, { merge: true });

          transaction.set(doc(realDb, "productos", item.sku), {
            precio_costo: item.costo_unitario,
            actualizado_at: Timestamp.now()
          }, { merge: true });

          // Registrar movimiento de auditoría interna
          const movFolio = `Entrada-${nextEntradaNumber + i}`;
          const movRef = doc(collection(realDb, "movimientos"));
          const refText = compraData.referencia 
            ? `${compraData.referencia} (Compra ${generatedCompraFolio})` 
            : `Compra ${generatedCompraFolio} - Proveedor: ${proveedorClean}`;

          transaction.set(movRef, {
            folio: movFolio,
            sku: item.sku,
            almacen_id: almacenId,
            tipo: "entrada",
            cantidad: item.cantidad,
            referencia: refText,
            usuario: usuarioEmail,
            fecha: Timestamp.fromDate(purchaseDate),
            compra_id: compraDocId,
            ...(dropId ? { drop_id: dropId, drop_nombre: dropNombre } : {}),
            lote_id: generatedCompraFolio,
            costo_unitario: item.costo_unitario,
            estado: "activo"
          });
        }

        // 4. Actualizar contadores
        transaction.set(compraCounterRef, {
          tipo: "compra",
          ultimo_consecutivo: nextCompraNumber,
          actualizado: Timestamp.now()
        }, { merge: true });

        transaction.set(entradaCounterRef, {
          tipo: "entrada",
          ultimo_consecutivo: nextEntradaNumber + validItems.length - 1,
          actualizado: Timestamp.now()
        }, { merge: true });

        // 5. Guardar documento maestro de Compra
        transaction.set(compraDocRef, {
          folio: generatedCompraFolio,
          proveedor: proveedorClean,
          fecha: Timestamp.fromDate(purchaseDate),
          fecha_str: fechaStr,
          almacen_id: almacenId,
          ...(dropId ? { drop_id: dropId, drop_nombre: dropNombre } : {}),
          items: validItems,
          total_unidades: totalUnidades,
          subtotal: subtotal,
          costo_envio: costoEnvio,
          comisiones: comisiones,
          descuentos: descuentos,
          total: totalCompra,
          clasificacion_financiera: compraData.clasificacion_financiera === "inversion_inicial" ? "inversion_inicial" : "operacion",
          referencia: compraData.referencia || "",
          notas: compraData.notas || "",
          creado_por: usuarioEmail,
          creado_at: Timestamp.now(),
          estado: "completada"
        });

        // 6. Actualización atómica de periodos_financieros
        if (periodRef && periodoKey) {
          const updatedPeriod = computeNewPeriodIndexData(
            periodSnap?.exists() ? periodSnap.data() : null,
            periodoKey,
            0,
            1,
            0
          );
          transaction.set(periodRef, updatedPeriod, { merge: true });
        }
      });

      clearFinanzasCache();
      clearPeriodosFinancierosCache();
      return {
        id: compraDocId,
        folio: generatedCompraFolio,
        movimientosCount: validItems.length
      };
    }

    // --- MODO LOCAL / EMULADOR ---
    let localDropNombre = "";
    if (dropId) {
      const localDrop = getLocalStorageItem<Drop[]>("drops", []).find(item => item.id === dropId && item.en_papelera !== true);
      if (!localDrop) throw new Error("El drop seleccionado ya no está disponible.");
      if (localDrop.estado === "cerrado") throw new Error("No puedes registrar compras en un drop cerrado.");
      localDropNombre = localDrop.nombre;
    }

    const stockMap = getLocalStorageItem<Record<string, StockItem>>("stock", {});
    const comprasList = getLocalStorageItem<Compra[]>("compras", []);
    const productosList = getLocalStorageItem<Producto[]>("productos", []);
    const movimientosList = getLocalStorageItem<Movimiento[]>("movimientos", []);
    const counters = getLocalStorageItem<Record<string, number>>("contadores_movimientos", {
      entrada: 0,
      salida: 0,
      transferencia: 0,
      ajuste: 0,
      compra: 0
    });

    const nextCompraNum = (counters.compra || 0) + 1;
    counters.compra = nextCompraNum;
    const generatedCompraFolio = `COMP-${nextCompraNum}`;
    const compraDocId = "comp_" + Math.random().toString(36).substr(2, 9);

    for (const item of validItems) {
      const stockKey = `${item.sku}_${almacenId}`;
      const currentQty = stockMap[stockKey]?.cantidad || 0;
      stockMap[stockKey] = {
        id: stockKey,
        sku: item.sku,
        almacen_id: almacenId,
        cantidad: currentQty + item.cantidad,
        actualizado: new Date()
      };

      const nextEntradaNum = (counters.entrada || 0) + 1;
      counters.entrada = nextEntradaNum;
      const movFolio = `Entrada-${nextEntradaNum}`;
      const refText = compraData.referencia 
        ? `${compraData.referencia} (Compra ${generatedCompraFolio})` 
        : `Compra ${generatedCompraFolio} - Proveedor: ${proveedorClean}`;

      movimientosList.push({
        id: "mov_" + Math.random().toString(36).substr(2, 9),
        folio: movFolio,
        sku: item.sku,
        almacen_id: almacenId,
        tipo: "entrada",
        cantidad: item.cantidad,
        referencia: refText,
        usuario: usuarioEmail,
        fecha: purchaseDate,
        compra_id: compraDocId,
        ...(dropId ? { drop_id: dropId, drop_nombre: localDropNombre } : {}),
        lote_id: generatedCompraFolio,
        costo_unitario: item.costo_unitario,
        estado: "activo"
      });
      const productIndex = productosList.findIndex(producto => producto.sku === item.sku);
      if (productIndex >= 0) productosList[productIndex] = { ...productosList[productIndex], precio_costo: item.costo_unitario, actualizado_at: new Date() };
    }

    setLocalStorageItem("contadores_movimientos", counters);
    setLocalStorageItem("stock", stockMap);
    notifyListeners("stock", stockMap);
    setLocalStorageItem("movimientos", movimientosList);
    setLocalStorageItem("productos", productosList);
    notifyListeners("productos", productosList);
    notifyListeners("movimientos", movimientosList);

    const nuevaCompra: Compra = {
      id: compraDocId,
      folio: generatedCompraFolio,
      proveedor: proveedorClean,
      fecha: purchaseDate,
      fecha_str: fechaStr,
      almacen_id: almacenId,
      drop_id: dropId || undefined,
      drop_nombre: dropId ? localDropNombre : undefined,
      items: validItems,
      total_unidades: totalUnidades,
      subtotal: subtotal,
      costo_envio: costoEnvio,
      comisiones: comisiones,
      descuentos: descuentos,
      total: totalCompra,
      clasificacion_financiera: compraData.clasificacion_financiera === "inversion_inicial" ? "inversion_inicial" : "operacion",
      referencia: compraData.referencia || "",
      notas: compraData.notas || "",
      creado_por: usuarioEmail,
      creado_at: new Date(),
      estado: "completada"
    };

    comprasList.unshift(nuevaCompra);
    setLocalStorageItem("compras", comprasList);
    notifyListeners("compras", comprasList);

    clearFinanzasCache();
    clearPeriodosFinancierosCache();
    return {
      id: compraDocId,
      folio: generatedCompraFolio,
      movimientosCount: validItems.length
    };
  },

  enviarCompraPapelera: async (compraId: string): Promise<void> => {
    if (!compraId) throw new Error("ID de compra no proporcionado.");
    const user = authService.getCurrentUser();
    const usuarioEmail = user?.email || "sistema@empresa.com";

    if (isConfigured && realDb) {
      const compraRef = doc(realDb, "compras", compraId);
      const movementsSnap = await getDocs(query(collection(realDb, "movimientos"), where("compra_id", "==", compraId)));
      const movementRefs = movementsSnap.docs.map(item => item.ref);

      await runTransaction(realDb, async transaction => {
        const compraSnap = await transaction.get(compraRef);
        if (!compraSnap.exists()) throw new Error("La compra no existe.");
        if (compraSnap.data().estado === "anulada") throw new Error("La compra ya está anulada.");

        const movementSnaps: any[] = [];
        for (const movementRef of movementRefs) movementSnaps.push(await transaction.get(movementRef));

        const quantitiesByStock = new Map<string, { sku: string; almacenId: string; cantidad: number; ref: any }>();
        movementSnaps.forEach(snapshot => {
          if (!snapshot.exists() || snapshot.data().estado === "anulado") return;
          const data = snapshot.data();
          const sku = String(data.sku || "").trim().toUpperCase();
          const almacenId = String(data.almacen_id || "");
          const key = `${sku}_${almacenId}`;
          const current = quantitiesByStock.get(key);
          quantitiesByStock.set(key, {
            sku,
            almacenId,
            cantidad: (current?.cantidad || 0) + (Number(data.cantidad) || 0),
            ref: doc(realDb!, "stock", key)
          });
        });

        const stockEntries = [...quantitiesByStock.values()];
        const stockSnaps: any[] = [];
        for (const entry of stockEntries) stockSnaps.push(await transaction.get(entry.ref));

        const periodoKey = getPeriodoKey(compraSnap.data().fecha);
        const periodRef = periodoKey ? doc(realDb, "periodos_financieros", periodoKey) : null;
        const periodSnap = periodRef ? await transaction.get(periodRef) : null;

        stockEntries.forEach((entry, index) => {
          const currentQty = stockSnaps[index].exists() ? Number(stockSnaps[index].data()?.cantidad) || 0 : 0;
          if (currentQty < entry.cantidad) {
            throw new Error(
              `No se puede enviar esta compra a la Papelera porque parte de ${entry.sku} ya fue vendida, transferida o ajustada. ` +
              `Hay ${currentQty} unidades disponibles y se necesitan ${entry.cantidad} para revertir la compra. ` +
              `Primero cancela o revierte los movimientos posteriores relacionados.`
            );
          }
        });

        const now = Timestamp.now();
        stockEntries.forEach((entry, index) => {
          const currentQty = stockSnaps[index].exists() ? Number(stockSnaps[index].data()?.cantidad) || 0 : 0;
          transaction.set(entry.ref, {
            id: `${entry.sku}_${entry.almacenId}`,
            sku: entry.sku,
            almacen_id: entry.almacenId,
            cantidad: currentQty - entry.cantidad,
            actualizado: now
          }, { merge: true });
        });
        movementSnaps.forEach(snapshot => {
          if (!snapshot.exists()) return;
          const wasCancelled = snapshot.data().estado === "anulado";
          transaction.update(snapshot.ref, wasCancelled
            ? {
                en_papelera: true,
                desactivado_at: now,
                estado_antes_papelera: "anulado"
              }
            : {
                estado: "anulado",
                anulado_at: now,
                anulado_por: usuarioEmail,
                motivo_anulacion: "Compra enviada a Papelera",
                en_papelera: true,
                desactivado_at: now,
                estado_antes_papelera: "activo"
              }
          );
        });
        transaction.set(compraRef, {
          estado: "anulada",
          en_papelera: true,
          desactivado_at: now,
          anulado_por: usuarioEmail
        }, { merge: true });

        if (periodRef && periodoKey) {
          transaction.set(periodRef, computeNewPeriodIndexData(
            periodSnap?.exists() ? periodSnap.data() : null,
            periodoKey,
            0,
            -1,
            0
          ), { merge: true });
        }
      });

      clearFinanzasCache();
      clearPeriodosFinancierosCache();
      return;
    }

    const compras = getLocalStorageItem<Compra[]>("compras", []);
    const movimientos = getLocalStorageItem<Movimiento[]>("movimientos", []);
    const stockMap = getLocalStorageItem<Record<string, StockItem>>("stock", {});
    const compraIndex = compras.findIndex(compra => compra.id === compraId);
    if (compraIndex === -1) throw new Error("La compra no existe.");
    if (compras[compraIndex].estado === "anulada") throw new Error("La compra ya está anulada.");
    const linked = movimientos.filter(movimiento => movimiento.compra_id === compraId && movimiento.estado !== "anulado");
    const totals = new Map<string, number>();
    linked.forEach(movimiento => {
      const key = `${movimiento.sku.trim().toUpperCase()}_${movimiento.almacen_id}`;
      totals.set(key, (totals.get(key) || 0) + (Number(movimiento.cantidad) || 0));
    });
    totals.forEach((cantidad, key) => {
      if ((stockMap[key]?.cantidad || 0) < cantidad) throw new Error(`No hay stock suficiente para revertir ${key}.`);
    });
    const now = new Date();
    totals.forEach((cantidad, key) => {
      stockMap[key] = { ...stockMap[key], cantidad: (stockMap[key]?.cantidad || 0) - cantidad, actualizado: now };
    });
    movimientos.forEach((movimiento, index) => {
      if (movimiento.compra_id === compraId) movimientos[index] = { ...movimiento, estado_antes_papelera: movimiento.estado === "anulado" ? "anulado" : "activo", estado: "anulado", anulado_at: now, anulado_por: usuarioEmail, motivo_anulacion: "Compra enviada a Papelera", en_papelera: true, desactivado_at: now };
    });
    compras[compraIndex] = { ...compras[compraIndex], estado: "anulada", en_papelera: true, desactivado_at: now };
    setLocalStorageItem("stock", stockMap);
    setLocalStorageItem("movimientos", movimientos);
    setLocalStorageItem("compras", compras);
    notifyListeners("stock", stockMap);
    notifyListeners("movimientos", movimientos);
    notifyListeners("compras", compras);
    clearFinanzasCache();
    clearPeriodosFinancierosCache();
  },

  restaurarCompraPapelera: async (compraId: string): Promise<void> => {
    if (!compraId) throw new Error("ID de compra no proporcionado.");
    if (isConfigured && realDb) {
      const compraRef = doc(realDb, "compras", compraId);
      const movementsSnap = await getDocs(query(collection(realDb, "movimientos"), where("compra_id", "==", compraId)));
      const movementRefs = movementsSnap.docs.map(item => item.ref);
      await runTransaction(realDb, async transaction => {
        const compraSnap = await transaction.get(compraRef);
        if (!compraSnap.exists()) throw new Error("La compra no existe.");
        if (compraSnap.data().en_papelera !== true) throw new Error("La compra ya está activa.");
        const movementSnaps: any[] = [];
        for (const movementRef of movementRefs) movementSnaps.push(await transaction.get(movementRef));
        const quantitiesByStock = new Map<string, { sku: string; almacenId: string; cantidad: number; ref: any }>();
        movementSnaps.forEach(snapshot => {
          if (!snapshot.exists()) return;
          const data = snapshot.data();
          if (data.estado_antes_papelera === "anulado") return;
          const sku = String(data.sku || "").trim().toUpperCase();
          const almacenId = String(data.almacen_id || "");
          const key = `${sku}_${almacenId}`;
          const current = quantitiesByStock.get(key);
          quantitiesByStock.set(key, { sku, almacenId, cantidad: (current?.cantidad || 0) + (Number(data.cantidad) || 0), ref: doc(realDb!, "stock", key) });
        });
        const stockEntries = [...quantitiesByStock.values()];
        const stockSnaps: any[] = [];
        for (const entry of stockEntries) stockSnaps.push(await transaction.get(entry.ref));
        const periodoKey = getPeriodoKey(compraSnap.data().fecha);
        const periodRef = periodoKey ? doc(realDb, "periodos_financieros", periodoKey) : null;
        const periodSnap = periodRef ? await transaction.get(periodRef) : null;
        const now = Timestamp.now();
        stockEntries.forEach((entry, index) => {
          const currentQty = stockSnaps[index].exists() ? Number(stockSnaps[index].data()?.cantidad) || 0 : 0;
          transaction.set(entry.ref, { id: `${entry.sku}_${entry.almacenId}`, sku: entry.sku, almacen_id: entry.almacenId, cantidad: currentQty + entry.cantidad, actualizado: now }, { merge: true });
        });
        movementSnaps.forEach(snapshot => {
          if (!snapshot.exists()) return;
          const wasCancelled = snapshot.data().estado_antes_papelera === "anulado";
          transaction.update(snapshot.ref, wasCancelled
            ? { en_papelera: false, desactivado_at: deleteField(), estado_antes_papelera: deleteField() }
            : { estado: "activo", anulado_at: deleteField(), anulado_por: deleteField(), motivo_anulacion: deleteField(), en_papelera: false, desactivado_at: deleteField(), estado_antes_papelera: deleteField() });
        });
        transaction.set(compraRef, { estado: "completada", en_papelera: false, desactivado_at: deleteField(), anulado_por: deleteField() }, { merge: true });
        if (periodRef && periodoKey) transaction.set(periodRef, computeNewPeriodIndexData(periodSnap?.exists() ? periodSnap.data() : null, periodoKey, 0, 1, 0), { merge: true });
      });
      clearFinanzasCache();
      clearPeriodosFinancierosCache();
      return;
    }
    const compras = getLocalStorageItem<Compra[]>("compras", []);
    const movimientos = getLocalStorageItem<Movimiento[]>("movimientos", []);
    const stockMap = getLocalStorageItem<Record<string, StockItem>>("stock", {});
    const compraIndex = compras.findIndex(compra => compra.id === compraId);
    if (compraIndex === -1) throw new Error("La compra no existe.");
    const now = new Date();
    movimientos.forEach((movimiento, index) => {
      if (movimiento.compra_id !== compraId) return;
      const wasCancelled = movimiento.estado_antes_papelera === "anulado";
      if (!wasCancelled) {
        const key = `${movimiento.sku.trim().toUpperCase()}_${movimiento.almacen_id}`;
        stockMap[key] = { ...(stockMap[key] || { id: key, sku: movimiento.sku, almacen_id: movimiento.almacen_id }), cantidad: (stockMap[key]?.cantidad || 0) + (Number(movimiento.cantidad) || 0), actualizado: now } as StockItem;
      }
      const restored = { ...movimiento, estado: wasCancelled ? "anulado" as const : "activo" as const, en_papelera: false };
      if (!wasCancelled) { delete restored.anulado_at; delete restored.anulado_por; delete restored.motivo_anulacion; }
      delete restored.desactivado_at; delete restored.estado_antes_papelera;
      movimientos[index] = restored;
    });
    const restoredCompra = { ...compras[compraIndex], estado: "completada" as const, en_papelera: false };
    delete restoredCompra.desactivado_at;
    compras[compraIndex] = restoredCompra;
    setLocalStorageItem("stock", stockMap); setLocalStorageItem("movimientos", movimientos); setLocalStorageItem("compras", compras);
    notifyListeners("stock", stockMap); notifyListeners("movimientos", movimientos); notifyListeners("compras", compras);
    clearFinanzasCache(); clearPeriodosFinancierosCache();
  },

  getComprasRealtime: (onUpdate: (compras: Compra[]) => void, onError?: (error: any) => void): (() => void) => {
    if (isConfigured && realDb) {
      const q = query(collection(realDb, "compras"), orderBy("fecha", "desc"), limit(100));
      return onSnapshot(
        q,
        (snap) => {
          const list: Compra[] = [];
          snap.forEach(d => {
            const data = d.data();
            if (data.en_papelera === true) return;
            list.push({
              id: d.id,
              folio: data.folio,
              proveedor: data.proveedor,
              fecha: data.fecha ? (data.fecha as Timestamp).toDate() : new Date(),
              fecha_str: data.fecha_str,
              almacen_id: data.almacen_id,
              items: data.items || [],
              total_unidades: Number(data.total_unidades) || 0,
              subtotal: Number(data.subtotal) || 0,
              costo_envio: Number(data.costo_envio) || 0,
              comisiones: Number(data.comisiones) || 0,
              descuentos: Number(data.descuentos) || 0,
              total: Number(data.total) || 0,
              referencia: data.referencia || "",
              notas: data.notas || "",
              creado_por: data.creado_por || "",
              creado_at: data.creado_at ? (data.creado_at as Timestamp).toDate() : new Date(),
              estado: data.estado || "completada"
            });
          });
          onUpdate(list);
        },
        (error) => {
          console.error("Error en listener de compras:", error);
          onUpdate([]);
          if (onError) onError(error);
        }
      );
    }

    const update = () => {
      const list = getLocalStorageItem<Compra[]>("compras", []);
      const parsed = list.filter(c => c.en_papelera !== true).map(c => ({
        ...c,
        fecha: c.fecha instanceof Date ? c.fecha : new Date(typeof c.fecha === "string" ? c.fecha : (c.fecha as any).seconds * 1000),
        creado_at: c.creado_at instanceof Date ? c.creado_at : new Date(typeof c.creado_at === "string" ? c.creado_at : (c.creado_at as any).seconds * 1000)
      }));
      parsed.sort((a, b) => (b.fecha as Date).getTime() - (a.fecha as Date).getTime());
      onUpdate(parsed);
    };

    update();
    listeners.compras.push(update);
    return () => {
      listeners.compras = listeners.compras.filter(cb => cb !== update);
    };
  },

  getCompras: async (): Promise<Compra[]> => {
    if (isConfigured && realDb) {
      const q = query(collection(realDb, "compras"), orderBy("fecha", "desc"), limit(100));
      const snap = await getDocs(q);
      const list: Compra[] = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.en_papelera === true) return;
        list.push({
          id: d.id,
          folio: data.folio,
          proveedor: data.proveedor,
          fecha: data.fecha ? (data.fecha as Timestamp).toDate() : new Date(),
          fecha_str: data.fecha_str,
          almacen_id: data.almacen_id,
          drop_id: data.drop_id || undefined,
          drop_nombre: data.drop_nombre || undefined,
          items: data.items || [],
          total_unidades: Number(data.total_unidades) || 0,
          subtotal: Number(data.subtotal) || 0,
          costo_envio: Number(data.costo_envio) || 0,
          comisiones: Number(data.comisiones) || 0,
          descuentos: Number(data.descuentos) || 0,
          total: Number(data.total) || 0,
          referencia: data.referencia || "",
          notas: data.notas || "",
          creado_por: data.creado_por || "",
          creado_at: data.creado_at ? (data.creado_at as Timestamp).toDate() : new Date(),
          estado: data.estado || "completada"
        });
      });
      return list;
    }

    const list = getLocalStorageItem<Compra[]>("compras", []);
    return list.filter(c => c.en_papelera !== true).map(c => ({
      ...c,
      fecha: c.fecha instanceof Date ? c.fecha : new Date(typeof c.fecha === "string" ? c.fecha : (c.fecha as any).seconds * 1000),
      creado_at: c.creado_at instanceof Date ? c.creado_at : new Date(typeof c.creado_at === "string" ? c.creado_at : (c.creado_at as any).seconds * 1000)
    })).sort((a, b) => (b.fecha as Date).getTime() - (a.fecha as Date).getTime());
  },

  getComprasPaginated: async (options: {
    pageSize?: number;
    lastDoc?: any;
    warehouseFilter?: string;
    searchTerm?: string;
  } = {}): Promise<{
    items: Compra[];
    lastDoc: any;
    hasMore: boolean;
    totalLoaded: number;
  }> => {
    const pageSize = options.pageSize || 50;

    if (isConfigured && realDb) {
      try {
        let qConstraints: any[] = [orderBy("fecha", "desc"), limit(pageSize + 1)];

        if (options.warehouseFilter && options.warehouseFilter !== "all") {
          qConstraints.unshift(where("almacen_id", "==", options.warehouseFilter));
        }

        if (options.lastDoc) {
          qConstraints.push(startAfter(options.lastDoc));
        }

        const q = query(collection(realDb, "compras"), ...qConstraints);
        const snap = await getDocs(q);

        const docs = snap.docs;
        const hasMore = docs.length > pageSize;
        const itemsToProcess = hasMore ? docs.slice(0, pageSize) : docs;
        const nextLastDoc = itemsToProcess.length > 0 ? itemsToProcess[itemsToProcess.length - 1] : null;

        const list: Compra[] = itemsToProcess.filter(d => d.data().en_papelera !== true).map(d => {
          const data = d.data();
          return {
            id: d.id,
            folio: data.folio,
            proveedor: data.proveedor,
            fecha: data.fecha ? (data.fecha as Timestamp).toDate() : new Date(),
            fecha_str: data.fecha_str,
            almacen_id: data.almacen_id,
            drop_id: data.drop_id || undefined,
            drop_nombre: data.drop_nombre || undefined,
            items: data.items || [],
            total_unidades: Number(data.total_unidades) || 0,
            subtotal: Number(data.subtotal) || 0,
            costo_envio: Number(data.costo_envio) || 0,
            comisiones: Number(data.comisiones) || 0,
            descuentos: Number(data.descuentos) || 0,
            total: Number(data.total) || 0,
            referencia: data.referencia || "",
            notas: data.notas || "",
            creado_por: data.creado_por || "",
            creado_at: data.creado_at ? (data.creado_at as Timestamp).toDate() : new Date(),
            estado: data.estado || "completada"
          };
        });

        return {
          items: list,
          lastDoc: nextLastDoc,
          hasMore,
          totalLoaded: list.length
        };
      } catch (err: any) {
        if (err?.code === "failed-precondition" || String(err?.message || "").toLowerCase().includes("index")) {
          throw new Error("Falta un índice de Firestore para consultar las compras con estos filtros. Habilita el índice indicado por Firebase y vuelve a intentarlo.");
        }
        throw err;
      }
    }

    // Modo emulador LocalStorage
    let list = getLocalStorageItem<Compra[]>("compras", []).filter(compra => compra.en_papelera !== true);
    let parsed = list.map(c => ({
      ...c,
      fecha: c.fecha instanceof Date ? c.fecha : new Date(typeof c.fecha === "string" ? c.fecha : (c.fecha as any).seconds * 1000),
      creado_at: c.creado_at instanceof Date ? c.creado_at : new Date(typeof c.creado_at === "string" ? c.creado_at : (c.creado_at as any).seconds * 1000)
    }));
    parsed.sort((a, b) => (b.fecha as Date).getTime() - (a.fecha as Date).getTime());

    if (options.warehouseFilter && options.warehouseFilter !== "all") {
      parsed = parsed.filter(c => c.almacen_id === options.warehouseFilter);
    }
    if (options.searchTerm) {
      const term = options.searchTerm.toLowerCase().trim();
      parsed = parsed.filter(c => 
        (c.folio && c.folio.toLowerCase().includes(term)) ||
        (c.proveedor && c.proveedor.toLowerCase().includes(term)) ||
        (c.drop_nombre && c.drop_nombre.toLowerCase().includes(term)) ||
        (c.referencia && c.referencia.toLowerCase().includes(term)) ||
        c.items?.some(it => it.sku.toLowerCase().includes(term) || it.nombre_producto?.toLowerCase().includes(term))
      );
    }

    const startIndex = typeof options.lastDoc === "number" ? options.lastDoc : 0;
    const pageItems = parsed.slice(startIndex, startIndex + pageSize);
    const nextIndex = startIndex + pageItems.length;
    const hasMore = nextIndex < parsed.length;

    return {
      items: pageItems,
      lastDoc: nextIndex,
      hasMore,
      totalLoaded: pageItems.length
    };
  },

  // --- CATÁLOGOS DINÁMICOS DE STREETWEAR & SNEAKERS ---
  seedAndImportCatalogos: async (): Promise<{
    categorias: CategoriaCatalogo[];
    marcas: MarcaCatalogo[];
    colores: ColorCatalogo[];
    tallasRopa: TallaRopaCatalogo[];
    tallasCalzado: TallaCalzadoCatalogo[];
    unidades: UnidadMedidaCatalogo[];
  }> => {
    return firestoreService.seedStreetwearCatalogosIfEmpty(false);
  },

  seedStreetwearCatalogosIfEmpty: async (force = false): Promise<{
    categorias: CategoriaCatalogo[];
    marcas: MarcaCatalogo[];
    colores: ColorCatalogo[];
    tallasRopa: TallaRopaCatalogo[];
    tallasCalzado: TallaCalzadoCatalogo[];
    unidades: UnidadMedidaCatalogo[];
  }> => {
    const defaultCategorias: CategoriaCatalogo[] = [
      { id: "cat_cam", nombre: "Camisetas", activa: true },
      { id: "cat_pan", nombre: "Pantalones", activa: true },
      { id: "cat_sud", nombre: "Sudaderas", activa: true },
      { id: "cat_ten", nombre: "Tenis", activa: true },
      { id: "cat_gor", nombre: "Gorras", activa: true },
      { id: "cat_cha", nombre: "Chamarras", activa: true },
      { id: "cat_sho", nombre: "Shorts", activa: true },
      { id: "cat_acc", nombre: "Accesorios", activa: true }
    ];

    const defaultMarcas: MarcaCatalogo[] = [
      { id: "mar_antiorder", nombre: "antiorder", activa: true },
      { id: "mar_nik", nombre: "Nike", activa: true },
      { id: "mar_jor", nombre: "Jordan", activa: true },
      { id: "mar_adi", nombre: "Adidas", activa: true },
      { id: "mar_stu", nombre: "Stüssy", activa: true }
    ];

    const defaultColores: ColorCatalogo[] = [
      { id: "col_neg", nombre: "Negro", codigo_hex: "#111827", activa: true },
      { id: "col_bla", nombre: "Blanco", codigo_hex: "#FFFFFF", activa: true },
      { id: "col_gri", nombre: "Gris", codigo_hex: "#64748B", activa: true },
      { id: "col_bei", nombre: "Beige", codigo_hex: "#D4C5B9", activa: true },
      { id: "col_caf", nombre: "Café", codigo_hex: "#78350F", activa: true },
      { id: "col_azu", nombre: "Azul Marino", codigo_hex: "#1E3A8A", activa: true },
      { id: "col_ver", nombre: "Verde Olivo", codigo_hex: "#3F6212", activa: true },
      { id: "col_roj", nombre: "Rojo", codigo_hex: "#DC2626", activa: true }
    ];

    const defaultTallasRopa: TallaRopaCatalogo[] = [
      { id: "tal_xs", nombre: "XS", orden: 1, activa: true },
      { id: "tal_s", nombre: "S", orden: 2, activa: true },
      { id: "tal_m", nombre: "M", orden: 3, activa: true },
      { id: "tal_l", nombre: "L", orden: 4, activa: true },
      { id: "tal_xl", nombre: "XL", orden: 5, activa: true },
      { id: "tal_xxl", nombre: "XXL", orden: 6, activa: true },
      { id: "tal_uni", nombre: "Única", orden: 7, activa: true }
    ];

    const defaultTallasCalzado: TallaCalzadoCatalogo[] = [
      { id: "cal_230", nombre: "23", orden: 1, activa: true },
      { id: "cal_235", nombre: "23.5", orden: 2, activa: true },
      { id: "cal_240", nombre: "24", orden: 3, activa: true },
      { id: "cal_245", nombre: "24.5", orden: 4, activa: true },
      { id: "cal_250", nombre: "25", orden: 5, activa: true },
      { id: "cal_255", nombre: "25.5", orden: 6, activa: true },
      { id: "cal_260", nombre: "26", orden: 7, activa: true },
      { id: "cal_265", nombre: "26.5", orden: 8, activa: true },
      { id: "cal_270", nombre: "27", orden: 9, activa: true },
      { id: "cal_275", nombre: "27.5", orden: 10, activa: true },
      { id: "cal_280", nombre: "28", orden: 11, activa: true },
      { id: "cal_285", nombre: "28.5", orden: 12, activa: true },
      { id: "cal_290", nombre: "29", orden: 13, activa: true },
      { id: "cal_295", nombre: "29.5", orden: 14, activa: true },
      { id: "cal_300", nombre: "30", orden: 15, activa: true }
    ];

    const defaultUnidades: UnidadMedidaCatalogo[] = [
      { id: "uni_pza", nombre: "Pieza", abreviatura: "pieza", activa: true },
      { id: "uni_par", nombre: "Par", abreviatura: "par", activa: true }
    ];

    if (isConfigured && realDb) {
      const catsSnap = await getDocs(collection(realDb, "catalogo_categorias"));
      const marcasSnap = await getDocs(collection(realDb, "catalogo_marcas"));
      const coloresSnap = await getDocs(collection(realDb, "catalogo_colores"));
      const tallasRopaSnap = await getDocs(collection(realDb, "catalogo_tallas_ropa"));
      const tallasCalzSnap = await getDocs(collection(realDb, "catalogo_tallas_calzado"));
      const unitsSnap = await getDocs(collection(realDb, "catalogo_unidades"));

      const batch = writeBatch(realDb);

      if (force || catsSnap.empty) {
        for (const cat of defaultCategorias) {
          batch.set(doc(realDb, "catalogo_categorias", cat.id), {
            nombre: cat.nombre,
            activa: cat.activa,
            creado: Timestamp.now()
          });
        }
      }

      if (force || marcasSnap.empty) {
        for (const mar of defaultMarcas) {
          batch.set(doc(realDb, "catalogo_marcas", mar.id), {
            nombre: mar.nombre,
            activa: mar.activa,
            creado: Timestamp.now()
          });
        }
      }

      if (force || coloresSnap.empty) {
        for (const col of defaultColores) {
          batch.set(doc(realDb, "catalogo_colores", col.id), {
            nombre: col.nombre,
            codigo_hex: col.codigo_hex,
            activa: col.activa,
            creado: Timestamp.now()
          });
        }
      }

      if (force || tallasRopaSnap.empty) {
        for (const tal of defaultTallasRopa) {
          batch.set(doc(realDb, "catalogo_tallas_ropa", tal.id), {
            nombre: tal.nombre,
            orden: tal.orden,
            activa: tal.activa,
            creado: Timestamp.now()
          });
        }
      }

      if (force || tallasCalzSnap.empty) {
        for (const cal of defaultTallasCalzado) {
          batch.set(doc(realDb, "catalogo_tallas_calzado", cal.id), {
            nombre: cal.nombre,
            orden: cal.orden,
            activa: cal.activa,
            creado: Timestamp.now()
          });
        }
      }

      if (force || unitsSnap.empty) {
        for (const unit of defaultUnidades) {
          batch.set(doc(realDb, "catalogo_unidades", unit.id), {
            nombre: unit.nombre,
            abreviatura: unit.abreviatura,
            activa: unit.activa,
            creado: Timestamp.now()
          });
        }
      }

      await batch.commit();

      const freshCats = await firestoreService.getCategorias();
      const freshMarcas = await firestoreService.getMarcas();
      const freshColores = await firestoreService.getColores();
      const freshTallasRopa = await firestoreService.getTallasRopa();
      const freshTallasCalz = await firestoreService.getTallasCalzado();
      const freshUnits = await firestoreService.getUnidades();

      return {
        categorias: freshCats,
        marcas: freshMarcas,
        colores: freshColores,
        tallasRopa: freshTallasRopa,
        tallasCalzado: freshTallasCalz,
        unidades: freshUnits
      };
    }

    let currentCats = getLocalStorageItem<CategoriaCatalogo[]>("categorias", []);
    let currentMarcas = getLocalStorageItem<MarcaCatalogo[]>("marcas", []);
    let currentColores = getLocalStorageItem<ColorCatalogo[]>("colores", []);
    let currentTallasRopa = getLocalStorageItem<TallaRopaCatalogo[]>("tallas_ropa", []);
    let currentTallasCalzado = getLocalStorageItem<TallaCalzadoCatalogo[]>("tallas_calzado", []);
    let currentUnits = getLocalStorageItem<UnidadMedidaCatalogo[]>("unidades", []);

    if (force || currentCats.length === 0) currentCats = [...defaultCategorias];
    if (force || currentMarcas.length === 0) currentMarcas = [...defaultMarcas];
    if (force || currentColores.length === 0) currentColores = [...defaultColores];
    if (force || currentTallasRopa.length === 0) currentTallasRopa = [...defaultTallasRopa];
    if (force || currentTallasCalzado.length === 0) currentTallasCalzado = [...defaultTallasCalzado];
    if (force || currentUnits.length === 0) currentUnits = [...defaultUnidades];

    setLocalStorageItem("categorias", currentCats);
    setLocalStorageItem("marcas", currentMarcas);
    setLocalStorageItem("colores", currentColores);
    setLocalStorageItem("tallas_ropa", currentTallasRopa);
    setLocalStorageItem("tallas_calzado", currentTallasCalzado);
    setLocalStorageItem("unidades", currentUnits);

    notifyListeners("categorias", currentCats);
    notifyListeners("marcas", currentMarcas);
    notifyListeners("colores", currentColores);
    notifyListeners("tallas_ropa", currentTallasRopa);
    notifyListeners("tallas_calzado", currentTallasCalzado);
    notifyListeners("unidades", currentUnits);

    return {
      categorias: currentCats,
      marcas: currentMarcas,
      colores: currentColores,
      tallasRopa: currentTallasRopa,
      tallasCalzado: currentTallasCalzado,
      unidades: currentUnits
    };
  },

  // --- CATEGORÍAS ---
  getCategorias: async (): Promise<CategoriaCatalogo[]> => {
    if (isConfigured && realDb) {
      const snap = await getDocs(collection(realDb, "catalogo_categorias"));
      const list: CategoriaCatalogo[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as CategoriaCatalogo);
      });
      return list.filter(item => item.en_papelera !== true).map(rebrandLegacyCatalogBrand);
    }
    const local = getLocalStorageItem<CategoriaCatalogo[]>("categorias", []);
    if (local.length === 0) {
      const res = await firestoreService.seedAndImportCatalogos();
      return res.categorias;
    }
    return local.filter(item => item.en_papelera !== true).map(rebrandLegacyCatalogBrand);
  },

  getCategoriasRealtime: (onUpdate: (cats: CategoriaCatalogo[]) => void): (() => void) => {
    if (isConfigured && realDb) {
      return onSnapshot(
        collection(realDb, "catalogo_categorias"),
        (snap) => {
          const list: CategoriaCatalogo[] = [];
          snap.forEach(d => {
            list.push({ id: d.id, ...d.data() } as CategoriaCatalogo);
          });
          onUpdate(list.filter(item => item.en_papelera !== true).map(rebrandLegacyCatalogBrand));
        },
        (error) => {
          console.error("Error en listener de categorías:", error);
        }
      );
    }

    const update = () => {
      const list = getLocalStorageItem<CategoriaCatalogo[]>("categorias", []);
      onUpdate(list.filter(item => item.en_papelera !== true).map(rebrandLegacyCatalogBrand));
    };
    update();
    listeners.categorias.push(update);
    return () => {
      listeners.categorias = listeners.categorias.filter(cb => cb !== update);
    };
  },

  addCategoria: async (nombre: string): Promise<string> => {
    const cleanNombre = nombre.trim();
    if (!cleanNombre) throw new Error("El nombre de la categoría es obligatorio.");

    const list = await firestoreService.getCategorias();
    const isDuplicate = list.some(c => c.nombre.trim().toLowerCase() === cleanNombre.toLowerCase());
    if (isDuplicate) {
      throw new Error(`La categoría "${cleanNombre}" ya existe en el catálogo.`);
    }

    const newId = "cat_" + Math.random().toString(36).substr(2, 9);
    const newCat: CategoriaCatalogo = {
      id: newId,
      nombre: cleanNombre,
      activa: true,
      creado: new Date()
    };

    if (isConfigured && realDb) {
      const docRef = doc(realDb, "catalogo_categorias", newId);
      await setDoc(docRef, {
        nombre: cleanNombre,
        activa: true,
        creado: Timestamp.now()
      });
      return newId;
    }

    list.push(newCat);
    setLocalStorageItem("categorias", list);
    notifyListeners("categorias", list);
    return newId;
  },

  updateCategoria: async (id: string, data: Partial<Omit<CategoriaCatalogo, "id">>): Promise<void> => {
    if (isConfigured && realDb) {
      const docRef = doc(realDb, "catalogo_categorias", id);
      await setDoc(docRef, data, { merge: true });
      return;
    }
    const list = getLocalStorageItem<CategoriaCatalogo[]>("categorias", []);
    const index = list.findIndex(c => c.id === id);
    if (index !== -1) {
      list[index] = { ...list[index], ...data };
      setLocalStorageItem("categorias", list);
      notifyListeners("categorias", list);
    }
  },

  renameCategoriaAndSyncProducts: async (id: string, oldNombre: string, newNombre: string): Promise<void> => {
    const cleanOld = oldNombre.trim();
    const cleanNew = newNombre.trim();
    if (!cleanNew) throw new Error("El nuevo nombre no puede estar vacío.");

    const cats = await firestoreService.getCategorias();
    const duplicate = cats.some(c => c.id !== id && c.nombre.trim().toLowerCase() === cleanNew.toLowerCase());
    if (duplicate) {
      throw new Error(`Ya existe otra categoría con el nombre "${cleanNew}".`);
    }

    await firestoreService.updateCategoria(id, { nombre: cleanNew });

    if (isConfigured && realDb) {
      const prodsSnap = await getDocs(collection(realDb, "productos"));
      for (const d of prodsSnap.docs) {
        const p = d.data();
        if (p.categoria && p.categoria.trim().toLowerCase() === cleanOld.toLowerCase()) {
          await setDoc(doc(realDb, "productos", d.id), { categoria: cleanNew }, { merge: true });
        }
      }
      return;
    }

    const productos = getLocalStorageItem<Producto[]>("productos", []);
    let modifiedAny = false;

    productos.forEach(p => {
      if (p.categoria && p.categoria.trim().toLowerCase() === cleanOld.toLowerCase()) {
        p.categoria = cleanNew;
        modifiedAny = true;
      }
    });

    if (modifiedAny) {
      setLocalStorageItem("productos", productos);
      notifyListeners("productos", productos);
    }
  },

  toggleCategoriaStatus: async (id: string, activa: boolean): Promise<void> => {
    await firestoreService.updateCategoria(id, { activa });
  },

  deleteCategoria: async (id: string): Promise<void> => {
    if (isConfigured && realDb) {
      await setDoc(doc(realDb, "catalogo_categorias", id), { activa: false, en_papelera: true, desactivado_at: Timestamp.now() }, { merge: true });
      return;
    }
    const list = getLocalStorageItem<CategoriaCatalogo[]>("categorias", []);
    const index = list.findIndex(c => c.id === id);
    if (index !== -1) list[index] = { ...list[index], activa: false, en_papelera: true, desactivado_at: new Date() };
    setLocalStorageItem("categorias", list);
    notifyListeners("categorias", list);
  },

  // --- MARCAS ---
  getMarcas: async (): Promise<MarcaCatalogo[]> => {
    if (isConfigured && realDb) {
      const snap = await getDocs(collection(realDb, "catalogo_marcas"));
      const list: MarcaCatalogo[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as MarcaCatalogo);
      });
      return list.filter(item => item.en_papelera !== true);
    }
    const local = getLocalStorageItem<MarcaCatalogo[]>("marcas", []);
    if (local.length === 0) {
      const res = await firestoreService.seedAndImportCatalogos();
      return res.marcas;
    }
    return local.filter(item => item.en_papelera !== true);
  },

  getMarcasRealtime: (onUpdate: (marcas: MarcaCatalogo[]) => void): (() => void) => {
    if (isConfigured && realDb) {
      return onSnapshot(
        collection(realDb, "catalogo_marcas"),
        (snap) => {
          const list: MarcaCatalogo[] = [];
          snap.forEach(d => {
            list.push({ id: d.id, ...d.data() } as MarcaCatalogo);
          });
          onUpdate(list.filter(item => item.en_papelera !== true));
        },
        (error) => {
          console.error("Error en listener de marcas:", error);
        }
      );
    }

    const update = () => {
      const list = getLocalStorageItem<MarcaCatalogo[]>("marcas", []);
      onUpdate(list.filter(item => item.en_papelera !== true));
    };
    update();
    listeners.marcas.push(update);
    return () => {
      listeners.marcas = listeners.marcas.filter(cb => cb !== update);
    };
  },

  addMarca: async (nombre: string): Promise<string> => {
    const cleanNombre = nombre.trim();
    if (!cleanNombre) throw new Error("El nombre de la marca es obligatorio.");

    const list = await firestoreService.getMarcas();
    const isDuplicate = list.some(m => m.nombre.trim().toLowerCase() === cleanNombre.toLowerCase());
    if (isDuplicate) {
      throw new Error(`La marca "${cleanNombre}" ya existe en el catálogo.`);
    }

    const newId = "mar_" + Math.random().toString(36).substr(2, 9);
    const newMarca: MarcaCatalogo = {
      id: newId,
      nombre: cleanNombre,
      activa: true,
      creado: new Date()
    };

    if (isConfigured && realDb) {
      const docRef = doc(realDb, "catalogo_marcas", newId);
      await setDoc(docRef, {
        nombre: cleanNombre,
        activa: true,
        creado: Timestamp.now()
      });
      return newId;
    }

    list.push(newMarca);
    setLocalStorageItem("marcas", list);
    notifyListeners("marcas", list);
    return newId;
  },

  updateMarca: async (id: string, data: Partial<Omit<MarcaCatalogo, "id">>): Promise<void> => {
    if (isConfigured && realDb) {
      const docRef = doc(realDb, "catalogo_marcas", id);
      await setDoc(docRef, data, { merge: true });
      return;
    }
    const list = getLocalStorageItem<MarcaCatalogo[]>("marcas", []);
    const index = list.findIndex(m => m.id === id);
    if (index !== -1) {
      list[index] = { ...list[index], ...data };
      setLocalStorageItem("marcas", list);
      notifyListeners("marcas", list);
    }
  },

  toggleMarcaStatus: async (id: string, activa: boolean): Promise<void> => {
    await firestoreService.updateMarca(id, { activa });
  },

  deleteMarca: async (id: string): Promise<void> => {
    if (isConfigured && realDb) {
      await setDoc(doc(realDb, "catalogo_marcas", id), { activa: false, en_papelera: true, desactivado_at: Timestamp.now() }, { merge: true });
      return;
    }
    const list = getLocalStorageItem<MarcaCatalogo[]>("marcas", []);
    const index = list.findIndex(m => m.id === id);
    if (index !== -1) list[index] = { ...list[index], activa: false, en_papelera: true, desactivado_at: new Date() };
    setLocalStorageItem("marcas", list);
    notifyListeners("marcas", list);
  },

  // --- COLORES ---
  getColores: async (): Promise<ColorCatalogo[]> => {
    if (isConfigured && realDb) {
      const snap = await getDocs(collection(realDb, "catalogo_colores"));
      const list: ColorCatalogo[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as ColorCatalogo);
      });
      return list.filter(item => item.en_papelera !== true);
    }
    const local = getLocalStorageItem<ColorCatalogo[]>("colores", []);
    if (local.length === 0) {
      const res = await firestoreService.seedAndImportCatalogos();
      return res.colores;
    }
    return local.filter(item => item.en_papelera !== true);
  },

  getColoresRealtime: (onUpdate: (colores: ColorCatalogo[]) => void): (() => void) => {
    if (isConfigured && realDb) {
      return onSnapshot(
        collection(realDb, "catalogo_colores"),
        (snap) => {
          const list: ColorCatalogo[] = [];
          snap.forEach(d => {
            list.push({ id: d.id, ...d.data() } as ColorCatalogo);
          });
          onUpdate(list.filter(item => item.en_papelera !== true));
        },
        (error) => {
          console.error("Error en listener de colores:", error);
        }
      );
    }

    const update = () => {
      const list = getLocalStorageItem<ColorCatalogo[]>("colores", []);
      onUpdate(list.filter(item => item.en_papelera !== true));
    };
    update();
    listeners.colores.push(update);
    return () => {
      listeners.colores = listeners.colores.filter(cb => cb !== update);
    };
  },

  addColor: async (nombre: string, codigo_hex = "#111827"): Promise<string> => {
    const cleanNombre = nombre.trim();
    if (!cleanNombre) throw new Error("El nombre del color es obligatorio.");

    const list = await firestoreService.getColores();
    const isDuplicate = list.some(c => c.nombre.trim().toLowerCase() === cleanNombre.toLowerCase());
    if (isDuplicate) {
      throw new Error(`El color "${cleanNombre}" ya existe en el catálogo.`);
    }

    const newId = "col_" + Math.random().toString(36).substr(2, 9);
    const newColor: ColorCatalogo = {
      id: newId,
      nombre: cleanNombre,
      codigo_hex: codigo_hex.trim() || "#111827",
      activa: true,
      creado: new Date()
    };

    if (isConfigured && realDb) {
      const docRef = doc(realDb, "catalogo_colores", newId);
      await setDoc(docRef, {
        nombre: cleanNombre,
        codigo_hex: newColor.codigo_hex,
        activa: true,
        creado: Timestamp.now()
      });
      return newId;
    }

    list.push(newColor);
    setLocalStorageItem("colores", list);
    notifyListeners("colores", list);
    return newId;
  },

  updateColor: async (id: string, data: Partial<Omit<ColorCatalogo, "id">>): Promise<void> => {
    if (isConfigured && realDb) {
      const docRef = doc(realDb, "catalogo_colores", id);
      await setDoc(docRef, data, { merge: true });
      return;
    }
    const list = getLocalStorageItem<ColorCatalogo[]>("colores", []);
    const index = list.findIndex(c => c.id === id);
    if (index !== -1) {
      list[index] = { ...list[index], ...data };
      setLocalStorageItem("colores", list);
      notifyListeners("colores", list);
    }
  },

  toggleColorStatus: async (id: string, activa: boolean): Promise<void> => {
    await firestoreService.updateColor(id, { activa });
  },

  deleteColor: async (id: string): Promise<void> => {
    if (isConfigured && realDb) {
      await setDoc(doc(realDb, "catalogo_colores", id), { activa: false, en_papelera: true, desactivado_at: Timestamp.now() }, { merge: true });
      return;
    }
    const list = getLocalStorageItem<ColorCatalogo[]>("colores", []);
    const index = list.findIndex(c => c.id === id);
    if (index !== -1) list[index] = { ...list[index], activa: false, en_papelera: true, desactivado_at: new Date() };
    setLocalStorageItem("colores", list);
    notifyListeners("colores", list);
  },

  // --- TALLAS DE ROPA ---
  getTallasRopa: async (): Promise<TallaRopaCatalogo[]> => {
    if (isConfigured && realDb) {
      const snap = await getDocs(collection(realDb, "catalogo_tallas_ropa"));
      const list: TallaRopaCatalogo[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as TallaRopaCatalogo);
      });
      return list.filter(item => item.en_papelera !== true).sort((a, b) => (a.orden || 0) - (b.orden || 0));
    }
    const local = getLocalStorageItem<TallaRopaCatalogo[]>("tallas_ropa", []);
    if (local.length === 0) {
      const res = await firestoreService.seedAndImportCatalogos();
      return res.tallasRopa;
    }
    return local.filter(item => item.en_papelera !== true).sort((a, b) => (a.orden || 0) - (b.orden || 0));
  },

  getTallasRopaRealtime: (onUpdate: (tallas: TallaRopaCatalogo[]) => void): (() => void) => {
    if (isConfigured && realDb) {
      return onSnapshot(
        collection(realDb, "catalogo_tallas_ropa"),
        (snap) => {
          const list: TallaRopaCatalogo[] = [];
          snap.forEach(d => {
            list.push({ id: d.id, ...d.data() } as TallaRopaCatalogo);
          });
          onUpdate(list.filter(item => item.en_papelera !== true).sort((a, b) => (a.orden || 0) - (b.orden || 0)));
        },
        (error) => {
          console.error("Error en listener de tallas ropa:", error);
        }
      );
    }

    const update = () => {
      const list = getLocalStorageItem<TallaRopaCatalogo[]>("tallas_ropa", []);
      onUpdate(list.filter(item => item.en_papelera !== true).sort((a, b) => (a.orden || 0) - (b.orden || 0)));
    };
    update();
    listeners.tallas_ropa.push(update);
    return () => {
      listeners.tallas_ropa = listeners.tallas_ropa.filter(cb => cb !== update);
    };
  },

  addTallaRopa: async (nombre: string, orden?: number): Promise<string> => {
    const cleanNombre = nombre.trim();
    if (!cleanNombre) throw new Error("El nombre de la talla es obligatorio.");

    const list = await firestoreService.getTallasRopa();
    const isDuplicate = list.some(t => t.nombre.trim().toLowerCase() === cleanNombre.toLowerCase());
    if (isDuplicate) {
      throw new Error(`La talla "${cleanNombre}" ya existe en el catálogo.`);
    }

    const calculatedOrder = orden !== undefined ? orden : list.length + 1;
    const newId = "tal_" + Math.random().toString(36).substr(2, 9);
    const newTalla: TallaRopaCatalogo = {
      id: newId,
      nombre: cleanNombre,
      orden: calculatedOrder,
      activa: true,
      creado: new Date()
    };

    if (isConfigured && realDb) {
      const docRef = doc(realDb, "catalogo_tallas_ropa", newId);
      await setDoc(docRef, {
        nombre: cleanNombre,
        orden: calculatedOrder,
        activa: true,
        creado: Timestamp.now()
      });
      return newId;
    }

    list.push(newTalla);
    setLocalStorageItem("tallas_ropa", list);
    notifyListeners("tallas_ropa", list);
    return newId;
  },

  updateTallaRopa: async (id: string, data: Partial<Omit<TallaRopaCatalogo, "id">>): Promise<void> => {
    if (isConfigured && realDb) {
      const docRef = doc(realDb, "catalogo_tallas_ropa", id);
      await setDoc(docRef, data, { merge: true });
      return;
    }
    const list = getLocalStorageItem<TallaRopaCatalogo[]>("tallas_ropa", []);
    const index = list.findIndex(t => t.id === id);
    if (index !== -1) {
      list[index] = { ...list[index], ...data };
      setLocalStorageItem("tallas_ropa", list);
      notifyListeners("tallas_ropa", list);
    }
  },

  toggleTallaRopaStatus: async (id: string, activa: boolean): Promise<void> => {
    await firestoreService.updateTallaRopa(id, { activa });
  },

  deleteTallaRopa: async (id: string): Promise<void> => {
    if (isConfigured && realDb) {
      await setDoc(doc(realDb, "catalogo_tallas_ropa", id), { activa: false, en_papelera: true, desactivado_at: Timestamp.now() }, { merge: true });
      return;
    }
    const list = getLocalStorageItem<TallaRopaCatalogo[]>("tallas_ropa", []);
    const index = list.findIndex(t => t.id === id);
    if (index !== -1) list[index] = { ...list[index], activa: false, en_papelera: true, desactivado_at: new Date() };
    setLocalStorageItem("tallas_ropa", list);
    notifyListeners("tallas_ropa", list);
  },

  // --- TALLAS DE CALZADO ---
  getTallasCalzado: async (): Promise<TallaCalzadoCatalogo[]> => {
    if (isConfigured && realDb) {
      const snap = await getDocs(collection(realDb, "catalogo_tallas_calzado"));
      const list: TallaCalzadoCatalogo[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as TallaCalzadoCatalogo);
      });
      return list.filter(item => item.en_papelera !== true).sort((a, b) => (Number(a.nombre) || 0) - (Number(b.nombre) || 0));
    }
    const local = getLocalStorageItem<TallaCalzadoCatalogo[]>("tallas_calzado", []);
    if (local.length === 0) {
      const res = await firestoreService.seedAndImportCatalogos();
      return res.tallasCalzado;
    }
    return local.filter(item => item.en_papelera !== true).sort((a, b) => (Number(a.nombre) || 0) - (Number(b.nombre) || 0));
  },

  getTallasCalzadoRealtime: (onUpdate: (tallas: TallaCalzadoCatalogo[]) => void): (() => void) => {
    if (isConfigured && realDb) {
      return onSnapshot(
        collection(realDb, "catalogo_tallas_calzado"),
        (snap) => {
          const list: TallaCalzadoCatalogo[] = [];
          snap.forEach(d => {
            list.push({ id: d.id, ...d.data() } as TallaCalzadoCatalogo);
          });
          onUpdate(list.filter(item => item.en_papelera !== true).sort((a, b) => (Number(a.nombre) || 0) - (Number(b.nombre) || 0)));
        },
        (error) => {
          console.error("Error en listener de tallas calzado:", error);
        }
      );
    }

    const update = () => {
      const list = getLocalStorageItem<TallaCalzadoCatalogo[]>("tallas_calzado", []);
      onUpdate(list.filter(item => item.en_papelera !== true).sort((a, b) => (Number(a.nombre) || 0) - (Number(b.nombre) || 0)));
    };
    update();
    listeners.tallas_calzado.push(update);
    return () => {
      listeners.tallas_calzado = listeners.tallas_calzado.filter(cb => cb !== update);
    };
  },

  addTallaCalzado: async (nombre: string, orden?: number): Promise<string> => {
    const cleanNombre = nombre.trim();
    if (!cleanNombre) throw new Error("El número de talla es obligatorio.");

    const list = await firestoreService.getTallasCalzado();
    const isDuplicate = list.some(t => t.nombre.trim().toLowerCase() === cleanNombre.toLowerCase());
    if (isDuplicate) {
      throw new Error(`La talla de calzado "${cleanNombre}" ya existe en el catálogo.`);
    }

    const calculatedOrder = orden !== undefined ? orden : list.length + 1;
    const newId = "cal_" + Math.random().toString(36).substr(2, 9);
    const newTalla: TallaCalzadoCatalogo = {
      id: newId,
      nombre: cleanNombre,
      orden: calculatedOrder,
      activa: true,
      creado: new Date()
    };

    if (isConfigured && realDb) {
      const docRef = doc(realDb, "catalogo_tallas_calzado", newId);
      await setDoc(docRef, {
        nombre: cleanNombre,
        orden: calculatedOrder,
        activa: true,
        creado: Timestamp.now()
      });
      return newId;
    }

    list.push(newTalla);
    setLocalStorageItem("tallas_calzado", list);
    notifyListeners("tallas_calzado", list);
    return newId;
  },

  updateTallaCalzado: async (id: string, data: Partial<Omit<TallaCalzadoCatalogo, "id">>): Promise<void> => {
    if (isConfigured && realDb) {
      const docRef = doc(realDb, "catalogo_tallas_calzado", id);
      await setDoc(docRef, data, { merge: true });
      return;
    }
    const list = getLocalStorageItem<TallaCalzadoCatalogo[]>("tallas_calzado", []);
    const index = list.findIndex(t => t.id === id);
    if (index !== -1) {
      list[index] = { ...list[index], ...data };
      setLocalStorageItem("tallas_calzado", list);
      notifyListeners("tallas_calzado", list);
    }
  },

  toggleTallaCalzadoStatus: async (id: string, activa: boolean): Promise<void> => {
    await firestoreService.updateTallaCalzado(id, { activa });
  },

  deleteTallaCalzado: async (id: string): Promise<void> => {
    if (isConfigured && realDb) {
      await setDoc(doc(realDb, "catalogo_tallas_calzado", id), { activa: false, en_papelera: true, desactivado_at: Timestamp.now() }, { merge: true });
      return;
    }
    const list = getLocalStorageItem<TallaCalzadoCatalogo[]>("tallas_calzado", []);
    const index = list.findIndex(t => t.id === id);
    if (index !== -1) list[index] = { ...list[index], activa: false, en_papelera: true, desactivado_at: new Date() };
    setLocalStorageItem("tallas_calzado", list);
    notifyListeners("tallas_calzado", list);
  },

  // --- UNIDADES DE MEDIDA ---
  getUnidades: async (): Promise<UnidadMedidaCatalogo[]> => {
    if (isConfigured && realDb) {
      const snap = await getDocs(collection(realDb, "catalogo_unidades"));
      const list: UnidadMedidaCatalogo[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as UnidadMedidaCatalogo);
      });
      return list.filter(item => item.en_papelera !== true);
    }
    const local = getLocalStorageItem<UnidadMedidaCatalogo[]>("unidades", []);
    if (local.length === 0) {
      const res = await firestoreService.seedAndImportCatalogos();
      return res.unidades;
    }
    return local.filter(item => item.en_papelera !== true);
  },

  getUnidadesRealtime: (onUpdate: (units: UnidadMedidaCatalogo[]) => void): (() => void) => {
    if (isConfigured && realDb) {
      return onSnapshot(
        collection(realDb, "catalogo_unidades"),
        (snap) => {
          const list: UnidadMedidaCatalogo[] = [];
          snap.forEach(d => {
            list.push({ id: d.id, ...d.data() } as UnidadMedidaCatalogo);
          });
          onUpdate(list.filter(item => item.en_papelera !== true));
        },
        (error) => {
          console.error("Error en listener de unidades:", error);
        }
      );
    }

    const update = () => {
      const list = getLocalStorageItem<UnidadMedidaCatalogo[]>("unidades", []);
      onUpdate(list.filter(item => item.en_papelera !== true));
    };
    update();
    listeners.unidades.push(update);
    return () => {
      listeners.unidades = listeners.unidades.filter(cb => cb !== update);
    };
  },

  addUnidad: async (nombre: string, abreviatura: string): Promise<string> => {
    const cleanNombre = nombre.trim();
    const cleanAbrev = abreviatura.trim().toLowerCase();
    if (!cleanNombre) throw new Error("El nombre de la unidad es obligatorio.");
    if (!cleanAbrev) throw new Error("La abreviatura de la unidad es obligatoria.");

    const list = await firestoreService.getUnidades();
    const duplicateNombre = list.some(u => u.nombre.trim().toLowerCase() === cleanNombre.toLowerCase());
    if (duplicateNombre) {
      throw new Error(`La unidad de medida "${cleanNombre}" ya existe.`);
    }

    const duplicateAbrev = list.some(u => u.abreviatura.trim().toLowerCase() === cleanAbrev);
    if (duplicateAbrev) {
      throw new Error(`La abreviatura "${cleanAbrev}" ya está asignada a otra unidad de medida.`);
    }

    const newId = "uni_" + Math.random().toString(36).substr(2, 9);
    const newUnit: UnidadMedidaCatalogo = {
      id: newId,
      nombre: cleanNombre,
      abreviatura: cleanAbrev,
      activa: true,
      creado: new Date()
    };

    if (isConfigured && realDb) {
      const docRef = doc(realDb, "catalogo_unidades", newId);
      await setDoc(docRef, {
        nombre: cleanNombre,
        abreviatura: cleanAbrev,
        activa: true,
        creado: Timestamp.now()
      });
      return newId;
    }

    list.push(newUnit);
    setLocalStorageItem("unidades", list);
    notifyListeners("unidades", list);
    return newId;
  },

  updateUnidad: async (id: string, data: Partial<Omit<UnidadMedidaCatalogo, "id">>): Promise<void> => {
    if (isConfigured && realDb) {
      const docRef = doc(realDb, "catalogo_unidades", id);
      await setDoc(docRef, data, { merge: true });
      return;
    }
    const list = getLocalStorageItem<UnidadMedidaCatalogo[]>("unidades", []);
    const index = list.findIndex(u => u.id === id);
    if (index !== -1) {
      list[index] = { ...list[index], ...data };
      setLocalStorageItem("unidades", list);
      notifyListeners("unidades", list);
    }
  },

  renameUnidadAndSyncProducts: async (id: string, oldAbreviatura: string, newAbreviatura: string, newNombre: string): Promise<void> => {
    const cleanOldAbrev = oldAbreviatura.trim().toLowerCase();
    const cleanNewAbrev = newAbreviatura.trim().toLowerCase();
    const cleanNewNombre = newNombre.trim();

    if (!cleanNewNombre) throw new Error("El nombre de la unidad no puede estar vacío.");
    if (!cleanNewAbrev) throw new Error("La abreviatura no puede estar vacía.");

    const units = await firestoreService.getUnidades();
    const duplicateNombre = units.some(u => u.id !== id && u.nombre.trim().toLowerCase() === cleanNewNombre.toLowerCase());
    if (duplicateNombre) {
      throw new Error(`Ya existe otra unidad de medida con el nombre "${cleanNewNombre}".`);
    }

    const duplicateAbrev = units.some(u => u.id !== id && u.abreviatura.trim().toLowerCase() === cleanNewAbrev);
    if (duplicateAbrev) {
      throw new Error(`La abreviatura "${cleanNewAbrev}" ya está asignada a otra unidad de medida.`);
    }

    await firestoreService.updateUnidad(id, { nombre: cleanNewNombre, abreviatura: cleanNewAbrev });

    if (isConfigured && realDb) {
      const prodsSnap = await getDocs(collection(realDb, "productos"));
      for (const d of prodsSnap.docs) {
        const p = d.data();
        if ((p.unidad || "").trim().toLowerCase() === cleanOldAbrev) {
          await setDoc(doc(realDb, "productos", d.id), { unidad: cleanNewAbrev }, { merge: true });
        }
      }
      return;
    }

    const productos = getLocalStorageItem<Producto[]>("productos", []);
    let modifiedAny = false;

    productos.forEach(p => {
      const prodUnitLower = (p.unidad || "").trim().toLowerCase();
      if (prodUnitLower === cleanOldAbrev) {
        p.unidad = cleanNewAbrev;
        modifiedAny = true;
      }
    });

    if (modifiedAny) {
      setLocalStorageItem("productos", productos);
      notifyListeners("productos", productos);
    }
  },

  toggleUnidadStatus: async (id: string, activa: boolean): Promise<void> => {
    await firestoreService.updateUnidad(id, { activa });
  },

  deleteUnidad: async (id: string): Promise<void> => {
    if (isConfigured && realDb) {
      await setDoc(doc(realDb, "catalogo_unidades", id), { activa: false, en_papelera: true, desactivado_at: Timestamp.now() }, { merge: true });
      return;
    }
    const list = getLocalStorageItem<UnidadMedidaCatalogo[]>("unidades", []);
    const index = list.findIndex(u => u.id === id);
    if (index !== -1) list[index] = { ...list[index], activa: false, en_papelera: true, desactivado_at: new Date() };
    setLocalStorageItem("unidades", list);
    notifyListeners("unidades", list);
  },

  // --- CATÁLOGOS DE ENTREGA ---
  getUbicacionesEntrega: async (): Promise<UbicacionEntregaCatalogo[]> =>
    getCatalogoEntrega<UbicacionEntregaCatalogo>("catalogo_ubicaciones_entrega", "ubicaciones_entrega"),

  getUbicacionesEntregaRealtime: (onUpdate: (items: UbicacionEntregaCatalogo[]) => void): (() => void) =>
    subscribeCatalogoEntrega<UbicacionEntregaCatalogo>("catalogo_ubicaciones_entrega", "ubicaciones_entrega", onUpdate),

  addUbicacionEntrega: async (nombre: string): Promise<string> =>
    addCatalogoEntrega<UbicacionEntregaCatalogo>("catalogo_ubicaciones_entrega", "ubicaciones_entrega", "ubi", nombre),

  updateUbicacionEntrega: async (id: string, data: Partial<Omit<UbicacionEntregaCatalogo, "id">>): Promise<void> =>
    updateCatalogoEntrega<UbicacionEntregaCatalogo>("catalogo_ubicaciones_entrega", "ubicaciones_entrega", id, data),

  toggleUbicacionEntregaStatus: async (id: string, activa: boolean): Promise<void> =>
    updateCatalogoEntrega<UbicacionEntregaCatalogo>("catalogo_ubicaciones_entrega", "ubicaciones_entrega", id, { activa }),

  deleteUbicacionEntrega: async (id: string): Promise<void> =>
    deleteCatalogoEntrega<UbicacionEntregaCatalogo>("catalogo_ubicaciones_entrega", "ubicaciones_entrega", id),

  getRepartidores: async (): Promise<RepartidorCatalogo[]> =>
    getCatalogoEntrega<RepartidorCatalogo>("catalogo_repartidores", "repartidores"),

  getRepartidoresRealtime: (onUpdate: (items: RepartidorCatalogo[]) => void): (() => void) =>
    subscribeCatalogoEntrega<RepartidorCatalogo>("catalogo_repartidores", "repartidores", onUpdate),

  addRepartidor: async (nombre: string): Promise<string> =>
    addCatalogoEntrega<RepartidorCatalogo>("catalogo_repartidores", "repartidores", "rep", nombre),

  updateRepartidor: async (id: string, data: Partial<Omit<RepartidorCatalogo, "id">>): Promise<void> =>
    updateCatalogoEntrega<RepartidorCatalogo>("catalogo_repartidores", "repartidores", id, data),

  toggleRepartidorStatus: async (id: string, activa: boolean): Promise<void> =>
    updateCatalogoEntrega<RepartidorCatalogo>("catalogo_repartidores", "repartidores", id, { activa }),

  deleteRepartidor: async (id: string): Promise<void> =>
    deleteCatalogoEntrega<RepartidorCatalogo>("catalogo_repartidores", "repartidores", id),

  // --- MÓDULO DE GASTOS (FINANZAS) ---
  getGastosPaginated: async (options: {
    pageSize?: number;
    lastDoc?: any;
    categoriaFilter?: string;
    warehouseFilter?: string;
    metodoPagoFilter?: string;
    startDate?: string;
    endDate?: string;
    searchTerm?: string;
  } = {}): Promise<{
    items: Gasto[];
    lastDoc: any;
    hasMore: boolean;
    totalLoaded: number;
  }> => {
    const pageSize = options.pageSize || 50;

    if (isConfigured && realDb) {
      try {
        const qConstraints: any[] = [orderBy("fecha", "desc"), limit(pageSize + 1)];

        if (options.lastDoc) {
          qConstraints.push(startAfter(options.lastDoc));
        }

        const q = query(collection(realDb, "gastos"), ...qConstraints);
        const snap = await getDocs(q);

        const docs = snap.docs;
        const hasMore = docs.length > pageSize;
        const itemsToProcess = hasMore ? docs.slice(0, pageSize) : docs;
        const nextLastDoc = itemsToProcess.length > 0 ? itemsToProcess[itemsToProcess.length - 1] : null;

        const list: Gasto[] = itemsToProcess.map(d => {
          const data = d.data();
          const item: Gasto = {
            id: d.id,
            concepto: data.concepto || "",
            categoria: data.categoria || "Otros",
            monto: Number(data.monto) || 0,
            fecha: data.fecha ? (data.fecha.toDate ? data.fecha.toDate() : new Date(data.fecha)) : new Date(),
            fecha_str: data.fecha_str || getLocalDateString(data.fecha || new Date()),
            creado_por: data.creado_por || "sistema",
            creado_at: data.creado_at ? (data.creado_at.toDate ? data.creado_at.toDate() : data.creado_at) : new Date(),
            actualizado_at: data.actualizado_at ? (data.actualizado_at.toDate ? data.actualizado_at.toDate() : data.actualizado_at) : new Date(),
            estado: data.estado || "activo",
            en_papelera: data.en_papelera === true,
            desactivado_at: data.desactivado_at ? (data.desactivado_at.toDate ? data.desactivado_at.toDate() : data.desactivado_at) : undefined
          };
          if (data.metodo_pago) item.metodo_pago = data.metodo_pago;
          if (data.almacen_id) item.almacen_id = data.almacen_id;
          if (data.almacen_nombre) item.almacen_nombre = data.almacen_nombre;
          if (data.proveedor) item.proveedor = data.proveedor;
          if (data.referencia) item.referencia = data.referencia;
          if (data.notas) item.notas = data.notas;
          return item;
        });

        return {
          items: list.filter(gasto => gasto.en_papelera !== true),
          lastDoc: nextLastDoc,
          hasMore,
          totalLoaded: list.length
        };
      } catch (err: any) {
        console.error("Error al obtener gastos paginados de Firestore:", err);
        throw err;
      }
    }

    // Modo local exclusivo para desarrollo cuando Firebase NO está configurado
    let list = getLocalStorageItem<Gasto[]>("gastos", []);
    list = list.map(g => ({
      ...g,
      fecha: g.fecha instanceof Date ? g.fecha : new Date(typeof g.fecha === "string" ? g.fecha : (g.fecha as any).seconds * 1000),
      creado_at: g.creado_at instanceof Date ? g.creado_at : new Date(typeof g.creado_at === "string" ? g.creado_at : (g.creado_at as any).seconds * 1000),
      actualizado_at: g.actualizado_at instanceof Date ? g.actualizado_at : new Date(typeof g.actualizado_at === "string" ? g.actualizado_at : (g.actualizado_at as any).seconds * 1000)
    })).filter(gasto => gasto.en_papelera !== true);

    list.sort((a, b) => (b.fecha as Date).getTime() - (a.fecha as Date).getTime());

    const startIndex = typeof options.lastDoc === "number" ? options.lastDoc : 0;
    const pageItems = list.slice(startIndex, startIndex + pageSize);
    const nextIndex = startIndex + pageItems.length;
    const hasMore = nextIndex < list.length;

    return {
      items: pageItems,
      lastDoc: nextIndex,
      hasMore,
      totalLoaded: pageItems.length
    };
  },

  getGastoById: async (id: string): Promise<Gasto | null> => {
    if (!id) return null;

    if (isConfigured && realDb) {
      try {
        const docSnap = await getDoc(doc(realDb, "gastos", id));
        if (docSnap.exists()) {
          const data = docSnap.data();
          const item: Gasto = {
            id: docSnap.id,
            concepto: data.concepto || "",
            categoria: data.categoria || "Otros",
            monto: Number(data.monto) || 0,
            fecha: data.fecha ? (data.fecha.toDate ? data.fecha.toDate() : new Date(data.fecha)) : new Date(),
            fecha_str: data.fecha_str || getLocalDateString(data.fecha || new Date()),
            creado_por: data.creado_por || "sistema",
            creado_at: data.creado_at ? (data.creado_at.toDate ? data.creado_at.toDate() : data.creado_at) : new Date(),
            actualizado_at: data.actualizado_at ? (data.actualizado_at.toDate ? data.actualizado_at.toDate() : data.actualizado_at) : new Date()
          };
          if (data.metodo_pago) item.metodo_pago = data.metodo_pago;
          if (data.almacen_id) item.almacen_id = data.almacen_id;
          if (data.almacen_nombre) item.almacen_nombre = data.almacen_nombre;
          if (data.proveedor) item.proveedor = data.proveedor;
          if (data.referencia) item.referencia = data.referencia;
          if (data.notas) item.notas = data.notas;
          return item;
        }
        return null;
      } catch (err: any) {
        console.error("Error al obtener gasto por ID de Firestore:", err);
        throw err;
      }
    }

    const list = getLocalStorageItem<Gasto[]>("gastos", []);
    const found = list.find(g => g.id === id);
    if (!found) return null;

    return {
      ...found,
      fecha: found.fecha instanceof Date ? found.fecha : new Date(typeof found.fecha === "string" ? found.fecha : (found.fecha as any).seconds * 1000),
      creado_at: found.creado_at instanceof Date ? found.creado_at : new Date(typeof found.creado_at === "string" ? found.creado_at : (found.creado_at as any).seconds * 1000),
      actualizado_at: found.actualizado_at instanceof Date ? found.actualizado_at : new Date(typeof found.actualizado_at === "string" ? found.actualizado_at : (found.actualizado_at as any).seconds * 1000)
    };
  },

  addGasto: async (gastoData: {
    concepto: string;
    categoria: CategoriaGasto | string;
    monto: number;
    fecha: Date;
    fecha_str?: string;
    metodo_pago?: MetodoPagoGasto | string;
    almacen_id?: string;
    almacen_nombre?: string;
    proveedor?: string;
    referencia?: string;
    notas?: string;
    clasificacion_financiera?: "operacion" | "inversion_inicial";
  }): Promise<Gasto> => {
    const user = authService.getCurrentUser();
    const cleanConcepto = (gastoData.concepto || "").trim();
    if (!cleanConcepto) {
      throw new Error("El concepto o descripción del gasto es obligatorio.");
    }
    if (cleanConcepto.length > 200) {
      throw new Error("El concepto o descripción del gasto no puede superar 200 caracteres.");
    }
    const cleanCategoria = String(gastoData.categoria || "").trim();
    if (!cleanCategoria) {
      throw new Error("La categoría del gasto es obligatoria.");
    }
    if (cleanCategoria.length > 100) {
      throw new Error("La categoría del gasto no puede superar 100 caracteres.");
    }
    const monto = Number(gastoData.monto);
    if (isNaN(monto) || monto <= 0) {
      throw new Error("El monto del gasto debe ser un número mayor a cero.");
    }
    if (!gastoData.fecha || isNaN(gastoData.fecha.getTime())) {
      throw new Error("La fecha del gasto es obligatoria.");
    }

    const fecha_str = gastoData.fecha_str || getLocalDateString(gastoData.fecha);
    const userEmail = user?.email || "sistema@antiorder.com";

    const payload: any = {
      concepto: cleanConcepto,
      categoria: cleanCategoria,
      monto,
      fecha: isConfigured && realDb ? Timestamp.fromDate(gastoData.fecha) : gastoData.fecha,
      fecha_str,
      creado_por: userEmail,
      creado_at: isConfigured && realDb ? Timestamp.now() : new Date(),
      actualizado_at: isConfigured && realDb ? Timestamp.now() : new Date()
    };
    payload.clasificacion_financiera = gastoData.clasificacion_financiera === "inversion_inicial" ? "inversion_inicial" : "operacion";

    if (gastoData.metodo_pago && typeof gastoData.metodo_pago === "string" && gastoData.metodo_pago.trim()) {
      const cleanMetodo = gastoData.metodo_pago.trim();
      if (cleanMetodo.length > 100) {
        throw new Error("El método de pago no puede superar 100 caracteres.");
      }
      payload.metodo_pago = cleanMetodo;
    }
    if (gastoData.almacen_id && gastoData.almacen_id.trim()) {
      payload.almacen_id = gastoData.almacen_id.trim();
    }
    if (gastoData.almacen_nombre && gastoData.almacen_nombre.trim()) {
      payload.almacen_nombre = gastoData.almacen_nombre.trim();
    }
    if (gastoData.proveedor && gastoData.proveedor.trim()) {
      payload.proveedor = gastoData.proveedor.trim();
    }
    if (gastoData.referencia && gastoData.referencia.trim()) {
      payload.referencia = gastoData.referencia.trim();
    }
    if (gastoData.notas && gastoData.notas.trim()) {
      payload.notas = gastoData.notas.trim();
    }

    if (isConfigured && realDb) {
      try {
        const docRef = doc(collection(realDb, "gastos"));
        const periodoKey = getPeriodoKey(gastoData.fecha);
        const periodRef = periodoKey ? doc(realDb, "periodos_financieros", periodoKey) : null;

        await runTransaction(realDb, async (tx) => {
          const periodSnap = periodRef ? await tx.get(periodRef) : null;
          tx.set(docRef, payload);

          if (periodRef && periodoKey) {
            const updatedPeriod = computeNewPeriodIndexData(
              periodSnap?.exists() ? periodSnap.data() : null,
              periodoKey,
              0,
              0,
              1
            );
            tx.set(periodRef, updatedPeriod, { merge: true });
          }
        });

        clearFinanzasCache();
        clearPeriodosFinancierosCache();

        const createdGasto: Gasto = {
          id: docRef.id,
          concepto: cleanConcepto,
          categoria: cleanCategoria,
          monto,
          fecha: gastoData.fecha,
          fecha_str,
          creado_por: userEmail,
          creado_at: new Date(),
          actualizado_at: new Date()
        };
        if (payload.metodo_pago) createdGasto.metodo_pago = payload.metodo_pago;
        if (payload.almacen_id) createdGasto.almacen_id = payload.almacen_id;
        if (payload.almacen_nombre) createdGasto.almacen_nombre = payload.almacen_nombre;
        if (payload.proveedor) createdGasto.proveedor = payload.proveedor;
        if (payload.referencia) createdGasto.referencia = payload.referencia;
        if (payload.notas) createdGasto.notas = payload.notas;
        createdGasto.clasificacion_financiera = payload.clasificacion_financiera;

        return createdGasto;
      } catch (err: any) {
        console.error("Error al registrar gasto en Firestore:", err);
        throw err;
      }
    }

    const newId = "gas_" + Math.random().toString(36).substr(2, 9);
    const createdLocal: Gasto = {
      id: newId,
      concepto: cleanConcepto,
      categoria: cleanCategoria,
      monto,
      fecha: gastoData.fecha,
      fecha_str,
      creado_por: userEmail,
      creado_at: new Date(),
      actualizado_at: new Date()
    };
    if (payload.metodo_pago) createdLocal.metodo_pago = payload.metodo_pago;
    if (payload.almacen_id) createdLocal.almacen_id = payload.almacen_id;
    if (payload.almacen_nombre) createdLocal.almacen_nombre = payload.almacen_nombre;
    if (payload.proveedor) createdLocal.proveedor = payload.proveedor;
    if (payload.referencia) createdLocal.referencia = payload.referencia;
    if (payload.notas) createdLocal.notas = payload.notas;
    createdLocal.clasificacion_financiera = payload.clasificacion_financiera;

    const list = getLocalStorageItem<Gasto[]>("gastos", []);
    list.unshift(createdLocal);
    setLocalStorageItem("gastos", list);
    notifyListeners("gastos", list);
    clearFinanzasCache();
    clearPeriodosFinancierosCache();
    return createdLocal;
  },

  updateGasto: async (id: string, gastoData: {
    concepto?: string;
    categoria?: CategoriaGasto | string;
    monto?: number;
    fecha?: Date;
    fecha_str?: string;
    metodo_pago?: MetodoPagoGasto | string | null;
    almacen_id?: string | null;
    almacen_nombre?: string | null;
    proveedor?: string | null;
    referencia?: string | null;
    notas?: string | null;
    clasificacion_financiera?: "operacion" | "inversion_inicial";
  }): Promise<void> => {
    if (!id) throw new Error("ID de gasto no proporcionado.");

    const updatePayload: any = {
      actualizado_at: isConfigured && realDb ? Timestamp.now() : new Date()
    };
    const fieldsToDeleteInLocal: string[] = [];

    if (gastoData.clasificacion_financiera !== undefined) {
      updatePayload.clasificacion_financiera = gastoData.clasificacion_financiera === "inversion_inicial" ? "inversion_inicial" : "operacion";
    }

    if (gastoData.concepto !== undefined) {
      const cleanConcepto = (gastoData.concepto || "").trim();
      if (!cleanConcepto) throw new Error("El concepto no puede estar vacío.");
      if (cleanConcepto.length > 200) throw new Error("El concepto o descripción del gasto no puede superar 200 caracteres.");
      updatePayload.concepto = cleanConcepto;
    }
    if (gastoData.categoria !== undefined) {
      const cleanCategoria = String(gastoData.categoria || "").trim();
      if (!cleanCategoria) throw new Error("La categoría no puede estar vacía.");
      if (cleanCategoria.length > 100) throw new Error("La categoría del gasto no puede superar 100 caracteres.");
      updatePayload.categoria = cleanCategoria;
    }
    if (gastoData.monto !== undefined) {
      const m = Number(gastoData.monto);
      if (isNaN(m) || m <= 0) throw new Error("El monto debe ser un número positivo mayor a cero.");
      updatePayload.monto = m;
    }
    if (gastoData.fecha !== undefined) {
      if (isNaN(gastoData.fecha.getTime())) throw new Error("Fecha inválida.");
      updatePayload.fecha = isConfigured && realDb ? Timestamp.fromDate(gastoData.fecha) : gastoData.fecha;
      updatePayload.fecha_str = gastoData.fecha_str || getLocalDateString(gastoData.fecha);
    }

    // Método de pago (opcional)
    if (gastoData.metodo_pago !== undefined) {
      const cleanMetodo = typeof gastoData.metodo_pago === "string" ? gastoData.metodo_pago.trim() : "";
      if (cleanMetodo) {
        if (cleanMetodo.length > 100) throw new Error("El método de pago no puede superar 100 caracteres.");
        updatePayload.metodo_pago = cleanMetodo;
      } else {
        if (isConfigured && realDb) {
          updatePayload.metodo_pago = deleteField();
        }
        fieldsToDeleteInLocal.push("metodo_pago");
      }
    }

    // Almacén y nombre de almacén
    if (gastoData.almacen_id !== undefined) {
      const cleanAlmId = typeof gastoData.almacen_id === "string" ? gastoData.almacen_id.trim() : "";
      if (cleanAlmId) {
        updatePayload.almacen_id = cleanAlmId;
        const cleanNombre = typeof gastoData.almacen_nombre === "string" ? gastoData.almacen_nombre.trim() : "";
        if (cleanNombre) {
          updatePayload.almacen_nombre = cleanNombre;
        } else {
          if (isConfigured && realDb) {
            updatePayload.almacen_nombre = deleteField();
          }
          fieldsToDeleteInLocal.push("almacen_nombre");
        }
      } else {
        if (isConfigured && realDb) {
          updatePayload.almacen_id = deleteField();
          updatePayload.almacen_nombre = deleteField();
        }
        fieldsToDeleteInLocal.push("almacen_id", "almacen_nombre");
      }
    }

    // Proveedor (opcional)
    if (gastoData.proveedor !== undefined) {
      const cleanVal = typeof gastoData.proveedor === "string" ? gastoData.proveedor.trim() : "";
      if (cleanVal) {
        updatePayload.proveedor = cleanVal;
      } else {
        if (isConfigured && realDb) {
          updatePayload.proveedor = deleteField();
        }
        fieldsToDeleteInLocal.push("proveedor");
      }
    }

    // Referencia (opcional)
    if (gastoData.referencia !== undefined) {
      const cleanVal = typeof gastoData.referencia === "string" ? gastoData.referencia.trim() : "";
      if (cleanVal) {
        updatePayload.referencia = cleanVal;
      } else {
        if (isConfigured && realDb) {
          updatePayload.referencia = deleteField();
        }
        fieldsToDeleteInLocal.push("referencia");
      }
    }

    // Notas (opcional)
    if (gastoData.notas !== undefined) {
      const cleanVal = typeof gastoData.notas === "string" ? gastoData.notas.trim() : "";
      if (cleanVal) {
        updatePayload.notas = cleanVal;
      } else {
        if (isConfigured && realDb) {
          updatePayload.notas = deleteField();
        }
        fieldsToDeleteInLocal.push("notas");
      }
    }

    if (isConfigured && realDb) {
      try {
        const docRef = doc(realDb, "gastos", id);

        await runTransaction(realDb, async (tx) => {
          const snap = await tx.get(docRef);
          if (!snap.exists()) {
            throw new Error("El gasto a actualizar no existe.");
          }

          const existingData = snap.data();
          const oldPeriodKey = getPeriodoKey(existingData?.fecha);
          const newPeriodKey = updatePayload.fecha !== undefined
            ? getPeriodoKey(updatePayload.fecha)
            : oldPeriodKey;

          let oldPeriodSnap: any = null;
          let newPeriodSnap: any = null;

          if (oldPeriodKey && newPeriodKey && oldPeriodKey !== newPeriodKey) {
            const oldPeriodRef = doc(realDb, "periodos_financieros", oldPeriodKey);
            const newPeriodRef = doc(realDb, "periodos_financieros", newPeriodKey);
            oldPeriodSnap = await tx.get(oldPeriodRef);
            newPeriodSnap = await tx.get(newPeriodRef);

            tx.set(docRef, updatePayload, { merge: true });

            const updatedOld = computeNewPeriodIndexData(
              oldPeriodSnap.exists() ? oldPeriodSnap.data() : null,
              oldPeriodKey,
              0,
              0,
              -1
            );
            tx.set(oldPeriodRef, updatedOld, { merge: true });

            const updatedNew = computeNewPeriodIndexData(
              newPeriodSnap.exists() ? newPeriodSnap.data() : null,
              newPeriodKey,
              0,
              0,
              1
            );
            tx.set(newPeriodRef, updatedNew, { merge: true });
          } else {
            tx.set(docRef, updatePayload, { merge: true });
          }
        });

        clearFinanzasCache();
        clearPeriodosFinancierosCache();
        return;
      } catch (err: any) {
        console.error("Error al actualizar gasto en Firestore:", err);
        throw err;
      }
    }

    const list = getLocalStorageItem<Gasto[]>("gastos", []);
    const idx = list.findIndex(g => g.id === id);
    if (idx !== -1) {
      const existing = { ...list[idx] };
      const parsedUpdate: any = { ...updatePayload };

      for (const field of fieldsToDeleteInLocal) {
        delete (existing as any)[field];
        delete parsedUpdate[field];
      }

      if (updatePayload.fecha && typeof updatePayload.fecha.toDate === "function") {
        parsedUpdate.fecha = updatePayload.fecha.toDate();
      }
      if (updatePayload.actualizado_at && typeof updatePayload.actualizado_at.toDate === "function") {
        parsedUpdate.actualizado_at = updatePayload.actualizado_at.toDate();
      }
      list[idx] = { ...existing, ...parsedUpdate };
      setLocalStorageItem("gastos", list);
      notifyListeners("gastos", list);
      clearFinanzasCache();
      clearPeriodosFinancierosCache();
    }
  },

  deleteGasto: async (id: string): Promise<void> => {
    if (!id) return;

    if (isConfigured && realDb) {
      try {
        const docRef = doc(realDb, "gastos", id);

        await runTransaction(realDb, async (tx) => {
          const snap = await tx.get(docRef);
          if (snap.exists()) {
            const data = snap.data();
            if (data.en_papelera === true) {
              throw new Error("El gasto ya está en la Papelera.");
            }
            const periodoKey = getPeriodoKey(data?.fecha);
            let periodSnap: any = null;
            let periodRef: any = null;
            if (periodoKey) {
              periodRef = doc(realDb, "periodos_financieros", periodoKey);
              periodSnap = await tx.get(periodRef);
            }

            tx.set(docRef, {
              estado: "inactivo",
              en_papelera: true,
              desactivado_at: Timestamp.now(),
              actualizado_at: Timestamp.now()
            }, { merge: true });

            if (periodRef && periodoKey) {
              const updated = computeNewPeriodIndexData(
                periodSnap?.exists() ? periodSnap.data() : null,
                periodoKey,
                0,
                0,
                -1
              );
              tx.set(periodRef, updated, { merge: true });
            }
          }
        });

        clearFinanzasCache();
        clearPeriodosFinancierosCache();
        return;
      } catch (err: any) {
        console.error("Error al eliminar gasto en Firestore:", err);
        throw err;
      }
    }

    const list = getLocalStorageItem<Gasto[]>("gastos", []);
    const index = list.findIndex(g => g.id === id);
    if (index !== -1) {
      if (list[index].en_papelera === true) throw new Error("El gasto ya está en la Papelera.");
      list[index] = { ...list[index], estado: "inactivo", en_papelera: true, desactivado_at: new Date(), actualizado_at: new Date() };
    }
    setLocalStorageItem("gastos", list);
    notifyListeners("gastos", list);
    clearFinanzasCache();
    clearPeriodosFinancierosCache();
  },

  restaurarGastoPapelera: async (id: string): Promise<void> => {
    if (!id) throw new Error("ID de gasto no proporcionado.");
    if (isConfigured && realDb) {
      const gastoRef = doc(realDb, "gastos", id);
      await runTransaction(realDb, async transaction => {
        const gastoSnap = await transaction.get(gastoRef);
        if (!gastoSnap.exists()) throw new Error("El gasto no existe.");
        const data = gastoSnap.data();
        if (data.en_papelera !== true) throw new Error("El gasto ya está activo.");
        const periodoKey = getPeriodoKey(data.fecha);
        const periodRef = periodoKey ? doc(realDb!, "periodos_financieros", periodoKey) : null;
        const periodSnap = periodRef ? await transaction.get(periodRef) : null;
        transaction.set(gastoRef, { estado: "activo", en_papelera: false, desactivado_at: deleteField(), actualizado_at: Timestamp.now() }, { merge: true });
        if (periodRef && periodoKey) transaction.set(periodRef, computeNewPeriodIndexData(periodSnap?.exists() ? periodSnap.data() : null, periodoKey, 0, 0, 1), { merge: true });
      });
      clearFinanzasCache(); clearPeriodosFinancierosCache();
      return;
    }
    const list = getLocalStorageItem<Gasto[]>("gastos", []);
    const index = list.findIndex(gasto => gasto.id === id);
    if (index === -1) throw new Error("El gasto no existe.");
    const restored = { ...list[index], estado: "activo" as const, en_papelera: false, actualizado_at: new Date() };
    delete restored.desactivado_at;
    list[index] = restored;
    setLocalStorageItem("gastos", list); notifyListeners("gastos", list);
    clearFinanzasCache(); clearPeriodosFinancierosCache();
  },

  getPapeleraItems: async (): Promise<PapeleraItem[]> => {
    const toDateSafe = (value: any): Date | undefined => {
      if (!value) return undefined;
      if (value instanceof Date) return value;
      if (typeof value.toDate === "function") return value.toDate();
      if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? undefined : parsed;
    };
    const makeItem = (tipo: PapeleraTipo, id: string, titulo: string, detalle: string, data: any, agrupadorId?: string): PapeleraItem => ({
      key: `${tipo}:${agrupadorId || id}`,
      tipo,
      id,
      titulo,
      detalle,
      fecha: toDateSafe(data.desactivado_at || data.anulado_at || data.actualizado_at || data.fecha || data.creado_at),
      agrupadorId
    });

    if (isConfigured && realDb) {
      const collectionNames = [
        "clientes", "drops", "movimientos", "compras", "gastos", "productos", "almacenes",
        "catalogo_categorias", "catalogo_marcas", "catalogo_colores", "catalogo_tallas_ropa",
        "catalogo_tallas_calzado", "catalogo_unidades", "catalogo_ubicaciones_entrega", "catalogo_repartidores"
      ] as const;
      const snapshots = await Promise.all(collectionNames.map(name => getDocs(query(collection(realDb!, name), where("en_papelera", "==", true)))));
      const byName = new Map(collectionNames.map((name, index) => [name, snapshots[index]]));
      const items: PapeleraItem[] = [];
      byName.get("clientes")?.docs.forEach(item => { const data = item.data(); items.push(makeItem("cliente", item.id, data.nombre_completo || "Cliente sin nombre", data.tipo_cliente || "Cliente", data)); });
      byName.get("drops")?.docs.forEach(item => { const data = item.data(); items.push(makeItem("drop", item.id, data.nombre || "Drop sin nombre", data.descripcion || "Drop comercial", data)); });

      const purchaseIds = new Set(byName.get("compras")?.docs.map(item => item.id) || []);
      byName.get("compras")?.docs.forEach(item => { const data = item.data(); items.push(makeItem("compra", item.id, data.folio || item.id, `${data.proveedor || "Sin proveedor"} · $${Number(data.total || 0).toFixed(2)}`, data)); });
      const groupedSales = new Set<string>();
      const trashedMovements = [...(byName.get("movimientos")?.docs || [])].sort((a, b) => Number(Boolean(b.data().venta_id)) - Number(Boolean(a.data().venta_id)));
      trashedMovements.forEach(item => {
        const data = item.data();
        if (data.compra_id && purchaseIds.has(data.compra_id)) return;
        const groupedSaleId = data.venta_id || data.venta_relacionada_id;
        if (groupedSaleId) {
          if (groupedSales.has(groupedSaleId)) return;
          groupedSales.add(groupedSaleId);
          items.push(makeItem("venta", item.id, data.folio || "Venta", `${data.cliente_nombre || "Mostrador"} · ${data.venta_total_partidas || 1} partida(s)`, data, groupedSaleId));
          return;
        }
        items.push(makeItem("movimiento", item.id, data.folio || item.id, `${data.tipo || "movimiento"} · ${data.sku || "Sin SKU"} · ${Number(data.cantidad || 0)} uds`, data));
      });
      byName.get("gastos")?.docs.forEach(item => { const data = item.data(); items.push(makeItem("gasto", item.id, data.concepto || "Gasto", `${data.categoria || "Otros"} · $${Number(data.monto || 0).toFixed(2)}`, data)); });
      byName.get("productos")?.docs.forEach(item => { const data = item.data(); items.push(makeItem("producto", item.id, data.nombre || item.id, `SKU ${item.id}`, data)); });
      byName.get("almacenes")?.docs.forEach(item => { const data = item.data(); items.push(makeItem("almacen", item.id, data.nombre || "Almacén", data.ubicacion || "Sin ubicación", data)); });
      const catalogMap: Array<[typeof collectionNames[number], PapeleraTipo]> = [
        ["catalogo_categorias", "categoria"], ["catalogo_marcas", "marca"], ["catalogo_colores", "color"],
        ["catalogo_tallas_ropa", "talla_ropa"], ["catalogo_tallas_calzado", "talla_calzado"], ["catalogo_unidades", "unidad"],
        ["catalogo_ubicaciones_entrega", "ubicacion_entrega"], ["catalogo_repartidores", "repartidor"]
      ];
      catalogMap.forEach(([collectionName, tipo]) => byName.get(collectionName)?.docs.forEach(item => { const data = item.data(); items.push(makeItem(tipo, item.id, data.nombre || data.abreviatura || item.id, "Elemento de catálogo", data)); }));
      return items.sort((a, b) => (b.fecha?.getTime() || 0) - (a.fecha?.getTime() || 0));
    }

    const items: PapeleraItem[] = [];
    getLocalClientes().filter(item => item.en_papelera).forEach(item => items.push(makeItem("cliente", item.id || "", item.nombre_completo, item.tipo_cliente, item)));
    getLocalStorageItem<Drop[]>("drops", []).filter(item => item.en_papelera).forEach(item => items.push(makeItem("drop", item.id, item.nombre, item.descripcion || "Drop comercial", item)));
    const compras = getLocalStorageItem<Compra[]>("compras", []).filter(item => item.en_papelera);
    const purchaseIds = new Set(compras.map(item => item.id));
    compras.forEach(item => items.push(makeItem("compra", item.id || "", item.folio, `${item.proveedor} · $${Number(item.total || 0).toFixed(2)}`, item)));
    const groupedSales = new Set<string>();
    getLocalStorageItem<Movimiento[]>("movimientos", []).filter(item => item.en_papelera).sort((a, b) => Number(Boolean(b.venta_id)) - Number(Boolean(a.venta_id))).forEach(item => {
      if (item.compra_id && purchaseIds.has(item.compra_id)) return;
      const groupedSaleId = item.venta_id || item.venta_relacionada_id;
      if (groupedSaleId) {
        if (groupedSales.has(groupedSaleId)) return;
        groupedSales.add(groupedSaleId);
        items.push(makeItem("venta", item.id || "", item.folio || "Venta", `${item.cliente_nombre || "Mostrador"} · ${item.venta_total_partidas || 1} partida(s)`, item, groupedSaleId));
      } else items.push(makeItem("movimiento", item.id || "", item.folio || item.id || "Movimiento", `${item.tipo} · ${item.sku} · ${item.cantidad} uds`, item));
    });
    getLocalStorageItem<Gasto[]>("gastos", []).filter(item => item.en_papelera).forEach(item => items.push(makeItem("gasto", item.id || "", item.concepto, `${item.categoria} · $${Number(item.monto || 0).toFixed(2)}`, item)));
    getLocalStorageItem<Producto[]>("productos", []).filter(item => item.en_papelera).forEach(item => items.push(makeItem("producto", item.sku, item.nombre, `SKU ${item.sku}`, item)));
    getLocalStorageItem<Almacen[]>("almacenes", []).filter(item => item.en_papelera).forEach(item => items.push(makeItem("almacen", item.id, item.nombre, item.ubicacion, item)));
    const localCatalogs: Array<[string, PapeleraTipo]> = [["categorias", "categoria"], ["marcas", "marca"], ["colores", "color"], ["tallas_ropa", "talla_ropa"], ["tallas_calzado", "talla_calzado"], ["unidades", "unidad"], ["ubicaciones_entrega", "ubicacion_entrega"], ["repartidores", "repartidor"]];
    localCatalogs.forEach(([key, tipo]) => getLocalStorageItem<any[]>(key, []).filter(item => item.en_papelera).forEach(item => items.push(makeItem(tipo, item.id, item.nombre || item.abreviatura || item.id, "Elemento de catálogo", item))));
    return items.sort((a, b) => (b.fecha?.getTime() || 0) - (a.fecha?.getTime() || 0));
  },

  vaciarPapelera: async (): Promise<number> => {
    const collectionNames = [
      "clientes", "drops", "ventas", "movimientos", "compras", "gastos", "productos", "almacenes",
      "catalogo_categorias", "catalogo_marcas", "catalogo_colores", "catalogo_tallas_ropa",
      "catalogo_tallas_calzado", "catalogo_unidades", "catalogo_ubicaciones_entrega", "catalogo_repartidores"
    ] as const;

    if (isConfigured && realDb) {
      const snapshots = await Promise.all(
        collectionNames.map(collectionName =>
          getDocs(query(collection(realDb!, collectionName), where("en_papelera", "==", true)))
        )
      );
      const documentRefs = snapshots.flatMap(snapshot => snapshot.docs.map(document => document.ref));

      // Firestore limita cada lote a 500 operaciones. Dejamos margen para mantener
      // este proceso seguro si la Papelera acumula muchos registros de prueba.
      for (let index = 0; index < documentRefs.length; index += 400) {
        const batch = writeBatch(realDb);
        documentRefs.slice(index, index + 400).forEach(documentRef => batch.delete(documentRef));
        await batch.commit();
      }

      clearFinanzasCache();
      clearPeriodosFinancierosCache();
      return documentRefs.length;
    }

    const localCollections: Array<{ storageKey: string; listenerKey?: keyof typeof listeners }> = [
      { storageKey: "clientes", listenerKey: "clientes" },
      { storageKey: "drops" },
      { storageKey: "ventas_maestras", listenerKey: "movimientos" },
      { storageKey: "movimientos", listenerKey: "movimientos" },
      { storageKey: "compras", listenerKey: "compras" },
      { storageKey: "gastos", listenerKey: "gastos" },
      { storageKey: "productos", listenerKey: "productos" },
      { storageKey: "almacenes", listenerKey: "almacenes" },
      { storageKey: "categorias", listenerKey: "categorias" },
      { storageKey: "marcas", listenerKey: "marcas" },
      { storageKey: "colores", listenerKey: "colores" },
      { storageKey: "tallas_ropa", listenerKey: "tallas_ropa" },
      { storageKey: "tallas_calzado", listenerKey: "tallas_calzado" },
      { storageKey: "unidades", listenerKey: "unidades" },
      { storageKey: "ubicaciones_entrega", listenerKey: "ubicaciones_entrega" },
      { storageKey: "repartidores", listenerKey: "repartidores" }
    ];
    let deletedCount = 0;
    localCollections.forEach(({ storageKey, listenerKey }) => {
      const current = getLocalStorageItem<any[]>(storageKey, []);
      const remaining = current.filter(item => item.en_papelera !== true);
      deletedCount += current.length - remaining.length;
      setLocalStorageItem(storageKey, remaining);
      if (listenerKey) notifyListeners(listenerKey, remaining);
    });
    clearFinanzasCache();
    clearPeriodosFinancierosCache();
    return deletedCount;
  },

  restaurarPapeleraItem: async (item: PapeleraItem): Promise<void> => {
    if (item.tipo === "cliente") return firestoreService.restaurarClientePapelera(item.id);
    if (item.tipo === "drop") return firestoreService.restaurarDropPapelera(item.id);
    if (item.tipo === "venta" || item.tipo === "movimiento") return firestoreService.restaurarMovimientoPapelera(item.id);
    if (item.tipo === "compra") return firestoreService.restaurarCompraPapelera(item.id);
    if (item.tipo === "gasto") return firestoreService.restaurarGastoPapelera(item.id);

    const config: Record<string, { collection: string; localKey: string; activeField: "activo" | "activa" }> = {
      producto: { collection: "productos", localKey: "productos", activeField: "activo" },
      almacen: { collection: "almacenes", localKey: "almacenes", activeField: "activo" },
      categoria: { collection: "catalogo_categorias", localKey: "categorias", activeField: "activa" },
      marca: { collection: "catalogo_marcas", localKey: "marcas", activeField: "activa" },
      color: { collection: "catalogo_colores", localKey: "colores", activeField: "activa" },
      talla_ropa: { collection: "catalogo_tallas_ropa", localKey: "tallas_ropa", activeField: "activa" },
      talla_calzado: { collection: "catalogo_tallas_calzado", localKey: "tallas_calzado", activeField: "activa" },
      unidad: { collection: "catalogo_unidades", localKey: "unidades", activeField: "activa" },
      ubicacion_entrega: { collection: "catalogo_ubicaciones_entrega", localKey: "ubicaciones_entrega", activeField: "activa" },
      repartidor: { collection: "catalogo_repartidores", localKey: "repartidores", activeField: "activa" }
    };
    const target = config[item.tipo];
    if (!target) throw new Error("Tipo de registro no compatible con Papelera.");
    if (isConfigured && realDb) {
      await setDoc(doc(realDb, target.collection, item.id), { [target.activeField]: true, en_papelera: false, desactivado_at: deleteField() }, { merge: true });
      return;
    }
    const list = getLocalStorageItem<any[]>(target.localKey, []);
    const index = list.findIndex(entry => (entry.id || entry.sku) === item.id);
    if (index === -1) throw new Error("El registro ya no existe.");
    list[index] = { ...list[index], [target.activeField]: true, en_papelera: false };
    delete list[index].desactivado_at;
    setLocalStorageItem(target.localKey, list);
    notifyListeners(target.localKey as keyof typeof listeners, list);
  },

  addMovimientoFinanciero: async (input: {
    tipo: TipoMovimientoFinanciero;
    concepto: string;
    monto: number;
    fecha: Date;
    fecha_str: string;
    metodo_pago?: string;
    notas?: string;
  }): Promise<MovimientoFinancieroManual> => {
    const tiposValidos: TipoMovimientoFinanciero[] = ["aportacion_capital", "otro_ingreso", "retiro_propietario", "ajuste_entrada", "ajuste_salida"];
    const concepto = input.concepto.trim();
    const monto = Math.round((Number(input.monto) + Number.EPSILON) * 100) / 100;
    if (!tiposValidos.includes(input.tipo)) throw new Error("Selecciona un tipo de movimiento válido.");
    if (!concepto || concepto.length > 200) throw new Error("El concepto es obligatorio y no puede superar 200 caracteres.");
    if (!Number.isFinite(monto) || monto <= 0) throw new Error("El monto debe ser mayor a cero.");
    if (!(input.fecha instanceof Date) || isNaN(input.fecha.getTime())) throw new Error("La fecha no es válida.");
    if ((input.tipo === "ajuste_entrada" || input.tipo === "ajuste_salida") && !input.notas?.trim()) {
      throw new Error("Los ajustes de caja requieren una explicación.");
    }
    const now = new Date();
    const userEmail = realAuth?.currentUser?.email || getLocalStorageItem<Usuario | null>("currentUser", null)?.email || "Sistema";
    const base = {
      tipo: input.tipo,
      concepto,
      monto,
      fecha: input.fecha,
      fecha_str: input.fecha_str,
      ...(input.metodo_pago?.trim() ? { metodo_pago: input.metodo_pago.trim() } : {}),
      ...(input.notas?.trim() ? { notas: input.notas.trim() } : {}),
      creado_por: userEmail,
      creado_at: now,
      actualizado_at: now,
      estado: "activo" as const
    };
    let created: MovimientoFinancieroManual;
    if (isConfigured && realDb) {
      const ref = doc(collection(realDb, "movimientos_financieros"));
      const payload = { ...base, fecha: Timestamp.fromDate(input.fecha), creado_at: Timestamp.now(), actualizado_at: Timestamp.now() };
      await setDoc(ref, payload);
      created = { id: ref.id, ...base };
    } else {
      const list = getLocalStorageItem<MovimientoFinancieroManual[]>("movimientos_financieros", []);
      created = { id: `MF-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ...base };
      setLocalStorageItem("movimientos_financieros", [created, ...list]);
    }
    const periodo = getPeriodoKey(input.fecha);
    if (periodo) await applyPeriodIndexDeltas([{ periodo, deltaMovimientosManuales: 1 }]);
    clearFinanzasCache();
    clearPeriodosFinancierosCache();
    return created;
  },

  anularMovimientoFinanciero: async (id: string, motivo: string): Promise<void> => {
    const cleanReason = motivo.trim();
    if (!cleanReason || cleanReason.length > 500) throw new Error("Indica un motivo válido para anular el movimiento.");
    const userEmail = realAuth?.currentUser?.email || getLocalStorageItem<Usuario | null>("currentUser", null)?.email || "Sistema";
    let fecha: any = null;
    if (isConfigured && realDb) {
      const ref = doc(realDb, "movimientos_financieros", id);
      const snapshot = await getDoc(ref);
      if (!snapshot.exists()) throw new Error("El movimiento financiero ya no existe.");
      const data = snapshot.data();
      if (data.estado === "anulado") return;
      fecha = data.fecha;
      await setDoc(ref, { estado: "anulado", motivo_anulacion: cleanReason, anulado_at: Timestamp.now(), anulado_por: userEmail, actualizado_at: Timestamp.now() }, { merge: true });
    } else {
      const list = getLocalStorageItem<MovimientoFinancieroManual[]>("movimientos_financieros", []);
      const index = list.findIndex(item => item.id === id);
      if (index < 0) throw new Error("El movimiento financiero ya no existe.");
      if (list[index].estado === "anulado") return;
      fecha = list[index].fecha;
      list[index] = { ...list[index], estado: "anulado", motivo_anulacion: cleanReason, anulado_at: new Date(), anulado_por: userEmail, actualizado_at: new Date() };
      setLocalStorageItem("movimientos_financieros", list);
    }
    const periodo = getPeriodoKey(fecha);
    if (periodo) await applyPeriodIndexDeltas([{ periodo, deltaMovimientosManuales: -1 }]);
    clearFinanzasCache();
    clearPeriodosFinancierosCache();
  },

  setClasificacionFinanciera: async (origen: "compra" | "gasto", id: string, clasificacion: "operacion" | "inversion_inicial"): Promise<void> => {
    if (!id) throw new Error("No se pudo identificar el registro.");
    if (!(["operacion", "inversion_inicial"] as string[]).includes(clasificacion)) throw new Error("Clasificación financiera no válida.");
    const collectionName = origen === "compra" ? "compras" : "gastos";
    if (isConfigured && realDb) {
      await setDoc(doc(realDb, collectionName, id), { clasificacion_financiera: clasificacion, actualizado_at: Timestamp.now() }, { merge: true });
    } else {
      const list = getLocalStorageItem<any[]>(collectionName, []);
      const index = list.findIndex(item => item.id === id);
      if (index < 0) throw new Error("El registro ya no existe.");
      list[index] = { ...list[index], clasificacion_financiera: clasificacion, actualizado_at: new Date() };
      setLocalStorageItem(collectionName, list);
    }
    clearFinanzasCache();
  },

  getCuentasPorCobrar: async (): Promise<CuentaPorCobrar[]> => {
    let sales: Venta[] = [];
    if (isConfigured && realDb) {
      const snapshot = await getDocs(query(collection(realDb, "ventas"), orderBy("fecha", "desc")));
      sales = snapshot.docs.map(item => {
        const data = item.data();
        const fecha = data.fecha?.toDate ? data.fecha.toDate() : data.fecha?.seconds ? new Date(data.fecha.seconds * 1000) : new Date(data.fecha || Date.now());
        return { id: item.id, ...data, fecha } as Venta;
      });
    } else {
      sales = getLocalStorageItem<Venta[]>("ventas_maestras", []);
    }
    return sales
      .filter(sale => sale.estado !== "anulado" && sale.estado !== "devuelto" && sale.en_papelera !== true && Math.max(0, Number(sale.saldo) || 0) > 0.009)
      .map(sale => ({
        venta_id: sale.id,
        folio: sale.folio,
        fecha: sale.fecha instanceof Date ? sale.fecha : (sale.fecha as any)?.seconds ? new Date((sale.fecha as any).seconds * 1000) : new Date(sale.fecha as any),
        cliente_nombre: sale.cliente_nombre || "Mostrador",
        total: Number(sale.total) || 0,
        cobrado: Number(sale.recibido) || 0,
        pendiente: Math.max(0, Number(sale.saldo) || 0),
        estado_pago: sale.estado_pago || "pendiente",
        canal_venta_nombre: sale.canal_venta_nombre || "Venta"
      }))
      .sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  },

  getResumenFinancieroConsolidado: async (scope: { alcance: "todo" } | { alcance: "mes"; year: number; month: number }): Promise<ResumenFinancieroConsolidado> => {
    const toSafeDate = (value: any): Date => value instanceof Date ? value : value?.toDate ? value.toDate() : value?.seconds ? new Date(value.seconds * 1000) : new Date(value || Date.now());
    const isMonth = scope.alcance === "mes";
    const start = isMonth ? new Date(scope.year, scope.month - 1, 1, 0, 0, 0, 0) : null;
    const end = isMonth ? new Date(scope.year, scope.month, 1, 0, 0, 0, 0) : null;
    let rawSales: Movimiento[] = [];
    let rawPurchases: Compra[] = [];
    let rawExpenses: Gasto[] = [];
    let rawManual: MovimientoFinancieroManual[] = [];

    if (isConfigured && realDb) {
      const startTs = start ? Timestamp.fromDate(start) : null;
      const endTs = end ? Timestamp.fromDate(end) : null;
      const salesQuery = isMonth
        ? query(collection(realDb, "movimientos"), where("tipo", "==", "salida"), where("fecha", ">=", startTs), where("fecha", "<", endTs), orderBy("fecha", "desc"))
        : query(collection(realDb, "movimientos"), where("tipo", "==", "salida"), orderBy("fecha", "desc"));
      const purchaseQuery = isMonth
        ? query(collection(realDb, "compras"), where("fecha", ">=", startTs), where("fecha", "<", endTs), orderBy("fecha", "desc"))
        : query(collection(realDb, "compras"), orderBy("fecha", "desc"));
      const expenseQuery = isMonth
        ? query(collection(realDb, "gastos"), where("fecha", ">=", startTs), where("fecha", "<", endTs), orderBy("fecha", "desc"))
        : query(collection(realDb, "gastos"), orderBy("fecha", "desc"));
      const manualQuery = isMonth
        ? query(collection(realDb, "movimientos_financieros"), where("fecha", ">=", startTs), where("fecha", "<", endTs), orderBy("fecha", "desc"))
        : query(collection(realDb, "movimientos_financieros"), orderBy("fecha", "desc"));
      const [salesSnap, purchasesSnap, expensesSnap, manualSnap] = await Promise.all([
        getDocs(salesQuery), getDocs(purchaseQuery), getDocs(expenseQuery), getDocs(manualQuery)
      ]);
      rawSales = salesSnap.docs.map(item => ({ id: item.id, ...item.data(), fecha: toSafeDate(item.data().fecha) } as Movimiento));
      rawPurchases = purchasesSnap.docs.map(item => ({ id: item.id, ...item.data(), fecha: toSafeDate(item.data().fecha) } as Compra));
      rawExpenses = expensesSnap.docs.map(item => ({ id: item.id, ...item.data(), fecha: toSafeDate(item.data().fecha) } as Gasto));
      rawManual = manualSnap.docs.map(item => ({ id: item.id, ...item.data(), fecha: toSafeDate(item.data().fecha), creado_at: toSafeDate(item.data().creado_at), actualizado_at: toSafeDate(item.data().actualizado_at) } as MovimientoFinancieroManual));
    } else {
      const inScope = (value: any) => {
        if (!isMonth || !start || !end) return true;
        const time = toSafeDate(value).getTime();
        return time >= start.getTime() && time < end.getTime();
      };
      rawSales = getLocalStorageItem<Movimiento[]>("movimientos", []).filter(item => item.tipo === "salida" && inScope(item.fecha));
      rawPurchases = getLocalStorageItem<Compra[]>("compras", []).filter(item => inScope(item.fecha));
      rawExpenses = getLocalStorageItem<Gasto[]>("gastos", []).filter(item => inScope(item.fecha));
      rawManual = getLocalStorageItem<MovimientoFinancieroManual[]>("movimientos_financieros", []).filter(item => inScope(item.fecha));
    }

    const movements: MovimientoFinancieroFila[] = [];
    let ingresosVentas = 0;
    let costosAsociadosVentas = 0;
    const saleIds = new Set<string>();
    rawSales.filter(item => (item.estado || "activo") !== "anulado" && item.en_papelera !== true).forEach(item => {
      const saleKey = item.venta_id || item.venta_relacionada_id || item.folio || item.id || "venta";
      if (item.subtipo !== "reembolso_venta") saleIds.add(saleKey);
      let recognized = 0;
      if (typeof item.venta_total_recibido === "number") recognized = Number(item.ingreso_reconocido) || 0;
      else if (typeof item.total_cobrado === "number") recognized = Number(item.total_cobrado) || 0;
      else if (typeof item.total_venta === "number") recognized = Number(item.total_venta) || 0;
      else recognized = (Number(item.precio_unitario_venta) || 0) * (Number(item.cantidad) || 0);
      ingresosVentas += recognized;
      const saleCosts = Math.max(0, Number(item.total_costos_venta) || ((Number(item.costo_envio_venta) || 0) + (Number(item.otros_costos_venta) || 0)));
      costosAsociadosVentas += saleCosts;
      if (Math.abs(recognized) > 0.009) {
        movements.push({ id: `venta-${item.id || saleKey}`, fecha: toSafeDate(item.fecha), tipo: "venta", origen: item.folio || "Venta", concepto: item.referencia || (item.subtipo === "reembolso_venta" ? "Reembolso de venta" : "Cobro de venta"), entrada: Math.max(0, recognized), salida: Math.max(0, -recognized), estado: "Activo", referencia: saleKey });
      }
      if (saleCosts > 0) movements.push({ id: `costo-venta-${item.id || saleKey}`, fecha: toSafeDate(item.fecha), tipo: "gasto", origen: item.folio || "Venta", concepto: "Costos asociados a la venta", entrada: 0, salida: saleCosts, estado: "Activo", referencia: saleKey, clasificacion: "operacion" });
    });

    let comprasOperativas = 0;
    let gastosOperativos = 0;
    let inversionInicial = 0;
    const activePurchases = rawPurchases.filter(item => (item.estado || "completada") !== "anulada" && item.en_papelera !== true);
    activePurchases.forEach(item => {
      const amount = Number(item.total) || 0;
      const classification = item.clasificacion_financiera === "inversion_inicial" ? "inversion_inicial" : "operacion";
      if (classification === "inversion_inicial") inversionInicial += amount; else comprasOperativas += amount;
      movements.push({ id: `compra-${item.id || item.folio}`, fecha: toSafeDate(item.fecha), tipo: "compra", origen: item.folio || "Compra", concepto: item.proveedor || "Compra de mercancía", entrada: 0, salida: amount, estado: "Activa", referencia: item.id, clasificacion: classification, editable: Boolean(item.id) });
    });
    const activeExpenses = rawExpenses.filter(item => item.estado !== "inactivo" && item.en_papelera !== true);
    activeExpenses.forEach(item => {
      const amount = Number(item.monto) || 0;
      const classification = item.clasificacion_financiera === "inversion_inicial" ? "inversion_inicial" : "operacion";
      if (classification === "inversion_inicial") inversionInicial += amount; else gastosOperativos += amount;
      movements.push({ id: `gasto-${item.id || item.concepto}`, fecha: toSafeDate(item.fecha), tipo: "gasto", origen: item.categoria || "Gasto", concepto: item.concepto, entrada: 0, salida: amount, estado: "Activo", referencia: item.id, clasificacion: classification, editable: Boolean(item.id) });
    });

    let otrosIngresos = 0;
    let aportacionesCapital = 0;
    let retirosPropietario = 0;
    let ajustesEntrada = 0;
    let ajustesSalida = 0;
    rawManual.filter(item => item.estado !== "anulado").forEach(item => {
      const amount = Number(item.monto) || 0;
      let entrada = 0;
      let salida = 0;
      let type: MovimientoFinancieroFila["tipo"] = "ajuste";
      if (item.tipo === "otro_ingreso") { otrosIngresos += amount; entrada = amount; type = "otro_ingreso"; }
      if (item.tipo === "aportacion_capital") { aportacionesCapital += amount; entrada = amount; type = "capital"; }
      if (item.tipo === "retiro_propietario") { retirosPropietario += amount; salida = amount; type = "retiro"; }
      if (item.tipo === "ajuste_entrada") { ajustesEntrada += amount; entrada = amount; }
      if (item.tipo === "ajuste_salida") { ajustesSalida += amount; salida = amount; }
      movements.push({ id: `manual-${item.id}`, fecha: toSafeDate(item.fecha), tipo: type, origen: "Movimiento manual", concepto: item.concepto, entrada, salida, estado: "Activo", referencia: item.id, editable: true });
    });

    const receivables = await firestoreService.getCuentasPorCobrar();
    const pendientePorCobrar = receivables.reduce((sum, item) => sum + item.pendiente, 0);
    const entradasOperativas = ingresosVentas + otrosIngresos;
    const egresosOperativos = comprasOperativas + gastosOperativos + costosAsociadosVentas;
    const flujoOperativo = entradasOperativas - egresosOperativos;
    const movimientoCaja = entradasOperativas + aportacionesCapital + ajustesEntrada - egresosOperativos - inversionInicial - retirosPropietario - ajustesSalida;

    const graphMap = new Map<string, { clave: string; etiqueta: string; ingresos: number; egresos: number }>();
    movements.forEach(item => {
      const date = item.fecha;
      const key = isMonth ? String(date.getDate()).padStart(2, "0") : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const label = isMonth ? String(date.getDate()) : date.toLocaleDateString("es-MX", { month: "short", year: "2-digit" });
      const point = graphMap.get(key) || { clave: key, etiqueta: label, ingresos: 0, egresos: 0 };
      point.ingresos += item.entrada;
      point.egresos += item.salida;
      graphMap.set(key, point);
    });
    const graph = Array.from(graphMap.values()).sort((a, b) => a.clave.localeCompare(b.clave));
    movements.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
    return {
      alcance: scope.alcance,
      ...(isMonth ? { year: scope.year, month: scope.month } : {}),
      ingresosVentas, otrosIngresos, entradasOperativas, comprasOperativas, gastosOperativos, costosAsociadosVentas,
      egresosOperativos, inversionInicial, flujoOperativo, aportacionesCapital, retirosPropietario, ajustesEntrada,
      ajustesSalida, movimientoCaja, pendientePorCobrar, numCuentasPorCobrar: receivables.length, numVentas: saleIds.size,
      numCompras: activePurchases.length, numGastos: activeExpenses.length, grafica: graph, movimientos: movements
    };
  },

  // --- DASHBOARD FINANCIERO MENSUAL (FLUJO DE DINERO) ---
  getDatosFinancierosMensuales: async (
    year: number,
    month: number,
    forceRefresh: boolean = false
  ): Promise<DatosFinancierosMensuales> => {
    const cacheKey = `${year}-${String(month).padStart(2, "0")}`;
    if (!forceRefresh && finanzasMonthlyCache.has(cacheKey)) {
      return finanzasMonthlyCache.get(cacheKey)!;
    }

    // Calcular intervalo exacto de mes en hora local de México:
    // inicioMes a las 00:00:00.000
    // inicioMesSiguiente a las 00:00:00.000
    const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const startOfNextMonth = new Date(year, month, 1, 0, 0, 0, 0);

    let rawVentas: Movimiento[] = [];
    let rawCompras: Compra[] = [];
    let rawGastos: Gasto[] = [];

    if (isConfigured && realDb) {
      try {
        const startTimestamp = Timestamp.fromDate(startOfMonth);
        const endTimestamp = Timestamp.fromDate(startOfNextMonth);

        // 1. Consulta de Ventas (tipo == "salida", fecha >= start, fecha < end, orderBy fecha desc)
        const qVentas = query(
          collection(realDb, "movimientos"),
          where("tipo", "==", "salida"),
          where("fecha", ">=", startTimestamp),
          where("fecha", "<", endTimestamp),
          orderBy("fecha", "desc")
        );

        // 2. Consulta de Compras (fecha >= start, fecha < end, orderBy fecha desc)
        const qCompras = query(
          collection(realDb, "compras"),
          where("fecha", ">=", startTimestamp),
          where("fecha", "<", endTimestamp),
          orderBy("fecha", "desc")
        );

        // 3. Consulta de Gastos (fecha >= start, fecha < end, orderBy fecha desc)
        const qGastos = query(
          collection(realDb, "gastos"),
          where("fecha", ">=", startTimestamp),
          where("fecha", "<", endTimestamp),
          orderBy("fecha", "desc")
        );

        // Ejecutar las tres consultas independientes en paralelo
        const [snapVentas, snapCompras, snapGastos] = await Promise.all([
          getDocs(qVentas),
          getDocs(qCompras),
          getDocs(qGastos)
        ]);

        rawVentas = snapVentas.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            folio: data.folio,
            venta_id: data.venta_id,
            venta_relacionada_id: data.venta_relacionada_id || undefined,
            subtipo: data.subtipo || undefined,
            venta_partida: typeof data.venta_partida === "number" ? data.venta_partida : undefined,
            venta_total_partidas: typeof data.venta_total_partidas === "number" ? data.venta_total_partidas : undefined,
            venta_subtotal: typeof data.venta_subtotal === "number" ? data.venta_subtotal : undefined,
            venta_total_cobrado: typeof data.venta_total_cobrado === "number" ? data.venta_total_cobrado : undefined,
            venta_total_costos: typeof data.venta_total_costos === "number" ? data.venta_total_costos : undefined,
            canal_venta: data.canal_venta || undefined,
            canal_venta_nombre: data.canal_venta_nombre || undefined,
            porcentaje_precio: typeof data.porcentaje_precio === "number" ? data.porcentaje_precio : undefined,
            afecta_stock: typeof data.afecta_stock === "boolean" ? data.afecta_stock : undefined,
            anticipo_porcentaje: typeof data.anticipo_porcentaje === "number" ? data.anticipo_porcentaje : undefined,
            venta_total_recibido: typeof data.venta_total_recibido === "number" ? data.venta_total_recibido : undefined,
            venta_saldo_pendiente: typeof data.venta_saldo_pendiente === "number" ? data.venta_saldo_pendiente : undefined,
            ingreso_reconocido: typeof data.ingreso_reconocido === "number" ? data.ingreso_reconocido : undefined,
            unidades_devueltas: typeof data.unidades_devueltas === "number" ? data.unidades_devueltas : undefined,
            estado_pago: data.estado_pago || undefined,
            sku: data.sku,
            almacen_id: data.almacen_id,
            tipo: data.tipo,
            cantidad: Number(data.cantidad) || 0,
            referencia: data.referencia,
            usuario: data.usuario,
            fecha: data.fecha
              ? (data.fecha as Timestamp).toDate
                ? (data.fecha as Timestamp).toDate()
                : new Date(typeof data.fecha === "string" ? data.fecha : (data.fecha as any).seconds * 1000)
              : new Date(),
            almacen_destino_id: data.almacen_destino_id,
            compra_id: data.compra_id,
            lote_id: data.lote_id,
            costo_unitario: typeof data.costo_unitario === "number" ? data.costo_unitario : undefined,
            cliente_id: data.cliente_id,
            cliente_nombre: data.cliente_nombre,
            cliente_tipo: data.cliente_tipo,
            precio_unitario_venta: typeof data.precio_unitario_venta === "number" ? data.precio_unitario_venta : undefined,
            total_venta: typeof data.total_venta === "number" ? data.total_venta : undefined,
            envio_cobrado_cliente: typeof data.envio_cobrado_cliente === "number" ? data.envio_cobrado_cliente : undefined,
            otros_cargos_cliente: typeof data.otros_cargos_cliente === "number" ? data.otros_cargos_cliente : undefined,
            concepto_otros_cargos: data.concepto_otros_cargos || undefined,
            costo_envio_venta: typeof data.costo_envio_venta === "number" ? data.costo_envio_venta : undefined,
            otros_costos_venta: typeof data.otros_costos_venta === "number" ? data.otros_costos_venta : undefined,
            concepto_otros_costos: data.concepto_otros_costos || undefined,
            total_cobrado: typeof data.total_cobrado === "number" ? data.total_cobrado : undefined,
            total_costos_venta: typeof data.total_costos_venta === "number" ? data.total_costos_venta : undefined,
            comentarios_venta: data.comentarios_venta || undefined,
            ubicacion_entrega_id: data.ubicacion_entrega_id || undefined,
            ubicacion_entrega_nombre: data.ubicacion_entrega_nombre || undefined,
            repartidor_id: data.repartidor_id || undefined,
            repartidor_nombre: data.repartidor_nombre || undefined,
            estado: data.estado || "activo",
            anulado_at: data.anulado_at
              ? (data.anulado_at as Timestamp).toDate
                ? (data.anulado_at as Timestamp).toDate()
                : new Date(data.anulado_at)
              : undefined,
            anulado_por: data.anulado_por,
            motivo_anulacion: data.motivo_anulacion,
            en_papelera: data.en_papelera === true
          };
        });

        rawCompras = snapCompras.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            folio: data.folio,
            proveedor: data.proveedor,
            fecha: data.fecha
              ? (data.fecha as Timestamp).toDate
                ? (data.fecha as Timestamp).toDate()
                : new Date(typeof data.fecha === "string" ? data.fecha : (data.fecha as any).seconds * 1000)
              : new Date(),
            fecha_str: data.fecha_str,
            almacen_id: data.almacen_id,
            items: data.items || [],
            total_unidades: Number(data.total_unidades) || 0,
            subtotal: Number(data.subtotal) || 0,
            costo_envio: Number(data.costo_envio) || 0,
            comisiones: Number(data.comisiones) || 0,
            descuentos: Number(data.descuentos) || 0,
            total: Number(data.total) || 0,
            referencia: data.referencia || "",
            notas: data.notas || "",
            creado_por: data.creado_por || "",
            creado_at: data.creado_at
              ? (data.creado_at as Timestamp).toDate
                ? (data.creado_at as Timestamp).toDate()
                : new Date(data.creado_at)
              : new Date(),
            estado: data.estado || "completada"
          };
        });

        rawGastos = snapGastos.docs.map(d => {
          const data = d.data();
          const item: Gasto = {
            id: d.id,
            concepto: data.concepto || "",
            categoria: data.categoria || "Otros",
            monto: Number(data.monto) || 0,
            fecha: data.fecha
              ? (data.fecha as Timestamp).toDate
                ? (data.fecha as Timestamp).toDate()
                : new Date(typeof data.fecha === "string" ? data.fecha : (data.fecha as any).seconds * 1000)
              : new Date(),
            fecha_str: data.fecha_str || "",
            creado_por: data.creado_por || "",
            creado_at: data.creado_at
              ? (data.creado_at as Timestamp).toDate
                ? (data.creado_at as Timestamp).toDate()
                : new Date(data.creado_at)
              : new Date(),
            actualizado_at: data.actualizado_at
              ? (data.actualizado_at as Timestamp).toDate
                ? (data.actualizado_at as Timestamp).toDate()
                : new Date(data.actualizado_at)
              : new Date(),
            estado: data.estado || "activo",
            en_papelera: data.en_papelera === true
          };
          if (data.metodo_pago) item.metodo_pago = data.metodo_pago;
          if (data.almacen_id) item.almacen_id = data.almacen_id;
          if (data.almacen_nombre) item.almacen_nombre = data.almacen_nombre;
          if (data.proveedor) item.proveedor = data.proveedor;
          if (data.referencia) item.referencia = data.referencia;
          if (data.notas) item.notas = data.notas;
          return item;
        });
      } catch (err: any) {
        console.error("Error al consultar datos financieros mensuales de Firestore:", err);
        const isIndexErr =
          err?.code === "failed-precondition" ||
          (err?.message && (err.message.includes("index") || err.message.includes("indexes")));

        if (isIndexErr) {
          throw new Error(
            "El índice de Firestore necesario para consultar este periodo no está disponible todavía. Revisa la sección Índices de Firebase y vuelve a intentarlo cuando aparezca como habilitado."
          );
        }
        // NO usar localStorage como fallback si Firebase está configurado y devuelve error
        throw err;
      }
    } else {
      // Modo emulador local: filtrar únicamente los registros del intervalo solicitado
      const startTime = startOfMonth.getTime();
      const endTime = startOfNextMonth.getTime();

      const allMovs = getLocalStorageItem<Movimiento[]>("movimientos", []);
      rawVentas = allMovs.filter(m => {
        if (m.tipo !== "salida") return false;
        const d = m.fecha instanceof Date ? m.fecha : new Date(typeof m.fecha === "string" ? m.fecha : (m.fecha as any).seconds * 1000);
        const t = d.getTime();
        return t >= startTime && t < endTime;
      });

      const allCompras = getLocalStorageItem<Compra[]>("compras", []);
      rawCompras = allCompras.filter(c => {
        const d = c.fecha instanceof Date ? c.fecha : new Date(typeof c.fecha === "string" ? c.fecha : (c.fecha as any).seconds * 1000);
        const t = d.getTime();
        return t >= startTime && t < endTime;
      });

      const allGastos = getLocalStorageItem<Gasto[]>("gastos", []);
      rawGastos = allGastos.filter(g => {
        if (g.en_papelera === true || g.estado === "inactivo") return false;
        const d = g.fecha instanceof Date ? g.fecha : new Date(typeof g.fecha === "string" ? g.fecha : (g.fecha as any).seconds * 1000);
        const t = d.getTime();
        return t >= startTime && t < endTime;
      });
    }

    rawGastos = rawGastos.filter(g => g.en_papelera !== true && g.estado !== "inactivo");

    // 1. Filtrar ventas activas (no anuladas)
    const activeVentas = rawVentas.filter(m => (m.estado || "activo") !== "anulado" && m.en_papelera !== true);
    let ingresosMercanciaVendida = 0;
    let enviosCobradosClientes = 0;
    let otrosCargosClientes = 0;
    let costosEnvioVentas = 0;
    let otrosCostosVentas = 0;
    let unidadesVendidas = 0;
    const ventasActivasIds = new Set<string>();
    const ventasConCostosIds = new Set<string>();
    const ventasSinImporteIds = new Set<string>();

    for (const v of activeVentas) {
      const ventaKey = v.venta_id || v.venta_relacionada_id || v.folio || v.id || `venta-${ventasActivasIds.size + 1}`;
      if (v.subtipo !== "reembolso_venta") ventasActivasIds.add(ventaKey);
      const qty = v.subtipo === "reembolso_venta" ? -(Number(v.unidades_devueltas) || 0) : v.subtipo ? 0 : (Number(v.cantidad) || 0);
      unidadesVendidas += qty;

      const usaIngresoReconocido = typeof v.venta_total_recibido === "number" && !isNaN(v.venta_total_recibido);
      let mercanciaVal = 0;
      let envioCobrado = 0;
      let otrosCargos = 0;
      if (usaIngresoReconocido) {
        const recognizedAmount = typeof v.ingreso_reconocido === "number" && !isNaN(v.ingreso_reconocido)
          ? v.ingreso_reconocido
          : 0;
        const allocation = allocateRecognizedSaleIncome({
          recognizedAmount,
          merchandiseSubtotal: Number(v.venta_subtotal) || 0,
          shippingCharged: Number(v.envio_cobrado_cliente) || 0,
          otherCharges: Number(v.otros_cargos_cliente) || 0
        });
        mercanciaVal = allocation.merchandise;
        envioCobrado = allocation.shipping;
        otrosCargos = allocation.other;
      } else if (typeof v.total_venta === "number" && !isNaN(v.total_venta)) {
        mercanciaVal = v.total_venta;
      } else if (typeof v.precio_unitario_venta === "number" && !isNaN(v.precio_unitario_venta)) {
        mercanciaVal = v.precio_unitario_venta * qty;
      } else {
        ventasSinImporteIds.add(ventaKey);
      }

      if (!usaIngresoReconocido) {
        envioCobrado = typeof v.envio_cobrado_cliente === "number" && !isNaN(v.envio_cobrado_cliente)
          ? Math.max(0, v.envio_cobrado_cliente)
          : 0;
        otrosCargos = typeof v.otros_cargos_cliente === "number" && !isNaN(v.otros_cargos_cliente)
          ? Math.max(0, v.otros_cargos_cliente)
          : 0;
      }

      ingresosMercanciaVendida += mercanciaVal;
      enviosCobradosClientes += envioCobrado;
      otrosCargosClientes += otrosCargos;

      const costoEnvio = typeof v.costo_envio_venta === "number" && !isNaN(v.costo_envio_venta)
        ? Math.max(0, v.costo_envio_venta)
        : 0;
      const otrosCostos = typeof v.otros_costos_venta === "number" && !isNaN(v.otros_costos_venta)
        ? Math.max(0, v.otros_costos_venta)
        : 0;
      const costosVenta = typeof v.total_costos_venta === "number" && !isNaN(v.total_costos_venta)
        ? v.total_costos_venta
        : (costoEnvio + otrosCostos);

      costosEnvioVentas += costoEnvio;
      otrosCostosVentas += otrosCostos;
      if (costosVenta > 0) {
        ventasConCostosIds.add(ventaKey);
      }
    }

    const ingresosExtraVentas = enviosCobradosClientes + otrosCargosClientes;
    const ingresosVentas = ingresosMercanciaVendida + enviosCobradosClientes + otrosCargosClientes;
    const costosAsociadosVentas = costosEnvioVentas + otrosCostosVentas;

    // 2. Filtrar compras activas (no anuladas)
    const activeCompras = rawCompras.filter(c => (c.estado || "completada") !== "anulada");
    let comprasTotales = 0;
    let subtotalCompras = 0;
    let descuentosCompras = 0;
    let costoEnvioCompras = 0;
    let comisionesCompras = 0;
    let unidadesCompradas = 0;

    for (const c of activeCompras) {
      comprasTotales += Number(c.total) || 0;
      subtotalCompras += Number(c.subtotal) || 0;
      descuentosCompras += Number(c.descuentos) || 0;
      costoEnvioCompras += Number(c.costo_envio) || 0;
      comisionesCompras += Number(c.comisiones) || 0;
      const units = Number(c.total_unidades) || (Array.isArray(c.items) ? c.items.reduce((acc, it) => acc + (Number(it.cantidad) || 0), 0) : 0);
      unidadesCompradas += units;
    }

    const mercanciaNeta = Math.max(0, subtotalCompras - descuentosCompras);
    const gastosAsociadosCompras = costoEnvioCompras + comisionesCompras;

    // 3. Gastos operativos y desglose
    let gastosOperativos = 0;
    const catMap: Record<string, number> = {};

    for (const g of rawGastos) {
      const m = Number(g.monto) || 0;
      gastosOperativos += m;
      const cat = (g.categoria || "Otros").trim();
      catMap[cat] = (catMap[cat] || 0) + m;
    }

    const gastosPorCategoria = Object.entries(catMap)
      .map(([categoria, monto]) => ({
        categoria,
        monto,
        porcentaje: gastosOperativos > 0 ? (monto / gastosOperativos) * 100 : 0
      }))
      .sort((a, b) => b.monto - a.monto);

    // 4. Totales y balance
    const otrosGastos = gastosOperativos + costosAsociadosVentas;
    const egresosTotales = comprasTotales + gastosOperativos + costosAsociadosVentas;
    const balanceNetoFlujo = ingresosVentas - egresosTotales;

    // 5. Agrupación diaria
    const daysInMonth = new Date(year, month, 0).getDate();
    const dailyData: FinanzasDiaPunto[] = Array.from({ length: daysInMonth }, (_, i) => {
      const dia = i + 1;
      const fechaStr = `${year}-${String(month).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
      return {
        dia,
        diaLabel: String(dia),
        fechaStr,
        ingresos: 0,
        egresos: 0,
        compras: 0,
        otrosGastos: 0
      };
    });

    const getDayFromItemDate = (itemDate: any): number => {
      if (!itemDate) return 0;
      const d = itemDate instanceof Date 
        ? itemDate 
        : (typeof itemDate.toDate === "function" ? itemDate.toDate() : (itemDate.seconds ? new Date(itemDate.seconds * 1000) : new Date(itemDate)));
      if (isNaN(d.getTime())) return 0;
      return d.getDate();
    };

    for (const v of activeVentas) {
      const day = getDayFromItemDate(v.fecha);
      if (day >= 1 && day <= daysInMonth) {
        let ingresoVenta = 0;
        if (typeof v.venta_total_recibido === "number" && !isNaN(v.venta_total_recibido)) {
          ingresoVenta = typeof v.ingreso_reconocido === "number" && !isNaN(v.ingreso_reconocido) ? v.ingreso_reconocido : 0;
        } else if (typeof v.total_cobrado === "number" && !isNaN(v.total_cobrado)) {
          ingresoVenta = v.total_cobrado;
        } else {
          let mercancia = 0;
          if (typeof v.total_venta === "number" && !isNaN(v.total_venta)) {
            mercancia = v.total_venta;
          } else if (typeof v.precio_unitario_venta === "number" && !isNaN(v.precio_unitario_venta)) {
            mercancia = v.precio_unitario_venta * (Number(v.cantidad) || 0);
          }
          const envioCobrado = typeof v.envio_cobrado_cliente === "number" && !isNaN(v.envio_cobrado_cliente) ? Math.max(0, v.envio_cobrado_cliente) : 0;
          const otrosCargos = typeof v.otros_cargos_cliente === "number" && !isNaN(v.otros_cargos_cliente) ? Math.max(0, v.otros_cargos_cliente) : 0;
          ingresoVenta = mercancia + envioCobrado + otrosCargos;
        }
        dailyData[day - 1].ingresos += ingresoVenta;

        const costoEnvio = typeof v.costo_envio_venta === "number" && !isNaN(v.costo_envio_venta) ? Math.max(0, v.costo_envio_venta) : 0;
        const otrosCostos = typeof v.otros_costos_venta === "number" && !isNaN(v.otros_costos_venta) ? Math.max(0, v.otros_costos_venta) : 0;
        const costosVenta = typeof v.total_costos_venta === "number" && !isNaN(v.total_costos_venta) ? v.total_costos_venta : (costoEnvio + otrosCostos);
        if (costosVenta > 0) {
          dailyData[day - 1].otrosGastos += costosVenta;
          dailyData[day - 1].egresos += costosVenta;
        }
      }
    }

    for (const c of activeCompras) {
      const day = getDayFromItemDate(c.fecha);
      if (day >= 1 && day <= daysInMonth) {
        const val = Number(c.total) || 0;
        dailyData[day - 1].compras += val;
        dailyData[day - 1].egresos += val;
      }
    }

    for (const g of rawGastos) {
      const day = getDayFromItemDate(g.fecha);
      if (day >= 1 && day <= daysInMonth) {
        const val = Number(g.monto) || 0;
        dailyData[day - 1].otrosGastos += val;
        dailyData[day - 1].egresos += val;
      }
    }

    const result: DatosFinancierosMensuales = {
      year,
      month,
      ingresosVentas,
      comprasTotales,
      mercanciaNeta,
      gastosAsociadosCompras,
      descuentosCompras,
      otrosGastos,
      egresosTotales,
      balanceNetoFlujo,

      ingresosMercanciaVendida,
      enviosCobradosClientes,
      otrosCargosClientes,
      ingresosExtraVentas,

      gastosOperativos,
      costosEnvioVentas,
      otrosCostosVentas,
      costosAsociadosVentas,
      numVentasConCostos: ventasConCostosIds.size,

      numVentas: ventasActivasIds.size,
      unidadesVendidas,
      numCompras: activeCompras.length,
      unidadesCompradas,
      numGastos: rawGastos.length,
      ventasSinImporte: ventasSinImporteIds.size,
      gastosPorCategoria,
      dailyData
    };

    finanzasMonthlyCache.set(cacheKey, result);
    return result;
  }
};
