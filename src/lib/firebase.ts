/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getFirestore,
  initializeFirestore,
  setLogLevel,
  collection, 
  doc, 
  getDocs, 
  getDoc,
  setDoc,
  addDoc, 
  deleteDoc,
  onSnapshot, 
  runTransaction, 
  writeBatch,
  query, 
  where, 
  orderBy,
  limit,
  startAfter,
  Timestamp
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
  Usuario, 
  CategoriaCatalogo, 
  MarcaCatalogo,
  ColorCatalogo,
  TallaRopaCatalogo,
  TallaCalzadoCatalogo,
  UnidadMedidaCatalogo,
  ResumenVentaDiaria,
  Compra,
  CompraItem
} from "../types";

// Silence non-critical network retry noise from Firestore client
try {
  setLogLevel("error");
} catch {
  // Ignore if not supported in runtime
}

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
        experimentalAutoDetectLongPolling: true,
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

const getLocalStorageItem = <T>(key: string, defaultValue: T): T => {
  const value = localStorage.getItem(STORAGE_PREFIX + key);
  if (!value) return defaultValue;
  try {
    return JSON.parse(value) as T;
  } catch (e) {
    console.error(`Error parsing localStorage key ${key}:`, e);
    return defaultValue;
  }
};

const setLocalStorageItem = <T>(key: string, value: T): void => {
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
};

initializeLocalEmulator();

export const isRealFirebase = isConfigured;

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
        email: "usuario@dorsalclub.com",
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

// --- SERVICIO DE FIRESTORE / INVENTARIO ---
export const firestoreService = {
  isConfigured: () => isConfigured,

  // --- ALMACENES ---
  getAlmacenes: async (): Promise<Almacen[]> => {
    if (isConfigured && realDb) {
      const snap = await getDocs(collection(realDb, "almacenes"));
      const list: Almacen[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as Almacen);
      });
      return list;
    }
    return getLocalStorageItem<Almacen[]>("almacenes", []);
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
          onUpdate(list);
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
      onUpdate(list);
    };
    update();
    listeners.almacenes.push(update);
    return () => {
      listeners.almacenes = listeners.almacenes.filter(cb => cb !== update);
    };
  },

  addAlmacen: async (almacen: Omit<Almacen, "id">): Promise<string> => {
    if (isConfigured && realDb) {
      const docRef = await addDoc(collection(realDb, "almacenes"), almacen);
      return docRef.id;
    }
    const list = getLocalStorageItem<Almacen[]>("almacenes", []);
    const newId = "alm_" + Math.random().toString(36).substr(2, 9);
    const newItem: Almacen = { id: newId, ...almacen };
    list.push(newItem);
    setLocalStorageItem("almacenes", list);
    notifyListeners("almacenes", list);
    return newId;
  },

  updateAlmacen: async (id: string, data: Partial<Omit<Almacen, "id">>): Promise<void> => {
    if (isConfigured && realDb) {
      const docRef = doc(realDb, "almacenes", id);
      await setDoc(docRef, data, { merge: true });
      return;
    }
    const list = getLocalStorageItem<Almacen[]>("almacenes", []);
    const index = list.findIndex(a => a.id === id);
    if (index !== -1) {
      list[index] = { ...list[index], ...data };
      setLocalStorageItem("almacenes", list);
      notifyListeners("almacenes", list);
    }
  },

  deleteAlmacen: async (id: string): Promise<void> => {
    if (isConfigured && realDb) {
      const docRef = doc(realDb, "almacenes", id);
      await deleteDoc(docRef);
      return;
    }
    const list = getLocalStorageItem<Almacen[]>("almacenes", []);
    const filtered = list.filter(a => a.id !== id);
    setLocalStorageItem("almacenes", filtered);
    notifyListeners("almacenes", filtered);
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

  // --- PRODUCTOS ---
  getProductos: async (): Promise<Producto[]> => {
    if (isConfigured && realDb) {
      const snap = await getDocs(collection(realDb, "productos"));
      const list: Producto[] = [];
      snap.forEach(d => {
        list.push({ sku: d.id, ...d.data() } as Producto);
      });
      return list;
    }
    return getLocalStorageItem<Producto[]>("productos", []);
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
          onUpdate(list);
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
      onUpdate(list);
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
      if (seenSkus.has(cleanSku)) {
        throw new Error(`El SKU "${cleanSku}" está repetido dentro de las variantes a registrar.`);
      }
      seenSkus.add(cleanSku);

      const baseName = (p.nombre || "").trim().toLowerCase();
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
        nombre: p.nombre.trim(),
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
    if (isConfigured && realDb) {
      const docRef = doc(realDb, "productos", cleanSku);
      await setDoc(docRef, {
        ...data,
        actualizado_at: Timestamp.now()
      }, { merge: true });
      return;
    }
    const list = getLocalStorageItem<Producto[]>("productos", []);
    const index = list.findIndex(p => p.sku === cleanSku);
    if (index !== -1) {
      list[index] = { ...list[index], ...data, actualizado_at: new Date() };
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

  deleteProduct: async (sku: string): Promise<void> => {
    const cleanSku = sku.trim().toUpperCase();
    if (isConfigured && realDb) {
      const docRef = doc(realDb, "productos", cleanSku);
      await deleteDoc(docRef);
      return;
    }
    const list = getLocalStorageItem<Producto[]>("productos", []);
    const filtered = list.filter(p => p.sku !== cleanSku);
    setLocalStorageItem("productos", filtered);
    notifyListeners("productos", filtered);
  },

  deleteProducto: async (sku: string): Promise<void> => {
    return firestoreService.deleteProduct(sku);
  },

  registrarMovimiento: async (mov: Omit<Movimiento, "fecha" | "usuario">): Promise<{ id: string; folio: string }> => {
    return firestoreService.registerMovimientoTransaction(mov);
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

        // 4. Lectura y actualización de resumen de ventas si es salida
        if (mov.tipo === "salida" && resumenDocRef) {
          const resumenSnap = await transaction.get(resumenDocRef);
          const prevQty = resumenSnap.exists() ? (Number(resumenSnap.data()?.cantidad) || 0) : 0;
          const prevTotal = resumenSnap.exists() ? (Number(resumenSnap.data()?.total_transacciones) || 0) : 0;

          transaction.set(resumenDocRef, {
            id: summaryKey,
            fecha_str: todayStr,
            fecha: Timestamp.now(),
            sku: cleanSku,
            almacen_id: originAlmId,
            cantidad: prevQty + moveQty,
            total_transacciones: prevTotal + 1,
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
          ...(destAlmId ? { almacen_destino_id: destAlmId } : {})
        });
      });

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
      ...(destAlmId ? { almacen_destino_id: destAlmId } : {})
    };

    movimientos.push(nuevoMovimiento);
    setLocalStorageItem("movimientos", movimientos);
    notifyListeners("movimientos", movimientos);

    return { id: docId, folio: generatedFolio };
  },

  // --- ANULACIÓN ATÓMICA DE MOVIMIENTO VÍA RUNTRANSACTION ---
  anularMovimiento: async (id: string, motivo = "Anulado por el usuario"): Promise<void> => {
    const user = authService.getCurrentUser();
    const usuarioEmail = user ? user.email : "sistema@empresa.com";

    if (isConfigured && realDb) {
      // EN MODO FIREBASE: Si falla o no hay stock para revertir, lanza el error y no toca localStorage
      const movRef = doc(realDb, "movimientos", id);

      await runTransaction(realDb, async (transaction) => {
        // 1. Lectura del movimiento
        const movSnap = await transaction.get(movRef);
        if (!movSnap.exists()) {
          throw new Error("El movimiento que intentas anular no existe en el sistema.");
        }

        const movData = movSnap.data();

        // 2. Validación estricta anti-doble anulación
        if (movData.estado === "anulado") {
          throw new Error("Este movimiento ya ha sido anulado previamente. No se puede anular dos veces.");
        }

        const sku = (movData.sku || "").trim().toUpperCase();
        const originAlmId = movData.almacen_id;
        const destAlmId = movData.almacen_destino_id;
        const qty = Number(movData.cantidad) || 0;
        const tipo = movData.tipo;

        const originStockKey = `${sku}_${originAlmId}`;
        const originStockRef = doc(realDb, "stock", originStockKey);

        // 3. Reversión de stock
        if (tipo === "entrada") {
          const originSnap = await transaction.get(originStockRef);
          const currentOrigin = originSnap.exists() ? (Number(originSnap.data()?.cantidad) || 0) : 0;

          if (currentOrigin < qty) {
            throw new Error(`No se puede anular la entrada: el stock actual (${currentOrigin} uds) en el almacén es menor a la cantidad a revertir (${qty} uds).`);
          }

          transaction.set(originStockRef, {
            id: originStockKey,
            sku,
            almacen_id: originAlmId,
            cantidad: currentOrigin - qty,
            actualizado: Timestamp.now()
          }, { merge: true });
        } else if (tipo === "salida") {
          const originSnap = await transaction.get(originStockRef);
          const currentOrigin = originSnap.exists() ? (Number(originSnap.data()?.cantidad) || 0) : 0;

          transaction.set(originStockRef, {
            id: originStockKey,
            sku,
            almacen_id: originAlmId,
            cantidad: currentOrigin + qty,
            actualizado: Timestamp.now()
          }, { merge: true });

          // Descontar del resumen incremental de ventas
          const dateStr = getLocalDateString(movData.fecha);
          const summaryKey = `${dateStr}_${sku}_${originAlmId}`;
          const resumenDocRef = doc(realDb, "resumen_ventas", summaryKey);
          const resumenSnap = await transaction.get(resumenDocRef);

          if (resumenSnap.exists()) {
            const prevQty = Number(resumenSnap.data()?.cantidad) || 0;
            const prevTotal = Number(resumenSnap.data()?.total_transacciones) || 0;
            transaction.set(resumenDocRef, {
              cantidad: Math.max(0, prevQty - qty),
              total_transacciones: Math.max(0, prevTotal - 1),
              actualizado: Timestamp.now()
            }, { merge: true });
          }
        } else if (tipo === "transferencia") {
          if (!destAlmId) {
            throw new Error("Datos de transferencia incompletos: falta almacén de destino.");
          }

          const destStockKey = `${sku}_${destAlmId}`;
          const destStockRef = doc(realDb, "stock", destStockKey);

          const destSnap = await transaction.get(destStockRef);
          const currentDest = destSnap.exists() ? (Number(destSnap.data()?.cantidad) || 0) : 0;

          if (currentDest < qty) {
            throw new Error(`No se puede anular la transferencia: el almacén de destino no tiene suficiente stock (${currentDest} uds) para devolver las ${qty} uds.`);
          }

          const originSnap = await transaction.get(originStockRef);
          const currentOrigin = originSnap.exists() ? (Number(originSnap.data()?.cantidad) || 0) : 0;

          transaction.set(originStockRef, {
            id: originStockKey,
            sku,
            almacen_id: originAlmId,
            cantidad: currentOrigin + qty,
            actualizado: Timestamp.now()
          }, { merge: true });

          transaction.set(destStockRef, {
            id: destStockKey,
            sku,
            almacen_id: destAlmId,
            cantidad: currentDest - qty,
            actualizado: Timestamp.now()
          }, { merge: true });
        }

        // 4. Marca el documento como anulado
        transaction.update(movRef, {
          estado: "anulado",
          anulado_at: Timestamp.now(),
          anulado_por: usuarioEmail,
          motivo_anulacion: motivo
        });
      });

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
  },

  deleteMovimiento: async (id: string): Promise<void> => {
    await firestoreService.anularMovimiento(id, "Anulación directa de registro");
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

        const list: Movimiento[] = itemsToProcess.map(d => {
          const data = d.data();
          return {
            id: d.id,
            folio: data.folio,
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
            estado: data.estado || "activo",
            anulado_at: data.anulado_at ? (data.anulado_at as Timestamp).toDate() : undefined,
            anulado_por: data.anulado_por,
            motivo_anulacion: data.motivo_anulacion
          };
        });

        return {
          items: list,
          lastDoc: nextLastDoc,
          hasMore,
          totalLoaded: list.length
        };
      } catch (err: any) {
        console.warn("Error en query indexado de movimientos, ejecutando consulta fallback:", err);
        if (err?.code === "failed-precondition" || (err?.message && err.message.includes("index"))) {
          const qFallback = query(collection(realDb, "movimientos"), limit(pageSize * 2));
          const snap = await getDocs(qFallback);
          let list: Movimiento[] = snap.docs.map(d => {
            const data = d.data();
            return {
              id: d.id,
              folio: data.folio,
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
              estado: data.estado || "activo",
              anulado_at: data.anulado_at ? (data.anulado_at as Timestamp).toDate() : undefined,
              anulado_por: data.anulado_por,
              motivo_anulacion: data.motivo_anulacion
            };
          });
          list.sort((a, b) => (b.fecha as Date).getTime() - (a.fecha as Date).getTime());
          if (options.skuFilter) {
            list = list.filter(m => m.sku?.trim().toUpperCase() === options.skuFilter?.trim().toUpperCase());
          }
          if (options.warehouseFilter && options.warehouseFilter !== "all") {
            list = list.filter(m => m.almacen_id === options.warehouseFilter || m.almacen_destino_id === options.warehouseFilter);
          }
          if (options.tipoFilter && options.tipoFilter !== "all") {
            list = list.filter(m => m.tipo === options.tipoFilter);
          }
          if (options.estadoFilter && options.estadoFilter !== "all") {
            list = list.filter(m => (m.estado || "activo") === options.estadoFilter);
          }
          return {
            items: list.slice(0, pageSize),
            lastDoc: null,
            hasMore: list.length > pageSize,
            totalLoaded: list.slice(0, pageSize).length
          };
        }
        throw err;
      }
    }

    // Modo local
    let movs = getLocalStorageItem<Movimiento[]>("movimientos", []);
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
        (m.referencia && m.referencia.toLowerCase().includes(s))
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

  // Fallback para consultas directas de movimientos de salida si fuera necesario
  getVentasByDateRange: async (startDate: Date, endDate: Date): Promise<Movimiento[]> => {
    const startMs = startDate.getTime();
    const endMs = endDate.getTime();

    if (isConfigured && realDb) {
      const startTimestamp = Timestamp.fromDate(startDate);
      const endTimestamp = Timestamp.fromDate(endDate);

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
        if (data.estado === "anulado") return;

        list.push({
          id: d.id,
          folio: data.folio,
          sku: data.sku,
          almacen_id: data.almacen_id,
          tipo: "salida",
          cantidad: Number(data.cantidad) || 0,
          referencia: data.referencia,
          usuario: data.usuario,
          fecha: data.fecha ? (data.fecha as Timestamp).toDate() : new Date(),
          estado: data.estado || "activo"
        });
      });

      return list;
    }

    const movs = getLocalStorageItem<Movimiento[]>("movimientos", []);
    return movs.filter(m => {
      if (m.tipo !== "salida" || m.estado === "anulado") return false;
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

    if (isConfigured && realDb) {
      const compraCounterRef = doc(realDb, "contadores", "compra");
      const entradaCounterRef = doc(realDb, "contadores", "entrada");
      const compraDocRef = doc(collection(realDb, "compras"));
      const compraDocId = compraDocRef.id;

      let generatedCompraFolio = "";

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

        // 3. Procesar stock y movimientos de cada partida
        for (let i = 0; i < validItems.length; i++) {
          const item = validItems[i];
          const stockKey = `${item.sku}_${almacenId}`;
          const stockRef = doc(realDb, "stock", stockKey);
          const stockSnap = await transaction.get(stockRef);
          const currentQty = stockSnap.exists() ? (Number(stockSnap.data()?.cantidad) || 0) : 0;
          const newQty = currentQty + item.cantidad;

          // Actualizar stock
          transaction.set(stockRef, {
            id: stockKey,
            sku: item.sku,
            almacen_id: almacenId,
            cantidad: newQty,
            actualizado: Timestamp.now()
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
          items: validItems,
          total_unidades: totalUnidades,
          subtotal: subtotal,
          costo_envio: costoEnvio,
          comisiones: comisiones,
          descuentos: descuentos,
          total: totalCompra,
          referencia: compraData.referencia || "",
          notas: compraData.notas || "",
          creado_por: usuarioEmail,
          creado_at: Timestamp.now(),
          estado: "completada"
        });
      });

      return {
        id: compraDocId,
        folio: generatedCompraFolio,
        movimientosCount: validItems.length
      };
    }

    // --- MODO LOCAL / EMULADOR ---
    const stockMap = getLocalStorageItem<Record<string, StockItem>>("stock", {});
    const comprasList = getLocalStorageItem<Compra[]>("compras", []);
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
        lote_id: generatedCompraFolio,
        costo_unitario: item.costo_unitario,
        estado: "activo"
      });
    }

    setLocalStorageItem("contadores_movimientos", counters);
    setLocalStorageItem("stock", stockMap);
    notifyListeners("stock", stockMap);
    setLocalStorageItem("movimientos", movimientosList);
    notifyListeners("movimientos", movimientosList);

    const nuevaCompra: Compra = {
      id: compraDocId,
      folio: generatedCompraFolio,
      proveedor: proveedorClean,
      fecha: purchaseDate,
      fecha_str: fechaStr,
      almacen_id: almacenId,
      items: validItems,
      total_unidades: totalUnidades,
      subtotal: subtotal,
      costo_envio: costoEnvio,
      comisiones: comisiones,
      descuentos: descuentos,
      total: totalCompra,
      referencia: compraData.referencia || "",
      notas: compraData.notas || "",
      creado_por: usuarioEmail,
      creado_at: new Date(),
      estado: "completada"
    };

    comprasList.unshift(nuevaCompra);
    setLocalStorageItem("compras", comprasList);
    notifyListeners("compras", comprasList);

    return {
      id: compraDocId,
      folio: generatedCompraFolio,
      movimientosCount: validItems.length
    };
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
      const parsed = list.map(c => ({
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
      return list;
    }

    const list = getLocalStorageItem<Compra[]>("compras", []);
    return list.map(c => ({
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

        const list: Compra[] = itemsToProcess.map(d => {
          const data = d.data();
          return {
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
          };
        });

        return {
          items: list,
          lastDoc: nextLastDoc,
          hasMore,
          totalLoaded: list.length
        };
      } catch (err) {
        console.warn("Error en query indexado de compras, ejecutando consulta fallback:", err);
        const qFallback = query(collection(realDb, "compras"), limit(pageSize * 2));
        const snap = await getDocs(qFallback);
        let list: Compra[] = snap.docs.map(d => {
          const data = d.data();
          return {
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
          };
        });
        list.sort((a, b) => (b.fecha as Date).getTime() - (a.fecha as Date).getTime());
        if (options.warehouseFilter && options.warehouseFilter !== "all") {
          list = list.filter(c => c.almacen_id === options.warehouseFilter);
        }
        return {
          items: list.slice(0, pageSize),
          lastDoc: null,
          hasMore: list.length > pageSize,
          totalLoaded: list.slice(0, pageSize).length
        };
      }
    }

    // Modo emulador LocalStorage
    let list = getLocalStorageItem<Compra[]>("compras", []);
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
      { id: "mar_dc", nombre: "dorsalclub", activa: true },
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
      return list;
    }
    const local = getLocalStorageItem<CategoriaCatalogo[]>("categorias", []);
    if (local.length === 0) {
      const res = await firestoreService.seedAndImportCatalogos();
      return res.categorias;
    }
    return local;
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
          onUpdate(list);
        },
        (error) => {
          console.error("Error en listener de categorías:", error);
        }
      );
    }

    const update = () => {
      const list = getLocalStorageItem<CategoriaCatalogo[]>("categorias", []);
      onUpdate(list);
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
      const docRef = doc(realDb, "catalogo_categorias", id);
      await deleteDoc(docRef);
      return;
    }
    const list = getLocalStorageItem<CategoriaCatalogo[]>("categorias", []);
    const updated = list.filter(c => c.id !== id);
    setLocalStorageItem("categorias", updated);
    notifyListeners("categorias", updated);
  },

  // --- MARCAS ---
  getMarcas: async (): Promise<MarcaCatalogo[]> => {
    if (isConfigured && realDb) {
      const snap = await getDocs(collection(realDb, "catalogo_marcas"));
      const list: MarcaCatalogo[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as MarcaCatalogo);
      });
      return list;
    }
    const local = getLocalStorageItem<MarcaCatalogo[]>("marcas", []);
    if (local.length === 0) {
      const res = await firestoreService.seedAndImportCatalogos();
      return res.marcas;
    }
    return local;
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
          onUpdate(list);
        },
        (error) => {
          console.error("Error en listener de marcas:", error);
        }
      );
    }

    const update = () => {
      const list = getLocalStorageItem<MarcaCatalogo[]>("marcas", []);
      onUpdate(list);
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
      const docRef = doc(realDb, "catalogo_marcas", id);
      await deleteDoc(docRef);
      return;
    }
    const list = getLocalStorageItem<MarcaCatalogo[]>("marcas", []);
    const updated = list.filter(m => m.id !== id);
    setLocalStorageItem("marcas", updated);
    notifyListeners("marcas", updated);
  },

  // --- COLORES ---
  getColores: async (): Promise<ColorCatalogo[]> => {
    if (isConfigured && realDb) {
      const snap = await getDocs(collection(realDb, "catalogo_colores"));
      const list: ColorCatalogo[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as ColorCatalogo);
      });
      return list;
    }
    const local = getLocalStorageItem<ColorCatalogo[]>("colores", []);
    if (local.length === 0) {
      const res = await firestoreService.seedAndImportCatalogos();
      return res.colores;
    }
    return local;
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
          onUpdate(list);
        },
        (error) => {
          console.error("Error en listener de colores:", error);
        }
      );
    }

    const update = () => {
      const list = getLocalStorageItem<ColorCatalogo[]>("colores", []);
      onUpdate(list);
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
      const docRef = doc(realDb, "catalogo_colores", id);
      await deleteDoc(docRef);
      return;
    }
    const list = getLocalStorageItem<ColorCatalogo[]>("colores", []);
    const updated = list.filter(c => c.id !== id);
    setLocalStorageItem("colores", updated);
    notifyListeners("colores", updated);
  },

  // --- TALLAS DE ROPA ---
  getTallasRopa: async (): Promise<TallaRopaCatalogo[]> => {
    if (isConfigured && realDb) {
      const snap = await getDocs(collection(realDb, "catalogo_tallas_ropa"));
      const list: TallaRopaCatalogo[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as TallaRopaCatalogo);
      });
      return list.sort((a, b) => (a.orden || 0) - (b.orden || 0));
    }
    const local = getLocalStorageItem<TallaRopaCatalogo[]>("tallas_ropa", []);
    if (local.length === 0) {
      const res = await firestoreService.seedAndImportCatalogos();
      return res.tallasRopa;
    }
    return local.sort((a, b) => (a.orden || 0) - (b.orden || 0));
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
          onUpdate(list.sort((a, b) => (a.orden || 0) - (b.orden || 0)));
        },
        (error) => {
          console.error("Error en listener de tallas ropa:", error);
        }
      );
    }

    const update = () => {
      const list = getLocalStorageItem<TallaRopaCatalogo[]>("tallas_ropa", []);
      onUpdate(list.sort((a, b) => (a.orden || 0) - (b.orden || 0)));
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
      const docRef = doc(realDb, "catalogo_tallas_ropa", id);
      await deleteDoc(docRef);
      return;
    }
    const list = getLocalStorageItem<TallaRopaCatalogo[]>("tallas_ropa", []);
    const updated = list.filter(t => t.id !== id);
    setLocalStorageItem("tallas_ropa", updated);
    notifyListeners("tallas_ropa", updated);
  },

  // --- TALLAS DE CALZADO ---
  getTallasCalzado: async (): Promise<TallaCalzadoCatalogo[]> => {
    if (isConfigured && realDb) {
      const snap = await getDocs(collection(realDb, "catalogo_tallas_calzado"));
      const list: TallaCalzadoCatalogo[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as TallaCalzadoCatalogo);
      });
      return list.sort((a, b) => (Number(a.nombre) || 0) - (Number(b.nombre) || 0));
    }
    const local = getLocalStorageItem<TallaCalzadoCatalogo[]>("tallas_calzado", []);
    if (local.length === 0) {
      const res = await firestoreService.seedAndImportCatalogos();
      return res.tallasCalzado;
    }
    return local.sort((a, b) => (Number(a.nombre) || 0) - (Number(b.nombre) || 0));
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
          onUpdate(list.sort((a, b) => (Number(a.nombre) || 0) - (Number(b.nombre) || 0)));
        },
        (error) => {
          console.error("Error en listener de tallas calzado:", error);
        }
      );
    }

    const update = () => {
      const list = getLocalStorageItem<TallaCalzadoCatalogo[]>("tallas_calzado", []);
      onUpdate(list.sort((a, b) => (Number(a.nombre) || 0) - (Number(b.nombre) || 0)));
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
      const docRef = doc(realDb, "catalogo_tallas_calzado", id);
      await deleteDoc(docRef);
      return;
    }
    const list = getLocalStorageItem<TallaCalzadoCatalogo[]>("tallas_calzado", []);
    const updated = list.filter(t => t.id !== id);
    setLocalStorageItem("tallas_calzado", updated);
    notifyListeners("tallas_calzado", updated);
  },

  // --- UNIDADES DE MEDIDA ---
  getUnidades: async (): Promise<UnidadMedidaCatalogo[]> => {
    if (isConfigured && realDb) {
      const snap = await getDocs(collection(realDb, "catalogo_unidades"));
      const list: UnidadMedidaCatalogo[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as UnidadMedidaCatalogo);
      });
      return list;
    }
    const local = getLocalStorageItem<UnidadMedidaCatalogo[]>("unidades", []);
    if (local.length === 0) {
      const res = await firestoreService.seedAndImportCatalogos();
      return res.unidades;
    }
    return local;
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
          onUpdate(list);
        },
        (error) => {
          console.error("Error en listener de unidades:", error);
        }
      );
    }

    const update = () => {
      const list = getLocalStorageItem<UnidadMedidaCatalogo[]>("unidades", []);
      onUpdate(list);
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
      const docRef = doc(realDb, "catalogo_unidades", id);
      await deleteDoc(docRef);
      return;
    }
    const list = getLocalStorageItem<UnidadMedidaCatalogo[]>("unidades", []);
    const updated = list.filter(u => u.id !== id);
    setLocalStorageItem("unidades", updated);
    notifyListeners("unidades", updated);
  }
};
