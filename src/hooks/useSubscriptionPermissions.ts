import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

interface SubscriptionPermission {
  page: string;
  component: string;
  permissions: {
    None: 'none' | 'blur' | 'full';
    Essential: 'none' | 'blur' | 'full';
    Advantage: 'none' | 'blur' | 'full';
    Premiere: 'none' | 'blur' | 'full';
  };
}

interface UseSubscriptionPermissionsResult {
  canAccess: boolean;
  shouldBlur: boolean;
}

// Funzione helper per controllare i permessi per employee e admin_employee
const checkEmployeePermission = (
  page: string,
  component: string,
  user: any,
  currentLevel: 'none' | 'blur' | 'full'
): 'none' | 'blur' | 'full' => {
  // Costruiamo la chiave combinata in modo robusto (trim e lowercase)
  const permissionKey = `${page}__${component}`.toLowerCase().trim();
  const hasPermission = user.permissions?.some(
    (p: string) => p.toLowerCase().trim() === permissionKey
  );
  return hasPermission ? currentLevel : 'none';
};

export const useSubscriptionPermissions = (
  page: string,
  component: string
): UseSubscriptionPermissionsResult => {
  const { user } = useAuth();
  const [permissionLevel, setPermissionLevel] = useState<'none' | 'blur' | 'full'>('none');

  // Recuperiamo la base URL dal .env (vite)
  const API_BASE = import.meta.env.VITE_API_BASE || '/api';

  useEffect(() => {
    if (user?.role === 'admin') {
      // Se l'utente è admin, impostiamo direttamente il livello a "full"
      setPermissionLevel('full');
    } else {
      const fetchPermissions = async () => {
        try {
          const res = await fetch(`${API_BASE}/subscription-permissions`);
          if (!res.ok) {
            throw new Error('Failed to fetch subscription permissions');
          }
          const data: SubscriptionPermission[] = await res.json();
          // Cerchiamo il record di permesso in base a page e component
          const perm = data.find(p => p.page === page && p.component === component);
          if (perm && user) {
            let level = perm.permissions[user.subscription];
            // Per employee e admin_employee verifichiamo la presenza della chiave combinata
            if (user.role === 'employee' || user.role === 'admin_employee') {
              level = checkEmployeePermission(page, component, user, level);
            }
            setPermissionLevel(level);
          } else {
            setPermissionLevel('none');
          }
        } catch (error) {
          console.error('Error fetching subscription permissions:', error);
          setPermissionLevel('none');
        }
      };

      fetchPermissions();
    }
  }, [page, component, user, API_BASE]);

  const canAccess = permissionLevel === 'full';
  const shouldBlur = permissionLevel === 'blur';

  return { canAccess, shouldBlur };
};
