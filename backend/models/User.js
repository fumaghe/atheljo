// backend/models/User.js
import firestore from '../firebase.js';
import admin from 'firebase-admin';
import bcrypt from 'bcryptjs';

const collectionName = 'users'; // Collection in minuscolo
const saltRounds = 10;

/**
 * Crea un nuovo utente utilizzando lo username come ID del documento.
 * @param {Object} userData - I dati dell'utente.
 * @returns {Object} L'utente creato.
 */
export const createUser = async (userData) => {
  try {
    if (userData.password) {
      const salt = await bcrypt.genSalt(saltRounds);
      userData.password = await bcrypt.hash(userData.password, salt);
    }
    userData.createdAt = admin.firestore.FieldValue.serverTimestamp();
    // Aggiungi il flag per forzare il cambio password
    userData.forcePasswordChange = true;
    // Usa lo username come ID del documento
    await firestore.collection(collectionName).doc(userData.username).set(userData);
    const docSnapshot = await firestore.collection(collectionName).doc(userData.username).get();
    return { id: docSnapshot.id, ...docSnapshot.data() };
  } catch (error) {
    throw error;
  }
};

/**
 * Recupera un utente per ID.
 * @param {string} id - L'ID dell'utente.
 * @returns {Object|null} L'utente oppure null se non trovato.
 */
export const getUserById = async (id) => {
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
 * Recupera un utente dato il nome utente.
 * Poiché usiamo lo username come ID, lo recuperiamo direttamente.
 * @param {string} username - Il nome utente.
 * @returns {Object|null} L'utente oppure null se non trovato.
 */
export const getUserByUsername = async (username) => {
  try {
    const docRef = firestore.collection(collectionName).doc(username);
    const docSnapshot = await docRef.get();
    if (docSnapshot.exists) {
      const data = docSnapshot.data();
      // Converte i campi Timestamp in Date
      if (data.createdAt && data.createdAt.toDate) {
        data.createdAt = data.createdAt.toDate();
      }
      if (data.subscriptionExpires && data.subscriptionExpires.toDate) {
        data.subscriptionExpires = data.subscriptionExpires.toDate();
      }
      if (data.twoFactorAuthAt && data.twoFactorAuthAt.toDate) {
        data.twoFactorAuthAt = data.twoFactorAuthAt.toDate();
      }
      return { id: docSnapshot.id, ...data };
    }
    return null;
  } catch (error) {
    throw error;
  }
};

/**
 * Aggiorna un utente.
 * Se viene aggiornata la password, questa viene nuovamente hasha.
 * @param {string} id - L'ID dell'utente da aggiornare.
 * @param {Object} updateData - I dati da aggiornare.
 * @returns {Object} L'utente aggiornato.
 */
export const updateUser = async (id, updateData) => {
  try {
    const docRef = firestore.collection(collectionName).doc(id);
    if (updateData.password) {
      const salt = await bcrypt.genSalt(saltRounds);
      updateData.password = await bcrypt.hash(updateData.password, salt);
    }
    await docRef.update(updateData);
    // Leggi il documento aggiornato e restituiscilo
    const updatedDoc = await docRef.get();
    return { id: updatedDoc.id, ...updatedDoc.data() };
  } catch (error) {
    throw error;
  }
};

/**
 * Elimina un utente.
 * @param {string} id - L'ID dell'utente da eliminare.
 */
export const deleteUser = async (id) => {
  try {
    const docRef = firestore.collection(collectionName).doc(id);
    await docRef.delete();
  } catch (error) {
    throw error;
  }
};
