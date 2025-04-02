import fs from 'fs';
import Papa from 'papaparse';

/**
 * Legge e parse il file CSV in modo sincrono e restituisce una Promise con i dati.
 * filePath: percorso completo del file CSV.
 */
export function parseCSVFile(filePath) {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  return new Promise((resolve, reject) => {
    Papa.parse(fileContent, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: (error) => reject(error)
    });
  });
}
