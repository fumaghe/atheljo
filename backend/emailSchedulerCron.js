// backend/emailSchedulerCron.js

import cron           from 'node-cron';
import firestore      from './firebase.js';
import nodemailer     from 'nodemailer';
import { htmlToText } from 'html-to-text';

import { getNextRun }               from './utils/getNextRun.js';
import { generatePDFReportForAPI }  from './utils/pdfGenerator.js';
import { generateExcelBuffer }      from './utils/reportGenerator.js';
import { parseCSVFile }             from './utils/csvParser.js';
import {
  getEnhancedSystemHealthScore,
  computeAggregatedStats
} from './utils/healthCalculator.js';
import { generateSystemSummary }    from './utils/generateSystemSummary.js';

const SYSTEMS_CSV_PATH = 'data/systems_data.csv';

/**
 * Runs every minute. Fetches pending ScheduleMail docs, composes their
 * messages (HTML-formatted if runAlgorithm = true) and sends via SMTP.
 */
cron.schedule('*/1 * * * *', async () => {
  const now = new Date();
  console.log('[CRON-MAIL] checking scheduled mails –', now.toISOString());

  // 1) Pick up due schedules
  const snap = await firestore
    .collection('ScheduleMail')
    .where('nextRunAt', '<=', now)
    .get();

  if (snap.empty) return;

  // 2) Configure SMTP (Gmail / custom SMTP)
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER || 'no-reply@storvix.eu',
      pass: process.env.EMAIL_PASSWORD
    }
  });

  // 3) Iterate each schedule
  for (const doc of snap.docs) {
    const sched = { id: doc.id, ...doc.data() };

    /* --------------------------------------------------------------
     * 3-a) Optional attachments
     * -------------------------------------------------------------- */
    const attachments = [];
    if (sched.attachReport) {
      const systemsData = await parseCSVFile(SYSTEMS_CSV_PATH);
      let buffer, filename, mimeType;

      if (sched.format === 'pdf') {
        const dataUri = generatePDFReportForAPI({
          host: sched.host,
          company: sched.company,
          logoDataUrl: null,
          systemName: sched.host,
          aggregatedStats: sched.host === 'all'
            ? computeAggregatedStats(systemsData)
            : null,
          health: sched.host !== 'all'
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

    /* --------------------------------------------------------------
     * 3-b) Build email body (HTML + plain-text fallback)
     * -------------------------------------------------------------- */
    let htmlBody = sched.body || '';

    if (sched.runAlgorithm) {
      try {
        console.log(
          `[CRON-MAIL] generating summary for scheduleId=${sched.id} companies=[${(
            sched.companies || []
          ).join(',')}] includeSlashPools=${sched.includeSlashPools}`
        );

        // Pass the saved companies & includeSlashPools to the summary generator:
        htmlBody = await generateSystemSummary({
          companies:           sched.companies,
          includeSlashPools:   sched.includeSlashPools
        });
      } catch (err) {
        console.error('[CRON-MAIL] error generating summary:', err);
        // fallback: keep sched.body if provided
      }
    }

    // plain-text fallback (strip tags)
    const textBody = htmlBody ? htmlToText(htmlBody, { wordwrap: 100 }) : '';

    /* --------------------------------------------------------------
     * 3-c) Send email
     * -------------------------------------------------------------- */
    const mailOptions = {
      from:    process.env.EMAIL_USER || 'no-reply@storvix.eu',
      to:      Array.isArray(sched.recipients) ? sched.recipients.join(',') : sched.recipients,
      subject: sched.subject || 'Systems Status Summary',
      html:    htmlBody,
      text:    textBody,
      attachments
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`[CRON-MAIL] sent mail scheduleId=${sched.id}`);
    } catch (err) {
      console.error('[CRON-MAIL] error sending mail', err);
    }

    /* --------------------------------------------------------------
     * 3-d) Reschedule or delete
     * -------------------------------------------------------------- */
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
      await firestore
        .collection('ScheduleMail')
        .doc(sched.id)
        .delete();
    }
  }
});
