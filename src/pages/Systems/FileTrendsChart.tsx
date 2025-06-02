// src/pages/Systems/FileTrendsChart.tsx
import 'chart.js/auto';
import 'chartjs-adapter-date-fns';

import React, { useEffect, useState, useMemo } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Line, Bar } from 'react-chartjs-2';
import { subDays } from 'date-fns';
import {
  FilePlus,
  FileMinus,
  Layers
} from 'lucide-react';                       // icone per le card
import firestore from '../../firebaseClient';

interface FileTrend {
  date: string;
  hostid: string;
  pool: string;
  unit_id: string;
  total_files: number;
  uploaded: number;
  deleted: number;
}

type Range = '1w' | '1m' | '3m' | '1y' | 'all';

const rangeMap: Record<Exclude<Range, 'all'>, number> = {
  '1w': 7,
  '1m': 30,
  '3m': 90,
  '1y': 365
};

export default function FileTrendsChart({
  hostId,
  pool
}: {
  hostId: string;
  pool: string;
}) {
  const [allTrends, setAllTrends]   = useState<FileTrend[]>([]);
  const [timeRange, setTimeRange]   = useState<Range>('1y');
  const [view, setView]             = useState<'total' | 'delta'>('total');
  const [isLoading, setIsLoading]   = useState(true);

  /* ───────────────────────────── fetch ─────────────────────────────── */
  useEffect(() => {
    (async () => {
      setIsLoading(true);
      const q = query(
        collection(firestore, 'file_trends'),
        where('hostid', '==', hostId),
        where('pool', '==', pool)
      );
      const snap = await getDocs(q);
      const loaded: FileTrend[] = [];
      snap.forEach((doc) => {
        const d = doc.data();
        loaded.push({
          date: d.telemetry_sent.replace(' ', 'T'),
          hostid: d.hostid,
          pool: d.pool,
          unit_id: d.unit_id,
          total_files: Number(d.total_files),
          uploaded: Number(d.uploaded),
          deleted: Number(d.deleted)
        });
      });
      loaded.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      setAllTrends(loaded);
      setIsLoading(false);
    })();
  }, [hostId, pool]);

  /* ─────────────────────── filtro range & metriche ─────────────────── */
  const filtered = useMemo(() => {
    if (timeRange === 'all') return allTrends;
    const cutoff = subDays(new Date(), rangeMap[timeRange]);
    return allTrends.filter(
      (t) => new Date(t.date).getTime() >= cutoff.getTime()
    );
  }, [allTrends, timeRange]);

  /* metriche per le card */
  const totalUploaded = filtered.reduce((acc, p) => acc + p.uploaded, 0);
  const totalDeleted  = filtered.reduce((acc, p) => acc + p.deleted, 0);
  const lastTotal     =
    filtered.length > 0 ? filtered[filtered.length - 1].total_files : 0;

  /* ─────────────────────────── states UI ───────────────────────────── */
  if (isLoading)
    return (
      <div className="h-[300px] flex items-center justify-center">Loading…</div>
    );
  if (!filtered.length)
    return (
      <div className="h-[20px] flex items-center justify-center">No data</div>
    );

  /* ─────────────────────────── datasets ────────────────────────────── */
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
        backgroundColor: 'rgba(34,193,212,0.6)',
        borderColor: '#22c1d4',
        stack: 'stack0'
      },
      {
        label: 'Deleted',
        data: filtered.map((p) => ({ x: p.date, y: -p.deleted })),
        backgroundColor: 'rgba(248,72,94,0.6)',
        borderColor: '#f8485e',
        stack: 'stack0'
      }
    ]
  };

  /* ───────────────────────── chart options ─────────────────────────── */
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        grid: { color: 'rgba(255,255,255,0.1)' },
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
        backgroundColor: '#0b3c43',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: '#22c1d4',
        borderWidth: 1,
        padding: 12
      }
    },
    interaction: { intersect: false, mode: 'index' as const }
  };

  /* ─────────────────────────── render ──────────────────────────────── */
  return (
    <div>
      {/* CARD METRICS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <SummaryCard
          title="Uploaded"
          value={totalUploaded}
          icon={FilePlus}
          color="#22c1d4"
        />
        <SummaryCard
          title="Deleted"
          value={totalDeleted}
          icon={FileMinus}
          color="#f8485e"
        />
        <SummaryCard
          title="Total files"
          value={lastTotal}
          icon={Layers}
          color="#eeeeee"
        />
      </div>

      {/* CONTROLS */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-3">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as Range)}
            className="bg-[#06272b] text-[#eeeeee] rounded px-3 py-1 border border-[#22c1d4]/20"
          >
            <option value="1w">Last week</option>
            <option value="1m">Last month</option>
            <option value="3m">Last 3 months</option>
            <option value="1y">Last year</option>
            <option value="all">All</option>
          </select>

          <select
            value={view}
            onChange={(e) => setView(e.target.value as 'total' | 'delta')}
            className="bg-[#06272b] text-[#eeeeee] rounded px-3 py-1 border border-[#22c1d4]/20"
          >
            <option value="total">Total files</option>
            <option value="delta">Uploaded / Deleted</option>
          </select>
        </div>
      </div>

      {/* CHART */}
      <div className="h-[300px]">
        {view === 'total' ? (
          <Line data={totalData} options={commonOptions} />
        ) : (
          <Bar
            data={deltaData}
            options={{
              ...commonOptions,
              scales: {
                ...commonOptions.scales,
                y: { ...commonOptions.scales.y, stacked: true },
                x: { ...commonOptions.scales.x, stacked: true }
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ╭────────────── summary card component ──────────────╮ */
function SummaryCard({
  title,
  value,
  icon: Icon,
  color
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div
      className="p-4 rounded-lg bg-[#06272b] border border-[#22c1d4]/10 flex items-center justify-between"
      style={{ minHeight: '88px' }}
    >
      <div>
        <p className="text-sm text-[#eeeeee]/60">{title}</p>
        <p className="text-2xl font-bold" style={{ color }}>
          {value}
        </p>
      </div>
      <Icon className="w-6 h-6" style={{ color }} />
    </div>
  );
}
