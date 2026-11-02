import assert from "node:assert/strict";
import { build } from "esbuild";

/** Transporte de pruebas, sin red ni credenciales. Emula reintentos optimistas y lecturas antes de escrituras. */
export async function firebaseInMemory() {
  const data = new Map<string, any>();
  const versions = new Map<string, number>();
  const queries: any[] = [];
  const deletes = "__test_delete_field__";
  let rejectedCollection = "";
  let sequence = 0;
  let retries = 0;
  const ref = (path: string) => ({ path, id: path.split("/").at(-1) });
  const snapshot = (path: string) => {
    const value = structuredClone(data.get(path));
    return { ref: ref(path), id: ref(path).id, exists: () => value !== undefined, data: () => value, metadata: { hasPendingWrites: false } };
  };
  const put = (path: string, value: any, merge = false) => {
    const updated = { ...(merge ? data.get(path) : {}), ...structuredClone(value) };
    Object.keys(updated).forEach(key => { if (updated[key] === deletes) delete updated[key]; });
    data.set(path, updated); versions.set(path, (versions.get(path) || 0) + 1);
  };
  const read = async (request: any) => {
    queries.push(request);
    if (request.path === rejectedCollection) throw Object.assign(new Error("Consulta rechazada"), { code: "permission-denied" });
    let entries = [...data.keys()].filter(path => path.split("/").slice(0, -1).join("/") === request.path).map(snapshot);
    for (const clause of request.constraints || []) {
      if (clause.kind === "where") entries = entries.filter(item => {
        const value = item.data()[clause.field];
        return clause.op === "in" ? clause.value.includes(value) : clause.op === "array-contains" ? Array.isArray(value) && value.includes(clause.value) : value === clause.value;
      });
      if (clause.kind === "limit") entries = entries.slice(0, clause.value);
    }
    return { docs: entries, empty: !entries.length, metadata: { hasPendingWrites: false }, forEach: (cb: any) => entries.forEach(cb) };
  };
  const transaction = async (action: any) => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const reads = new Map<string, number>();
      const values = new Map<string, any>();
      const writes: { ref: any; value: any; merge: boolean }[] = [];
      const tx = {
        get: async (doc: any) => {
          assert.equal(writes.length, 0, "Firestore no permite leer después de escribir dentro de una transacción.");
          if (!reads.has(doc.path)) { reads.set(doc.path, versions.get(doc.path) || 0); values.set(doc.path, snapshot(doc.path)); }
          return values.get(doc.path);
        },
        set: (doc: any, value: any, options?: any) => { writes.push({ ref: doc, value, merge: Boolean(options?.merge) }); },
        update: (doc: any, value: any) => { assert.ok(data.has(doc.path), "No se puede actualizar un documento inexistente"); writes.push({ ref: doc, value, merge: true }); }
      };
      const result = await action(tx);
      if ([...reads].some(([path, version]) => version !== (versions.get(path) || 0))) { retries++; continue; }
      assert.ok(writes.length <= 500);
      writes.forEach(write => put(write.ref.path, write.value, write.merge));
      return result;
    }
    throw new Error("Demasiados conflictos simulados.");
  };
  const state = { ref, next: () => `auto-${++sequence}`, read, snapshot, put, transaction, deletes };
  (globalThis as any).__inventoryTest = state;
  const firestore = `
    const state = () => globalThis.__inventoryTest;
    export const initializeFirestore = () => ({}), getFirestore = initializeFirestore;
    export const collection = (_, path) => ({ path });
    export const doc = (...args) => args.length === 1 ? state().ref(args[0].path + "/" + state().next()) : state().ref(args.slice(1).join("/"));
    export const query = (ref, ...constraints) => ({ ...ref, constraints });
    export const where = (field, op, value) => ({ kind: "where", field, op, value });
    export const orderBy = (field, direction) => ({ kind: "order", field, direction });
    export const limit = value => ({ kind: "limit", value });
    export const startAfter = doc => ({ kind: "after", doc });
    export const getDocs = request => state().read(request), getDocsFromServer = getDocs;
    export const getDoc = async ref => state().snapshot(ref.path);
    export const setDoc = async (ref, value, options) => state().put(ref.path, value, options?.merge);
    export const Timestamp = { now: () => new Date(), fromDate: value => value };
    export const runTransaction = (_, action) => state().transaction(action);
    export const deleteField = () => state().deletes;
    export const writeBatch = () => { const writes = []; return { set: (ref,value,options) => writes.push([ref,value,options]), commit: async () => { for(const [ref,value,options] of writes) await setDoc(ref,value,options); } }; };
    export const onSnapshot = () => () => {}, addDoc = () => {};
  `;
  const bundle = await build({ entryPoints: ["src/lib/firebase.ts"], bundle: true, write: false, platform: "node", format: "esm",
    define: { "import.meta.env": JSON.stringify({ VITE_FIREBASE_API_KEY: "fake-offline-inventory-test-key", VITE_FIREBASE_PROJECT_ID: "offline-test-project" }) },
    plugins: [{ name: "inventory-memory", setup(builder) {
      builder.onResolve({ filter: /^firebase\// }, args => ({ path: args.path, namespace: "memory" }));
      builder.onLoad({ filter: /.*/, namespace: "memory" }, args => ({ contents: args.path === "firebase/firestore" ? firestore : args.path === "firebase/app"
        ? "export const initializeApp = () => ({}), getApp = initializeApp, getApps = () => [];"
        : "export const getAuth = () => ({}), signInWithEmailAndPassword = () => {}, signOut = () => {}, onAuthStateChanged = () => {}, signInWithPopup = () => {}, GoogleAuthProvider = class {};" }));
    } }]
  });
  const module = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
  return { service: module.firestoreService as typeof import("../../src/lib/firebase").firestoreService, data, put, queries,
    reject: (collection: string) => { rejectedCollection = collection; }, retries: () => retries };
}
