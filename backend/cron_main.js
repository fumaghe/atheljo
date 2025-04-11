import cron from 'node-cron';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { subMonths } from 'date-fns';
import fs from 'fs';
import firestore from './firebase.js';

// Imposta __filename e __dirname per i moduli ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Costruiamo il percorso al file main.py
const mainPyPath = path.join(__dirname, '..', 'Archimedes2.0', 'main.py');

// Impostiamo il working directory in cui eseguire main.py (cartella Archimedes2.0)
const workingDir = path.join(__dirname, '..', 'Archimedes2.0');

// Definiamo il percorso per il file .env
const envFilePath = path.join(workingDir, '.env');

// Creazione dinamica del file .env utilizzando il contenuto decodificato dal secret
if (process.env.ARCHIMEDES_ENV_B64) {
  // Decodifica il contenuto Base64 per ottenere il file originale
  const envContent = Buffer.from(process.env.ARCHIMEDES_ENV_B64, 'base64').toString('utf-8');
  fs.writeFileSync(envFilePath, envContent);
  console.log(`[CRON_MAIN] .env file created at ${envFilePath}`);
} else {
  console.warn('[CRON_MAIN] ARCHIMEDES_ENV_B64 is not defined!');
}

// Pianifica l'esecuzione periodica di main.py ogni 3 minuti
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
    updateMUP().then(() => {
      updateAvgTiming();
    });
  });
});

// Pianifica l'esecuzione di firestore_capacity_trends_cleanup.py ogni giorno alle 1:00 AM
cron.schedule('26 20 * * *', () => {
  console.log('[CRON_MAIN] Starting firestore_capacity_trends_cleanup.py at 1:00 AM');
  
  // Imposta il percorso al file firestore_capacity_trends_cleanup.py
  const cleanupScriptPath = path.join(__dirname, '..', 'Archimedes2.0', 'firestore_capacity_trends_cleanup.py');

  const pyCleanupProcess = spawn('python3', [cleanupScriptPath], { cwd: workingDir });
  
  pyCleanupProcess.stdout.on('data', (data) => {
    console.log(`[CRON_MAIN - Cleanup] STDOUT: ${data}`);
  });
  
  pyCleanupProcess.stderr.on('data', (data) => {
    console.error(`[CRON_MAIN - Cleanup] STDERR: ${data}`);
  });
  
  pyCleanupProcess.on('close', (code) => {
    console.log(`[CRON_MAIN - Cleanup] firestore_capacity_trends_cleanup.py exited with code ${code}`);
  });
});

// Funzione per aggiornare MUP per tutti i sistemi
async function updateMUP() {
  console.log('[CRON_MAIN] Starting MUP update for all systems');
  try {
    const systemsSnapshot = await firestore.collection('system_data').get();

    for (const doc of systemsSnapshot.docs) {
      const system = doc.data();
      const hostid = system.hostid;
      const oneMonthAgo = subMonths(new Date(), 1);
      const cutoffDateString = oneMonthAgo.toISOString();

      const capacityQuery = await firestore
        .collection('capacity_trends')
        .where('hostid', '==', hostid)
        .where('date', '>=', cutoffDateString)
        .get();

      let maxUsedGB = 0;
      capacityQuery.forEach(recordDoc => {
        const record = recordDoc.data();
        if (record.used && record.used > maxUsedGB) {
          maxUsedGB = record.used;
        }
      });
      const maxUsedTB = Number((maxUsedGB / 1024).toFixed(2));

      await firestore.collection('system_data').doc(doc.id).update({ MUP: maxUsedTB });
    }
    console.log('[CRON_MAIN] MUP update completed');
  } catch (error) {
    console.error('[CRON_MAIN] Error during MUP update:', error);
  }
}

// Nuova funzione per aggiornare avg_speed e avg_time in system_data
async function updateAvgTiming() {
  console.log('[CRON_MAIN] Starting avg timing update for systems with matching capacity_history records');
  try {
    // Recupera tutti i documenti dalla collection system_data
    const systemsSnapshot = await firestore.collection('system_data').get();
    for (const doc of systemsSnapshot.docs) {
      const system = doc.data();
      const hostid = system.hostid;
      const pool = system.pool;
      
      // Interroga capacity_history per ottenere i documenti associati a hostid e pool, ordinati per data
      const historyQuerySnapshot = await firestore
        .collection('capacity_history')
        .where('hostid', '==', hostid)
        .where('pool', '==', pool)
        .orderBy('date')
        .get();
      
      const dates = [];
      historyQuerySnapshot.forEach(recordDoc => {
        const record = recordDoc.data();
        dates.push(new Date(record.date));
      });
      
      // Se non sono presenti almeno due record, saltiamo questo sistema
      if (dates.length < 2) {
        console.log(`[CRON_MAIN] Skipping ${doc.id} as less than two capacity_history records found`);
        continue;
      }
      
      // Calcola la somma delle differenze (in minuti) tra telemetrie consecutive
      let totalDiffMinutes = 0;
      for (let i = 1; i < dates.length; i++) {
        totalDiffMinutes += (dates[i] - dates[i - 1]) / (1000 * 60);
      }
      
      // Calcola la media delle differenze
      const avgDiffMinutes = Number((totalDiffMinutes / (dates.length - 1)).toFixed(2));
      
      // Aggiorna il documento in system_data con avg_speed e avg_time
      await firestore.collection('system_data').doc(doc.id).update({
        avg_speed: avgDiffMinutes,
        avg_time: avgDiffMinutes
      });
      
      console.log(`[CRON_MAIN] Updated ${doc.id} with avg_speed and avg_time = ${avgDiffMinutes}`);
    }
    console.log('[CRON_MAIN] Avg timing update completed');
  } catch (error) {
    console.error('[CRON_MAIN] Error updating avg timing:', error);
  }
}
