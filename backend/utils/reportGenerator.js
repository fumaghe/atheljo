// backend/utils/reportGenerator.js
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

// Configuration for consistent styling and settings
const config = {
  pdf: {
    titleFontSize: 16,
    bodyFontSize: 12,
    margin: 20,
  },
  excel: {
    headerStyle: {
      font: { bold: true, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } },
    },
  },
};

/**
 * Generates sample data for the report.
 * @param {Date} cutoffDate - The cutoff date for the report.
 * @returns {Array<Array<string>>} - Sample data as a 2D array.
 */
function getSampleData(cutoffDate) {
  const cutoff = new Date(cutoffDate);
  return [
    ['ID', 'Value', 'Date'],
    ['1', '100', cutoff.toLocaleString()],
    ['2', '200', cutoff.toLocaleString()],
    ['3', '300', cutoff.toLocaleString()],
  ];
}

/**
 * Generates a PDF buffer for the report.
 * @param {string} host - The host name.
 * @param {Array<string>} sections - The sections to include in the report.
 * @param {string} cutoffDate - The cutoff date for the report.
 * @returns {Promise<Buffer>} - A promise that resolves to the PDF buffer.
 */
export async function generatePDFBuffer(host, sections, cutoffDate) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ autoFirstPage: true });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      // Add title
      doc.fontSize(config.pdf.titleFontSize).text(`Report for host: ${host}`);
      doc.moveDown();

      // Add cutoff date if provided
      if (cutoffDate) {
        doc.fontSize(config.pdf.bodyFontSize).text(`Report cutoff date: ${new Date(cutoffDate).toLocaleString()}`);
        doc.moveDown();
      }

      // Add sections
      doc.fontSize(config.pdf.bodyFontSize).text('Sections included:');
      doc.text(JSON.stringify(sections, null, 2));
      doc.moveDown();

      // Add sample data if cutoff date is provided
      if (cutoffDate) {
        doc.fontSize(config.pdf.bodyFontSize).text('Data up to cutoff:');
        const sampleData = getSampleData(cutoffDate);
        sampleData.forEach((row) => doc.text(row.join(' | ')));
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Generates an Excel buffer for the report.
 * @param {string} host - The host name.
 * @param {Array<string>} sections - The sections to include in the report.
 * @param {string} cutoffDate - The cutoff date for the report.
 * @returns {Promise<Buffer>} - A promise that resolves to the Excel buffer.
 */
export async function generateExcelBuffer(host, sections, cutoffDate) {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Report');

    // Add host information
    sheet.addRow(['Host', host]).getCell(1).font = config.excel.headerStyle.font;

    // Add cutoff date if provided
    if (cutoffDate) {
      sheet.addRow(['Report cutoff date', new Date(cutoffDate).toLocaleString()]);
    }

    // Add sections
    sheet.addRow(['Sections', JSON.stringify(sections, null, 2)]);
    sheet.addRow([]); // Add an empty row for spacing

    // Add sample data if cutoff date is provided
    if (cutoffDate) {
      sheet.addRow(['Data up to cutoff:']);
      const sampleData = getSampleData(cutoffDate);
      sampleData.forEach((row) => sheet.addRow(row));
    }

    // Write to buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  } catch (err) {
    throw new Error(`Failed to generate Excel buffer: ${err.message}`);
  }
}