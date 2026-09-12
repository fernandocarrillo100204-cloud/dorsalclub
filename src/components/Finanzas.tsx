/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Almacen } from "../types";
import GastosHistorial from "./finanzas/GastosHistorial";
import GastoForm from "./finanzas/GastoForm";
import { ResumenFinanciero } from "./finanzas/ResumenFinanciero";

interface FinanzasProps {
  almacenes: Almacen[];
  subView: "resumen" | "gastos" | "nuevo" | "editar";
  gastoId?: string;
  onNavigateToResumen: () => void;
  onNavigateToGastos: () => void;
  onNavigateToNuevoGasto: () => void;
  onNavigateToEditarGasto: (gastoId: string) => void;
  onNavigateToVentas?: () => void;
  onNavigateToCompras?: () => void;
}

export default function Finanzas({
  almacenes,
  subView,
  gastoId,
  onNavigateToResumen,
  onNavigateToGastos,
  onNavigateToNuevoGasto,
  onNavigateToEditarGasto,
  onNavigateToVentas,
  onNavigateToCompras
}: FinanzasProps) {
  const isResumen = subView === "resumen";
  const isGastosSection = subView === "gastos" || subView === "nuevo" || subView === "editar";

  return (
    <div className="space-y-4">
      {/* Sub-navigation tabs */}
      <div className="flex items-center space-x-1 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl w-fit border border-slate-200/80 dark:border-slate-700/60 shadow-2xs">
        <button
          type="button"
          id="tab-finanzas-resumen"
          onClick={onNavigateToResumen}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            isResumen
              ? "bg-white dark:bg-[#111827] text-[#172033] dark:text-[#F8FAFC] shadow-2xs"
              : "text-[#64748B] dark:text-[#94A3B8] hover:text-[#172033] dark:hover:text-[#F8FAFC]"
          }`}
        >
          Resumen mensual
        </button>
        <button
          type="button"
          id="tab-finanzas-gastos"
          onClick={onNavigateToGastos}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            isGastosSection
              ? "bg-white dark:bg-[#111827] text-[#172033] dark:text-[#F8FAFC] shadow-2xs"
              : "text-[#64748B] dark:text-[#94A3B8] hover:text-[#172033] dark:hover:text-[#F8FAFC]"
          }`}
        >
          Gastos
        </button>
      </div>

      {/* View routing */}
      {subView === "nuevo" ? (
        <GastoForm
          mode="create"
          almacenes={almacenes}
          onSuccess={onNavigateToGastos}
          onCancel={onNavigateToGastos}
        />
      ) : subView === "editar" && gastoId ? (
        <GastoForm
          mode="edit"
          gastoId={gastoId}
          almacenes={almacenes}
          onSuccess={onNavigateToGastos}
          onCancel={onNavigateToGastos}
        />
      ) : isResumen ? (
        <ResumenFinanciero
          onNavigateToGastos={onNavigateToGastos}
          onNavigateToVentas={onNavigateToVentas}
          onNavigateToCompras={onNavigateToCompras}
        />
      ) : (
        <GastosHistorial
          almacenes={almacenes}
          onNuevoGasto={onNavigateToNuevoGasto}
          onEditarGasto={onNavigateToEditarGasto}
        />
      )}
    </div>
  );
}
