/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Almacen } from "../types";
import GastosHistorial from "./finanzas/GastosHistorial";
import GastoForm from "./finanzas/GastoForm";

interface FinanzasProps {
  almacenes: Almacen[];
  subView: "list" | "nuevo" | "editar";
  gastoId?: string;
  onNavigateToGastos: () => void;
  onNavigateToNuevoGasto: () => void;
  onNavigateToEditarGasto: (gastoId: string) => void;
}

export default function Finanzas({
  almacenes,
  subView,
  gastoId,
  onNavigateToGastos,
  onNavigateToNuevoGasto,
  onNavigateToEditarGasto
}: FinanzasProps) {
  if (subView === "nuevo") {
    return (
      <GastoForm
        mode="create"
        almacenes={almacenes}
        onSuccess={onNavigateToGastos}
        onCancel={onNavigateToGastos}
      />
    );
  }

  if (subView === "editar" && gastoId) {
    return (
      <GastoForm
        mode="edit"
        gastoId={gastoId}
        almacenes={almacenes}
        onSuccess={onNavigateToGastos}
        onCancel={onNavigateToGastos}
      />
    );
  }

  return (
    <GastosHistorial
      almacenes={almacenes}
      onNuevoGasto={onNavigateToNuevoGasto}
      onEditarGasto={onNavigateToEditarGasto}
    />
  );
}
