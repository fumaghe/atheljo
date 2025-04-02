// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard/index';
import Companies from './pages/Systems/Companies';
import CompanyDetail from './pages/Systems/CompanyDetail';
import SystemDetail from './pages/Systems/SystemDetail';
import Reports from './pages/Reports/index';
import Analytics from './pages/Analytics/index';
import Settings from './pages/Settings/index';
import Support from './pages/Support/index';
import Documentation from './pages/Support/Documentation'; // Importa Documentation
import MultiStepAuth from './pages/MultiStepAuth'; // Nuovo componente di autenticazione a step
import Admin from './pages/Admin';
import AlertsHistory from './pages/AlertsHistory';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import SubscriptionPermissions from './pages/Permission/SubscriptionPermissions';
import YourSubscription from './pages/Subscription/YourSubscription';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';
import { CompanyProvider } from './context/CompanyContext';
import ManageEmployees from './pages/Customer/ManageEmployees';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Inizializziamo il QueryClient
const queryClient = new QueryClient();

function AppContent() {
  return (
    <Routes>
      {/* Rotte Pubbliche */}
      <Route path="/login" element={<MultiStepAuth />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Rotta principale protetta */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        {/* Contenuto interno di Layout */}
        <Route index element={<Dashboard />} />
        <Route path="systems">
          <Route index element={<Companies />} />
          <Route path="company/:companyName" element={<CompanyDetail />} />
          <Route path=":hostId" element={<SystemDetail />} />
        </Route>
        <Route path="reports" element={<Reports />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="settings" element={<Settings />} />
        <Route
          path="support"
          element={
            <ProtectedRoute>
              <Support />
            </ProtectedRoute>
          }
        />
        {/* Route per Documentation */}
        <Route
          path="documentation"
          element={
            <ProtectedRoute>
              <Documentation />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin"
          element={
            <ProtectedRoute requiredRole="admin">
              <Admin />
            </ProtectedRoute>
          }
        />
        <Route
          path="alerts"
          element={
            <ProtectedRoute>
              <AlertsHistory />
            </ProtectedRoute>
          }
        />
        <Route
          path="subscription-permissions"
          element={
            <ProtectedRoute requiredRole="admin">
              <SubscriptionPermissions />
            </ProtectedRoute>
          }
        />
        <Route
          path="your-subscription"
          element={
            <ProtectedRoute>
              <YourSubscription />
            </ProtectedRoute>
          }
        />
        <Route
          path="customer/employees"
          element={
            <ProtectedRoute requiredRole={['customer', 'admin', 'admin_employee']}>
              <ManageEmployees />
            </ProtectedRoute>
          }
        />
      </Route>
      {/* Catch-all: redireziona alla home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <CompanyProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
        </QueryClientProvider>
      </CompanyProvider>
    </AuthProvider>
  );
}

export default App;
