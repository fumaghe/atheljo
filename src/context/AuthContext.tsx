// src/context/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, LoginCredentials } from '../types/auth';

const SESSION_DURATION = 3 * 24 * 60 * 60 * 1000; // 3 giorni

export interface LoginResult {
  success: boolean;
  twoFactorRequired?: boolean;
  userId?: string;
  message?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  isInitializingSession: boolean;
  login: (credentials: LoginCredentials) => Promise<LoginResult>;
  logout: () => void;
  getUsers: () => Promise<User[]>;
  addUser: (user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>) => Promise<User | null>;
  updateUser: (id: string, userData: Partial<User>) => Promise<User | null>;
  deleteUser: (id: string) => Promise<boolean>;
  users: User[];
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isInitializingSession, setIsInitializingSession] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';

  // 1) Carica sessione da localStorage
  useEffect(() => {
    const storedUser = localStorage.getItem('aiopsUser');
    const storedTimestamp = localStorage.getItem('aiopsUserTimestamp');
    if (storedUser && storedTimestamp) {
      try {
        const parsedUser: User = JSON.parse(storedUser);
        const timestamp = parseInt(storedTimestamp, 10);
        const now = Date.now();
        if (now - timestamp < SESSION_DURATION) {
          setUser(parsedUser);
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem('aiopsUser');
          localStorage.removeItem('aiopsUserTimestamp');
        }
      } catch (err) {
        console.error('Error parsing stored user:', err);
        localStorage.removeItem('aiopsUser');
        localStorage.removeItem('aiopsUserTimestamp');
      }
    }
    setIsInitializingSession(false);
  }, []);

  // 2) Salva sessione in localStorage quando user cambia
  useEffect(() => {
    if (isInitializingSession) return;
    if (user && isAuthenticated) {
      localStorage.setItem('aiopsUser', JSON.stringify(user));
      localStorage.setItem('aiopsUserTimestamp', Date.now().toString());
    } else {
      localStorage.removeItem('aiopsUser');
      localStorage.removeItem('aiopsUserTimestamp');
    }
  }, [user, isAuthenticated, isInitializingSession]);

  // 3) Funzione di login
  const login = async (credentials: LoginCredentials): Promise<LoginResult> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.message || 'Invalid credentials');
        setIsLoading(false);
        return { success: false, message: data.message };
      }
      // Se OTP è richiesto
      if (data.twoFactorRequired) {
        setIsLoading(false);
        return { success: false, twoFactorRequired: true, userId: data.userId, message: data.message };
      }
      // Altrimenti login completo
      setUser(data);
      setIsAuthenticated(true);
      setIsLoading(false);
      return { success: true };
    } catch (err) {
      console.error(err);
      setError('Server error during login');
      setIsLoading(false);
      return { success: false, message: 'Server error during login' };
    }
  };

  // 4) Logout
  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    setError(null);
    localStorage.removeItem('aiopsUser');
    localStorage.removeItem('aiopsUserTimestamp');
  };

  // 5) getUsers
  const getUsers = async (): Promise<User[]> => {
    try {
      const response = await fetch(`${API_BASE}/users`);
      if (!response.ok) throw new Error('Failed to fetch users');
      const data = await response.json();
      return data;
    } catch (err) {
      console.error(err);
      return [];
    }
  };

  // 6) addUser
  const addUser = async (userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User | null> => {
    try {
      const response = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.message || 'Failed to add user');
        return null;
      }
      const newUser = await response.json();
      setUsers(prev => [...prev, newUser]);
      return newUser;
    } catch (err) {
      console.error(err);
      setError('Server error during registration');
      return null;
    }
  };

  // 7) updateUser
  const updateUser = async (id: string, userData: Partial<User>): Promise<User | null> => {
    try {
      // Forza la conversione di permissions in array di stringhe
      if (userData.permissions) {
        if (Array.isArray(userData.permissions) && userData.permissions.length > 0) {
          if (typeof userData.permissions[0] === 'object') {
            userData.permissions = userData.permissions.map((p: any) => p.id);
          }
        } else {
          userData.permissions = [];
        }
      }

      const response = await fetch(`${API_BASE}/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.message || 'Failed to update user');
        return null;
      }
      const updatedUser = await response.json();
      setUsers(prev => prev.map(u => (u.id === id ? updatedUser : u)));
      // Se stiamo aggiornando l'utente attualmente loggato
      if (user && user.id === id) {
        setUser({ ...user, ...userData, updatedAt: new Date().toISOString() });
      }
      return updatedUser;
    } catch (err) {
      console.error(err);
      setError('Server error during update');
      return null;
    }
  };

  // 8) deleteUser
  const deleteUser = async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE}/users/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.message || 'Failed to delete user');
        return false;
      }
      setUsers(prev => prev.filter(u => u.id !== id));
      // Se abbiamo cancellato l'utente che è loggato
      if (user && user.id === id) {
        logout();
      }
      return true;
    } catch (err) {
      console.error(err);
      setError('Server error during deletion');
      return false;
    }
  };

  // 9) Carica la lista degli utenti se siamo autenticati
  useEffect(() => {
    if (isAuthenticated) {
      getUsers().then(fetchedUsers => setUsers(fetchedUsers));
    }
  }, [isAuthenticated]);

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isLoading,
    error,
    isInitializingSession,
    login,
    logout,
    getUsers,
    addUser,
    updateUser,
    deleteUser,
    users
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
