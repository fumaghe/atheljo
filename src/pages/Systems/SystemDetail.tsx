// src/pages/Systems/SystemDetail.tsx
import 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import { subDays } from 'date-fns';
import { ChartOptions } from 'chart.js';
import {
  ArrowLeft,
  Activity,
  Database,
  Zap,
  Signal,
  Camera,
  Gauge,
  BarChart,
  TrendingUp,
  Building2,
  Wrench,
  Lock,
  Server
} from 'lucide-react';
import firestore from '../../firebaseClient';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useSubscriptionPermissions } from '../../hooks/useSubscriptionPermissions';
import { useAuth } from '../../context/AuthContext';
import StateVectorChart from './StateVectorChart';
import LoadingDots from '../Dashboard/components/LoadingDots';
import { calculateSystemHealthScore } from '../../utils/calculateSystemHealthScore';

// =============== INTERFACCE ===============
interface SystemData {
  name: string;
  hostid: string;
  pool: string;
  unit_id: string;
  type: string;
  used: number;
  avail: number;
  used_snap: number;
  perc_used: number;
  perc_snap: number;
  sending_telemetry: boolean;
  first_date: string;  // "2018-03-28 19:23:30"
  last_date: string;   // "2023-03-05 12:31:21"
  MUP: number;
  avg_speed: number;
  avg_time: number;
  company: string;
}

interface TelemetryData {
  date: string;        // es. "2018-03-28 19:23:30"
  unit_id: string;
  pool: string;
  used: number;
  total_space: number;
  perc_used: number;
  snap: number;
  perc_snap: number;
  // se hai un campo "hostid" anche in capacity_trends, aggiungilo qui
  hostid?: string; 
}

interface ForecastPoint {
  date: string;
  unit_id: string;
  pool: string;
  forecasted_usage: number;
  forecasted_percentage: number;
  // se hai un campo "hostid" anche in usage_forecast, aggiungilo qui
  hostid?: string;
}

interface ForecastData {
  unitId: string;
  pool: string;
  time_to_80: number;
  time_to_90: number;
  time_to_100: number;
  current_usage: number;
  growth_rate: number;
}

interface HealthMetric {
  name: string;
  value: number;
  rawValue?: number | string;
  unit?: string;
  status: 'good' | 'warning' | 'critical';
  message: string;
  impact: string;
  weight: number;
  icon?: React.ElementType;
}

// =============== CACHE LOCALE ===============
interface UnitCache {
  allSystemRecords: SystemData[];   // Tutti i record system_data
  allTelemetry: TelemetryData[];     // Tutta la telemetria (capacity_trends)
  allForecast: ForecastPoint[];      // Tutte le previsioni (usage_forecast)
  timestamp: number;
}

const unitCache: Record<string, UnitCache> = {};
const CACHE_DURATION = 20 * 60 * 1000; // 20 minuti

// =============== COMPONENTE PRINCIPALE ===============
function SystemDetail() {
  const { unitId } = useParams<{ unitId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Permessi e blur
  const { canAccess: capCan, shouldBlur: capBlur } = useSubscriptionPermissions('SystemDetail', 'Health - Capacity');
  const { canAccess: perfCan, shouldBlur: perfBlur } = useSubscriptionPermissions('SystemDetail', 'Health - Performance');
  const { canAccess: telemCan, shouldBlur: telemBlur } = useSubscriptionPermissions('SystemDetail', 'Health - Telemetry');
  const { canAccess: snapCan, shouldBlur: snapBlur } = useSubscriptionPermissions('SystemDetail', 'Health - Snapshots');
  const { canAccess: mupCan, shouldBlur: mupBlur } = useSubscriptionPermissions('SystemDetail', 'Health - MUP');
  const { canAccess: utilCan, shouldBlur: utilBlur } =
    useSubscriptionPermissions('SystemDetail', 'Health - Utilization');
  const { canAccess: healthHeadCan, shouldBlur: healthHeadBlur } =
    useSubscriptionPermissions('SystemDetail', 'HealthScoreInHeader');
  const { canAccess: t80Can, shouldBlur: t80Blur } =
    useSubscriptionPermissions('SystemDetail', 'Forecast - TimeTo80');
  const { canAccess: t90Can, shouldBlur: t90Blur } =
    useSubscriptionPermissions('SystemDetail', 'Forecast - TimeTo90');
  const { canAccess: t100Can, shouldBlur: t100Blur } =
    useSubscriptionPermissions('SystemDetail', 'Forecast - TimeTo100');
  const { canAccess: chartHistCan, shouldBlur: chartHistBlur } =
    useSubscriptionPermissions('SystemDetail', 'Chart - UsageHistory');
  const { canAccess: chartForeCan, shouldBlur: chartForeBlur } =
    useSubscriptionPermissions('SystemDetail', 'Chart - UsageForecast');

  // Stato globale: tutti i record, la pool, l'hostid selezionato, e i dati da mostrare
  const [allRecords, setAllRecords] = useState<SystemData[]>([]);
  const [poolList, setPoolList] = useState<string[]>([]);
  const [selectedPool, setSelectedPool] = useState<string | null>(null);

  // Hostid che stiamo usando per calcolare i dati
  const [selectedHostid, setSelectedHostid] = useState<string | null>(null);

  // Dati finali del "sistema" selezionato (pool + hostid)
  const [systemData, setSystemData] = useState<SystemData | null>(null);
  
  // NOTA: useremo "stitchedTelemetry" per i dati finali da mostrare nel grafico Usage History
  const [stitchedTelemetry, setStitchedTelemetry] = useState<TelemetryData[]>([]);
  
  // Forecast “finale” (per ora non stichiamo sugli intervalli, ma puoi farlo se vuoi)
  const [forecastPoints, setForecastPoints] = useState<ForecastPoint[]>([]);
  const [forecastData, setForecastData] = useState<ForecastData | null>(null);
  const [healthScore, setHealthScore] = useState<{ score: number; metrics: HealthMetric[] } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState('1y');

  // =============== 1) Caricamento dati e caching ===============
  useEffect(() => {
    if (!unitId) return;
    setIsLoading(true);
    setError(null);

    (async () => {
      try {
        const now = Date.now();
        const cached = unitCache[unitId];
        if (cached && now - cached.timestamp < CACHE_DURATION) {
          // Se i dati in cache sono ancora validi, li usiamo
          setAllRecords(cached.allSystemRecords);

          // Ricavo la lista delle pool
          const uniquePools = Array.from(new Set(cached.allSystemRecords.map((r) => r.pool)));
          setPoolList(uniquePools);

          // Trovo la pool di default con last_date più recente
          let defaultPool: string | null = null;
          let maxTime = 0;
          for (const rec of cached.allSystemRecords) {
            const t = new Date(rec.last_date).getTime();
            if (t > maxTime) {
              maxTime = t;
              defaultPool = rec.pool;
            }
          }
          setSelectedPool(defaultPool);

          setIsLoading(false);
          return;
        }

        // Altrimenti fetch da Firestore per system_data
        const systemRef = collection(firestore, 'system_data');
        const systemQuery = query(systemRef, where('unit_id', '==', unitId));
        const snapshot = await getDocs(systemQuery);

        if (snapshot.empty) {
          setError(`No system records found for unit_id=${unitId}`);
          setIsLoading(false);
          return;
        }

        const loadedRecords: SystemData[] = [];
        snapshot.forEach((doc) => {
          const d = doc.data();
          const firstDate = d.first_date ? d.first_date.replace(' ', 'T') : '';
          const lastDate = d.last_date ? d.last_date.replace(' ', 'T') : '';
          loadedRecords.push({
            name: d.name || '',
            hostid: d.hostid || '',
            pool: d.pool || '',
            unit_id: d.unit_id || '',
            type: d.type || '',
            used: Number(d.used),
            avail: Number(d.avail),
            used_snap: Number(d.used_snap),
            perc_used: Number(d.perc_used),
            perc_snap: Number(d.perc_snap),
            sending_telemetry: String(d.sending_telemetry).toLowerCase() === 'true',
            first_date: firstDate,
            last_date: lastDate,
            MUP: d.MUP == null ? 55 : Number(d.MUP),
            avg_speed: Number(d.avg_speed),
            avg_time: Number(d.avg_time),
            company: d.company || ''
          });
        });

        if (!loadedRecords.length) {
          setError('No valid system records found');
          setIsLoading(false);
          return;
        }

        // Controllo permessi su company
        if (user && loadedRecords.length > 0) {
          const rec0 = loadedRecords[0];
          if (user.role === 'admin_employee') {
            if (
              user.visibleCompanies &&
              !user.visibleCompanies.includes('all') &&
              !user.visibleCompanies.includes(rec0.company)
            ) {
              setError('Access denied: company mismatch');
              setIsLoading(false);
              return;
            }
          } else if (user.role !== 'admin' && rec0.company !== user.company) {
            setError('Access denied: not your company');
            setIsLoading(false);
            return;
          }
        }

        // Scelgo un record col last_date più recente (per avere un riferimento iniziale)
        let latestRecord = loadedRecords[0];
        let maxTime = 0;
        for (const r of loadedRecords) {
          const t = new Date(r.last_date).getTime();
          if (t > maxTime) {
            maxTime = t;
            latestRecord = r;
          }
        }
        const refHostid = latestRecord.hostid || '';

        // Estrai i valori unici di hostid dalla system_data (utili per filtrare i dati nelle altre collezioni)
        const uniqueHostids = Array.from(new Set(loadedRecords.map(r => r.hostid)));

        // Carico TUTTA la telemetria dalla collezione capacity_trends usando l'operatore "in" sui hostid
        const telemQ = query(
          collection(firestore, 'capacity_trends'),
          where('hostid', 'in', uniqueHostids)
        );
        const telemSnap = await getDocs(telemQ);
        let allTelemetryData: TelemetryData[] = [];
        telemSnap.forEach((doc) => {
          const td = doc.data();
          allTelemetryData.push({
            date: td.date ? td.date.replace(' ', 'T') : '',
            unit_id: td.unit_id || '',
            pool: td.pool || '',
            used: Number(td.used),
            total_space: Number(td.total_space),
            perc_used: Number(td.perc_used),
            snap: Number(td.snap),
            perc_snap: Number(td.perc_snap),
            hostid: td.hostid || ''
          });
        });
        allTelemetryData = allTelemetryData
          .filter((t) => t.perc_used >= 0 && t.perc_used <= 100)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Carico TUTTO il forecast dalla collezione usage_forecast usando l'operatore "in" sui hostid
        const foreQ = query(
          collection(firestore, 'usage_forecast'),
          where('hostid', 'in', uniqueHostids)
        );
        const foreSnap = await getDocs(foreQ);
        let allForecastData: ForecastPoint[] = [];
        foreSnap.forEach((doc) => {
          const fd = doc.data();
          allForecastData.push({
            date: fd.date ? fd.date.replace(' ', 'T') : '',
            unit_id: fd.unit_id || '',
            pool: fd.pool || '',
            forecasted_usage: Number(fd.forecasted_usage),
            forecasted_percentage: Number(fd.forecasted_percentage),
            hostid: fd.hostid || ''
          });
        });
        allForecastData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Metto tutto in cache
        unitCache[unitId] = {
          allSystemRecords: loadedRecords,
          allTelemetry: allTelemetryData,
          allForecast: allForecastData,
          timestamp: now
        };

        setAllRecords(loadedRecords);

        // Costruisco la lista delle pool
        const allPools = Array.from(new Set(loadedRecords.map((r) => r.pool)));
        setPoolList(allPools);

        // Definisco la pool di default con l'ultimo last_date
        let defaultPool: string | null = null;
        let maxT2 = 0;
        for (const rec of loadedRecords) {
          const t = new Date(rec.last_date).getTime();
          if (t > maxT2) {
            maxT2 = t;
            defaultPool = rec.pool;
          }
        }
        setSelectedPool(defaultPool);

      } catch (err) {
        console.error(err);
        setError('Failed to load system data');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [unitId, user]);

  // =============== 2) Al cambio pool, scelgo l'hostid più recente di quella pool ===============
  useEffect(() => {
    if (!selectedPool || !allRecords.length) {
      setSelectedHostid(null);
      return;
    }
    const poolRecords = allRecords.filter((r) => r.pool === selectedPool);
    if (!poolRecords.length) {
      setSelectedHostid(null);
      return;
    }
    poolRecords.sort((a, b) => new Date(b.last_date).getTime() - new Date(a.last_date).getTime());
    if (!selectedHostid) {
      setSelectedHostid(poolRecords[0].hostid);
    }
  }, [selectedPool, allRecords, selectedHostid]);

  // =============== 3) Stitching di usage history e set systemData/forecast ===============
  useEffect(() => {
    if (!selectedPool || !selectedHostid || !allRecords.length || !unitId) {
      setSystemData(null);
      setStitchedTelemetry([]); 
      setForecastPoints([]);
      setForecastData(null);
      setHealthScore(null);
      return;
    }

    const cached = unitCache[unitId];
    if (!cached) return;

    // 3.1) Trovo TUTTI i record system_data che matchano pool + hostid
    const relevantRecords = allRecords.filter(
      (r) => r.pool === selectedPool && r.hostid === selectedHostid
    );
    if (!relevantRecords.length) {
      setSystemData(null);
      setStitchedTelemetry([]);
      return;
    }
    // Ordino e prendo il record con il last_date più recente come "currentSystem"
    relevantRecords.sort((a, b) => new Date(b.last_date).getTime() - new Date(a.last_date).getTime());
    const currentSystem = relevantRecords[0];
    setSystemData(currentSystem);

    // 3.2) Costruisco un array “stitched” con i dati telemetrici per ciascun record (intervallo [first_date, last_date])
    let finalTelemetry: TelemetryData[] = [];
    for (const rec of relevantRecords) {
      const from = new Date(rec.first_date).getTime();
      const to = new Date(rec.last_date).getTime();

      // Filtra i dati telemetrici in cache:
      // - pool deve corrispondere
      // - hostid deve corrispondere
      // - la data deve trovarsi nell'intervallo [first_date, last_date]
      const sub = cached.allTelemetry.filter((t) => {
        if (t.pool !== rec.pool) return false;
        if (t.hostid !== rec.hostid) return false;
        const tDate = new Date(t.date).getTime();
        return tDate >= from && tDate <= to;
      });
      finalTelemetry.push(...sub);
    }
    finalTelemetry.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    setStitchedTelemetry(finalTelemetry);

    // 3.3) Forecast: filtra i record in base a pool e hostid
    const foreForHost = cached.allForecast.filter(
      (f) => f.pool === selectedPool && f.hostid === selectedHostid
    );
    foreForHost.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    setForecastPoints(foreForHost);

    // 3.4) Costruisco forecastData
    const fc: ForecastData = {
      unitId: currentSystem.unit_id,
      pool: currentSystem.pool,
      time_to_80: calculateDaysToThreshold(foreForHost, 80),
      time_to_90: calculateDaysToThreshold(foreForHost, 90),
      time_to_100: calculateDaysToThreshold(foreForHost, 100),
      current_usage: currentSystem.perc_used,
      growth_rate: calculateGrowthRate(foreForHost)
    };
    setForecastData(fc);

    // 3.5) Calcolo Health Score dal currentSystem
    const finalScore = calculateSystemHealthScore(currentSystem);
    const capacityScore =
      currentSystem.perc_used <= 55
        ? 100
        : Math.max(0, 100 - (currentSystem.perc_used - 55) * (100 / 45));
    const performanceScore = Math.max(0, 100 - 10 * Math.abs(currentSystem.avg_time - 5));
    const telemetryScore = currentSystem.sending_telemetry ? 100 : 0;
    const snapshotsScore =
      currentSystem.used_snap > 0
        ? Math.max(0, Math.min(100, 100 - currentSystem.perc_snap))
        : 0;
    const mupScore =
      currentSystem.MUP <= 55
        ? 100
        : Math.max(0, 100 - (currentSystem.MUP - 55) * (100 / 45));
    const utilizationScore = (capacityScore + snapshotsScore) / 2;

    const metrics: HealthMetric[] = [
      {
        name: 'Capacity',
        value: Number(capacityScore.toFixed(1)),
        rawValue: Number((100 - currentSystem.perc_used).toFixed(1)),
        unit: '%',
        status: capacityScore < 50 ? 'critical' : capacityScore < 70 ? 'warning' : 'good',
        message: `${(currentSystem.used / 1024).toFixed(2)} TB used of ${(((currentSystem.used + currentSystem.avail) / 1024).toFixed(2))} TB total`,
        impact: 'N/A',
        weight: 40,
        icon: Database
      },
      {
        name: 'Performance',
        value: Number(performanceScore.toFixed(1)),
        rawValue: Number(performanceScore.toFixed(1)),
        unit: '',
        status: performanceScore < 50 ? 'critical' : performanceScore < 60 ? 'warning' : 'good',
        message: `Avg time: ${currentSystem.avg_time.toFixed(1)} min`,
        impact: 'N/A',
        weight: 20,
        icon: Zap
      },
      {
        name: 'Telemetry',
        value: telemetryScore,
        rawValue: currentSystem.sending_telemetry ? 'Active' : 'Inactive',
        unit: '',
        status: telemetryScore === 100 ? 'good' : 'critical',
        message: currentSystem.sending_telemetry ? 'System is sending telemetry' : 'No telemetry',
        impact: 'N/A',
        weight: 15,
        icon: Signal
      },
      {
        name: 'Snapshots',
        value: Number(snapshotsScore.toFixed(1)),
        rawValue: currentSystem.used_snap,
        unit: 'GB',
        status: snapshotsScore < 50 ? 'critical' : snapshotsScore < 70 ? 'warning' : 'good',
        message:
          currentSystem.used_snap > 0
            ? `${currentSystem.used_snap} GB used for snapshots`
            : 'No snapshots found',
        impact: 'N/A',
        weight: 10,
        icon: Camera
      },
      {
        name: 'MUP',
        value: Number(mupScore.toFixed(1)),
        rawValue: currentSystem.MUP,
        unit: '',
        status: mupScore < 50 ? 'critical' : mupScore < 60 ? 'warning' : 'good',
        message: 'Resource usage patterns',
        impact: 'N/A',
        weight: 15,
        icon: BarChart
      },
      {
        name: 'Utilization',
        value: Number(utilizationScore.toFixed(1)),
        rawValue: utilizationScore.toFixed(1),
        unit: '%',
        status:
          utilizationScore < 50 ? 'critical' : utilizationScore < 70 ? 'warning' : 'good',
        message: 'Avg of Capacity & Snapshots Score',
        impact: 'N/A',
        weight: 0,
        icon: Gauge
      }
    ];
    setHealthScore({ score: finalScore, metrics });
  }, [selectedPool, selectedHostid, allRecords, unitId]);

  // =============== Funzioni di Supporto ===============
  function calculateDaysToThreshold(forecastPoints: ForecastPoint[], threshold: number) {
    if (!forecastPoints.length) return -1;
    const today = new Date();
    const point = forecastPoints.find((p) => p.forecasted_percentage >= threshold);
    if (!point) return -1;
    const thresholdDate = new Date(point.date);
    const diffTime = thresholdDate.getTime() - today.getTime();
    return diffTime > 0 ? Math.ceil(diffTime / (1000 * 60 * 60 * 24)) : -1;
  }

  function calculateGrowthRate(forecastPoints: ForecastPoint[]): number {
    if (forecastPoints.length < 2) return 0;
    const first = forecastPoints[0];
    const last = forecastPoints[forecastPoints.length - 1];
    const daysDiff =
      (new Date(last.date).getTime() - new Date(first.date).getTime()) /
      (1000 * 60 * 60 * 24);
    const percentageDiff = last.forecasted_percentage - first.forecasted_percentage;
    return daysDiff > 0 ? Number((percentageDiff / daysDiff).toFixed(2)) : 0;
  }

  function getTimeRangeData<T extends { date: string }>(data: T[], range: string): T[] {
    if (range === 'all') return data;
    const now = new Date();
    const rangeMap: Record<string, number> = {
      '1m': 30,
      '3m': 90,
      '6m': 180,
      '1y': 365
    };
    const days = rangeMap[range] || 365;
    const cutoff = subDays(now, days);
    return data.filter((point) => new Date(point.date).getTime() >= cutoff.getTime());
  }

  // =============== RENDER ===============
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <LoadingDots/>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-[#f8485e] text-xl">{error}</div>
      </div>
    );
  }

  // Se mancano systemData o healthScore, mostro un messaggio
  if (!systemData || !healthScore) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-[#f8485e] text-xl">
          No data found for this pool/hostid or missing health score
        </div>
      </div>
    );
  }

  // Filtro la telemetria e il forecast in base al timeRange
  const filteredTelemetry = getTimeRangeData<TelemetryData>(stitchedTelemetry, timeRange);
  const filteredForecast = getTimeRangeData<ForecastPoint>(forecastPoints, timeRange);

  // Prendo i record per la pool selezionata (per mostrare la card di hostid)
  const poolRecords = allRecords.filter((r) => r.pool === selectedPool);
  poolRecords.sort((a, b) => new Date(b.last_date).getTime() - new Date(a.last_date).getTime());

  // Dati per chart Usage History
  const historyChartData = {
    datasets: [
      {
        label: 'Usage',
        data: filteredTelemetry.map((p) => ({ x: p.date, y: p.perc_used })),
        borderColor: '#22c1d4',
        backgroundColor: 'rgba(34,193,212,0.1)',
        tension: 0.2,
        pointRadius: 0,
        fill: true
      }
    ]
  };

  // Dati per chart Usage Forecast
  const forecastChartData = {
    datasets: [
      {
        label: 'Historical',
        data: filteredTelemetry.map((p) => ({ x: p.date, y: p.perc_used })),
        borderColor: '#22c1d4',
        backgroundColor: 'rgba(34,193,212,0.1)',
        tension: 0.2,
        pointRadius: 0,
        fill: true
      },
      {
        label: 'Forecast',
        data: filteredForecast.map((p) => ({ x: p.date, y: p.forecasted_percentage })),
        borderColor: '#f8485e',
        borderDash: [5, 5],
        tension: 0.2,
        pointRadius: 0,
        fill: false
      }
    ]
  };

  // Dati fittizi se l’utente non ha il permesso (blur)
  const dummyHistory = {
    datasets: [
      {
        label: 'Usage (Dummy)',
        data: [
          { x: '2023-01-01', y: 20 },
          { x: '2023-02-01', y: 40 },
          { x: '2023-03-01', y: 60 }
        ],
        borderColor: '#888',
        backgroundColor: 'rgba(136,136,136,0.1)',
        tension: 0.2,
        pointRadius: 0,
        fill: true
      }
    ]
  };

  const dummyForecast = {
    datasets: [
      {
        label: 'Historical (Dummy)',
        data: [
          { x: '2023-01-01', y: 10 },
          { x: '2023-02-01', y: 30 },
          { x: '2023-03-01', y: 50 }
        ],
        borderColor: '#888',
        backgroundColor: 'rgba(136,136,136,0.1)',
        tension: 0.2,
        pointRadius: 0,
        fill: true
      },
      {
        label: 'Forecast (Dummy)',
        data: [
          { x: '2023-04-01', y: 60 },
          { x: '2023-05-01', y: 70 }
        ],
        borderColor: '#aaa',
        borderDash: [5, 5],
        tension: 0.2,
        pointRadius: 0,
        fill: false
      }
    ]
  };

  // Scegli se mostrare dati veri o fittizi
  const displayedHistory = chartHistBlur ? dummyHistory : historyChartData;
  const displayedForecast = chartForeBlur ? dummyForecast : forecastChartData;

  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        grid: { color: 'rgba(255,255,255,0.1)' },
        ticks: {
          color: '#fff',
          callback: (val) => `${(val as number).toFixed(2)}%`
        }
      },
      x: {
        type: 'time',
        time: {
          unit: 'month',
          displayFormats: { month: 'MMM yyyy' }
        },
        grid: { color: 'rgba(255,255,255,0.1)' },
        ticks: { color: '#fff' }
      }
    },
    plugins: {
      legend: {
        position: 'top',
        labels: { color: '#fff', usePointStyle: true, pointStyle: 'circle' }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: '#0b3c43',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: '#22c1d4',
        borderWidth: 1,
        padding: 12,
        displayColors: true,
        callbacks: {
          label: (context) => {
            const val = context.parsed.y ?? 0;
            return `${context.dataset.label}: ${val.toFixed(2)}%`;
          }
        }
      }
    },
    interaction: { intersect: false, mode: 'index' }
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/systems/company/${systemData.company}`)}
            className="p-2 hover:bg-[#0b3c43] rounded-full transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-[#22c1d4]" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{systemData.name}</h1>
              <span className="text-[#eeeeee]/60">•</span>
              <div className="flex items-center gap-1 text-[#eeeeee]/60">
                <Building2 className="w-4 h-4" />
                {systemData.company}
              </div>
            </div>
            <p className="text-[#eeeeee]/60">
              Unit ID: {systemData.unit_id} — Pool: {systemData.pool}
            </p>
          </div>
        </div>
        {/* Selettore pool */}
        <div>
          {poolList.length > 1 && (
            <select
              className="bg-[#06272b] text-[#eeeeee] rounded px-3 py-1 border border-[#22c1d4]/20"
              value={selectedPool ?? ''}
              onChange={(e) => {
                setSelectedPool(e.target.value);
                // reset anche l’hostid
                setSelectedHostid(null);
              }}
            >
              {poolList.map((pool) => (
                <option key={pool} value={pool}>
                  {pool}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* BLOCCO - ELENCO HOSTID UNIVOCI PER LA POOL SCELTA */}
      <div className="bg-[#0b3c43] rounded-lg p-6 shadow-lg border border-[#22c1d4]/10">
        <h2 className="text-xl text-[#f8485e] font-semibold flex items-center gap-2 mb-4">
          <Server className="h-6 w-6 text-[#22c1d4]" />
          HostID Overview
        </h2>
        <p className="text-[#eeeeee]/60 mb-4">
          Click on a HostID to load data for that unit.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {poolRecords.map((hRec) => {
            // è la card selezionata?
            const isSelected = (hRec.hostid === selectedHostid);
            return (
              <button
                key={`${hRec.hostid}-${hRec.last_date}`}
                onClick={() => setSelectedHostid(hRec.hostid)}
                className="text-left"
                style={{
                  border: isSelected ? '2px solid#f8485e' : '1px solid rgba(34,193,212,0.2)',
                  background: '#06272b',
                  borderRadius: '0.5rem',
                  padding: '1rem',
                  cursor: 'pointer',
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Server className="text-[#22c1d4] w-5 h-5" />
                  <span className="font-semibold">
                    {hRec.hostid ? `HostID: ${hRec.hostid}` : 'No HostID'}
                  </span>
                </div>
                <div className="text-sm text-[#eeeeee]/60">
                  Last Date: {hRec.last_date || 'N/A'}
                </div>
                <div className="text-sm mt-1 flex items-center gap-2">
                  Telemetry:
                  {hRec.sending_telemetry ? (
                    <span className="flex items-center gap-1 text-[#22c1d4] font-medium">
                      <Signal className="w-4 h-4" />
                      Active
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[#f8485e] font-medium">
                      <Lock className="w-4 h-4" />
                      Inactive
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* BLOCCO - Health Score */}
      <div className="bg-[#0b3c43] rounded-lg p-6 shadow-lg border border-[#22c1d4]/10">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl text-[#f8485e] font-semibold flex items-center gap-2">
              <Gauge className="h-6 w-6 text-[#22c1d4]" />
              System Health Score
            </h2>
            <p className="text-[#eeeeee]/60 mt-1">Overall system health assessment</p>
          </div>
          {healthHeadCan || healthHeadBlur ? (
            <div className="relative">
              <div
                className={`${
                  healthHeadBlur ? 'blur-sm pointer-events-none' : ''
                } flex flex-col items-center`}
              >
                <div className={getHealthScoreColorClass(healthScore.score, 'text-4xl font-bold')}>
                  {healthHeadBlur ? '??' : healthScore.score}
                </div>
                <div className="text-sm text-[#eeeeee]/60">Health Score</div>
              </div>
              {healthHeadBlur && (
                <div className="absolute inset-0 z-10 flex items-center justify-center">
                  <Lock className="w-6 h-6 text-white" />
                </div>
              )}
            </div>
          ) : null}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-4">
            {healthScore.metrics
              .filter((m) => m.name === 'Capacity')
              .map((m) => renderHealthMetric(m, capCan, capBlur))}
            {healthScore.metrics
              .filter((m) => m.name === 'Performance')
              .map((m) => renderHealthMetric(m, perfCan, perfBlur))}
          </div>
          <div className="space-y-4">
            {healthScore.metrics
              .filter((m) => m.name === 'Telemetry')
              .map((m) => renderHealthMetric(m, telemCan, telemBlur))}
            {healthScore.metrics
              .filter((m) => m.name === 'Snapshots')
              .map((m) => renderHealthMetric(m, snapCan, snapBlur))}
          </div>
          <div className="space-y-4">
            {healthScore.metrics
              .filter((m) => m.name === 'MUP')
              .map((m) => renderHealthMetric(m, mupCan, mupBlur))}
            {healthScore.metrics
              .filter((m) => m.name === 'Utilization')
              .map((m) => renderHealthMetric(m, utilCan, utilBlur))}
          </div>
        </div>
      </div>

      {/* BLOCCO - Forecast */}
      {forecastData && (
        <div className="bg-[#0b3c43] rounded-lg p-6 shadow-lg border border-[#22c1d4]/10">
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp className="w-6 h-6 text-[#22c1d4]" />
            <h2 className="text-xl text-[#f8485e] font-semibold">Capacity Forecast</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {renderForecastBox('Time to 80% Capacity', forecastData.time_to_80, 'Days', t80Can, t80Blur, '#22c1d4')}
            {renderForecastBox('Time to 90% Capacity', forecastData.time_to_90, 'Days', t90Can, t90Blur, '#eeeeee')}
            {renderForecastBox('Time to 100% Capacity', forecastData.time_to_100, 'Days', t100Can, t100Blur, '#f8485e')}
          </div>
        </div>
      )}

      {/* BLOCCO - Behaviour Analysis */}
      <div className="bg-[#0b3c43] rounded-lg p-6 shadow-lg border border-[#22c1d4]/10">
        <div className="flex items-center gap-2 mb-6">
          <Activity className="w-6 h-6 text-[#22c1d4]" />
          <h2 className="text-xl text-[#f8485e] font-semibold">Behaviour Analysis</h2>
        </div>
        {/* Integrazione del componente StateVectorChart con il nuovo prop hostId */}
        {systemData && (
          <StateVectorChart
            unitId={systemData.unit_id}
            pool={systemData.pool}
            hostId={systemData.hostid} // aggiunto qui il parametro hostId
          />
        )}
      </div>

      {/* CHART - UsageHistory */}
      {chartHistCan || chartHistBlur ? (
        <div className="relative bg-[#0b3c43] rounded-lg p-6 shadow-lg border border-[#22c1d4]/10">
          <div className={chartHistBlur ? 'blur-sm pointer-events-none' : ''}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-[#22c1d4]" />
                <h2 className="text-xl text-[#f8485e] font-semibold">Usage History</h2>
              </div>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="bg-[#06272b] text-[#eeeeee] rounded px-3 py-1 border border-[#22c1d4]/20"
                disabled={chartHistBlur}
              >
                <option value="1m">Last Month</option>
                <option value="3m">Last 3 Months</option>
                <option value="6m">Last 6 Months</option>
                <option value="1y">Last Year</option>
                <option value="all">All</option>
              </select>
            </div>
            <div className="h-[400px]">
              <Line key={`history-${timeRange}`} data={displayedHistory} options={chartOptions} redraw />
            </div>
          </div>
          {chartHistBlur && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center px-4 overflow-hidden">
              <Lock className="w-6 h-6 text-white" />
              <span className="text-white text-lg break-words max-w-full">
                Upgrade subscription to see Usage History
              </span>
            </div>
          )}
        </div>
      ) : null}

      {/* CHART - UsageForecast */}
      {chartForeCan || chartForeBlur ? (
        <div className="relative bg-[#0b3c43] rounded-lg p-6 shadow-lg border border-[#22c1d4]/10">
          <div className={chartForeBlur ? 'blur-sm pointer-events-none' : ''}>
            <div className="flex items-center gap-2 mb-6">
              <BarChart className="w-6 h-6 text-[#22c1d4]" />
              <h2 className="text-xl text-[#f8485e] font-semibold">Usage Forecast</h2>
            </div>
            <div className="h-[400px]">
              <Line key={`forecast-${timeRange}`} data={displayedForecast} options={chartOptions} redraw />
            </div>
          </div>
          {chartForeBlur && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center px-4 overflow-hidden">
              <Wrench className="w-6 h-6 text-white" />
              <span className="text-white text-lg break-words max-w-full">
                Usage Forecast Work in Progress
              </span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );

  // =============== RENDER FUNZIONI DI SUPPORTO ===============
  function renderHealthMetric(metric: HealthMetric, canAccess: boolean, shouldBlur: boolean) {
    if (!canAccess && !shouldBlur) return null;

    const displayedValue = shouldBlur
      ? '??'
      : metric.rawValue !== undefined && (metric.name === 'Capacity' || metric.name === 'MUP')
      ? `${metric.rawValue}${metric.unit || ''}`
      : `${metric.value}${metric.unit || ''}`;

    const displayedMessage = shouldBlur ? '???' : metric.message;

    return (
      <div key={metric.name} className="relative h-[160px]">
        <div
          className={`p-4 rounded-lg mb-4 h-full ${getStatusBg(metric.status)} ${
            shouldBlur ? 'blur-sm pointer-events-none' : ''
          }`}
        >
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              {metric.icon &&
                React.createElement(metric.icon, {
                  className: getStatusColorClass(metric.status, 'w-5 h-5')
                })}
              <span className="font-semibold">{metric.name}</span>
            </div>
            <div className={`text-lg font-bold ${getStatusColorClass(metric.status)}`}>
              {displayedValue}
            </div>
          </div>
          <p className="text-sm text-[#eeeeee]/80 mb-2 line-clamp-2">{displayedMessage}</p>
          <div className="flex justify-between items-center text-sm mt-auto">
            <span className="text-[#eeeeee]/60">{metric.impact}</span>
            <span className="text-[#eeeeee]/60">Weight: {metric.weight}%</span>
          </div>
        </div>
        {shouldBlur && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center px-4 overflow-hidden">
            <Lock className="w-6 h-6 text-white" />
            <span className="text-white text-lg break-words max-w-full">
              Upgrade subscription to see {metric.name}
            </span>
          </div>
        )}
      </div>
    );
  }

  function renderForecastBox(
    title: string,
    daysValue: number,
    unit: string,
    canAccess: boolean,
    shouldBlur: boolean,
    textColor: string
  ) {
    if (!canAccess && !shouldBlur) return null;
    const displayedDays = shouldBlur ? '??' : daysValue === -1 ? '?' : daysValue;
    return (
      <div className="relative p-4 rounded-lg bg-[#06272b]">
        <div className={shouldBlur ? 'blur-sm pointer-events-none' : ''}>
          <h3 className="text-lg font-medium mb-2">{title}</h3>
          <div className="text-3xl font-bold" style={{ color: textColor }}>
            {displayedDays} {unit}
          </div>
          <p className="text-sm text-[#eeeeee]/60 mt-2">Based on current growth rate</p>
        </div>
        {shouldBlur && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center px-4 overflow-hidden">
            <Wrench className="w-6 h-6 text-white mb-2" />
            <span className="text-white text-lg break-words max-w-full">
              {title} Work in Progress
            </span>
          </div>
        )}
      </div>
    );
  }

  function getStatusBg(status: string) {
    switch (status) {
      case 'good':
        return 'bg-[#22c1d4]/20';
      case 'warning':
        return 'bg-[#eeeeee]/20';
      case 'critical':
        return 'bg-[#f8485e]/20';
      default:
        return 'bg-[#22c1d4]/10';
    }
  }

  function getStatusColorClass(status: string, extra: string = '') {
    switch (status) {
      case 'good':
        return `text-[#22c1d4] ${extra}`;
      case 'warning':
        return `text-[#eeeeee] ${extra}`;
      case 'critical':
        return `text-[#f8485e] ${extra}`;
      default:
        return extra;
    }
  }

  function getHealthScoreColorClass(score: number, extra: string = '') {
    if (score >= 80) return `text-[#22c1d4] ${extra}`;
    if (score >= 50) return `text-[#eeeeee] ${extra}`;
    return `text-[#f8485e] ${extra}`;
  }
}

export default SystemDetail;
