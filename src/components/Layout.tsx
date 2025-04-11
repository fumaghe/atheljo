import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import JoyrideTour from './JoyrideTour';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { user } = useAuth();
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    // Mostra il tour solo se l'utente è autenticato e NON ha completato il walkthrough
    if (user && !user.walkthroughCompleted) {
      setShowTour(true);
    }
  }, [user]);

  return (
    <div className="min-h-screen bg-[#06272b] text-[#eeeeee] font-montserrat relative">
      <Header />
      <div className="flex">
        <Sidebar />
        <main id="main-content" className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
      {showTour && <JoyrideTour onFinish={() => setShowTour(false)} />}
    </div>
  );
}
