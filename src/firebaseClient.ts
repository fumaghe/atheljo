// src/firebaseClient.ts
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Inserisci qui la tua configurazione web di Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBTNgEzVDi1uwAXl8slE-2m_83OEiYXsXY",
  authDomain: "data-science-448408.firebaseapp.com",
  projectId: "data-science-448408",
  storageBucket: "data-science-448408.firebasestorage.app",
  messagingSenderId: "974864358168",
  appId: "1:974864358168:web:bcbfb0b6eaebc7116b5c6d"
};

const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);

export default firestore;