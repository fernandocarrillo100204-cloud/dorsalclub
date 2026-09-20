#!/usr/bin/env node

/**
 * Reconstrucción manual e idempotente del índice de periodos financieros.
 *
 * Este script consulta los registros contables históricos reales:
 * - Ventas activas (colección 'movimientos' con tipo == 'salida' y estado activo)
 * - Compras activas (colección 'compras' con estado no anulado)
 * - Gastos activos (colección 'gastos' con monto válido)
 *
 * y recalcula la colección liviana 'periodos_financieros' respetando los límites de Firestore.
 *
 * Modos de ejecución:
 * - Modo por defecto (--dry-run):
 *   node scripts/rebuild-financial-period-index.mjs
 *   node scripts/rebuild-financial-period-index.mjs --dry-run
 *   (Solo analiza y muestra el reporte por consola sin escribir en Firestore)
 *
 * - Modo de aplicación (--apply):
 *   node scripts/rebuild-financial-period-index.mjs --apply
 *   (Aplica las escrituras en lotes atómicos de máximo 400 operaciones)
 */

import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const isApply = args.includes('--apply');
const isDryRun = !isApply || args.includes('--dry-run');

const EXPECTED_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'warehouse-96318';

console.log('='.repeat(70));
console.log('   MIGRACIÓN HISTÓRICA: ÍNDICE DE PERIODOS FINANCIEROS');
console.log('='.repeat(70));
console.log(`Proyecto Firestore : ${EXPECTED_PROJECT_ID}`);
console.log(`Modo de ejecución  : ${isApply ? 'APPLY (Escritura en base de datos)' : 'DRY RUN (Simulación de solo lectura)'}`);
console.log('='.repeat(70));

let app;
try {
  app = getApps().length === 0
    ? initializeApp({
        credential: applicationDefault(),
        projectId: EXPECTED_PROJECT_ID
      })
    : getApps()[0];
} catch (err) {
  console.error('\n[ERROR] No se pudo inicializar Firebase Admin con Application Default Credentials.');
  console.error('Asegúrate de configurar GOOGLE_APPLICATION_CREDENTIALS o ejecutar en un entorno autenticado de GCP/Firebase.');
  console.error(`Detalle del error: ${err.message}\n`);
  process.exit(1);
}

const db = getFirestore(app);

/**
 * Normaliza cualquier formato de fecha a "YYYY-MM"
 */
function getPeriodoKey(rawDate) {
  if (!rawDate) return null;

  let d = null;
  if (typeof rawDate.toDate === 'function') {
    d = rawDate.toDate();
  } else if (rawDate._seconds !== undefined) {
    d = new Date(rawDate._seconds * 1000);
  } else if (rawDate instanceof Date) {
    d = rawDate;
  } else if (typeof rawDate === 'number') {
    d = new Date(rawDate);
  } else if (typeof rawDate === 'string') {
    const trimmed = rawDate.trim();
    if (/^\d{4}-\d{2}/.test(trimmed)) {
      return trimmed.substring(0, 7);
    }
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      d = parsed;
    }
  }

  if (!d || isNaN(d.getTime())) return null;

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

async function runMigration() {
  console.log('\n[1/4] Consultando movimientos de venta activos...');
  const periodsMap = new Map();

  function getOrCreatePeriod(periodKey) {
    if (!periodsMap.has(periodKey)) {
      const [yStr, mStr] = periodKey.split('-');
      periodsMap.set(periodKey, {
        periodo: periodKey,
        anio: parseInt(yStr, 10),
        mes: parseInt(mStr, 10),
        ventasActivas: 0,
        comprasActivas: 0,
        gastosActivos: 0
      });
    }
    return periodsMap.get(periodKey);
  }

  // 1. VENTAS: colección 'movimientos' con tipo == 'salida'
  try {
    const movsSnap = await db.collection('movimientos').where('tipo', '==', 'salida').get();
    let totalVentasAnalizadas = 0;
    let ventasActivas = 0;

    movsSnap.forEach((docSnap) => {
      totalVentasAnalizadas++;
      const data = docSnap.data();
      const estado = String(data.estado || 'activo').toLowerCase();
      if (estado === 'anulado' || estado === 'anulada') {
        return; // Excluir movimientos anulados
      }

      const pKey = getPeriodoKey(data.fecha || data.creado_at);
      if (pKey) {
        const p = getOrCreatePeriod(pKey);
        p.ventasActivas += 1;
        ventasActivas++;
      }
    });
    console.log(`  -> Salidas de inventario analizadas: ${totalVentasAnalizadas} (activas válidas: ${ventasActivas})`);
  } catch (err) {
    console.warn(`  [AVISO] No se pudo leer la colección 'movimientos': ${err.message}`);
  }

  // 2. COMPRAS: colección 'compras'
  console.log('\n[2/4] Consultando compras activas...');
  try {
    const comprasSnap = await db.collection('compras').get();
    let totalComprasAnalizadas = 0;
    let comprasActivas = 0;

    comprasSnap.forEach((docSnap) => {
      totalComprasAnalizadas++;
      const data = docSnap.data();
      const estado = String(data.estado || 'completada').toLowerCase();
      if (estado === 'anulado' || estado === 'anulada') {
        return; // Excluir compras anuladas
      }

      const pKey = getPeriodoKey(data.fecha || data.fecha_str || data.creado_at);
      if (pKey) {
        const p = getOrCreatePeriod(pKey);
        p.comprasActivas += 1;
        comprasActivas++;
      }
    });
    console.log(`  -> Compras analizadas: ${totalComprasAnalizadas} (activas válidas: ${comprasActivas})`);
  } catch (err) {
    console.warn(`  [AVISO] No se pudo leer la colección 'compras': ${err.message}`);
  }

  // 3. GASTOS: colección 'gastos'
  console.log('\n[3/4] Consultando gastos operativos activos...');
  try {
    const gastosSnap = await db.collection('gastos').get();
    let totalGastosAnalizados = 0;
    let gastosActivos = 0;

    gastosSnap.forEach((docSnap) => {
      totalGastosAnalizados++;
      const data = docSnap.data();
      const monto = Number(data.monto);
      if (isNaN(monto) || monto <= 0) {
        return; // Excluir gastos con importe no válido
      }

      const pKey = getPeriodoKey(data.fecha || data.fecha_str || data.creado_at);
      if (pKey) {
        const p = getOrCreatePeriod(pKey);
        p.gastosActivos += 1;
        gastosActivos++;
      }
    });
    console.log(`  -> Gastos analizados: ${totalGastosAnalizados} (activos válidos: ${gastosActivos})`);
  } catch (err) {
    console.warn(`  [AVISO] No se pudo leer la colección 'gastos': ${err.message}`);
  }

  // 4. PERIODOS EXISTENTES EN LA COLECCIÓN 'periodos_financieros'
  console.log('\n[4/4] Consultando documentos existentes en \'periodos_financieros\'...');
  const existingDocIds = new Set();
  try {
    const existingSnap = await db.collection('periodos_financieros').get();
    existingSnap.forEach((docSnap) => {
      existingDocIds.add(docSnap.id);
      // Asegurar que si un periodo existía pero ahora no tiene movimientos, se considere para ser actualizado a 0
      if (!periodsMap.has(docSnap.id)) {
        getOrCreatePeriod(docSnap.id);
      }
    });
    console.log(`  -> Documentos actuales en 'periodos_financieros': ${existingSnap.size}`);
  } catch (err) {
    console.warn(`  [AVISO] No se pudo leer la colección 'periodos_financieros': ${err.message}`);
  }

  // Ordenar periodos cronológicamente descendente
  const sortedPeriods = Array.from(periodsMap.values()).sort((a, b) => b.periodo.localeCompare(a.periodo));

  console.log('\n' + '-'.repeat(70));
  console.log('REPORTE DE PERIODOS RECONSTRUIDOS:');
  console.log('-'.repeat(70));
  console.log(
    'Periodo'.padEnd(10) +
    'Ventas'.padStart(10) +
    'Compras'.padStart(10) +
    'Gastos'.padStart(10) +
    'Total'.padStart(10) +
    '   Estado'
  );
  console.log('-'.repeat(70));

  let totalActivePeriods = 0;
  for (const p of sortedPeriods) {
    const total = p.ventasActivas + p.comprasActivas + p.gastosActivos;
    if (total > 0) totalActivePeriods++;
    const status = total > 0 ? 'Con registros' : 'Sin registros (0)';
    console.log(
      p.periodo.padEnd(10) +
      String(p.ventasActivas).padStart(10) +
      String(p.comprasActivas).padStart(10) +
      String(p.gastosActivos).padStart(10) +
      String(total).padStart(10) +
      `   ${status}`
    );
  }
  console.log('-'.repeat(70));
  console.log(`Total de periodos detectados con movimientos activos: ${totalActivePeriods}`);

  if (isDryRun) {
    console.log('\n' + '='.repeat(70));
    console.log(' [DRY RUN] Modo de simulación activo.');
    console.log(' NO se realizaron modificaciones ni escrituras en Firestore.');
    console.log(' Para aplicar estos cambios a la colección \'periodos_financieros\',');
    console.log(' ejecuta el siguiente comando:');
    console.log('   npm run migrate:financial-periods -- --apply');
    console.log('='.repeat(70) + '\n');
    return;
  }

  // Modo --apply: Escritura en lotes respetando el límite de 500 operaciones por lote
  console.log('\n[APPLY] Escribiendo índice en Firestore en lotes atómicos...');
  const BATCH_LIMIT = 400; // Margen de seguridad sobre el límite de 500
  let batch = db.batch();
  let opsCount = 0;
  let totalCommitted = 0;

  for (const p of sortedPeriods) {
    const total = p.ventasActivas + p.comprasActivas + p.gastosActivos;
    const docRef = db.collection('periodos_financieros').doc(p.periodo);

    // Si tiene 0 registros y ya existía, se actualiza a 0 o se puede eliminar
    // Siguiendo la convención: se actualizan los contadores reales para mantener el histórico
    const docData = {
      periodo: p.periodo,
      anio: p.anio,
      mes: p.mes,
      ventasActivas: p.ventasActivas,
      comprasActivas: p.comprasActivas,
      gastosActivos: p.gastosActivos,
      totalRegistrosActivos: total,
      actualizado_at: FieldValue.serverTimestamp()
    };

    batch.set(docRef, docData, { merge: true });
    opsCount++;

    if (opsCount >= BATCH_LIMIT) {
      await batch.commit();
      totalCommitted += opsCount;
      console.log(`  -> Lote confirmado: ${totalCommitted} documentos procesados.`);
      batch = db.batch();
      opsCount = 0;
    }
  }

  if (opsCount > 0) {
    await batch.commit();
    totalCommitted += opsCount;
    console.log(`  -> Lote final confirmado: ${totalCommitted} documentos en total.`);
  }

  console.log('\n' + '='.repeat(70));
  console.log(` [ÉXITO] Migración finalizada.`);
  console.log(` Se actualizaron ${totalCommitted} documentos en la colección 'periodos_financieros'.`);
  console.log('='.repeat(70) + '\n');
}

runMigration().catch((err) => {
  console.error('\n[ERROR FATAL DURANTE LA MIGRACIÓN]:', err);
  process.exit(1);
});
