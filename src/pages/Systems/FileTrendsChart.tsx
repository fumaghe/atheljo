// src/pages/Systems/FileTrendsChart.tsx
import 'chart.js/auto';
import 'chartjs-adapter-date-fns';

import React, { useEffect, useMemo, useState } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import { subDays } from 'date-fns';
import { FilePlus, FileMinus, Layers } from 'lucide-react';
import { getSystemByUnitId } from '../../utils/mockData';

interface FileTrend {
  date: string;
  uploaded: number;
  deleted: number;
  total_files: number;
}

type Range = '1w' | '1m' | '3m' | '1y' | 'all';
const rangeMap: Record<Exclude<Range, 'all'>, number> = {
  '1w': 7,
  '1m': 30,
  '3m': 90,
  '1y': 365,
};

export default function FileTrendsChart({ unitId }: { unitId?: string }) {
  const [allTrends, setAllTrends] = useState<FileTrend[]>([]);
  const [timeRange, setTimeRange] = useState<Range>('1y');
  const [view, setView] = useState<'total' | 'delta'>('total');

  useEffect(() => {
    const system = getSystemByUnitId(unitId || 'unit-001');
    if (system) {
      setAllTrends(system.fileTrends);
    }
  }, [unitId]);

  const filtered = useMemo(() => {
    if (timeRange === 'all') return allTrends;
    const cutoff = subDays(new Date(), rangeMap[timeRange]);
    return allTrends.filter(t => new Date(t.date).getTime() >= cutoff.getTime());
  }, [allTrends, timeRange]);

  const totalUploaded = filtered.reduce((acc, p) => acc + p.uploaded, 0);
  const totalDeleted  = filtered.reduce((acc, p) => acc + p.deleted, 0);
  const lastTotal     = filtered.length > 0 ? filtered[filtered.length - 1].total_files : 0;

  if (!filtered.length)
    return (
      <div className="h-[20px] flex items-center justify-center">No data</div>
    );

  const totalData = {
    datasets: [
      {
        label: 'Total files',
        data: filtered.map((p) => ({ x: p.date, y: p.total_files })),
        borderColor: '#22c1d4',
        backgroundColor: 'rgba(34,193,212,0.2)',
        fill: true,
        tension: 0.2,
        pointRadius: 0
      }
    ]
  };

  const deltaData = {
    datasets: [
      {
        label: 'Uploaded',
        data: filtered.map((p) => ({ x: p.date, y: p.uploaded })),
        borderColor: '#22c1d4',
        backgroundColor: 'rgba(34,193,212,0.2)',
        tension: 0.2,
        pointRadius: 0
      },
      {
        label: 'Deleted',
        data: filtered.map((p) => ({ x: p.date, y: p.deleted })),
        borderColor: '#f8485e',
        backgroundColor: 'rgba(248,72,94,0.2)',
        tension: 0.2,
        pointRadius: 0
      }
    ]
  };

  return (
    <div className="bg-[#0b3c43] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-lg font-semibold">File trends</div>
        <div className="flex gap-2 text-sm">
          {(['1w','1m','3m','1y'] as Range[]).map(range => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1 rounded ${timeRange === range ? 'bg-[#22c1d4] text-[#06272b]' : 'bg-[#06272b] text-white'}`}
            >
              {range.toUpperCase()}
            </button>
          ))}
          <button
            onClick={() => setView(view === 'total' ? 'delta' : 'total')}
            className="px-3 py-1 rounded bg-[#06272b] text-white"
          >
            {view === 'total' ? 'Show delta' : 'Show total'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 text-sm">
        <div className="bg-[#06272b] rounded p-3 flex items-center gap-2">
          <FilePlus className="w-4 h-4 text-[#22c1d4]" />
          <div>
            <div className="text-xl font-semibold">{totalUploaded}</div>
            <div className="text-xs text-[#eeeeee]/60">File caricati</div>
          </div>
        </div>
        <div className="bg-[#06272b] rounded p-3 flex items-center gap-2">
          <FileMinus className="w-4 h-4 text-[#22c1d4]" />
          <div>
            <div className="text-xl font-semibold">{totalDeleted}</div>
            <div className="text-xs text-[#eeeeee]/60">File rimossi</div>
          </div>
        </div>
        <div className="bg-[#06272b] rounded p-3 flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#22c1d4]" />
          <div>
            <div className="text-xl font-semibold">{lastTotal}</div>
            <div className="text-xs text-[#eeeeee]/60">Totale attuale</div>
          </div>
        </div>
      </div>

      <div className="h-[320px]">
        {view === 'total' ? (
          <Line
            data={totalData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                x: {
                  type: 'time',
                  time: { unit: 'month' },
                  ticks: { color: '#eeeeee' },
                  grid: { color: 'rgba(238,238,238,0.1)' }
                },
                y: {
                  beginAtZero: true,
                  ticks: { color: '#eeeeee' },
                  grid: { color: 'rgba(238,238,238,0.1)' }
                }
              },
              plugins: {
                legend: {
                  labels: { color: '#eeeeee' }
                }
              }
            }}
          />
        ) : (
          <Bar
            data={deltaData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                x: {
                  type: 'time',
                  time: { unit: 'month' },
                  stacked: true,
                  ticks: { color: '#eeeeee' },
                  grid: { color: 'rgba(238,238,238,0.1)' }
                },
                y: {
                  stacked: true,
                  beginAtZero: true,
                  ticks: { color: '#eeeeee' },
                  grid: { color: 'rgba(238,238,238,0.1)' }
                }
              },
              plugins: {
                legend: {
                  labels: { color: '#eeeeee' }
                }
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
