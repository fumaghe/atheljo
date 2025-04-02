import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './context/AuthContext';
import { CompanyProvider } from './context/CompanyContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <CompanyProvider>
        <App />
      </CompanyProvider>
    </AuthProvider>
  </StrictMode>
);