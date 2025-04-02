import React from 'react';
import { Line } from 'react-chartjs-2';

const forecastData = {
  labels: ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'],
  datasets: [
    {
      label: 'Actual Usage',
      data: [65, 70, 75, 80, null, null],
      borderColor: '#22c1d4',
      tension: 0.4,
    },
    {
      label: 'Forecast',
      data: [65, 70, 75, 80, 85, 90],
      borderColor: '#f8485e',
      borderDash: [5, 5],
      tension: 0.4,
    },
  ],
};

export default function Analytics() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Analytics</h1>

      {/* Forecast Card */}
      <div className="bg-[#0b3c43] rounded-lg p-6 shadow-lg">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Capacity Forecast</h2>
          <select className="bg-[#06272b] text-[#eeeeee] rounded px-3 py-1 border border-[#22c1d4]/20">
            <option>Next 6 Months</option>
            <option>Next 3 Months</option>
            <option>Next Month</option>
          </select>
        </div>
        <div className="h-[400px]">
          <Line 
            data={forecastData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                y: {
                  beginAtZero: true,
                  max: 100,
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

      {/* Predictions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0b3c43] rounded-lg p-6 shadow-lg">
          <h3 className="text-lg font-semibold mb-4">Time to 80% Capacity</h3>
          <div className="text-3xl font-bold text-[#22c1d4]">45 Days</div>
          <p className="text-sm text-[#eeeeee]/60 mt-2">Based on current growth rate</p>
        </div>
        <div className="bg-[#0b3c43] rounded-lg p-6 shadow-lg">
          <h3 className="text-lg font-semibold mb-4">Time to 90% Capacity</h3>
          <div className="text-3xl font-bold text-[#eeeeee]">72 Days</div>
          <p className="text-sm text-[#eeeeee]/60 mt-2">Based on current growth rate</p>
        </div>
        <div className="bg-[#0b3c43] rounded-lg p-6 shadow-lg">
          <h3 className="text-lg font-semibold mb-4">Time to 100% Capacity</h3>
          <div className="text-3xl font-bold text-[#f8485e]">90 Days</div>
          <p className="text-sm text-[#eeeeee]/60 mt-2">Based on current growth rate</p>
        </div>
      </div>

      {/* Anomaly Detection */}
      <div className="bg-[#0b3c43] rounded-lg p-6 shadow-lg">
        <h2 className="text-xl font-semibold mb-6">Detected Anomalies</h2>
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-[#06272b]">
            <div className="flex justify-between items-center">
              <div>
                <h4 className="font-semibold">Unusual Growth Pattern</h4>
                <p className="text-sm text-[#eeeeee]/60">
                  Detected 25% increase in snapshot creation rate
                </p>
              </div>
              <span className="px-3 py-1 bg-[#f8485e]/20 text-[#f8485e] rounded-full text-sm">
                High Priority
              </span>
            </div>
          </div>
          <div className="p-4 rounded-lg bg-[#06272b]">
            <div className="flex justify-between items-center">
              <div>
                <h4 className="font-semibold">Metadata Usage Spike</h4>
                <p className="text-sm text-[#eeeeee]/60">
                  15% increase in metadata storage consumption
                </p>
              </div>
              <span className="px-3 py-1 bg-[#eeeeee]/20 text-[#eeeeee] rounded-full text-sm">
                Medium Priority
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}