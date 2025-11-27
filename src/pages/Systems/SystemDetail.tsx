// src/pages/Systems/SystemDetail.tsx
import 'chart.js/auto';
import React, { useMemo } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Database, Gauge, Signal, TrendingUp, Wrench } from 'lucide-react';
import { calculateSystemHealthScore } from '../../utils/calculateSystemHealthScore';
import { getSystemByUnitId } from '../../utils/mockData';

export default function SystemDetail() {
  const { unitId } = useParams<{ unitId: string }>();
  const navigate = useNavigate();
  const system = getSystemByUnitId(unitId);

  const healthScore = system ? calculateSystemHealthScore(system) : 0;

  const capacityChart = useMemo(() => {
    if (!system) return null;
    return {
      labels: system.capacityHistory.map(point => point.date),
      datasets: [
        {
          label: 'Used Capacity (GB)',
          data: system.capacityHistory.map(point => point.used),
          borderColor: '#22c1d4',
          backgroundColor: 'rgba(34,193,212,0.2)',
          fill: true,
          tension: 0.25,
        },
        {
          label: 'Total Capacity (GB)',
          data: system.capacityHistory.map(point => point.total),
          borderColor: '#f8485e',
          borderDash: [5, 5],
          fill: false,
        },
      ],
    };
  }, [system]);

  const forecastChart = useMemo(() => {
    if (!system) return null;
    return {
      labels: system.usageForecast.map(point => point.date),
      datasets: [
        {
          label: 'Forecasted Usage (GB)',
          data: system.usageForecast.map(point => point.forecasted_usage),
          borderColor: '#22c1d4',
          backgroundColor: 'rgba(34,193,212,0.2)',
          fill: true,
          tension: 0.25,
        },
        {
          label: 'Forecasted %',
          data: system.usageForecast.map(point => point.forecasted_percentage),
          borderColor: '#f8485e',
          borderDash: [5, 5],
          yAxisID: 'percentage',
        },
      ],
    };
  }, [system]);

  const datasetChart = useMemo(() => {
    if (!system) return null;
    return {
      labels: system.datasetHistory.map(point => point.date),
      datasets: [
        {
          label: 'Snapshot Used (GB)',
          data: system.datasetHistory.map(point => point.used),
          backgroundColor: '#22c1d4',
        },
        {
          label: 'Total Snapshot Capacity (GB)',
          data: system.datasetHistory.map(point => point.total),
          backgroundColor: '#f8485e',
        },
      ],
    };
  }, [system]);

  if (!system) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <div className="text-[#f8485e]">System not found in offline dataset.</div>
      </div>
    );
  }

  const healthColor = healthScore >= 80 ? 'text-[#22c1d4]' : healthScore >= 50 ? 'text-[#eeeeee]' : 'text-[#f8485e]';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/systems')}
          className="p-2 rounded-full hover:bg-[#0b3c43]"
        >
          <ArrowLeft className="w-6 h-6 text-[#22c1d4]" />
        </button>
        <div>
          <h1 className="text-2xl font-bold">{system.name}</h1>
          <p className="text-[#eeeeee]/70">{system.type} • {system.company}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#0b3c43] p-4 rounded-lg">
          <div className="text-sm text-[#eeeeee]/70 mb-1">Health score</div>
          <div className={`text-3xl font-bold ${healthColor}`}>{healthScore.toFixed(0)}</div>
          <div className="text-xs text-[#eeeeee]/60">Calcolato sui valori di esempio</div>
        </div>
        <div className="bg-[#0b3c43] p-4 rounded-lg">
          <div className="flex items-center justify-between text-sm text-[#eeeeee]/70 mb-1">
            <span>Used capacity</span>
            <Database className="w-4 h-4 text-[#22c1d4]" />
          </div>
          <div className="text-3xl font-bold">{system.perc_used}%</div>
          <div className="text-xs text-[#eeeeee]/60">{system.used} GB / {system.avail} GB</div>
        </div>
        <div className="bg-[#0b3c43] p-4 rounded-lg">
          <div className="flex items-center justify-between text-sm text-[#eeeeee]/70 mb-1">
            <span>Snapshot usage</span>
            <Gauge className="w-4 h-4 text-[#22c1d4]" />
          </div>
          <div className="text-3xl font-bold">{system.perc_snap}%</div>
          <div className="text-xs text-[#eeeeee]/60">{system.used_snap} GB snapshot</div>
        </div>
        <div className="bg-[#0b3c43] p-4 rounded-lg">
          <div className="flex items-center justify-between text-sm text-[#eeeeee]/70 mb-1">
            <span>Telemetry</span>
            <Signal className="w-4 h-4 text-[#22c1d4]" />
          </div>
          <div className="text-3xl font-bold">{system.sending_telemetry ? 'Active' : 'Inactive'}</div>
          <div className="text-xs text-[#eeeeee]/60">Delay: {system.telemetryDelay || 0} mins</div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-[#0b3c43] rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Usage history</h2>
            <TrendingUp className="w-5 h-5 text-[#22c1d4]" />
          </div>
          <div className="h-[320px]">
            {capacityChart && (
              <Line
                data={capacityChart}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    y: { beginAtZero: true },
                  },
                }}
              />
            )}
          </div>
        </div>

        <div className="bg-[#0b3c43] rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Usage forecast</h2>
            <Wrench className="w-5 h-5 text-[#22c1d4]" />
          </div>
          <div className="h-[320px]">
            {forecastChart && (
              <Line
                data={forecastChart}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    y: { beginAtZero: true },
                    percentage: { position: 'right', beginAtZero: true, max: 100 },
                  },
                }}
              />
            )}
          </div>
        </div>
      </div>

      <div className="bg-[#0b3c43] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Snapshot trends</h2>
          <TrendingUp className="w-5 h-5 text-[#22c1d4]" />
        </div>
        <div className="h-[320px]">
          {datasetChart && (
            <Bar
              data={datasetChart}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
