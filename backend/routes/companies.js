    import express from 'express';
    import firestore from '../firebase.js';

    const router = express.Router();

    /**
     * GET /api/companies
     * Restituisce la lista unica delle aziende presenti in system_data.
     */
    router.get('/', async (req, res) => {
    try {
        const snapshot = await firestore.collection('system_data').get();
        const companiesSet = new Set();

        snapshot.forEach(doc => {
        const data = doc.data();
        if (data.company) companiesSet.add(data.company);
        });

        const companies = Array.from(companiesSet).sort();

        res.json(companies);
    } catch (error) {
        console.error('Error loading companies:', error);
        res.status(500).json({ message: 'Server error' });
    }
    });

    export default router;
