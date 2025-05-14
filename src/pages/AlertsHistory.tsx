/* ------------------------------------------------------------------
   src/pages/AlertsHistory.tsx
   ------------------------------------------------------------------ */
import React, { useMemo, useState } from 'react';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  XCircle,
  Activity,
  Filter,
  Bell,
  ExternalLink,
} from 'lucide-react';
import {
  format,
  isToday,
  isYesterday,
  startOfDay,
  differenceInHours,
} from 'date-fns';
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
  last_date?: string;
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

/* ----------------------- CONFIG --------------------------- */
const DEFAULT_RANGE_DAYS = 7;
const FETCH_BATCH = 5000;

/* ----------------------- UTIL ----------------------------------- */
const toISO = (s: string) =>
  s.includes('T') ? s : s.replace(' ', 'T') + 'Z';

const dbString = (d: Date) =>
  d.toISOString().slice(0, 19).replace('T', ' ');

/* -------------------- DAILY FETCHER ----------------------------- */
const fetchDocsDaily = async <T,>(
  collectionName: string,
  from: Date,
  to: Date,
): Promise<T[]> => {
  const docs: T[] = [];

  let currentDay = new Date(to);
  currentDay.setUTCHours(23, 59, 59, 999);

  const fromDay = new Date(from);
  fromDay.setUTCHours(0, 0, 0, 0);

  while (currentDay >= fromDay) {
    const startDay = new Date(currentDay);
    startDay.setUTCHours(0, 0, 0, 0);

    let cursor: QueryDocumentSnapshot<DocumentData> | undefined;

    while (true) {
      const snap = await getDocs(
        query(
          collection(firestore, collectionName),
          where('date', '>=', dbString(startDay)),
          where('date', '<=', dbString(currentDay)),
          orderBy('date', 'desc'),
          limit(FETCH_BATCH),
          ...(cursor ? [startAfter(cursor)] : []),
        ),
      );

      docs.push(...snap.docs.map(d => d.data() as unknown as T));

      if (snap.docs.length < FETCH_BATCH) break;
      cursor = snap.docs.at(-1)!;
    }

    currentDay.setDate(currentDay.getDate() - 1);
    currentDay.setUTCHours(23, 59, 59, 999);
  }

  return docs;
};

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
      last_date: s.last_date,
    });
  });
  return map;
};

const pushUnique = (
  list: Alert[],
  set: Set<string>,
  key: string,
  value: Alert,
) => {
  if (!set.has(key)) {
    set.add(key);
    list.push(value);
  }
};

/* ------------------------ GENERATE ALERTS ----------------------- */
const generateAlerts = (
  systems: Map<string, SystemData>,
  capacity: CapacityDoc[],
  forecast: ForecastDoc[],
  now: Date,
): Alert[] => {
  const alerts: Alert[] = [];
  const seen = new Set<string>();

  /* ------ indicizza capacità per sistema ----------------------- */
  const capacityBySystem: Record<string, CapacityDoc[]> = {};
  capacity.forEach(d => (capacityBySystem[d.hostid] ??= []).push(d));

  /* ---------- forecast & growth -------------------------------- */
  forecast.forEach(rec => {
    const sys = systems.get(rec.hostid);
    if (!sys) return;

    const isoDate = toISO(rec.date);
    const dayKey = startOfDay(new Date(isoDate)).toISOString();

    const caps = (capacityBySystem[rec.hostid] ?? []).sort(
      (a, b) => +new Date(toISO(b.date)) - +new Date(toISO(a.date)),
    );
    const latest = caps[0];
    const percUsed = latest ? Number(latest.perc_used) : 0;

    const timeTo = (k: '80' | '90' | '100') =>
      Number(rec[`time_to_${k}`]);
    const growth = Number(rec.growth_rate);

    const add = (
      msg: string,
      lvl: AlertLevel,
      type: AlertType = 'forecast',
    ) =>
      pushUnique(alerts, seen, `${rec.hostid}-${type}-${dayKey}-${msg}`, {
        id: `${rec.hostid}-${type}-${dayKey}-${msg}`,
        unit_id: sys.unit_id,
        pool: sys.pool,
        company: sys.company,
        message: msg,
        date: isoDate,
        type,
        importance: lvl,
      });

    /* rules */
    if (percUsed >= 80) {
      add(
        `Already above 80 % (${percUsed.toFixed(1)} %).`,
        percUsed >= 90 ? 'red' : 'blue',
      );
    } else if (timeTo('80') <= 30) {
      add(`Will reach 80 % in ${timeTo('80')} d.`, 'white');
    }

    if (timeTo('90') <= 30 && percUsed < 90)
      add(`Will reach 90 % in ${timeTo('90')} d.`, 'blue');

    if (timeTo('100') <= 30)
      add(`Will reach 100 % in ${timeTo('100')} d.`, 'red');

    if (growth > 3)
      add(
        `High growth: +${growth.toFixed(2)} %/day.`,
        growth > 5 ? 'red' : 'blue',
        'highGrowth',
      );
  });

  /* ---------- sudden changes & inactivity ---------------------- */
  Object.entries(capacityBySystem).forEach(([id, recsRaw]) => {
    const sys = systems.get(id);
    if (!sys) return;

    const recs = [...recsRaw].sort(
      (a, b) => +new Date(toISO(a.date)) - +new Date(toISO(b.date)),
    );

    /*  Iterate on every consecutive pair of days  */
    for (let i = 1; i < recs.length; i++) {
      const prev = recs[i - 1];
      const curr = recs[i];

      const diffP = (k: 'perc_used' | 'perc_snap') =>
        Number(curr[k]) - Number(prev[k]);

      ([ 
        ['perc_used', 'used %'],
      ] as const).forEach(([k, label]) => {
        const d = diffP(k);
        if (Math.abs(d) < 5) return;

        pushUnique(
          alerts,
          seen,
          `${id}-${k}-${curr.date}`,
          {
            id: `${id}-${k}-${curr.date}`,
            unit_id: sys.unit_id,
            pool: sys.pool,
            company: sys.company,
            message:
              d > 0
                ? `Sudden ↑ in ${label}: +${d.toFixed(1)} %`
                : `Sudden ↓ in ${label}: −${Math.abs(d).toFixed(1)} %`,
            date: toISO(curr.date),
            type: d > 0 ? 'suddenIncrease' : 'suddenDecrease',
            importance: Math.abs(d) >= 10 ? 'red' : 'blue',
          },
        );
      });

      /* ----------- inactivity gap between prev-curr ------------- */
      const gapH =
        (+new Date(toISO(curr.date)) - +new Date(toISO(prev.date))) /
        3_600_000;
      if (gapH >= 24) {
        pushUnique(
          alerts,
          seen,
          `${id}-inactivity-${prev.date}`,
          {
            id: `${id}-inactivity-${prev.date}`,
            unit_id: sys.unit_id,
            pool: sys.pool,
            company: sys.company,
            message: `No data for ${Math.floor(gapH)} h.`,
            date: toISO(prev.date),
            type: 'inactivity',
            importance: gapH >= 48 ? 'red' : 'blue',
          },
        );
      }
    }

    /* -------- gap fra ultimo record e "now" -------------------- */
    const lastRec = recs.at(-1)!;
    const diffHNow =
      (+now - +new Date(toISO(lastRec.date))) / 3_600_000;
    if (diffHNow >= 24)
      pushUnique(
        alerts,
        seen,
        `${id}-inactivity-${lastRec.date}`,
        {
          id: `${id}-inactivity-${lastRec.date}`,
          unit_id: sys.unit_id,
          pool: sys.pool,
          company: sys.company,
          message: `No data for ${Math.floor(diffHNow)} h.`,
          date: toISO(lastRec.date),
          type: 'inactivity',
          importance: diffHNow >= 48 ? 'red' : 'blue',
        },
      );
  });

  /* ---------- telemetry off ------------------------------------ */
  systems.forEach(s => {
    if (s.sending_telemetry) return;

    const capRecs = capacityBySystem[s.hostid] ?? [];
    const lastCapDate = capRecs.length
      ? capRecs.reduce((a, b) =>
          +new Date(toISO(a.date)) > +new Date(toISO(b.date)) ? a : b,
        ).date
      : undefined;

    const lastSeen = lastCapDate
      ? new Date(toISO(lastCapDate))
      : s.last_date
      ? new Date(s.last_date.replace(' ', 'T') + 'Z')
      : now;

    const diffDays = (now.getTime() - lastSeen.getTime()) / 86_400_000;

    if (diffDays <= 3)
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

/* =================================================================
                              PAGE
   ================================================================= */
export default function AlertsHistory() {
  const { user, isAuthenticated, isInitializingSession } = useAuth();

  /* --------- intervallo date (UTC, senza ore) ------------------- */
  const today = startOfDay(new Date());
  const [range, setRange] = useState<{
    from: Date;
    to: Date;
  }>({
    from: new Date(+today - DEFAULT_RANGE_DAYS * 86_400_000),
    to: today,
  });

  /* -------- systems map -------- */
  const { data: systemsMap, isLoading: loadingSys } = useQuery({
    queryKey: ['systemsMap'],
    queryFn: fetchSystems,
    staleTime: 20 * 60 * 1000,
  });

  /* -------- alerts for range -------- */
  const {
    data: alertsRaw,
    refetch: refetchAlerts,
    isFetching: loadingAlerts,
  } = useQuery({
    enabled: !!systemsMap,
    queryKey: ['alerts', range.from.toISOString(), range.to.toISOString()],
    queryFn: async () => {
      if (!systemsMap) return [];
      const [cap, fc] = await Promise.all([
        fetchDocsDaily<CapacityDoc>('capacity_trends', range.from, range.to),
        fetchDocsDaily<ForecastDoc>('analytics_forecast', range.from, range.to),
      ]);

      return generateAlerts(
        systemsMap,
        cap.map(d => ({ ...d, date: toISO(d.date as string) })),
        fc.map(d => ({ ...d, date: toISO(d.date as string) })),
        range.to,
      );
    },
    staleTime: Infinity,
  });

  /* ----------- filtri UI (escluso periodo) ---------------------- */
  const [filters, setFilters] = useState({
    type: 'all' as AlertType | 'all',
    company: 'all',
    severity: 'all' as AlertLevel | 'all',
    recent24h: false,
    onlyRed: false,
    showDatasets: true,
  });
  const [filtersOpen, setFiltersOpen] = useState(false);

  const toggleQuick = (k: 'recent24h' | 'onlyRed' | 'showDatasets') =>
    setFilters(p => ({ ...p, [k]: !p[k] }));

  /* ----------- applica filtri ----------------------------------- */
  const alerts = useMemo(() => {
    const raw = alertsRaw ?? [];
    const filtered = raw.filter(a => {
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

    const uniq = new Map<string, Alert>();

    // Cambia qui l'unicità basandoti SOLO su hostid/unit_id (e non su pool)
    filtered.forEach(a => {
      const k = `${a.unit_id}-${a.type}-${a.date}-${a.message}`;
      if (!uniq.has(k)) uniq.set(k, a);
    });

    return [...uniq.values()];
  }, [alertsRaw, filters, user]);

  /* -------- raggruppa ------------------------------------------- */
  const groupKey = (d: Date) => {
    if (isToday(d)) return 'Today';
    if (isYesterday(d)) return 'Yesterday';
    const diff = Math.floor((today.getTime() - d.getTime()) / 86_400_000);
    if (diff < 7) return 'Last 7 days';
    return 'Older alerts';
  };
  const sectioned = useMemo(() => {
    const map = new Map<string, Alert[]>();
    alerts.forEach(a => {
      const key = groupKey(new Date(a.date));
      (map.get(key) ?? map.set(key, []).get(key)!).push(a);
    });
    return Array.from(map.entries());
  }, [alerts]);

  /* ---------------------- render ------------------------------- */
  if (isInitializingSession || loadingSys)
    return <div className="p-8 text-center text-zinc-200">Loading…</div>;
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;
  if (user.subscription === 'None') return <NoPermission />;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold flex items-center gap-2 text-cyan-300">
          <Bell className="w-6 h-6" />
          Alerts History
        </h1>
        <button
          onClick={() => setFiltersOpen(o => !o)}
          className="flex items-center gap-1 text-cyan-300 hover:text-cyan-200 transition-colors"
        >
          <Filter className="w-5 h-5" />
          Filters
        </button>
      </div>

      {/* pannello filtri */}
      <FiltersPanel
        open={filtersOpen}
        filters={filters}
        setFilters={setFilters}
        alerts={alerts}
        toggleQuick={toggleQuick}
        range={range}
        setRange={setRange}
        onApply={() => refetchAlerts()}
      />

      {loadingAlerts ? (
        <SkeletonGrid />
      ) : alerts.length === 0 ? (
        <div className="text-center text-zinc-400">No alerts.</div>
      ) : (
        sectioned.map(([title, list]) => (
          <Section key={title} title={title} alerts={list} />
        ))
      )}
    </div>
  );
}

/* ======================= components ============================ */
const FiltersPanel: React.FC<{
  open: boolean;
  filters: any;
  setFilters: React.Dispatch<React.SetStateAction<any>>;
  alerts: Alert[];
  toggleQuick: (k: 'recent24h' | 'onlyRed' | 'showDatasets') => void;
  range: { from: Date; to: Date };
  setRange: React.Dispatch<React.SetStateAction<{ from: Date; to: Date }>>;
  onApply: () => void;
}> = ({
  open,
  filters,
  setFilters,
  alerts,
  toggleQuick,
  range,
  setRange,
  onApply,
}) => {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return (
    <div
      className={clsx(
        'grid overflow-hidden transition-all duration-300',
        open
          ? 'grid-rows-[1fr] sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 bg-[#01323b] p-4 rounded-lg'
          : 'grid-rows-[0fr] mb-0',
      )}
      style={{ gridAutoRows: open ? 'auto' : '0' }}
    >
      {open && (
        <>
          <div className="col-span-full flex gap-4">
            <div className="flex flex-col flex-1">
              <label className="mb-1 text-sm text-zinc-300">From</label>
              <input
                type="date"
                value={fmt(range.from)}
                max={fmt(range.to)}
                onChange={e =>
                  setRange(r => ({
                    ...r,
                    from: new Date(e.target.value + 'T00:00:00Z'),
                  }))
                }
                className="bg-[#022e36] p-2 rounded"
              />
            </div>
            <div className="flex flex-col flex-1">
              <label className="mb-1 text-sm text-zinc-300">To</label>
              <input
                type="date"
                value={fmt(range.to)}
                min={fmt(range.from)}
                max={fmt(new Date())}
                onChange={e =>
                  setRange(r => ({
                    ...r,
                    to: new Date(e.target.value + 'T23:59:59Z'),
                  }))
                }
                className="bg-[#022e36] p-2 rounded"
              />
            </div>
          </div>

          <Select
            label="Type"
            value={filters.type}
            onChange={v =>
              setFilters((p: any) => ({ ...p, type: v as AlertType | 'all' }))
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
            onChange={v => setFilters((p: any) => ({ ...p, company: v }))}
            options={[
              'all',
              ...Array.from(new Set(alerts.map(a => a.company))),
            ]}
          />
          <Select
            label="Severity"
            value={filters.severity}
            onChange={v =>
              setFilters((p: any) => ({
                ...p,
                severity: v as AlertLevel | 'all',
              }))
            }
            options={['all', 'white', 'blue', 'red']}
          />

          <div className="flex flex-wrap gap-2 col-span-full">
            <QuickButton
              active={filters.onlyRed}
              onClick={() => toggleQuick('onlyRed')}
            >
              Solo rossi
            </QuickButton>
            <QuickButton
              active={filters.recent24h}
              onClick={() => toggleQuick('recent24h')}
            >
              Ultime 24 h
            </QuickButton>
            <QuickButton
              active={filters.showDatasets}
              onClick={() => toggleQuick('showDatasets')}
            >
              Show datasets
            </QuickButton>
            <button
              onClick={onApply}
              className="ml-auto px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-700 text-sm font-semibold"
            >
              Apply
            </button>
          </div>
        </>
      )}
    </div>
  );
};

const QuickButton: React.FC<
  React.PropsWithChildren<{ active: boolean; onClick: () => void }>
> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={clsx(
      'px-3 py-2 rounded text-sm border',
      active
        ? 'bg-cyan-600/20 border-cyan-400 text-cyan-300'
        : 'bg-transparent border-slate-500 text-slate-300',
    )}
  >
    {children}
  </button>
);

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

const Section: React.FC<{ title: string; alerts: Alert[] }> = ({
  title,
  alerts,
}) => (
  <div className="mb-8">
    <h2 className="mb-3 text-xl font-bold text-cyan-400">{title}</h2>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {alerts.map(a => {
        const Icon = iconMap[a.type];
        const d = new Date(a.date);
        const url = `https://avalon.staging.storvix.eu/systems/${a.unit_id}`;
        return (
          <div
            key={a.id}
            className={clsx(
              'relative rounded-lg border px-4 py-3 bg-[#01262e] text-slate-100',
              borderPalette[a.importance],
            )}
          >
            {/* tipo di alert */}
            <Icon className="absolute top-2 right-2 h-5 w-5 text-slate-400" />

            {/* contenuto */}
            <h3 className="font-semibold">
              {a.unit_id} – {a.pool}
            </h3>
            <p className="mb-1 text-xs text-cyan-300">{a.company}</p>
            <p className="mb-3 text-sm">{a.message}</p>
            <span className="text-xs text-slate-400">
              {format(d, 'MMM dd, yyyy')}
              {differenceInHours(new Date(), d) < 24 &&
                ` • ${format(d, 'HH:mm')}`}
            </span>

            {/* icona link in basso a destra */}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-2 right-2"
            >
              <ExternalLink className="h-5 w-5 text-slate-400 hover:text-cyan-300 transition-colors" />
            </a>
          </div>
        );
      })}
    </div>
  </div>
);

const SkeletonGrid: React.FC = () => (
  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="h-24 animate-pulse rounded-lg bg-[#02303a]" />
    ))}
  </div>
);
