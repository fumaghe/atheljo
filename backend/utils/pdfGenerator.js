import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { getEnhancedSystemHealthScore } from './healthCalculator.js';

// Configuration for styling
const config = {
  colors: {
    background: '#0b3c43',
    header: '#06272b',
    text: '#eeeeee',
    accentGood: '#22c1d4',
    accentWarning: '#f8485e',
    accentCritical: '#ff0000',
  },
  fonts: {
    title: 16,
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
  // Se viene passato un oggetto system, calcola la health; altrimenti usa l'oggetto health già passato (se presente)
  const health = options.health || (options.system ? getEnhancedSystemHealthScore(options.system) : null);

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let yPos = config.margins.top;

  // Set background
  doc.setFillColor(config.colors.background);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // Header
  doc.setFillColor(config.colors.header);
  doc.rect(0, 0, pageWidth, 40, 'F');
  doc.setTextColor(config.colors.text);
  doc.setFontSize(config.fonts.subtitle);
  doc.text('Data Storage Dashboard Report', config.margins.left, 20);
  doc.setFontSize(config.fonts.small);
  doc.text(`Date: ${format(new Date(), 'PPP')}`, config.margins.left, 28);
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', pageWidth - 60, 10, 40, 15);
  }
  yPos = 45;

  // Aggregated or Single System Report
  if (host === 'all') {
    renderAggregatedReport(doc, aggregatedStats, yPos, config);
  } else {
    renderSingleSystemReport(doc, systemName, host, company, health, yPos, config);
  }

  // Forecast Section
  if (forecast && forecast.length > 0) {
    renderForecast(doc, forecast, yPos, config);
  }

  return doc.output('datauristring');
}

function renderAggregatedReport(doc, aggregatedStats, yPos, config) {
  const { left } = config.margins;
  doc.setFontSize(config.fonts.subtitle);
  doc.setTextColor(config.colors.accentWarning);
  doc.text('Aggregated Statistics', left, yPos);
  yPos += 10;

  if (aggregatedStats && Object.keys(aggregatedStats).length) {
    const stats = [
      `Total Systems: ${aggregatedStats.totalSystems}`,
      `Total Available Capacity: ${aggregatedStats.totalAvail.toFixed(2)} GB`,
      `Total Used Capacity: ${aggregatedStats.totalUsed.toFixed(2)} GB`,
      `Snapshots Used: ${aggregatedStats.totalSnap.toFixed(2)} GB`,
      `Average Capacity Usage: ${aggregatedStats.avgPercUsed.toFixed(2)}%`,
      `Average Snapshot Usage: ${aggregatedStats.avgPercSnap.toFixed(2)}%`,
      `Average Speed: ${aggregatedStats.avgSpeed.toFixed(2)} MB/s`,
      `Average Response Time: ${aggregatedStats.avgTime.toFixed(2)} ms`,
      `Telemetry Active on: ${aggregatedStats.telemetryActive} systems`,
    ];
    doc.setFontSize(config.fonts.body);
    doc.setTextColor(config.colors.text);
    stats.forEach((line) => {
      doc.text(`• ${line}`, left, yPos);
      yPos += 8;
    });
  } else {
    doc.text('No aggregated statistics available.', left, yPos);
  }
}

function renderSingleSystemReport(doc, systemName, host, company, health, yPos, config) {
  const { left } = config.margins;
  doc.setTextColor(config.colors.accentGood);
  doc.setFontSize(config.fonts.title);
  doc.text(systemName, left, yPos);
  doc.setFontSize(config.fonts.body);
  doc.setTextColor(config.colors.text);
  yPos += 8;
  doc.text(`Host ID: ${host}   |   Company: ${company}`, left, yPos);
  yPos += 12;

  if (health && health.metrics && health.metrics.length > 0) {
    renderHealthMetrics(doc, health, yPos, config);
  } else {
    doc.setFontSize(config.fonts.body);
    doc.setTextColor(config.colors.text);
    doc.text('No health data available.', left, yPos);
  }
}

function renderHealthMetrics(doc, health, yPos, config) {
  const pageWidth = doc.internal.pageSize.getWidth(); // Definisco pageWidth qui
  const { left } = config.margins;
  const overallColor = health.finalScore >= 80 
    ? config.colors.accentGood 
    : health.finalScore >= 50 
      ? config.colors.text 
      : config.colors.accentWarning;

  // Overall Health Score Card
  doc.setFillColor(config.colors.header);
  doc.roundedRect(left, yPos, pageWidth - 2 * left, 55, 5, 5, 'F');
  doc.setFontSize(config.fonts.subtitle);
  doc.setTextColor(config.colors.accentWarning);
  doc.text('System Health Score', left + 6, yPos + 14);
  doc.setFontSize(config.fonts.small);
  doc.setTextColor(config.colors.text);
  doc.text('Overall system health assessment', left + 6, yPos + 22);
  doc.setFontSize(28);
  doc.setTextColor(overallColor);
  const scoreText = `${health.finalScore}`;
  const scoreTextWidth = doc.getTextWidth(scoreText);
  doc.text(scoreText, pageWidth - left - scoreTextWidth - 6, yPos + 24);
  yPos += 65;

  // Metric Cards
  const cardGap = 10;
  const cardWidth = (pageWidth - 2 * left - cardGap) / 2;
  const cardHeight = 55;
  health.metrics.forEach((metric, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const cardX = left + col * (cardWidth + cardGap);
    const cardY = yPos + row * (cardHeight + cardGap);

    doc.setFillColor(config.colors.header);
    doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 5, 5, 'F');

    const accentColor = metric.impact.startsWith('+') ? config.colors.accentGood : config.colors.accentWarning;

    doc.setFontSize(config.fonts.body);
    doc.setTextColor(accentColor);
    doc.text(metric.name, cardX + 6, cardY + 16);

    doc.setFontSize(config.fonts.subtitle);
    doc.setTextColor(config.colors.text);
    const valueText = (metric.name === 'Capacity' || metric.name === 'MUP')
      ? `${metric.rawValue}${metric.unit || ''}`
      : `${metric.value}${metric.unit || ''}`;
    const valueTextWidth = doc.getTextWidth(valueText);
    doc.text(valueText, cardX + cardWidth - 6 - valueTextWidth, cardY + 16);

    doc.setFontSize(config.fonts.small);
    doc.setTextColor(config.colors.text);
    doc.text(metric.message, cardX + 6, cardY + 26);

    doc.setFontSize(config.fonts.small);
    doc.setTextColor(accentColor);
    doc.text(metric.impact, cardX + 6, cardY + cardHeight - 8);

    doc.setTextColor(config.colors.text);
    const weightText = `Weight: ${metric.weight.toFixed(1)}%`;
    const weightTextWidth = doc.getTextWidth(weightText);
    doc.text(weightText, cardX + cardWidth - 6 - weightTextWidth, cardY + cardHeight - 8);

    const barHeight = 4;
    const barWidth = (cardWidth * metric.value) / 100;
    doc.setFillColor(accentColor);
    doc.rect(cardX, cardY + cardHeight - barHeight, barWidth, barHeight, 'F');
  });
}

function renderForecast(doc, forecast, yPos, config) {
  const pageWidth = doc.internal.pageSize.getWidth(); // Definisco pageWidth anche qui
  const { left } = config.margins;
  const forecastBoxHeight = 55;
  if (yPos + forecastBoxHeight > doc.internal.pageSize.getHeight() - config.margins.bottom) {
    doc.addPage();
    yPos = config.margins.top;
  }
  doc.setFillColor(config.colors.header);
  doc.roundedRect(left, yPos, pageWidth - 2 * left, forecastBoxHeight, 5, 5, 'F');
  doc.setFontSize(config.fonts.subtitle);
  doc.setTextColor(config.colors.accentWarning);
  doc.text('Capacity Forecast', left + 6, yPos + 14);
  doc.setFontSize(config.fonts.small);
  doc.setTextColor(config.colors.text);
  let forecastY = yPos + 24;
  forecast.forEach((line) => {
    doc.text(line, left + 6, forecastY);
    forecastY += 6;
  });
}
