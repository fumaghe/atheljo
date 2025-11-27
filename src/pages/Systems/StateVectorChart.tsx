// src/pages/Systems/StateVectorChart.tsx
import 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import React, { useEffect, useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { subDays } from 'date-fns';
import { Activity, Gauge, Zap, Cpu } from 'lucide-react';
import { getSystemByUnitId } from '../../utils/mockData';

interface StateVectorPoint {
  timestamp: string;
  cpu: number;
  memory: number;
  iops: number;
  latency: number;
}

type Range = '1w' | '1m' | '3m' | '1y' | 'all';
const rangeMap: Record<Exclude<Range, 'all'>, number> = {
  '1w': 7,
  '1m': 30,
  '3m': 90,
  '1y': 365,
};

export default function StateVectorChart({ unitId }: { unitId?: string }) {
  const [vectors, setVectors] = useState<StateVectorPoint[]>([]);
  const [range, setRange] = useState<Range>('1m');

  useEffect(() => {
    const system = getSystemByUnitId(unitId || 'unit-001');
    if (system) {
      setVectors(system.stateVectors);
    }
  }, [unitId]);

  const filtered = useMemo(() => {
    if (range === 'all') return vectors;
    const cutoff = subDays(new Date(), rangeMap[range]);
    return vectors.filter(vec => new Date(vec.timestamp).getTime() >= cutoff.getTime());
  }, [range, vectors]);

  const chartData = {
    datasets: [
      {
        label: 'CPU %',
        data: filtered.map(v => ({ x: v.timestamp, y: v.cpu })),
        borderColor: '#22c1d4',
        backgroundColor: 'rgba(34,193,212,0.2)',
        fill: false,
        tension: 0.2,
      },
      {
        label: 'Memory %',
        data: filtered.map(v => ({ x: v.timestamp, y: v.memory })),
        borderColor: '#f8485e',
        backgroundColor: 'rgba(248,72,94,0.2)',
        fill: false,
        tension: 0.2,
      },
      {
        label: 'IOPS',
        data: filtered.map(v => ({ x: v.timestamp, y: v.iops })),
        borderColor: '#eeeeee',
        backgroundColor: 'rgba(238,238,238,0.2)',
        fill: false,
        yAxisID: 'iops',
        tension: 0.2,
      },
      {
        label: 'Latency (ms)',
        data: filtered.map(v => ({ x: v.timestamp, y: v.latency })),
        borderColor: '#8bc34a',
        backgroundColor: 'rgba(139,195,74,0.2)',
        fill: false,
        yAxisID: 'latency',
        tension: 0.2,
      },
    ],
  };

  return (
    <div className="bg-[#0b3c43] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#22c1d4]" />
          <span className="text-lg font-semibold">Performance snapshot</span>
        </div>
        <div className="flex gap-2 text-sm">
          {(['1w','1m','3m','1y'] as Range[]).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 rounded ${range === r ? 'bg-[#22c1d4] text-[#06272b]' : 'bg-[#06272b] text-white'}`}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm">
        <div className="bg-[#06272b] rounded p-3 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[#22c1d4]" />
          <div>
            <div className="text-xl font-semibold">{filtered.at(-1)?.cpu ?? 0}%</div>
            <div className="text-xs text-[#eeeeee]/60">CPU</div>
          </div>
        </div>
        <div className="bg-[#06272b] rounded p-3 flex items-center gap-2">
          <Gauge className="w-4 h-4 text-[#22c1d4]" />
          <div>
            <div className="text-xl font-semibold">{filtered.at(-1)?.memory ?? 0}%</div>
            <div className="text-xs text-[#eeeeee]/60">Memory</div>
          </div>
        </div>
        <div className="bg-[#06272b] rounded p-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-[#22c1d4]" />
          <div>
            <div className="text-xl font-semibold">{filtered.at(-1)?.iops ?? 0}</div>
            <div className="text-xs text-[#eeeeee]/60">IOPS</div>
          </div>
        </div>
        <div className="bg-[#06272b] rounded p-3 flex items-center gap-2">
          <Gauge className="w-4 h-4 text-[#22c1d4]" />
          <div>
            <div className="text-xl font-semibold">{filtered.at(-1)?.latency ?? 0} ms</div>
            <div className="text-xs text-[#eeeeee]/60">Latency</div>
          </div>
        </div>
      </div>

      <div className="h-[320px]">
        <Line
          data={chartData}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { type: 'time', time: { unit: 'week' }, ticks: { color: '#eeeeee' }, grid: { color: 'rgba(238,238,238,0.1)' } },
              y: { beginAtZero: true, ticks: { color: '#eeeeee' }, grid: { color: 'rgba(238,238,238,0.1)' } },
              iops: { position: 'right', beginAtZero: true, ticks: { color: '#eeeeee' }, grid: { color: 'rgba(238,238,238,0.1)' } },
              latency: { position: 'right', beginAtZero: true, ticks: { color: '#eeeeee' }, grid: { color: 'rgba(238,238,238,0.1)' } },
            },
            plugins: { legend: { labels: { color: '#eeeeee' } } },
          }}
        />
      </div>
    </div>
  );
}
