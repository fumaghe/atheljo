import firestore from '../firebase.js';
import admin from 'firebase-admin';

const collectionName = 'Reports';

/**
 * Crea un nuovo Report.
 * @param {Object} reportData - I dati del report.
 * @returns {Object} Il report creato (con l'id assegnato).
 */
export const createReport = async (reportData) => {
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
 * Recupera un report dato il suo id.
 * @param {string} id - L'id del report.
 * @returns {Object|null} Il report oppure null se non trovato.
 */
export const getReportById = async (id) => {
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
 * Aggiorna un report.
 * @param {string} id - L'id del report da aggiornare.
 * @param {Object} updateData - I dati da aggiornare.
 */
export const updateReport = async (id, updateData) => {
  try {
    const docRef = firestore.collection(collectionName).doc(id);
    await docRef.update(updateData);
  } catch (error) {
    throw error;
  }
};

/**
 * Elimina un report.
 * @param {string} id - L'id del report da eliminare.
 */
export const deleteReport = async (id) => {
  try {
    const docRef = firestore.collection(collectionName).doc(id);
    await docRef.delete();
  } catch (error) {
    throw error;
  }
};

// Aggiungi un default export per consentire l'importazione di default
export default {
  createReport,
  getReportById,
  updateReport,
  deleteReport,
};
