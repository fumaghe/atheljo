// src/pages/Systems/SystemDetail.tsx
import 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import { subDays } from 'date-fns';
import { ChartOptions, Chart, registerables } from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
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
  Server,
  AlertTriangle
} from 'lucide-react';
import firestore from '../../firebaseClient';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useSubscriptionPermissions } from '../../hooks/useSubscriptionPermissions';
import { useAuth } from '../../context/AuthContext';
import StateVectorChart from './StateVectorChart';
import LoadingDots from '../Dashboard/components/LoadingDots';
import { calculateSystemHealthScore } from '../../utils/calculateSystemHealthScore';

// Registra Chart.js e il plugin per le annotazioni
Chart.register(...registerables, annotationPlugin);

// =============== INTERFACCIE ===============
interface SystemData {
  name: string;
  hostid: string;
  pool: string;
  unit_id: string;
  type: string;
  used: number; // in GB
  avail: number;
  used_snap: number;
  perc_used: number;
  perc_snap: number;
  sending_telemetry: boolean;
  first_date: string; // "2018-03-28T19:23:30"
  last_date: string;  // "2023-03-05T12:31:21"
  MUP: number;
  avg_speed: number;
  avg_time: number;
  company: string;
}

interface TelemetryData {
  date: string; // es. "2018-03-28T19:23:30"
  unit_id: string;
  pool: string;
  used: number; // in GB
  total_space: number;
  perc_used: number;
  snap: number;
  perc_snap: number;
  hostid?: string;
}

interface ForecastPoint {
  date: string;
  unit_id: string;
  pool: string;
  forecasted_usage: number;
  forecasted_percentage: number;
  hostid?: string;
}

// Interfaccia per forecastData (soglie 70, 80, 90)
interface ForecastData {
  unitId: string;
  pool: string;
  time_to_70: number;
  time_to_80: number;
  time_to_90: number;
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
  allSystemRecords: SystemData[]; // Tutti i record system_data
  allTelemetry: TelemetryData[];   // Tutti i dati telemetrici (capacity_trends)
  allForecast: ForecastPoint[];    // (Non più usato per il forecast matematico)
  timestamp: number;
}

const unitCache: Record<string, UnitCache> = {};
const CACHE_DURATION = 20 * 60 * 1000; // 20 minuti

// =============== FUNZIONI DI SUPPORTO PER IL FORECAST ===============
function removeDataBeforeSignificantDrop(
  telemetry: TelemetryData[],
  dropThreshold: number = 30
): TelemetryData[] {
  if (telemetry.length < 2) return telemetry;
  let dropIndex = -1;
  for (let i = 0; i < telemetry.length - 1; i++) {
    const current = telemetry[i].perc_used;
    const next = telemetry[i + 1].perc_used;
    if (next - current < -dropThreshold) {
      dropIndex = i;
      break;
    }
  }
  if (dropIndex === -1) return telemetry;
  return telemetry.slice(dropIndex + 1);
}

function calculateDailyGrowth(telemetry: TelemetryData[]): number {
  if (telemetry.length < 2) return 0;
  const maxLookBackDays = 365;
  const lastDate = new Date(telemetry[telemetry.length - 1].date);
  const cutoffDate = new Date(lastDate.getTime() - maxLookBackDays * 24 * 60 * 60 * 1000);
  const filtered = telemetry.filter(t => new Date(t.date) >= cutoffDate);
  const dataToUse = filtered.length >= 2 ? filtered : telemetry;
  const first = new Date(dataToUse[0].date);
  const last = new Date(dataToUse[dataToUse.length - 1].date);
  const days = (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 0) return 0;
  const growth = dataToUse[dataToUse.length - 1].perc_used - dataToUse[0].perc_used;
  return Number((growth / days).toFixed(2));
}

function calculateDailyGrowthUsed(telemetry: TelemetryData[]): number {
  if (telemetry.length < 2) return 0;
  const maxLookBackDays = 365;
  const lastDate = new Date(telemetry[telemetry.length - 1].date);
  const cutoffDate = new Date(lastDate.getTime() - maxLookBackDays * 24 * 60 * 60 * 1000);
  const filtered = telemetry.filter(t => new Date(t.date) >= cutoffDate);
  const dataToUse = filtered.length >= 2 ? filtered : telemetry;
  const first = new Date(dataToUse[0].date);
  const last = new Date(dataToUse[dataToUse.length - 1].date);
  const days = (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 0) return 0;
  const growth = dataToUse[dataToUse.length - 1].used - dataToUse[0].used;
  return Number((growth / days).toFixed(2));
}

function calculateForecastDays(telemetry: TelemetryData[], threshold: number): number {
  if (telemetry.length < 2) return -1;
  const dailyGrowth = calculateDailyGrowth(telemetry);
  if (dailyGrowth <= 0) return -1;
  const currentUsage = telemetry[telemetry.length - 1].perc_used;
  if (threshold < 90 && currentUsage >= threshold) return -2;
  if (threshold === 90 && currentUsage >= threshold) return 0;
  const remaining = threshold - currentUsage;
  let days = Math.ceil(remaining / dailyGrowth);
  if (days > 5000) return 5001;
  return days;
}

function computeForecastPoints(telemetry: TelemetryData[], thresholds: number[]): { date: string; forecasted_percentage: number }[] {
  if (telemetry.length === 0) return [];
  const dailyGrowth = calculateDailyGrowth(telemetry);
  if (dailyGrowth <= 0) return [];
  const lastEntry = telemetry[telemetry.length - 1];
  const lastDate = new Date(lastEntry.date);
  const currentUsage = lastEntry.perc_used;
  let forecast: { date: string; forecasted_percentage: number }[] = [];
  thresholds.forEach((th) => {
    if (th < 90 && currentUsage >= th) return;
    const daysToReach = (th - currentUsage) / dailyGrowth;
    const forecastDate = new Date(lastDate.getTime() + daysToReach * 24 * 60 * 60 * 1000);
    forecast.push({
      date: forecastDate.toISOString(),
      forecasted_percentage: th,
    });
  });
  return forecast;
}

function computeForecastPointsUsed(telemetry: TelemetryData[], systemData: SystemData): { date: string; forecasted_usage: number }[] {
  if (telemetry.length === 0) return [];
  const dailyGrowthUsed = calculateDailyGrowthUsed(telemetry);
  if (dailyGrowthUsed <= 0) return [];
  const lastEntry = telemetry[telemetry.length - 1];
  const lastDate = new Date(lastEntry.date);
  const currentUsed = lastEntry.used;
  const totalCapacity = systemData.used + systemData.avail; // in GB
  let forecast: { date: string; forecasted_usage: number }[] = [];
  [70, 80, 90].forEach((th) => {
    const thresholdAbsolute = (th * totalCapacity) / 100;
    if (th < 90 && currentUsed >= thresholdAbsolute) return;
    if (th === 90 && currentUsed >= thresholdAbsolute) {
      forecast.push({ date: lastEntry.date, forecasted_usage: thresholdAbsolute });
    } else {
      const daysToReach = (thresholdAbsolute - currentUsed) / dailyGrowthUsed;
      const forecastDate = new Date(lastDate.getTime() + daysToReach * 24 * 60 * 60 * 1000);
      forecast.push({ date: forecastDate.toISOString(), forecasted_usage: thresholdAbsolute });
    }
  });
  return forecast;
}

// Funzione di conversione: dato un valore in GB, restituisce il valore convertito in base all'unità scelta.
function convertValue(value: number, unit: string): number {
  if (unit === 'used_GB') return value;
  if (unit === 'used_GiB') return value / 1.07374;
  if (unit === 'used_TB') return value / 1000;
  return value;
}

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
  const { canAccess: utilCan, shouldBlur: utilBlur } = useSubscriptionPermissions('SystemDetail', 'Health - Utilization');
  const { canAccess: healthHeadCan, shouldBlur: healthHeadBlur } = useSubscriptionPermissions('SystemDetail', 'HealthScoreInHeader');
  const { canAccess: t80Can, shouldBlur: t80Blur } = useSubscriptionPermissions('SystemDetail', 'Forecast - TimeTo80');
  const { canAccess: t90Can, shouldBlur: t90Blur } = useSubscriptionPermissions('SystemDetail', 'Forecast - TimeTo90');
  const { canAccess: t100Can, shouldBlur: t100Blur } = useSubscriptionPermissions('SystemDetail', 'Forecast - TimeTo100');
  const { canAccess: chartHistCan, shouldBlur: chartHistBlur } = useSubscriptionPermissions('SystemDetail', 'Chart - UsageHistory');
  const { canAccess: chartForeCan, shouldBlur: chartForeBlur } = useSubscriptionPermissions('SystemDetail', 'Chart - UsageForecast');

  // Stato globale
  const [allRecords, setAllRecords] = useState<SystemData[]>([]);
  const [poolList, setPoolList] = useState<string[]>([]);
  const [selectedPool, setSelectedPool] = useState<string | null>(null);
  const [selectedHostid, setSelectedHostid] = useState<string | null>(null);
  const [systemData, setSystemData] = useState<SystemData | null>(null);
  const [stitchedTelemetry, setStitchedTelemetry] = useState<TelemetryData[]>([]);
  const [forecastData, setForecastData] = useState<ForecastData | null>(null);
  const [healthScore, setHealthScore] = useState<{ score: number; metrics: HealthMetric[] } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState('1y');
  // Stato per l'unità: "perc_used", "used_GB", "used_GiB", "used_TB"
  const [usageUnit, setUsageUnit] = useState<string>('perc_used');

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
          setAllRecords(cached.allSystemRecords);
          const uniquePools = Array.from(new Set(cached.allSystemRecords.map((r) => r.pool)));
          setPoolList(uniquePools);
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
        if (user && loadedRecords.length > 0) {
          const rec0 = loadedRecords[0];
          if (user.role === 'admin_employee') {
            if (user.visibleCompanies && !user.visibleCompanies.includes('all') && !user.visibleCompanies.includes(rec0.company)) {
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
        let latestRecord = loadedRecords[0];
        let maxTime = 0;
        for (const r of loadedRecords) {
          const t = new Date(r.last_date).getTime();
          if (t > maxTime) {
            maxTime = t;
            latestRecord = r;
          }
        }
        const uniqueHostids = Array.from(new Set(loadedRecords.map(r => r.hostid)));
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
        unitCache[unitId] = {
          allSystemRecords: loadedRecords,
          allTelemetry: allTelemetryData,
          allForecast: allForecastData,
          timestamp: now
        };
        setAllRecords(loadedRecords);
        const allPools = Array.from(new Set(loadedRecords.map((r) => r.pool)));
        setPoolList(allPools);
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

  // =============== 2) Al cambio pool, scelgo l'hostid più recente per quella pool ===============
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

  // =============== 3) Stitching di usage history e calcolo dei forecast ===============
  useEffect(() => {
    if (!selectedPool || !selectedHostid || !allRecords.length || !unitId) {
      setSystemData(null);
      setStitchedTelemetry([]); 
      setForecastData(null);
      setHealthScore(null);
      return;
    }
    const cached = unitCache[unitId];
    if (!cached) return;
    const relevantRecords = allRecords.filter(
      (r) => r.pool === selectedPool && r.hostid === selectedHostid
    );
    if (!relevantRecords.length) {
      setSystemData(null);
      setStitchedTelemetry([]);
      return;
    }
    relevantRecords.sort((a, b) => new Date(b.last_date).getTime() - new Date(a.last_date).getTime());
    const currentSystem = relevantRecords[0];
    setSystemData(currentSystem);
    let finalTelemetry: TelemetryData[] = [];
    for (const rec of relevantRecords) {
      const from = new Date(rec.first_date).getTime();
      const to = new Date(rec.last_date).getTime();
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
    const forecastTelemetry = removeDataBeforeSignificantDrop(finalTelemetry, 30);
    const fc: ForecastData = {
      unitId: currentSystem.unit_id,
      pool: currentSystem.pool,
      time_to_70: calculateForecastDays(forecastTelemetry, 70),
      time_to_80: calculateForecastDays(forecastTelemetry, 80),
      time_to_90: calculateForecastDays(forecastTelemetry, 90),
      current_usage: currentSystem.perc_used,
      growth_rate: calculateDailyGrowth(forecastTelemetry)
    };
    setForecastData(fc);
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
        status: utilizationScore < 50 ? 'critical' : utilizationScore < 70 ? 'warning' : 'good',
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
      (new Date(last.date).getTime() - new Date(first.date).getTime()) / (1000 * 60 * 60 * 24);
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

  // ==================== CALCOLO VALORI PER LE SOGLIE E L'ASSE Y ====================
  const isPerc = usageUnit === 'perc_used';
  const capacityTotal = systemData ? systemData.used + systemData.avail : 0;
  // Se non è percentuale, convertiamo il totale nella unità scelta (altrimenti rimane in GB)
  const capacityTotalConv = isPerc ? capacityTotal : convertValue(capacityTotal, usageUnit);
  const threshold70 = isPerc ? 70 : capacityTotalConv * 0.7;
  const threshold80 = isPerc ? 80 : capacityTotalConv * 0.8;
  const threshold90 = isPerc ? 90 : capacityTotalConv * 0.9;
  const yMaxValue = isPerc ? 100 : capacityTotalConv;

  // ==================== CONFIGURAZIONE DATI DEI GRAFICI ====================
  const unitSuffix = usageUnit === 'perc_used' ? '%' : (usageUnit === 'used_GB' ? 'GB' : usageUnit === 'used_GiB' ? 'GiB' : 'TB');
  const filteredTelemetry = getTimeRangeData<TelemetryData>(stitchedTelemetry, timeRange);
  const poolRecords = allRecords.filter((r) => r.pool === selectedPool);
  poolRecords.sort((a, b) => new Date(b.last_date).getTime() - new Date(a.last_date).getTime());

  const historyChartData = {
    datasets: [
      {
        label: 'Usage',
        data:
          usageUnit === 'perc_used'
            ? filteredTelemetry.map((p) => ({ x: p.date, y: p.perc_used }))
            : filteredTelemetry.map((p) => ({ x: p.date, y: convertValue(p.used, usageUnit) })),
        segment: {
          borderColor: (ctx: any) =>
            (ctx.p0.parsed.y >= threshold70 || ctx.p1.parsed.y >= threshold70)
              ? '#f8485e'
              : '#22c1d4'
        },
        backgroundColor: usageUnit === 'perc_used' ? 'rgba(34,193,212,0.1)' : 'rgba(34,193,212,0.2)',
        tension: 0.2,
        pointRadius: 0,
        fill: true
      }
    ]
  };

  const forecastChartData =
    usageUnit === 'perc_used'
      ? {
          datasets: [
            {
              label: 'Historical',
              data: filteredTelemetry.map((p) => ({ x: p.date, y: p.perc_used })),
              segment: {
                borderColor: (ctx: any) =>
                  (ctx.p0.parsed.y >= threshold70 || ctx.p1.parsed.y >= threshold70)
                    ? '#f8485e'
                    : '#22c1d4'
              },
              borderColor: '#22c1d4',
              backgroundColor: 'rgba(34,193,212,0.1)',
              tension: 0.2,
              pointRadius: 0,
              fill: true
            },
            {
              label: 'Forecast',
              data: computeForecastPoints(filteredTelemetry, [70, 80, 90]).map((p) => ({ x: p.date, y: p.forecasted_percentage })),
              borderColor: '#f8485e',
              backgroundColor: '#f8485e',
              tension: 0.2,
              pointRadius: 5,
              fill: false,
              borderDash: [5, 5]
            }
          ]
        }
      : {
          datasets: [
            {
              label: 'Historical',
              data: filteredTelemetry.map((p) => ({ x: p.date, y: convertValue(p.used, usageUnit) })),
              segment: {
                borderColor: (ctx: any) =>
                  (ctx.p0.parsed.y >= threshold70 || ctx.p1.parsed.y >= threshold70)
                    ? '#f8485e'
                    : '#22c1d4'
              },
              borderColor: '#22c1d4',
              backgroundColor: 'rgba(34,193,212,0.1)',
              tension: 0.2,
              pointRadius: 0,
              fill: true
            },
            {
              label: 'Forecast',
              data: systemData ? computeForecastPointsUsed(filteredTelemetry, systemData).map((p) => ({ x: p.date, y: convertValue(p.forecasted_usage, usageUnit) })) : [],
              borderColor: '#f8485e',
              backgroundColor: '#f8485e',
              tension: 0.2,
              pointRadius: 5,
              fill: false,
              borderDash: [5, 5]
            }
          ]
        };

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

  const displayedHistory = chartHistBlur ? dummyHistory : historyChartData;
  const displayedForecast = chartForeBlur ? dummyForecast : forecastChartData;

  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        max: yMaxValue,
        grid: { color: 'rgba(255,255,255,0.1)' },
        ticks: {
          color: '#fff',
          callback: (val) => `${(val as number).toFixed(2)}${unitSuffix}`
        }
      },
      x: {
        type: 'time',
        time: { unit: 'month', displayFormats: { month: 'MMM yyyy' } },
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
            return `${context.dataset.label}: ${val.toFixed(2)}${unitSuffix}`;
          }
        }
      },
      annotation: {
        annotations: {
          threshold70: {
            type: 'line',
            yMin: threshold70,
            yMax: threshold70,
            borderColor: '#f8485e',
            borderWidth: 2,
            borderDash: [6, 6]
          },
          threshold80: {
            type: 'line',
            yMin: threshold80,
            yMax: threshold80,
            borderColor: '#f8485e',
            borderWidth: 2,
            borderDash: [6, 6]
          },
          threshold90: {
            type: 'line',
            yMin: threshold90,
            yMax: threshold90,
            borderColor: '#f8485e',
            borderWidth: 2,
            borderDash: [6, 6]
          }
        }
      }
    },
    interaction: { intersect: false, mode: 'index' }
  };

  // Ricalcolo forecastData per la prediction in percentuale
  const fc: ForecastData | null = systemData
    ? {
        unitId: systemData.unit_id,
        pool: systemData.pool,
        time_to_70: calculateForecastDays(removeDataBeforeSignificantDrop(filteredTelemetry, 30), 70),
        time_to_80: calculateForecastDays(removeDataBeforeSignificantDrop(filteredTelemetry, 30), 80),
        time_to_90: calculateForecastDays(removeDataBeforeSignificantDrop(filteredTelemetry, 30), 90),
        current_usage: systemData.perc_used,
        growth_rate: calculateDailyGrowth(removeDataBeforeSignificantDrop(filteredTelemetry, 30))
      }
    : null;

  // Controllo preliminare: se l'app è in caricamento oppure i dati sono assenti, mostro un messaggio opportuno
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <LoadingDots />
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500">{error}</div>;
  }

  if (!systemData) {
    return <div className="text-yellow-500">No system data available.</div>;
  }

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

      {/* BLOCCO - ELENCO HOSTID */}
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
            const isSelected = hRec.hostid === selectedHostid;
            return (
              <button
                key={`${hRec.hostid}-${hRec.last_date}`}
                onClick={() => setSelectedHostid(hRec.hostid)}
                className="text-left"
                style={{
                  border: isSelected ? '2px solid #f8485e' : '1px solid rgba(34,193,212,0.2)',
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
              <div className={`${healthHeadBlur ? 'blur-sm pointer-events-none' : ''} flex flex-col items-center`}>
                <div className={getHealthScoreColorClass(healthScore!.score, 'text-4xl font-bold')}>
                  {healthHeadBlur ? '??' : healthScore!.score}
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
            {healthScore!.metrics
              .filter((m) => m.name === 'Capacity')
              .map((m) => renderHealthMetric(m, capCan, capBlur))}
            {healthScore!.metrics
              .filter((m) => m.name === 'Performance')
              .map((m) => renderHealthMetric(m, perfCan, perfBlur))}
          </div>
          <div className="space-y-4">
            {healthScore!.metrics
              .filter((m) => m.name === 'Telemetry')
              .map((m) => renderHealthMetric(m, telemCan, telemBlur))}
            {healthScore!.metrics
              .filter((m) => m.name === 'Snapshots')
              .map((m) => renderHealthMetric(m, snapCan, snapBlur))}
          </div>
          <div className="space-y-4">
            {healthScore!.metrics
              .filter((m) => m.name === 'MUP')
              .map((m) => renderHealthMetric(m, mupCan, mupBlur))}
            {healthScore!.metrics
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
            {renderForecastBox('Time to 70% Capacity', forecastData.time_to_70, 'Days', t80Can, t80Blur, '#22c1d4')}
            {renderForecastBox('Time to 80% Capacity', forecastData.time_to_80, 'Days', t90Can, t90Blur, '#eeeeee')}
            {renderForecastBox('Time to 90% Capacity', forecastData.time_to_90, 'Days', t100Can, t100Blur, '#f8485e')}
          </div>
        </div>
      )}

      {/* BLOCCO - Behaviour Analysis */}
      <div className="bg-[#0b3c43] rounded-lg p-6 shadow-lg border border-[#22c1d4]/10">
        <div className="flex items-center gap-2 mb-6">
          <Activity className="w-6 h-6 text-[#22c1d4]" />
          <h2 className="text-xl text-[#f8485e] font-semibold">Behaviour Analysis</h2>
        </div>
        {systemData && (
          <StateVectorChart unitId={systemData.unit_id} pool={systemData.pool} hostId={systemData.hostid} />
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
              <div className="flex gap-3">
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
                <select
                  value={usageUnit}
                  onChange={(e) => setUsageUnit(e.target.value)}
                  className="bg-[#06272b] text-[#eeeeee] rounded px-3 py-1 border border-[#22c1d4]/20"
                  disabled={chartHistBlur}
                >
                  <option value="perc_used">%</option>
                  <option value="used_GB">GB</option>
                  <option value="used_GiB">GiB</option>
                  <option value="used_TB">TB</option>
                </select>
              </div>
            </div>
            <div className="h-[400px]">
              <Line key={`history-${timeRange}-${usageUnit}`} data={displayedHistory} options={chartOptions} redraw />
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
              <Line key={`forecast-${timeRange}-${usageUnit}`} data={displayedForecast} options={chartOptions} redraw />
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
        <div className={`p-4 rounded-lg mb-4 h-full ${getStatusBg(metric.status)} ${shouldBlur ? 'blur-sm pointer-events-none' : ''}`}>
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              {metric.icon &&
                React.createElement(metric.icon, { className: getStatusColorClass(metric.status, 'w-5 h-5') })}
              <span className="font-semibold">{metric.name}</span>
            </div>
            <div className={`text-lg font-bold ${getStatusColorClass(metric.status)}`}>{displayedValue}</div>
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
    let content;
    if (shouldBlur) {
      content = '??';
    } else if (daysValue === -1) {
      content = '?';
    } else if (daysValue === -2) {
      content = <AlertTriangle className="w-6 h-6" />;
    } else if (daysValue >= 5001) {
      content = '>5000';
    } else {
      content = daysValue;
    }
    return (
      <div className="relative p-4 rounded-lg bg-[#06272b]">
        <div className={shouldBlur ? 'blur-sm pointer-events-none' : ''}>
          <h3 className="text-lg font-medium mb-2">{title}</h3>
          <div className="text-3xl font-bold" style={{ color: textColor }}>
            {content} {typeof content === 'number' ? unit : ''}
          </div>
          <p className="text-sm text-[#eeeeee]/60 mt-2">Based on current growth rate</p>
        </div>
        {shouldBlur && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center px-4 overflow-hidden">
            <Wrench className="w-6 h-6 text-white mb-2" />
            <span className="text-white text-lg break-words max-w-full">{title} Work in Progress</span>
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
