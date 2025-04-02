// backend/middleware/checkEmployeePermission.js
export const checkEmployeePermission = (requiredPermission) => {
    return (req, res, next) => {
      // Se l'utente non è un employee, salta il controllo
      if (!req.user || req.user.role !== 'employee') {
        return next();
      }
  
      // Se l'employee non ha il campo permissions o non include la permission richiesta
      if (!Array.isArray(req.user.permissions) || !req.user.permissions.includes(requiredPermission)) {
        return res.status(403).json({ message: 'Access forbidden: insufficient permission' });
      }
  
      next();
    };
  };
  