import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import { HardDrive, Lock } from 'lucide-react';
import { AggregatedStats } from '../types';

interface CapacityDistributionChartProps {
  aggregatedStats: AggregatedStats;
  subscription: { canAccess: boolean; shouldBlur: boolean };
}

const dummyCapacityDistributionChartData = {
  labels: ['Used', 'Snapshots', 'Free'],
  datasets: [
    {
      data: [300, 100, 600],
      backgroundColor: [
        'rgba(34, 193, 212, 0.36)',
        'rgba(248, 72, 93, 0.31)',
        'rgba(238, 238, 238, 0.36)'
      ],
      borderColor: ['#22c1d4', '#f8485e', '#eeeeee'],
      borderWidth: 1,
    },
  ],
};

const CapacityDistributionChart: React.FC<CapacityDistributionChartProps> = ({ aggregatedStats, subscription }) => {
  if (!aggregatedStats) return null;
  const chartData = subscription.shouldBlur
    ? dummyCapacityDistributionChartData
    : {
        labels: ['Used', 'Snapshots', 'Free'],
        datasets: [
          {
            label: 'Capacity Distribution',
            data: [
              aggregatedStats.usedCapacity,
              aggregatedStats.usedSnapshots,
              aggregatedStats.totalCapacity - aggregatedStats.usedCapacity - aggregatedStats.usedSnapshots
            ],
            backgroundColor: [
              'rgba(34, 193, 212, 0.7)',
              'rgba(248, 72, 93, 0.7)',
              'rgba(238, 238, 238, 0.7)'
            ],
            borderColor: ['#22c1d4', '#f8485e', '#eeeeee'],
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
            Upgrade subscription to see Capacity Distribution
          </span>
        </div>
      )}
      <div className={`${subscription.shouldBlur ? 'blur pointer-events-none' : ''}`}>
        <h2 className="text-xl text-[#f8485e] font-semibold mb-4 flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-[#22c1d4]" />
          Capacity Distribution
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

export default CapacityDistributionChart;
