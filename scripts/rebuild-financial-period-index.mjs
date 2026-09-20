#!/usr/bin/env node

/**
 * Reconstrucción manual e idempotente del índice de periodos financieros.
 *
 * Este script consulta los registros contables históricos reales de Dorsalclub:
 * - Ventas activas (colección 'movimientos' con tipo == 'salida' y estado activo)
 * - Compras activas (colección 'compras' con estado no anulado)
 * - Gastos activos (colección 'gastos' con monto válido)
 *
 * y recalcula la colección liviana 'periodos_financieros' respetando los límites de Firestore.
 *
 * Proyecto autorizado exclusivo: jersey-c6811
 *
 * Modos de ejecución:
 * - Modo seguro por defecto (--dry-run):
 *   npm run migrate:financial-periods -- --project=jersey-c6811 --dry-run
 *   (Analiza en páginas de 400 docs y muestra el reporte por consola sin realizar escrituras)
 *
 * - Modo de aplicación (--apply):
 *   npm run migrate:financial-periods -- --project=jersey-c6811 --apply --confirm-project=jersey-c6811
 *   (Valida lecturas previas completas y aplica escrituras en lotes atómicos de máx 400 ops)
 */

import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue, FieldPath } from 'firebase-admin/firestore';

const TARGET_PROJECT_ID = 'jersey-c6811';

// ============================================================================
// 1. VALIDACIÓN ESTRICTA DE ARGUMENTOS Y PROYECTO FIREBASE
// ============================================================================

function parseAndValidateArguments(argv) {
  let hasApply = false;
  let hasDryRun = false;
  const projectArgs = [];
  const confirmArgs = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--apply') {
      hasApply = true;
    } else if (arg === '--dry-run') {
      hasDryRun = true;
    } else if (arg.startsWith('--project=')) {
      const val = arg.slice('--project='.length).trim();
      projectArgs.push(val);
    } else if (arg === '--project') {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        projectArgs.push(next.trim());
        i++;
      } else {
        projectArgs.push('');
      }
    } else if (arg.startsWith('--confirm-project=')) {
      const val = arg.slice('--confirm-project='.length).trim();
      confirmArgs.push(val);
    } else if (arg === '--confirm-project') {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        confirmArgs.push(next.trim());
        i++;
      } else {
        confirmArgs.push('');
      }
    }
  }

  // 1.1 Rechazar argumentos contradictorios de modo
  if (hasApply && hasDryRun) {
    console.error('\n[ERROR FATAL] Argumentos contradictorios: No se pueden especificar simultáneamente --dry-run y --apply.');
    console.error('Elige únicamente un modo de ejecución. Operación cancelada sin lecturas ni escrituras.\n');
    process.exit(1);
  }

  const mode = hasApply ? 'apply' : 'dry-run';

  // 1.2 Validar consistencia de argumentos de proyecto
  if (projectArgs.length > 1) {
    const unique = Array.from(new Set(projectArgs));
    if (unique.length > 1) {
      console.error('\n[ERROR FATAL] Argumentos contradictorios: Se proporcionaron múltiples valores distintos para --project.');
      console.error('Operación cancelada sin lecturas ni escrituras.\n');
      process.exit(1);
    }
  }

  const cliProject = projectArgs.length > 0 ? projectArgs[0] : null;
  const envProject = process.env.FIREBASE_PROJECT_ID ? process.env.FIREBASE_PROJECT_ID.trim() : null;

  // Si se proporcionan tanto CLI como variable de entorno y no coinciden, cancelar
  if (cliProject !== null && envProject !== null && cliProject !== envProject) {
    console.error(`\n[ERROR FATAL] Argumentos contradictorios: El argumento --project (${cliProject}) no coincide con FIREBASE_PROJECT_ID (${envProject}).`);
    console.error('Operación cancelada sin lecturas ni escrituras.\n');
    process.exit(1);
  }

  const resolvedProject = cliProject || envProject;

  // 1.3 Rechazar si falta el proyecto o está vacío
  if (!resolvedProject || resolvedProject === '') {
    console.error('\n[ERROR FATAL] No se proporcionó el proyecto de Firebase.');
    console.error('Este script no tiene ningún proyecto predeterminado silencioso.');
    console.error(`Debes indicar explícitamente: --project=${TARGET_PROJECT_ID}`);
    console.error('Operación cancelada sin lecturas ni escrituras.\n');
    process.exit(1);
  }

  // 1.4 Rechazar cualquier proyecto que no sea exactamente el autorizado
  if (resolvedProject !== TARGET_PROJECT_ID) {
    console.error(`\n[ERROR FATAL] Proyecto no autorizado o inválido: "${resolvedProject}".`);
    console.error(`Este script únicamente tiene autorización para ejecutarse sobre el proyecto "${TARGET_PROJECT_ID}".`);
    console.error('Operación cancelada sin lecturas ni escrituras.\n');
    process.exit(1);
  }

  // 1.5 Si el modo es --apply, exigir confirmación estricta
  if (mode === 'apply') {
    if (confirmArgs.length === 0) {
      console.error('\n[ERROR FATAL] Confirmación de proyecto requerida para escrituras (--apply).');
      console.error(`Para aplicar cambios debes incluir explícitamente: --confirm-project=${TARGET_PROJECT_ID}`);
      console.error(`Comando completo requerido:`);
      console.error(`  npm run migrate:financial-periods -- --project=${TARGET_PROJECT_ID} --apply --confirm-project=${TARGET_PROJECT_ID}`);
      console.error('Operación cancelada sin lecturas ni escrituras.\n');
      process.exit(1);
    }

    if (confirmArgs.length > 1) {
      const uniqueConfirms = Array.from(new Set(confirmArgs));
      if (uniqueConfirms.length > 1) {
        console.error('\n[ERROR FATAL] Argumentos contradictorios: Se proporcionaron múltiples valores distintos para --confirm-project.');
        console.error('Operación cancelada sin lecturas ni escrituras.\n');
        process.exit(1);
      }
    }

    const confirmProject = confirmArgs[0];
    if (!confirmProject || confirmProject !== TARGET_PROJECT_ID) {
      console.error(`\n[ERROR FATAL] La confirmación del proyecto ("${confirmProject}") no coincide exactamente con "${TARGET_PROJECT_ID}".`);
      console.error('Operación cancelada sin lecturas ni escrituras.\n');
      process.exit(1);
    }
  }

  return { project: resolvedProject, mode };
}

const { project, mode } = parseAndValidateArguments(process.argv.slice(2));
const isApply = mode === 'apply';
const isDryRun = mode === 'dry-run';

console.log('='.repeat(70));
console.log('   MIGRACIÓN HISTÓRICA: ÍNDICE DE PERIODOS FINANCIEROS');
console.log('='.repeat(70));
console.log(`Proyecto Firestore : ${project}`);
console.log(`Modo de ejecución  : ${isApply ? 'APPLY (Escritura en base de datos)' : 'DRY RUN (Simulación segura de solo lectura)'}`);
console.log('='.repeat(70));

// ============================================================================
// 2. INICIALIZACIÓN Y VALIDACIÓN REAL DE CREDENCIALES
// ============================================================================

let app;
try {
  app = getApps().length === 0
    ? initializeApp({
        credential: applicationDefault(),
        projectId: project
      })
    : getApps()[0];
} catch (initErr) {
  console.error('\n' + '='.repeat(70));
  console.error(' [ERROR DE INICIALIZACIÓN]');
  console.error(` No fue posible acceder al proyecto ${project} con las credenciales configuradas. No se realizó ninguna escritura.`);
  console.error('='.repeat(70) + '\n');
  process.exit(1);
}

const db = getFirestore(app);

// Comprobación real de conectividad y credenciales mediante lectura mínima (1 documento)
try {
  await db.collection('periodos_financieros').limit(1).get();
} catch (authErr) {
  console.error('\n' + '='.repeat(70));
  console.error(' [ERROR DE CREDENCIALES O CONECTIVIDAD]');
  console.error(` No fue posible acceder al proyecto ${project} con las credenciales configuradas. No se realizó ninguna escritura.`);
  console.error('='.repeat(70) + '\n');
  process.exit(1);
}

// ============================================================================
// 3. UTILIDADES DE PAGINACIÓN Y NORMALIZACIÓN DE FECHAS
// ============================================================================

/**
 * Consulta paginada en Firestore en bloques de máximo 400 documentos.
 * Garantiza un orden estable utilizando FieldPath.documentId(), limit() y startAfter().
 * Procesa cada documento página a página liberando la memoria de documentos anteriores.
 * Si cualquier página falla, lanza un error para abortar inmediatamente la migración.
 *
 * @param {import('firebase-admin/firestore').Query} baseQuery
 * @param {(doc: import('firebase-admin/firestore').QueryDocumentSnapshot) => void | Promise<void>} processDocument
 * @param {number} pageSize
 * @returns {Promise<number>} Total de documentos procesados
 */
async function readQueryInPages(baseQuery, processDocument, pageSize = 400) {
  const effectivePageSize = Math.min(Math.max(1, pageSize || 400), 400);
  const query = baseQuery.orderBy(FieldPath.documentId()).limit(effectivePageSize);
  let lastDoc = null;
  let totalRead = 0;

  while (true) {
    let currentQuery = query;
    if (lastDoc) {
      currentQuery = query.startAfter(lastDoc);
    }

    const snapshot = await currentQuery.get();
    if (snapshot.empty) {
      break;
    }

    for (const doc of snapshot.docs) {
      totalRead++;
      await processDocument(doc);
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];

    if (snapshot.size < effectivePageSize) {
      break;
    }
  }

  return totalRead;
}

/**
 * Normaliza y valida estrictamente cualquier formato de fecha a { periodo, anio, mes }.
 * Retorna null si la fecha no es válida o está fuera del rango 2000-2100.
 */
function parseAndValidatePeriod(rawDate) {
  if (!rawDate) return null;

  let d = null;
  if (typeof rawDate.toDate === 'function') {
    try {
      d = rawDate.toDate();
    } catch {
      return null;
    }
  } else if (rawDate._seconds !== undefined && typeof rawDate._seconds === 'number') {
    d = new Date(rawDate._seconds * 1000);
  } else if (rawDate.seconds !== undefined && typeof rawDate.seconds === 'number') {
    d = new Date(rawDate.seconds * 1000);
  } else if (rawDate instanceof Date) {
    d = rawDate;
  } else if (typeof rawDate === 'number') {
    d = new Date(rawDate);
  } else if (typeof rawDate === 'string') {
    const trimmed = rawDate.trim();
    const match = trimmed.match(/^(\d{4})-(\d{2})/);
    if (match) {
      const y = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12) {
        return {
          periodo: `${y}-${String(m).padStart(2, '0')}`,
          anio: y,
          mes: m
        };
      }
    }
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      d = parsed;
    }
  }

  if (!d || isNaN(d.getTime())) return null;

  const y = d.getFullYear();
  const m = d.getMonth() + 1;

  if (y < 2000 || y > 2100 || m < 1 || m > 12) {
    return null;
  }

  return {
    periodo: `${y}-${String(m).padStart(2, '0')}`,
    anio: y,
    mes: m
  };
}

// ============================================================================
// 4. EJECUCIÓN DE LA MIGRACIÓN PAGINADA
// ============================================================================

async function runMigration() {
  const periodsMap = new Map();
  const ignoredDocuments = [];

  function getOrCreatePeriod(periodKey, anio, mes) {
    if (!periodsMap.has(periodKey)) {
      periodsMap.set(periodKey, {
        periodo: periodKey,
        anio,
        mes,
        ventasActivas: 0,
        comprasActivas: 0,
        gastosActivos: 0
      });
    }
    return periodsMap.get(periodKey);
  }

  // --------------------------------------------------------------------------
  // 4.1 VENTAS: colección 'movimientos' con tipo == 'salida'
  // --------------------------------------------------------------------------
  console.log('\n[1/4] Consultando movimientos de venta activos (paginación máx 400)...');
  let totalMovimientosLeidos = 0;
  let ventasActivasContadas = 0;

  try {
    const baseMovsQuery = db.collection('movimientos').where('tipo', '==', 'salida');
    totalMovimientosLeidos = await readQueryInPages(baseMovsQuery, (docSnap) => {
      const data = docSnap.data();
      const estado = String(data.estado || 'activo').toLowerCase();
      if (estado === 'anulado' || estado === 'anulada') {
        return; // Excluir movimientos de inventario anulados
      }

      const parsed = parseAndValidatePeriod(data.fecha || data.creado_at);
      if (!parsed) {
        ignoredDocuments.push({ coleccion: 'movimientos', id: docSnap.id });
        return;
      }

      const p = getOrCreatePeriod(parsed.periodo, parsed.anio, parsed.mes);
      p.ventasActivas += 1;
      ventasActivasContadas++;
    }, 400);

    console.log(`  -> Salidas de inventario analizadas: ${totalMovimientosLeidos} (activas válidas: ${ventasActivasContadas})`);
  } catch (err) {
    console.error('\n' + '='.repeat(70));
    console.error(' [ERROR FATAL DE LECTURA: movimientos]');
    console.error(` Falló la lectura de la colección 'movimientos': ${err.message}`);
    console.error(' Se cancela toda la migración. No se preparó ni realizó ninguna escritura.');
    console.error('='.repeat(70) + '\n');
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // 4.2 COMPRAS: colección 'compras'
  // --------------------------------------------------------------------------
  console.log('\n[2/4] Consultando compras activas (paginación máx 400)...');
  let totalComprasLeidas = 0;
  let comprasActivasContadas = 0;

  try {
    const baseComprasQuery = db.collection('compras');
    totalComprasLeidas = await readQueryInPages(baseComprasQuery, (docSnap) => {
      const data = docSnap.data();
      const estado = String(data.estado || 'completada').toLowerCase();
      if (estado === 'anulado' || estado === 'anulada') {
        return; // Excluir compras anuladas
      }

      const parsed = parseAndValidatePeriod(data.fecha || data.fecha_str || data.creado_at);
      if (!parsed) {
        ignoredDocuments.push({ coleccion: 'compras', id: docSnap.id });
        return;
      }

      const p = getOrCreatePeriod(parsed.periodo, parsed.anio, parsed.mes);
      p.comprasActivas += 1;
      comprasActivasContadas++;
    }, 400);

    console.log(`  -> Compras analizadas: ${totalComprasLeidas} (activas válidas: ${comprasActivasContadas})`);
  } catch (err) {
    console.error('\n' + '='.repeat(70));
    console.error(' [ERROR FATAL DE LECTURA: compras]');
    console.error(` Falló la lectura de la colección 'compras': ${err.message}`);
    console.error(' Se cancela toda la migración. No se preparó ni realizó ninguna escritura.');
    console.error('='.repeat(70) + '\n');
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // 4.3 GASTOS: colección 'gastos'
  // --------------------------------------------------------------------------
  console.log('\n[3/4] Consultando gastos operativos activos (paginación máx 400)...');
  let totalGastosLeidos = 0;
  let gastosActivosContados = 0;

  try {
    const baseGastosQuery = db.collection('gastos');
    totalGastosLeidos = await readQueryInPages(baseGastosQuery, (docSnap) => {
      const data = docSnap.data();
      const monto = Number(data.monto);
      if (isNaN(monto) || monto <= 0) {
        return; // Excluir gastos sin importe válido
      }

      const parsed = parseAndValidatePeriod(data.fecha || data.fecha_str || data.creado_at);
      if (!parsed) {
        ignoredDocuments.push({ coleccion: 'gastos', id: docSnap.id });
        return;
      }

      const p = getOrCreatePeriod(parsed.periodo, parsed.anio, parsed.mes);
      p.gastosActivos += 1;
      gastosActivosContados++;
    }, 400);

    console.log(`  -> Gastos analizados: ${totalGastosLeidos} (activos válidos: ${gastosActivosContados})`);
  } catch (err) {
    console.error('\n' + '='.repeat(70));
    console.error(' [ERROR FATAL DE LECTURA: gastos]');
    console.error(` Falló la lectura de la colección 'gastos': ${err.message}`);
    console.error(' Se cancela toda la migración. No se preparó ni realizó ninguna escritura.');
    console.error('='.repeat(70) + '\n');
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // 4.4 PERIODOS EXISTENTES EN 'periodos_financieros'
  // --------------------------------------------------------------------------
  console.log('\n[4/4] Consultando documentos existentes en "periodos_financieros" (paginación máx 400)...');
  let totalPeriodosExistentes = 0;

  try {
    const basePeriodosQuery = db.collection('periodos_financieros');
    totalPeriodosExistentes = await readQueryInPages(basePeriodosQuery, (docSnap) => {
      const id = docSnap.id;
      if (!periodsMap.has(id)) {
        const match = id.match(/^(\d{4})-(\d{2})$/);
        if (match) {
          const y = parseInt(match[1], 10);
          const m = parseInt(match[2], 10);
          if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12) {
            getOrCreatePeriod(id, y, m);
          }
        }
      }
    }, 400);

    console.log(`  -> Documentos actuales en 'periodos_financieros': ${totalPeriodosExistentes}`);
  } catch (err) {
    console.error('\n' + '='.repeat(70));
    console.error(' [ERROR FATAL DE LECTURA: periodos_financieros]');
    console.error(` Falló la lectura de la colección 'periodos_financieros': ${err.message}`);
    console.error(' Se cancela toda la migración. No se preparó ni realizó ninguna escritura.');
    console.error('='.repeat(70) + '\n');
    process.exit(1);
  }

  // Ordenar periodos cronológicamente descendente
  const sortedPeriods = Array.from(periodsMap.values()).sort((a, b) => b.periodo.localeCompare(a.periodo));

  // --------------------------------------------------------------------------
  // 5. REPORTE DETALLADO DE AUDITORÍA
  // --------------------------------------------------------------------------
  console.log('\n' + '-'.repeat(70));
  console.log('REPORTE DE PERIODOS FINANCIEROS AUDITADOS:');
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

  if (ignoredDocuments.length > 0) {
    console.log(`\nDocumentos ignorados por fecha inválida: ${ignoredDocuments.length}`);
    for (const item of ignoredDocuments) {
      console.log(`  - Colección: ${item.coleccion}, ID: ${item.id}`);
    }
  } else {
    console.log(`Documentos ignorados por fecha inválida: 0`);
  }

  // --------------------------------------------------------------------------
  // 6. MODO --dry-run (SALIDA SEGURA SIN ESCRITURAS)
  // --------------------------------------------------------------------------
  if (isDryRun) {
    console.log('\n' + '='.repeat(70));
    console.log(' [DRY RUN] Modo de simulación seguro activo.');
    console.log(` Proyecto auditado: ${project}`);
    console.log(' NO se realizaron modificaciones ni escrituras en Firestore.');
    console.log(' Para aplicar estos cambios a la colección "periodos_financieros", ejecuta:');
    console.log(`   npm run migrate:financial-periods -- --project=${project} --apply --confirm-project=${project}`);
    console.log('='.repeat(70) + '\n');
    return;
  }

  // --------------------------------------------------------------------------
  // 7. MODO --apply (ESCRITURA EN LOTES DE MÁXIMO 400 OPERACIONES)
  // --------------------------------------------------------------------------
  console.log('\n[APPLY] Escribiendo índice en Firestore en lotes atómicos (máx 400 ops)...');
  const BATCH_LIMIT = 400;
  let batch = db.batch();
  let opsCount = 0;
  let batchesCommitted = 0;
  let totalDocsCommitted = 0;

  try {
    for (const p of sortedPeriods) {
      // Validación estricta de estructura antes de escribir
      if (!/^\d{4}-\d{2}$/.test(p.periodo)) {
        throw new Error(`Periodo inválido detectado: "${p.periodo}"`);
      }
      if (!Number.isInteger(p.anio) || p.anio < 2000 || p.anio > 2100) {
        throw new Error(`Año inválido en periodo ${p.periodo}: ${p.anio}`);
      }
      if (!Number.isInteger(p.mes) || p.mes < 1 || p.mes > 12) {
        throw new Error(`Mes inválido en periodo ${p.periodo}: ${p.mes}`);
      }
      if (!Number.isInteger(p.ventasActivas) || p.ventasActivas < 0) {
        throw new Error(`Contador ventasActivas no entero o negativo en periodo ${p.periodo}`);
      }
      if (!Number.isInteger(p.comprasActivas) || p.comprasActivas < 0) {
        throw new Error(`Contador comprasActivas no entero o negativo en periodo ${p.periodo}`);
      }
      if (!Number.isInteger(p.gastosActivos) || p.gastosActivos < 0) {
        throw new Error(`Contador gastosActivos no entero o negativo en periodo ${p.periodo}`);
      }

      const total = p.ventasActivas + p.comprasActivas + p.gastosActivos;
      const docRef = db.collection('periodos_financieros').doc(p.periodo);

      const docData = {
        periodo: p.periodo,
        anio: p.anio,
        mes: p.mes,
        ventasActivas: p.ventasActivas,
        comprasActivas: p.comprasActivas,
        gastosActivos: p.gastosActivos,
        totalRegistrosActivos: total,
        actualizadoEn: FieldValue.serverTimestamp()
      };

      batch.set(docRef, docData, { merge: true });
      opsCount++;

      if (opsCount >= BATCH_LIMIT) {
        await batch.commit();
        batchesCommitted++;
        totalDocsCommitted += opsCount;
        console.log(`  -> Lote ${batchesCommitted} confirmado (${opsCount} docs, acumulado: ${totalDocsCommitted}).`);
        batch = db.batch();
        opsCount = 0;
      }
    }

    if (opsCount > 0) {
      await batch.commit();
      batchesCommitted++;
      totalDocsCommitted += opsCount;
      console.log(`  -> Lote final ${batchesCommitted} confirmado (${opsCount} docs, acumulado: ${totalDocsCommitted}).`);
    }

    console.log('\n' + '='.repeat(70));
    console.log(` [ÉXITO] Migración completada exitosamente.`);
    console.log(` Se actualizaron ${totalDocsCommitted} documentos en ${batchesCommitted} lotes en 'periodos_financieros'.`);
    console.log('='.repeat(70) + '\n');
  } catch (writeErr) {
    console.error('\n' + '='.repeat(70));
    console.error(' [ERROR FATAL DURANTE LA ESCRITURA]');
    console.error(` Ocurrió un fallo al escribir el lote en Firestore: ${writeErr.message}`);
    console.error(` Lotes confirmados antes del fallo: ${batchesCommitted} (${totalDocsCommitted} documentos).`);
    console.error(' NOTA: El script es completamente idempotente; puedes volver a ejecutarlo de forma segura.');
    console.error('='.repeat(70) + '\n');
    process.exit(1);
  }
}

runMigration().catch((err) => {
  console.error('\n' + '='.repeat(70));
  console.error(' [ERROR FATAL INESPERADO]:', err.message);
  console.error(' Operación cancelada.');
  console.error('='.repeat(70) + '\n');
  process.exit(1);
});
