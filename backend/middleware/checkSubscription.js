export const checkSubscription = async (req, res, next) => {
    // Se l'utente è admin, bypassa il controllo
    if (req.user && req.user.role === 'admin') return next();
  
    if (req.user && req.user.subscriptionExpires) {
      const now = Date.now();
      const expiry = new Date(req.user.subscriptionExpires).getTime();
      if (now > expiry) {
        // Abbonamento scaduto: impostiamo a 'None'
        req.user.subscription = 'None';
        // Aggiorna anche il database se necessario
        await req.user.save();
      }
    }
    next();
  };
  