// src/types/auth.ts

export interface User {
  id: string;
  username: string;
  password?: string;
  role: 'admin' | 'customer' | 'extra' | 'employee' | 'admin_employee';
  company: string;
  email?: string;
  createdAt: string;
  updatedAt: string;

  // Subscription-based
  subscription: 'None' | 'Essential' | 'Advantage' | 'Premiere';
  subscriptionExpires?: string | null;

  // Nuovi campi employee
  parentCustomerId?: string | null;
  permissions?: string[];   // e.g. ['reports', 'analytics', ...]
  visibleCompanies?: string[] | null;
  forcePasswordChange?: boolean;

  // NEW field: flag to indicate if the walkthrough was completed
  walkthroughCompleted?: boolean;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}
