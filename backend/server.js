// backend/server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import bcrypt from 'bcryptjs';

// Importa le rotte
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import reportRoutes from './routes/reports.js';
import subscriptionPermissionsRoutes from './routes/subscriptionPermissions.js';
import employeesRoutes from './routes/employees.js';
import companiesRoutes from './routes/companies.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: '50mb' }));
app.use(cors());

import firestore from './firebase.js';
import admin from 'firebase-admin';

// Leggi le variabili di ambiente dal file .env
const adminEmail = process.env.DEFAULT_ADMIN_EMAIL;
const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD;
const adminUsername = process.env.DEFAULT_ADMIN_USERNAME;
const adminCompany = process.env.DEFAULT_ADMIN_COMPANY;
const adminSubscription = process.env.DEFAULT_ADMIN_SUBSCRIPTION;

// Inizializzazione dell'utente admin in Firestore
(async () => {
  try {
    const adminRef = firestore.collection('users').doc('admin');
    const adminDoc = await adminRef.get();
    if (!adminDoc.exists) {
      console.log('Admin user not found. Creating default admin user...');
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await adminRef.set({
        username: adminUsername,
        password: hashedPassword,
        email: adminEmail,
        role: 'admin',
        company: adminCompany,
        subscription: adminSubscription,
        subscriptionExpires: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log('Default admin user created.');
    }
  } catch (error) {
    console.error('Error during admin user initialization:', error);
  }
})();

// Registrazione delle rotte API
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/subscription-permissions', subscriptionPermissionsRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/companies', companiesRoutes);

// Endpoint per aggiornare i dati (es. per chiamare uno script Python)
app.post('/api/update_data', (req, res) => {
  const scriptPath = path.join(__dirname, 'update_data.py');
  const pyProcess = spawn('python', [scriptPath]);

  pyProcess.stdout.on('data', (data) => {
    console.log(`PYTHON STDOUT: ${data}`);
  });

  pyProcess.stderr.on('data', (data) => {
    console.error(`PYTHON STDERR: ${data}`);
  });

  pyProcess.on('close', (code) => {
    console.log(`Python script exited with code ${code}`);
    if (code === 0) {
      res.json({ success: true });
    } else {
      res.status(500).json({ success: false });
    }
  });
});

// Importa i cron job (quelli già esistenti e quello per main.py)
import './cron.js';
import './cron_main.js';

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
