export interface MockSystem {
  unit_id: string;
  hostid: string;
  pool: string;
  name: string;
  type: string;
  used: number;
  avail: number;
  used_snap: number;
  perc_used: number;
  perc_snap: number;
  sending_telemetry: boolean;
  telemetryDelay: number;
  MUP: number;
  avg_speed: number;
  avg_time: number;
  company: string;
  capacityHistory: { date: string; used: number; total: number }[];
  datasetHistory: { date: string; used: number; total: number }[];
  usageForecast: { date: string; forecasted_usage: number; forecasted_percentage: number }[];
  fileTrends: { date: string; uploaded: number; deleted: number; total_files: number }[];
  energyImpact: { month: string; baseline: number; optimized: number }[];
  stateVectors: { timestamp: string; cpu: number; memory: number; iops: number; latency: number }[];
  version: string;
}

export interface MockCompany {
  name: string;
  systems: MockSystem[];
}

const sharedCapacityHistory = [
  { date: '2024-01-01', used: 520, total: 1200 },
  { date: '2024-02-01', used: 610, total: 1200 },
  { date: '2024-03-01', used: 680, total: 1200 },
  { date: '2024-04-01', used: 740, total: 1200 },
  { date: '2024-05-01', used: 810, total: 1200 },
  { date: '2024-06-01', used: 860, total: 1200 },
];

const sharedDatasetHistory = [
  { date: '2024-01-01', used: 120, total: 300 },
  { date: '2024-02-01', used: 140, total: 300 },
  { date: '2024-03-01', used: 150, total: 300 },
  { date: '2024-04-01', used: 175, total: 300 },
  { date: '2024-05-01', used: 190, total: 300 },
  { date: '2024-06-01', used: 205, total: 300 },
];

const sharedForecast = [
  { date: '2024-07-01', forecasted_usage: 910, forecasted_percentage: 75 },
  { date: '2024-08-01', forecasted_usage: 980, forecasted_percentage: 82 },
  { date: '2024-09-01', forecasted_usage: 1040, forecasted_percentage: 87 },
  { date: '2024-10-01', forecasted_usage: 1100, forecasted_percentage: 92 },
];

const sharedFileTrends = [
  { date: '2024-02-01', uploaded: 28, deleted: 8, total_files: 480 },
  { date: '2024-03-01', uploaded: 32, deleted: 10, total_files: 502 },
  { date: '2024-04-01', uploaded: 40, deleted: 12, total_files: 530 },
  { date: '2024-05-01', uploaded: 45, deleted: 18, total_files: 557 },
  { date: '2024-06-01', uploaded: 52, deleted: 21, total_files: 588 },
];

const sharedEnergyImpact = [
  { month: 'Mar', baseline: 12, optimized: 9.5 },
  { month: 'Apr', baseline: 12.4, optimized: 9.8 },
  { month: 'May', baseline: 12.8, optimized: 10.1 },
  { month: 'Jun', baseline: 13.1, optimized: 10.4 },
  { month: 'Jul', baseline: 13.5, optimized: 10.6 },
];

const sharedStateVectors = [
  { timestamp: '2024-06-01T00:00:00Z', cpu: 54, memory: 62, iops: 1200, latency: 2.4 },
  { timestamp: '2024-06-08T00:00:00Z', cpu: 58, memory: 64, iops: 1300, latency: 2.1 },
  { timestamp: '2024-06-15T00:00:00Z', cpu: 63, memory: 66, iops: 1380, latency: 1.9 },
  { timestamp: '2024-06-22T00:00:00Z', cpu: 61, memory: 67, iops: 1420, latency: 1.8 },
  { timestamp: '2024-06-29T00:00:00Z', cpu: 65, memory: 69, iops: 1480, latency: 1.7 },
];

export const mockCompanies: MockCompany[] = [
  {
    name: 'Acme Storage',
    systems: [
      {
        unit_id: 'unit-001',
        hostid: 'host-01',
        pool: 'poolA',
        name: 'Atlas-01',
        type: 'Hybrid Array',
        used: 860,
        avail: 1200,
        used_snap: 205,
        perc_used: 72,
        perc_snap: 18,
        sending_telemetry: true,
        telemetryDelay: 5,
        MUP: 12,
        avg_speed: 140,
        avg_time: 55,
        company: 'Acme Storage',
        capacityHistory: sharedCapacityHistory,
        datasetHistory: sharedDatasetHistory,
        usageForecast: sharedForecast,
        fileTrends: sharedFileTrends,
        energyImpact: sharedEnergyImpact,
        stateVectors: sharedStateVectors,
        version: '7.2.1'
      },
      {
        unit_id: 'unit-002',
        hostid: 'host-02',
        pool: 'poolB',
        name: 'Atlas-02',
        type: 'All Flash',
        used: 640,
        avail: 900,
        used_snap: 160,
        perc_used: 71,
        perc_snap: 22,
        sending_telemetry: true,
        telemetryDelay: 2,
        MUP: 8,
        avg_speed: 155,
        avg_time: 48,
        company: 'Acme Storage',
        capacityHistory: sharedCapacityHistory.map(point => ({ ...point, used: point.used * 0.85, total: 900 })),
        datasetHistory: sharedDatasetHistory.map(point => ({ ...point, used: point.used * 0.8, total: 250 })),
        usageForecast: sharedForecast,
        fileTrends: sharedFileTrends,
        energyImpact: sharedEnergyImpact,
        stateVectors: sharedStateVectors,
        version: '7.3.0'
      }
    ]
  },
  {
    name: 'Northwind Data',
    systems: [
      {
        unit_id: 'unit-101',
        hostid: 'host-11',
        pool: 'poolX',
        name: 'Aurora-01',
        type: 'Object Storage',
        used: 420,
        avail: 1100,
        used_snap: 120,
        perc_used: 48,
        perc_snap: 12,
        sending_telemetry: false,
        telemetryDelay: 0,
        MUP: 18,
        avg_speed: 112,
        avg_time: 70,
        company: 'Northwind Data',
        capacityHistory: sharedCapacityHistory.map(point => ({ ...point, used: point.used * 0.6, total: 1100 })),
        datasetHistory: sharedDatasetHistory.map(point => ({ ...point, used: point.used * 0.55, total: 220 })),
        usageForecast: sharedForecast,
        fileTrends: sharedFileTrends,
        energyImpact: sharedEnergyImpact,
        stateVectors: sharedStateVectors,
        version: '6.9.4'
      }
    ]
  }
];

export function getSystemByUnitId(unitId?: string): MockSystem | undefined {
  for (const company of mockCompanies) {
    const found = company.systems.find(sys => sys.unit_id === unitId);
    if (found) return found;
  }
  return undefined;
}

export function getCompanyByName(name?: string): MockCompany | undefined {
  return mockCompanies.find(company => company.name === name);
}

export const dummyPermissions = [
  { id: 'Dashboard__Main', page: 'Dashboard', component: 'Main' },
  { id: 'Reports__Exports', page: 'Reports', component: 'Exports' },
  { id: 'Companies__List', page: 'Companies', component: 'List' },
  { id: 'CompaniesDetail__System Status', page: 'CompaniesDetail', component: 'System Status' },
  { id: 'SystemDetail__Health - Capacity', page: 'SystemDetail', component: 'Health - Capacity' },
];

export const dummyEmployees = [
  {
    id: 'emp-001',
    username: 'maria.rossi',
    password: 'Password123!',
    role: 'employee',
    company: 'Acme Storage',
    subscription: 'Essential',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    parentCustomerId: 'cust-001',
    permissions: ['Dashboard__Main', 'Reports__Exports']
  },
  {
    id: 'emp-002',
    username: 'luca.bianchi',
    password: 'Password123!',
    role: 'admin_employee',
    company: 'Acme Storage',
    subscription: 'Essential',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    parentCustomerId: 'cust-001',
    visibleCompanies: ['Acme Storage', 'Northwind Data'],
    permissions: ['Dashboard__Main', 'Companies__List', 'CompaniesDetail__System Status']
  }
];
