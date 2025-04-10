export interface CapacityData {
  date: string;
  snap: number;
  used: number;
  perc_used: number;
  perc_snap: number;
  pool: string;
  hostid: string;
  total_space: number;
}

export interface SystemData {
  unit_id: string; 
  name: string;
  hostid: string;
  pool: string;
  type: string;
  used: number;
  avail: number;
  used_snap: number;
  perc_used: number;
  perc_snap: number;
  sending_telemetry: boolean;
  first_date: string;
  last_date: string;
  MUP: number;
  avg_speed: number;
  avg_time: number;
  company: string;
}

export interface TelemetryData {
  date: string;
  hostid: string;
  used_space: number;
  total_space: number;
  used_percentage: number;
}

export interface AggregatedStats {
  totalSystems: number;
  totalCapacity: number;
  usedCapacity: number;
  usedSnapshots: number;
  avgUsage: number;
  avgSnapUsage: number;
  avgSpeed: number;
  avgResponseTime: number;
  telemetryActive: number;
  systemsByType: Record<string, number>;
  systemsByCompany: Record<string, number>;
  systemsByPool: Record<string, number>;
  healthySystems: number;
  warningSystems: number;
  criticalSystems: number;
}

/** 
 * Interfaccia per i filtri attivi (cioè le selezioni dell'utente)
 */
export interface FilterSelections {
  company: string;
  type: string;
  pool: string;
  telemetry: string;
  timeRange: string;
}

export interface DashboardData {
  systemsData: SystemData[];
  capacityData: CapacityData[];
  telemetryData: TelemetryData[];
}


/** 
 * Interfaccia per le opzioni disponibili nei filtri
 */
export interface FilterOptions {
  companies: string[];
  types: string[];
  pools: string[];
}

export interface BusinessMetric {
  title: string;
  value: string;
  unit?: string;
  trend: number;
  icon: React.ElementType;
  description: string;
  // Nuovi campi:
  subValue?: string;
  subDescription?: string;
}