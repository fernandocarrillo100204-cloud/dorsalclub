import assert from "node:assert/strict";
import { firebaseInMemory } from "./helpers/firestoreMemory";
import { calcularInventarioDrop } from "../src/lib/inventarioDrops";
import { getPeriodoKey } from "../src/lib/periodosFinancieros";
import { registrosIndiceVenta, ajustePeriodosRegistrosVenta } from "../src/lib/papeleraVentas";
import type { Movimiento, VentaRegistroInput } from "../src/types";

const date = new Date("2026-11-01T12:00:00");
const movement = (id: string, extra: Partial<Movimiento> = {}): Movimiento => ({
  id, fecha: date, tipo: "salida", sku: "TEST", cantidad: 1, referencia: "Prueba",
  usuario: "pruebas", venta_id: "venta-1", estado: "activo", ...extra
});
const indexed = registrosIndiceVenta([
  movement("a", { venta_partida: 1 }),
  movement("b", { venta_partida: 2 }),
  movement("p", { venta_id: undefined, venta_relacionada_id: "venta-1", subtipo: "abono_venta" }),
  movement("r", { venta_id: undefined, venta_relacionada_id: "venta-1", subtipo: "reembolso_venta" }),
  movement("s", { venta_id: undefined, venta_relacionada_id: "venta-1", tipo: "ajuste", subtipo: "seguimiento_pedido" }),
  movement("x", { venta_id: undefined, venta_relacionada_id: "venta-1", subtipo: "abono_venta", estado: "anulado" }),
], "archivar");
assert.deepEqual(indexed.map(item => item.id), ["a", "p", "r"]);
assert.equal([...ajustePeriodosRegistrosVenta(indexed).values()][0], 3);
assert.equal(registrosIndiceVenta(indexed.map(item => ({ ...item, en_papelera: true, periodo_descontado_papelera: true, estado_antes_papelera: "activo" })), "restaurar").length, 3);

const remote = await firebaseInMemory();
remote.put("productos/TEST", { sku: "TEST", nombre: "Artículo prueba", stock_minimo: 0, categoria: "General", unidad: "pieza" });
const drop = await remote.service.addDrop({ nombre: "Drop pruebas", estado: "en_venta" });
await remote.service.registerCompraTransaction({
  proveedor: "Proveedor prueba", drop_id: drop.id,
  items: [{ sku: "TEST", cantidad: 5, costo_unitario: 100, subtotal: 500 }]
});
const quantity = async () => calcularInventarioDrop(drop.id, await remote.service.getDropDetail(drop.id))
  .find(row => row.sku === "TEST")?.saldo || 0;
const base: VentaRegistroInput = {
  referencia: "Venta de prueba", cliente_nombre: "Cliente prueba",
  canal_venta: "stock", canal_venta_nombre: "Stock",
  porcentaje_precio: 100, afecta_stock: true, anticipo_porcentaje: 100,
  minimo_piezas: 1, metodo_pago_inicial: "Efectivo",
  ubicacion_entrega_id: "ubicacion-1", ubicacion_entrega_nombre: "Apodaca",
  repartidor_id: "repartidor-1", repartidor_nombre: "Repartidor prueba",
  costo_envio_venta: 65, envio_cobrado_cliente: 20,
  items: [{ sku: "TEST", cantidad: 2, precio_unitario_venta: 200, costo_unitario_venta: 100, drop_id: drop.id }]
};
const completed = await remote.service.registerVentaTransaction(base);
assert.equal(await quantity(), 3);
assert.equal((await remote.service.getFletesVentas()).length, 1);
const before = await remote.service.getBalanceGeneral();
const periodo = getPeriodoKey(new Date());
assert.ok(periodo);
const periodPath = `periodos_financieros/${periodo}`;
const originalPeriods = remote.data.get(periodPath).ventasActivas;
assert.ok(originalPeriods >= 1);
await remote.service.enviarVentaPapelera(completed.id);
assert.equal(await quantity(), 5, "La venta de prueba retirada ya no descuenta existencias.");
assert.equal((await remote.service.getFletesVentas()).length, 0, "El flete también sale de los reportes.");
assert.equal((await remote.service.getVentasMaestrasPaginated()).items.some(item => item.id === completed.id), false);
assert.equal((await remote.service.getPapeleraItems()).some(item => item.tipo === "venta" && item.agrupadorId === completed.id), true);
assert.equal(remote.data.get(periodPath).ventasActivas, originalPeriods - 1);
assert.equal((await remote.service.getBalanceGeneral()).ingresos, 0, "No queda el ingreso de la venta retirada.");
assert.equal((await remote.service.getBalanceGeneral()).costosVentas, 0, "No queda el costo de la entrega en Balance general.");
assert.equal([...remote.data.values()].some(item => item?.subtipo === "reembolso_venta"), false, "Eliminar pruebas no simula reembolsos.");
await assert.rejects(remote.service.enviarVentaPapelera(completed.id), /Papelera/);
const primaryId = [...remote.data].find(([path, val]) => path.startsWith("movimientos/") && val.venta_id === completed.id)?.[0].split("/")[1];
assert.ok(primaryId);
await remote.service.restaurarMovimientoPapelera(primaryId);
assert.equal(await quantity(), 3);
assert.equal((await remote.service.getFletesVentas()).length, 1);
assert.equal((await remote.service.getBalanceGeneral()).balance, before.balance);
assert.equal(remote.data.get(periodPath).ventasActivas, originalPeriods);

// Venta bajo pedido ya pagada y entregada, con abono: retirar todos los eventos asociados.
const pedido = await remote.service.registerVentaTransaction({
  ...base, afecta_stock: false, canal_venta: "bajo_pedido", canal_venta_nombre: "Bajo pedido",
  anticipo_porcentaje: 50, items: [{ sku: "TEST", cantidad: 1, precio_unitario_venta: 400, costo_unitario_venta: 100 }],
  costo_envio_venta: 25
});
await remote.service.registrarPagoPedido(pedido.id, 210, "Efectivo");
await remote.service.actualizarSeguimientoPedido(pedido.id, { marcar_entregado: true });
const posted = remote.data.get(`ventas/${pedido.id}`);
assert.equal(posted.estado_pedido, "entregado");
const related = [...remote.data].filter(([path, item]) => path.startsWith("movimientos/") && (item.venta_id === pedido.id || item.venta_relacionada_id === pedido.id));
assert.equal(related.filter(([, item]) => item.subtipo === "abono_venta").length, 1);
const financialBefore = remote.data.get(periodPath).ventasActivas;
await remote.service.enviarMovimientoPapelera(related.find(([, item]) => item.venta_id === pedido.id)![0].split("/")[1]);
assert.ok(related.every(([path]) => remote.data.get(path).en_papelera === true), "Se retiran juntos partidas y abonos.");
assert.equal((await remote.service.getPedidosVenta()).some(item => item.venta_id === pedido.id), false);
assert.equal(remote.data.get(periodPath).ventasActivas, financialBefore - 2, "El índice resta venta y abono, no duplicaciones por partidas.");
await remote.service.restaurarMovimientoPapelera(related.find(([, item]) => item.venta_id === pedido.id)![0].split("/")[1]);
assert.equal(remote.data.get(`ventas/${pedido.id}`).estado_pedido, "entregado", "Se preserva el estado anterior.");
assert.equal(remote.data.get(periodPath).ventasActivas, financialBefore, "Restaurar repone venta y abono.");

// Una venta efectivamente devuelta también se puede limpiar, sin reembolsarla otra vez.
await remote.service.devolverVentaCompleta(pedido.id, "Devolución simulada");
const refBefore = [...remote.data.values()].filter(item => item?.subtipo === "reembolso_venta").length;
const refundedIndex = remote.data.get(periodPath).ventasActivas;
await remote.service.enviarVentaPapelera(pedido.id);
assert.equal([...remote.data.values()].filter(item => item?.subtipo === "reembolso_venta").length, refBefore);
assert.equal(remote.data.get(periodPath).ventasActivas, refundedIndex - 3, "Se quitan la venta, el abono y el reembolso del índice.");
await remote.service.restaurarMovimientoPapelera(related.find(([, item]) => item.venta_id === pedido.id)![0].split("/")[1]);
assert.equal(remote.data.get(periodPath).ventasActivas, refundedIndex);
assert.equal(remote.data.get(`ventas/${pedido.id}`).estado, "devuelto");

console.log("Papelera de pruebas: pagadas, entregadas, abonos, devolución, fletes, balances, inventario y restauración aprobados.");
