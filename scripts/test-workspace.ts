import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildCsv, csvCell, searchText } from "../src/lib/presentation";
import { navigationGroups, navigationInfo, navigationParent, utilityNavigation } from "../src/lib/navigation";
import { ErrorState, FilterSummary, LoadingState, PageHeader, StatCard } from "../src/components/ui/Page";
import { FinanzasTabs } from "../src/components/finanzas/FinanzasTabs";

// Pure presentation tests: no credentials, browser storage or Firebase connection.
assert.equal(searchText("  STÜSSY / José  "), "stussy / jose");
assert.equal(searchText("Inversión inicial"), searchText("INVERSION INICIAL"));
assert.equal(csvCell('Cliente "A", MX'), '"Cliente ""A"", MX"');
assert.equal(csvCell(null), '""');
assert.equal(csvCell(-500), '"-500"', "Real numeric amounts must remain numeric values in exports.");
for (const value of ["=1+1", "+SUM(A1)", "@SUM(A1)", "-1+2", " \t=HYPERLINK(test)", "\r=1"]) {
  assert.ok(csvCell(value).startsWith('"\''), "CRM text must not execute as a spreadsheet formula.");
}
const csv = buildCsv(["Nombre", "Monto MXN"], [["José\nPérez", 900], ['=1+1', 0]]);
assert.equal(csv, '\uFEFF"Nombre","Monto MXN"\r\n"José\nPérez","900"\r\n"\'=1+1","0"');

const items = [...navigationGroups.flatMap(group => group.items), ...utilityNavigation];
assert.equal(new Set(items.map(item => item.id)).size, items.length, "Navigation destinations cannot be duplicated.");
for (const item of items) {
  assert.equal(navigationParent(item.id), item.id);
  assert.equal(navigationInfo(item.id).title, item.label);
}
for (const channel of ["ventas_nueva", "ventas_bajo_pedido", "ventas_emprendedor", "ventas_mayoreo"] as const) {
  assert.equal(navigationParent(channel), "ventas_stock", "Changing sales channel must keep the form mounted.");
}
assert.equal(navigationInfo("finanzas_gastos_nuevo").title, "Registrar gasto");
assert.equal(navigationInfo("finanzas_gastos_editar").title, "Editar gasto");
assert.equal(navigationInfo("drops").section, "Inventario");
assert.equal(JSON.stringify(navigationGroups).includes("transferencias"), false);
assert.equal(JSON.stringify(navigationGroups).includes("almacenes"), false);
assert.equal(navigationParent("movimientos"), "compras_nueva");

const render = (component: any, props: any) => renderToStaticMarkup(React.createElement(component, props));
assert.match(render(PageHeader, { title: "Ventas", eyebrow: "Operación", description: "Historial" }), /<h1>Ventas<\/h1>/);
assert.match(render(ErrorState, { message: "Error de lectura", onRetry: () => {} }), /role="alert"/);
assert.match(render(ErrorState, { message: "Error de lectura", onRetry: () => {} }), /Reintentar/);
assert.match(render(LoadingState, {}), /role="status"/);
assert.match(render(StatCard, { label: "Total", value: "—" }), /—/);
assert.match(render(FilterSummary, { count: 20, partial: true, active: true, onClear: () => {} }), /Sobre registros cargados/);
assert.match(render(FilterSummary, { count: 20, partial: true, active: true, onClear: () => {} }), /Limpiar filtros/);
assert.doesNotMatch(render(FilterSummary, { count: 0, active: false, onClear: () => {} }), /Limpiar filtros/);
const tabs = render(FinanzasTabs, { activeTab: "resumen", onNavigateToResumen: () => {}, onNavigateToMovimientos: () => {}, onNavigateToCobrar: () => {} });
assert.match(tabs, /aria-current="page"/);
assert.doesNotMatch(tabs, /Resumen mensual/, "All-history mode must not be mislabeled as a monthly summary.");
assert.equal((tabs.match(/<button/g) || []).length, 3);
console.log("Workspace: navegación, búsqueda, CSV seguro y semántica de estados aprobados (sin acceso a Firebase).");
