// src/server.js
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generatePDFReportForAPI } from '../backend/utils/pdfGenerator.js';

const app = express();
const PORT = process.env.FRONTEND_PORT || 3001;
app.use(cors());
app.use(express.json());

// Per determinare il path corrente (necessario per il logo)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Token di protezione (da impostare in ambiente)
const PROTECTION_TOKEN = process.env.PROTECTION_TOKEN || 'secret123';

// Endpoint protetto che genera il report con jsPDF e restituisce il PDF in formato base64
app.get('/generate-report', async (req, res) => {
  const { token, host } = req.query;
  if (token !== PROTECTION_TOKEN) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  try {
    // Carica il logo (se presente) e convertilo in DataURL
    let logoDataUrl = null;
    const logoPath = path.join(__dirname, 'assets/images/STORViXTM_WHITE.png');
    if (fs.existsSync(logoPath)) {
      const imageBuffer = fs.readFileSync(logoPath);
      logoDataUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`;
    }
    // Genera il PDF usando la funzione condivisa (vedi file pdfGenerator.js)
    const pdfDataUri = generatePDFReportForAPI({ host, logoDataUrl });
    res.json({ pdfDataUri });
  } catch (err) {
    res.status(500).json({ message: 'Error generating report', error: err.toString() });
  }
});

app.listen(PORT, () => {
  console.log(`Front-end API server running on port ${PORT}`);
});
