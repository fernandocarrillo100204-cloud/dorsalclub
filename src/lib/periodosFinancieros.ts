/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  doc,
  getDocs,
  runTransaction,
  writeBatch,
  Timestamp,
  Transaction,
  Firestore
} from "firebase/firestore";
import {
  Movimiento,
  Compra,
  Gasto,
  PeriodoFinancieroIndex
} from "../types";
import {
  getRealDb,
  isRealFirebase,
  getLocalStorageItem,
  clearFinanzasCache
} from "./firebase";

// In-memory session cache for available periods list
let cachedPeriodos: PeriodoFinancieroIndex[] | null = null;

/**
 * Limpia la caché en memoria de periodos financieros disponibles.
 */
export function clearPeriodosFinancierosCache(): void {
  cachedPeriodos = null;
}

/**
 * Convierte cualquier representación de fecha (Date, Timestamp, {seconds}, string)
 * en una clave canónica de periodo 'YYYY-MM' en hora local.
 * Retorna null si la fecha es inválida.
 */
export function getPeriodoKey(fecha: any): string | null {
  if (!fecha) return null;

  let d: Date | null = null;

  if (fecha instanceof Date) {
    d = fecha;
  } else if (typeof fecha?.toDate === "function") {
    try {
      d = fecha.toDate();
    } catch {
      d = null;
    }
  } else if (typeof fecha === "object" && typeof fecha.seconds === "number") {
    d = new Date(fecha.seconds * 1000);
  } else if (typeof fecha === "string") {
    // Si viene en formato ISO o YYYY-MM o YYYY-MM-DD
    const str = fecha.trim();
    const match = str.match(/^(\d{4})-(\d{2})/);
    if (match) {
      const y = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12) {
        return `${y}-${String(m).padStart(2, "0")}`;
      }
    }
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      d = parsed;
    }
  } else if (typeof fecha === "number") {
    d = new Date(fecha);
  }

  if (!d || isNaN(d.getTime())) {
    return null;
  }

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export interface PeriodContribution {
  periodo: string;
  anio: number;
  mes: number;
  deltaVentas: number;
  deltaCompras: number;
  deltaGastos: number;
}

/**
 * Determina si un documento representa un registro financiero activo y válido,
 * y calcula su contribución exacta (1 o 0) al índice del periodo.
 *
 * Filtros estrictos de exclusión:
 * - Entradas de inventario que no sean compras
 * - Transferencias y ajustes
 * - Movimientos anulados
 * - Compras anuladas
 * - Documentos con fecha inválida o datos no válidos
 */
export function getPeriodContribution(
  documento: any,
  tipoRegistro: "venta" | "compra" | "gasto"
): PeriodContribution | null {
  if (!documento) return null;

  // 1. VENTAS / SALIDAS
  if (tipoRegistro === "venta") {
    const movTipo = documento.tipo;
    if (movTipo !== "salida") return null;

    const estado = (documento.estado || "activo").toLowerCase();
    if (estado === "anulado" || estado === "anulada") return null;

    const fecha = documento.fecha || documento.creado_at;
    const periodo = getPeriodoKey(fecha);
    if (!periodo) return null;

    const [yStr, mStr] = periodo.split("-");
    return {
      periodo,
      anio: parseInt(yStr, 10),
      mes: parseInt(mStr, 10),
      deltaVentas: 1,
      deltaCompras: 0,
      deltaGastos: 0
    };
  }

  // 2. COMPRAS
  if (tipoRegistro === "compra") {
    const estado = (documento.estado || "completada").toLowerCase();
    if (estado === "anulado" || estado === "anulada") return null;

    const fecha = documento.fecha || documento.fecha_str || documento.creado_at;
    const periodo = getPeriodoKey(fecha);
    if (!periodo) return null;

    const [yStr, mStr] = periodo.split("-");
    return {
      periodo,
      anio: parseInt(yStr, 10),
      mes: parseInt(mStr, 10),
      deltaVentas: 0,
      deltaCompras: 1,
      deltaGastos: 0
    };
  }

  // 3. GASTOS
  if (tipoRegistro === "gasto") {
    const monto = Number(documento.monto);
    if (isNaN(monto) || monto <= 0) return null;

    const fecha = documento.fecha || documento.fecha_str || documento.creado_at;
    const periodo = getPeriodoKey(fecha);
    if (!periodo) return null;

    const [yStr, mStr] = periodo.split("-");
    return {
      periodo,
      anio: parseInt(yStr, 10),
      mes: parseInt(mStr, 10),
      deltaVentas: 0,
      deltaCompras: 0,
      deltaGastos: 1
    };
  }

  return null;
}

/**
 * Calcula el nuevo objeto de índice para un periodo aplicando deltas,
 * garantizando que ningún contador sea negativo y nunca guardando importes de dinero.
 */
export function computeNewPeriodIndexData(
  existingData: any,
  periodo: string,
  deltaVentas = 0,
  deltaCompras = 0,
  deltaGastos = 0
): PeriodoFinancieroIndex {
  const [yStr, mStr] = periodo.split("-");
  const anio = parseInt(yStr, 10);
  const mes = parseInt(mStr, 10);

  const prevVentas = Number(existingData?.ventasActivas) || 0;
  const prevCompras = Number(existingData?.comprasActivas) || 0;
  const prevGastos = Number(existingData?.gastosActivos) || 0;

  const ventasActivas = Math.max(0, prevVentas + deltaVentas);
  const comprasActivas = Math.max(0, prevCompras + deltaCompras);
  const gastosActivos = Math.max(0, prevGastos + deltaGastos);
  const totalRegistrosActivos = ventasActivas + comprasActivas + gastosActivos;

  return {
    periodo,
    anio,
    mes,
    ventasActivas,
    comprasActivas,
    gastosActivos,
    totalRegistrosActivos,
    actualizadoEn: isRealFirebase ? Timestamp.now() : new Date()
  };
}

export interface PeriodDeltaItem {
  periodo: string;
  deltaVentas?: number;
  deltaCompras?: number;
  deltaGastos?: number;
}

/**
 * Aplica variaciones (deltas) al índice de periodos_financieros de forma atómica.
 * Si se pasa una transacción de Firestore activa, las escrituras se realizan sobre ella.
 * De lo contrario, ejecuta una transacción independiente.
 */
export async function applyPeriodIndexDeltas(
  deltas: PeriodDeltaItem[],
  options?: {
    transaction?: Transaction;
    db?: Firestore;
  }
): Promise<void> {
  const realDb = options?.db || getRealDb();

  // Filtrar deltas sin cambios efectivos
  const validDeltas = deltas.filter(d => {
    return (
      (d.deltaVentas && d.deltaVentas !== 0) ||
      (d.deltaCompras && d.deltaCompras !== 0) ||
      (d.deltaGastos && d.deltaGastos !== 0)
    );
  });

  if (validDeltas.length === 0) return;

  if (isRealFirebase && realDb) {
    if (options?.transaction) {
      const tx = options.transaction;
      // Todas las lecturas deben preceder a las escrituras
      const periodSnaps = await Promise.all(
        validDeltas.map(d => tx.get(doc(realDb, "periodos_financieros", d.periodo)))
      );
      for (let i = 0; i < validDeltas.length; i++) {
        const d = validDeltas[i];
        const snap = periodSnaps[i];
        const prev = snap.exists() ? snap.data() : null;
        const updated = computeNewPeriodIndexData(
          prev,
          d.periodo,
          d.deltaVentas || 0,
          d.deltaCompras || 0,
          d.deltaGastos || 0
        );
        tx.set(doc(realDb, "periodos_financieros", d.periodo), updated, { merge: true });
      }
    } else {
      await runTransaction(realDb, async (tx) => {
        const periodSnaps = await Promise.all(
          validDeltas.map(d => tx.get(doc(realDb, "periodos_financieros", d.periodo)))
        );
        for (let i = 0; i < validDeltas.length; i++) {
          const d = validDeltas[i];
          const snap = periodSnaps[i];
          const prev = snap.exists() ? snap.data() : null;
          const updated = computeNewPeriodIndexData(
            prev,
            d.periodo,
            d.deltaVentas || 0,
            d.deltaCompras || 0,
            d.deltaGastos || 0
          );
          tx.set(doc(realDb, "periodos_financieros", d.periodo), updated, { merge: true });
        }
      });
    }
  }

  // Invalida las cachés en memoria
  clearPeriodosFinancierosCache();
  clearFinanzasCache();
}

/**
 * Obtiene los periodos financieros disponibles con al menos un registro activo válido.
 * En Firebase: consulta exclusivamente la colección ligera 'periodos_financieros'.
 * En Modo Local: deriva los periodos disponibles directamente de los registros locales.
 *
 * Los resultados se devuelven ordenados cronológicamente de forma ascendente.
 */
export async function getPeriodosFinancierosDisponibles(
  forceRefresh: boolean = false
): Promise<PeriodoFinancieroIndex[]> {
  if (!forceRefresh && cachedPeriodos !== null) {
    return cachedPeriodos;
  }

  const realDb = getRealDb();

  // --- MODO FIREBASE ---
  if (isRealFirebase && realDb) {
    try {
      const snap = await getDocs(collection(realDb, "periodos_financieros"));
      const list: PeriodoFinancieroIndex[] = [];

      // Si el índice en Firestore está vacío, devolvemos una lista vacía sin reconstruir automáticamente
      if (snap.empty) {
        cachedPeriodos = [];
        return [];
      }

      snap.forEach((d) => {
        const data = d.data();
        const total = Number(data.totalRegistrosActivos) || 0;
        // Solo considerar disponibles periodos con registros activos > 0
        if (total > 0) {
          const periodoStr = data.periodo || d.id;
          const [yStr, mStr] = periodoStr.split("-");
          list.push({
            periodo: periodoStr,
            anio: Number(data.anio) || parseInt(yStr, 10),
            mes: Number(data.mes) || parseInt(mStr, 10),
            ventasActivas: Number(data.ventasActivas) || 0,
            comprasActivas: Number(data.comprasActivas) || 0,
            gastosActivos: Number(data.gastosActivos) || 0,
            totalRegistrosActivos: total,
            actualizadoEn: data.actualizadoEn
          });
        }
      });

      // Ordenar cronológicamente en memoria
      list.sort((a, b) => a.periodo.localeCompare(b.periodo));
      cachedPeriodos = list;
      return list;
    } catch (err: any) {
      console.error("Error al consultar periodos_financieros de Firestore:", err);
      // REGLA CRÍTICA: NUNCA usar localStorage como fallback silencioso si Firebase falla
      throw err;
    }
  }

  // --- MODO LOCAL / EMULADOR (localStorage) ---
  // Calcula los periodos disponibles usando únicamente los registros locales existentes
  const movs = getLocalStorageItem<Movimiento[]>("movimientos", []);
  const compras = getLocalStorageItem<Compra[]>("compras", []);
  const gastos = getLocalStorageItem<Gasto[]>("gastos", []);

  const map = new Map<string, { ventas: number; compras: number; gastos: number }>();

  for (const m of movs) {
    const contrib = getPeriodContribution(m, "venta");
    if (contrib) {
      const curr = map.get(contrib.periodo) || { ventas: 0, compras: 0, gastos: 0 };
      curr.ventas += 1;
      map.set(contrib.periodo, curr);
    }
  }

  for (const c of compras) {
    const contrib = getPeriodContribution(c, "compra");
    if (contrib) {
      const curr = map.get(contrib.periodo) || { ventas: 0, compras: 0, gastos: 0 };
      curr.compras += 1;
      map.set(contrib.periodo, curr);
    }
  }

  for (const g of gastos) {
    const contrib = getPeriodContribution(g, "gasto");
    if (contrib) {
      const curr = map.get(contrib.periodo) || { ventas: 0, compras: 0, gastos: 0 };
      curr.gastos += 1;
      map.set(contrib.periodo, curr);
    }
  }

  const list: PeriodoFinancieroIndex[] = [];
  for (const [periodo, counts] of map.entries()) {
    const total = counts.ventas + counts.compras + counts.gastos;
    if (total > 0) {
      const [yStr, mStr] = periodo.split("-");
      list.push({
        periodo,
        anio: parseInt(yStr, 10),
        mes: parseInt(mStr, 10),
        ventasActivas: counts.ventas,
        comprasActivas: counts.compras,
        gastosActivos: counts.gastos,
        totalRegistrosActivos: total
      });
    }
  }

  list.sort((a, b) => a.periodo.localeCompare(b.periodo));
  cachedPeriodos = list;
  return list;
}

/**
 * Selecciona el periodo inicial al abrir Finanzas según las reglas:
 * 1. Si el mes actual está disponible, selecciónalo.
 * 2. Si el mes actual no tiene registros, selecciona el periodo disponible más reciente (pasado o actual).
 * 3. No selecciones automáticamente un periodo futuro solamente por ser el último.
 * 4. Si solo existen periodos futuros, selecciona el más cercano.
 * 5. Si no existe ningún registro financiero, conserva el mes actual únicamente como estado vacío neutral.
 */
export function getInitialSelectedPeriod(
  availablePeriods: PeriodoFinancieroIndex[],
  currentYear: number,
  currentMonth: number
): { year: number; month: number; isEmpty: boolean } {
  if (!availablePeriods || availablePeriods.length === 0) {
    return { year: currentYear, month: currentMonth, isEmpty: true };
  }

  const currentKey = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;
  const foundCurrent = availablePeriods.find(p => p.periodo === currentKey);
  if (foundCurrent) {
    return { year: foundCurrent.anio, month: foundCurrent.mes, isEmpty: false };
  }

  // Filtrar periodos pasados o actuales (<= mes actual)
  const pastOrCurrent = availablePeriods.filter(p => p.periodo <= currentKey);
  if (pastOrCurrent.length > 0) {
    // El más reciente disponible hasta hoy
    const mostRecent = pastOrCurrent[pastOrCurrent.length - 1];
    return { year: mostRecent.anio, month: mostRecent.mes, isEmpty: false };
  }

  // Si solo existen periodos futuros, selecciona el más cercano (el primero en orden ascendente)
  const futurePeriods = availablePeriods.filter(p => p.periodo > currentKey);
  if (futurePeriods.length > 0) {
    const closestFuture = futurePeriods[0];
    return { year: closestFuture.anio, month: closestFuture.mes, isEmpty: false };
  }

  return { year: currentYear, month: currentMonth, isEmpty: true };
}

/**
 * Si el periodo seleccionado deja de estar disponible (ej. al anular o eliminar su único registro),
 * localiza el periodo disponible más cercano en distancia de meses.
 */
export function getClosestValidPeriod(
  targetYear: number,
  targetMonth: number,
  availablePeriods: PeriodoFinancieroIndex[]
): { year: number; month: number; isEmpty: boolean } {
  if (!availablePeriods || availablePeriods.length === 0) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, isEmpty: true };
  }

  const targetKey = `${targetYear}-${String(targetMonth).padStart(2, "0")}`;
  const found = availablePeriods.find(p => p.periodo === targetKey);
  if (found) {
    return { year: found.anio, month: found.mes, isEmpty: false };
  }

  const targetTotalMonths = targetYear * 12 + targetMonth;
  let closest = availablePeriods[0];
  let minDiff = Math.abs((closest.anio * 12 + closest.mes) - targetTotalMonths);

  for (let i = 1; i < availablePeriods.length; i++) {
    const p = availablePeriods[i];
    const diff = Math.abs((p.anio * 12 + p.mes) - targetTotalMonths);
    if (diff < minDiff) {
      minDiff = diff;
      closest = p;
    }
  }

  return { year: closest.anio, month: closest.mes, isEmpty: false };
}
