// src/utils/calculateSystemHealthScore.ts

import { SystemData } from '../pages/Dashboard/types';

export function calculateSystemHealthScore(system: SystemData): number {
  const percUsed = Number(system.perc_used);
  const avgTime = Number(system.avg_time);
  const usedSnap = Number(system.used_snap);
  const percSnap = Number(system.perc_snap);
  const MUP = Number(system.MUP);

  const capacityScore = percUsed <= 55
    ? 100
    : Math.max(0, 100 - (percUsed - 55) * (100 / 45));
  const performanceScore = Math.max(0, 100 - 10 * Math.abs(avgTime - 5));
  const telemetryScore = system.sending_telemetry ? 100 : 0;
  const snapshotsScore = usedSnap > 0
    ? Math.max(0, Math.min(100, 100 - percSnap))
    : 0;
  const mupScore = MUP <= 55
    ? 100
    : Math.max(0, 100 - (MUP - 55) * (100 / 45));

  const weightCapacity = 0.4;
  const weightPerformance = 0.2;
  const weightTelemetry = 0.15;
  const weightSnapshots = 0.1;
  const weightMUP = 0.15;

  return Math.round(
    weightCapacity * capacityScore +
    weightPerformance * performanceScore +
    weightTelemetry * telemetryScore +
    weightSnapshots * snapshotsScore +
    weightMUP * mupScore
  );
}
