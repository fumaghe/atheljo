// backend/cron.js
import cron from 'node-cron';
import { subMonths } from 'date-fns';
import firestore from './firebase.js';
import { parseCSVFile } from './utils/csvParser.js';
import { getEnhancedSystemHealthScore, computeAggregatedStats } from './utils/healthCalculator.js';
import { generateExcelBuffer } from './utils/reportGenerator.js';
import { generatePDFReportForAPI } from './utils/pdfGenerator.js';
import nodemailer from 'nodemailer';

const SYSTEMS_CSV_PATH = 'data/systems_data.csv';

function getNextRun(now, frequency, customInterval) {
  switch (frequency) {
    case 'hourly':
      return new Date(now.getTime() + 60 * 60 * 1000);
    case 'daily':
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case 'weekly':
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case 'monthly':
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    case 'custom':
      if (customInterval && customInterval <= 24) {
        return new Date(now.getTime() + customInterval * 60 * 60 * 1000);
      } else if (customInterval) {
        return new Date(now.getTime() + customInterval * 24 * 60 * 60 * 1000);
      }
      return null;
    default:
      return null;
  }
}

// Il job per l'aggiornamento del MUP è stato rimosso: ora viene eseguito in cron_main.js

// Cron job per i report schedulati (ogni 40 minuti)
cron.schedule('*/40 * * * *', async () => {
  console.log('[CRON] Checking scheduled reports');

  // --- Verifica ed aggiornamento abbonamenti scaduti ---
  try {
    console.log('[CRON] Checking subscription expirations...');
    const now = new Date();
    // Query: utenti con subscriptionExpires esistente e ≤ now
    const usersSnapshot = await firestore
      .collection('users')
      .where('subscriptionExpires', '<=', now)
      .get();
    usersSnapshot.forEach(async (doc) => {
      const user = doc.data();
      if (user.subscription !== 'None') {
        await firestore.collection('Users').doc(doc.id).update({ subscription: 'None' });
        console.log(`[CRON] Updated user ${doc.id} subscription to "None" due to expiration.`);
      }
    });
  } catch (err) {
    console.error('[CRON] Error checking subscription expirations:', err);
  }
  // ----------------------------------------------------

  try {
    const now = new Date();
    // Recupera tutti i report schedulati con nextRunAt ≤ now
    const schedSnapshot = await firestore
      .collection('ScheduledReports')
      .where('nextRunAt', '<=', now)
      .get();

    for (const schedDoc of schedSnapshot.docs) {
      const sched = { id: schedDoc.id, ...schedDoc.data() };
      console.log(`[CRON] Generating scheduled report for scheduleId=${sched.id}`);

      // Legge i dati aggiornati dal CSV
      const systemsData = await parseCSVFile(SYSTEMS_CSV_PATH);

      let healthData = null;
      let aggregatedStatsData = null;
      if (sched.host === 'all') {
        aggregatedStatsData = computeAggregatedStats(systemsData);
      } else {
        const system = systemsData.find(s => s.hostid === sched.host);
        if (system) {
          healthData = getEnhancedSystemHealthScore(system);
        }
      }

      let fileBuffer;
      let fileName;
      let mimeType;

      if (sched.format === 'pdf') {
        const options = {
          host: sched.host,
          logoDataUrl: null,
          company: sched.company,
          systemName: sched.host,
          aggregatedStats: sched.host === 'all' ? aggregatedStatsData : null,
          health: sched.host === 'all' ? null : healthData,
          forecast: []
        };
        const pdfDataUri = generatePDFReportForAPI(options);
        fileBuffer = Buffer.from(pdfDataUri.split('base64,')[1], 'base64');
        fileName = sched.host && sched.host !== 'all' ? `${sched.host}-report.pdf` : 'report.pdf';
        mimeType = 'application/pdf';
      } else {
        fileBuffer = await generateExcelBuffer(sched.host, sched.sections);
        fileName = sched.host && sched.host !== 'all' ? `${sched.host}-report.xlsx` : 'report.xlsx';
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      }

      // Crea il documento del report nella collezione Reports
      await firestore.collection('Reports').add({
        userId: sched.userId,
        username: sched.username,
        company: sched.company,
        host: sched.host,
        sections: sched.sections,
        format: sched.format,
        fileData: fileBuffer,
        fileName,
        mimeType,
        createdAt: new Date()
      });

      // Recupera i dati dell'utente
      const userDoc = await firestore.collection('Users').doc(sched.userId).get();
      const userRecord = userDoc.data();
      if (userRecord && userRecord.email) {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER || 'no-reply@storvix.eu',
            pass: process.env.EMAIL_PASSWORD
          }
        });
        const reportSubject = sched.host && sched.host !== 'all'
          ? `Scheduled Report for system ${sched.host}`
          : 'Scheduled Aggregated Report';
        const emailBody = `Attached is your scheduled report generated at ${now.toLocaleString()}.`;
        const mailOptions = {
          from: process.env.EMAIL_USER || 'no-reply@storvix.eu',
          to: userRecord.email,
          subject: reportSubject,
          text: emailBody,
          attachments: [
            { filename: fileName, content: fileBuffer }
          ]
        };

        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            console.error('Error sending scheduled report email:', error);
          } else {
            console.log('Scheduled report email sent: ' + info.response);
          }
        });
      }

      // Aggiorna lastRunAt e calcola nextRunAt
      const nextRunAt = getNextRun(now, sched.frequency, sched.customInterval);
      await firestore.collection('ScheduledReports').doc(sched.id).update({
        lastRunAt: now,
        nextRunAt: nextRunAt ? nextRunAt : null
      });
    }
  } catch (err) {
    console.error('[CRON] Error in scheduled job:', err);
  }
});
