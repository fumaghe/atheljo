/* ------------------------------------------------------------------
   src/pages/AlertsHistory.tsx
   ------------------------------------------------------------------ */
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import { format, isToday, isYesterday, differenceInHours } from 'date-fns';
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
  last_date?: string; // ← campo presente in system_data
}

interface CapacityDoc {
  hostid: string;
  date: string;
  perc_used: string | number;
  perc_snap: string | number;
}

interface ForecastDoc {
  [key: string]: string | number;
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
// sistema → Map così evitiamo query ripetitive
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
      last_date: s.last_date,
    });
  });
  return map;
};

const pushUnique = (
  list: Alert[],
  keySet: Set<string>,
  key: string,
  value: Alert
) => {
  if (!keySet.has(key)) {
    keySet.add(key);
    list.push(value);
  }
};

/* ---------------------------------------------------------------
   generateAlerts: crea la lista unificata di alert
---------------------------------------------------------------- */
const generateAlerts = (
  systems: Map<string, SystemData>,
  capacity: CapacityDoc[],
  forecast: ForecastDoc[],
  now: Date
): Alert[] => {
  const alerts: Alert[] = [];
  const seen = new Set<string>();

  /* ---- capacity grouping per hostid ---- */
  const capacityBySystem: Record<string, CapacityDoc[]> = {};
  capacity.forEach(r => {
    (capacityBySystem[r.hostid] ??= []).push(r);
  });

  /* -------- FORECAST ------------------------------------------------ */
  forecast.forEach(rec => {
    const sys = systems.get(rec.hostid);
    if (!sys) return;

    const caps = (capacityBySystem[rec.hostid] ?? []).sort(
      (a, b) => +new Date(b.date) - +new Date(a.date)
    );
    const latestCap = caps[0];
    const percUsed = latestCap ? Number(latestCap.perc_used) : 0;

    const timeTo = (k: '80' | '90' | '100'): number =>
      Number(rec[`time_to_${k}`]);
    const growthRate = Number(rec.growth_rate);

    const push = (msg: string, lvl: AlertLevel, t: AlertType = 'forecast') =>
      pushUnique(alerts, seen, `${rec.hostid}-${t}-${msg}`, {
        id: `${rec.hostid}-${t}-${msg}`,
        unit_id: sys.unit_id,
        pool: sys.pool,
        company: sys.company,
        message: msg,
        date: now.toISOString(),
        type: t,
        importance: lvl,
      });

    if (percUsed >= 80) {
      push(
        `Already above 80 % (${percUsed.toFixed(1)} %).`,
        percUsed >= 90 ? 'red' : 'blue'
      );
    } else if (timeTo('80') <= 30) {
      push(`Will reach 80 % in ${timeTo('80')} d.`, 'white');
    }

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

  /* -------- SUDDEN CHANGES ----------------------------------------- */
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

      pushUnique(alerts, seen, `${id}-${k}-${last.date}`, {
        id: `${id}-${k}-${last.date}`,
        unit_id: sys.unit_id,
        pool: sys.pool,
        company: sys.company,
        message:
          d > 0
            ? `Sudden ↑ in ${label}: +${d.toFixed(1)} %`
            : `Sudden ↓ in ${label}: −${Math.abs(d).toFixed(1)} %`,
        date: last.date,
        type: d > 0 ? 'suddenIncrease' : 'suddenDecrease',
        importance: Math.abs(d) >= 10 ? 'red' : 'blue',
      });
    });
  });

  /* -------- INACTIVITY --------------------------------------------- */
  Object.entries(capacityBySystem).forEach(([id, recs]) => {
    const sys = systems.get(id);
    if (!sys) return;
    const latest = recs.reduce((a, b) =>
      +new Date(a.date) > +new Date(b.date) ? a : b
    );
    const diffH = (+now - +new Date(latest.date)) / 3_600_000;
    if (diffH >= 24)
      pushUnique(alerts, seen, `${id}-inact`, {
        id: `${id}-inact`,
        unit_id: sys.unit_id,
        pool: sys.pool,
        company: sys.company,
        message: `No data for ${Math.floor(diffH)} h.`,
        date: latest.date,
        type: 'inactivity',
        importance: diffH >= 48 ? 'red' : 'blue',
      });
  });

  /* -------- TELEMETRY OFF: mostra solo fino a 3 giorni ------------- */
  systems.forEach(s => {
    if (s.sending_telemetry) return;

    const capRecs = capacityBySystem[s.hostid] ?? [];
    const lastCapDate = capRecs.length
      ? capRecs.reduce((a, b) =>
          +new Date(a.date) > +new Date(b.date) ? a : b
        ).date
      : undefined;

    // usa last_date da system_data se presente
    const lastSeenStr =
      lastCapDate ??
      (s.last_date ? s.last_date.replace(' ', 'T') : undefined);

    const lastSeen = lastSeenStr ? new Date(lastSeenStr) : now;
    const diffDays = (now.getTime() - lastSeen.getTime()) / 86_400_000;

    if (diffDays <= 3) {
      pushUnique(alerts, seen, `${s.hostid}-telemetry`, {
        id: `${s.hostid}-telemetry`,
        unit_id: s.unit_id,
        pool: s.pool,
        company: s.company,
        message: 'Telemetry inactive.',
        date: lastSeen.toISOString(),
        type: 'telemetryInactive',
        importance: 'red',
      });
    }
  });

  return alerts.sort((a, b) => +new Date(b.date) - +new Date(a.date));
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
const PAGE_SIZE = 30;
const DISPLAY_BATCH = 30;
const DAYS_BACK = 7;

export const AlertsHistory: React.FC = () => {
  const { user, isAuthenticated, isInitializingSession } = useAuth();

  /* -------- systems map -------- */
  const { data: systemsMap, isLoading: loadingSys } = useQuery({
    queryKey: ['systemsMap'],
    queryFn: fetchSystems,
    staleTime: 20 * 60 * 1000,
  });

  /* -------- filtri -------- */
  const [filters, setFilters] = useState<{
    type: AlertType | 'all';
    company: string;
    severity: AlertLevel | 'all';
    recent24h: boolean;
    onlyRed: boolean;
    showDatasets: boolean;
  }>({
    type: 'all',
    company: 'all',
    severity: 'all',
    recent24h: false,
    onlyRed: false,
    showDatasets: false,
  });

  const toggleQuick = (
    k: 'recent24h' | 'onlyRed' | 'showDatasets'
  ) => setFilters(p => ({ ...p, [k]: !p[k] }));

  const [filtersOpen, setFiltersOpen] = useState(false);

  /* -------- infinite query -------- */
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: loadingAlerts,
  } = useInfiniteQuery<AlertPage, Error>({
    queryKey: [
      'alertsHistory',
      filters.type,
      filters.company,
      filters.severity,
      filters.recent24h,
      filters.onlyRed,
      filters.showDatasets,
    ],
    enabled: !!systemsMap,
    initialPageParam: undefined as QueryDocumentSnapshot<DocumentData> | undefined,
    getNextPageParam: last => last.lastDoc,
    queryFn: async ({ pageParam }) => {
      const now = new Date();
      const since = new Date(+now - DAYS_BACK * 24 * 60 * 60 * 1000);

      const capacitySnap = await getDocs(
        query(
          collection(firestore, 'capacity_trends'),
          orderBy('date', 'desc'),
          limit(PAGE_SIZE),
          ...(pageParam ? [startAfter(pageParam)] : [])
        )
      );
      const forecastSnap = await getDocs(
        query(
          collection(firestore, 'analytics_forecast'),
          orderBy('date', 'desc'),
          limit(PAGE_SIZE)
        )
      );

      const capacityDocs = capacitySnap.docs
        .map(d => d.data() as CapacityDoc)
        .filter(d => new Date(d.date) >= since);
      const forecastDocs = forecastSnap.docs
        .map(d => d.data() as ForecastDoc)
        .filter(d => new Date(d.date) >= since);

      return {
        alerts: generateAlerts(systemsMap!, capacityDocs, forecastDocs, now),
        lastDoc:
          capacitySnap.docs.length === PAGE_SIZE
            ? (capacitySnap.docs.at(-1) as QueryDocumentSnapshot<DocumentData>)
            : undefined,
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  /* -------- merge + filtra -------- */
  const alerts = useMemo(() => {
    const pages = (data as InfiniteData<AlertPage> | undefined)?.pages ?? [];
    const raw = pages.flatMap(p => p.alerts);

    const uniq = new Map<string, Alert>();
    raw.forEach(a => {
      const k = `${a.unit_id}-${a.pool}-${a.company}-${a.type}`;
      if (!uniq.has(k)) uniq.set(k, a);
    });

    return [...uniq.values()].filter(a => {
      /* filtro pool con / (datasets) */
      if (!filters.showDatasets && a.pool.includes('/')) return false;

      if (filters.onlyRed && a.importance !== 'red') return false;
      if (
        filters.recent24h &&
        differenceInHours(new Date(), new Date(a.date)) > 24
      )
        return false;
      if (filters.type !== 'all' && a.type !== filters.type) return false;
      if (filters.company !== 'all' && a.company !== filters.company)
        return false;
      if (filters.severity !== 'all' && a.importance !== filters.severity)
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
  }, [data, filters, user]);

  /* -------- auto-fetch next page -------- */
  useEffect(() => {
    if (
      alerts.length < DISPLAY_BATCH &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage();
    }
  }, [alerts.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  /* -------- infinite-scroll sentinel -------- */
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sentinelRef.current || !hasNextPage || isFetchingNextPage) return;
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  /* -------- raggruppa per sezione giorno -------- */
  const groupKey = (d: Date) => {
    if (isToday(d)) return 'Oggi';
    if (isYesterday(d)) return 'Ieri';
    const diffDays = Math.floor(
      (Date.now() - +d) / (24 * 60 * 60 * 1000)
    );
    if (diffDays <= 7) return 'Questa settimana';
    return 'Più vecchi';
  };

  const sectioned = useMemo(() => {
    const map = new Map<string, Alert[]>();
    alerts.forEach(a => {
      const key = groupKey(new Date(a.date));
      (map.get(key) ?? map.set(key, []).get(key)!).push(a);
    });
    return Array.from(map.entries());
  }, [alerts]);

  /* -------- guards -------- */
  if (isInitializingSession || loadingSys)
    return <div className="p-8 text-center text-zinc-200">Loading…</div>;
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;
  if (user.subscription === 'None') return <NoPermission />;

  /* ------------------------ RENDER ------------------------------ */
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold flex items-center gap-2 text-cyan-300">
          <Bell className="w-6 h-6" />
          Alerts History
        </h1>
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="flex items-center gap-1 text-cyan-300 hover:text-cyan-200 transition-colors"
        >
          <Filter className="w-5 h-5" />
          Filters
        </button>
      </div>

      {/* FILTRI */}
      <div
        className={clsx(
          'grid transition-all duration-300 overflow-hidden',
          filtersOpen
            ? 'grid-rows-[1fr] sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 bg-[#01323b] p-4 rounded-lg'
            : 'grid-rows-[0fr] mb-0'
        )}
        style={{ gridAutoRows: filtersOpen ? 'auto' : '0' }}
      >
        {filtersOpen && (
          <>
            <Select
              label="Type"
              value={filters.type}
              onChange={v =>
                setFilters(p => ({ ...p, type: v as AlertType | 'all' }))
              }
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
              value={filters.company}
              onChange={v => setFilters(p => ({ ...p, company: v }))}
              options={[
                'all',
                ...Array.from(new Set(alerts.map(a => a.company))),
              ]}
            />
            <Select
              label="Severity"
              value={filters.severity}
              onChange={v =>
                setFilters(p => ({ ...p, severity: v as AlertLevel | 'all' }))
              }
              options={['all', 'white', 'blue', 'red']}
            />
            <div className="flex flex-wrap gap-2 col-span-full">
              <button
                onClick={() => toggleQuick('onlyRed')}
                className={clsx(
                  'px-3 py-2 rounded text-sm border',
                  filters.onlyRed
                    ? 'bg-[#f8485e]/20 border-[#f8485e] text-[#f8485e]'
                    : 'bg-transparent border-slate-500 text-slate-300'
                )}
              >
                Solo Rossi
              </button>
              <button
                onClick={() => toggleQuick('recent24h')}
                className={clsx(
                  'px-3 py-2 rounded text-sm border',
                  filters.recent24h
                    ? 'bg-cyan-600/20 border-cyan-400 text-cyan-300'
                    : 'bg-transparent border-slate-500 text-slate-300'
                )}
              >
                Ultime 24h
              </button>
              <button
                onClick={() => toggleQuick('showDatasets')}
                className={clsx(
                  'px-3 py-2 rounded text-sm border',
                  filters.showDatasets
                    ? 'bg-emerald-600/20 border-emerald-400 text-emerald-300'
                    : 'bg-transparent border-slate-500 text-slate-300'
                )}
              >
                Show Datasets
              </button>
            </div>
          </>
        )}
      </div>

      {loadingAlerts ? (
        <SkeletonGrid />
      ) : alerts.length === 0 ? (
        <div className="text-center text-zinc-400">No alerts.</div>
      ) : (
        <>
          {sectioned.map(([section, list]) => (
            <div key={section} className="mb-8">
              <h2 className="text-xl font-bold text-cyan-400 mb-3">
                {section}
              </h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {list.map(a => {
                  const Icon = iconMap[a.type];
                  const d = new Date(a.date);
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
                        {format(d, 'MMM dd, yyyy')}
                        {differenceInHours(new Date(), d) < 24 &&
                          ` • ${format(d, 'HH:mm')}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* sentinel */}
          <div ref={sentinelRef} />

          {isFetchingNextPage && <SkeletonGrid />}
        </>
      )}
    </div>
  );
};

/* ---- Select (piccola utility) ---- */
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

/* ---- Skeleton per loading ---- */
const SkeletonGrid: React.FC = () => (
  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    {Array.from({ length: 6 }).map((_, i) => (
      <div
        key={i}
        className="h-24 rounded-lg bg-[#02303a] animate-pulse"
      />
    ))}
  </div>
);

export default AlertsHistory;
