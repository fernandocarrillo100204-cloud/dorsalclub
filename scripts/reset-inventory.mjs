import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const EXPECTED_PROJECT_ID = 'warehouse-96318';

const projectId = process.env.FIREBASE_PROJECT_ID;
const confirmReset = process.env.CONFIRM_INVENTORY_RESET;

if (!projectId || projectId !== EXPECTED_PROJECT_ID) {
  console.error(`[ERROR] Variable FIREBASE_PROJECT_ID inválida o no configurada. Se requiere exactamente: ${EXPECTED_PROJECT_ID}`);
  process.exit(1);
}

if (!confirmReset || confirmReset !== EXPECTED_PROJECT_ID) {
  console.error(`[ERROR] Variable CONFIRM_INVENTORY_RESET inválida o no configurada. Se requiere exactamente: ${EXPECTED_PROJECT_ID}`);
  process.exit(1);
}

const app = getApps().length === 0 
  ? initializeApp({ 
      credential: applicationDefault(),
      projectId 
    }) 
  : getApps()[0];
const db = getFirestore(app);

const TARGET_COLLECTIONS = [
  'productos',
  'stock',
  'movimientos',
  'resumen_ventas',
  'contadores',
  'migraciones'
];

async function deleteCollectionBatch(colName) {
  const collectionRef = db.collection(colName);
  let totalDeleted = 0;

  while (true) {
    const snapshot = await collectionRef.limit(400).get();
    if (snapshot.empty) {
      break;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    totalDeleted += snapshot.size;
    console.log(`Colección '${colName}': eliminados ${totalDeleted} documentos...`);
  }

  return totalDeleted;
}

async function verifyEmpty(colName) {
  const snapshot = await db.collection(colName).limit(1).get();
  return snapshot.empty;
}

async function main() {
  console.log(`=== INICIO DE RESET MANUAL DE INVENTARIO PARA PROYECTO: ${projectId} ===`);
  console.log('Colecciones objetivo a vaciar:', TARGET_COLLECTIONS.join(', '));
  console.log('Colecciones preservadas: almacenes, categorias, unidades, configuracion, usuarios.');

  for (const colName of TARGET_COLLECTIONS) {
    console.log(`\nProcesando eliminación en colección: ${colName}...`);
    const count = await deleteCollectionBatch(colName);
    console.log(`Total eliminados en '${colName}': ${count}`);
  }

  console.log('\n=== VERIFICANDO ESTADO DE COLECCIONES OBJETIVO ===');
  let allEmpty = true;
  for (const colName of TARGET_COLLECTIONS) {
    const isEmpty = await verifyEmpty(colName);
    if (!isEmpty) {
      console.error(`[ALERTA] La colección '${colName}' aún contiene documentos.`);
      allEmpty = false;
    } else {
      console.log(`✓ Colección '${colName}' verificada: 0 documentos.`);
    }
  }

  if (allEmpty) {
    console.log('\n✓ Reset de inventario completado y verificado con éxito.');
  } else {
    console.error('\n[ADVERTENCIA] Algunas colecciones no quedaron totalmente vacías.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error fatal durante la ejecución del reset:', err);
  process.exit(1);
});
