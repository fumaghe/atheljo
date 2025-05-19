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

/** Extended alert interface, now includes unit_id, company and pool */
export interface Alert {
  unit_id: string;
  hostid: string;
  pool: string;
  company: string;
  message: string;
  date: string;
  type:
    | 'forecast'
    | 'suddenIncrease'
    | 'suddenDecrease'
    | 'inactivity'
    | 'telemetryInactive'
    | 'highGrowth';
  importance: 'white' | 'blue' | 'red';
}

/** The system_data doc structure */
interface SystemData {
  unit_id: string;      // used to unify by (unit_id, hostid, pool)
  hostid: string;
  pool: string;
  company: string;
  sending_telemetry: boolean;
  type?: string;
}

/** The props for this Alerts component */
interface AlertsProps {
  filters: {
    company: string;
    type: string;
    pool: string;
    telemetry: string;
    timeRange: string;
  };
}

/** Any doc from 'analytics_forecast' might look like: */
interface ForecastDoc {
  hostid: string;
  pool: string;
  date: string;              // e.g. '2023-10-01T12:00:00'
  perc_used?: string | number;
  time_to_80?: string | number;
  time_to_90?: string | number;
  time_to_100?: string | number;
  growth_rate?: string | number;
}

/** Any doc from 'capacity_trends' might look like: */
interface CapacityDoc {
  hostid: string;
  pool: string;
  date: string;              // e.g. '2023-10-01T12:00:00'
  used?: number;
  perc_used?: number;
}

const Alerts: React.FC<AlertsProps> = ({ filters }) => {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  /**
   * We'll store system_data in a map keyed by: (hostid + "::" + pool)
   * Because one hostid might appear in multiple pools, or multiple hostids for same unit.
   */
  const [systemMap, setSystemMap] = useState<Map<string, SystemData>>(new Map());

  // Subscription permissions
  const { canAccess: alertsListCanAccess, shouldBlur: alertsListShouldBlur } =
    useSubscriptionPermissions('Alerts', 'AlertsList');
  const { canAccess: allAlertsLinkCanAccess, shouldBlur: allAlertsLinkShouldBlur } =
    useSubscriptionPermissions('Alerts', 'AllAlertsLink');

  // ==========================
  // 1) LOAD system_data in a map keyed by (hostid + "::" + pool)
  // ==========================
  useEffect(() => {
    async function loadSystemMap() {
      try {
        const snap = await getDocs(collection(firestore, 'system_data'));
        const map = new Map<string, SystemData>();

        snap.forEach((doc: QueryDocumentSnapshot) => {
          const d = doc.data() as any; // we refine to SystemData below
          const sys: SystemData = {
            unit_id: d.unit_id || '',
            hostid: d.hostid || '',
            pool: d.pool || '',
            company: d.company || '',
            sending_telemetry:
              typeof d.sending_telemetry === 'boolean'
                ? d.sending_telemetry
                : String(d.sending_telemetry).toLowerCase() === 'true',
            type: d.type
          };
          // The key is "hostid::pool"
          const key = `${sys.hostid}::${sys.pool}`;
          map.set(key, sys);
        });
        setSystemMap(map);
      } catch (error) {
        console.error('Error loading systems for alerts:', error);
      }
    }
    loadSystemMap();
  }, []);

  // ==========================
  // 2) LOAD Alerts from forecast & capacity, generate list
  // ==========================
  useEffect(() => {
    async function loadAlerts() {
      setLoading(true);
      try {
        // 2A) Build a list of "allowed" (hostid, pool) pairs based on user role & filters
        const allowedKeys = new Set<string>();

        // We'll iterate over systemMap entries
        systemMap.forEach((sys, key) => {
          if (!user) return; // if no user, skip

          // Role checks
          if (user.role === 'admin') {
            // admin sees everything
          } else if (user.role === 'admin_employee') {
            // must be in visibleCompanies or 'all'
            const vis = user.visibleCompanies || [];
            if (vis.length > 0 && !vis.includes(sys.company)) {
              return;
            }
          } else if (user.role === 'employee' || user.role === 'customer') {
            // normal employee
            if (sys.company !== user.company) {
              return;
            }
          }
          else {
            return;
          }
          // Filter by company, type, pool
          if (filters.company !== 'all' && sys.company !== filters.company) {
            return;
          }
          if (filters.type !== 'all' && sys.type !== filters.type) {
            return;
          }
          if (filters.pool !== 'all' && sys.pool !== filters.pool) {
            return;
          }
          // Telemetry filter
          if (filters.telemetry !== 'all') {
            const shouldBeActive = filters.telemetry === 'active';
            if (sys.sending_telemetry !== shouldBeActive) return;
          }

          allowedKeys.add(key); // e.g. 'hostid123::poolABC'
        });

        if (allowedKeys.size === 0) {
          // No systems pass the filter => no alerts
          setAlerts([]);
          setLoading(false);
          return;
        }

        // 2B) time range => gather docs only after the cutoff
        const days = parseInt(filters.timeRange);
        const cutoffISO = subDays(new Date(), days).toISOString();

        // 2C) load a small portion of 'analytics_forecast' & 'capacity_trends'
        const forecastRef = collection(firestore, 'analytics_forecast');
        const capacityRef = collection(firestore, 'capacity_trends');

        const [forecastSnap, capacitySnap] = await Promise.all([
          getDocs(query(forecastRef, orderBy('date', 'desc'), limit(500))),
          getDocs(query(capacityRef, orderBy('date', 'desc'), limit(500)))
        ]);

        // 2D) Filter them by (hostid+pool) in allowedKeys & date >= cutoff
        const forecastData: ForecastDoc[] = [];
        const capacityData: CapacityDoc[] = [];
        const cutoffDate = subDays(new Date(), parseInt(filters.timeRange));

        forecastSnap.forEach((doc) => {
          const f = doc.data() as ForecastDoc;
          const key = `${f.hostid || ''}::${f.pool || ''}`;
          if (
            allowedKeys.has(key) &&
            new Date(f.date).getTime() >= cutoffDate.getTime()
          ) {
            forecastData.push(f);
          }
        });

        capacitySnap.forEach((doc) => {
          const c = doc.data() as CapacityDoc;
          const key = `${c.hostid || ''}::${c.pool || ''}`;
          if (
            allowedKeys.has(key) &&
            new Date(c.date).getTime() >= cutoffDate.getTime()
          ) {
            capacityData.push(c);
          }
        });

        // 2E) Generate alerts
        const nowISO = new Date().toISOString();
        const alertList: Alert[] = [];

        // Forecast-based
        forecastData.forEach((rec) => {
          const key = `${rec.hostid}::${rec.pool}`;
          const sys = systemMap.get(key);
          if (!sys) return; // skip if no system found
          const unit_id = sys.unit_id || '';
          const hostid = sys.hostid;
          const pool = sys.pool;
          const company = sys.company;

          const perc_used = Number(rec.perc_used ?? 0);
          const t80 = Number(rec.time_to_80 ?? 9999);
          const t90 = Number(rec.time_to_90 ?? 9999);
          const t100 = Number(rec.time_to_100 ?? 9999);
          const growth = Number(rec.growth_rate ?? 0);

          // Already above 80% usage
          if (perc_used >= 80) {
            alertList.push({
              unit_id,
              hostid,
              pool,
              company,
              message: `Already above 80% usage (currently ${perc_used.toFixed(1)}%).`,
              date: nowISO,
              type: 'forecast',
              importance: perc_used >= 90 ? 'red' : 'blue'
            });
          }

          // time_to_80
          if (t80 <= 30 && perc_used < 80) {
            alertList.push({
              unit_id,
              hostid,
              pool,
              company,
              message: `Expected to reach 80% usage in ${t80} days.`,
              date: nowISO,
              type: 'forecast',
              importance: 'white'
            });
          }
          // time_to_90
          if (t90 <= 30 && perc_used < 90) {
            alertList.push({
              unit_id,
              hostid,
              pool,
              company,
              message: `Expected to reach 90% usage in ${t90} days.`,
              date: nowISO,
              type: 'forecast',
              importance: 'blue'
            });
          }
          // time_to_100
          if (t100 <= 30) {
            alertList.push({
              unit_id,
              hostid,
              pool,
              company,
              message: `Expected to reach 100% usage in ${t100} days.`,
              date: nowISO,
              type: 'forecast',
              importance: 'red'
            });
          }

          // growth_rate
          if (growth > 3.0) {
            alertList.push({
              unit_id,
              hostid,
              pool,
              company,
              message: `High growth rate: ${growth.toFixed(1)}% per day.`,
              date: nowISO,
              type: 'highGrowth',
              importance: growth > 5 ? 'red' : 'blue'
            });
          }
        });

        // Capacity-based
        // Group capacity docs by (hostid+pool)
        const groupedCap: Record<string, CapacityDoc[]> = {};
        capacityData.forEach((rec) => {
          const key = `${rec.hostid}::${rec.pool}`;
          if (!groupedCap[key]) groupedCap[key] = [];
          groupedCap[key].push(rec);
        });
        Object.entries(groupedCap).forEach(([key, arr]) => {
          // sort by date desc
          arr.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          // if 2+ docs exist, check sudden changes
          if (arr.length >= 2) {
            const [last, secondLast] = arr;
            const lastPerc = Number(last.perc_used ?? 0);
            const secondPerc = Number(secondLast.perc_used ?? 0);
            const diff = lastPerc - secondPerc;
            if (Math.abs(diff) >= 5) {
              const sys = systemMap.get(key);
              if (sys) {
                alertList.push({
                  unit_id: sys.unit_id,
                  hostid: sys.hostid,
                  pool: sys.pool,
                  company: sys.company,
                  message: `Sudden ${diff > 0 ? 'increase' : 'decrease'} in used%: ${diff.toFixed(1)}%`,
                  date: last.date,
                  type: diff > 0 ? 'suddenIncrease' : 'suddenDecrease',
                  importance: Math.abs(diff) >= 10 ? 'red' : 'blue'
                });
              }
            }
          }
          // inactivity => check if last doc is older than 24h
          const hoursSinceLast = (Date.now() - new Date(arr[0].date).getTime()) / 36e5;
          if (hoursSinceLast >= 24) {
            const sys = systemMap.get(key);
            if (sys) {
              alertList.push({
                unit_id: sys.unit_id,
                hostid: sys.hostid,
                pool: sys.pool,
                company: sys.company,
                message: `No capacity update in the last ${Math.floor(hoursSinceLast)} hours.`,
                date: arr[0].date,
                type: 'inactivity',
                importance: hoursSinceLast >= 48 ? 'red' : 'blue'
              });
            }
          }
        });

        // Telemetry inactive
        // We already know which keys are allowed => check if sysMap says sending_telemetry is false
        allowedKeys.forEach((key) => {
          const sys = systemMap.get(key);
          if (sys && !sys.sending_telemetry) {
            alertList.push({
              unit_id: sys.unit_id,
              hostid: sys.hostid,
              pool: sys.pool,
              company: sys.company,
              message: 'Telemetry is inactive: system is not sending data.',
              date: new Date().toISOString(),
              type: 'telemetryInactive',
              importance: 'red'
            });
          }
        });

        // 2F) Sort + limit to 4 newest
        alertList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setAlerts(alertList.slice(0, 4));
      } catch (err) {
        console.error('Error building alerts:', err);
      } finally {
        setLoading(false);
      }
    }

    loadAlerts();
  }, [user, filters, systemMap]);

  // For the alert icon
  function getAlertIcon(type: string) {
    switch (type) {
      case 'forecast':          return <Calendar className="w-4 h-4" />;
      case 'suddenIncrease':    return <TrendingUp className="w-4 h-4" />;
      case 'suddenDecrease':    return <TrendingDown className="w-4 h-4" />;
      case 'inactivity':        return <AlertTriangle className="w-4 h-4" />;
      case 'telemetryInactive': return <XCircle className="w-4 h-4" />;
      case 'highGrowth':        return <Activity className="w-4 h-4" />;
      default:                  return <AlertCircle className="w-4 h-4" />;
    }
  }

  // ==========================
  // RENDER
  // ==========================
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
            {alerts.map((alert, idx) => {
              if (alertsListShouldBlur) {
                // Show blurred
                return (
                  <div key={`${alert.hostid}-${alert.pool}-${idx}`} className="relative">
                    <div
                      className={`p-3 h-16 bg-[#06272b] rounded-lg flex flex-col gap-2 border-2 ${
                        alert.importance === 'red'
                          ? 'border-[#f8485e]'
                          : alert.importance === 'blue'
                          ? 'border-[#22c1d4]'
                          : 'border-[#ffffff]'
                      } blur-sm pointer-events-none`}
                    ></div>
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center">
                      <Lock className="w-5 h-5 text-white mb-1" />
                      <span className="text-[0.7rem] text-white">
                        Upgrade to see this Alert
                      </span>
                    </div>
                  </div>
                );
              } else {
                // Show normal
                return (
                  <div
                    key={`${alert.hostid}-${alert.pool}-${idx}`}
                    className={`p-3 bg-[#06272b] rounded-lg flex flex-col gap-2 border-2 ${
                      alert.importance === 'red'
                        ? 'border-[#f8485e]'
                        : alert.importance === 'blue'
                        ? 'border-[#22c1d4]'
                        : 'border-[#ffffff]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      {/* Mostriamo unit_id - hostid in alto */}
                      <div className="flex flex-col text-xs leading-tight text-[#eeeeee]">
                        <span className="font-bold">
                          {alert.unit_id} - {alert.hostid}
                        </span>
                        <span className="opacity-75">
                          Company: {alert.company || 'N/A'}
                        </span>
                      </div>
                      {getAlertIcon(alert.type)}
                    </div>
                    <p className="text-xs text-[#eeeeee]">
                      {alert.message}
                    </p>
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
        <div
          className={`mt-3 text-right ${
            allAlertsLinkShouldBlur ? 'blur-sm pointer-events-none' : ''
          }`}
        >
          <Link to="/alerts" className="text-xs text-[#22c1d4] hover:underline">
            View all alerts →
          </Link>
        </div>
      )}
    </div>
  );
};

export default Alerts;
