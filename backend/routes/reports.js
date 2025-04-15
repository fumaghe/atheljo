// backend/routes/reports.js
import express from 'express';
import firestore from '../firebase.js';
import { getEnhancedSystemHealthScore, computeAggregatedStats } from '../utils/healthCalculator.js';
import { generateExcelBuffer } from '../utils/reportGenerator.js';
import { generatePDFReportForAPI } from '../utils/pdfGenerator.js';
import nodemailer from 'nodemailer';

const router = express.Router();

/**
 * Calcola la data del prossimo run in base alla frequenza e al customInterval.
 */
function calculateNextRun(now, frequency, customInterval) {
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

/**
 * POST /api/reports/create
 * Crea un report basato sui dati di sistema letti dalla collection "system_data".
 * - Se host === "all": recupera tutti i documenti da "system_data" e li aggrega.
 * - Altrimenti: recupera il documento corrispondente a host (che deve corrispondere all'ID del documento in "system_data").
 */
router.post('/create', async (req, res) => {
  try {
    const { userId, username, company, host, sections, format, schedule } = req.body;

    let healthData = null;
    let aggregatedStatsData = null;
    
    if (host === 'all') {
      // Recupera tutti i documenti della collection system_data
      const snapshot = await firestore.collection('system_data').get();
      const systemsData = snapshot.docs.map(doc => doc.data());
      aggregatedStatsData = computeAggregatedStats(systemsData);
    } else {
      // Recupera il documento specifico dalla collection system_data
      const doc = await firestore.collection('system_data').doc(host).get();
      if (doc.exists) {
        healthData = getEnhancedSystemHealthScore(doc.data());
      }
    }

    let fileBuffer;
    let fileName;
    let mimeType;

    if (format === 'pdf') {
      const options = {
        host,
        logoDataUrl: null,
        company,
        systemName: host,
        aggregatedStats: host === 'all' ? aggregatedStatsData : null,
        health: host === 'all' ? null : healthData,
        forecast: [] // forecast vuoto
      };
      const pdfDataUri = generatePDFReportForAPI(options);
      fileBuffer = Buffer.from(pdfDataUri.split('base64,')[1], 'base64');
      fileName = host && host !== 'all' ? `${host}-report.pdf` : 'report.pdf';
      mimeType = 'application/pdf';
    } else {
      fileBuffer = await generateExcelBuffer(host, sections);
      fileName = host && host !== 'all' ? `${host}-report.xlsx` : 'report.xlsx';
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }

    // Salva il report nella collection "Reports"
    const reportRef = await firestore.collection('Reports').add({
      userId,
      username,
      company,
      host,
      sections,
      format,
      fileData: fileBuffer,
      fileName,
      mimeType,
      createdAt: new Date()
    });
    const reportId = reportRef.id;

    // Se è prevista una schedulazione, crea anche il documento nella collection "ScheduledReports"
    if (schedule && schedule.frequency && schedule.frequency !== 'none') {
      const now = new Date();
      const nextRunAt = calculateNextRun(now, schedule.frequency, schedule.customInterval);
      if (!nextRunAt) {
        return res.status(400).json({ message: 'Invalid scheduling frequency' });
      }
      await firestore.collection('ScheduledReports').add({
        userId,
        username,
        company,
        host,
        sections,
        format,
        frequency: schedule.frequency,
        customInterval: schedule.customInterval,
        nextRunAt,
        health: host === 'all' ? null : healthData,
        aggregatedStats: host === 'all' ? aggregatedStatsData : null,
        createdAt: now
      });

      const reportDate = now.toLocaleDateString();
      const subject = host && host !== 'all'
        ? `Report for system ${host} - ${reportDate}`
        : `Aggregated Report - ${reportDate}`;
      const emailBody = `You have scheduled the report with frequency "${schedule.frequency}"` +
        (schedule.frequency === 'custom'
          ? ` (every ${schedule.customInterval} ${schedule.customInterval <= 24 ? 'hours' : 'days'})`
          : '') +
        ` for host "${host}". Attached is the first report.`;

      // Recupera l'utente dalla collection "users"
      const userDoc = await firestore.collection('users').doc(userId).get();
      const userRecord = userDoc.data();
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER || 'no-reply@storvix.eu',
          pass: process.env.EMAIL_PASSWORD
        }
      });
      const mailOptions = {
        from: process.env.EMAIL_USER || 'no-reply@storvix.eu',
        to: userRecord?.email,
        subject: `Schedule Confirmation: ${subject}`,
        text: emailBody,
        attachments: [
          { filename: fileName, content: fileBuffer }
        ]
      };
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error('Error sending schedule confirmation email:', error);
        } else {
          console.log('Schedule confirmation email sent: ' + info.response);
        }
      });
    } else {
      // Se non è prevista la schedulazione, invia il report immediatamente via email
      const userDoc = await firestore.collection('users').doc(userId).get();
      const userRecord = userDoc.data();
      if (userRecord && userRecord.email) {
        const reportDate = new Date().toLocaleDateString();
        const subject = host && host !== 'all'
          ? `Report for system ${host} - ${reportDate}`
          : `Aggregated Report - ${reportDate}`;
        const emailBody = `Attached is your report generated for ${host === 'all' ? 'all systems' : 'system ' + host}.`;
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER || 'no-reply@storvix.eu',
            pass: process.env.EMAIL_PASSWORD
          }
        });
        const mailOptions = {
          from: process.env.EMAIL_USER || 'no-reply@storvix.eu',
          to: userRecord.email,
          subject: subject,
          text: emailBody,
          attachments: [
            { filename: fileName, content: fileBuffer }
          ]
        };
        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            console.error('Error sending immediate report email:', error);
          } else {
            console.log('Immediate report email sent: ' + info.response);
          }
        });
      } else {
        console.error('User email not found');
      }
    }
    return res.json({ reportId });
  } catch (err) {
    console.error('Error creating report:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/reports/list
 * Recupera i report (dalla collection "Reports") e le schedulazioni (dalla collection "ScheduledReports")
 * filtrando per utente, azienda, e applicando paginazione.
 */
router.get('/list', async (req, res) => {
  try {
    const { userId, username, company, reportLimit, reportSkip } = req.query;
    const reportLimitNum = parseInt(reportLimit) || 5;
    const reportSkipNum = parseInt(reportSkip) || 0;

    let reportsQuery = firestore.collection('Reports');
    if (username) {
      reportsQuery = reportsQuery.where('username', '==', username);
    } else if (userId) {
      reportsQuery = reportsQuery.where('userId', '==', userId);
    }
    if (company && company !== 'all') {
      reportsQuery = reportsQuery.where('company', '==', company);
    }
    reportsQuery = reportsQuery.orderBy('createdAt', 'desc').offset(reportSkipNum).limit(reportLimitNum);
    const reportsSnapshot = await reportsQuery.get();
    const reports = [];
    reportsSnapshot.forEach(doc => {
      reports.push({ id: doc.id, ...doc.data() });
    });

    let schedQuery = firestore.collection('ScheduledReports');
    if (username) {
      schedQuery = schedQuery.where('username', '==', username);
    } else if (userId) {
      schedQuery = schedQuery.where('userId', '==', userId);
    }
    if (company && company !== 'all') {
      schedQuery = schedQuery.where('company', '==', company);
    }
    schedQuery = schedQuery.orderBy('createdAt', 'desc');
    const schedSnapshot = await schedQuery.get();
    const schedules = [];
    schedSnapshot.forEach(doc => {
      schedules.push({ id: doc.id, ...doc.data() });
    });
    res.json({ reports, schedules });
  } catch (err) {
    console.error("Error listing reports/schedules:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/reports/download/:id
 * Permette di scaricare il report con l'id specificato.
 */
router.get('/download/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const reportDoc = await firestore.collection('Reports').doc(id).get();
    if (!reportDoc.exists)
      return res.status(404).json({ message: 'Report not found' });
    const report = reportDoc.data();

    if (report.fileData) {
      res.setHeader('Content-Type', report.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`);
      return res.send(report.fileData);
    }
    const cutoffDate = report.createdAt?.toDate
      ? report.createdAt.toDate()
      : new Date(report.createdAt);
    let fileBuffer;
    let fileName;
    let mimeType;
    if (report.format === 'pdf') {
      const options = {
        host: report.host,
        logoDataUrl: null,
        company: report.company,
        systemName: report.host,
        aggregatedStats: report.host === 'all' ? {} : null,
        health: null,
        forecast: []
      };
      const pdfDataUri = generatePDFReportForAPI(options);
      fileBuffer = Buffer.from(pdfDataUri.split('base64,')[1], 'base64');
      fileName = report.host && report.host !== 'all'
        ? `${report.host}-report.pdf`
        : `${new Date(cutoffDate).toISOString().slice(0, 10)}-report.pdf`;
      mimeType = 'application/pdf';
    } else {
      fileBuffer = await generateExcelBuffer(report.host, report.sections, cutoffDate);
      fileName = report.host && report.host !== 'all'
        ? `${report.host}-report.xlsx`
        : `${new Date(cutoffDate).toISOString().slice(0, 10)}-report.xlsx`;
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(fileBuffer);
  } catch (err) {
    console.error('Error downloading file:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * DELETE /api/reports/schedule/:id
 * Elimina una schedulazione e invia un'email di notifica.
 */
router.delete('/schedule/:id', async (req, res) => {
  try {
    const schedId = req.params.id;
    const schedDoc = await firestore.collection('ScheduledReports').doc(schedId).get();
    const sched = schedDoc.data();
    await firestore.collection('ScheduledReports').doc(schedId).delete();

    if (sched) {
      const userDoc = await firestore.collection('users').doc(sched.userId).get();
      const userRecord = userDoc.data();
      if (userRecord && userRecord.email) {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER || 'no-reply@storvix.eu',
            pass: process.env.EMAIL_PASSWORD
          }
        });
        const mailOptions = {
          from: process.env.EMAIL_USER || 'no-reply@storvix.eu',
          to: userRecord.email,
          subject: 'Scheduled Report Cancelled',
          text: `Your scheduled report for host "${sched.host}" has been cancelled.`
        };
        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            console.error('Error sending cancellation email:', error);
          } else {
            console.log('Cancellation email sent: ' + info.response);
          }
        });
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting schedule:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/reports/config
 * Salva la configurazione di una schedulazione creando un documento in "ScheduledReports".
 */
router.post('/config', async (req, res) => {
  try {
    const { userId, username, company, host, sections, format, schedulingFrequency, customInterval } = req.body;
    if (!schedulingFrequency || schedulingFrequency === 'none') {
      return res.status(400).json({ message: 'Scheduling frequency must be provided' });
    }
    const now = new Date();
    const nextRunAt = calculateNextRun(now, schedulingFrequency, customInterval);
    if (!nextRunAt) {
      return res.status(400).json({ message: 'Invalid scheduling parameters' });
    }
    const scheduledReportRef = await firestore.collection('ScheduledReports').add({
      userId,
      username,
      company,
      host,
      sections,
      format,
      frequency: schedulingFrequency,
      customInterval,
      nextRunAt,
      createdAt: now
    });
    res.json({ id: scheduledReportRef.id });
  } catch (err) {
    console.error('Error saving report config:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/reports/send
 * Invia un report via email.
 */
router.post('/send', async (req, res) => {
  try {
    const { email, subject, body, attachment } = req.body;
    if (!email || !subject || !attachment) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER || 'no-reply@storvix.eu',
        pass: process.env.EMAIL_PASSWORD
      }
    });
    const base64Data = attachment.split('base64,')[1];
    const mailOptions = {
      from: process.env.EMAIL_USER || 'no-reply@storvix.eu',
      to: email,
      subject: subject,
      text: body,
      attachments: [
        {
          filename: subject.includes('Aggregated') ? 'report.pdf' : 'report.pdf',
          content: base64Data,
          encoding: 'base64'
        }
      ]
    };
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Error sending report email:', error);
        return res.status(500).json({ message: 'Errore invio email' });
      }
      console.log('Report email sent: ' + info.response);
      res.json({ message: 'Report inviato via email' });
    });
  } catch (err) {
    console.error('Error in /reports/send:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
