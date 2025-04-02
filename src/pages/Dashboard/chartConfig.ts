import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip as ChartTooltip,
    Legend,
    Filler,
    Plugin
  } from 'chart.js';
  
  // Registra i componenti di ChartJS
  ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    ChartTooltip,
    Legend,
    Filler
  );
  
  // Plugin personalizzato per disegnare una freccia sopra il punto con il valore massimo
  export const maxPointPlugin: Plugin = {
    id: 'maxPointPlugin',
    afterDatasetsDraw(chart, args, options) {
      if ((chart.config as any).type !== 'line') return;
      const { ctx } = chart;
      chart.data.datasets.forEach((dataset, datasetIndex) => {
        const meta = chart.getDatasetMeta(datasetIndex);
        if (!meta.data || meta.data.length === 0) return;
        let maxIndex = 0;
        let maxValue = dataset.data[0] as number;
        meta.data.forEach((point, index) => {
          const value = dataset.data[index] as number;
          if (value > maxValue) {
            maxValue = value;
            maxIndex = index;
          }
        });
        const maxPoint = meta.data[maxIndex];
        const { x, y } = maxPoint.getProps(['x', 'y'], true);
        ctx.save();
        ctx.fillStyle = (dataset.borderColor as string) || '#000';
        ctx.strokeStyle = (dataset.borderColor as string) || '#000';
        ctx.lineWidth = 2;
        const arrowHeight = 15;
        ctx.beginPath();
        ctx.moveTo(x, y - 10);
        ctx.lineTo(x, y - 10 - arrowHeight);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y - 10 - arrowHeight);
        ctx.lineTo(x - 5, y - 10 - arrowHeight + 5);
        ctx.lineTo(x + 5, y - 10 - arrowHeight + 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      });
    }
  };
  
  ChartJS.register(maxPointPlugin);
  
  // Opzioni base per i grafici
  export const baseChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(238, 238, 238, 0.1)' },
        ticks: { color: '#eeeeee' }
      },
      x: {
        grid: { color: 'rgba(238, 238, 238, 0.1)' },
        ticks: {
          color: '#eeeeee',
          maxRotation: 45,
          minRotation: 45
        }
      }
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: { color: '#eeeeee', usePointStyle: true, pointStyle: 'circle' }
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        backgroundColor: '#0b3c43',
        titleColor: '#eeeeee',
        bodyColor: '#eeeeee',
        borderColor: '#22c1d4',
        borderWidth: 1,
        padding: 12,
        displayColors: true
      },
      maxPointPlugin: {}
    },
    interaction: { intersect: false, mode: 'index' as const }
  };
  