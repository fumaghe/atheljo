import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Server, Lock } from 'lucide-react';
import { AggregatedStats } from '../types';

interface SystemStatusChartProps {
  aggregatedStats: AggregatedStats;
  subscription: { canAccess: boolean; shouldBlur: boolean };
}

const dummySystemStatusChartData = {
  labels: ['Healthy', 'Warning', 'Critical'],
  datasets: [
    {
      data: [50, 30, 20],
      backgroundColor: [
        'rgba(34, 194, 212, 0.36)',
        'rgba(238, 238, 238, 0.36)',
        'rgba(248, 72, 94, 0.31)'
      ],
      borderColor: ['#22c1d4', '#eeeeee', '#f8485e'],
      borderWidth: 1,
    },
  ],
};

const SystemStatusChart: React.FC<SystemStatusChartProps> = ({ aggregatedStats, subscription }) => {
  if (!aggregatedStats) return null;
  const chartData = subscription.shouldBlur
    ? dummySystemStatusChartData
    : {
        labels: ['Healthy', 'Warning', 'Critical'],
        datasets: [
          {
            data: [
              aggregatedStats.healthySystems,
              aggregatedStats.warningSystems,
              aggregatedStats.criticalSystems
            ],
            backgroundColor: [
              'rgba(34, 193, 212, 0.7)',
              'rgba(238, 238, 238, 0.7)',
              'rgba(248, 72, 94, 0.7)'
            ],
            borderColor: ['#22c1d4', '#eeeeee', '#f8485e'],
            borderWidth: 1
          }
        ]
      };

  return (
    <div className="relative bg-[#0b3c43] rounded-lg p-6 shadow-lg border border-[#22c1d4]/10 transition-all hover:border-[#22c1d4]/30">
      {subscription.shouldBlur && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center">
          <Lock className="w-6 h-6 text-white mb-2" />
          <span className="text-white text-lg">
            Upgrade subscription to see System Status Chart
          </span>
        </div>
      )}
      <div className={`${subscription.shouldBlur ? 'blur pointer-events-none' : ''}`}>
        <h2 className="text-xl text-[#eeeeee] font-semibold mb-4 flex items-center gap-2">
          <Server className="w-5 h-5 text-[#22c1d4]" />
          System Status
        </h2>
        <div className="h-[220px] sm:h-[250px] md:h-[250px]">
          <Doughnut data={chartData} options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'right',
                labels: { color: '#eeeeee', usePointStyle: true, pointStyle: 'circle' }
              },
              tooltip: {
                backgroundColor: '#0b3c43',
                titleColor: '#eeeeee',
                bodyColor: '#eeeeee',
                borderColor: '#22c1d4',
                borderWidth: 1,
                padding: 12,
                displayColors: true
              }
            }
          }} />
        </div>
      </div>
    </div>
  );
};

export default SystemStatusChart;
