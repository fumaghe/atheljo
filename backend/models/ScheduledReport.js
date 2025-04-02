// backend/models/ScheduledReport.js
import firestore from '../firebase.js';

import admin from 'firebase-admin';

const collectionName = 'ScheduledReports';

/**
 * Crea un nuovo Scheduled Report.
 * @param {Object} reportData - I dati del report schedulato.
 * @returns {Object} Il report creato (con l'id assegnato).
 */
export const createScheduledReport = async (reportData) => {
  try {
    const data = {
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      ...reportData
    };
    const docRef = await firestore.collection(collectionName).add(data);
    const docSnapshot = await docRef.get();
    return { id: docRef.id, ...docSnapshot.data() };
  } catch (error) {
    throw error;
  }
};

/**
 * Recupera un Scheduled Report per id.
 * @param {string} id - L'id del report.
 * @returns {Object|null} Il report oppure null se non trovato.
 */
export const getScheduledReportById = async (id) => {
  try {
    const docRef = firestore.collection(collectionName).doc(id);
    const docSnapshot = await docRef.get();
    if (docSnapshot.exists) {
      return { id: docSnapshot.id, ...docSnapshot.data() };
    }
    return null;
  } catch (error) {
    throw error;
  }
};

/**
 * Aggiorna un Scheduled Report.
 * @param {string} id - L'id del report da aggiornare.
 * @param {Object} updateData - I dati da aggiornare.
 */
export const updateScheduledReport = async (id, updateData) => {
  try {
    const docRef = firestore.collection(collectionName).doc(id);
    await docRef.update(updateData);
  } catch (error) {
    throw error;
  }
};

/**
 * Elimina un Scheduled Report.
 * @param {string} id - L'id del report da eliminare.
 */
export const deleteScheduledReport = async (id) => {
  try {
    const docRef = firestore.collection(collectionName).doc(id);
    await docRef.delete();
  } catch (error) {
    throw error;
  }
};
