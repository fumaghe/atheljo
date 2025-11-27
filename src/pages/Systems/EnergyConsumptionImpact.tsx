// src/pages/Systems/EnergyConsumptionImpact.tsx
import 'chart.js/auto';
import React, { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { Zap, Cloud, Leaf } from 'lucide-react';
import { getSystemByUnitId } from '../../utils/mockData';

type Range = '1w' | '1m' | '3m' | '1y' | 'all';
const rangeMap: Record<Exclude<Range, 'all'>, number> = {
  '1w': 7,
  '1m': 30,
  '3m': 90,
  '1y': 365,
};

interface EnergyPoint {
  month: string;
  baseline_kwh: number;
  optimized_kwh: number;
}

export default function EnergyConsumptionImpact({ unitId }: { unitId?: string }) {
  const [dataPoints, setDataPoints] = useState<EnergyPoint[]>([]);
  const [timeRange, setTimeRange] = useState<Range>('3m');

  useEffect(() => {
    const system = getSystemByUnitId(unitId || 'unit-001');
    if (system) {
      setDataPoints(system.energyImpact.map(point => ({
        month: point.month,
        baseline_kwh: point.baseline,
        optimized_kwh: point.optimized,
      })));
    }
  }, [unitId]);

  const limitedPoints = dataPoints.slice(-rangeMap[timeRange as Exclude<Range, 'all'>] / 30 || undefined);
  const chartData = {
    labels: limitedPoints.map(p => p.month),
    datasets: [
      {
        label: 'Baseline (kWh)',
        data: limitedPoints.map(p => p.baseline_kwh),
        borderColor: '#f8485e',
        backgroundColor: 'rgba(248,72,94,0.2)',
        fill: true,
        tension: 0.25,
      },
      {
        label: 'Ottimizzato (kWh)',
        data: limitedPoints.map(p => p.optimized_kwh),
        borderColor: '#22c1d4',
        backgroundColor: 'rgba(34,193,212,0.2)',
        fill: true,
        tension: 0.25,
      },
    ],
  };

  const baselineAvg = limitedPoints.reduce((s, p) => s + p.baseline_kwh, 0) / Math.max(limitedPoints.length, 1);
  const optimizedAvg = limitedPoints.reduce((s, p) => s + p.optimized_kwh, 0) / Math.max(limitedPoints.length, 1);

  return (
    <div className="bg-[#0b3c43] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-lg font-semibold">Energy consumption impact</h3>
          <p className="text-sm text-[#eeeeee]/70">Dati dimostrativi senza backend</p>
        </div>
        <div className="flex gap-2 text-sm">
          {(['1w', '1m', '3m', '1y'] as Range[]).map(range => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1 rounded ${timeRange === range ? 'bg-[#22c1d4] text-[#06272b]' : 'bg-[#06272b] text-white'}`}
            >
              {range.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="bg-[#06272b] rounded p-3 flex items-center gap-2">
          <Zap className="w-5 h-5 text-[#22c1d4]" />
          <div>
            <div className="text-xl font-semibold">{baselineAvg.toFixed(1)} kWh</div>
            <div className="text-xs text-[#eeeeee]/60">Baseline media</div>
          </div>
        </div>
        <div className="bg-[#06272b] rounded p-3 flex items-center gap-2">
          <Leaf className="w-5 h-5 text-[#22c1d4]" />
          <div>
            <div className="text-xl font-semibold">{optimizedAvg.toFixed(1)} kWh</div>
            <div className="text-xs text-[#eeeeee]/60">Ottimizzato</div>
          </div>
        </div>
        <div className="bg-[#06272b] rounded p-3 flex items-center gap-2">
          <Cloud className="w-5 h-5 text-[#22c1d4]" />
          <div>
            <div className="text-xl font-semibold">{((baselineAvg - optimizedAvg) * 0.32).toFixed(1)} kg</div>
            <div className="text-xs text-[#eeeeee]/60">CO₂ evitata (stima)</div>
          </div>
        </div>
      </div>

      <div className="h-[300px]">
        <Line data={chartData} options={{ responsive: true, maintainAspectRatio: false }} />
      </div>
    </div>
  );
}
