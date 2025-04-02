// backend/routes/employees.js
import express from 'express';
import { createUser, updateUser } from '../models/User.js';
import bcrypt from 'bcryptjs';
// Importa il default export da firebase.js
import firestore from '../firebase.js';

const router = express.Router();

/**
 * Middleware per simulare l'autenticazione.
 * Nota: Abbiamo modificato il campo _id in id, in quanto Firestore usa id.
 */
function mockRequireAuth(req, res, next) {
  if (!req.user) {
    req.user = {
      id: 'fakeAdminId', // modificato da _id a id
      role: 'admin',
      permissions: ['reports', 'analytics', 'dashboard', 'settings'],
      company: 'AiOPS',
      // Per testing, puoi anche impostare visibleCompanies, es.:
      // visibleCompanies: ['all'] oppure ['CompanyA', 'CompanyB']
    };
  }
  next();
}

/**
 * GET /api/employees
 * - Se admin: restituisce TUTTI gli utenti con role 'employee' o 'admin_employee'
 * - Se admin_employee: restituisce gli employee relativi alle company visibili.
 *   Se visibleCompanies include 'all', allora non viene filtrato per company.
 * - Se customer: restituisce solo i propri employee
 */
router.get('/', mockRequireAuth, async (req, res) => {
  try {
    const { user: currentUser } = req;
    if (!currentUser) return res.status(401).json({ message: 'Not authenticated' });

    let query = firestore.collection('users');

    if (currentUser.role === 'admin') {
      query = query.where('role', 'in', ['employee', 'admin_employee']);
    } else if (currentUser.role === 'admin_employee') {
      if (currentUser.visibleCompanies && !currentUser.visibleCompanies.includes('all')) {
        query = query.where('company', 'in', currentUser.visibleCompanies);
      }
      query = query.where('role', '==', 'employee');
    } else if (currentUser.role === 'customer') {
      query = query.where('role', '==', 'employee')
                   .where('parentCustomerId', '==', currentUser.id);
    } else {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const snapshot = await query.get();
    const employees = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return res.json(employees);
  } catch (err) {
    console.error('Error fetching employees:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/employees
 * - Crea un nuovo utente con role = 'employee'
 * - Se l'utente che crea è un ADMIN, può impostare company e parentCustomerId a piacere.
 * - Se l'utente è un CUSTOMER, forza company e parentCustomerId uguali a quelli dell'utente.
 */
router.post('/', mockRequireAuth, async (req, res) => {
  const currentUser = req.user;
  if (!currentUser) return res.status(401).json({ message: 'Not authenticated' });

  const { username, password, company, parentCustomerId, permissions, role, visibleCompanies } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password required' });
  }

  let newEmployeeData = { username, password };

  if (currentUser.role === 'admin') {
    if (!['employee', 'admin_employee'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
  
    newEmployeeData.role = role;
    newEmployeeData.company = company || 'N/A';
    newEmployeeData.parentCustomerId = parentCustomerId || null;
    newEmployeeData.permissions = permissions.filter(p => p !== 'admin' && p !== 'permissions');
  
    // Qui è OK così
    if (['employee', 'admin_employee'].includes(role)) {
      newEmployeeData.visibleCompanies = visibleCompanies && visibleCompanies.includes('all')
        ? ['all'] // <-- salva ['all'] invece di null
        : visibleCompanies || [];
    }
  } else if (currentUser.role === 'customer') {
    newEmployeeData = {
      ...newEmployeeData,
      role: 'employee',
      company: currentUser.company,
      parentCustomerId: currentUser.id,
      permissions: permissions.filter(p => currentUser.permissions.includes(p))
    };
  } else {
    return res.status(403).json({ message: 'Forbidden' });
  }

  // Usa il metodo createUser già implementato per Firestore
  const newEmployee = await createUser(newEmployeeData);
  res.status(201).json(newEmployee);
});

/**
 * PUT /api/employees/:id
 * Aggiorna un employee esistente (username, password, permissions, ecc.)
 * - Recupera il documento da Firestore e usa il metodo updateUser per salvare le modifiche.
 */
router.put('/:id', mockRequireAuth, async (req, res) => {
  try {
    const currentUser = req.user;
    if (!currentUser) return res.status(401).json({ message: 'Not authenticated' });

    const { id } = req.params;
    const { username, newPassword, permissions } = req.body;

    // Recupera l'employee da Firestore
    const doc = await firestore.collection('users').doc(id).get();
    if (!doc.exists || doc.data().role !== 'employee') {
      return res.status(404).json({ message: 'Employee not found' });
    }
    const employee = { id: doc.id, ...doc.data() };

    // Verifica autorizzazione
    if (currentUser.role === 'customer' && employee.parentCustomerId !== currentUser.id) {
      return res.status(403).json({ message: 'Forbidden' });
    } else if (currentUser.role !== 'admin' && currentUser.role !== 'customer') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    // Prepara i dati da aggiornare
    let dataToUpdate = {};
    if (username) dataToUpdate.username = username;
    if (newPassword) dataToUpdate.password = newPassword;

    // Semplificazione: convertiamo sempre le permissions in array di stringhe
    dataToUpdate.permissions = permissions?.map((p) =>
      typeof p === 'object' ? p.id : p
    ) || [];

    await updateUser(id, dataToUpdate);
    // Recupera il documento aggiornato
    const updatedDoc = await firestore.collection('users').doc(id).get();
    const updatedEmployee = { id: updatedDoc.id, ...updatedDoc.data() };
    return res.json(updatedEmployee);
  } catch (err) {
    console.error('Error updating employee:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * DELETE /api/employees/:id
 * Elimina un employee esistente utilizzando Firestore.
 */
router.delete('/:id', mockRequireAuth, async (req, res) => {
  try {
    const currentUser = req.user;
    if (!currentUser) return res.status(401).json({ message: 'Not authenticated' });

    const { id } = req.params;
    const doc = await firestore.collection('users').doc(id).get();
    if (!doc.exists || doc.data().role !== 'employee') {
      return res.status(404).json({ message: 'Employee not found' });
    }
    const employee = { id: doc.id, ...doc.data() };

    if (currentUser.role === 'customer' && employee.parentCustomerId !== currentUser.id) {
      return res.status(403).json({ message: 'Forbidden' });
    } else if (currentUser.role !== 'admin' && currentUser.role !== 'customer') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    await firestore.collection('users').doc(id).delete();
    return res.json({ message: 'Employee deleted successfully' });
  } catch (err) {
    console.error('Error deleting employee:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;
