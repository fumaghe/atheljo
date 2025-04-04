// backend/firebase.js
import admin from 'firebase-admin';
import serviceAccount from '/Archimedes2.0/credentials.json' assert { type: "json" };

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const firestore = admin.firestore();
export default firestore;
