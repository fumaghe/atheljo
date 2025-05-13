/* ------------------------------------------------------------------
   src/pages/AlertsHistory.tsx
   ------------------------------------------------------------------ */
import React, { useEffect, useMemo, useState } from 'react';
import {
  QueryDocumentSnapshot,
  DocumentData,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
} from 'firebase/firestore';
import {
  useQuery,
  useInfiniteQuery,
  InfiniteData,
} from '@tanstack/react-query';
import {
  Calendar,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  XCircle,
  Activity,
  Filter,
  Bell,
} from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';

import firestore from '../firebaseClient';
import { useAuth } from '../context/AuthContext';
import NoPermission from './NoPermission';
import { Navigate } from 'react-router-dom';

/* ----------------------------- TYPES ----------------------------- */
type AlertType =
  | 'forecast'
  | 'suddenIncrease'
  | 'suddenDecrease'
  | 'inactivity'
  | 'telemetryInactive'
  | 'highGrowth';

type AlertLevel = 'white' | 'blue' | 'red';

interface Alert {
  id: string;
  unit_id: string;
  pool: string;
  company: string;
  message: string;
  date: string; // ISO
  type: AlertType;
  importance: AlertLevel;
}

interface SystemData {
  hostid: string;
  unit_id: string;
  pool: string;
  company: string;
  sending_telemetry: boolean;
}

interface CapacityDoc {
  hostid: string;
  date: string;
  perc_used: string | number;
  perc_snap: string | number;
}

interface ForecastDoc {
  hostid: string;
  date: string;
  time_to_80: string | number;
  time_to_90: string | number;
  time_to_100: string | number;
  growth_rate: string | number;
}

interface AlertPage {
  alerts: Alert[];
  lastDoc?: QueryDocumentSnapshot<DocumentData>;
}

/* ----------------------- DATA HELPERS --------------------------- */
const fetchSystems = async () => {
  const snap = await getDocs(collection(firestore, 'system_data'));
  const map = new Map<string, SystemData>();
  snap.forEach(d => {
    const s = d.data() as SystemData;
    map.set(s.hostid, {
      ...s,
      sending_telemetry:
        typeof s.sending_telemetry === 'boolean'
          ? s.sending_telemetry
          : String(s.sending_telemetry).toLowerCase() === 'true',
    });
  });
  return map;
};

const generateAlerts = (
  systems: Map<string, SystemData>,
  capacity: CapacityDoc[],
  forecast: ForecastDoc[],
  now: Date
): Alert[] => {
  const alerts: Alert[] = [];
  const capacityBySystem: Record<string, CapacityDoc[]> = {};
  capacity.forEach(r => {
    (capacityBySystem[r.hostid] ??= []).push(r);
  });

  /* FORECAST --------------------------------------------------- */
  forecast.forEach(rec => {
    const sys = systems.get(rec.hostid);
    if (!sys) return;

    const caps = (capacityBySystem[rec.hostid] ?? []).sort(
      (a, b) => +new Date(b.date) - +new Date(a.date)
    );
    const latestCap = caps[0];
    const percUsed = latestCap ? Number(latestCap.perc_used) : 0;

    const timeTo = (k: '80' | '90' | '100') =>
      Number((rec as any)[`time_to_${k}`]);
    const growthRate = Number(rec.growth_rate);

    const push = (
      msg: string,
      lvl: AlertLevel,
      t: AlertType = 'forecast'
    ) =>
      alerts.push({
        id: `${rec.hostid}-${t}-${msg}`,
        unit_id: sys.unit_id,
        pool: sys.pool,
        company: sys.company,
        message: msg,
        date: now.toISOString(),
        type: t,
        importance: lvl,
      });

    if (percUsed >= 80)
      push(
        `Already above 80 % (${percUsed.toFixed(1)} %).`,
        percUsed >= 90 ? 'red' : 'blue'
      );
    else if (timeTo('80') <= 30)
      push(`Will reach 80 % in ${timeTo('80')} d.`, 'white');

    if (timeTo('90') <= 30 && percUsed < 90)
      push(`Will reach 90 % in ${timeTo('90')} d.`, 'blue');
    if (timeTo('100') <= 30)
      push(`Will reach 100 % in ${timeTo('100')} d.`, 'red');

    if (growthRate > 3)
      push(
        `High growth: +${growthRate.toFixed(2)} %/day.`,
        growthRate > 5 ? 'red' : 'blue',
        'highGrowth'
      );
  });

  /* SUDDEN CHANGES (Used **e** Snap) --------------------------- */
  Object.entries(capacityBySystem).forEach(([id, recs]) => {
    const sys = systems.get(id);
    if (!sys || recs.length < 2) return;

    const [prev, last] = [...recs]
      .sort((a, b) => +new Date(b.date) - +new Date(a.date))
      .slice(0, 2)
      .reverse();

    const diff = (k: 'perc_used' | 'perc_snap') =>
      Number(last[k]) - Number(prev[k]);

    ([
      ['perc_used', 'used %'],
      ['perc_snap', 'snap %'],
    ] as const).forEach(([k, label]) => {
      const d = diff(k);
      if (Math.abs(d) < 5) return;
      alerts.push({
        id: `${id}-${k}-${last.date}`,
        unit_id: sys.unit_id,
        pool: sys.pool,
        company: sys.company,
        message:
          d > 0
            ? `Sudden ↑ in ${label}: +${d.toFixed(1)} %`
            : `Sudden ↓ in ${label}: −${Math.abs(d).toFixed(1)} %`,
        date: last.date,
        type: d > 0 ? 'suddenIncrease' : 'suddenDecrease',
        importance: Math.abs(d) >= 10 ? 'red' : 'blue',
      });
    });
  });

  /* INACTIVITY -------------------------------------------------- */
  Object.entries(capacityBySystem).forEach(([id, recs]) => {
    const sys = systems.get(id);
    if (!sys) return;
    const latest = recs.reduce((a, b) =>
      +new Date(a.date) > +new Date(b.date) ? a : b
    );
    const diffH = (+now - +new Date(latest.date)) / 3_600_000;
    if (diffH >= 24)
      alerts.push({
        id: `${id}-inact`,
        unit_id: sys.unit_id,
        pool: sys.pool,
        company: sys.company,
        message: `No data for ${Math.floor(diffH)} h.`,
        date: latest.date,
        type: 'inactivity',
        importance: diffH >= 48 ? 'red' : 'blue',
      });
  });

  /* TELEMETRY OFF ---------------------------------------------- */
  systems.forEach(s =>
    !s.sending_telemetry &&
      alerts.push({
        id: `${s.hostid}-telemetry`,
        unit_id: s.unit_id,
        pool: s.pool,
        company: s.company,
        message: 'Telemetry inactive.',
        date: now.toISOString(),
        type: 'telemetryInactive',
        importance: 'red',
      })
  );

  /* DEDUP + SORT ------------------------------------------------ */
  return [...new Map(alerts.map(a => [a.id, a])).values()].sort(
    (a, b) => +new Date(b.date) - +new Date(a.date)
  );
};

/* ----------------------- UI CONSTANTS --------------------------- */
const iconMap: Record<AlertType, React.FC<{ className?: string }>> = {
  forecast: Calendar,
  suddenIncrease: TrendingUp,
  suddenDecrease: TrendingDown,
  inactivity: AlertTriangle,
  telemetryInactive: XCircle,
  highGrowth: Activity,
};

const borderPalette: Record<AlertLevel, string> = {
  white: 'border-slate-400',
  blue: 'border-cyan-400',
  red: 'border-[#f8485e]',
};

/* ========================== PAGE =============================== */
const PAGE_SIZE = 30; // 30 per fetch
const DISPLAY_BATCH = 30;

export const AlertsHistory: React.FC = () => {
  const { user, isAuthenticated, isInitializingSession } = useAuth();

  /* -------- map sistemi -------- */
  const { data: systemsMap, isLoading: loadingSys } = useQuery({
    queryKey: ['systemsMap'],
    queryFn: fetchSystems,
    staleTime: 1_200_000,
  });

  /* -------- filtri local -------- */
  const [typeFilter, setType] = useState<'all' | AlertType>('all');
  const [companyFilter, setCompany] = useState('all');
  const [severityFilter, setSeverity] = useState<'all' | AlertLevel>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);

  /* -------- infinite query ----- */
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: loadingAlerts,
  } = useInfiniteQuery<
    AlertPage,
    Error,
    AlertPage,
    [
      'alertsHistory',
      typeof typeFilter,
      typeof companyFilter,
      typeof severityFilter
    ]
  >({
    queryKey: ['alertsHistory', typeFilter, companyFilter, severityFilter],
    enabled: !!systemsMap,
    initialPageParam: undefined,
    getNextPageParam: last => last.lastDoc,
    queryFn: async ({ pageParam }) => {
      const now = new Date();
      const capSnap = await getDocs(
        query(
          collection(firestore, 'capacity_trends'),
          orderBy('date', 'desc'),
          ...(pageParam ? [startAfter(pageParam)] : []),
          limit(PAGE_SIZE)
        )
      );
      const forecastSnap = await getDocs(
        query(
          collection(firestore, 'analytics_forecast'),
          orderBy('date', 'desc'),
          limit(PAGE_SIZE)
        )
      );
      return {
        alerts: generateAlerts(
          systemsMap!,
          capSnap.docs.map(d => d.data() as CapacityDoc),
          forecastSnap.docs.map(d => d.data() as ForecastDoc),
          now
        ),
        lastDoc: capSnap.docs.at(-1) as QueryDocumentSnapshot<DocumentData>,
      };
    },
    staleTime: 300_000,
  });

  /* -------- merge + dedup globale -------- */
  const alerts = useMemo(() => {
    const raw = (data as InfiniteData<AlertPage> | undefined)?.pages.flatMap(
      p => p.alerts
    ) ?? [];

    // ulteriore dedup: una sola card per (unit,pool,company,type)
    const uniq = new Map<string, Alert>();
    raw.forEach(a => {
      const k = `${a.unit_id}-${a.pool}-${a.company}-${a.type}`;
      if (!uniq.has(k)) uniq.set(k, a); // lista è già sorted → primo = più recente
    });

    return [...uniq.values()].filter(a => {
      if (typeFilter !== 'all' && a.type !== typeFilter) return false;
      if (companyFilter !== 'all' && a.company !== companyFilter) return false;
      if (severityFilter !== 'all' && a.importance !== severityFilter)
        return false;

      if (user?.role === 'admin_employee') {
        if (
          user.visibleCompanies &&
          !user.visibleCompanies.includes('all') &&
          !user.visibleCompanies.includes(a.company)
        )
          return false;
      } else if (user?.role !== 'admin' && user?.company !== a.company) {
        return false;
      }
      return true;
    });
  }, [data, typeFilter, companyFilter, severityFilter, user]);

  /* ----- autofetch 30 visibili ----- */
  useEffect(() => {
    if (
      alerts.length < DISPLAY_BATCH &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage();
    }
  }, [alerts.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const showLoadMore =
    hasNextPage && alerts.length >= DISPLAY_BATCH && !isFetchingNextPage;

  /* -------- guards ---------- */
  if (isInitializingSession || loadingSys)
    return <div className="p-8 text-center text-zinc-200">Loading…</div>;
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;
  if (user.subscription === 'None') return <NoPermission />;

  /* -------- JSX ------------ */
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold flex items-center gap-2 text-cyan-300">
          <Bell className="w-6 h-6" />
          Alerts History
        </h1>
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="flex items-center gap-1 text-cyan-300 hover:text-cyan-200"
        >
          <Filter className="w-5 h-5" />
          Filters
        </button>
      </div>

      {filtersOpen && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 bg-[#01323b] p-4 rounded-lg">
          <Select
            label="Type"
            value={typeFilter}
            onChange={v => setType(v as any)}
            options={[
              'all',
              'forecast',
              'suddenIncrease',
              'suddenDecrease',
              'inactivity',
              'telemetryInactive',
              'highGrowth',
            ]}
          />
          <Select
            label="Company"
            value={companyFilter}
            onChange={setCompany}
            options={[
              'all',
              ...Array.from(new Set(alerts.map(a => a.company))),
            ]}
          />
          <Select
            label="Severity"
            value={severityFilter}
            onChange={v => setSeverity(v as any)}
            options={['all', 'white', 'blue', 'red']}
          />
        </div>
      )}

      {loadingAlerts ? (
        <div className="text-center text-zinc-300">Loading alerts…</div>
      ) : alerts.length === 0 ? (
        <div className="text-center text-zinc-400">No alerts.</div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {alerts.map(a => {
              const Icon = iconMap[a.type];
              return (
                <div
                  key={a.id}
                  className={clsx(
                    'relative rounded-lg border px-4 py-3 bg-[#01262e] text-slate-100',
                    borderPalette[a.importance]
                  )}
                >
                  <Icon className="absolute right-2 top-2 w-5 h-5 text-slate-400" />
                  <h3 className="font-semibold">
                    {a.unit_id} – {a.pool}
                  </h3>
                  <p className="text-xs text-cyan-300 mb-1">{a.company}</p>
                  <p className="text-sm mb-3">{a.message}</p>
                  <span className="text-xs text-slate-400">
                    {format(new Date(a.date), 'MMM dd, yyyy')}
                  </span>
                </div>
              );
            })}
          </div>

          {showLoadMore && (
            <div className="flex justify-center mt-6">
              <button
                onClick={() => fetchNextPage()}
                className="px-5 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-[#01262e] font-semibold"
              >
                Load more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

/* ---- tiny reusable select ---- */
const Select: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}> = ({ label, value, onChange, options }) => (
  <div>
    <label className="block mb-1 text-sm text-zinc-300">{label}</label>
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-[#022e36] p-2 rounded"
    >
      {options.map(o => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  </div>
);

export default AlertsHistory;
