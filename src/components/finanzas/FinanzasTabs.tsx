/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";

interface FinanzasTabsProps {
  activeTab: "resumen" | "movimientos" | "cobrar";
  onNavigateToResumen: () => void;
  onNavigateToMovimientos: () => void;
  onNavigateToCobrar: () => void;
}

export const FinanzasTabs: React.FC<FinanzasTabsProps> = ({
  activeTab,
  onNavigateToResumen,
  onNavigateToMovimientos,
  onNavigateToCobrar,
}) => {
  const isResumen = activeTab === "resumen";
  const isMovimientos = activeTab === "movimientos";
  const isCobrar = activeTab === "cobrar";

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
        aria-selected={isMovimientos}
        onClick={onNavigateToMovimientos}
        className={`min-h-[38px] sm:min-h-[40px] px-3.5 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#059669] ${
          isMovimientos
            ? "bg-white dark:bg-[#111827] text-[#172033] dark:text-[#F8FAFC] shadow-2xs"
            : "text-[#64748B] dark:text-[#94A3B8] hover:text-[#172033] dark:hover:text-[#F8FAFC]"
        }`}
      >
        Movimientos
      </button>

      <button
        type="button"
        role="tab"
        aria-selected={isCobrar}
        onClick={onNavigateToCobrar}
        className={`min-h-[38px] sm:min-h-[40px] px-3.5 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#059669] ${
          isCobrar
            ? "bg-white dark:bg-[#111827] text-[#172033] dark:text-[#F8FAFC] shadow-2xs"
            : "text-[#64748B] dark:text-[#94A3B8] hover:text-[#172033] dark:hover:text-[#F8FAFC]"
        }`}
      >
        Por cobrar
      </button>
    </div>
  );
};

export default FinanzasTabs;
