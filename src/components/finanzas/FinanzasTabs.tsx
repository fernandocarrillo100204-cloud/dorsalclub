/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";

interface FinanzasTabsProps {
  activeTab: "resumen" | "gastos";
  onNavigateToResumen: () => void;
  onNavigateToGastos: () => void;
}

export const FinanzasTabs: React.FC<FinanzasTabsProps> = ({
  activeTab,
  onNavigateToResumen,
  onNavigateToGastos,
}) => {
  const isResumen = activeTab === "resumen";
  const isGastos = activeTab === "gastos";

  return (
    <div
      role="tablist"
      aria-label="Pestañas del módulo Finanzas"
      className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-slate-700/60 shadow-2xs"
    >
      <button
        type="button"
        role="tab"
        id="tab-finanzas-resumen"
        aria-selected={isResumen}
        onClick={onNavigateToResumen}
        className={`min-h-[38px] sm:min-h-[40px] px-3.5 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#059669] ${
          isResumen
            ? "bg-white dark:bg-[#111827] text-[#172033] dark:text-[#F8FAFC] shadow-2xs"
            : "text-[#64748B] dark:text-[#94A3B8] hover:text-[#172033] dark:hover:text-[#F8FAFC]"
        }`}
      >
        Resumen mensual
      </button>

      <button
        type="button"
        role="tab"
        id="tab-finanzas-gastos"
        aria-selected={isGastos}
        onClick={onNavigateToGastos}
        className={`min-h-[38px] sm:min-h-[40px] px-3.5 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#059669] ${
          isGastos
            ? "bg-white dark:bg-[#111827] text-[#172033] dark:text-[#F8FAFC] shadow-2xs"
            : "text-[#64748B] dark:text-[#94A3B8] hover:text-[#172033] dark:hover:text-[#F8FAFC]"
        }`}
      >
        Gastos
      </button>
    </div>
  );
};

export default FinanzasTabs;
