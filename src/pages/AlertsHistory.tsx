import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import {
  Calendar,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  XCircle,
  Activity,
  Lock
} from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSubscriptionPermissions } from '../hooks/useSubscriptionPermissions';
import firestore from '../firebaseClient';
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  QueryDocumentSnapshot
} from 'firebase/firestore';
import NoPermission from '../pages/NoPermission';

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
}

// Cache degli alert per 20 minuti
let cachedAlertsHistory: Alert[] | null = null;
let alertsHistoryCacheTimestamp: number | null = null;
const ALERT_HISTORY_CACHE_DURATION = 20 * 60 * 1000;

const AlertHistory: React.FC = () => {
  // Chiamate a hook in ordine costante
  const { user, isAuthenticated, isInitializingSession } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [systemMap, setSystemMap] = useState<Map<string, SystemData>>(new Map());

  // Filtri locali
  const [filterType, setFilterType] = useState<string>('all');
  const [filterHost, setFilterHost] = useState<string>('all');

  // Stato per il caricamento progressivo
  const [visibleCount, setVisibleCount] = useState<number>(5);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  // Custom hook per le permission
  const { canAccess: pageCan, shouldBlur: pageBlur } =
    useSubscriptionPermissions('AlertHistory', 'Page Access');
  const { canAccess: whiteCan, shouldBlur: whiteBlur } =
    useSubscriptionPermissions('AlertHistory', 'White Alerts');
  const { canAccess: blueCan, shouldBlur: blueBlur } =
    useSubscriptionPermissions('AlertHistory', 'Blue Alerts');
  const { canAccess: redCan, shouldBlur: redBlur }  =
    useSubscriptionPermissions('AlertHistory', 'Red Alerts');

  // Effetto per caricare la mappa dei sistemi
  useEffect(() => {
    const loadSystems = async () => {
      try {
        const q = query(collection(firestore, 'system_data'));
        const querySnapshot = await getDocs(q);
        const map = new Map<string, SystemData>();
        querySnapshot.docs.forEach((doc: QueryDocumentSnapshot) => {
          const sys = doc.data() as SystemData;
          map.set(sys.hostid, {
            hostid: sys.hostid,
            company: sys.company,
            sending_telemetry:
              typeof sys.sending_telemetry === 'boolean'
                ? sys.sending_telemetry
                : String(sys.sending_telemetry).toLowerCase() === 'true'
          });
        });
        setSystemMap(map);
      } catch (err) {
        console.error('Error loading systems for alert history:', err);
      }
    };
    loadSystems();
  }, []);

  // Effetto per caricare ed elaborare gli alert
  useEffect(() => {
    const loadAlerts = async () => {
      try {
        setLoading(true);
        const now = Date.now();
        let rawAlerts: Alert[] = [];

        // Usa la cache se valida
        if (
          alertsHistoryCacheTimestamp &&
          now - alertsHistoryCacheTimestamp < ALERT_HISTORY_CACHE_DURATION &&
          cachedAlertsHistory
        ) {
          rawAlerts = cachedAlertsHistory;
        } else {
          const forecastQuery = query(
            collection(firestore, 'analytics_forecast'),
            orderBy('date', 'desc'),
            limit(20)
          );
          const capacityQuery = query(
            collection(firestore, 'capacity_trends'),
            orderBy('date', 'desc'),
            limit(20)
          );
          const [forecastSnapshot, capacitySnapshot] = await Promise.all([
            getDocs(forecastQuery),
            getDocs(capacityQuery)
          ]);
          const forecastData = forecastSnapshot.docs.map(doc => doc.data());
          const capacityData = capacitySnapshot.docs.map(doc => doc.data());

          const alertList: Alert[] = [];
          const nowISO = new Date().toISOString();

          // ALERTS DI FORECAST
          forecastData.forEach((record: any) => {
            const systemId = record.hostid;
            const systemCapacityRecords = capacityData.filter((r: any) => r.hostid === systemId);
            systemCapacityRecords.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const latestRecord = systemCapacityRecords[0];
            const percUsed = latestRecord ? parseFloat(latestRecord.perc_used) : 0;
            const timeTo80 = parseFloat(record.time_to_80);
            const timeTo90 = parseFloat(record.time_to_90);
            const timeTo100 = parseFloat(record.time_to_100);
            const growthRate = parseFloat(record.growth_rate);

            if (percUsed >= 80) {
              alertList.push({
                hostid: systemId,
                message: `Already above 80% usage (currently ${percUsed.toFixed(1)}%).`,
                date: nowISO,
                type: 'forecast',
                importance: percUsed >= 90 ? 'red' : 'blue'
              });
            } else if (percUsed < 80 && timeTo80 <= 30) {
              alertList.push({
                hostid: systemId,
                message: `Expected to reach 80% usage in ${timeTo80} days.`,
                date: nowISO,
                type: 'forecast',
                importance: 'white'
              });
            }
            if (percUsed < 90 && timeTo90 <= 30) {
              alertList.push({
                hostid: systemId,
                message: `Expected to reach 90% usage in ${timeTo90} days.`,
                date: nowISO,
                type: 'forecast',
                importance: 'blue'
              });
            }
            if (timeTo100 <= 30) {
              alertList.push({
                hostid: systemId,
                message: `Expected to reach 100% usage in ${timeTo100} days.`,
                date: nowISO,
                type: 'forecast',
                importance: 'red'
              });
            }
            if (growthRate > 3.0) {
              alertList.push({
                hostid: systemId,
                message: `High growth rate detected: ${growthRate}% per day.`,
                date: nowISO,
                type: 'highGrowth',
                importance: growthRate > 5 ? 'red' : 'blue'
              });
            }
          });

          // ALERTS DI CAPACITY TRENDS
          const capacityBySystem: Record<string, any[]> = {};
          capacityData.forEach((record: any) => {
            const hostid = record.hostid;
            if (!capacityBySystem[hostid]) capacityBySystem[hostid] = [];
            capacityBySystem[hostid].push(record);
          });

          Object.keys(capacityBySystem).forEach(systemId => {
            const records = capacityBySystem[systemId].sort(
              (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
            );
            if (records.length >= 2) {
              const secondLast = records[records.length - 2];
              const last = records[records.length - 1];
              const diffUsed = parseFloat(last.perc_used) - parseFloat(secondLast.perc_used);
              if (Math.abs(diffUsed) >= 5) {
                alertList.push({
                  hostid: systemId,
                  message:
                    diffUsed > 0
                      ? `Sudden increase in used percentage: +${diffUsed.toFixed(1)}%`
                      : `Sudden decrease in used percentage: -${Math.abs(diffUsed).toFixed(1)}%`,
                  date: last.date,
                  type: diffUsed > 0 ? 'suddenIncrease' : 'suddenDecrease',
                  importance: Math.abs(diffUsed) >= 10 ? 'red' : 'blue'
                });
              }
              const diffSnap = parseFloat(last.perc_snap) - parseFloat(secondLast.perc_snap);
              if (Math.abs(diffSnap) >= 5) {
                alertList.push({
                  hostid: systemId,
                  message:
                    diffSnap > 0
                      ? `Sudden increase in snap percentage: +${diffSnap.toFixed(1)}%`
                      : `Sudden decrease in snap percentage: -${Math.abs(diffSnap).toFixed(1)}%`,
                  date: last.date,
                  type: diffSnap > 0 ? 'suddenIncrease' : 'suddenDecrease',
                  importance: Math.abs(diffSnap) >= 10 ? 'red' : 'blue'
                });
              }
            }
          });

          // ALERTS DI INACTIVITY
          Object.keys(capacityBySystem).forEach(systemId => {
            const records = capacityBySystem[systemId].sort(
              (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
            );
            if (records.length > 0) {
              const latestRecordDate = new Date(records[0].date);
              const nowDate = new Date();
              const diffHours = (nowDate.getTime() - latestRecordDate.getTime()) / (1000 * 60 * 60);
              if (diffHours >= 24) {
                alertList.push({
                  hostid: systemId,
                  message: `No capacity update received in the last ${Math.floor(diffHours)} hours.`,
                  date: records[0].date,
                  type: 'inactivity',
                  importance: diffHours >= 48 ? 'red' : 'blue'
                });
              }
            }
          });

          // ALERTS DI TELEMETRY INACTIVE (dalla systemMap)
          systemMap.forEach((sys, systemId) => {
            if (!sys.sending_telemetry) {
              alertList.push({
                hostid: systemId,
                message: 'Telemetry inactive: system not sending data.',
                date: new Date().toISOString(),
                type: 'telemetryInactive',
                importance: 'red'
              });
            }
          });

          // Ordina gli alert per data decrescente e salva in cache
          alertList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          rawAlerts = alertList;
          cachedAlertsHistory = rawAlerts;
          alertsHistoryCacheTimestamp = now;
        }

        // Filtra gli alert in base alle informazioni dell'utente e alla systemMap
        const finalList = rawAlerts.filter(alert => {
          const sys = systemMap.get(alert.hostid);
          if (!sys) return false;
          if (user!.role === 'admin_employee') {
            if (
              user!.visibleCompanies &&
              !user!.visibleCompanies.includes('all') &&
              !user!.visibleCompanies.includes(sys.company)
            ) {
              return false;
            }
          } else if (user!.role !== 'admin' && sys.company !== user!.company) {
            return false;
          }
          return true;
        });
        setAlerts(finalList);
      } catch (err) {
        console.error('Error loading alerts:', err);
      } finally {
        setLoading(false);
      }
    };

    loadAlerts();
  }, [systemMap, user]);

  // Funzione per scegliere l'icona in base al tipo di alert
  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'forecast': return <Calendar className="w-5 h-5" />;
      case 'suddenIncrease': return <TrendingUp className="w-5 h-5" />;
      case 'suddenDecrease': return <TrendingDown className="w-5 h-5" />;
      case 'inactivity': return <AlertTriangle className="w-5 h-5" />;
      case 'telemetryInactive': return <XCircle className="w-5 h-5" />;
      case 'highGrowth': return <Activity className="w-5 h-5" />;
      default: return <Calendar className="w-5 h-5" />;
    }
  };

  // Filtra e impagina gli alert
  const filteredAlerts = alerts
    .filter(alert => filterType === 'all' || alert.type === filterType)
    .filter(alert => filterHost === 'all' || alert.hostid === filterHost);
  const displayedAlerts = filteredAlerts.slice(0, visibleCount);

  const loadMoreAlerts = () => {
    setLoadingMore(true);
    setTimeout(() => {
      setVisibleCount(prev => prev + 10);
      setLoadingMore(false);
    }, 500);
  };

  // Render condizionale: tutte le chiamate ai hook vengono eseguite sempre
  return (
    <>
      {isInitializingSession ? (
        <div style={{ color: '#eee', textAlign: 'center', padding: '2rem' }}>
          Loading session...
        </div>
      ) : !isAuthenticated || !user ? (
        <Navigate to="/login" replace />
      ) : ( (user.role === 'employee' || user.role === 'admin_employee') && !pageCan && !pageBlur ) ? (
        <NoPermission />
      ) : (
        <div className="relative bg-[#0b3c43] rounded-lg p-4 shadow-lg my-4">
          {pageBlur && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center">
              <div className="absolute inset-0 backdrop-blur-sm"></div>
              <div className="relative z-60 flex flex-col items-center justify-center">
                <Lock className="w-12 h-12 text-white mb-4" />
                <span className="text-white text-2xl font-bold">
                  Upgrade your subscription to see the Alerts History
                </span>
              </div>
            </div>
          )}
          <div className={`${pageBlur ? 'blur-sm pointer-events-none' : ''}`}>
            <h2 className="text-xl font-semibold mb-4">Alert History</h2>
            <div className="flex gap-4 mb-4">
              <div>
                <label className="block text-sm text-[#eeeeee] mb-1">Filter by Type:</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="bg-[#06272b] text-[#eeeeee] p-2 rounded"
                >
                  <option value="all">All</option>
                  <option value="forecast">Forecast</option>
                  <option value="suddenIncrease">Sudden Increase</option>
                  <option value="suddenDecrease">Sudden Decrease</option>
                  <option value="inactivity">Inactivity</option>
                  <option value="telemetryInactive">Telemetry Inactive</option>
                  <option value="highGrowth">High Growth</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-[#eeeeee] mb-1">Filter by Host:</label>
                <select
                  value={filterHost}
                  onChange={(e) => setFilterHost(e.target.value)}
                  className="bg-[#06272b] text-[#eeeeee] p-2 rounded"
                >
                  <option value="all">All</option>
                  {Array.from(new Set(alerts.map(a => a.hostid))).map(host => (
                    <option key={host} value={host}>{host}</option>
                  ))}
                </select>
              </div>
            </div>
            {loading ? (
              <div className="text-center text-[#eeeeee]">Loading alert history...</div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4">
                  {displayedAlerts.map((alert, idx) => {
                    const { canAccess, shouldBlur } = (() => {
                      switch (alert.importance) {
                        case 'white': return { canAccess: whiteCan, shouldBlur: whiteBlur };
                        case 'blue':  return { canAccess: blueCan, shouldBlur: blueBlur };
                        case 'red':   return { canAccess: redCan, shouldBlur: redBlur };
                        default:      return { canAccess: true, shouldBlur: false };
                      }
                    })();

                    if (!canAccess && !shouldBlur) return null;
                    if (shouldBlur) {
                      return (
                        <div key={`${alert.hostid}-${idx}`} className="relative">
                          <div className={`p-4 h-20 bg-[#06272b] rounded-lg flex flex-col gap-2 border-2 ${
                            alert.importance === 'red'
                              ? 'border-[#f8485e]'
                              : alert.importance === 'blue'
                              ? 'border-[#22c1d4]'
                              : 'border-[#ffffff]'
                          } blur-sm pointer-events-none`}>
                          </div>
                          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center">
                            <Lock className="w-6 h-6 text-white mb-2" />
                            <span className="text-white text-sm">
                              Upgrade your subscription to see this Alert
                            </span>
                          </div>
                        </div>
                      );
                    } else {
                      return (
                        <div
                          key={`${alert.hostid}-${idx}`}
                          className={`p-4 bg-[#06272b] rounded-lg flex flex-col gap-2 border-2 ${
                            alert.importance === 'red'
                              ? 'border-[#f8485e]'
                              : alert.importance === 'blue'
                              ? 'border-[#22c1d4]'
                              : 'border-[#ffffff]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-lg font-bold text-[#eeeeee]">{alert.hostid}</span>
                            {getAlertIcon(alert.type)}
                          </div>
                          <p className="text-sm text-[#eeeeee]">{alert.message}</p>
                          <span className="text-xs text-[#eeeeee]/60">
                            {format(new Date(alert.date), 'MMM dd, yyyy')}
                          </span>
                        </div>
                      );
                    }
                  })}
                </div>
                {visibleCount < filteredAlerts.length && (
                  <div className="flex justify-center mt-4">
                    <button
                      onClick={loadMoreAlerts}
                      className="flex items-center gap-2 px-4 py-2 bg-[#0b3c43] text-[#22c1d4] rounded-lg hover:bg-[#0b3c43]/80 transition-colors"
                    >
                      {loadingMore ? (
                        <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-white"></div>
                      ) : (
                        'Load More'
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default AlertHistory;
