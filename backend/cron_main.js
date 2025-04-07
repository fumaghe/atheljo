// backend/cron_main.js
import cron from 'node-cron';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { subMonths } from 'date-fns';
import fs from 'fs';
import firestore from './firebase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Costruiamo il percorso al file main.py
const mainPyPath = path.join(__dirname, '..', 'Archimedes2.0', 'main.py');

// Impostiamo il working directory in cui eseguire main.py (cioè la cartella Archimedes2.0)
const workingDir = path.join(__dirname, '..', 'Archimedes2.0');

// Creazione dinamica del file .env utilizzando il contenuto salvato nel secret (ARCHIMEDES_ENV_SECRET)
const envFilePath = path.join(workingDir, '.env');
if (process.env.ARCHIMEDES_ENV) {
  fs.writeFileSync(envFilePath, process.env.ARCHIMEDES_ENV);
  console.log(`[CRON_MAIN] .env file created at ${envFilePath}`);
} else {
  console.warn('[CRON_MAIN] ARCHIMEDES_ENV is not defined!');
}

async function updateMUP() {
  console.log('[CRON_MAIN] Starting MUP update for all systems');
  try {
    // Recupera tutti i documenti dalla collezione system_data
    const systemsSnapshot = await firestore.collection('system_data').get();

    // Per ogni documento (sistema)
    for (const doc of systemsSnapshot.docs) {
      const system = doc.data();
      const hostid = system.hostid;

      // Definisce la data di cutoff: 30 giorni fa
      const oneMonthAgo = subMonths(new Date(), 1);
      const cutoffDateString = oneMonthAgo.toISOString();

      // Recupera tutti i record di capacity_trends per questo host con date >= cutoffDate
      const capacityQuery = await firestore
        .collection('capacity_trends')
        .where('hostid', '==', hostid)
        .where('date', '>=', cutoffDateString)
        .get();

      // Calcola il valore massimo di 'used' (in GB) negli ultimi 30 giorni
      let maxUsedGB = 0;
      capacityQuery.forEach(recordDoc => {
        const record = recordDoc.data();
        if (record.used && record.used > maxUsedGB) {
          maxUsedGB = record.used;
        }
      });
      // Converte il valore da GB a TB
      const maxUsedTB = Number((maxUsedGB / 1024).toFixed(2));

      // Aggiorna il campo MUP nel documento corrente di system_data
      await firestore.collection('system_data').doc(doc.id).update({ MUP: maxUsedTB });
    }
    console.log('[CRON_MAIN] MUP update completed');
  } catch (error) {
    console.error('[CRON_MAIN] Error during MUP update:', error);
  }
}

cron.schedule('*/3 * * * *', () => {
  console.log('[CRON_MAIN] Starting main.py with 1 cycle');
  
  // Avvia main.py con il parametro --cycles 1, impostando il working directory
  const pyProcess = spawn('python3', [mainPyPath, '--cycles', '1'], { cwd: workingDir });

  pyProcess.stdout.on('data', (data) => {
    console.log(`[CRON_MAIN] STDOUT: ${data}`);
  });

  pyProcess.stderr.on('data', (data) => {
    console.error(`[CRON_MAIN] STDERR: ${data}`);
  });

  pyProcess.on('close', (code) => {
    console.log(`[CRON_MAIN] main.py exited with code ${code}`);
    // Dopo la terminazione di main.py, eseguiamo la funzione di aggiornamento MUP
    updateMUP();
  });
});
