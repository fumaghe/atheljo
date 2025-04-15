// backend/routes/auth.js
import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import firestore from '../firebase.js';
import { createUser, getUserByUsername, getUserById, updateUser } from '../models/User.js';

const router = express.Router();
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

// Store in-memory per OTP (per demo; in produzione utilizzare un sistema persistente)
let otpStore = {};

// LOGIN
router.post('/login', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    // Recupera l'utente tramite il modello (utilizzando lo username come ID)
    const user = await getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }
    
    // Calcola se è richiesto il 2FA (es. non presente o scaduto)
    const requires2FA = !user.twoFactorAuthAt || (Date.now() - new Date(user.twoFactorAuthAt).getTime()) >= THREE_DAYS_MS;
    
    // Se il 2FA è richiesto, procedi con il flusso OTP
    if (requires2FA) {
      if (!email) {
        return res.json({
          twoFactorRequired: true,
          message: "Authentication is required. Please provide your email."
        });
      }
      if (user.email !== email) {
        await firestore.collection('users').doc(user.id).update({ email });
        user.email = email;
      }
      // Genera OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expires = Date.now() + 5 * 60 * 1000;
      otpStore[user.id] = { otp, expires };
      console.log(`OTP generated for user ${user.id}: ${otp}`);
      
      // Configura il trasportatore per l'invio dell'email tramite Gmail
      const emailUser = process.env.EMAIL_USER || 'no-reply@storvix.eu';
      const emailPassword = process.env.EMAIL_PASSWORD;
      if (!emailPassword) {
        console.error("EMAIL_PASSWORD is missing in environment variables.");
        return res.status(500).json({ message: 'Email configuration error' });
      }
      
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: emailUser,
          pass: emailPassword
        }
      });
      
      const mailOptions = {
        from: emailUser,
        to: user.email,
        subject: 'Your OTP Code',
        text: `Your OTP code is: ${otp}. It expires in 5 minutes.`
      };
      
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error('Error sending OTP email:', error);
          return res.status(500).json({ message: 'Error sending OTP email' });
        }
        console.log('OTP email sent: ' + info.response);
        return res.json({ twoFactorRequired: true, userId: user.id });
      });
    } else {
      // Se il 2FA non è richiesto, restituisci l'oggetto utente (senza la password)
      const { password, ...userData } = user;
      return res.json(userData);
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// VERIFY OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { userId, otp } = req.body;
    console.log("Verifying OTP for userId:", userId);
    if (!otpStore[userId]) {
      return res.status(400).json({ message: 'OTP not found or expired' });
    }
    const { otp: storedOtp, expires } = otpStore[userId];
    if (Date.now() > expires) {
      delete otpStore[userId];
      return res.status(400).json({ message: 'OTP expired' });
    }
    if (otp.trim() !== storedOtp) {
      return res.status(400).json({ message: 'OTP not valid' });
    }
    // Aggiorna il campo twoFactorAuthAt
    await firestore.collection('users').doc(userId).update({ twoFactorAuthAt: new Date() });
    const userDoc = await firestore.collection('users').doc(userId).get();
    const user = userDoc.data();
    delete otpStore[userId];
    const { password, ...userData } = user;
    res.json({ id: userId, ...userData, twoFactorAuthAt: new Date() });
  } catch (err) {
    console.error('OTP verification error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// FORGOT PASSWORD
router.post('/forgot-password', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ message: 'Username is required' });
    const user = await getUserByUsername(username);
    if (!user || !user.email) {
      return res.json({ message: 'If that account exists and has an email, a reset link has been sent.' });
    }
    const token = crypto.randomBytes(20).toString('hex');
    await firestore.collection('users').doc(user.id).update({
      resetPasswordToken: token,
      resetPasswordExpires: Date.now() + 3600000
    });
    const frontendUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;
    console.log("Reset URL:", resetUrl);
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER || 'no-reply@storvix.eu',
        pass: process.env.EMAIL_PASSWORD
      }
    });
    const mailOptions = {
      from: process.env.EMAIL_USER || 'no-reply@storvix.eu',
      to: user.email,
      subject: 'Password Reset',
      text: `You requested a password reset. Click the following link to reset your password. This link is valid for 1 hour:\n\n${resetUrl}`
    };
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Error sending password reset email:', error);
        return res.status(500).json({ message: 'Error sending password reset email' });
      }
      console.log('Password reset email sent: ' + info.response);
      res.json({ message: 'If that account exists and has an email, a reset link has been sent.' });
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// RESET PASSWORD
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token and new password are required' });
    }
    const now = Date.now();
    const snapshot = await firestore.collection('users')
      .where('resetPasswordToken', '==', token)
      .get();
    let user = null;
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.resetPasswordExpires && data.resetPasswordExpires > now) {
        user = { id: doc.id, ...data };
      }
    });
    if (!user) {
      return res.status(400).json({ message: 'Password reset token is invalid or has expired' });
    }
    // Usa updateUser per aggiornare la password (updateUser gestisce l'hashing)
    await updateUser(user.id, {
      password: newPassword,
      resetPasswordToken: null,
      resetPasswordExpires: null
    });
    res.json({ message: 'Password has been reset successfully.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// REGISTRATION (crea anche employee)
router.post('/register', async (req, res) => {
  try {
    const { username, password, email, role, company, permissions, parentCustomerId, subscription, subscriptionExpires } = req.body;
    // Verifica se esiste già un documento con ID uguale a username
    const existingUserDoc = await firestore.collection('users').doc(username).get();
    if (existingUserDoc.exists) {
      return res.status(400).json({ message: 'Username already exists' });
    }
    // Crea l'utente usando la funzione del modello che imposta lo username come ID e hasha la password
    const createdUser = await createUser({
      username,
      password,
      email: role === 'employee' ? '' : (email || ''),
      role,
      company,
      subscription: subscription || 'None',
      subscriptionExpires: subscriptionExpires || null,
      permissions: Array.isArray(permissions) ? permissions : [],
      parentCustomerId: parentCustomerId || null,
      visibleCompanies: req.body.visibleCompanies || null 
    });
    res.status(201).json(createdUser);
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
