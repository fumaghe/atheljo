// backend/firebase.js
import admin from 'firebase-admin';

// Legge il contenuto codificato in base64 dalla variabile d'ambiente
const credentialsBase64 = process.env.FIRESTORE_CREDENTIALS_CONTENT_BASE64;

if (!credentialsBase64) {
  throw new Error('FIRESTORE_CREDENTIALS_CONTENT_BASE64 non è impostata o è vuota.');
}

let credentialsJSON;
try {
  credentialsJSON = Buffer.from(credentialsBase64, 'base64').toString('utf8');
} catch (error) {
  throw new Error('Errore durante la decodifica di FIRESTORE_CREDENTIALS_CONTENT_BASE64: ' + error.message);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(credentialsJSON);
} catch (error) {
  throw new Error('FIRESTORE_CREDENTIALS_CONTENT non contiene un JSON valido: ' + error.message);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const firestore = admin.firestore();
export default firestore;
