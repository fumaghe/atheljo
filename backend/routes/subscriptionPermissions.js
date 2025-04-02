// backend/routes/subscriptionPermissions.js
import express from 'express';
import { getAllSubscriptionPermissions, upsertSubscriptionPermission } from '../models/SubscriptionPermission.js';

const router = express.Router();

// GET: recupera tutti i permessi
router.get('/', async (req, res) => {
  try {
    const permissions = await getAllSubscriptionPermissions();
    res.json(permissions);
  } catch (err) {
    console.error('Error fetching subscription permissions:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT: aggiorna i permessi per più combinazioni (page + component) in un'unica chiamata
router.put('/', async (req, res) => {
  try {
    const updates = req.body; // Dovrebbe essere un array di { page, component, permissions }
    if (!Array.isArray(updates)) {
      return res.status(400).json({ message: 'Body must be an array of permissions' });
    }
    const results = [];
    for (const item of updates) {
      const { page, component, permissions } = item;
      if (!page || !component || !permissions) {
        continue; // Salta eventuali elementi mancanti di campi richiesti
      }
      const updated = await upsertSubscriptionPermission(page, component, permissions);
      results.push(updated);
    }
    res.json(results);
  } catch (err) {
    console.error('Error updating subscription permissions:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
