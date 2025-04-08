import cron from 'node-cron';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { subMonths } from 'date-fns';
import fs from 'fs';
import firestore from './firebase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mainPyPath = path.join(__dirname, '..', 'Archimedes2.0', 'main.py');
const workingDir = path.join(__dirname, '..', 'Archimedes2.0');
const envFilePath = path.join(workingDir, '.env');

// Dynamically create the .env file if the secret is present
if (process.env.ARCHIMEDES_ENV_B64) {
  const envContent = Buffer.from(process.env.ARCHIMEDES_ENV_B64, 'base64').toString('utf-8');
  fs.writeFileSync(envFilePath, envContent);
}

cron.schedule('*/3 * * * *', () => {
  console.log('Starting main.py');
  const pyProcess = spawn('python3', [mainPyPath, '--cycles', '1'], { cwd: workingDir });
  
  pyProcess.on('close', (code) => {
    console.log(`main.py finished with code ${code}`);
    updateMUP();
  });
});

async function updateMUP() {
  console.log('Starting MUP update');
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
    console.log('MUP update completed');
  } catch (error) {
    console.error('Error during MUP update:', error);
  }
}
