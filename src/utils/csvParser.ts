import Papa from 'papaparse';

export async function parseCSV(filePath: string) {
  try {
    const response = await fetch(filePath);
    const csvText = await response.text();
    
    return new Promise((resolve, reject) => {
      Papa.parse(csvText, {
        header: true,
        dynamicTyping: true, // Automatically convert numeric values
        skipEmptyLines: true, // Skip empty lines
        complete: (results) => {
          resolve(results.data);
        },
        error: (error) => reject(error)
      });
    });
  } catch (error) {
    console.error('Error parsing CSV:', error);
    throw error;
  }
}

export function calculateSystemHealth(system: any, allSystems: any[]) {
  const metrics = {
    capacityScore: 0,
    performanceScore: 0,
    telemetryScore: 0,
    utilizationScore: 0
  };

  // Calculate averages across all systems
  const avgMUP = allSystems.reduce((acc, sys) => acc + Number(sys.MUP), 0) / allSystems.length;
  const avgSpeed = allSystems.reduce((acc, sys) => acc + Number(sys.avg_speed), 0) / allSystems.length;
  const avgUsed = allSystems.reduce((acc, sys) => acc + Number(sys.perc_used), 0) / allSystems.length;

  // Capacity Score (lower usage is better)
  metrics.capacityScore = 100 - Number(system.perc_used);

  // Performance Score (higher speed is better)
  metrics.performanceScore = (Number(system.avg_speed) / avgSpeed) * 100;

  // Telemetry Score
  metrics.telemetryScore = system.sending_telemetry ? 100 : 0;

  // Utilization Score (based on MUP - Metrics Usage Pattern)
  metrics.utilizationScore = (Number(system.MUP) / avgMUP) * 100;

  // Calculate final score (weighted average)
  const finalScore = (
    metrics.capacityScore * 0.4 +
    metrics.performanceScore * 0.3 +
    metrics.telemetryScore * 0.2 +
    metrics.utilizationScore * 0.1
  );

  return {
    score: Math.round(finalScore),
    metrics,
    details: {
      capacity: {
        value: metrics.capacityScore,
        status: metrics.capacityScore > 50 ? 'good' : 'warning',
        message: `Capacity usage is ${metrics.capacityScore > 50 ? 'optimal' : 'high'}`
      },
      performance: {
        value: metrics.performanceScore,
        status: metrics.performanceScore > avgSpeed ? 'good' : 'warning',
        message: `Performance is ${metrics.performanceScore > avgSpeed ? 'above' : 'below'} average`
      },
      telemetry: {
        value: metrics.telemetryScore,
        status: system.sending_telemetry ? 'good' : 'critical',
        message: system.sending_telemetry ? 'Telemetry active' : 'Telemetry inactive'
      },
      utilization: {
        value: metrics.utilizationScore,
        status: metrics.utilizationScore > 80 ? 'good' : 'warning',
        message: `Resource utilization is ${metrics.utilizationScore > 80 ? 'efficient' : 'suboptimal'}`
      }
    }
  };
}

export function getDailyStats(filePath: string, timeRange: number) {
  return new Promise(async (resolve, reject) => {
    try {
      const data = await parseCSV(filePath);
      
      // Filter by time range
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - timeRange);
      
      const filteredData = (data as any[]).filter(item => {
        const itemDate = new Date(item.date);
        return itemDate >= cutoffDate;
      });
      
      resolve(filteredData);
    } catch (error) {
      reject(error);
    }
  });
}