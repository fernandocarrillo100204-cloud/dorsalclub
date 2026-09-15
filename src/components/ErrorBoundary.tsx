/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundaryClass extends (React.Component as any) {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null as Error | null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: any) {
    console.error("ErrorBoundary ha capturado un error en componente:", error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      const isDynamicImport =
        this.state.error?.message?.includes("dynamically imported module") ||
        this.state.error?.name === "ChunkLoadError";

      return (
        <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center">
          <div className="h-12 w-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-4">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h2 className="text-base font-semibold text-[#172033] dark:text-[#F8FAFC] mb-1">
            {isDynamicImport
              ? "Actualización disponible en la aplicación"
              : (this.props.fallbackTitle || "Error al cargar el módulo")}
          </h2>
          <p className="text-xs text-[#64748B] dark:text-[#94A3B8] max-w-md mb-5 leading-relaxed">
            {isDynamicImport
              ? "Se detectaron módulos nuevos o la sesión necesita sincronizarse con el servidor. Haz clic en el botón para recargar y continuar."
              : "Ocurrió un problema inesperado al inicializar este módulo. Puedes intentar recargarlo ahora."}
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#059669] hover:bg-[#047857] text-white shadow-sm transition-all cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Recargar módulo
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const ExportedErrorBoundary: React.ComponentType<Props> = ErrorBoundaryClass as any;
export { ExportedErrorBoundary as ErrorBoundary };
export default ExportedErrorBoundary;
