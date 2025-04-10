// src/pages/Systems/StateVectorChart.tsx

import React, { useEffect, useState, useMemo } from 'react';
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
import {
  parse,
  format,
  isValid,
  startOfWeek,
  subDays,
  subMonths,
  subYears,
} from 'date-fns';

import { Info, ArrowUp, ArrowDown, ChevronDown } from 'lucide-react';

// ----------------------------------
// 1) REGISTRAZIONE DI PLUGIN E CONTROLLER
// ----------------------------------
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

// Plugin per la linea di riferimento (media generale)
const referenceLinePlugin = {
  id: 'referenceLinePlugin',
  afterDatasetsDraw: (chart: ChartJS) => {
    const {
      ctx,
      scales: { x, y },
    } = chart;
    const refLine = (chart.config.options as any).referenceLine;
    if (!refLine || typeof refLine.value !== 'number') return;
    const yValue = refLine.value;
    const yPixel = y.getPixelForValue(yValue);

    ctx.save();
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(x.left, yPixel);
    ctx.lineTo(x.right, yPixel);
    ctx.stroke();
    ctx.fillStyle = '#cccccc';
    ctx.textAlign = 'right';
    ctx.fillText(
      `Avg: ${yValue.toFixed(2)} ${refLine.unit}`,
      x.right - 10,
      yPixel - 5
    );
    ctx.restore();
  },
};

// Plugin per la linea di hover (non disegna alcuna linea)
const hoverLinePlugin = {
  id: 'hoverLinePlugin',
  afterDraw: (chart: ChartJS) => {
    // Non disegniamo linee aggiuntive al passaggio del mouse
  },
};

ChartJS.register(referenceLinePlugin, hoverLinePlugin);

// ----------------------------------
// 2) INTERFACCE & TIPI
// ----------------------------------
interface RawData {
  date: string; // "yyyy-MM-dd HH:mm:ss"
  used: number; // in GB
  total_space: number; // in GB
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
  unitId: string;
  pool: string;
  hostId: string;
}

// ----------------------------------
// 3) COMPONENTE PRINCIPALE
// ----------------------------------
const StateVectorChart: React.FC<StateVectorChartProps> = ({
  unitId,
  pool,
  hostId,
}) => {
  // Stati per i dataset (completo e filtrato)
  const [allData, setAllData] = useState<StateVectorData[]>([]);
  const [data, setData] = useState<StateVectorData[]>([]);

  // Stati per timeRange, tipo di grafico, unità e granularità
  const [timeRange, setTimeRange] = useState('6m');
  const [chartType, setChartType] = useState<'candlestick' | 'line'>(
    'candlestick'
  );
  const [unit, setUnit] = useState<Unit>('GB');
  const [granularity, setGranularity] = useState<'weekly' | 'daily'>('weekly');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dropdown visibilità
  const [showRangeDropdown, setShowRangeDropdown] = useState(false);
  const [showChartTypeDropdown, setShowChartTypeDropdown] = useState(false);
  const [showGranularityDropdown, setShowGranularityDropdown] = useState(false);
  const [showUnitDropdown, setShowUnitDropdown] = useState(false);

  // Dropdown per periodi precedenti
  const [showPreviousDropdown, setShowPreviousDropdown] = useState(false);

  // FUNZIONI GENERICHE

  const convertFromGB = (valueInGB: number, targetUnit: Unit): number => {
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

  const filterDataBetween = (
    dataset: StateVectorData[],
    start: Date,
    end: Date
  ): StateVectorData[] => {
    return dataset.filter(
      (d) => d.timestamp >= start && d.timestamp <= end
    );
  };

  // Opzioni per i dropdown
  const timeRangeOptions = ['14d', '1m', '3m', '6m', '1y', 'all'];
  const chartTypeOptions = [
    { value: 'line', label: 'Line Chart' },
    { value: 'candlestick', label: 'Candlestick' },
  ];
  const granularityOptions = [
    { value: 'weekly', label: 'Weekly' },
    { value: 'daily', label: 'Daily' },
  ];
  const unitOptions = [
    { value: 'GB', label: 'GB' },
    { value: 'GiB', label: 'GiB' },
    { value: 'TB', label: 'TB' },
  ];

  // Label “umane” per i range
  const getRangeLabel = (r: string): string => {
    switch (r) {
      case '14d':
        return 'Last 14 days';
      case '1m':
        return 'Last month';
      case '3m':
        return 'Last 3 months';
      case '6m':
        return 'Last 6 months';
      case '1y':
        return 'Last year';
      case 'all':
        return 'All';
      default:
        return r;
    }
  };

  // Label “umane” per chartType
  const getChartTypeLabel = (ct: 'candlestick' | 'line') => {
    const found = chartTypeOptions.find((o) => o.value === ct);
    return found ? found.label : ct;
  };

  // Label “umane” per granularity
  const getGranularityLabel = (g: 'weekly' | 'daily') => {
    const found = granularityOptions.find((o) => o.value === g);
    return found ? found.label : g;
  };

  // Label “umane” per unit
  const getUnitLabel = (u: Unit) => {
    const found = unitOptions.find((o) => o.value === u);
    return found ? found.label : u;
  };

  // Filtra i dati in un range standard
  const filterDataByTimeRange = (
    dataset: StateVectorData[],
    range: string
  ): StateVectorData[] => {
    if (range === 'all') return dataset;
    const now = new Date();
    const cutoff = new Date();
    switch (range) {
      case '14d':
        cutoff.setDate(now.getDate() - 14);
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
        return dataset;
    }
    return dataset.filter((d) => d.timestamp >= cutoff);
  };

  // Raggruppa i dati per settimana (candlestick)
  const groupDataByWeek = (
    dataset: StateVectorData[],
    unit: Unit
  ): CandlestickData[] => {
    const groups: Record<string, StateVectorData[]> = {};
    for (const item of dataset) {
      const weekStart = startOfWeek(item.timestamp, { weekStartsOn: 1 });
      const weekKey = format(weekStart, 'yyyy-MM-dd');
      if (!groups[weekKey]) groups[weekKey] = [];
      groups[weekKey].push(item);
    }
    const candlestickData: CandlestickData[] = Object.keys(groups).map(
      (weekKey) => {
        const group = groups[weekKey];
        group.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        const openGB = group[0].used_gb;
        const closeGB = group[group.length - 1].used_gb;
        const highGB = Math.max(...group.map((x) => x.used_gb));
        const lowGB = Math.min(...group.map((x) => x.used_gb));
        return {
          x: new Date(weekKey),
          o: convertFromGB(openGB, unit),
          h: convertFromGB(highGB, unit),
          l: convertFromGB(lowGB, unit),
          c: convertFromGB(closeGB, unit),
        };
      }
    );
    candlestickData.sort((a, b) => a.x.getTime() - b.x.getTime());
    return candlestickData;
  };

  // Raggruppa i dati per giorno (candlestick daily)
  const groupDataByDay = (
    dataset: StateVectorData[],
    unit: Unit
  ): CandlestickData[] => {
    const groups: Record<string, StateVectorData[]> = {};
    for (const item of dataset) {
      const dayKey = format(item.timestamp, 'yyyy-MM-dd');
      if (!groups[dayKey]) groups[dayKey] = [];
      groups[dayKey].push(item);
    }
    const candlestickData: CandlestickData[] = Object.keys(groups).map(
      (dayKey) => {
        const group = groups[dayKey];
        group.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        const openGB = group[0].used_gb;
        const closeGB = group[group.length - 1].used_gb;
        const highGB = Math.max(...group.map((x) => x.used_gb));
        const lowGB = Math.min(...group.map((x) => x.used_gb));
        return {
          x: new Date(dayKey),
          o: convertFromGB(openGB, unit),
          h: convertFromGB(highGB, unit),
          l: convertFromGB(lowGB, unit),
          c: convertFromGB(closeGB, unit),
        };
      }
    );
    candlestickData.sort((a, b) => a.x.getTime() - b.x.getTime());
    return candlestickData;
  };

  // Calcola il net change di un dataset
  const computeNetChange = (dataset: StateVectorData[]): number => {
    if (dataset.length === 0) return 0;
    const sorted = [...dataset].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
    return (
      sorted[sorted.length - 1].used_gb - sorted[0].used_gb
    );
  };

  // Helper per ottenere i confini del periodo selezionato
  const getCurrentPeriodBoundary = (
    range: string
  ): { start: Date; end: Date } => {
    const now = new Date();
    switch (range) {
      case '14d':
        return { start: subDays(now, 14), end: now };
      case '1m':
        return { start: subMonths(now, 1), end: now };
      case '3m':
        return { start: subMonths(now, 3), end: now };
      case '6m':
        return { start: subMonths(now, 6), end: now };
      case '1y':
        return { start: subYears(now, 1), end: now };
      default:
        return { start: new Date(0), end: now };
    }
  };

  // Helper per il periodo precedente
  const getPreviousPeriodBoundary = (
    range: string,
    currentStart: Date
  ): { start: Date; end: Date } => {
    switch (range) {
      case '14d':
        return { start: subDays(currentStart, 14), end: currentStart };
      case '1m':
        return { start: subMonths(currentStart, 1), end: currentStart };
      case '3m':
        return { start: subMonths(currentStart, 3), end: currentStart };
      case '6m':
        return { start: subMonths(currentStart, 6), end: currentStart };
      case '1y':
        return { start: subYears(currentStart, 1), end: currentStart };
      default:
        return { start: currentStart, end: currentStart };
    }
  };

  // FETCH DATI da Firestore
  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const q = query(
          collection(firestore, 'capacity_trends'),
          where('pool', '==', pool),
          where('hostid', '==', hostId)
        );
        const snap = await getDocs(q);
        const rawData: StateVectorData[] = [];

        snap.forEach((doc) => {
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
        for (let i = 1; i < rawData.length; i++) {
          rawData[i].increment_gb =
            rawData[i].used_gb - rawData[i - 1].used_gb;
        }

        setAllData(rawData);
        setData(filterDataByTimeRange(rawData, timeRange));
        setIsLoading(false);
      } catch (err) {
        console.error(err);
        setError('Failed to load state vector data.');
        setIsLoading(false);
      }
    })();
  }, [unitId, pool, hostId, timeRange]);

  // Gestione del cambio di range
  const handleSelectTimeRange = (r: string) => {
    setTimeRange(r);
    setShowRangeDropdown(false);
  };

  // Gestione del cambio di chartType
  const handleSelectChartType = (val: 'line' | 'candlestick') => {
    setChartType(val);
    setShowChartTypeDropdown(false);
  };

  // Gestione del cambio di granularità
  const handleSelectGranularity = (val: 'weekly' | 'daily') => {
    setGranularity(val);
    setShowGranularityDropdown(false);
  };

  // Gestione del cambio di unit
  const handleSelectUnit = (val: Unit) => {
    setUnit(val);
    setShowUnitDropdown(false);
  };

  // CALCOLI NET CHANGE PER PERIODO CORRENTE / PRECEDENTE
  const currentPeriod = getCurrentPeriodBoundary(timeRange);
  const currentData = filterDataBetween(
    allData,
    currentPeriod.start,
    currentPeriod.end
  );
  const currentNetChange = computeNetChange(currentData);

  const previousPeriod = getPreviousPeriodBoundary(
    timeRange,
    currentPeriod.start
  );
  const previousData = filterDataBetween(
    allData,
    previousPeriod.start,
    previousPeriod.end
  );
  const previousNetChange = computeNetChange(previousData);

  // Lista dei periodi precedenti (fino a 5) per il dropdown della card "Prev Period"
  const computePreviousPeriods = (): {
    start: Date;
    end: Date;
    netChange: number;
  }[] => {
    const periods = [];
    let boundary = {
      start: previousPeriod.start,
      end: previousPeriod.end,
    };
    for (let i = 0; i < 5; i++) {
      const localData = filterDataBetween(allData, boundary.start, boundary.end);
      const netChangeValue = computeNetChange(localData);
      periods.push({
        start: boundary.start,
        end: boundary.end,
        netChange: netChangeValue,
      });
      boundary = getPreviousPeriodBoundary(timeRange, boundary.start);
    }
    return periods;
  };

  const previousPeriodsList = useMemo(
    () => computePreviousPeriods(),
    [allData, timeRange]
  );

  // DATI PER IL GRAFICO LINE
  const lineChartData = {
    datasets: [
      {
        label: `Increment (${unit})`,
        data: data.map((d) => ({
          x: d.timestamp,
          y: convertFromGB(d.increment_gb, unit),
        })),
        pointRadius: 0,
        fill: false,
        // Segment "dinamico": azzurrino se va su, rosso corallo se va giù
        segment: {
          borderColor: (ctx: ScriptableLineSegmentContext) => {
            const delta = ctx.p1.parsed.y - ctx.p0.parsed.y;
            if (delta > 0) return '#22c1d4'; // Azzurrino
            if (delta < 0) return '#f8485e'; // Rosso corallo
            return '#ffffff';
          },
        },
      },
    ],
  };

  // NB: La parte fondamentale qui è la sezione `legend.generateLabels`,
  // che forza la legenda a mostrare i due colori desiderati.
  const lineChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'time',
        time: { unit: 'month', displayFormats: { month: 'MMM yyyy' } },
        grid: { color: 'rgba(255,255,255,0.2)' },
        ticks: { color: '#ffffff' },
      },
      y: {
        beginAtZero: false,
        grid: { color: 'rgba(255,255,255,0.2)' },
        ticks: {
          color: '#ffffff',
          callback: (val) => `${val}`,
        },
      },
    },
    plugins: {
      legend: {
        labels: {
          color: '#ffffff',
          // Creiamo manualmente la legenda con due voci: Aumento e Decrescita
          generateLabels: () => {
            return [
              {
                text: 'Increase',
                strokeStyle: '#22c1d4',
                fillStyle: '#22c1d4',
                hidden: false,
                index: 0,
                fontColor: '#eeeeee',
              },
              {
                text: 'Decrescita',
                strokeStyle: '#f8485e',
                fillStyle: '#f8485e',
                hidden: false,
                index: 1,
                fontColor: '#eeeeee',
              },
            ];
          },
        },
      },
      tooltip: {
        backgroundColor: '#0b3c43',
        titleColor: '#eeeeee',
        bodyColor: '#eeeeee',
        callbacks: {
          label: (context) =>
            `Increment: ${context.parsed.y.toFixed(2)} ${unit}`,
        },
      },
    },
    ...(data.length && {
      referenceLine: {
        value: convertFromGB(
          data.reduce((acc, d) => acc + d.used_gb, 0) / data.length,
          unit
        ),
        unit,
      },
    }),
  };

  // DATI PER IL GRAFICO CANDLESTICK
  const candlestickDataArray = useMemo(() => {
    return granularity === 'weekly'
      ? groupDataByWeek(data, unit)
      : groupDataByDay(data, unit);
  }, [data, granularity, unit]);

  const candlestickChartData = {
    datasets: [
      {
        label: `Used ${unit}`,
        data: candlestickDataArray,
        barThickness: 10,
        // Qui usiamo i colori per le candele: azzurrino se va su, rosso corallo se va giù
        color: {
          up: '#22c1d4',
          down: '#f8485e',
          unchanged: '#ffffff',
        } as any,
      },
    ],
  };

  // Stessa idea: `legend.generateLabels` personalizzata
  const candlestickChartOptions: ChartOptions<'candlestick'> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'time',
        time: {
          unit: granularity === 'weekly' ? 'week' : 'day',
          displayFormats: { week: 'MMM dd', day: 'MMM dd' },
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
        labels: {
          color: '#ffffff',
          generateLabels: () => {
            return [
              {
                text: 'Increase',
                strokeStyle: '#22c1d4',
                fillStyle: '#22c1d4',
                hidden: false,
                index: 0,
                fontColor: '#eeeeee',
              },
              {
                text: 'Decrease',
                strokeStyle: '#f8485e',
                fillStyle: '#f8485e',
                hidden: false,
                index: 1,
                fontColor: '#eeeeee',
              },
            ];
          },
        },
      },
      tooltip: {
        backgroundColor: '#0b3c43',
        titleColor: '#eeeeee',
        bodyColor: '#eeeeee',
        callbacks: {
          label: (context) => {
            const dataPoint = context.raw as CandlestickData;
            const weekStart = dataPoint.x;
            const weekEnd = new Date(dataPoint.x);
            if (granularity === 'weekly') {
              weekEnd.setDate(weekEnd.getDate() + 6);
            }
            const variation =
              dataPoint.o !== 0
                ? ((dataPoint.c - dataPoint.o) / dataPoint.o) * 100
                : 0;
            const delta = dataPoint.c - dataPoint.o;
            return [
              `Week: ${format(weekStart, 'MMM dd')} – ${format(
                weekEnd,
                'MMM dd'
              )}`,
              `Open: ${dataPoint.o.toFixed(2)} ${unit}`,
              `High: ${dataPoint.h.toFixed(2)} ${unit}`,
              `Low: ${dataPoint.l.toFixed(2)} ${unit}`,
              `Close: ${dataPoint.c.toFixed(2)} ${unit}`,
              `Variation: ${
                variation >= 0 ? '+' : ''
              }${variation.toFixed(2)}% (${
                delta >= 0 ? '+' : ''
              }${delta.toFixed(2)} ${unit})`,
            ];
          },
        },
      },
    },
    ...(data.length && {
      referenceLine: {
        value: convertFromGB(
          data.reduce((acc, d) => acc + d.used_gb, 0) / data.length,
          unit
        ),
        unit,
      },
    }),
  };

  // Label del periodo visualizzato
  const periodLabel = useMemo(() => {
    if (data.length === 0) return '';
    const sorted = [...data].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
    const start = format(sorted[0].timestamp, 'MMM yyyy');
    const end = format(sorted[sorted.length - 1].timestamp, 'MMM yyyy');
    return `Showing data from ${start} to ${end}`;
  }, [data]);

  return (
    <div className="state-vector-chart relative bg-[#06272b] p-4 rounded-lg border border-[#22c1d4]/20">
      {/* HEADER: MENU A TENDINA A SINISTRA, CARD E INFO A DESTRA */}
      <div className="chart-header flex items-center justify-between mb-4">
        {/* Sezione sinistra: dropdown menus con stile uniforme */}
        <div className="flex items-center gap-2">
          {/* 1) TimeRange Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowRangeDropdown(!showRangeDropdown)}
              className="bg-[#0b3c43] text-white px-4 py-2 rounded shadow flex items-center gap-2 cursor-pointer"
            >
              {getRangeLabel(timeRange)}
              <ChevronDown size={16} />
            </button>
            {showRangeDropdown && (
              <div className="absolute z-10 mt-1 bg-[#0b3c43] p-2 rounded shadow space-y-1 top-full left-0 min-w-max">
                {timeRangeOptions.map((rangeOption) => (
                  <button
                    key={rangeOption}
                    onClick={() => handleSelectTimeRange(rangeOption)}
                    className={`block w-full text-left px-3 py-1 rounded hover:bg-[#06272b] ${
                      rangeOption === timeRange
                        ? 'font-bold text-[#f8485e]'
                        : 'text-white'
                    }`}
                  >
                    {getRangeLabel(rangeOption)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 2) ChartType Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowChartTypeDropdown(!showChartTypeDropdown)}
              className="bg-[#0b3c43] text-white px-4 py-2 rounded shadow flex items-center gap-2 cursor-pointer"
            >
              {getChartTypeLabel(chartType)}
              <ChevronDown size={16} />
            </button>
            {showChartTypeDropdown && (
              <div className="absolute z-10 mt-1 bg-[#0b3c43] p-2 rounded shadow space-y-1 top-full left-0 min-w-max">
                {chartTypeOptions.map((ct) => (
                  <button
                    key={ct.value}
                    onClick={() =>
                      handleSelectChartType(ct.value as 'line' | 'candlestick')
                    }
                    className={`block w-full text-left px-3 py-1 rounded hover:bg-[#06272b] ${
                      ct.value === chartType
                        ? 'font-bold text-[#f8485e]'
                        : 'text-white'
                    }`}
                  >
                    {ct.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 3) Granularity Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowGranularityDropdown(!showGranularityDropdown)}
              className="bg-[#0b3c43] text-white px-4 py-2 rounded shadow flex items-center gap-2 cursor-pointer"
            >
              {getGranularityLabel(granularity)}
              <ChevronDown size={16} />
            </button>
            {showGranularityDropdown && (
              <div className="absolute z-10 mt-1 bg-[#0b3c43] p-2 rounded shadow space-y-1 top-full left-0 min-w-max">
                {granularityOptions.map((g) => (
                  <button
                    key={g.value}
                    onClick={() => handleSelectGranularity(g.value as 'weekly' | 'daily')}
                    className={`block w-full text-left px-3 py-1 rounded hover:bg-[#06272b] ${
                      g.value === granularity
                        ? 'font-bold text-[#f8485e]'
                        : 'text-white'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 4) Unit Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowUnitDropdown(!showUnitDropdown)}
              className="bg-[#0b3c43] text-white px-4 py-2 rounded shadow flex items-center gap-2 cursor-pointer"
            >
              {getUnitLabel(unit)}
              <ChevronDown size={16} />
            </button>
            {showUnitDropdown && (
              <div className="absolute z-10 mt-1 bg-[#0b3c43] p-2 rounded shadow space-y-1 top-full left-0 min-w-max">
                {unitOptions.map((u) => (
                  <button
                    key={u.value}
                    onClick={() => handleSelectUnit(u.value as Unit)}
                    className={`block w-full text-left px-3 py-1 rounded hover:bg-[#06272b] ${
                      u.value === unit
                        ? 'font-bold text-[#f8485e]'
                        : 'text-white'
                    }`}
                  >
                    {u.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sezione destra: Info e Cards */}
        <div className="flex items-center gap-2">
          {/* Tooltip personalizzato sull'icona Info */}
          <div className="relative group">
            <Info
              size={18}
              className="text-white cursor-pointer"
              onClick={() => (window.location.href = '/documentation')}
            />
            <div
              className="absolute hidden group-hover:block 
                         top-1/2 right-full -translate-y-1/2 mr-2 
                         bg-[#0b3c43] text-white text-xs px-3 py-2 
                         rounded shadow-lg whitespace-nowrap"
            >
              <p>
                This chart illustrates storage usage over time,
                <br />
                showing trends in increases and decreases.
                <br />
                Click for detailed documentation.
              </p>
            </div>
          </div>

          {/* CARDS: Prev Period + Net Change */}
          {timeRange !== 'all' && previousData.length > 0 ? (
            <div className="flex items-center gap-2">
              {/* Card Prev Period */}
              <div className="relative">
                <div
                  className="flex items-center gap-2 bg-[#0b3c43] text-white px-4 py-2 rounded shadow cursor-pointer"
                  onClick={() => setShowPreviousDropdown(!showPreviousDropdown)}
                >
                  {previousNetChange > 0 ? (
                    <ArrowUp size={20} className="text-[#22c1d4]" />
                  ) : previousNetChange < 0 ? (
                    <ArrowDown size={20} className="text-[#f8485e]" />
                  ) : (
                    <span className="font-bold text-xl">–</span>
                  )}
                  <div>
                    <div className="text-sm">Prev Period</div>
                    <div className="font-bold">
                      {previousNetChange >= 0 ? '+' : ''}
                      {convertFromGB(previousNetChange, unit).toFixed(2)} {unit}
                    </div>
                    <div className="text-xs">
                      {format(previousPeriod.start, 'MMM dd')} –{' '}
                      {format(previousPeriod.end, 'MMM dd')}
                    </div>
                  </div>
                </div>
                {showPreviousDropdown && (
                  <div className="absolute z-10 mt-1 bg-[#0b3c43] p-4 rounded shadow space-y-2 top-full left-0 min-w-max">
                    {previousPeriodsList.map((p, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 border-b border-gray-500 pb-1 px-2"
                      >
                        {p.netChange > 0 ? (
                          <ArrowUp size={16} className="text-[#22c1d4]" />
                        ) : p.netChange < 0 ? (
                          <ArrowDown size={16} className="text-[#f8485e]" />
                        ) : (
                          <span className="font-bold text-sm">–</span>
                        )}
                        <div className="text-sm">
                          {format(p.start, 'MMM dd')} –{' '}
                          {format(p.end, 'MMM dd')}
                          {': '}
                          {p.netChange >= 0 ? '+' : ''}
                          {convertFromGB(p.netChange, unit).toFixed(2)} {unit}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Card Net Change */}
              <div className="flex items-center gap-2 bg-[#0b3c43] text-white px-4 py-2 rounded shadow">
                {currentNetChange > 0 ? (
                  <ArrowUp size={20} className="text-[#22c1d4]" />
                ) : currentNetChange < 0 ? (
                  <ArrowDown size={20} className="text-[#f8485e]" />
                ) : (
                  <span className="font-bold text-xl">–</span>
                )}
                <div>
                  <div className="text-sm">Net Change</div>
                  <div className="font-bold">
                    {currentNetChange >= 0 ? '+' : ''}
                    {convertFromGB(currentNetChange, unit).toFixed(2)} {unit}
                  </div>
                  <div className="text-xs">
                    {format(currentPeriod.start, 'MMM dd')} –{' '}
                    {format(currentPeriod.end, 'MMM dd')}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center">
              {/* Solo la card Net Change */}
              <div className="flex items-center gap-2 bg-[#0b3c43] text-white px-4 py-2 rounded shadow">
                {currentNetChange > 0 ? (
                  <ArrowUp size={20} className="text-[#22c1d4]" />
                ) : currentNetChange < 0 ? (
                  <ArrowDown size={20} className="text-[#f8485e]" />
                ) : (
                  <span className="font-bold text-xl">–</span>
                )}
                <div>
                  <div className="text-sm">Net Change</div>
                  <div className="font-bold">
                    {currentNetChange >= 0 ? '+' : ''}
                    {convertFromGB(currentNetChange, unit).toFixed(2)} {unit}
                  </div>
                  <div className="text-xs">
                    {format(currentPeriod.start, 'MMM dd')} –{' '}
                    {format(currentPeriod.end, 'MMM dd')}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MAIN CONTENT: GRAFICO */}
      {isLoading ? (
        <p className="text-white mt-4 text-center">Loading state vector data...</p>
      ) : error ? (
        <p className="text-[#f8485e] mt-4 text-center">{error}</p>
      ) : (
        <>
          <div className="chart-container mt-4" style={{ height: '400px' }}>
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
          <p className="text-white text-center mt-2">{periodLabel}</p>
        </>
      )}
    </div>
  );
};

export default StateVectorChart;
