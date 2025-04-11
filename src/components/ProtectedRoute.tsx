// src/components/ProtectedRoute.tsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NoPermission from '../pages/NoPermission';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'customer' | 'extra' | 'employee' | 'admin_employee' | Array<'admin' | 'customer' | 'extra' | 'employee' | 'admin_employee'>;
  requiredPermission?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRole,
  requiredPermission
}) => {
  const { isAuthenticated, user, isInitializingSession } = useAuth();
  const location = useLocation();

  if (isInitializingSession) {
    return (
      <div style={{ color: '#eee', textAlign: 'center', padding: '2rem' }}>
        Loading session...
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredRole && (
      (Array.isArray(requiredRole) && !requiredRole.includes(user.role)) ||
      (!Array.isArray(requiredRole) && user.role !== requiredRole)
    )) {
    return <NoPermission />;
  }

  if (requiredPermission && !(user.permissions?.includes(requiredPermission))) {
    return <NoPermission />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
