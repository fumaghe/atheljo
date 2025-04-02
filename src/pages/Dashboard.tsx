import React from 'react';
import { BarChart2, Database, Users, DollarSign } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const businessMetrics = [
  {
    title: 'Total Licensed Capacity',
    value: '2000',
    unit: 'TiB',
    trend: 9,
    icon: Database,
  },
  {
    title: 'Channel Partners',
    value: '45',
    trend: 12,
    icon: Users,
  },
  {
    title: 'ARR',
    value: '8.5',
    unit: 'MSEK',
    trend: 15,
    icon: DollarSign,
  },
  {
    title: 'Monthly Growth Rate',
    value: '250',
    unit: 'GiB',
    trend: -3,
    icon: BarChart2,
  },
];

const installedBase = [
  { name: 'AiRE 2', units: 15, saturation: 75 },
  { name: 'AiRE 3', units: 25, saturation: 85 },
  { name: 'AiRE 4', units: 10, saturation: 45 },
  { name: 'SmartCARE', units: 30, saturation: 60 },
];

const capacityData = {
  labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
  datasets: [
    {
      label: 'Snapshots',
      data: [300, 450, 600, 470, 540, 780],
      borderColor: '#22c1d4',
      tension: 0.4,
    },
    {
      label: 'Data',
      data: [500, 650, 800, 900, 950, 1100],
      borderColor: '#eeeeee',
      tension: 0.4,
    },
    {
      label: 'Metadata',
      data: [100, 120, 150, 140, 160, 190],
      borderColor: '#f8485e',
      tension: 0.4,
    },
  ],
};

const alerts = [
  {
    id: '1',
    type: 'Capacity Warning',
    message: 'System ABC123 reaching 90% capacity',
    severity: 'warning',
  },
  {
    id: '2',
    type: 'Performance Alert',
    message: 'Unusual I/O patterns detected',
    severity: 'critical',
  },
  {
    id: '3',
    type: 'System Update',
    message: 'New version available: 4.2.1',
    severity: 'info',
  },
];

export default function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Business Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {businessMetrics.map((metric) => (
          <div key={metric.title} className="bg-[#0b3c43] rounded-lg p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[#eeeeee]/80">{metric.title}</h3>
              <metric.icon className="w-5 h-5 text-[#22c1d4]" />
            </div>
            <div className="flex items-end justify-between">
              <div>
                <span className="text-2xl font-bold text-[#22c1d4]">
                  {metric.value}
                  {metric.unit && <span className="text-lg ml-1">{metric.unit}</span>}
                </span>
                <div className={`text-sm mt-2 ${metric.trend >= 0 ? 'text-[#22c1d4]' : 'text-[#f8485e]'}`}>
                  {metric.trend >= 0 ? '+' : ''}{metric.trend}%
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Installed Base */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {installedBase.map((system) => (
          <div key={system.name} className="bg-[#0b3c43] rounded-lg p-6 shadow-lg">
            <h3 className="text-lg font-semibold mb-4">{system.name}</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span>Units</span>
                <span className="text-[#22c1d4] font-bold">{system.units}</span>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Saturation</span>
                  <span className={system.saturation > 80 ? 'text-[#f8485e]' : 'text-[#22c1d4]'}>
                    {system.saturation}%
                  </span>
                </div>
                <div className="h-2 bg-[#06272b] rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${
                      system.saturation > 80 ? 'bg-[#f8485e]' : 'bg-[#22c1d4]'
                    }`}
                    style={{ width: `${system.saturation}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Capacity Trends */}
      <div className="bg-[#0b3c43] rounded-lg p-6 shadow-lg">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Capacity Trends</h2>
          <select className="bg-[#06272b] text-[#eeeeee] rounded px-3 py-1 border border-[#22c1d4]/20">
            <option>Last 30 Days</option>
            <option>Last 7 Days</option>
            <option>Last 24 Hours</option>
          </select>
        </div>
        <div className="h-[400px]">
          <Line 
            data={capacityData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                y: {
                  beginAtZero: true,
                  grid: {
                    color: 'rgba(238, 238, 238, 0.1)',
                  },
                },
                x: {
                  grid: {
                    color: 'rgba(238, 238, 238, 0.1)',
                  },
                },
              },
              plugins: {
                legend: {
                  position: 'top' as const,
                  labels: {
                    color: '#eeeeee',
                  },
                },
              },
            }}
          />
        </div>
      </div>

      {/* Alerts */}
      <div className="bg-[#0b3c43] rounded-lg p-6 shadow-lg">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Active Alerts</h2>
          <button className="text-[#22c1d4] hover:underline">View All</button>
        </div>
        <div className="space-y-4">
          {alerts.map((alert) => (
            <div 
              key={alert.id}
              className="flex items-center justify-between p-4 rounded-lg bg-[#06272b]"
            >
              <div>
                <h4 className="font-semibold">{alert.type}</h4>
                <p className="text-sm text-[#eeeeee]/80">{alert.message}</p>
              </div>
              <span className={`
                px-3 py-1 rounded-full text-sm
                ${alert.severity === 'critical' ? 'bg-[#f8485e]/20 text-[#f8485e]' :
                  alert.severity === 'warning' ? 'bg-[#eeeeee]/20 text-[#eeeeee]' :
                  'bg-[#22c1d4]/20 text-[#22c1d4]'}
              `}>
                {alert.severity}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}