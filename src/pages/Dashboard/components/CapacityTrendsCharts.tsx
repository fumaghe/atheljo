import React from 'react'
import { Line } from 'react-chartjs-2'
import { Database, HardDrive, Lock } from 'lucide-react'
import { baseChartOptions } from '../chartConfig'

/**
 * Le unità di misura che gestiamo:
 * 'GB' | 'GiB' | 'TB' | '%'
 */
type Unit = 'GB' | 'GiB' | 'TB' | '%'

interface CapacityTrendsChartsProps {
  usedUnit: Unit;
  setUsedUnit: React.Dispatch<React.SetStateAction<Unit>>;
  snapUnit: Unit;
  setSnapUnit: React.Dispatch<React.SetStateAction<Unit>>;
  prepareUsedTrendsChart: (unit: Unit) => any;
  prepareSnapshotTrendsChart: (unit: Unit) => any;
  subscription: { canAccess: boolean; shouldBlur: boolean };
}

const CapacityTrendsCharts: React.FC<CapacityTrendsChartsProps> = ({
  usedUnit,
  setUsedUnit,
  snapUnit,
  setSnapUnit,
  prepareUsedTrendsChart,
  prepareSnapshotTrendsChart,
  subscription
}) => {
  // Dati dummy per lo stato blur
  const dummyUsedTrendsChartData = {
    labels: [
      ['Jan 01', '2020'],
      ['Feb 01', '2020'],
      ['Mar 01', '2020'],
      ['Apr 01', '2020'],
      ['May 01', '2020']
    ],
    datasets: [
      {
        label:
          usedUnit === 'TB'
            ? 'Used (TB)'
            : usedUnit === 'GB'
            ? 'Used (GB)'
            : usedUnit === 'GiB'
            ? 'Used (GiB)'
            : 'Used (%)',
        data:
          usedUnit === 'TB'
            ? [1.2, 1.4, 1.3, 1.5, 1.6]
            : usedUnit === 'GB'
            ? [1200, 1400, 1300, 1500, 1600]
            : usedUnit === 'GiB'
            ? [1116, 1302, 1209, 1395, 1488]
            : [70, 72, 68, 75, 73], // se fosse %
        borderColor: '#22c1d4',
        borderWidth: 1,
        backgroundColor: 'rgba(34, 193, 212, 0.2)',
        tension: 0,
        fill: false,
        pointRadius: 4,
        pointBorderWidth: 0
      }
    ]
  }

  const dummySnapshotTrendsChartData = {
    labels: [
      ['Jan 01', '2020'],
      ['Feb 01', '2020'],
      ['Mar 01', '2020'],
      ['Apr 01', '2020'],
      ['May 01', '2020']
    ],
    datasets: [
      {
        label:
          snapUnit === 'TB'
            ? 'Snapshots (TB)'
            : snapUnit === 'GB'
            ? 'Snapshots (GB)'
            : snapUnit === 'GiB'
            ? 'Snapshots (GiB)'
            : 'Snapshots (%)',
        data:
          snapUnit === 'TB'
            ? [0.5, 0.6, 0.55, 0.65, 0.7]
            : snapUnit === 'GB'
            ? [500, 600, 550, 650, 700]
            : snapUnit === 'GiB'
            ? [465, 558, 511, 604, 651]
            : [50, 52, 48, 55, 53],
        borderColor: '#f8485e',
        borderWidth: 1,
        backgroundColor: 'rgba(248, 72, 94, 0.2)',
        tension: 0,
        fill: false,
        pointRadius: 4,
        pointBorderWidth: 0
      }
    ]
  }

  // Se l'utente non ha accesso, usiamo i dati dummy
  const usedData = subscription.shouldBlur
    ? dummyUsedTrendsChartData
    : prepareUsedTrendsChart(usedUnit)

  const snapshotData = subscription.shouldBlur
    ? dummySnapshotTrendsChartData
    : prepareSnapshotTrendsChart(snapUnit)

  // Opzioni di base per i grafici, con callback per l’asse Y
  const usedChartOptions = {
    ...baseChartOptions,
    scales: {
      ...baseChartOptions.scales,
      y: {
        ...baseChartOptions.scales.y,
        ticks: {
          ...baseChartOptions.scales.y.ticks,
          callback: (tickValue: string | number) => {
            switch (usedUnit) {
              case 'TB':
                return `${tickValue} TB`
              case 'GB':
                return `${tickValue} GB`
              case 'GiB':
                return `${tickValue} GiB`
              case '%':
              default:
                return `${tickValue}%`
            }
          }
        }
      }
    }
  }

  const snapshotChartOptions = {
    ...baseChartOptions,
    scales: {
      ...baseChartOptions.scales,
      y: {
        ...baseChartOptions.scales.y,
        ticks: {
          ...baseChartOptions.scales.y.ticks,
          callback: (tickValue: string | number) => {
            switch (snapUnit) {
              case 'TB':
                return `${tickValue} TB`
              case 'GB':
                return `${tickValue} GB`
              case 'GiB':
                return `${tickValue} GiB`
              case '%':
              default:
                return `${tickValue}%`
            }
          }
        }
      }
    }
  }

  return (
    <div className="relative bg-[#0b3c43] rounded-lg p-6 shadow-lg border border-[#22c1d4]/10 transition-all hover:border-[#22c1d4]/30">
      {subscription.shouldBlur && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center">
          <Lock className="w-6 h-6 text-white mb-2" />
          <span className="text-white text-lg">
            Upgrade subscription to see Capacity Trends
          </span>
        </div>
      )}

      <div className={`${subscription.shouldBlur ? 'blur-sm pointer-events-none' : ''}`}>
        <div className="flex flex-col md:flex-row gap-6">
          {/* Grafico Used */}
          <div className="flex flex-col flex-1">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl text-[#eeeeee] font-semibold flex items-center gap-2">
                <Database className="w-6 h-6 text-[#22c1d4]" />
                Usage Trends
              </h2>
              <select
                value={usedUnit}
                onChange={(e) => setUsedUnit(e.target.value as Unit)}
                className="px-3 py-1 rounded bg-[#22c1d4] text-[#0b3c43] font-semibold focus:outline-none focus:ring-2 focus:ring-[#22c1d4]"
              >
                <option value="GB">GB</option>
                <option value="GiB">GiB</option>
                <option value="TB">TB</option>
                <option value="%">%</option>
              </select>
            </div>
            <div className="h-[300px] sm:h-[350px] md:h-[400px]">
              <Line data={usedData} options={usedChartOptions} />
            </div>
          </div>

          {/* Grafico Snapshots */}
          <div className="flex flex-col flex-1">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl text-[#eeeeee] font-semibold flex items-center gap-2">
                <HardDrive className="w-6 h-6 text-[#22c1d4]" />
                Snapshots Trends
              </h2>
              <select
                value={snapUnit}
                onChange={(e) => setSnapUnit(e.target.value as Unit)}
                className="px-3 py-1 rounded bg-[#f8485e] text-[#0b3c43] font-semibold focus:outline-none focus:ring-2 focus:ring-[#f8485e]"
              >
                <option value="GB">GB</option>
                <option value="GiB">GiB</option>
                <option value="TB">TB</option>
                <option value="%">%</option>
              </select>
            </div>
            <div className="h-[300px] sm:h-[350px] md:h-[400px]">
              <Line data={snapshotData} options={snapshotChartOptions} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CapacityTrendsCharts
