// backend/routes/users.js
import express from 'express';
import bcrypt from 'bcryptjs';
import { getUserById, updateUser, deleteUser } from '../models/User.js';
import firestore from '../firebase.js';

const router = express.Router();

// Get all users (per gestione admin)
router.get('/', async (req, res) => {
  try {
    const usersSnapshot = await firestore.collection('users').get();
    const users = [];
    usersSnapshot.forEach(doc => {
      users.push({ id: doc.id, ...doc.data() });
    });
    res.json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a user
router.put('/:id', async (req, res) => {
  try {
    const { oldPassword, newPassword, ...rest } = req.body;
    const user = await getUserById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (newPassword) {
      const isMatch = await bcrypt.compare(oldPassword, user.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Old password is incorrect' });
      }
      // Imposta anche il flag a false, dato che la password è stata cambiata
      rest.password = newPassword;
      rest.forcePasswordChange = false;
    }
    await updateUser(req.params.id, rest);
    const updatedUser = await getUserById(req.params.id);
    res.json(updatedUser);
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a user
router.delete('/:id', async (req, res) => {
  try {
    await deleteUser(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
