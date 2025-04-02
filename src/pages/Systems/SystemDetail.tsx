// src/pages/Systems/SystemDetail.tsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import { format, subDays } from 'date-fns';
import { ChartOptions } from 'chart.js';
import {
  ArrowLeft,
  Activity,
  Download,
  Database,
  Zap,
  Signal,
  Camera,
  Gauge,
  BarChart,
  TrendingUp,
  Building2,
  Wrench,
  Lock
} from 'lucide-react';
import { useSubscriptionPermissions } from '../../hooks/useSubscriptionPermissions';
import firestore from '../../firebaseClient';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { calculateSystemHealthScore } from '../../utils/calculateSystemHealthScore';
import { useAuth } from '../../context/AuthContext';
import StateVectorChart from './StateVectorChart';

interface SystemData {
  name: string;
  hostid: string;
  pool: string;
  type: string;
  used: number;
  avail: number;
  used_snap: number;
  perc_used: number;
  perc_snap: number;
  sending_telemetry: boolean;
  first_date: string;
  last_date: string;
  MUP: number;
  avg_speed: number;
  avg_time: number;
  company: string;
}

interface ForecastData {
  hostid: string;
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
  icon: React.ElementType;
  impact: string;
  weight: number;
}

interface TelemetryData {
  date: string; // ISO string
  hostid: string;
  used: number;
  total_space: number;
  perc_used: number;
  snap: number;
  perc_snap: number;
  pool: string;
}

interface ForecastPoint {
  date: string; // ISO string
  hostid: string;
  forecasted_usage: number;
  forecasted_percentage: number;
}

// --- Caching globale per SystemDetail (20 minuti) ---
interface CachedSystemDetail {
  hostId: string;
  systemData: SystemData;
  telemetryData: TelemetryData[];
  forecastPoints: ForecastPoint[];
  forecastData: ForecastData;
  healthScore: { score: number; metrics: HealthMetric[] };
}
let cachedSystemDetail: CachedSystemDetail | null = null;
let systemDetailCacheTimestamp: number | null = null;
const SYSTEM_DETAIL_CACHE_DURATION = 20 * 60 * 1000;

function SystemDetail() {
  const { hostId } = useParams<{ hostId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Permessi di accesso per vari componenti (i valori di "canAccess" e "shouldBlur" sono ottenuti
  // in base al tipo di abbonamento dell'utente, senza forzare alcun blur in base al ruolo)
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

  const [systemData, setSystemData] = useState<SystemData | null>(null);
  const [forecastData, setForecastData] = useState<ForecastData | null>(null);
  const [healthScore, setHealthScore] = useState<{ score: number; metrics: HealthMetric[] } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [telemetryData, setTelemetryData] = useState<TelemetryData[]>([]);
  const [forecastPoints, setForecastPoints] = useState<ForecastPoint[]>([]);
  const [timeRange, setTimeRange] = useState('1y');

  // Funzione per filtrare i dati in base a un intervallo di tempo
  function getTimeRangeData<T extends { date: string }>(data: T[], range: string): T[] {
    const now = new Date();
    const rangeMap: Record<string, number> = {
      '1m': 30,
      '3m': 90,
      '6m': 180,
      '1y': 365,
      'all': 9999
    };
    const days = rangeMap[range] || 180;
    const cutoff = subDays(now, days);
    return data.filter(point => new Date(point.date) >= cutoff);
  }

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const now = Date.now();

        // Usa la cache se valida
        if (
          cachedSystemDetail &&
          systemDetailCacheTimestamp &&
          now - systemDetailCacheTimestamp < SYSTEM_DETAIL_CACHE_DURATION &&
          cachedSystemDetail.hostId === hostId
        ) {
          setSystemData(cachedSystemDetail.systemData);
          setTelemetryData(cachedSystemDetail.telemetryData);
          setForecastPoints(cachedSystemDetail.forecastPoints);
          setForecastData(cachedSystemDetail.forecastData);
          setHealthScore(cachedSystemDetail.healthScore);
          return;
        }

        // Carica SystemData
        const systemQuery = query(
          collection(firestore, 'system_data'),
          where('hostid', '==', hostId)
        );
        const systemSnapshot = await getDocs(systemQuery);
        if (systemSnapshot.empty) {
          setError('System not found');
          return;
        }
        const systemDoc = systemSnapshot.docs[0];
        const sData = systemDoc.data();
        const system: SystemData = {
          name: sData.name || '',
          hostid: sData.hostid || '',
          pool: sData.pool || '',
          type: sData.type || '',
          used: Number(sData.used),
          avail: Number(sData.avail),
          used_snap: Number(sData.used_snap),
          perc_used: Number(sData.perc_used),
          perc_snap: Number(sData.perc_snap),
          sending_telemetry: String(sData.sending_telemetry).toLowerCase() === 'true',
          first_date: sData.first_date || '',
          last_date: sData.last_date || '',
          MUP: Number(sData.MUP),
          avg_speed: Number(sData.avg_speed),
          avg_time: Number(sData.avg_time),
          company: sData.company || ''
        };
        setSystemData(system);

        // Filtro per company
        if (user) {
          if (user.role === 'admin_employee') {
            if (
              user.visibleCompanies &&
              !user.visibleCompanies.includes('all') &&
              !user.visibleCompanies.includes(system.company)
            ) {
              setError('Access denied');
              return;
            }
          } else if (user.role !== 'admin' && system.company !== user.company) {
            setError('Access denied');
            return;
          }
        }

        // Carica Telemetry da "capacity_trends"
        const telemetryQuery = query(
          collection(firestore, 'capacity_trends'),
          where('hostid', '==', hostId)
        );
        const telemetrySnapshot = await getDocs(telemetryQuery);
        let systemTelemetry: TelemetryData[] = [];
        telemetrySnapshot.forEach((doc) => {
          const data = doc.data();
          systemTelemetry.push({
            hostid: data.hostid || '',
            pool: data.pool || '',
            used: Number(data.used),
            total_space: Number(data.total_space),
            perc_used: Number(data.perc_used),
            snap: Number(data.snap),
            perc_snap: Number(data.perc_snap),
            date: data.date && data.date.toDate ? data.date.toDate().toISOString() : data.date || ''
          });
        });
        // (Opzionale) Filtra valori anomali e ordina per data
        systemTelemetry = systemTelemetry
          .filter(t => t.perc_used >= 0 && t.perc_used <= 100)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setTelemetryData(systemTelemetry);

        // Carica ForecastPoints da "usage_forecast"
        const forecastQuery = query(
          collection(firestore, 'usage_forecast'),
          where('hostid', '==', hostId)
        );
        const forecastSnapshot = await getDocs(forecastQuery);
        let forecastPointsData: ForecastPoint[] = [];
        forecastSnapshot.forEach((doc) => {
          const data = doc.data();
          forecastPointsData.push({
            hostid: data.hostid || '',
            forecasted_usage: Number(data.forecasted_usage),
            forecasted_percentage: Number(data.forecasted_percentage),
            date: data.date && data.date.toDate ? data.date.toDate().toISOString() : data.date || ''
          });
        });
        // Ordina per data
        forecastPointsData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setForecastPoints(forecastPointsData);

        // Calcola Forecast
        const forecast: ForecastData = {
          hostid: hostId!,
          time_to_80: calculateDaysToThreshold(forecastPointsData, 80),
          time_to_90: calculateDaysToThreshold(forecastPointsData, 90),
          time_to_100: calculateDaysToThreshold(forecastPointsData, 100),
          current_usage: system.perc_used,
          growth_rate: calculateGrowthRate(forecastPointsData)
        };
        setForecastData(forecast);

        // Calcola Health Score
        const { finalScore, metrics } = computeHealthScore(system);
        setHealthScore({
          score: finalScore,
          metrics
        });

        // Aggiorna la cache
        cachedSystemDetail = {
          hostId: hostId!,
          systemData: system,
          telemetryData: systemTelemetry,
          forecastPoints: forecastPointsData,
          forecastData: forecast,
          healthScore: { score: finalScore, metrics }
        };
        systemDetailCacheTimestamp = now;
      } catch (err) {
        console.error('Error loading system data:', err);
        setError('Failed to load system data');
      } finally {
        setIsLoading(false);
      }
    };

    if (hostId) loadData();
  }, [hostId, user]);

  // --- Helper: Calcolo giorni a soglia ---
  function calculateDaysToThreshold(forecastPoints: ForecastPoint[], threshold: number) {
    if (!forecastPoints.length) return -1;
    const today = new Date();
    const point = forecastPoints.find(p => Number(p.forecasted_percentage) >= threshold);
    if (!point) return -1;
    const thresholdDate = new Date(point.date);
    const diffTime = thresholdDate.getTime() - today.getTime();
    return diffTime > 0 ? Math.ceil(diffTime / (1000 * 60 * 60 * 24)) : -1;
  }

  // --- Helper: Calcolo growth rate ---
  function calculateGrowthRate(forecastPoints: ForecastPoint[]): number {
    if (forecastPoints.length < 2) return 0;
    const first = forecastPoints[0];
    const last = forecastPoints[forecastPoints.length - 1];
    const daysDiff = (new Date(last.date).getTime() - new Date(first.date).getTime()) / (1000 * 60 * 60 * 24);
    const percentageDiff = Number(last.forecasted_percentage) - Number(first.forecasted_percentage);
    return Number((percentageDiff / daysDiff).toFixed(2));
  }

  // --- Helper: Calcolo Health Score con breakdown ---
  function computeHealthScore(system: SystemData) {
    const finalScore = calculateSystemHealthScore(system);
    const percUsed = system.perc_used;
    const avgTime = system.avg_time;
    const usedSnap = system.used_snap;
    const percSnap = system.perc_snap;
    const MUP = system.MUP;

    const capacityScore = percUsed <= 55 ? 100 : Math.max(0, 100 - ((percUsed - 55) * (100 / 45)));
    const performanceScore = Math.max(0, 100 - 10 * Math.abs(avgTime - 5));
    const telemetryScore = system.sending_telemetry ? 100 : 0;
    const snapshotsScore = usedSnap > 0 ? Math.max(0, Math.min(100, 100 - percSnap)) : 0;
    const mupScore = MUP <= 55 ? 100 : Math.max(0, 100 - ((MUP - 55) * (100 / 45)));

    const weightCapacity = 0.40;
    const weightPerformance = 0.20;
    const weightTelemetry = 0.15;
    const weightSnapshots = 0.10;
    const weightMUP = 0.15;

    const capacityImpact = weightCapacity * (capacityScore - 50);
    const performanceImpact = weightPerformance * (performanceScore - 50);
    const telemetryImpact = weightTelemetry * (telemetryScore - 50);
    const snapshotsImpact = weightSnapshots * (snapshotsScore - 50);
    const mupImpact = weightMUP * (mupScore - 50);
    const utilizationScore = (capacityScore + snapshotsScore) / 2;
    const utilizationImpact = utilizationScore - 50;

    const metrics: HealthMetric[] = [
      {
        name: 'Capacity',
        value: Number(capacityScore.toFixed(1)),
        rawValue: Number((100 - percUsed).toFixed(1)),
        unit: '%',
        status: capacityScore < 50 ? 'critical' : capacityScore < 70 ? 'warning' : 'good',
        message: `${(system.used / 1024).toFixed(1)} TB used of ${((system.used + system.avail) / 1024).toFixed(1)} TB total`,
        icon: Database,
        impact: `${capacityImpact >= 0 ? '+' : ''}${capacityImpact.toFixed(1)} points`,
        weight: weightCapacity * 100
      },
      {
        name: 'Performance',
        value: Number(performanceScore.toFixed(1)),
        unit: '',
        status: performanceScore < 50 ? 'critical' : performanceScore < 60 ? 'warning' : 'good',
        message: `Telemetry every ${avgTime.toFixed(1)} minutes`,
        icon: Zap,
        impact: `${performanceImpact >= 0 ? '+' : ''}${performanceImpact.toFixed(1)} points`,
        weight: weightPerformance * 100
      },
      {
        name: 'Telemetry',
        value: telemetryScore,
        rawValue: system.sending_telemetry ? 'Active' : 'Inactive',
        unit: '',
        status: telemetryScore === 100 ? 'good' : 'critical',
        message: system.sending_telemetry
          ? 'System is actively sending telemetry data'
          : 'System is not sending telemetry data',
        icon: Signal,
        impact: `${telemetryImpact >= 0 ? '+' : ''}${telemetryImpact.toFixed(1)} points`,
        weight: weightTelemetry * 100
      },
      {
        name: 'Snapshots',
        value: Number(snapshotsScore.toFixed(1)),
        rawValue: usedSnap,
        unit: '%',
        status: snapshotsScore < 50 ? 'critical' : snapshotsScore < 70 ? 'warning' : 'good',
        message: usedSnap > 0 ? `${usedSnap} GB used for snapshots` : 'No snapshots found',
        icon: Camera,
        impact: `${snapshotsImpact >= 0 ? '+' : ''}${snapshotsImpact.toFixed(1)} points`,
        weight: weightSnapshots * 100
      },
      {
        name: 'Max Usage',
        value: Number(mupScore.toFixed(1)),
        rawValue: MUP,
        unit: '',
        status: mupScore < 50 ? 'critical' : mupScore < 60 ? 'warning' : 'good',
        message: 'Resource efficiency based on usage patterns',
        icon: BarChart,
        impact: `${mupImpact >= 0 ? '+' : ''}${mupImpact.toFixed(1)} points`,
        weight: weightMUP * 100
      },
      {
        name: 'Utilization',
        value: Number(utilizationScore.toFixed(1)),
        rawValue: utilizationScore.toFixed(1),
        unit: '%',
        status: utilizationScore < 50 ? 'critical' : utilizationScore < 70 ? 'warning' : 'good',
        message: 'Avg of Capacity and Snapshots scores',
        icon: Gauge,
        impact: `${utilizationImpact >= 0 ? '+' : ''}${utilizationImpact.toFixed(1)} points`,
        weight: 0
      }
    ];

    return { finalScore, metrics };
  }

  const getStatusColor = (status: string, impact: string) =>
    impact.startsWith('+') ? 'text-[#22c1d4]' : 'text-[#f8485e]';

  const getStatusBg = (status: string, impact: string) =>
    impact.startsWith('+') ? 'bg-[#22c1d4]/20' : 'bg-[#f8485e]/20';

  const getHealthScoreColor = (score: number) => {
    if (score >= 80) return 'text-[#22c1d4]';
    if (score >= 50) return 'text-[#eeeeee]';
    return 'text-[#f8485e]';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-[#22c1d4] text-xl">Loading system data...</div>
      </div>
    );
  }

  if (error || !systemData || !healthScore) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-[#f8485e] text-xl">{error || 'System data not found'}</div>
      </div>
    );
  }

  // Filtra i dati in base al timeRange
  const filteredTelemetry = getTimeRangeData<TelemetryData>(telemetryData, timeRange);
  const filteredForecast = getTimeRangeData<ForecastPoint>(forecastPoints, timeRange);

  // ============ CHART DATA REALI ============
  const historyChartData = {
    datasets: [
      {
        label: 'Usage',
        data: filteredTelemetry.map(point => ({ x: point.date, y: point.perc_used })),
        borderColor: '#22c1d4',
        backgroundColor: 'rgba(34, 193, 212, 0.1)',
        tension: 0.2,
        pointRadius: 0,
        fill: true
      }
    ]
  };

  const forecastChartData = {
    datasets: [
      {
        label: 'Historical',
        data: filteredTelemetry.map(point => ({ x: point.date, y: point.perc_used })),
        borderColor: '#22c1d4',
        backgroundColor: 'rgba(34, 193, 212, 0.1)',
        tension: 0.2,
        pointRadius: 0,
        fill: true
      },
      {
        label: 'Forecast',
        data: filteredForecast.map(point => ({ x: point.date, y: point.forecasted_percentage })),
        borderColor: '#f8485e',
        borderDash: [5, 5],
        tension: 0.2,
        pointRadius: 0,
        fill: false
      }
    ]
  };

  // Dati dummy (stesso formato)
  const dummyHistoryChartData = {
    datasets: [
      {
        label: 'Usage (Dummy)',
        data: [
          { x: '2023-01-01', y: 20 },
          { x: '2023-02-01', y: 40 },
          { x: '2023-03-01', y: 60 }
        ],
        borderColor: '#888888',
        backgroundColor: 'rgba(136, 136, 136, 0.1)',
        tension: 0.2,
        pointRadius: 0,
        fill: true
      }
    ]
  };

  const dummyForecastChartData = {
    datasets: [
      {
        label: 'Historical (Dummy)',
        data: [
          { x: '2023-01-01', y: 10 },
          { x: '2023-02-01', y: 30 },
          { x: '2023-03-01', y: 50 }
        ],
        borderColor: '#888888',
        backgroundColor: 'rgba(136, 136, 136, 0.1)',
        tension: 0.2,
        pointRadius: 0,
        fill: true
      },
      {
        label: 'Forecast (Dummy)',
        data: [
          { x: '2023-01-01', y: null },
          { x: '2023-02-01', y: 60 },
          { x: '2023-03-01', y: 70 }
        ],
        borderColor: '#aaaaaa',
        borderDash: [5, 5],
        tension: 0.2,
        pointRadius: 0,
        fill: false
      }
    ]
  };

  // Se il grafico è in modalità blur, usa i dummy
  const displayedHistoryChartData = chartHistBlur ? dummyHistoryChartData : historyChartData;
  const displayedForecastChartData = chartForeBlur ? dummyForecastChartData : forecastChartData;

  // Opzioni del grafico
  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        grid: { color: 'rgba(255,255,255,0.1)' },
        ticks: {
          color: '#ffffff',
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
        ticks: { color: '#ffffff' }
      }
    },
    plugins: {
      legend: {
        position: 'top',
        labels: { color: '#ffffff', usePointStyle: true, pointStyle: 'circle' }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: '#0b3c43',
        titleColor: '#ffffff',
        bodyColor: '#ffffff',
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
            onClick={() => navigate(`/systems/company/${encodeURIComponent(systemData.company)}`)}
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
            <p className="text-[#eeeeee]/60">Host ID: {systemData.hostid}</p>
          </div>
        </div>
      </div>

      {/* BLOCCO “System Health Score” */}
      <div className="bg-[#0b3c43] rounded-lg p-6 shadow-lg border border-[#22c1d4]/10">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl text-[#f8485e] font-semibold flex items-center gap-2">
              <Gauge className="h-6 w-6 text-[#22c1d4]" />
              System Health Score
            </h2>
            <p className="text-[#eeeeee]/60 mt-1">Overall system health assessment</p>
          </div>
          {(() => {
            if (!healthHeadCan && !healthHeadBlur) return null;
            const displayedScore = healthHeadBlur ? '??' : healthScore.score;
            return (
              <div className="relative">
                <div className={`${healthHeadBlur ? 'blur-sm pointer-events-none' : ''} flex flex-col items-center`}>
                  <div className={`text-4xl font-bold ${getHealthScoreColor(healthScore.score)}`}>
                    {displayedScore}
                  </div>
                  <div className="text-sm text-[#eeeeee]/60">Health Score</div>
                </div>
                {healthHeadBlur && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center">
                    <Lock className="w-6 h-6 text-white" />
                  </div>
                )}
              </div>
            );
          })()}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-4">
            {healthScore.metrics
              .filter(m => m.name === 'Capacity')
              .map(metric => renderHealthMetric(metric, capCan, capBlur))}
            {healthScore.metrics
              .filter(m => m.name === 'Performance')
              .map(metric => renderHealthMetric(metric, perfCan, perfBlur))}
          </div>
          <div className="space-y-4">
            {healthScore.metrics
              .filter(m => m.name === 'Telemetry')
              .map(metric => renderHealthMetric(metric, telemCan, telemBlur))}
            {healthScore.metrics
              .filter(m => m.name === 'Snapshots')
              .map(metric => renderHealthMetric(metric, snapCan, snapBlur))}
          </div>
          <div className="space-y-4">
            {healthScore.metrics
              .filter(m => m.name === 'Max Usage')
              .map(metric => renderHealthMetric(metric, mupCan, mupBlur))}
            {healthScore.metrics
              .filter(m => m.name === 'Utilization')
              .map(metric => renderHealthMetric(metric, utilCan, utilBlur))}
          </div>
        </div>
      </div>

      {/* BLOCCO “Capacity Forecast” */}
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

      {/* BLOCCO “State Vector Analysis” */}
      <div className="bg-[#0b3c43] rounded-lg p-6 shadow-lg border border-[#22c1d4]/10">
        <div className="flex items-center gap-2 mb-6">
          <Activity className="w-6 h-6 text-[#22c1d4]" />
          <h2 className="text-xl text-[#f8485e] font-semibold">State Vector Analysis</h2>
        </div>
        <StateVectorChart hostId={systemData.hostid} pool={systemData.pool} />
      </div>

      {/* CHART - UsageHistory */}
      {(() => {
        if (!chartHistCan && !chartHistBlur) return null;
        return (
          <div className="relative bg-[#0b3c43] rounded-lg p-6 shadow-lg border border-[#22c1d4]/10">
            <div className={`${chartHistBlur ? 'blur-sm pointer-events-none' : ''}`}>
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
                <Line data={displayedHistoryChartData} options={chartOptions} />
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
        );
      })()}

      {/* CHART - UsageForecast */}
      {(() => {
        if (!chartForeCan && !chartForeBlur) return null;
        return (
          <div className="relative bg-[#0b3c43] rounded-lg p-6 shadow-lg border border-[#22c1d4]/10">
            <div className={`${chartForeBlur ? 'blur-sm pointer-events-none' : ''}`}>
              <div className="flex items-center gap-2 mb-6">
                <BarChart className="w-6 h-6 text-[#22c1d4]" />
                <h2 className="text-xl text-[#f8485e] font-semibold">Usage Forecast</h2>
              </div>
              <div className="h-[400px]">
                <Line data={displayedForecastChartData} options={chartOptions} />
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
        );
      })()}
    </div>
  );

  // --- RENDER DELLA SINGOLA METRICA ---
  function renderHealthMetric(metric: HealthMetric, canAccess: boolean, shouldBlur: boolean) {
    if (!canAccess && !shouldBlur) return null;
    const displayedName = metric.name;
    const displayedMessage = shouldBlur ? '???' : metric.message;
    const displayedImpact = shouldBlur ? '???' : metric.impact;
    const displayedWeight = shouldBlur ? '??' : `${metric.weight.toFixed(1)}%`;
    const displayedValue = shouldBlur
      ? '??'
      : (metric.name === 'Capacity' || metric.name === 'Max Usage')
        ? `${metric.rawValue}${metric.unit || ''}`
        : `${metric.value}${metric.unit || ''}`;
    return (
      <div key={metric.name} className="relative h-[160px]">
        <div className={`
            p-4 rounded-lg mb-4 h-full
            ${getStatusBg(metric.status, metric.impact)}
            ${shouldBlur ? 'blur-sm pointer-events-none' : ''}
          `}>
          <div
            className={`absolute bottom-0 left-0 h-1 ${getStatusBg(metric.status, metric.impact)}`}
            style={{ width: shouldBlur ? '50%' : `${metric.value}%` }}
          />
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <metric.icon className={`w-5 h-5 ${getStatusColor(metric.status, metric.impact)}`} />
              <span className="font-semibold">{displayedName}</span>
            </div>
            <div className={`text-lg font-bold ${getStatusColor(metric.status, metric.impact)}`}>
              {displayedValue}
            </div>
          </div>
          <p className="text-sm text-[#eeeeee]/80 mb-2 line-clamp-2">{displayedMessage}</p>
          <div className="flex justify-between items-center text-sm mt-auto">
            <span className={getStatusColor(metric.status, metric.impact)}>{displayedImpact}</span>
            <span className="text-[#eeeeee]/60">Weight: {displayedWeight}</span>
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

  // --- RENDER DEL BOX FORECAST ---
  function renderForecastBox(
    title: string,
    daysValue: number,
    unit: string,
    canAccess: boolean,
    shouldBlur: boolean,
    textColor: string
  ) {
    if (!canAccess && !shouldBlur) return null;
    const displayedDays = shouldBlur ? '??' : (daysValue === -1 ? '?' : daysValue);
    return (
      <div className="relative p-4 rounded-lg bg-[#06272b]">
        <div className={`${shouldBlur ? 'blur-sm pointer-events-none' : ''}`}>
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
}

export default SystemDetail;
