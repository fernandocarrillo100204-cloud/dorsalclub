/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Almacen } from "../types";
import GastosHistorial from "./finanzas/GastosHistorial";
import GastoForm from "./finanzas/GastoForm";
import { ResumenFinanciero } from "./finanzas/ResumenFinanciero";
import { FinanzasTabs } from "./finanzas/FinanzasTabs";

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

  return (
    <div className="w-full max-w-[1600px] mx-auto px-6 sm:px-8 py-6 space-y-6">
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
          navigationTabs={
            <FinanzasTabs
              activeTab="resumen"
              onNavigateToResumen={onNavigateToResumen}
              onNavigateToGastos={onNavigateToGastos}
            />
          }
          onNavigateToGastos={onNavigateToGastos}
          onNavigateToVentas={onNavigateToVentas}
          onNavigateToCompras={onNavigateToCompras}
        />
      ) : (
        <div className="space-y-6">
          {/* Barra alineada con las mismas pestañas para la vista de Gastos */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50/60 dark:bg-slate-900/40 p-1.5 sm:p-2 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-2xs">
            <div className="flex items-center">
              <FinanzasTabs
                activeTab="gastos"
                onNavigateToResumen={onNavigateToResumen}
                onNavigateToGastos={onNavigateToGastos}
              />
            </div>
          </div>
          <GastosHistorial
            almacenes={almacenes}
            onNuevoGasto={onNavigateToNuevoGasto}
            onEditarGasto={onNavigateToEditarGasto}
          />
        </div>
      )}
    </div>
  );
}
