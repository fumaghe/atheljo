// src/components/charts/StateVectorChart.tsx
import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import firestore from '../../firebaseClient';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend,
  ChartOptions,
  PointElement,
  LineElement,
  ScriptableLineSegmentContext,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import {
  CandlestickController,
  CandlestickElement,
} from 'chartjs-chart-financial';

import { Line } from 'react-chartjs-2';
import { Chart } from 'react-chartjs-2';
import { parse, format, isValid, startOfWeek } from 'date-fns';

ChartJS.register(
  CategoryScale,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
  CandlestickController,
  CandlestickElement
);

interface RawData {
  date: string;         // "yyyy-MM-dd HH:mm:ss"
  used: number;         // in GB
  total_space: number;  // in GB
}

export interface StateVectorData {
  timestamp: Date;
  used_gb: number;
  total_gb: number;
  increment_gb: number;
}

export interface CandlestickData {
  x: Date;
  o: number;
  h: number;
  l: number;
  c: number;
}

type Unit = 'GB' | 'GiB' | 'TB';

interface StateVectorChartProps {
  unitId: string; // Non viene più usato per filtrare il recupero dei dati, ma può essere conservato per riferimento
  pool: string;
  hostId: string;
}

const StateVectorChart: React.FC<StateVectorChartProps> = ({ unitId, pool, hostId }) => {
  const [data, setData] = useState<StateVectorData[]>([]);
  const [timeRange, setTimeRange] = useState('6m');
  const [chartType, setChartType] = useState<'candlestick' | 'line'>('candlestick');
  const [unit, setUnit] = useState<Unit>('GB');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Funzione di conversione da GB
  const convertFromGB = (valueInGB: number, targetUnit: Unit) => {
    switch (targetUnit) {
      case 'GB':
        return valueInGB;
      case 'GiB':
        return valueInGB / 1.073741824;
      case 'TB':
        return valueInGB / 1024;
      default:
        return valueInGB;
    }
  };

  const filterDataByTimeRange = (allData: StateVectorData[], range: string) => {
    if (range === 'all') return allData;
    const now = new Date();
    const cutoff = new Date();
    switch (range) {
      case '7d':
        cutoff.setDate(now.getDate() - 7);
        break;
      case '1m':
        cutoff.setMonth(now.getMonth() - 1);
        break;
      case '3m':
        cutoff.setMonth(now.getMonth() - 3);
        break;
      case '6m':
        cutoff.setMonth(now.getMonth() - 6);
        break;
      case '1y':
        cutoff.setFullYear(now.getFullYear() - 1);
        break;
      default:
        return allData;
    }
    return allData.filter(d => d.timestamp >= cutoff);
  };

  // Raggruppa i dati per settimana per il grafico candlestick
  const groupDataByWeek = (dataset: StateVectorData[], unit: Unit) => {
    const groups: Record<string, StateVectorData[]> = {};

    for (const item of dataset) {
      const weekStart = startOfWeek(item.timestamp, { weekStartsOn: 1 });
      const weekKey = format(weekStart, 'yyyy-MM-dd');
      if (!groups[weekKey]) groups[weekKey] = [];
      groups[weekKey].push(item);
    }

    const candlestickData: CandlestickData[] = Object.keys(groups).map(weekKey => {
      const group = groups[weekKey];
      group.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      const openGB = group[0].used_gb;
      const closeGB = group[group.length - 1].used_gb;
      const highGB = Math.max(...group.map(x => x.used_gb));
      const lowGB = Math.min(...group.map(x => x.used_gb));

      return {
        x: new Date(weekKey),
        o: convertFromGB(openGB, unit),
        h: convertFromGB(highGB, unit),
        l: convertFromGB(lowGB, unit),
        c: convertFromGB(closeGB, unit),
      };
    });

    candlestickData.sort((a, b) => a.x.getTime() - b.x.getTime());
    return candlestickData;
  };

  useEffect(() => {
    // Log dei parametri per verificare che siano corretti
    console.log("Params:", { unitId, pool, hostId });
    
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Query aggiornata: filtriamo per pool e hostid (non usiamo più unit_id per recuperare i dati)
        const q = query(
          collection(firestore, 'capacity_trends'),
          where('pool', '==', pool),
          where('hostid', '==', hostId)
        );
        const snap = await getDocs(q);
        const rawData: StateVectorData[] = [];

        // Log per verificare la quantità di documenti trovati
        console.log("Documenti trovati:", snap.size);
        snap.forEach(doc => {
          const d = doc.data() as RawData;
          const dateObj = parse(d.date, 'yyyy-MM-dd HH:mm:ss', new Date());
          if (!isValid(dateObj)) {
            console.warn('Invalid date:', d.date);
            return;
          }
          rawData.push({
            timestamp: dateObj,
            used_gb: d.used ?? 0,
            total_gb: d.total_space ?? 0,
            increment_gb: 0,
          });
        });

        rawData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

        // Calcolo increment_gb per ogni record (escluso il primo)
        for (let i = 1; i < rawData.length; i++) {
          rawData[i].increment_gb = rawData[i].used_gb - rawData[i - 1].used_gb;
        }

        const filtered = filterDataByTimeRange(rawData, timeRange);
        console.log("Final records after parsing and filtering:", filtered);
        setData(filtered);
        setIsLoading(false);
      } catch (err) {
        console.error(err);
        setError('Failed to load state vector data.');
        setIsLoading(false);
      }
    };

    fetchData();
  }, [unitId, pool, hostId, timeRange]);

  // Dati per il grafico lineare (incremento di GB)
  const lineChartData = {
    datasets: [
      {
        label: `Increment (${unit})`,
        data: data.map(d => ({
          x: d.timestamp,
          y: convertFromGB(d.increment_gb, unit)
        })),
        pointRadius: 0,
        tension: 0.2,
        fill: false,
        borderColor: '#ffffff',
        segment: {
          borderColor: (ctx: ScriptableLineSegmentContext) => {
            const { p0, p1 } = ctx;
            return p1.parsed.y > p0.parsed.y ? '#22c1d4' : '#f8485e';
          },
        },
      },
    ],
  };

  const lineChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'time',
        time: {
          unit: 'month',
          displayFormats: {
            month: 'MMM yyyy'
          }
        },
        grid: { color: 'rgba(255,255,255,0.2)' },
        ticks: { color: '#ffffff' },
      },
      y: {
        beginAtZero: false,
        grid: { color: 'rgba(255,255,255,0.2)' },
        ticks: {
          color: '#ffffff',
          callback: val => `${val}`
        },
      },
    },
    plugins: {
      legend: {
        labels: { color: '#ffffff' },
      },
      tooltip: {
        backgroundColor: '#0b3c43',
        titleColor: '#eeeeee',
        bodyColor: '#eeeeee',
      },
    },
  };

  // Dati per il grafico candlestick: raggruppati per settimana
  const candlestickData = groupDataByWeek(data, unit);
  const candlestickChartOptions: ChartOptions<'candlestick'> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'time',
        time: {
          unit: 'week',
          displayFormats: {
            week: 'MMM dd',
          },
        },
        offset: true,
        grid: { color: 'rgba(255,255,255,0.2)' },
        ticks: { color: '#ffffff' },
      },
      y: {
        beginAtZero: false,
        grid: { color: 'rgba(255,255,255,0.2)' },
        ticks: { color: '#ffffff' },
      },
    },
    plugins: {
      legend: {
        labels: { color: '#ffffff' },
      },
      tooltip: {
        backgroundColor: '#0b3c43',
        titleColor: '#eeeeee',
        bodyColor: '#eeeeee',
        callbacks: {
          label: function(context) {
            const dataPoint = context.raw as CandlestickData;
            const variation = (dataPoint.c - dataPoint.o).toFixed(2);
            return `Open: ${dataPoint.o.toFixed(2)} - Close: ${dataPoint.c.toFixed(2)} (Var: ${variation})`;
          },
        },
      },
    },
  };

  const candlestickChartData = {
    datasets: [
      {
        label: `Used ${unit}`,
        data: candlestickData,
        barThickness: 10,
        color: {
          up: '#22c1d4',
          down: '#f8485e',
          unchanged: '#ffffff',
        } as any,
      },
    ],
  };

  return (
    <div className="state-vector-chart bg-[#06272b] p-4 rounded-lg border border-[#22c1d4]/20">
      <div className="controls flex flex-wrap gap-4 mb-4 items-center justify-between">
        <div className="flex gap-4">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="bg-[#0b3c43] text-[#eeeeee] rounded px-3 py-1 border border-[#22c1d4]/20"
          >
            <option value="7d">Last 7 days</option>
            <option value="1m">Last month</option>
            <option value="3m">Last 3 months</option>
            <option value="6m">Last 6 months</option>
            <option value="1y">Last year</option>
            <option value="all">All</option>
          </select>

          <select
            value={chartType}
            onChange={(e) => setChartType(e.target.value as 'candlestick' | 'line')}
            className="bg-[#0b3c43] text-[#eeeeee] rounded px-3 py-1 border border-[#22c1d4]/20"
          >
            <option value="line">Line Plot</option>
            <option value="candlestick">Candlestick</option>
          </select>
        </div>

        <div>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as Unit)}
            className="bg-[#0b3c43] text-[#eeeeee] rounded px-3 py-1 border border-[#22c1d4]/20"
          >
            <option value="GB">GB</option>
            <option value="GiB">GiB</option>
            <option value="TB">TB</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <p className="text-[#eeeeee]">Loading state vector data...</p>
      ) : error ? (
        <p className="text-[#f8485e]">{error}</p>
      ) : (
        <div className="chart-container" style={{ height: '400px' }}>
          {chartType === 'line' ? (
            <Line data={lineChartData} options={lineChartOptions} />
          ) : (
            <Chart
              type="candlestick"
              data={candlestickChartData}
              options={candlestickChartOptions}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default StateVectorChart;
