import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home,
  FileText,
  BarChart2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Lock
} from 'lucide-react';
import { FaFireAlt, FaStar, FaGem } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';

// Hook che controlla i permessi di subscription
import { useSubscriptionPermissions } from '../hooks/useSubscriptionPermissions';

export default function Sidebar() {
  const { user } = useAuth();
  const [isCollapsed, setCollapsed] = useState(false);

  const isAdmin = user?.role === 'admin';
  const isCustomer = user?.role === 'customer';

  // Voci base della sidebar
  const baseItems = [
    {
      to: '/',
      label: 'Dashboard',
      icon: Home,
      subscriptionKey: 'Dashboard Link'
    },
    {
      to: '/systems',
      label: 'Analytics',
      icon: BarChart2,
      subscriptionKey: 'Systems Link'
    },
    {
      to: '/alerts',
      label: 'Alerts',
      icon: AlertTriangle,
      subscriptionKey: 'Alerts Link'
    },
    {
      to: '/reports',
      label: 'Reports',
      icon: FileText,
      subscriptionKey: 'Reports Link'
    }
  ];

  // Funzione per renderizzare l'icona dell'abbonamento in base al piano dell'utente
  const renderSubscriptionIcon = (isActive: boolean) => {
    if (!user || !user.subscription) return null;
    const baseIconClasses = "w-5 h-5";
    switch (user.subscription) {
      case 'Essential':
        return (
          <FaFireAlt
            className={`${baseIconClasses} ${
              isActive ? 'text-[#06272b]' : 'text-[#f8485e]'
            } group-hover:text-[#06272b]`}
          />
        );
      case 'Advantage':
        return (
          <FaStar
            className={`${baseIconClasses} ${
              isActive ? 'text-[#06272b]' : 'text-[#eeeeee]'
            } group-hover:text-[#06272b]`}
          />
        );
      case 'Premiere':
        return (
          <FaGem
            className={`${baseIconClasses} ${
              isActive ? 'text-[#06272b]' : 'text-[#22c1d4]'
            } group-hover:text-[#06272b]`}
          />
        );
      default:
        return null;
    }
  };

  return (
    <aside
      className={`
        sticky top-[60px] h-[calc(100vh-60px)]
        ${isCollapsed ? 'w-[90px] px-2' : 'w-[180px]'} 
        bg-[#06272b] shadow-xl rounded-r-3xl 
        transition-width duration-300 ease-in-out
      `}
    >
      {/* Pulsante per collapse/expand */}
      <button
        className={`
          w-full flex p-2 text-[#22c1d4] hover:text-[#eeeeee] 
          ${isCollapsed ? 'justify-center' : 'justify-end'}
        `}
        onClick={() => setCollapsed(!isCollapsed)}
      >
        {isCollapsed ? (
          <ChevronRight className="w-6 h-6" />
        ) : (
          <ChevronLeft className="w-6 h-6" />
        )}
      </button>

      <nav className={`${isCollapsed ? 'items-center' : 'items-start px-2'} py-1 flex flex-col overflow-auto`}>
        {baseItems.map(item => {
          // Controlla i permessi per la voce della sidebar
          const { canAccess, shouldBlur } = useSubscriptionPermissions('Sidebar', item.subscriptionKey);
          if (!canAccess && !shouldBlur) return null;

          const IconComponent = shouldBlur ? Lock : item.icon;
          const iconClasses = shouldBlur ? 'w-5 h-5 text-[#f8485e]' : 'w-5 h-5 text-current';
          const baseLinkClasses = 'group relative flex items-center transition-colors duration-200 ease-in-out my-1';
          const activeClasses = 'bg-[#22c1d4] text-[#06272b]';
          const inactiveClasses = 'text-[#eeeeee] hover:bg-[#22c1d4] hover:text-[#06272b]';
          const collapsedClasses = 'justify-center p-4 rounded-xl';
          const expandedClasses = 'justify-start px-3 py-4 rounded-xl w-full';

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `
                ${baseLinkClasses}
                ${isCollapsed ? collapsedClasses : expandedClasses}
                ${isActive ? activeClasses : inactiveClasses}
              `}
              style={shouldBlur ? { opacity: 0.6 } : {}}
            >
              <IconComponent className={iconClasses} />
              {!isCollapsed && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.3 }}
                  className="font-medium ml-3 whitespace-nowrap"
                >
                  {item.label}
                </motion.span>
              )}
            </NavLink>
          );
        })}

        {/* Voce "Your Subscription" */}
        <NavLink
          to="/your-subscription"
          className={({ isActive }) => {
            const baseLink = 'group relative flex items-center transition-colors duration-200 ease-in-out my-1';
            const activeClasses = 'bg-[#22c1d4] text-[#06272b]';
            const inactiveClasses = 'text-[#eeeeee] hover:bg-[#22c1d4] hover:text-[#06272b]';
            const collapsed = 'justify-center p-4 rounded-xl';
            const expanded = 'justify-start px-3 py-4 rounded-xl w-full';
            return `
              ${baseLink}
              ${isCollapsed ? collapsed : expanded}
              ${isActive ? activeClasses : inactiveClasses}
            `;
          }}
        >
          {({ isActive }) => (
            <>
              {renderSubscriptionIcon(isActive)}
              {!isCollapsed && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                  className="font-medium ml-3 whitespace-nowrap"
                >
                  Subscription
                </motion.span>
              )}
            </>
          )}
        </NavLink>
      </nav>
    </aside>
  );
}
