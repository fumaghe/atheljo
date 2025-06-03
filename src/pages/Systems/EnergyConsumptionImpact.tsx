// src/pages/Systems/EnergyConsumptionImpact.tsx
import 'chart.js/auto';
import 'chartjs-adapter-date-fns';

import React, { useEffect, useMemo, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Line } from 'react-chartjs-2';
import { subDays } from 'date-fns';
import { Zap, Cloud, Leaf, AlertTriangle } from 'lucide-react';
import firestore from '../../firebaseClient';

/* ─────────────────── tipizzazioni ─────────────────── */
interface EnergySample {
  date: string;          // ISO  YYYY-MM-DD
  hostid: string;
  pool: string;
  unit_id?: string;
  kwh_consumed: number;
  co2_emissions: number; // se assente si calcola in fetch
}
type Range = '1w' | '1m' | '3m' | '1y' | 'all';
const rangeMap: Record<Exclude<Range, 'all'>, number> = {
  '1w': 7,
  '1m': 30,
  '3m': 90,
  '1y': 365
};
const EMISSION_FACTOR = 0.32; // kg CO₂ per kWh
const KWH_THRESHOLD   = 300;  // soglia alert consumo medio
const CO2_THRESHOLD   = 100;  // soglia alert emissioni medie

/* ─────────────────── componente principale ─────────────────── */
export default function EnergyConsumptionImpact({
  hostId,
  pool
}: {
  hostId: string;
  pool: string;
}) {
  const [samples, setSamples]       = useState<EnergySample[]>([]);
  const [timeRange, setTimeRange]   = useState<Range>('1m');
  const [isLoading, setIsLoading]   = useState(true);

  /* ───── fetch Firestore ───── */
  useEffect(() => {
    (async () => {
      setIsLoading(true);
      const q = query(
        collection(firestore, 'energy_trends'),
        where('hostid', '==', hostId),
        where('pool',   '==', pool)
      );
      const snap = await getDocs(q);
      const loaded: EnergySample[] = [];
      snap.forEach(d => {
        const data = d.data();
        loaded.push({
          date: data.date,
          hostid: data.hostid,
          pool: data.pool,
          unit_id: data.unit_id,
          kwh_consumed: Number(data.kwh_consumed),
          co2_emissions: data.co2_emissions != null
            ? Number(data.co2_emissions)
            : Number(data.kwh_consumed) * EMISSION_FACTOR
        });
      });
      loaded.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setSamples(loaded);
      setIsLoading(false);
    })();
  }, [hostId, pool]);

  /* ───── filtro per intervallo ───── */
  const filtered = useMemo(() => {
    if (timeRange === 'all') return samples;
    const cutoff = subDays(new Date(), rangeMap[timeRange]);
    return samples.filter(s => new Date(s.date) >= cutoff);
  }, [samples, timeRange]);

  /* ───── metriche chiave ───── */
  const daysCount = filtered.length;
  const sumKwh    = filtered.reduce((a, s) => a + s.kwh_consumed, 0);
  const avgKwh    = daysCount ? +(sumKwh / daysCount).toFixed(1) : 0;
  const avgCo2    = +(avgKwh * EMISSION_FACTOR).toFixed(1);

  /* ───── grafico ───── */
  const chartData = {
    datasets: [
      {
        label: 'kWh',
        data: filtered.map(s => ({ x: s.date, y: s.kwh_consumed })),
        borderColor: '#38BDF8',
        backgroundColor: 'rgba(56,189,248,0.15)',
        tension: 0.2,
        pointRadius: 0,
        fill: true
      },
      {
        label: 'kg CO₂',
        data: filtered.map(s => ({ x: s.date, y: s.co2_emissions })),
        borderColor: '#10B981',
        backgroundColor: 'rgba(16,185,129,0.15)',
        tension: 0.2,
        pointRadius: 0,
        fill: true,
        yAxisID: 'y2'
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        grid: { color: 'rgba(255,255,255,0.1)' },
        ticks: { color: '#fff' }
      },
      y2: {
        position: 'right' as const,
        grid: { drawOnChartArea: false },
        ticks: { color: '#fff' }
      },
      x: {
        type: 'time' as const,
        time: { unit: 'day' as const },
        grid: { color: 'rgba(255,255,255,0.1)' },
        ticks: { color: '#fff' }
      }
    },
    plugins: {
      legend: { position: 'top' as const, labels: { color: '#fff' } },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        backgroundColor: '#06272b',
        titleColor: '#F3F4F6',
        bodyColor: '#F3F4F6',
        borderColor: '#38BDF8',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (ctx: any) =>
            ctx.dataset.label === 'kWh'
              ? `Consumo: ${ctx.parsed.y} kWh`
              : `CO₂: ${ctx.parsed.y} kg`
        }
      }
    },
    interaction: { intersect: false, mode: 'index' as const }
  };

  /* ───── rendering condizionale ───── */
  if (isLoading) {
    return (
      <div className="h-[300px] flex items-center justify-center">
        Loading…
      </div>
    );
  }
  if (!filtered.length) {
    return (
      <div className="h-[20px] flex items-center justify-center">
        No data.
      </div>
    );
  }

  const kwhAlert = avgKwh > KWH_THRESHOLD;
  const co2Alert = avgCo2 > CO2_THRESHOLD;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ——— HEADER ——— */}
      <div className="flex items-center gap-2">
        <Leaf className="w-6 h-6" style={{ color: '#10B981' }} aria-label="Icona foglia – sostenibilità" />
        <h2 className="text-xl font-semibold" style={{ color: '#F3F4F6' }}>
          Energy Consumption & CO₂ Impact
        </h2>
      </div>

      {/* ——— METRIC CARDS ——— */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <MetricCard
          title="Avg Daily Consumption"
          value={`${avgKwh} kWh`}
          icon={Zap}
          color="#38BDF8"
          alert={kwhAlert}
        />
        <MetricCard
          title="Avg Daily CO₂ Emissions"
          value={`${avgCo2} kg CO₂`}
          icon={Cloud}
          color="#10B981"
          alert={co2Alert}
        />
      </div>

      {/* ——— CONTROLLI RANGE ——— */}
      <div className="flex gap-3">
        <select
          value={timeRange}
          onChange={e => setTimeRange(e.target.value as Range)}
          className="bg-[#06272b] text-[#eeeeee] rounded px-3 py-1 border border-[#22c1d4]/20"
        >
          <option value="1w">Last week</option>
          <option value="1m">Last month</option>
          <option value="3m">Last 3 months</option>
          <option value="1y">Last year</option>
          <option value="all">All</option>
        </select>
      </div>

      {/* ——— GRAFICO ——— */}
      <div className="h-[300px]">
        <Line data={chartData} options={chartOptions} />
      </div>

    </div>
  );
}

/* ────────── sottocomponente card ────────── */
function MetricCard({
  title,
  value,
  icon: Icon,
  color,
  alert
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  color: string;
  alert: boolean;
}) {
  return (
    <div
      className="p-4 rounded-lg flex items-center justify-between transition-colors"
      style={{
        background: '#06272b',
        border: `1px solid ${alert ? '#EF4444' : 'rgba(255,255,255,0.1)'}`,
        minHeight: '88px'
      }}
    >
      <div>
        <p className="text-sm" style={{ color: '#D1D5DB' }}>
          {title}
        </p>
        <p className="text-2xl font-bold" style={{ color: '#F3F4F6' }}>
          {value}
        </p>
      </div>
      <Icon className="w-6 h-6" style={{ color }} />
    </div>
  );
}
