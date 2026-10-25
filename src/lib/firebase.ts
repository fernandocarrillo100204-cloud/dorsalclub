Warning: truncated output (original token count: 81510)
Total output lines: 7145

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
  PapeleraTipo
} from "../types";
import {
  getPeriodoKey,
  getPeriodContribution,
  computeNewPeriodIndexData,
  applyPeriodIndexDeltas,
  getPeriodosFinancierosDisponibles,
  clearPeriodosFinancierosCache
} from "./periodosFinancieros";
import { allocateRecognizedSaleIncome, calculateSaleTotals, requiresSaleRefund } from "./ventasCore";

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
        total_venta: Math.round((precioUnitario * cantidad + Number.EPSILON) * 100) / …51510 tokens truncated…orageItem<Producto[]>("productos", []);
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
  }): Promise<void> => {
    if (!id) throw new Error("ID de gasto no proporcionado.");

    const updatePayload: any = {
      actualizado_at: isConfigured && realDb ? Timestamp.now() : new Date()
    };
    const fieldsToDeleteInLocal: string[] = [];

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
        "clientes", "movimientos", "compras", "gastos", "productos", "almacenes",
        "catalogo_categorias", "catalogo_marcas", "catalogo_colores", "catalogo_tallas_ropa",
        "catalogo_tallas_calzado", "catalogo_unidades", "catalogo_ubicaciones_entrega", "catalogo_repartidores"
      ] as const;
      const snapshots = await Promise.all(collectionNames.map(name => getDocs(query(collection(realDb!, name), where("en_papelera", "==", true)))));
      const byName = new Map(collectionNames.map((name, index) => [name, snapshots[index]]));
      const items: PapeleraItem[] = [];
      byName.get("clientes")?.docs.forEach(item => { const data = item.data(); items.push(makeItem("cliente", item.id, data.nombre_completo || "Cliente sin nombre", data.tipo_cliente || "Cliente", data)); });

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
      "clientes", "ventas", "movimientos", "compras", "gastos", "productos", "almacenes",
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

    const localCollections: Array<{ storageKey: string; listenerKey: keyof typeof listeners }> = [
      { storageKey: "clientes", listenerKey: "clientes" },
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
      notifyListeners(listenerKey, remaining);
    });
    clearFinanzasCache();
    clearPeriodosFinancierosCache();
    return deletedCount;
  },

  restaurarPapeleraItem: async (item: PapeleraItem): Promise<void> => {
    if (item.tipo === "cliente") return firestoreService.restaurarClientePapelera(item.id);
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
