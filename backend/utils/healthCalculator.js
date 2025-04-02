export function getEnhancedSystemHealthScore(system) {
  const { perc_used, avg_time, used_snap, perc_snap, sending_telemetry } = system;
  // Estrai MUP separatamente per poter assegnare un valore di default se è nullo
  let MUP = system.MUP;
  if (MUP == null) {
    MUP = 55;
  }
  // Controlla che gli altri campi siano definiti
  if (perc_used == null || avg_time == null || used_snap == null || perc_snap == null || sending_telemetry == null) {
    return null;
  }
  
  const weightCapacity = 0.40;
  const weightPerformance = 0.20;
  const weightTelemetry = 0.15;
  const weightSnapshots = 0.10;
  const weightMUP = 0.15;
  
  const capacityScore = perc_used <= 55
    ? 100
    : Math.max(0, 100 - ((perc_used - 55) * (100 / 45)));
  const performanceScore = Math.max(0, 100 - 10 * Math.abs(avg_time - 5));
  const isTelemetryActive = String(sending_telemetry).toLowerCase() === 'true';
  const telemetryScore = isTelemetryActive ? 100 : 0;
  const snapshotsScore = used_snap > 0
    ? Math.max(0, Math.min(100, 100 - perc_snap))
    : 0;
  const mupScore = MUP <= 55
    ? 100
    : Math.max(0, 100 - ((MUP - 55) * (100 / 45)));
  const utilizationScore = (capacityScore + snapshotsScore) / 2;
  
  const capacityImpact = weightCapacity * (capacityScore - 50);
  const performanceImpact = weightPerformance * (performanceScore - 50);
  const telemetryImpact = weightTelemetry * (telemetryScore - 50);
  const snapshotsImpact = weightSnapshots * (snapshotsScore - 50);
  const mupImpact = weightMUP * (mupScore - 50);
  const utilizationImpact = utilizationScore - 50;
  
  const formatImpact = (imp) =>
    (imp >= 0 ? `+${imp.toFixed(1)}` : `${imp.toFixed(1)}`) + ' pts';
  
  const metrics = [
    {
      name: 'Capacity',
      value: Number(capacityScore.toFixed(1)),
      rawValue: Number((100 - perc_used).toFixed(1)),
      unit: '%',
      status: capacityScore < 50 ? 'critical' : capacityScore < 70 ? 'warning' : 'good',
      message: `${system.used} GB used of ${system.avail} GB total`,
      impact: formatImpact(capacityImpact),
      weight: weightCapacity * 100
    },
    {
      name: 'Performance',
      value: Number(performanceScore.toFixed(1)),
      unit: '',
      status: performanceScore < 50 ? 'critical' : performanceScore < 60 ? 'warning' : 'good',
      message: `Telemetry every ${avg_time.toFixed(1)} minutes`,
      impact: formatImpact(performanceImpact),
      weight: weightPerformance * 100
    },
    {
      name: 'Telemetry',
      value: telemetryScore,
      rawValue: sending_telemetry ? 'Active' : 'Inactive',
      unit: '',
      status: telemetryScore === 100 ? 'good' : 'critical',
      message: sending_telemetry
        ? 'System is actively sending telemetry data'
        : 'System is not sending telemetry data',
      impact: formatImpact(telemetryImpact),
      weight: weightTelemetry * 100
    },
    {
      name: 'Snapshots',
      value: Number(snapshotsScore.toFixed(1)),
      rawValue: used_snap,
      unit: 'GB',
      status: snapshotsScore < 50 ? 'critical' : snapshotsScore < 70 ? 'warning' : 'good',
      message: used_snap > 0 ? `${used_snap} GB used for snapshots` : 'No snapshots found',
      impact: formatImpact(snapshotsImpact),
      weight: weightSnapshots * 100
    },
    {
      name: 'MUP',
      value: Number(mupScore.toFixed(1)),
      rawValue: MUP,
      unit: '',
      status: mupScore < 50 ? 'critical' : mupScore < 60 ? 'warning' : 'good',
      message: 'Resource efficiency based on usage patterns',
      impact: formatImpact(mupImpact),
      weight: weightMUP * 100
    },
    {
      name: 'Utilization',
      value: Number(utilizationScore.toFixed(1)),
      rawValue: Number(utilizationScore.toFixed(1)),
      unit: '%',
      status: utilizationScore < 50 ? 'critical' : utilizationScore < 70 ? 'warning' : 'good',
      message: 'Average of Capacity and Snapshots scores',
      impact: formatImpact(utilizationImpact),
      weight: 0
    }
  ];
  
  const finalScore = Math.round(
    weightCapacity * capacityScore +
    weightPerformance * performanceScore +
    weightTelemetry * telemetryScore +
    weightSnapshots * snapshotsScore +
    weightMUP * mupScore
  );
  
  return { finalScore, metrics };
}

/**
 * Calcola le statistiche aggregate per tutti i sistemi
 */
export function computeAggregatedStats(systems) {
  if (!systems.length) return null;
  let totalAvail = 0,
    totalUsed = 0,
    totalSnap = 0,
    sumPercUsed = 0,
    sumPercSnap = 0,
    sumSpeed = 0,
    sumTime = 0,
    telemetryActive = 0;
  systems.forEach(s => {
    totalAvail += s.avail;
    totalUsed += s.used;
    totalSnap += s.used_snap;
    sumPercUsed += s.perc_used;
    sumPercSnap += s.perc_snap;
    sumSpeed += s.avg_speed;
    sumTime += s.avg_time;
    if (s.sending_telemetry) telemetryActive++;
  });
  const totalSystems = systems.length;
  return {
    totalSystems,
    totalAvail,
    totalUsed,
    totalSnap,
    avgPercUsed: sumPercUsed / totalSystems,
    avgPercSnap: sumPercSnap / totalSystems,
    avgSpeed: sumSpeed / totalSystems,
    avgTime: sumTime / totalSystems,
    telemetryActive
  };
}
