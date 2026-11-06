import assert from "node:assert/strict";
import { calcularInventarioDrop } from "../src/lib/inventarioDrops";
import { construirPedidos, fechaLocal, fechaRegistro, leerMovimiento, leerVenta } from "../src/lib/lecturasVentas";
import { mensajeError } from "../src/lib/errores";
import type { Movimiento, VentaRegistroInput } from "../src/types";

// Almacenamiento aislado en memoria. Estas pruebas no conectan con Firebase.
const memory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { value: {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key)
}, configurable: true });
const { firestoreService: service, setLocalStorageItem: put, getLocalStorageItem: get, clearFinanzasCache } = await import("../src/lib/firebase");
assert.equal(service.isConfigured(), false, "Estas pruebas deben ejecutarse únicamente en modo local.");

assert.equal(fechaRegistro({ seconds: 0 }).getTime(), 0);
assert.equal(fechaRegistro("2026-10-30T00:00:00Z").getUTCDate(), 30);
assert.equal(fechaLocal(new Date(2026, 9, 30, 23, 50)), "2026-10-30");
assert.match(mensajeError({ code: "permission-denied" }, "Error"), /reglas/);
assert.match(mensajeError({ code: "failed-precondition" }, "Error"), /índice/);
assert.equal(mensajeError({ code: "other", message: "https://internal.example" }, "Mensaje seguro"), "Mensaje seguro");

const legacy = leerMovimiento("line-1", {
  venta_id: "legacy", venta_partida: 1, venta_total_cobrado: 1000, venta_total_recibido: 500,
  ingreso_reconocido: 250, tipo: "salida", afecta_stock: false, canal_venta: "bajo_pedido",
  cliente_id: "client", sku: "SKU-A", cantidad: 1, total_venta: 500, fecha: "2026-10-01"
});
const second = { ...legacy, id: "line-2", venta_partida: 2, sku: "SKU-B" };
const cancelledPayment = leerMovimiento("event", {
  venta_relacionada_id: "legacy", subtipo: "abono_venta", ingreso_reconocido: 500,
  estado: "anulado", tipo: "salida", fecha: "2026-10-02"
});
let orders = construirPedidos([], [legacy, second, cancelledPayment]);
assert.equal(orders[0].recibido, 500, "El anticipo es el de toda la venta, no el de su primera partida.");
assert.equal(orders[0].saldo, 500, "Un abono anulado no liquida el pedido.");
const master = leerVenta("legacy", {
  afecta_stock: false, canal_venta: "bajo_pedido", total: 1000, recibido: 500, saldo: 500,
  fecha: "2026-10-01", estado: "anulado", items: []
});
assert.equal(construirPedidos([master], [legacy, second]).length, 0, "Un maestro anulado no reaparece como pedido legado.");
assert.equal(construirPedidos([], [legacy, { ...cancelledPayment, estado: "activo", subtipo: "reembolso_venta" }]).length, 0);

put("productos", ["SKU-A", "SKU-B"].map(sku => ({ sku, nombre: sku, categoria: "Prueba", unidad: "pieza", stock_minimo: 0, activo: true })));
const testDrop = await service.addDrop({ nombre: "Drop de prueba local", estado: "en_venta" });
const purchase = await service.registerCompraTransaction({
  proveedor: "Proveedor de prueba", drop_id: testDrop.id,
  items: [{ sku: "SKU-A", cantidad: 2, costo_unitario: 100, subtotal: 200 }, { sku: "SKU-B", cantidad: 2, costo_unitario: 100, subtotal: 200 }],
  costo_envio: 50, comisiones: 10, descuentos: 20
});
const input: VentaRegistroInput = {
  drop_id: testDrop.id,
  items: ["SKU-A", "SKU-B"].map(sku => ({ sku, cantidad: 1, precio_unitario_venta: 500, costo_unitario_venta: 100 })),
  referencia: "Prueba", cliente_id: "client", cliente_nombre: "Cliente de prueba", canal_venta: "stock",
  canal_venta_nombre: "Venta directa", porcentaje_precio: 0, afecta_stock: true,
  anticipo_porcentaje: 100, minimo_piezas: 1, metodo_pago_inicial: "Efectivo"
};
const sale = await service.registerVentaTransaction(input);
assert.equal((await service.getMovimientosCliente("client")).filter(item => !item.subtipo).length, 2);
assert.equal((await service.getMovimientosCliente("other-client")).length, 0);
assert.equal((await service.getVentasCliente("client")).length, 1);
assert.equal((await service.getVentasMaestrasPaginated()).items[0].fecha instanceof Date, true, "La fecha ISO local debe normalizarse tras leer JSON.");

await service.addGasto({ concepto: "Gasto de prueba", categoria: "Otros", monto: 100, fecha: new Date(), metodo_pago: "Efectivo" });
let financial = await service.getResumenFinancieroConsolidado({ alcance: "todo" });
assert.equal(financial.ingresosVentas, 1000);
assert.equal(financial.comprasOperativas, 440);
assert.equal(financial.egresosOperativos, 540);
assert.equal(financial.flujoOperativo, 460);
await service.devolverVentaCompleta(sale.id, "Prueba de devolución");
financial = await service.getResumenFinancieroConsolidado({ alcance: "todo" });
assert.equal(financial.ingresosVentas, 0, "El reembolso debe compensar el cobro.");
assert.equal(financial.pendientePorCobrar, 0);
const stock = calcularInventarioDrop(testDrop.id, await service.getDropDetail(testDrop.id));
assert.equal(stock.find(row => row.sku === "SKU-A")?.saldo, 2);
assert.equal(stock.find(row => row.sku === "SKU-B")?.saldo, 2);
assert.equal(memory.has("inventario_mvp_stock"), false);
assert.equal(memory.has("inventario_mvp_almacenes"), false);

const preorder = await service.registerVentaTransaction({ ...input, afecta_stock: false, canal_venta: "bajo_pedido", anticipo_porcentaje: 50 });
orders = await service.getPedidosVenta();
assert.equal(orders.find(item => item.venta_id === preorder.id)?.saldo, 500);
assert.equal(orders[0].fecha instanceof Date, true);
await service.registrarPagoPedido(preorder.id, 200, "Efectivo");
orders = await service.getPedidosVenta();
assert.equal(orders.find(item => item.venta_id === preorder.id)?.saldo, 300);
await assert.rejects(service.registrarPagoPedido(preorder.id, 400, "Efectivo"), /superar/);
await assert.rejects(service.actualizarSeguimientoPedido(preorder.id, { marcar_entregado: true }), /saldo/);
await service.registrarPagoPedido(preorder.id, 300, "Efectivo");
await service.actualizarSeguimientoPedido(preorder.id, { marcar_entregado: true, comentarios: "" });
assert.equal((await service.getPedidosVenta()).find(item => item.venta_id === preorder.id)?.estado, "entregado");
assert.equal((await service.getCuentasPorCobrar()).length, 0);

put("movimientos", [...get<Movimiento[]>("movimientos", []), legacy, second, cancelledPayment]);
await assert.rejects(service.registrarPagoPedido("legacy", 600, "Efectivo"), /superar/, "El pago de un pedido legado no debe exceder el saldo real de toda la venta.");
await assert.rejects(service.actualizarSeguimientoPedido("legacy", { marcar_entregado: true }), /saldo/);
await service.registrarPagoPedido("legacy", 500, "Efectivo");
await service.actualizarSeguimientoPedido("legacy", { marcar_entregado: true });
assert.equal((await service.getEventosVentas(["legacy"])).some(item => item.pedido_estado === "entregado" && item.cliente_id === "client"), true);

const many: Movimiento[] = Array.from({ length: 260 }, (_, index) => ({ ...legacy, id: `large-${index}`, cliente_id: "large-client", venta_id: `sale-${index}` }));
put("movimientos", [...get<Movimiento[]>("movimientos", []), ...many]);
assert.equal((await service.getMovimientosCliente("large-client")).length, 260, "Las métricas del cliente no deben limitarse a 200 partidas.");
await service.enviarCompraPapelera(purchase.id);
assert.equal((await service.getComprasPaginated()).items.some(item => item.id === purchase.id), false);
await service.restaurarCompraPapelera(purchase.id);
assert.equal((await service.getComprasPaginated()).items.some(item => item.id === purchase.id), true);
const localCompeting = await Promise.allSettled([
  service.registerVentaTransaction({ ...input, items: [{ ...input.items[0], cantidad: 2 }] }),
  service.registerVentaTransaction({ ...input, items: [{ ...input.items[0], cantidad: 2 }] })
]);
assert.equal(localCompeting.filter(item => item.status === "fulfilled").length, 1, "Las escrituras locales también deben serializar la validación del drop.");
// La retirada del módulo no borra los registros históricos, tampoco al vaciar la papelera.
put("almacenes", [{ id: "anterior", nombre: "Histórico", en_papelera: true }]);
put("stock", [{ id: "SKU-A_anterior", sku: "SKU-A", almacen_id: "anterior", cantidad: 99 }]);
const oldTransfer = { id: "traslado-anterior", tipo: "transferencia", sku: "SKU-A", cantidad: 1, en_papelera: true, estado: "anulado" } as Movimiento;
put("movimientos", [...get<Movimiento[]>("movimientos", []), oldTransfer]);
await assert.rejects(service.enviarMovimientoPapelera(oldTransfer.id!), /solo lectura/);
await assert.rejects(service.restaurarMovimientoPapelera(oldTransfer.id!), /solo lectura/);
assert.equal((await service.getPapeleraItems()).some(item => item.id === oldTransfer.id || item.id === "anterior"), false);
assert.equal((await service.getMovimientosPaginated()).items.some(item => item.tipo === "transferencia"), false);
await service.vaciarPapelera();
assert.deepEqual(get<Movimiento[]>("movimientos", []).find(item => item.id === oldTransfer.id), oldTransfer);
assert.equal(get<any[]>("almacenes", [])[0].id, "anterior");
assert.equal(get<any[]>("stock", [])[0].cantidad, 99);

// Renderizado de componentes sin sesión, red ni efectos: controles y etiquetas retirados.
const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { WorkspaceProvider } = await import("../src/context/WorkspaceContext");
const { default: Compras } = await import("../src/components/Compras");
const { default: Ventas } = await import("../src/components/Ventas");
const { default: Configuracion } = await import("../src/components/Configuracion");
const render = (component: any, props: any) => renderToStaticMarkup(createElement(WorkspaceProvider, { children: createElement(component, props) }));
const purchaseForm = render(Compras, { productos: [], isNewView: true });
assert.match(purchaseForm, /Drop de inventario/);
assert.doesNotMatch(purchaseForm, /almac[eé]n|transferencias/i);
assert.doesNotMatch(render(Ventas, { productos: [], canal: "stock" }), /almac[eé]n|transferencias/i);
assert.doesNotMatch(render(Configuracion, {}), /almac[eé]n|transferencias/i);
clearFinanzasCache();
console.log("Regresiones CRM: fechas, clientes, pedidos, compras, cobros, devolución y finanzas aprobadas (solo memoria local).");
