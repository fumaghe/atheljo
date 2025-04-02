export interface SystemMetrics {
  id: string;
  name: string;
  totalCapacity: number;
  usedCapacity: number;
  snapshotUsage: number;
  dataUsage: number;
  metadataUsage: number;
  status: 'OK' | 'WARNING' | 'CRITICAL';
  version: string;
}

export interface BusinessMetric {
  title: string;
  value: string | number;
  trend: number;
  unit?: string;
}

export interface Alert {
  id: string;
  type: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: string;
}

export interface TopChange {
  path: string;
  change: number;
  type: 'increase' | 'decrease';
}

export interface Report {
  id: string;
  name: string;
  createdAt: string;
  format: 'PDF' | 'XLS';
  status: 'completed' | 'pending';
  url?: string;
}