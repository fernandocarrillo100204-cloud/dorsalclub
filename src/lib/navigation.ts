import { ArrowLeftRight, Boxes, CircleDollarSign, ClipboardList, History, Layers, Package, Plus, Settings2, ShoppingBag, ShoppingCart, Trash2, UserRoundSearch, Users, Wallet } from "lucide-react";
import { NavigationTab } from "../types";

export const navigationGroups = [
  { id: "compras", label: "Compras", icon: ShoppingBag, items: [
    { id: "compras" as NavigationTab, label: "Historial de compras", icon: History, keywords: "proveedores costos mercancía" },
    { id: "compras_nueva" as NavigationTab, label: "Registrar compra", icon: Plus, keywords: "nueva entrada inventario" }
  ] },
  { id: "ventas", label: "Ventas", icon: ShoppingCart, items: [
    { id: "ventas_historial" as NavigationTab, label: "Historial de ventas", icon: History, keywords: "cobros devoluciones cancelar" },
    { id: "ventas_stock" as NavigationTab, label: "Registrar venta", icon: Plus, keywords: "nueva stock mayoreo emprendedor bajo pedido" },
    { id: "ventas_pedidos" as NavigationTab, label: "Pedidos por pagar", icon: ClipboardList, keywords: "cobranza cobrar anticipo saldo pendiente pagos pedidos" }
  ] },
  { id: "clientes", label: "Clientes", icon: Users, items: [
    { id: "clientes" as NavigationTab, label: "Directorio de clientes", icon: Users, keywords: "contactos marcas teléfono" },
    { id: "analisis_clientes" as NavigationTab, label: "Análisis de clientes", icon: UserRoundSearch, keywords: "actividad compras comportamiento" }
  ] },
  { id: "inventario", label: "Inventario", icon: Boxes, items: [
    { id: "drops" as NavigationTab, label: "Inventario por drops", icon: Layers, keywords: "stock disponibilidad existencias colecciones lotes pedidos" },
    { id: "catalogo" as NavigationTab, label: "Catálogo de productos", icon: Package, keywords: "variantes marcas catálogo SKU" },
    { id: "historial" as NavigationTab, label: "Movimientos de inventario", icon: History, keywords: "entradas salidas ajustes historial" }
  ] },
  { id: "finanzas", label: "Finanzas", icon: Wallet, items: [
    { id: "finanzas" as NavigationTab, label: "Balance general", icon: Wallet, keywords: "balance ingresos egresos flujo gastos extra" }
  ] }
];
export const utilityNavigation = [
  { id: "configuracion" as NavigationTab, label: "Configuración", icon: Settings2, keywords: "listas porcentajes catálogos" },
  { id: "papelera" as NavigationTab, label: "Papelera", icon: Trash2, keywords: "eliminados restaurar borrar" }
];
export function navigationParent(tab: NavigationTab): NavigationTab {
  if (["ventas_nueva", "ventas_bajo_pedido", "ventas_mayoreo", "ventas_emprendedor"].includes(tab)) return "ventas_stock";
  if (["finanzas_gastos", "finanzas_cobrar", "finanzas_gastos_nuevo", "finanzas_gastos_editar"].includes(tab)) return "finanzas";
  if (tab === "movimientos") return "compras_nueva";
  return tab;
}
export function navigationInfo(tab: NavigationTab) {
  const parent = navigationParent(tab);
  const group = navigationGroups.find(group => group.items.some(item => item.id === parent));
  const item = group?.items.find(item => item.id === parent) || utilityNavigation.find(item => item.id === parent);
  return { section: group?.label || "Administración", title: tab === "finanzas_gastos_nuevo" ? "Registrar gasto" : tab === "finanzas_gastos_editar" ? "Editar gasto" : item?.label || "Antiorder" };
}
