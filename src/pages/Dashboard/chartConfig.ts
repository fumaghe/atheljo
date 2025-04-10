// src/pages/Dashboard/chartConfig.ts
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
// (cioè, visivamente più in alto). Poiché in canvas una coordinata y minore significa un valore più alto, 
// cerchiamo il punto con la y più bassa.
export const maxPointPlugin: Plugin = {
  id: 'maxPointPlugin',
  afterDatasetsDraw(chart, args, options) {
    // Applicare solo ai grafici di tipo "line"
    if ((chart.config as any).type !== 'line') return;
    const { ctx } = chart;

    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (!meta.data || meta.data.length === 0) return;

      // Inizialmente prendiamo il primo punto del dataset in coordinate canvas
      let maxIndex = 0;
      const firstPoint = meta.data[0];
      let minPixelY = firstPoint.getProps(['y'], true).y; // La coordinata y più bassa in pixel (valore numerico minore) è il punto più alto
      
      // Iteriamo sui punti per trovare quello che, in canvas, si trova più in alto (y minore)
      meta.data.forEach((point, index) => {
        const { y } = point.getProps(['y'], true);
        if (y < minPixelY) {
          minPixelY = y;
          maxIndex = index;
        }
      });

      const maxPoint = meta.data[maxIndex];
      const { x, y } = maxPoint.getProps(['x', 'y'], true);

      ctx.save();
      // Usa il colore di bordo del dataset (se presente) o nero di default
      ctx.fillStyle = (dataset.borderColor as string) || '#000';
      ctx.strokeStyle = (dataset.borderColor as string) || '#000';
      ctx.lineWidth = 2;
      
      // Specifica un offset per la freccia; ad esempio, 10px sopra il punto
      const offset = 10;
      const arrowHeight = 15;
      
      // Disegna una linea verticale sopra il punto
      ctx.beginPath();
      ctx.moveTo(x, y - offset);
      ctx.lineTo(x, y - offset - arrowHeight);
      ctx.stroke();

      // Disegna un triangolo (freccia) alla fine della linea
      ctx.beginPath();
      ctx.moveTo(x, y - offset - arrowHeight);
      ctx.lineTo(x - 5, y - offset - arrowHeight + 5);
      ctx.lineTo(x + 5, y - offset - arrowHeight + 5);
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
    // Abilita il plugin per disegnare la freccia
    maxPointPlugin: {}
  },
  interaction: { intersect: false, mode: 'index' as const }
};
