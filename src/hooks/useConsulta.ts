import { useCallback, useEffect, useRef, useState } from "react";
import { mensajeError } from "../lib/errores";

/** Una respuesta solo puede publicar datos para la clave que la originó. */
export function useConsulta<T>(clave: string, consultar: () => Promise<T>) {
  const requestRef = useRef(0);
  const [state, setState] = useState<{
    clave: string; data: T | null; loading: boolean; refreshing: boolean; error: string;
  }>({ clave, data: null, loading: true, refreshing: false, error: "" });

  const cargar = useCallback(async (refresh = true) => {
    const request = ++requestRef.current;
    setState(current => {
      const retained = refresh && current.clave === clave ? current.data : null;
      return { clave, data: retained, loading: retained === null, refreshing: retained !== null, error: "" };
    });
    try {
      const data = await consultar();
      if (request === requestRef.current) setState({ clave, data, loading: false, refreshing: false, error: "" });
    } catch (error) {
      if (request === requestRef.current) setState(current => ({
        ...current, error: mensajeError(error, "No fue posible consultar los datos. Vuelve a intentarlo.")
      }));
    } finally {
      if (request === requestRef.current) setState(current => ({ ...current, loading: false, refreshing: false }));
    }
  }, [clave, consultar]);

  useEffect(() => {
    cargar(false);
    return () => { requestRef.current += 1; };
  }, [cargar]);

  const actual = state.clave === clave;
  return {
    data: actual ? state.data : null,
    loading: !actual || state.loading,
    refreshing: actual && state.refreshing,
    error: actual ? state.error : "",
    cargar
  };
}
