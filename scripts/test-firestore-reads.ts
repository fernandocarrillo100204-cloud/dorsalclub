import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFileSync } from "node:fs";

const indexConfig = JSON.parse(readFileSync("firestore.indexes.json", "utf8"));
assert.equal(indexConfig.indexes.every((index: any) => index.fields.length >= 2), true, "Los índices compuestos deben tener al menos dos campos.");
for (const [collection, field] of [["compras", "almacen_id"], ["movimientos", "estado"]]) {
  assert.equal(indexConfig.indexes.some((index: any) => index.collectionGroup === collection &&
    index.fields.some((entry: any) => entry.fieldPath === field) &&
    index.fields.some((entry: any) => entry.fieldPath === "fecha" && entry.order === "DESCENDING")), true);
}

// Ejecuta los servicios en su rama Firebase con un transporte simulado.
// No usa credenciales, red, documentos ni reglas de producción.
const calls: any[] = [];
let rejectedCollection = "";
const documents = new Map<string, any[]>();
const state = { read: async (request: any) => {
  calls.push(request);
  if (request.path === rejectedCollection) throw Object.assign(new Error("Consulta rechazada"), { code: "permission-denied" });
  let rows = [...(documents.get(request.path) || [])];
  for (const filter of request.constraints.filter((item: any) => item.kind === "where")) rows = rows.filter(item => filter.op === "in" ? filter.value.includes(item[filter.field]) : item[filter.field] === filter.value);
  const sort = request.constraints.find((item: any) => item.kind === "order");
  if (sort) rows.sort((a, b) => sort.direction === "desc" ? b[sort.field] - a[sort.field] : a[sort.field] - b[sort.field]);
  const cursor = request.constraints.find((item: any) => item.kind === "after");
  if (cursor) rows = rows.slice(rows.findIndex(item => item.id === cursor.doc.id) + 1);
  const max = request.constraints.find((item: any) => item.kind === "limit");
  if (max) rows = rows.slice(0, max.value);
  return { docs: rows.map(item => ({ id: item.id, data: () => item })), empty: rows.length === 0 };
} };
(globalThis as any).__crmReadTest = state;
const firestoreMock = `
export const getFirestore = () => ({}), initializeFirestore = getFirestore;
export const collection = (_, path) => ({ path });
export const query = (collection, ...constraints) => ({ ...collection, constraints });
export const where = (field, op, value) => ({ kind: "where", field, op, value });
export const orderBy = (field, direction) => ({ kind: "order", field, direction });
export const limit = value => ({ kind: "limit", value });
export const startAfter = doc => ({ kind: "after", doc });
export const getDocs = request => globalThis.__crmReadTest.read(request);
export const Timestamp = { now: () => new Date(), fromDate: date => date };
export const doc = () => ({}), getDoc = () => {}, setDoc = () => {}, addDoc = () => {}, onSnapshot = () => {}, runTransaction = () => {}, writeBatch = () => {}, deleteField = () => {};
`;
const bundle = await build({
  entryPoints: ["src/lib/firebase.ts"], write: false, bundle: true, platform: "node", format: "esm",
  define: { "import.meta.env": JSON.stringify({ VITE_FIREBASE_API_KEY: "fake-key-for-offline-tests-only", VITE_FIREBASE_PROJECT_ID: "offline-test-project" }) },
  plugins: [{ name: "offline-firebase", setup(builder) {
    builder.onResolve({ filter: /^firebase\// }, args => ({ path: args.path, namespace: "offline" }));
    builder.onLoad({ filter: /.*/, namespace: "offline" }, args => ({ contents: args.path === "firebase/firestore" ? firestoreMock
      : args.path === "firebase/app" ? "export const initializeApp = () => ({}), getApps = () => [], getApp = initializeApp;"
      : "export const getAuth = () => ({}), signInWithEmailAndPassword = () => {}, signOut = () => {}, onAuthStateChanged = () => {}, signInWithPopup = () => {}, GoogleAuthProvider = class {};" }));
  } }]
});
const module = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const service = module.firestoreService;
assert.equal(service.isConfigured(), true);
documents.set("movimientos", Array.from({ length: 521 }, (_, index) => ({
  id: `line-${index}`, venta_id: `old-${index}`, cliente_id: index % 2 ? "client-b" : "client-a",
  tipo: "salida", afecta_stock: false, canal_venta: "bajo_pedido", fecha: new Date(2026, 0, 1, 0, index),
  cantidad: 1, sku: "TEST", total_venta: 100, venta_total_cobrado: 100, venta_total_recibido: 50, estado: "activo"
})));
documents.set("ventas", []);
const clienteMovimientos = await service.getMovimientosCliente("client-a");
assert.equal(clienteMovimientos.length, 261);
assert.equal(calls.length, 1);
assert.deepEqual(calls[0].constraints, [{ kind: "where", field: "cliente_id", op: "==", value: "client-a" }]);
await service.getVentasCliente("client-a");
assert.deepEqual(calls[1].constraints, [{ kind: "where", field: "cliente_id", op: "==", value: "client-a" }]);
calls.length = 0;
const orders = await service.getPedidosVenta();
assert.equal(orders.length, 521, "Los pedidos antiguos no deben desaparecer al superar 500 movimientos.");
assert.equal(orders[0].fecha instanceof Date, true);
assert.equal(calls.filter(call => call.path === "movimientos" && call.constraints.some((item: any) => item.kind === "after")).length, 2);
rejectedCollection = "movimientos";
calls.length = 0;
await assert.rejects(service.getMovimientosCliente("client-a"), { code: "permission-denied" });
assert.equal(calls.length, 1, "No debe haber una consulta global ni un fallback local después de un error.");
rejectedCollection = "";
calls.length = 0;
documents.get("movimientos")!.push({ id: "old-tracking", tipo: "ajuste", venta_relacionada_id: "old-0", pedido_estado: "entregado", fecha: new Date() });
assert.equal((await service.getEventosVentas(Array.from({ length: 12 }, (_, index) => `old-${index}`))).length, 1);
assert.equal(calls.length, 2, "Los eventos legados deben consultarse por lotes y no por cada venta.");
delete (globalThis as any).__crmReadTest;
console.log("Lecturas Firebase simuladas: aislamiento por cliente, paginación completa y errores sin fallback aprobados.");
