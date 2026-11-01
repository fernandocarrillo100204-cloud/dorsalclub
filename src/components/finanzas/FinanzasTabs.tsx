import React from "react";

interface FinanzasTabsProps {
  activeTab: "resumen" | "movimientos" | "cobrar";
  onNavigateToResumen: () => void;
  onNavigateToMovimientos: () => void;
  onNavigateToCobrar: () => void;
}

export const FinanzasTabs: React.FC<FinanzasTabsProps> = ({ activeTab, onNavigateToResumen, onNavigateToMovimientos, onNavigateToCobrar }) => (
  <nav aria-label="Secciones de Finanzas" className="inline-flex flex-wrap items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl max-w-full">
    {[
      { id: "resumen", label: "Resumen", action: onNavigateToResumen },
      { id: "movimientos", label: "Movimientos", action: onNavigateToMovimientos },
      { id: "cobrar", label: "Por cobrar", action: onNavigateToCobrar }
    ].map(item => <button key={item.id} type="button" aria-current={activeTab === item.id ? "page" : undefined} onClick={item.action}
      className={`min-h-10 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${activeTab === item.id ? "bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-sm" : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"}`}>{item.label}</button>)}
  </nav>
);
export default FinanzasTabs;
