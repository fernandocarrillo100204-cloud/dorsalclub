import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { limpiarImporte, limpiarEntero, mostrarImporte } from "../src/lib/inputsNumericos";

assert.equal(limpiarImporte("1500.25"), "1500.25");
assert.equal(limpiarImporte("12."), "12.", "El punto decimal pendiente no desaparece al editar");
assert.equal(limpiarImporte(".5"), "0.5");
assert.equal(limpiarImporte("$1,500.50"), "1500.50", "Pegar importes con miles y decimales");
assert.equal(limpiarImporte("1.500,50"), "1500.50", "Admitir separadores de miles europeos");
assert.equal(limpiarImporte("1500,5"), "1500.5", "Admitir coma decimal al escribir");
assert.equal(limpiarImporte("1.2.3"), "1.23", "Solo puede haber un separador decimal");
assert.equal(limpiarImporte("-50"), "50", "Los importes se ingresan positivos y se clasifican por tipo");
assert.equal(limpiarImporte("1abc.3"), "1.3");
assert.equal(mostrarImporte(""), "");
assert.equal(mostrarImporte(1500), "1,500.00");
assert.equal(mostrarImporte("1500.5"), "1,500.50");
assert.equal(mostrarImporte("12."), "12.00");
assert.equal(limpiarEntero("15abc.9"), "159", "Solo quedan dígitos en captura entera");

const readComponents = (folder: string): string[] => readdirSync(folder, { withFileTypes: true }).flatMap(item => {
  const location = join(folder, item.name);
  return item.isDirectory() ? readComponents(location) : item.name.endsWith(".tsx") ? [location] : [];
});
const files = readComponents("src/components");
for (const filename of files) {
  const source = readFileSync(filename, "utf8");
  const inputs = [...source.matchAll(/<input\b[\s\S]*?\/>/g)];
  assert.ok(!inputs.some(([tag]) => /type\s*=\s*["']number["']/.test(tag)),
    `Queda un input number con incrementos por scroll: ${filename}`);
}
const inputSource = readFileSync("src/components/ui/NumericInputs.tsx", "utf8");
assert.match(inputSource, /type="text"/, "Todos los campos numéricos usan texto sin controles de incremento");
assert.match(inputSource, /inputMode="decimal"/, "Los importes abren el teclado decimal");
assert.match(inputSource, /inputMode="numeric"/, "Las cantidades abren teclado numérico");
console.log("Entradas monetarias: formatos, decimales, pegado y ausencia de input number aprobados.");
