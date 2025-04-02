// backend/models/SubscriptionPermission.js
import firestore from '../firebase.js';

const collectionName = 'SubscriptionPermissions';

/**
 * Crea un nuovo permesso di subscription.
 * @param {Object} data - I dati del permesso.
 * @returns {Object} Il permesso creato (con l'id assegnato).
 */
export const createSubscriptionPermission = async (data) => {
  try {
    const docRef = await firestore.collection(collectionName).add(data);
    const docSnapshot = await docRef.get();
    return { id: docRef.id, ...docSnapshot.data() };
  } catch (error) {
    throw error;
  }
};

/**
 * Recupera i permessi di subscription filtrati per pagina e componente.
 * Se non vengono forniti filtri, restituisce tutti i permessi.
 * @param {string} [page]
 * @param {string} [component]
 * @returns {Array} Array di permessi.
 */
export const getSubscriptionPermissions = async (page, component) => {
  try {
    let query = firestore.collection(collectionName);
    if (page) {
      query = query.where('page', '==', page);
    }
    if (component) {
      query = query.where('component', '==', component);
    }
    const snapshot = await query.get();
    const permissions = [];
    snapshot.forEach(doc => {
      permissions.push({ id: doc.id, ...doc.data() });
    });
    return permissions;
  } catch (error) {
    throw error;
  }
};

/**
 * Aggiorna un permesso di subscription.
 * @param {string} id - L'id del permesso.
 * @param {Object} updateData - I dati da aggiornare.
 */
export const updateSubscriptionPermission = async (id, updateData) => {
  try {
    const docRef = firestore.collection(collectionName).doc(id);
    await docRef.update(updateData);
  } catch (error) {
    throw error;
  }
};

/**
 * Elimina un permesso di subscription.
 * @param {string} id - L'id del permesso.
 */
export const deleteSubscriptionPermission = async (id) => {
  try {
    const docRef = firestore.collection(collectionName).doc(id);
    await docRef.delete();
  } catch (error) {
    throw error;
  }
};

/**
 * Recupera tutti i permessi di subscription.
 * @returns {Array} Array di permessi.
 */
export const getAllSubscriptionPermissions = async () => {
  try {
    const snapshot = await firestore.collection(collectionName).get();
    const permissions = [];
    snapshot.forEach(doc => {
      permissions.push({ id: doc.id, ...doc.data() });
    });
    return permissions;
  } catch (error) {
    throw error;
  }
};

/**
 * Upsert per un permesso di subscription.
 * Cerca per la combinazione (page, component): se esiste aggiorna, altrimenti crea nuovo.
 * @param {string} page 
 * @param {string} component 
 * @param {Object} permissionsData 
 * @returns {Object} Permesso aggiornato o creato.
 */
export const upsertSubscriptionPermission = async (page, component, permissionsData) => {
  try {
    const querySnapshot = await firestore.collection(collectionName)
      .where('page', '==', page)
      .where('component', '==', component)
      .get();
    if (!querySnapshot.empty) {
      // Presumiamo che esista solo un documento per questa combinazione
      const doc = querySnapshot.docs[0];
      await firestore.collection(collectionName).doc(doc.id).update({ permissions: permissionsData });
      const updatedDoc = await firestore.collection(collectionName).doc(doc.id).get();
      return { id: updatedDoc.id, ...updatedDoc.data() };
    } else {
      const newDocRef = await firestore.collection(collectionName).add({
        page,
        component,
        permissions: permissionsData
      });
      const newDocSnapshot = await newDocRef.get();
      return { id: newDocRef.id, ...newDocSnapshot.data() };
    }
  } catch (error) {
    throw error;
  }
};
