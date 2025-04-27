// backend/emailSchedulerCron.js

import cron from 'node-cron';
import firestore from './firebase.js';
import nodemailer from 'nodemailer';
import { getNextRun } from './utils/getNextRun.js';
import { generatePDFReportForAPI } from './utils/pdfGenerator.js';
import { generateExcelBuffer }    from './utils/reportGenerator.js';
import { parseCSVFile }           from './utils/csvParser.js';
import {
  getEnhancedSystemHealthScore,
  computeAggregatedStats
} from './utils/healthCalculator.js';
// Import corretto dal tuo backend/utils
import { generateSystemSummary } from './utils/generateSystemSummary.js';

const SYSTEMS_CSV_PATH = 'data/systems_data.csv';

// ogni minuto (*/1 * * * *) o ogni 5 minuti (*/5 * * * *)
cron.schedule('*/1 * * * *', async () => {
  const now = new Date();
  console.log('[CRON-MAIL] checking scheduled mails –', now.toISOString());

  // prende tutte le schedule pronte
  const snap = await firestore
    .collection('ScheduleMail')
    .where('nextRunAt', '<=', now)
    .get();

  if (snap.empty) return;

  // configura SMTP
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER || 'no-reply@storvix.eu',
      pass: process.env.EMAIL_PASSWORD
    }
  });

  for (const doc of snap.docs) {
    const sched = { id: doc.id, ...doc.data() };

    // prepara eventuale allegato
    let attachments = [];
    if (sched.attachReport) {
      const systemsData = await parseCSVFile(SYSTEMS_CSV_PATH);
      let buffer, filename, mimeType;

      if (sched.format === 'pdf') {
        const dataUri = generatePDFReportForAPI({
          host: sched.host,
          company: sched.company,
          logoDataUrl: null,
          systemName: sched.host,
          aggregatedStats:
            sched.host === 'all' ? computeAggregatedStats(systemsData) : null,
          health:
            sched.host !== 'all'
              ? getEnhancedSystemHealthScore(
                  systemsData.find(s => s.hostid === sched.host)
                )
              : null,
          forecast: []
        });
        buffer   = Buffer.from(dataUri.split('base64,')[1], 'base64');
        filename = `${sched.host === 'all' ? 'report' : sched.host + '-report'}.pdf`;
        mimeType = 'application/pdf';
      } else {
        buffer   = await generateExcelBuffer(sched.host, sched.sections);
        filename = `${sched.host === 'all' ? 'report' : sched.host + '-report'}.xlsx`;
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      }

      attachments.push({ filename, content: buffer, contentType: mimeType });
    }

    // genera il corpo della mail: usa generateSystemSummary se runAlgorithm=true
    let textBody = sched.body || '';
    if (sched.runAlgorithm) {
      try {
        textBody = await generateSystemSummary();
      } catch (err) {
        console.error('[CRON-MAIL] errore generazione summary:', err);
        // fallback: rimani su sched.body
      }
    }

    // invia mail
    const mailOptions = {
      from: process.env.EMAIL_USER || 'no-reply@storvix.eu',
      to: Array.isArray(sched.recipients)
        ? sched.recipients.join(',')
        : sched.recipients,
      subject: sched.subject || 'Systems Status Summary',
      text: textBody,
      attachments
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`[CRON-MAIL] sent mail scheduleId=${sched.id}`);
    } catch (err) {
      console.error('[CRON-MAIL] error sending mail', err);
    }

    // aggiorna nextRunAt o cancella se \"once\"
    let nextRunAt = null;
    if (sched.frequency && sched.frequency !== 'once') {
      nextRunAt = getNextRun(now, sched.frequency, sched.customInterval);
    }

    if (nextRunAt) {
      await firestore
        .collection('ScheduleMail')
        .doc(sched.id)
        .update({ lastRunAt: now, nextRunAt });
    } else {
      await firestore.collection('ScheduleMail').doc(sched.id).delete();
    }
  }
});
