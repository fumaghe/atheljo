import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  FaFireAlt, FaStar, FaGem,
  FaCogs, FaHistory, FaBars, FaPuzzlePiece,
  FaChevronDown, FaChevronUp
} from 'react-icons/fa';
import { Home, FileText, BarChart2, AlertTriangle, Clock, List } from 'lucide-react';

export interface SubscriptionPermission {
  page: string;
  component: string;
  permissions: {
    None: 'none' | 'blur' | 'full';
    Essential: 'none' | 'blur' | 'full';
    Advantage: 'none' | 'blur' | 'full';
    Premiere: 'none' | 'blur' | 'full';
  };
}

type SubscriptionLevel = 'Essential' | 'Advantage' | 'Premiere';
type PermissionType = 'none' | 'blur' | 'full';

interface PermissionItem {
  id: string;
  page: string;
  component: string;
}

const ALL_COMPONENTS: { page: string; component: string }[] = [
  // Dashboard
  { page: 'Dashboard', component: 'Alerts Card' },
  { page: 'Dashboard', component: 'Filters' },
  { page: 'Dashboard', component: 'System Statistics' },
  { page: 'Dashboard', component: 'Business Metrics' },
  { page: 'Dashboard', component: 'System Status Chart' },
  { page: 'Dashboard', component: 'System Types Chart' },
  { page: 'Dashboard', component: 'Capacity Distribution Chart' },
  { page: 'Dashboard', component: 'Usage Percentage Trends Chart' },
  { page: 'Dashboard', component: 'Capacity Trends Chart' },

  // Alerts
  { page: 'Alerts', component: 'AlertsList' },
  { page: 'Alerts', component: 'AllAlertsLink' },

  // Reports
  { page: 'Reports', component: 'Generate Report' },
  { page: 'Reports', component: 'History Section' },

  // System
  { page: 'Companies',       component: 'System Health Score' },
  { page: 'CompaniesDetail', component: 'System Status' },
  { page: 'CompaniesDetail', component: 'System Health Score' },

  { page: 'SystemDetail', component: 'Health - Capacity' },
  { page: 'SystemDetail', component: 'Health - Performance' },
  { page: 'SystemDetail', component: 'Health - Telemetry' },
  { page: 'SystemDetail', component: 'Health - Snapshots' },
  { page: 'SystemDetail', component: 'Health - MUP' },
  { page: 'SystemDetail', component: 'Health - Utilization' },
  { page: 'SystemDetail', component: 'HealthScoreInHeader' },

  { page: 'SystemDetail', component: 'Forecast - TimeTo80' },
  { page: 'SystemDetail', component: 'Forecast - TimeTo90' },
  { page: 'SystemDetail', component: 'Forecast - TimeTo100' },

  { page: 'SystemDetail', component: 'Chart - UsageHistory' },
  { page: 'SystemDetail', component: 'Chart - UsageForecast' },

  { page: 'AlertHistory', component: 'Page Access' },
  { page: 'AlertHistory', component: 'White Alerts' },
  { page: 'AlertHistory', component: 'Blue Alerts' },
  { page: 'AlertHistory', component: 'Red Alerts' },

  { page: 'Sidebar', component: 'Dashboard Link' },
  { page: 'Sidebar', component: 'Systems Link' },
  { page: 'Sidebar', component: 'Alerts Link' },
  { page: 'Sidebar', component: 'Reports Link' }
];

// Mappa aggiornata per utilizzare le icone corrette da lucide-react
const pageIcons: Record<string, JSX.Element> = {
  Sidebar: <List size={16} />,
  Dashboard: <Home size={16} />,
  Alerts: <AlertTriangle size={16} />,
  AlertHistory: <Clock size={16} />,
  Companies: <BarChart2 size={16} />,
  CompaniesDetail: <BarChart2 size={16} />,
  SystemDetail: <BarChart2 size={16} />,
  Reports: <FileText size={16} />
};

const getComponentIcon = (componentName: string): JSX.Element => {
  const lower = componentName.toLowerCase();
  if (lower.includes('link')) return <FaPuzzlePiece size={14} />;
  if (lower.includes('chart')) return <FaPuzzlePiece size={14} />;
  if (lower.includes('alert')) return <FaPuzzlePiece size={14} />;
  return <FaPuzzlePiece size={14} />;
};

// Ordine di visualizzazione delle pagine
const pageOrder: string[] = [
  "Sidebar",
  "Dashboard",
  "Alerts",
  "AlertHistory",
  "Companies",
  "CompaniesDetail",
  "SystemDetail",
  "Reports"
];

const SubscriptionPermissions: React.FC = () => {
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [permissions, setPermissions] = useState<SubscriptionPermission[]>([]);
  // Stato per gestire l'espansione/collasso per ogni gruppo (chiave: subscription_level + '_' + page)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const API_BASE = import.meta.env.VITE_API_BASE || '/api';

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      alert('Access denied');
      // eventuale redirezione
    }
  }, [user]);

  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE}/subscription-permissions`);
        if (!res.ok) {
          throw new Error('Failed to fetch subscription permissions');
        }
        const dataFromDB: SubscriptionPermission[] = await res.json();
        const mapKey = (p: SubscriptionPermission) => `${p.page}-${p.component}`;
        const existingMap = new Map<string, SubscriptionPermission>();
        dataFromDB.forEach(p => existingMap.set(mapKey(p), p));
        const merged: SubscriptionPermission[] = ALL_COMPONENTS.map(({ page, component }) => {
          const key = `${page}-${component}`;
          if (existingMap.has(key)) {
            return existingMap.get(key)!;
          }
          return {
            page,
            component,
            permissions: {
              None: 'none',
              Essential: 'none',
              Advantage: 'none',
              Premiere: 'none'
            }
          };
        });

        merged.sort((a, b) => {
          if (a.page === b.page) {
            return a.component.localeCompare(b.component);
          }
          return a.page.localeCompare(b.page);
        });
        setPermissions(merged);
      } catch (error) {
        console.error(error);
        alert('Errore durante il caricamento delle permission.');
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, [API_BASE]);

  const handleItemPermissionChange = (
    subscription: SubscriptionLevel,
    targetKey: string,
    newPermission: PermissionType
  ) => {
    setPermissions(prev =>
      prev.map(p => {
        const key = `${p.page}__${p.component}`;
        if (key === targetKey) {
          return {
            ...p,
            permissions: {
              ...p.permissions,
              [subscription]: newPermission
            }
          };
        }
        return p;
      })
    );
  };

  const handleBulkPermissionChange = (
    subscription: SubscriptionLevel,
    page: string,
    newPermission: PermissionType
  ) => {
    setPermissions(prev =>
      prev.map(p => {
        if (p.page === page) {
          return {
            ...p,
            permissions: {
              ...p.permissions,
              [subscription]: newPermission
            }
          };
        }
        return p;
      })
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const finalArray = permissions;
      const res = await fetch(`${API_BASE}/subscription-permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalArray)
      });
      if (!res.ok) {
        throw new Error('Error updating subscription permissions');
      }
      alert('Permissions updated successfully!');
    } catch (error) {
      console.error(error);
      alert('Errore nel salvataggio delle permission.');
    } finally {
      setSaving(false);
    }
  };

  const toggleGroup = (subscription: SubscriptionLevel, page: string) => {
    const key = `${subscription}_${page}`;
    setCollapsedGroups(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const subscriptionInfos: Record<SubscriptionLevel, {
    label: string;
    icon: JSX.Element;
    cardClass: string;
    textClass: string;
    highlightColor: string;
  }> = {
    Essential: {
      label: 'Essential',
      icon: <FaFireAlt size={20} />,
      cardClass: 'border-2 border-[#f8485e] bg-[#f8485e]/10',
      textClass: 'text-[#f8485e]',
      highlightColor: '#f8485e'
    },
    Advantage: {
      label: 'Advantage',
      icon: <FaStar size={20} />,
      cardClass: 'border-2 border-[#eeeee] bg-[#eeeeee]/10',
      textClass: 'text-white',
      highlightColor: '#eeeeee'
    },
    Premiere: {
      label: 'Premiere',
      icon: <FaGem size={20} />,
      cardClass: 'border-2 border-[#22c1d4] bg-[#22c1d4]/10',
      textClass: 'text-[#22c1d4]',
      highlightColor: '#22c1d4'
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-xl">Loading subscription permissions...</div>;
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Subscription Permissions</h1>
      {/* Grid responsive: 1 colonna per default, 2 colonne su piccoli schermi, 3 colonne su schermi medi e grandi */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {(Object.keys(subscriptionInfos) as SubscriptionLevel[]).map(sub => {
          const info = subscriptionInfos[sub];
          // Raggruppa per pagina
          const grouped: Record<string, SubscriptionPermission[]> = {};
          permissions.forEach(p => {
            if (!grouped[p.page]) grouped[p.page] = [];
            grouped[p.page].push(p);
          });
          return (
            <div
              key={sub}
              className={`rounded-lg shadow p-4 ${info.cardClass} min-h-[500px] transition-all duration-300`}
            >
              <div className={`flex items-center mb-4 text-xl font-bold ${info.textClass}`}>
                <span className="mr-2">{info.icon}</span>
                <span>{info.label}</span>
              </div>
              <div className="space-y-4">
                {pageOrder.filter(page => grouped[page]).map(page => {
                  const items = grouped[page];
                  const groupKey = `${sub}_${page}`;
                  const isCollapsed = collapsedGroups[groupKey] ?? false;
                  return (
                    <div key={page} className="border rounded bg-[#06272b] p-3">
                      <h3 
                        className="flex items-center justify-between font-semibold uppercase text-sm cursor-pointer"
                        onClick={() => toggleGroup(sub, page)}
                      >
                        <span className="flex items-center gap-1">
                          {pageIcons[page] || <FaPuzzlePiece size={16} />}
                          {page}
                        </span>
                        <span>
                          {isCollapsed ? <FaChevronDown size={14}/> : <FaChevronUp size={14} />}
                        </span>
                      </h3>
                      {!isCollapsed && (
                        <>
                          <div className="flex flex-wrap gap-1 mt-2 mb-2">
                            {(['none','blur','full'] as PermissionType[]).map(pt => (
                              <button
                                key={pt}
                                onClick={() => handleBulkPermissionChange(sub, page, pt)}
                                className={`
                                  px-2 py-1 rounded border text-xs font-semibold transition-colors duration-300
                                  ${pt === items[0].permissions[sub]
                                    ? `bg-[${info.highlightColor}] text-[#06272b] border-transparent`
                                    : 'bg-[#06272b] text-[#eeeeee] border-[#eeeeee]'
                                  }
                                `}
                              >
                                {pt.toUpperCase()}
                              </button>
                            ))}
                          </div>
                          <div className="space-y-2">
                            {items.map(item => {
                              const key = `${item.page}__${item.component}`;
                              return (
                                <div
                                  key={key}
                                  className={`p-3 rounded border border-[${info.highlightColor}]/20 bg-[${info.highlightColor}]/10 text-[#eeeeee] transition-all duration-300`}
                                >
                                  <div className="flex items-center text-sm font-medium mb-1 gap-1">
                                    {getComponentIcon(item.component)}
                                    <span>{item.component}</span>
                                  </div>
                                  <div className="flex flex-wrap gap-1 text-xs">
                                    {(['none','blur','full'] as PermissionType[]).map(pt => {
                                      const isActive = item.permissions[sub] === pt;
                                      return (
                                        <button
                                          key={pt}
                                          onClick={() => handleItemPermissionChange(sub, key, pt)}
                                          className={`
                                            px-2 py-1 rounded border text-xs font-semibold transition-colors duration-300
                                            ${isActive
                                              ? `bg-[${info.highlightColor}] text-[#06272b] border-transparent`
                                              : 'bg-[#06272b] text-[#eeeeee] border-[#eeeeee]'
                                            }
                                          `}
                                        >
                                          {pt.toUpperCase()}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-right mt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-green-600 text-white rounded shadow"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
};

export default SubscriptionPermissions;
