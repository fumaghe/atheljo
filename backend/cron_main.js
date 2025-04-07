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
  // Decodifica il contenuto Base64 per ottenere le newline originali
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
    // Dopo la terminazione di main.py, eseguiamo la funzione di aggiornamento MUP
    updateMUP();
  });
});

// Funzione per aggiornare MUP per tutti i sistemi
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
