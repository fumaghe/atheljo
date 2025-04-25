import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { getEnhancedSystemHealthScore } from './healthCalculator.js';

// Configuration per styling “card” e header
const config = {
  colors: {
    headerBg: '#0b3c43',
    headerText: '#ffffff',
    cardBorder: '#888888',
    cardBg: '#ffffff',
    cardTitle: '#2c3e50',
    cardValue: '#3498db',
    cardDesc: '#7f8c8d',
    accentGood: '#22c1d4',
    accentWarning: '#f8485e',
    accentCritical: '#ff0000',
  },
  fonts: {
    title: 18,
    subtitle: 14,
    body: 10,
    small: 8,
  },
  margins: {
    left: 20,
    top: 20,
    right: 20,
    bottom: 20,
  },
};

export function generatePDFReportForAPI(options) {
  const { host, logoDataUrl, company, systemName, aggregatedStats, forecast } = options;
  const health = options.health || (options.system ? getEnhancedSystemHealthScore(options.system) : null);

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPos = config.margins.top;

  // 1) Header full-width
  doc.setFillColor(config.colors.headerBg);
  doc.rect(0, 0, pageWidth, 40, 'F');
  doc.setTextColor(config.colors.headerText);
  doc.setFontSize(config.fonts.subtitle);
  doc.text('STORViX Data Storage Report', config.margins.left, 20);
  doc.setFontSize(config.fonts.small);
  doc.text(`Report Date: ${format(new Date(), 'yyyy-MM-dd')}`, config.margins.left, 28);
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', pageWidth - 60, 10, 40, 15);
  }

  // 2) General Info Card
  yPos = 45;
  renderGeneralInfo(doc, { company, host }, yPos);
  yPos += 20 + 12; // altura card + gap

  // 3) Corpo del report
  if (host === 'all') {
    renderAggregatedReport(doc, aggregatedStats, yPos);
  } else {
    renderSingleSystemReport(doc, systemName, host, company, health, yPos);
  }

  // 4) Forecast (se presente)
  if (forecast && forecast.length > 0) {
    renderForecast(doc, forecast, yPos);
  }

  return doc.output('datauristring');
}

function renderGeneralInfo(doc, info, y) {
  const { company, host } = info;
  const { left, right } = config.margins;
  const width = doc.internal.pageSize.getWidth() - left - right;
  const height = 20;

  doc.setFillColor(config.colors.cardBg);
  doc.setDrawColor(config.colors.cardBorder);
  doc.rect(left, y, width, height, 'FD');

  doc.setFontSize(config.fonts.body);
  doc.setTextColor(config.colors.cardTitle);
  doc.text('Company:', left + 6, y + 14);
  doc.setTextColor(config.colors.cardValue);
  doc.text(company, left + 30, y + 14);

  doc.setTextColor(config.colors.cardTitle);
  doc.text('Host ID:', left + 90, y + 14);
  doc.setTextColor(config.colors.cardValue);
  doc.text(host, left + 116, y + 14);
}

function renderAggregatedReport(doc, stats, y) {
  const { left } = config.margins;
  doc.setFontSize(config.fonts.subtitle);
  doc.setTextColor(config.colors.accentWarning);
  doc.text('Aggregated Statistics', left, y);
  y += 10;

  doc.setFontSize(config.fonts.body);
  doc.setTextColor(config.colors.cardTitle);
  if (stats && Object.keys(stats).length) {
    const lines = [
      `Total Systems: ${stats.totalSystems}`,
      `Total Available Capacity: ${stats.totalAvail.toFixed(2)} GB`,
      `Total Used Capacity: ${stats.totalUsed.toFixed(2)} GB`,
      `Snapshots Used: ${stats.totalSnap.toFixed(2)} GB`,
      `Average Capacity Usage: ${stats.avgPercUsed.toFixed(2)}%`,
      `Average Snapshot Usage: ${stats.avgPercSnap.toFixed(2)}%`,
      `Average Speed: ${stats.avgSpeed.toFixed(2)} MB/s`,
      `Average Response Time: ${stats.avgTime.toFixed(2)} ms`,
      `Telemetry Active on: ${stats.telemetryActive} systems`,
    ];
    lines.forEach(line => {
      doc.text(`• ${line}`, left, y);
      y += 8;
    });
  } else {
    doc.text('No aggregated statistics available.', left, y);
  }
}

function renderSingleSystemReport(doc, systemName, host, company, health, y) {
  const { left } = config.margins;
  doc.setFontSize(config.fonts.title);
  doc.setTextColor(config.colors.cardValue);
  doc.text(systemName, left, y);

  y += 8;
  doc.setFontSize(config.fonts.body);
  doc.setTextColor(config.colors.cardTitle);
  doc.text(`Host ID: ${host}   |   Company: ${company}`, left, y);

  y += 12;
  if (health && health.metrics && health.metrics.length) {
    renderHealthMetrics(doc, health, y);
  } else {
    doc.setFontSize(config.fonts.body);
    doc.setTextColor(config.colors.cardTitle);
    doc.text('No health data available.', left, y);
  }
}

function renderHealthMetrics(doc, health, startY) {
  const { left, top, bottom } = config.margins;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = startY;

  // **Overall Health Score Card**
  doc.setFillColor(config.colors.cardBg);
  doc.setDrawColor(config.colors.cardBorder);
  doc.roundedRect(left, y, pageWidth - 2 * left, 60, 4, 4, 'FD');

  doc.setFontSize(config.fonts.subtitle);
  doc.setTextColor(config.colors.cardTitle);
  doc.text('Health Score', left + 6, y + 16);
  doc.setFontSize(config.fonts.small);
  doc.setTextColor(config.colors.cardDesc);
  doc.text('Overall unit health', left + 6, y + 24);

  const valColor = health.finalScore >= 80
    ? config.colors.accentGood
    : health.finalScore >= 50
      ? config.colors.cardValue
      : config.colors.accentWarning;
  doc.setFontSize(28);
  doc.setTextColor(valColor);
  const scoreStr = `${health.finalScore}/100`;
  const tw = doc.getTextWidth(scoreStr);
  doc.text(scoreStr, pageWidth - left - tw - 6, y + 24);

  y += 80; // 60 card + 20 gap

  // **Metric Cards** (2 per riga)
  const gap = 12;
  const cardW = (pageWidth - 2 * left - gap) / 2;
  const cardH = 60;
  const metrics = health.metrics;
  const rows = Math.ceil(metrics.length / 2);

  for (let r = 0; r < rows; r++) {
    // se la riga non ci sta, nuova pagina
    if (y + cardH > pageHeight - bottom) {
      doc.addPage();
      y = top;
    }

    for (let c = 0; c < 2; c++) {
      const idx = r * 2 + c;
      if (idx >= metrics.length) break;
      const m = metrics[idx];
      const x = left + c * (cardW + gap);

      doc.setFillColor(config.colors.cardBg);
      doc.setDrawColor(config.colors.cardBorder);
      doc.roundedRect(x, y, cardW, cardH, 4, 4, 'FD');

      const impactColor = m.impact.startsWith('+')
        ? config.colors.accentGood
        : config.colors.accentWarning;

      // nome
      doc.setFontSize(config.fonts.body);
      doc.setTextColor(config.colors.cardTitle);
      doc.text(m.name, x + 6, y + 18);

      // valore
      doc.setFontSize(config.fonts.subtitle);
      doc.setTextColor(config.colors.cardValue);
      const valText = ['Capacity','MUP'].includes(m.name)
        ? `${m.rawValue}${m.unit||''}`
        : `${m.value}${m.unit||''}`;
      const vtw = doc.getTextWidth(valText);
      doc.text(valText, x + cardW - 6 - vtw, y + 18);

      // descrizione
      doc.setFontSize(config.fonts.small);
      doc.setTextColor(config.colors.cardDesc);
      doc.text(m.message, x + 6, y + 28);

      // impatto
      doc.setFontSize(config.fonts.small);
      doc.setTextColor(impactColor);
      doc.text(m.impact, x + 6, y + cardH - 12);

      // peso
      const wt = `Weight: ${m.weight.toFixed(1)}%`;
      const wtw = doc.getTextWidth(wt);
      doc.setTextColor(config.colors.cardDesc);
      doc.text(wt, x + cardW - 6 - wtw, y + cardH - 12);

      // progress-bar
      const barW = (cardW * m.value) / 100;
      doc.setFillColor(impactColor);
      doc.rect(x + 6, y + cardH - 6, barW, 4, 'F');
    }

    y += cardH + gap;
  }
}

function renderForecast(doc, forecast, startY) {
  const { left, bottom, top } = config.margins;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const boxH = 60;
  let y = startY;

  if (y + boxH > pageHeight - bottom) {
    doc.addPage();
    y = top;
  }

  doc.setFillColor(config.colors.cardBg);
  doc.setDrawColor(config.colors.cardBorder);
  doc.roundedRect(left, y, pageWidth - 2 * left, boxH, 4, 4, 'FD');

  doc.setFontSize(config.fonts.subtitle);
  doc.setTextColor(config.colors.accentWarning);
  doc.text('Capacity Forecast', left + 6, y + 16);

  doc.setFontSize(config.fonts.small);
  doc.setTextColor(config.colors.cardDesc);
  let fy = y + 28;
  forecast.forEach(line => {
    doc.text(line, left + 6, fy);
    fy += 6;
  });
}
