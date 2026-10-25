import React, { useState } from "react";
import { Settings, ShoppingBag, ShoppingCart, Users, Receipt, Package, ChevronRight, Warehouse } from "lucide-react";
import ConfiguracionModuloModal, { ModuloConfigurable } from "./ConfiguracionModuloModal";

interface ConfiguracionProps {
  onNavigateToProducts?: () => void;
  onNavigateToWarehouses?: () => void;
}

const modules: Array<{ id: ModuloConfigurable; title: string; description: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "ventas", title: "Ventas", description: "Canales, porcentajes, mínimos, anticipos, ubicaciones y repartidores.", icon: ShoppingCart },
  { id: "compras", title: "Compras", description: "Proveedores disponibles para registrar mercancía.", icon: ShoppingBag },
  { id: "clientes", title: "Clientes", description: "Tipos de cliente, canales de contacto y orígenes.", icon: Users },
  { id: "finanzas", title: "Finanzas", description: "Categorías de gasto y métodos de pago.", icon: Receipt }
];

export default function Configuracion({ onNavigateToProducts, onNavigateToWarehouses }: ConfiguracionProps) {
  const [activeModule, setActiveModule] = useState<ModuloConfigurable | null>(null);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
          <Settings className="w-6 h-6 text-emerald-600" /> Configuración
        </h1>
        <p className="text-xs text-zinc-500 mt-1">Administra desde un solo lugar las listas y reglas operativas de Antiorder.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {modules.map(module => {
          const Icon = module.icon;
          return (
            <button key={module.id} type="button" onClick={() => setActiveModule(module.id)} className="group rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 text-left hover:border-emerald-400 dark:hover:border-emerald-700 transition-colors">
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center shrink-0"><Icon className="w-5 h-5" /></span>
                <span className="min-w-0 flex-1">
                  <strong className="text-sm text-zinc-900 dark:text-white">{module.title}</strong>
                  <span className="block text-xs text-zinc-500 mt-1 leading-relaxed">{module.description}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-emerald-600 mt-1" />
              </div>
            </button>
          );
        })}

        <button type="button" onClick={onNavigateToWarehouses} className="group rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 text-left hover:border-emerald-400 dark:hover:border-emerald-700 transition-colors">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center shrink-0"><Warehouse className="w-5 h-5" /></span>
            <span className="min-w-0 flex-1"><strong className="text-sm text-zinc-900 dark:text-white">Almacenes</strong><span className="block text-xs text-zinc-500 mt-1 leading-relaxed">Crea, edita o desactiva ubicaciones utilizadas en compras y transferencias.</span></span>
            <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-emerald-600 mt-1" />
          </div>
        </button>

        <button type="button" onClick={onNavigateToProducts} className="group rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 text-left hover:border-emerald-400 dark:hover:border-emerald-700 transition-colors">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center shrink-0"><Package className="w-5 h-5" /></span>
            <span className="min-w-0 flex-1"><strong className="text-sm text-zinc-900 dark:text-white">Productos e inventario</strong><span className="block text-xs text-zinc-500 mt-1">Marcas, categorías, colores, tallas, unidades y variantes se administran desde Productos.</span></span>
            <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-emerald-600 mt-1" />
          </div>
        </button>
      </div>

      {activeModule && <ConfiguracionModuloModal isOpen module={activeModule} onClose={() => setActiveModule(null)} />}
    </div>
  );
}
