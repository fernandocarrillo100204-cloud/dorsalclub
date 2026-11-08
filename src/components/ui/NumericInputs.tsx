import React, { useEffect, useState } from "react";
import { limpiarEntero, limpiarImporte, mostrarImporte } from "../../lib/inputsNumericos";

type NumericValue = string | number;
type CommonProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "inputMode" | "value" | "defaultValue"> & {
  value?: NumericValue;
  defaultValue?: NumericValue;
};

/**
 * type=text evita las flechas y el cambio por rueda.
 * Mientras hay foco, el texto editado permanece intacto (por ejemplo, "12.").
 * Al salir, el valor se muestra con separadores de miles y dos decimales.
 * El estado de negocio sigue siendo numérico, y nunca recibe "$" ni comas de formato.
 */
export function MoneyInput({ value, onChange, onFocus, onBlur, ...props }: CommonProps) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => limpiarImporte(String(value ?? "")));

  useEffect(() => {
    if (!focused) setDraft(limpiarImporte(String(value ?? "")));
  }, [value, focused]);

  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      value={focused ? draft : mostrarImporte(value)}
      onFocus={event => {
        setDraft(limpiarImporte(String(value ?? "")));
        setFocused(true);
        // Facilita reemplazar un importe completo sin borrar dígito por dígito.
        event.currentTarget.select();
        onFocus?.(event);
      }}
      onChange={event => {
        const next = limpiarImporte(event.currentTarget.value);
        setDraft(next);
        event.currentTarget.value = next;
        onChange?.(event);
      }}
      onBlur={event => {
        setFocused(false);
        onBlur?.(event);
      }}
    />
  );
}

/** Cantidades y porcentajes enteros, sin incremento con scroll. */
export function IntegerInput({ value, defaultValue, onChange, ...props }: CommonProps) {
  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      value={value}
      defaultValue={defaultValue}
      onChange={event => {
        event.currentTarget.value = limpiarEntero(event.currentTarget.value);
        onChange?.(event);
      }}
    />
  );
}
