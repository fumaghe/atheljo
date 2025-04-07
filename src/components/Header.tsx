import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  User,
  LogOut,
  CheckCircle,
  XCircle,
  Loader2,
  Users,
  Settings,
  HelpCircle,
  Info,
  UserPlus,
  Shield
} from 'lucide-react'; // Aggiunta l'icona Shield per Permissions
import { FaFireAlt, FaStar, FaGem } from 'react-icons/fa';
import storvixLogo from '../assets/images/STORViXTM_WHITE.png';
import xLogo from '../assets/images/X_White.png';

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Stato per il pop-up demo
  const [showDemoInfo, setShowDemoInfo] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleUpdateData = async () => {
    try {
      setIsUpdating(true);
      setUpdateStatus('idle');
      const apiBase = import.meta.env.VITE_API_BASE || '/api';
      const response = await fetch(`${apiBase}/update_data`, { method: 'POST' });
      if (!response.ok) {
        throw new Error('Update failed');
      }
      setUpdateStatus('success');
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error updating data:', error);
      setUpdateStatus('error');
    } finally {
      setIsUpdating(false);
    }
  };

  const renderSubscriptionIcon = () => {
    if (!user || !user.subscription) return null;
    switch (user.subscription) {
      case 'Essential':
        return <FaFireAlt className="w-4 h-4" style={{ color: '#f8485e' }} />;
      case 'Advantage':
        return <FaStar className="w-4 h-4" style={{ color: '#eeeeee' }} />;
      case 'Premiere':
        return <FaGem className="w-4 h-4" style={{ color: '#22c1d4' }} />;
      default:
        return null;
    }
  };

  return (
    <header
      className="
        sticky top-0 z-50
        bg-[#06272b]
        border-b border-[#22c1d4]/20
        px-6
        flex
        items-center
        justify-between
        flex-wrap
        min-h-[60px]
      "
    >
      {/* Logo a sinistra */}
      <div className="flex items-center gap-4 py-2">
        <img
          src={storvixLogo}
          alt="StorViX Logo"
          className="hidden md:block h-8 object-contain"
        />
        <img
          src={xLogo}
          alt="StorViX Logo Small"
          className="block md:hidden h-8 object-contain"
        />
      </div>

      {/* Sezione centrale: messaggio demo */}
      <div className="flex-1 flex justify-center">
        <span className="text-sm text-[#eeeeee]/80">
          You are using a demo version.{' '}
          <button
            className="underline text-[#22c1d4]"
            onClick={() => setShowDemoInfo(true)}
          >
            Know more
          </button>
        </span>
      </div>

      {/* Contenuti a destra */}
      <div className="flex items-center gap-4 py-2">
        <div className="flex items-center gap-3">
          {lastUpdate ? (
            <span className="text-sm text-[#eeeeee]/60">
              Last update: {lastUpdate.toLocaleTimeString()}
            </span>
          ) : (
            <span className="text-sm text-[#eeeeee]/60">No updates yet</span>
          )}
          <button
            onClick={handleUpdateData}
            disabled={isUpdating}
            className="
              relative
              px-4 py-2
              bg-[#0b3c43]
              rounded-lg
              text-[#22c1d4]
              hover:bg-[#0b3c43]/80
              transition-colors
              disabled:opacity-50
              flex items-center gap-2
            "
          >
            {isUpdating ? 'Updating...' : 'Update Data'}
            {isUpdating && <Loader2 className="w-5 h-5 animate-spin" />}
          </button>
          {updateStatus === 'success' && !isUpdating && (
            <CheckCircle className="w-5 h-5 text-green-400" />
          )}
          {updateStatus === 'error' && !isUpdating && (
            <XCircle className="w-5 h-5 text-red-400" />
          )}
        </div>

        {/* Icona utente e menu */}
        <div className="relative">
          <div
            className="flex items-center gap-2 cursor-pointer hover:text-[#22c1d4]"
            onClick={() => setShowUserMenu(!showUserMenu)}
          >
            {renderSubscriptionIcon()}
            <User className="w-5 h-5" />
          </div>
          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-[#0b3c43] rounded-lg shadow-lg py-1 z-10">
              {user && (
                <div className="px-4 py-2 text-sm text-[#eeeeee] border-b border-[#22c1d4]/10">
                  {user.username}
                </div>
              )}
              {/* Voce Sub-Accounts */}
              {(user?.role === 'customer' || user?.role === 'admin') && (
                <button
                  onClick={() => {
                    navigate('/customer/employees');
                    setShowUserMenu(false);
                  }}
                  className="block w-full text-left px-4 py-2 hover:bg-[#22c1d4]/10 transition-colors"
                >
                  <UserPlus className="w-4 h-4 inline-block mr-2" />
                  Sub-Accounts
                </button>
              )}
              {/* Voce Admin */}
              {user?.role === 'admin' && (
                <button
                  onClick={() => {
                    navigate('/admin');
                    setShowUserMenu(false);
                  }}
                  className="block w-full text-left px-4 py-2 hover:bg-[#22c1d4]/10 transition-colors"
                >
                  <Users className="w-4 h-4 inline-block mr-2" />
                  Admin
                </button>
              )}
              {/* Voce Permissions con icona Shield */}
              {user?.role === 'admin' && (
                <button
                  onClick={() => {
                    navigate('/subscription-permissions');
                    setShowUserMenu(false);
                  }}
                  className="block w-full text-left px-4 py-2 hover:bg-[#22c1d4]/10 transition-colors"
                >
                  <Shield className="w-4 h-4 inline-block mr-2" />
                  Permissions
                </button>
              )}
              {/* Voce Settings */}
              <button
                onClick={() => {
                  navigate('/settings');
                  setShowUserMenu(false);
                }}
                className="block w-full text-left px-4 py-2 hover:bg-[#22c1d4]/10 transition-colors"
              >
                <Settings className="w-4 h-4 inline-block mr-2" />
                Settings
              </button>
              {/* Voce Support */}
              <button
                onClick={() => {
                  navigate('/support');
                  setShowUserMenu(false);
                }}
                className="block w-full text-left px-4 py-2 hover:bg-[#22c1d4]/10 transition-colors"
              >
                <HelpCircle className="w-4 h-4 inline-block mr-2" />
                Support
              </button>
              {/* Voce Sign Out */}
              <button
                onClick={handleLogout}
                className="
                  flex items-center gap-2
                  w-full text-left
                  px-4 py-2
                  text-[#f8485e]
                  hover:bg-[#f8485e]/10
                  transition-colors
                "
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Pop-up Demo */}
      {showDemoInfo && (
        <div
          className="
            fixed inset-0 z-50
            flex items-center justify-center
          "
        >
          {/* Overlay scuro */}
          <div
            className="absolute inset-0 bg-black bg-opacity-50"
            onClick={() => setShowDemoInfo(false)}
          ></div>

          {/* Box del pop-up */}
          <div className="relative bg-[#06272b] p-6 rounded-md shadow-md w-[90%] max-w-xl text-[#eeeeee]">
            <button
              className="absolute top-2 right-2 text-[#eeeeee]/50 hover:text-[#eeeeee]"
              onClick={() => setShowDemoInfo(false)}
            >
              ✕
            </button>
            <div className="flex items-center mb-4">
              <Info className="w-6 h-6 text-[#22c1d4] mr-2" />
              <h2 className="text-xl font-bold">Demo Information</h2>
            </div>
            <p className="mb-4 leading-relaxed">
              This is a demo version of the Avalon dashboard, currently under
              <span className="font-bold text-[#f8485e]"> active development</span>.
            </p>
            <p className="mb-4 leading-relaxed">
              In this preview, you can explore key features such as the
              <span className="font-bold text-[#22c1d4]"> company analytics section</span>, the
              <span className="font-bold text-[#22c1d4]"> initial dashboard layout</span>, and the
              <span className="font-bold text-[#22c1d4]"> ability to create user accounts</span>.
              Please note that
              <span className="font-bold text-[#f8485e]"> forecasting capabilities</span> and other
              <span className="font-bold text-[#f8485e]"> advanced functionalities</span> are not
              yet included in this version.
            </p>
            <p className="text-xs italic text-right text-[#eeeeee]/70">
              — The Data Science Team
            </p>
            <div className="mt-6 text-right">
              <button
                className="
                  bg-[#22c1d4]
                  text-[#06272b]
                  font-semibold
                  px-4 py-2
                  rounded-md
                  hover:bg-[#22c1d4]/80
                  transition-colors
                "
                onClick={() => setShowDemoInfo(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
