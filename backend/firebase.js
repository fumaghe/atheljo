// backend/firebase.js
import admin from 'firebase-admin';

// Leggi la chiave JSON dalle variabili d'ambiente
const serviceAccount = JSON.parse(process.env.FIRESTORE_CREDENTIALS_CONTENT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const firestore = admin.firestore();
export default firestore;
