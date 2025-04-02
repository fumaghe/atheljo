// src/pages/Dashboard/Alerts.tsx
import React, { useEffect, useState } from 'react';
import { format, subDays } from 'date-fns';
import { Link } from 'react-router-dom';
import {
  Calendar,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  XCircle,
  Activity,
  AlertCircle,
  Lock
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSubscriptionPermissions } from '../../hooks/useSubscriptionPermissions';
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  QueryDocumentSnapshot
} from 'firebase/firestore';
import firestore from '../../firebaseClient';

export interface Alert {
  hostid: string;
  message: string;
  date: string;
  type: 'forecast' | 'suddenIncrease' | 'suddenDecrease' | 'inactivity' | 'telemetryInactive' | 'highGrowth';
  importance: 'white' | 'blue' | 'red';
}

interface SystemData {
  hostid: string;
  company: string;
  sending_telemetry: boolean;
  type?: string;
  pool?: string;
}

interface AlertsProps {
  filters: {
    company: string;
    type: string;
    pool: string;
    telemetry: string;
    timeRange: string;
  };
}

// Cache globale per gli alert (durata: 20 minuti)
let cachedAlerts: Alert[] | null = null;
let alertsCacheTimestamp: number | null = null;
const ALERT_CACHE_DURATION = 20 * 60 * 1000;

const Alerts: React.FC<AlertsProps> = ({ filters }) => {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [systemMap, setSystemMap] = useState<Map<string, SystemData>>(new Map());

  // Subscription permissions
  const { canAccess: alertsListCanAccess, shouldBlur: alertsListShouldBlur } =
    useSubscriptionPermissions('Alerts', 'AlertsList');
  const { canAccess: allAlertsLinkCanAccess, shouldBlur: allAlertsLinkShouldBlur } =
    useSubscriptionPermissions('Alerts', 'AllAlertsLink');

  // Carica la mappa dei sistemi dalla collection "system_data"
  useEffect(() => {
    const loadSystemMap = async () => {
      try {
        const querySnapshot = await getDocs(collection(firestore, 'system_data'));
        const map = new Map<string, SystemData>();
        querySnapshot.docs.forEach((doc: QueryDocumentSnapshot) => {
          const sys = doc.data() as SystemData;
          map.set(sys.hostid, {
            hostid: sys.hostid,
            company: sys.company,
            sending_telemetry:
              typeof sys.sending_telemetry === 'boolean'
                ? sys.sending_telemetry
                : String(sys.sending_telemetry).toLowerCase() === 'true',
            type: sys.type,
            pool: sys.pool
          });
        });
        setSystemMap(map);
      } catch (error) {
        console.error('Error loading systems for alerts:', error);
      }
    };
    loadSystemMap();
  }, []);

  useEffect(() => {
    const loadAlerts = async () => {
      setLoading(true);
      try {
        const forecastCollection = collection(firestore, 'analytics_forecast');
        const capacityCollection = collection(firestore, 'capacity_trends');

        // Applica i filtri: oltre a quelli impostati dall'utente,
        // viene controllato l'accesso in base al ruolo e alle visibleCompanies.
        const systems = Array.from(systemMap.values()).filter(sys => {
          if (user) {
            const isAdmin = user?.role === 'admin';
            const isAdminEmployee = user?.role === 'admin_employee';
            if (isAdmin) return true;
            if (isAdminEmployee) {
              return user.visibleCompanies?.includes('all') || user.visibleCompanies?.includes(sys.company);
            }
            // dipendente standard
            return sys.company === user.company;
          }
          return false;
        }).filter(sys => {
          if (filters.company !== 'all' && sys.company !== filters.company) return false;
          if (filters.type !== 'all' && sys.type !== filters.type) return false;
          if (filters.pool !== 'all' && sys.pool !== filters.pool) return false;
          if (filters.telemetry !== 'all') {
            const shouldBeActive = filters.telemetry === 'active';
            if (sys.sending_telemetry !== shouldBeActive) return false;
          }
          return true;
        });

        const filteredHostIds = systems.map(sys => sys.hostid);

        // Limite temporale
        const days = parseInt(filters.timeRange);
        const cutoffDate = subDays(new Date(), days).toISOString();

        // Query per analytics_forecast
        const forecastQuery = query(
          forecastCollection,
          orderBy('date', 'desc'),
          limit(100)
        );

        // Query per capacity_trends
        const capacityQuery = query(
          capacityCollection,
          orderBy('date', 'desc'),
          limit(100)
        );

        const [forecastSnapshot, capacitySnapshot] = await Promise.all([
          getDocs(forecastQuery),
          getDocs(capacityQuery)
        ]);

        const forecastData = forecastSnapshot.docs
          .map(doc => doc.data())
          .filter(record => filteredHostIds.includes(record.hostid) && record.date >= cutoffDate);

        const capacityData = capacitySnapshot.docs
          .map(doc => doc.data())
          .filter(record => filteredHostIds.includes(record.hostid) && record.date >= cutoffDate);

        const alertList: Alert[] = [];
        const nowISO = new Date().toISOString();

        // Genera alerts da forecast
        forecastData.forEach(record => {
          const percUsed = parseFloat(record.perc_used) || 0;

          if (percUsed >= 80) {
            alertList.push({
              hostid: record.hostid,
              message: `Already above 80% usage (currently ${percUsed.toFixed(1)}%).`,
              date: nowISO,
              type: 'forecast',
              importance: percUsed >= 90 ? 'red' : 'blue'
            });
          }

          if (parseFloat(record.time_to_80) <= 30 && percUsed < 80) {
            alertList.push({
              hostid: record.hostid,
              message: `Expected to reach 80% usage in ${record.time_to_80} days.`,
              date: nowISO,
              type: 'forecast',
              importance: 'white'
            });
          }

          if (parseFloat(record.time_to_90) <= 30 && percUsed < 90) {
            alertList.push({
              hostid: record.hostid,
              message: `Expected to reach 90% usage in ${record.time_to_90} days.`,
              date: nowISO,
              type: 'forecast',
              importance: 'blue'
            });
          }

          if (parseFloat(record.time_to_100) <= 30) {
            alertList.push({
              hostid: record.hostid,
              message: `Expected to reach 100% usage in ${record.time_to_100} days.`,
              date: nowISO,
              type: 'forecast',
              importance: 'red'
            });
          }

          if (parseFloat(record.growth_rate) > 3.0) {
            alertList.push({
              hostid: record.hostid,
              message: `High growth rate detected: ${parseFloat(record.growth_rate).toFixed(1)}% per day.`,
              date: nowISO,
              type: 'highGrowth',
              importance: parseFloat(record.growth_rate) > 5 ? 'red' : 'blue'
            });
          }
        });

        // Genera alerts da capacity trends
        const groupedCapacity = capacityData.reduce((acc, curr) => {
          if (!acc[curr.hostid]) acc[curr.hostid] = [];
          acc[curr.hostid].push(curr);
          return acc;
        }, {} as Record<string, any[]>);

        Object.values(groupedCapacity).forEach(records => {
          records.sort((a: { date: string }, b: { date: string }) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
          );
          if (records.length >= 2) {
            const [last, secondLast] = records;
            const diffUsed = parseFloat(last.perc_used) - parseFloat(secondLast.perc_used);
            if (Math.abs(diffUsed) >= 5) {
              alertList.push({
                hostid: last.hostid,
                message: `Sudden ${diffUsed > 0 ? 'increase' : 'decrease'} in used percentage: ${diffUsed.toFixed(1)}%`,
                date: last.date,
                type: diffUsed > 0 ? 'suddenIncrease' : 'suddenDecrease',
                importance: Math.abs(diffUsed) >= 10 ? 'red' : 'blue'
              });
            }
          }

          // Inactivity Alert
          const hoursSinceUpdate = (new Date().getTime() - new Date(records[0].date).getTime()) / (1000 * 60 * 60);
          if (hoursSinceUpdate >= 24) {
            alertList.push({
              hostid: records[0].hostid,
              message: `No capacity update received in the last ${Math.floor(hoursSinceUpdate)} hours.`,
              date: records[0].date,
              type: 'inactivity',
              importance: hoursSinceUpdate >= 48 ? 'red' : 'blue'
            });
          }
        });

        // Telemetry inactive alerts
        systems.forEach(sys => {
          if (!sys.sending_telemetry) {
            alertList.push({
              hostid: sys.hostid,
              message: 'Telemetry inactive: system not sending data.',
              date: nowISO,
              type: 'telemetryInactive',
              importance: 'red'
            });
          }
        });

        // Ordina gli alert per data e mostra solo i 4 più recenti
        alertList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setAlerts(alertList.slice(0, 4));

      } catch (error) {
        console.error('Error loading alerts:', error);
      } finally {
        setLoading(false);
      }
    };

    loadAlerts();
  }, [user, filters, systemMap]);

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'forecast':
        return <Calendar className="w-4 h-4" />;
      case 'suddenIncrease':
        return <TrendingUp className="w-4 h-4" />;
      case 'suddenDecrease':
        return <TrendingDown className="w-4 h-4" />;
      case 'inactivity':
        return <AlertTriangle className="w-4 h-4" />;
      case 'telemetryInactive':
        return <XCircle className="w-4 h-4" />;
      case 'highGrowth':
        return <Activity className="w-4 h-4" />;
      default:
        return <Calendar className="w-4 h-4" />;
    }
  };

  return (
    <div className="bg-[#0b3c43] rounded-lg p-3 shadow-lg my-4">
      <h2 className="text-lg font-semibold mb-3 text-[#f8485e] flex items-center gap-2">
        <AlertCircle className="h-5 w-5 text-[#22c1d4]" />
        Alerts
      </h2>

      {loading ? (
        <div className="text-center text-[#eeeeee]">Loading alerts...</div>
      ) : alerts.length === 0 ? (
        <div className="text-center text-[#eeeeee]">No alerts to display.</div>
      ) : (
        (alertsListCanAccess || alertsListShouldBlur) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 relative">
            {alerts.map((alert, index) => {
              if (alertsListShouldBlur) {
                return (
                  <div key={`${alert.hostid}-${index}`} className="relative">
                    <div className={`p-3 h-16 bg-[#06272b] rounded-lg flex flex-col gap-2 border-2 ${
                      alert.importance === 'red'
                        ? 'border-[#f8485e]'
                        : alert.importance === 'blue'
                        ? 'border-[#22c1d4]'
                        : 'border-[#ffffff]'
                    } blur-sm pointer-events-none`}>
                    </div>
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center">
                      <Lock className="w-5 h-5 text-white mb-2" />
                      <span className="text-[0.7rem] text-white">
                        Upgrade your subscription to see this Alert
                      </span>
                    </div>
                  </div>
                );
              } else {
                return (
                  <div
                    key={`${alert.hostid}-${index}`}
                    className={`p-3 bg-[#06272b] rounded-lg flex flex-col gap-2 border-2 ${
                      alert.importance === 'red'
                        ? 'border-[#f8485e]'
                        : alert.importance === 'blue'
                        ? 'border-[#22c1d4]'
                        : 'border-[#ffffff]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-base font-bold text-[#eeeeee]">{alert.hostid}</span>
                        {systemMap.get(alert.hostid) && (
                          <span className="text-[0.65rem] text-[#eeeeee] opacity-80">
                            {systemMap.get(alert.hostid)?.company}
                          </span>
                        )}
                      </div>
                      {getAlertIcon(alert.type)}
                    </div>
                    <p className="text-xs text-[#eeeeee]">{alert.message}</p>
                    <span className="text-[0.65rem] text-[#eeeeee]/60">
                      {format(new Date(alert.date), 'MMM dd, yyyy')}
                    </span>
                  </div>
                );
              }
            })}
          </div>
        )
      )}

      {(user?.role === 'admin' || allAlertsLinkCanAccess) && (
        <div className={`mt-3 text-right ${allAlertsLinkShouldBlur ? 'blur-sm pointer-events-none' : ''}`}>
          <Link to="/alerts" className="text-xs text-[#22c1d4] hover:underline">
            View all alerts →
          </Link>
        </div>
      )}
    </div>
  );
};

export default Alerts;
