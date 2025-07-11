import cron from 'node-cron';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { subMonths } from 'date-fns';
import fs from 'fs';
import firestore from './firebase.js';

// Imposta __filename e __dirname per i moduli 
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Costruiamo il percorso al file main.py
const mainPyPath = path.join(__dirname, '..', 'Archimedes2.0', 'main.py');

// Impostiamo il working directory in cui eseguire main.py (cartella Archimedes2.0)
const workingDir = path.join(__dirname, '..', 'Archimedes2.0');

// Definiamo il percorso per il file .env
const envFilePath = path.join(workingDir, '.env');

// Flag per evitare sovrapposizioni durante la pulizia
let isCleanupRunning = false;

// Creazione dinamica del file .env utilizzando il contenuto decodificato dal secret
if (process.env.ARCHIMEDES_ENV_B64) {
  const envContent = Buffer.from(process.env.ARCHIMEDES_ENV_B64, 'base64').toString('utf-8');
  fs.writeFileSync(envFilePath, envContent);
  console.log(`[CRON_MAIN] .env file created at ${envFilePath}`);
} else {
  console.warn('[CRON_MAIN] ARCHIMEDES_ENV_B64 is not defined!');
}

// Funzione ricorsiva che esegue main.py e si rischedula 5 minuti dopo la chiusura
function scheduleMain() {
  if (isCleanupRunning) {
    console.log('[CRON_MAIN] Skipping main.py execution: cleanup in progress');
    // riproviamo tra 5 minuti
    setTimeout(scheduleMain, 5 * 60 * 1000);
    return;
  }

  console.log('[CRON_MAIN] Starting main.py with 1 cycle');

  const pyProcess = spawn('python3', [mainPyPath, '--cycles', '1'], { cwd: workingDir });

  pyProcess.stdout.on('data', (data) => {
    console.log(`[CRON_MAIN] STDOUT: ${data}`);
  });

  pyProcess.stderr.on('data', (data) => {
    console.error(`[CRON_MAIN] STDERR: ${data}`);
  });

  pyProcess.on('close', (code) => {
    console.log(`[CRON_MAIN] main.py exited with code ${code}`);
    // Aggiornamenti post-run
    updateMUP()
      .then(() => updateAvgTiming())
      .catch(err => console.error('[CRON_MAIN] Error in post-run updates:', err))
      .finally(() => {
        // rischedula la prossima esecuzione tra 5 minuti
        setTimeout(scheduleMain, 5 * 60 * 1000);
      });
  });
}

// Avvia la prima schedulazione al boot
scheduleMain();

// Manteniamo la pulizia giornaliera alle 23:40
cron.schedule('40 23 * * *', () => {
  console.log('[CRON_MAIN] Starting firestore_deletion.py at 23:40');

  isCleanupRunning = true;

  const cleanupScriptPath = path.join(__dirname, '..', 'Archimedes2.0', 'firestore_deletion.py');

  const pyCleanupProcess = spawn('python3', [cleanupScriptPath], { cwd: workingDir });

  pyCleanupProcess.stdout.on('data', (data) => {
    console.log(`[CRON_MAIN - Cleanup] STDOUT: ${data}`);
  });

  pyCleanupProcess.stderr.on('data', (data) => {
    console.error(`[CRON_MAIN - Cleanup] STDERR: ${data}`);
  });

  pyCleanupProcess.on('close', (code) => {
    console.log(`[CRON_MAIN - Cleanup] firestore_deletion.py exited with code ${code}`);
    isCleanupRunning = false;
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

// Funzione per aggiornare avg_speed e avg_time in system_data
async function updateAvgTiming() {
  console.log('[CRON_MAIN] Starting avg timing update for systems with matching capacity_history records');
  try {
    const systemsSnapshot = await firestore.collection('system_data').get();
    for (const doc of systemsSnapshot.docs) {
      const system = doc.data();
      const hostid = system.hostid;
      const pool = system.pool;

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

      if (dates.length < 2) {
        continue;
      }

      const recentDates = dates.slice(-3);
      let totalDiffMinutes = 0;
      for (let i = 1; i < recentDates.length; i++) {
        totalDiffMinutes += (recentDates[i] - recentDates[i - 1]) / (1000 * 60);
      }

      const avgDiffMinutes = Number((totalDiffMinutes / (recentDates.length - 1)).toFixed(2));

      await firestore.collection('system_data').doc(doc.id).update({
        avg_speed: avgDiffMinutes,
        avg_time: avgDiffMinutes
      });
    }
    console.log('[CRON_MAIN] Avg timing update completed');
  } catch (error) {
    console.error('[CRON_MAIN] Error updating avg timing:', error);
  }
}
