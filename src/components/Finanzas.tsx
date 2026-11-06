/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import GastoForm from "./finanzas/GastoForm";
import { ResumenFinanciero } from "./finanzas/ResumenFinanciero";
import { FinanzasTabs } from "./finanzas/FinanzasTabs";
import ConfiguracionModuloModal from "./ConfiguracionModuloModal";
import { Settings } from "lucide-react";
import MovimientosFinancieros from "./finanzas/MovimientosFinancieros";
import CuentasPorCobrar from "./finanzas/CuentasPorCobrar";

interface FinanzasProps {
  subView: "resumen" | "movimientos" | "cobrar" | "nuevo" | "editar";
  gastoId?: string;
  onNavigateToResumen: () => void;
  onNavigateToGastos: () => void;
  onNavigateToCobrar: () => void;
  onNavigateToNuevoGasto: () => void;
  onNavigateToEditarGasto: (gastoId: string) => void;
  onNavigateToVentas?: () => void;
  onNavigateToCompras?: () => void;
}

export default function Finanzas({
  subView,
  gastoId,
  onNavigateToResumen,
  onNavigateToGastos,
  onNavigateToCobrar,
  onNavigateToNuevoGasto,
  onNavigateToEditarGasto,
  onNavigateToVentas,
  onNavigateToCompras
}: FinanzasProps) {
  const isResumen = subView === "resumen";
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [configVersion, setConfigVersion] = useState(0);
  const settingsAction = <button type="button" onClick={() => setIsSettingsOpen(true)} className="btn-secondary"><Settings className="h-4 w-4" />Configurar</button>;
  const tabs = <FinanzasTabs activeTab={isResumen ? "resumen" : subView === "cobrar" ? "cobrar" : "movimientos"} onNavigateToResumen={onNavigateToResumen} onNavigateToMovimientos={onNavigateToGastos} onNavigateToCobrar={onNavigateToCobrar} />;

  return (
    <div className="page-shell space-y-6">
      {(subView === "nuevo" || subView === "editar") && <div className="flex justify-end">{settingsAction}</div>}
      {/* View routing */}
      {subView === "nuevo" ? (
        <GastoForm
          mode="create"

          onSuccess={onNavigateToGastos}
          onCancel={onNavigateToGastos}
          configVersion={configVersion}
        />
      ) : subView === "editar" && gastoId ? (
        <GastoForm
          mode="edit"
          gastoId={gastoId}

          onSuccess={onNavigateToGastos}
          onCancel={onNavigateToGastos}
          configVersion={configVersion}
        />
      ) : isResumen ? (
        <ResumenFinanciero
          navigationTabs={tabs}
          headerActions={settingsAction}
          onNavigateToGastos={onNavigateToGastos}
          onNavigateToVentas={onNavigateToVentas}
          onNavigateToCompras={onNavigateToCompras}
        />
      ) : subView === "movimientos" ? (
        <MovimientosFinancieros navigationTabs={tabs} headerActions={settingsAction} onNuevoGasto={onNavigateToNuevoGasto} onEditarGasto={onNavigateToEditarGasto} />
      ) : (
        <CuentasPorCobrar navigationTabs={tabs} headerActions={settingsAction} configVersion={configVersion} />
      )}
      <ConfiguracionModuloModal isOpen={isSettingsOpen} module="finanzas" onClose={() => setIsSettingsOpen(false)} onSaved={() => setConfigVersion(value => value + 1)} />
    </div>
  );
}
