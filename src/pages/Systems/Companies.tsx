// src/pages/Systems/Companies.tsx

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  Server,
  Database,
  Users,
  Lock,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Signal,
  Search,
} from 'lucide-react';
import {
  collection,
  getDocs,
  QueryDocumentSnapshot,
  query,
} from 'firebase/firestore';
import firestore from '../../firebaseClient';
import { useAuth } from '../../context/AuthContext';
import { useSubscriptionPermissions } from '../../hooks/useSubscriptionPermissions';
import { calculateSystemHealthScore } from '../../utils/calculateSystemHealthScore';

interface SystemData {
  name: string;
  hostid: string;
  pool: string;
  unit_id: string;
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

interface AggregatedSystem extends SystemData {
  pools: string[];
  count: number;
}

interface CompanyStats {
  name: string;
  systemCount: number;
  poolCount: number;
  totalCapacity: number;
  usedCapacity: number;
  avgUsage: number;
  avgHealthScore: number;
  healthyCount: number;
  warningCount: number;
  criticalCount: number;
  telemetryActive: number;
  systems: AggregatedSystem[];
  versions: { [key: string]: number };
}

let cachedCompaniesData: CompanyStats[] | null = null;
let companiesCacheTimestamp: number | null = null;
const COMPANIES_CACHE_DURATION = 20 * 60 * 1000; // 20 minutes

export default function Companies() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [companies, setCompanies] = useState<CompanyStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // We'll store all version types found so we can populate the <select> dynamically
  const [allVersions, setAllVersions] = useState<string[]>([]);

  // Add "telemetry" field to the filters
  const [filters, setFilters] = useState({
    status: 'all',
    version: 'all',
    telemetry: 'onlyActive', // "all" | "onlyActive"
    searchTerm: '',
  });

  /**
   * Subscription/permissions for System Health Score
   */
  const { canAccess: healthCanAccess, shouldBlur: healthShouldBlur } =
    useSubscriptionPermissions('Companies', 'System Health Score');

    useEffect(() => {
      const loadSystems = async () => {
        try {
          setIsLoading(true);
          setError(null);
    
          const now = Date.now();
          let companyStatsList: CompanyStats[] = [];
    
          /** Check the cache first */
          if (
            companiesCacheTimestamp &&
            now - companiesCacheTimestamp < COMPANIES_CACHE_DURATION &&
            cachedCompaniesData
          ) {
            companyStatsList = cachedCompaniesData;
          } else {
            // 1) Load from Firestore
            const systemDataRef = collection(firestore, 'system_data');
            const qAll = query(systemDataRef);
            const snapshot = await getDocs(qAll);
    
            // 2) Map & filter out any pool that contains '/'
            //    (inclusi eventuali undefined/null)
            const rawData = snapshot.docs
              .map((doc: QueryDocumentSnapshot) => doc.data() as SystemData)
              .filter(sys => {
                // se pool non è stringa, lo teniamo (è considerato base)
                if (typeof sys.pool !== 'string') return true;
                // altrimenti teniamo solo se NON contiene '/'
                return !sys.pool.includes('/');
              });
    
            // 3) Group by company
            const byCompany: Record<string, SystemData[]> = {};
            for (const item of rawData) {
              // normalize fields
              item.used = Number(item.used);
              item.avail = Number(item.avail);
              item.used_snap = Number(item.used_snap);
              item.perc_used = Number(item.perc_used);
              item.perc_snap = Number(item.perc_snap);
              item.MUP = Number(item.MUP);
              item.avg_speed = Number(item.avg_speed);
              item.avg_time = Number(item.avg_time);
              item.sending_telemetry =
                String(item.sending_telemetry).toLowerCase() === 'true';
    
              if (!byCompany[item.company]) {
                byCompany[item.company] = [];
              }
              byCompany[item.company].push(item);
            }
    
            // 4) Compute cutoff (1 month ago)
            const nowDate = new Date();
            const cutoff = new Date(nowDate);
            cutoff.setMonth(nowDate.getMonth() - 1);
    
            const newCompanyStatsList: CompanyStats[] = [];
    
            // 5) Aggregate per unit_id → pool
            for (const [companyName, systemsOfCompany] of Object.entries(byCompany)) {
              const unitGroups: Record<string, Record<string, SystemData>> = {};
    
              for (const sys of systemsOfCompany) {
                if (!unitGroups[sys.unit_id]) {
                  unitGroups[sys.unit_id] = {};
                }
                const existing = unitGroups[sys.unit_id][sys.pool];
                if (!existing) {
                  unitGroups[sys.unit_id][sys.pool] = sys;
                } else {
                  const curr = new Date(sys.last_date);
                  const prev = new Date(existing.last_date);
                  if (curr > prev) {
                    unitGroups[sys.unit_id][sys.pool] = sys;
                  }
                }
              }
    
              const aggregatedSystems: AggregatedSystem[] = [];
              for (const [unitId, poolMap] of Object.entries(unitGroups)) {
                const poolRecords = Object.values(poolMap);
                let valid = poolRecords.filter(
                  rec => new Date(rec.last_date) >= cutoff
                );
                if (valid.length === 0) valid = poolRecords;
    
                const representative =
                  valid.length === 1
                    ? valid[0]
                    : valid.reduce((p, c) =>
                        new Date(p.last_date) > new Date(c.last_date) ? p : c
                      );
    
                aggregatedSystems.push({
                  ...representative,
                  pools: [representative.pool],
                  count: valid.length,
                });
              }
    
              // 6) Compute stats
              const totalCapacity = aggregatedSystems.reduce(
                (sum, s) => sum + s.used + s.avail,
                0
              );
              const usedCapacity = aggregatedSystems.reduce(
                (sum, s) => sum + s.used,
                0
              );
              const avgUsage =
                aggregatedSystems.reduce((sum, s) => sum + s.perc_used, 0) /
                (aggregatedSystems.length || 1);
    
              const healthScores = aggregatedSystems.map(s =>
                calculateSystemHealthScore(s)
              );
              const avgHealthScore =
                healthScores.reduce((a, x) => a + x, 0) /
                (healthScores.length || 1);
              const healthyCount = healthScores.filter(x => x >= 80).length;
              const warningCount = healthScores.filter(x => x >= 50 && x < 80).length;
              const criticalCount = healthScores.filter(x => x < 50).length;
              const telemetryActive = aggregatedSystems.filter(s => s.sending_telemetry).length;
    
              const poolSet = new Set<string>();
              aggregatedSystems.forEach(sys =>
                sys.pools.forEach(p => poolSet.add(p))
              );
              const poolCount = poolSet.size;
    
              const versions = aggregatedSystems.reduce(
                (acc, sys) => {
                  acc[sys.type] = (acc[sys.type] || 0) + 1;
                  return acc;
                },
                {} as { [key: string]: number }
              );
    
              newCompanyStatsList.push({
                name: companyName,
                systemCount: aggregatedSystems.length,
                poolCount,
                totalCapacity,
                usedCapacity,
                avgUsage,
                avgHealthScore,
                healthyCount,
                warningCount,
                criticalCount,
                telemetryActive,
                systems: aggregatedSystems,
                versions,
              });
            }
    
            companiesCacheTimestamp = now;
            cachedCompaniesData = newCompanyStatsList;
            companyStatsList = newCompanyStatsList;
          }
    
          // 7) User‐based filtering
          if (user) {
            if (user.role === 'admin_employee') {
              if (user.visibleCompanies && !user.visibleCompanies.includes('all')) {
                companyStatsList = companyStatsList.filter(stat =>
                  user.visibleCompanies!.includes(stat.name)
                );
              }
            } else if (user.role !== 'admin') {
              companyStatsList = companyStatsList.filter(
                stat => stat.name === user.company
              );
            }
          }
    
          // 8) Finalize
          setCompanies(companyStatsList);
    
          const versionSet = new Set<string>();
          for (const c of companyStatsList) {
            Object.keys(c.versions).forEach(v => versionSet.add(v));
          }
          setAllVersions(Array.from(versionSet).sort());
        } catch (error) {
          console.error('Error loading systems:', error);
          setError('Failed to load systems data');
        } finally {
          setIsLoading(false);
        }
      };
    
      loadSystems();
    }, [user]);
    

  /**
   * Filter the final array of companies
   */
  const filteredCompanies = companies.filter((company) => {
    // Search filter
    if (
      filters.searchTerm &&
      !company.name.toLowerCase().includes(filters.searchTerm.toLowerCase())
    ) {
      return false;
    }

    // Status filter
    if (filters.status !== 'all') {
      if (filters.status === 'critical' && company.criticalCount === 0) {
        return false;
      }
      if (filters.status === 'warning' && company.warningCount === 0) {
        return false;
      }
      // "Healthy" means all are healthy
      if (
        filters.status === 'healthy' &&
        company.healthyCount !== company.systemCount
      ) {
        return false;
      }
    }

    // Version filter
    if (filters.version !== 'all') {
      const hasVersion = Object.keys(company.versions).some((v) =>
        v.includes(filters.version)
      );
      if (!hasVersion) return false;
    }

    // Telemetry filter
    if (filters.telemetry === 'onlyActive') {
      // show only companies that have >= 1 active telemetry system
      if (company.telemetryActive < 1) {
        return false;
      }
    }

    return true;
  });

  const isSingleCompany = filteredCompanies.length === 1;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-[#22c1d4] text-xl">Loading company data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-[#f8485e] text-xl">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Companies Overview</h1>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#eeeeee]/60" />
          <input
            type="text"
            placeholder="Search companies..."
            value={filters.searchTerm}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, searchTerm: e.target.value }))
            }
            className="w-full pl-10 pr-4 py-2 bg-[#0b3c43] rounded-lg border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-4">
          {/* Status Filter */}
          <select
            className="bg-[#0b3c43] text-[#eeeeee] rounded px-3 py-2 border border-[#22c1d4]/20 focus:outline-none"
            value={filters.status}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, status: e.target.value }))
            }
          >
            <option value="all">All Status</option>
            <option value="healthy">Healthy</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>

          {/* Version Filter (built dynamically) */}
          <select
            className="bg-[#0b3c43] text-[#eeeeee] rounded px-3 py-2 border border-[#22c1d4]/20 focus:outline-none"
            value={filters.version}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, version: e.target.value }))
            }
          >
            <option value="all">All Versions</option>
            {allVersions.map((ver) => (
              <option key={ver} value={ver}>
                {ver}
              </option>
            ))}
          </select>

          {/* Telemetry Filter */}
          <select
            className="bg-[#0b3c43] text-[#eeeeee] rounded px-3 py-2 border border-[#22c1d4]/20 focus:outline-none"
            value={filters.telemetry}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, telemetry: e.target.value }))
            }
          >
            <option value="all">All Telemetry</option>
            <option value="onlyActive">Only Active</option>
          </select>
        </div>
      </div>

      {isSingleCompany ? (
        // If there's exactly 1 company, show an expanded card
        filteredCompanies.map((company) => (
          <div
            key={company.name}
            onClick={() =>
              navigate(`/systems/company/${encodeURIComponent(company.name)}`)
            }
            className="bg-[#0b3c43] rounded-lg p-6 shadow-lg transition-colors cursor-pointer hover:bg-[#0b3c43]/90"
          >
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-[#06272b] rounded-lg">
                  <Building2 className="w-6 h-6 text-[#22c1d4]" />
                </div>
                <div>
                  <h2 className="text-xl text-[#eeeeee] font-semibold">
                    {company.name}
                  </h2>
                  <p className="text-[#eeeeee]/60 text-sm">
                    {company.systemCount} Systems • {company.poolCount} Pools
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#22c1d4]" />
            </div>

            <div className="flex gap-4">
              {/* Capacity Usage */}
              <div className="bg-[#06272b] rounded-lg p-4 flex-1">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-[#eeeeee]/60">
                    Total Used Capacity
                  </span>
                  <Database className="w-4 h-4 text-[#22c1d4]" />
                </div>
                <div className="text-2xl font-bold mb-1">
                  {Math.round(company.avgUsage)}%
                </div>
                <div className="h-2 bg-[#0b3c43] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      company.avgUsage >= 90
                        ? 'bg-[#f8485e]'
                        : company.avgUsage >= 80
                        ? 'bg-[#eeeeee]'
                        : 'bg-[#22c1d4]'
                    }`}
                    style={{ width: `${company.avgUsage}%` }}
                  />
                </div>
                <div className="text-xs text-[#eeeeee]/60 mt-1">
                  {(company.usedCapacity / 1024).toFixed(2)} TB /{' '}
                  {(company.totalCapacity / 1024).toFixed(2)} TB
                </div>
              </div>

              {/* System Health (based on subscription) */}
              {(() => {
                if (!healthCanAccess && !healthShouldBlur) return null;
                return (
                  <div className="relative bg-[#06272b] rounded-lg p-4 flex-1">
                    {healthShouldBlur && (
                      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center">
                        <Lock className="w-6 h-6 text-white mb-2" />
                        <span className="text-white text-sm">
                          Upgrade subscription to see System Health Score
                        </span>
                      </div>
                    )}
                    <div
                      className={`${
                        healthShouldBlur ? 'blur-sm pointer-events-none' : ''
                      }`}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-[#eeeeee]/60">
                          System Health
                        </span>
                        <Server className="w-4 h-4 text-[#22c1d4]" />
                      </div>
                      <div className="text-2xl font-bold mb-1">
                        {healthShouldBlur
                          ? 'N/A'
                          : `${Math.round(company.avgHealthScore)}`}
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        {healthShouldBlur ? (
                          <span className="text-[#eeeeee]">N/A</span>
                        ) : (
                          <>
                            <span className="flex items-center gap-1 text-[#22c1d4]">
                              <CheckCircle className="w-4 h-4" />
                              {company.healthyCount}
                            </span>
                            <span className="flex items-center gap-1 text-[#eeeeee]">
                              <AlertTriangle className="w-4 h-4" />
                              {company.warningCount}
                            </span>
                            <span className="flex items-center gap-1 text-[#f8485e]">
                              <AlertTriangle className="w-4 h-4" />
                              {company.criticalCount}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Telemetry */}
              <div className="bg-[#06272b] rounded-lg p-4 flex-1">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-[#eeeeee]/60">
                    Telemetry Status
                  </span>
                  <Signal className="w-4 h-4 text-[#22c1d4]" />
                </div>
                <div className="text-2xl font-bold mb-1">
                  {company.telemetryActive}/{company.systemCount}
                </div>
                <div className="text-xs text-[#eeeeee]/60 mt-1">
                  Systems sending telemetry
                </div>
              </div>
            </div>

            {/* Versions */}
            <div className="mt-4">
              <div className="flex items-center gap-2 text-sm text-[#eeeeee]/60 mb-2">
                <Users className="w-4 h-4 text-[#22c1d4]" />
                <span>System Versions:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(company.versions).map(([version, count]) => (
                  <span
                    key={version}
                    className="px-2 py-1 bg-[#06272b] rounded text-xs"
                  >
                    {version} ({count})
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))
      ) : (
        // Otherwise, show all companies in a grid
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredCompanies.map((company) => (
            <div
              key={company.name}
              onClick={() =>
                navigate(`/systems/company/${encodeURIComponent(company.name)}`)
              }
              className="bg-[#0b3c43] rounded-lg p-6 shadow-lg transition-colors cursor-pointer hover:bg-[#0b3c43]/90"
            >
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-[#06272b] rounded-lg">
                    <Building2 className="w-6 h-6 text-[#22c1d4]" />
                  </div>
                  <div>
                    <h2 className="text-xl text-[#eeeeee] font-semibold">
                      {company.name}
                    </h2>
                    <p className="text-[#eeeeee]/60 text-sm">
                      {company.systemCount} Systems • {company.poolCount} Pools
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-[#22c1d4]" />
              </div>

              <div className="space-y-4">
                {/* Capacity */}
                <div className="bg-[#06272b] rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-[#eeeeee]/60">
                      Total Used Capacity
                    </span>
                    <Database className="w-4 h-4 text-[#22c1d4]" />
                  </div>
                  <div className="text-2xl font-bold mb-1">
                    {Math.round(company.avgUsage)}%
                  </div>
                  <div className="h-2 bg-[#0b3c43] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        company.avgUsage >= 90
                          ? 'bg-[#f8485e]'
                          : company.avgUsage >= 80
                          ? 'bg-[#eeeeee]'
                          : 'bg-[#22c1d4]'
                      }`}
                      style={{ width: `${company.avgUsage}%` }}
                    />
                  </div>
                  <div className="text-xs text-[#eeeeee]/60 mt-1">
                    {(company.usedCapacity / 1024).toFixed(2)} TB /{' '}
                    {(company.totalCapacity / 1024).toFixed(2)} TB
                  </div>
                </div>

                {/* Health Score */}
                {(() => {
                  if (!healthCanAccess && !healthShouldBlur) return null;
                  return (
                    <div className="relative bg-[#06272b] rounded-lg p-4">
                      {healthShouldBlur && (
                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center">
                          <Lock className="w-6 h-6 text-white mb-2" />
                          <span className="text-white text-sm">
                            Upgrade subscription to see System Health Score
                          </span>
                        </div>
                      )}
                      <div
                        className={`${
                          healthShouldBlur ? 'blur-sm pointer-events-none' : ''
                        }`}
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm text-[#eeeeee]/60">
                            System Health
                          </span>
                          <Server className="w-4 h-4 text-[#22c1d4]" />
                        </div>
                        <div className="text-2xl font-bold mb-1">
                          {healthShouldBlur
                            ? 'N/A'
                            : `${Math.round(company.avgHealthScore)}`}
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          {healthShouldBlur ? (
                            <span className="text-[#eeeeee]">N/A</span>
                          ) : (
                            <>
                              <span className="flex items-center gap-1 text-[#22c1d4]">
                                <CheckCircle className="w-4 h-4" />
                                {company.healthyCount}
                              </span>
                              <span className="flex items-center gap-1 text-[#eeeeee]">
                                <AlertTriangle className="w-4 h-4" />
                                {company.warningCount}
                              </span>
                              <span className="flex items-center gap-1 text-[#f8485e]">
                                <AlertTriangle className="w-4 h-4" />
                                {company.criticalCount}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Telemetry */}
                <div className="bg-[#06272b] rounded-lg p-4 flex-1">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-[#eeeeee]/60">
                      Telemetry Status
                    </span>
                    <Signal className="w-4 h-4 text-[#22c1d4]" />
                  </div>
                  <div className="text-2xl font-bold mb-1">
                    {company.telemetryActive}/{company.systemCount}
                  </div>
                  <div className="text-xs text-[#eeeeee]/60 mt-1">
                    Systems sending telemetry
                  </div>
                </div>
              </div>

              {/* Versions */}
              <div className="mt-4">
                <div className="flex items-center gap-2 text-sm text-[#eeeeee]/60 mb-2">
                  <Users className="w-4 h-4 text-[#22c1d4]" />
                  <span>System Versions:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(company.versions).map(([version, count]) => (
                    <span
                      key={version}
                      className="px-2 py-1 bg-[#06272b] rounded text-xs"
                    >
                      {version} ({count})
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
