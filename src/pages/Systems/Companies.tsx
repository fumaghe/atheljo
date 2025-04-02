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
import { collection, getDocs, QueryDocumentSnapshot } from 'firebase/firestore';
import firestore from '../../firebaseClient';
import { useAuth } from '../../context/AuthContext';
import { useSubscriptionPermissions } from '../../hooks/useSubscriptionPermissions';
// Importa la funzione centralizzata
import { calculateSystemHealthScore } from '../../utils/calculateSystemHealthScore';

interface SystemData {
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
  systems: SystemData[];
  versions: { [key: string]: number };
}

let cachedCompaniesData: CompanyStats[] | null = null;
let companiesCacheTimestamp: number | null = null;
const COMPANIES_CACHE_DURATION = 20 * 60 * 1000;

export default function Companies() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [companies, setCompanies] = useState<CompanyStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    status: 'all',
    version: 'all',
  });

  const { canAccess: healthCanAccess, shouldBlur: healthShouldBlur } =
    useSubscriptionPermissions('Companies', 'System Health Score');

  useEffect(() => {
    const loadSystems = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const now = Date.now();
        let companyStats: CompanyStats[] = [];

        // Se esiste una cache valida, usala
        if (
          companiesCacheTimestamp &&
          now - companiesCacheTimestamp < COMPANIES_CACHE_DURATION &&
          cachedCompaniesData
        ) {
          companyStats = cachedCompaniesData;
        } else {
          // Altrimenti, carica i dati dalla collection "system_data"
          const snapshot = await getDocs(collection(firestore, 'system_data'));
          const data = snapshot.docs.map((doc: QueryDocumentSnapshot) => doc.data()) as SystemData[];

          // Raggruppa i sistemi per azienda
          const companyMap = new Map<string, SystemData[]>();
          data.forEach((system) => {
            const parsedSystem: SystemData = {
              ...system,
              used: Number(system.used),
              avail: Number(system.avail),
              used_snap: Number(system.used_snap),
              perc_used: Number(system.perc_used),
              perc_snap: Number(system.perc_snap),
              MUP: Number(system.MUP),
              avg_speed: Number(system.avg_speed),
              avg_time: Number(system.avg_time),
              sending_telemetry: String(system.sending_telemetry).toLowerCase() === 'true',
            };
            if (!companyMap.has(parsedSystem.company)) {
              companyMap.set(parsedSystem.company, []);
            }
            companyMap.get(parsedSystem.company)!.push(parsedSystem);
          });

          companyStats = Array.from(companyMap.entries()).map(([name, systems]) => {
            const uniquePools = new Set(systems.map(s => s.pool)).size;
            const totalCapacity = systems.reduce((sum, s) => sum + s.used + s.avail, 0);
            const usedCapacity = systems.reduce((sum, s) => sum + s.used, 0);
            const avgUsage = systems.reduce((sum, s) => sum + s.perc_used, 0) / systems.length;

            const healthScores = systems.map(s => calculateSystemHealthScore(s));
            const avgHealthScore = healthScores.reduce((acc, score) => acc + score, 0) / systems.length;
            const healthyCount = healthScores.filter(score => score >= 80).length;
            const warningCount = healthScores.filter(score => score >= 50 && score < 80).length;
            const criticalCount = healthScores.filter(score => score < 50).length;

            const telemetryActive = systems.filter(s => s.sending_telemetry).length;
            const versions = systems.reduce((acc, sys) => {
              const version = sys.type;
              acc[version] = (acc[version] || 0) + 1;
              return acc;
            }, {} as { [key: string]: number });

            return {
              name,
              systemCount: systems.length,
              poolCount: uniquePools,
              totalCapacity,
              usedCapacity,
              avgUsage,
              avgHealthScore,
              healthyCount,
              warningCount,
              criticalCount,
              telemetryActive,
              systems,
              versions,
            } as CompanyStats;
          });

          companiesCacheTimestamp = now;
          cachedCompaniesData = companyStats;
        }

        // Se l'utente non è admin, filtra per azienda
        if (user) {
          if (user.role === 'admin_employee') {
            if (user.visibleCompanies && !user.visibleCompanies.includes('all')) {
              companyStats = companyStats.filter((stat) => user.visibleCompanies!.includes(stat.name));
            }
            // se 'all' è incluso non filtra, altrimenti mostra solo le aziende assegnate
          } else if (user.role !== 'admin') {
            // dipendenti normali vedono solo la loro azienda
            companyStats = companyStats.filter((stat) => stat.name === user.company);
          }
        }

        setCompanies(companyStats);
      } catch (error) {
        console.error('Error loading systems:', error);
        setError('Failed to load systems data');
      } finally {
        setIsLoading(false);
      }
    };

    loadSystems();
  }, [user]);

  const filteredCompanies = companies.filter((company) => {
    if (searchTerm && !company.name.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    if (filters.status !== 'all') {
      if (filters.status === 'critical' && company.criticalCount === 0) return false;
      if (filters.status === 'warning' && company.warningCount === 0) return false;
      if (filters.status === 'healthy' && company.healthyCount !== company.systemCount) return false;
    }
    if (filters.version !== 'all') {
      const hasVersion = Object.keys(company.versions).some((v) =>
        v.includes(filters.version)
      );
      if (!hasVersion) return false;
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
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#eeeeee]/60" />
          <input
            type="text"
            placeholder="Search companies..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[#0b3c43] rounded-lg border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]"
          />
        </div>
        <div className="flex gap-4">
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
          <select
            className="bg-[#0b3c43] text-[#eeeeee] rounded px-3 py-2 border border-[#22c1d4]/20 focus:outline-none"
            value={filters.version}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, version: e.target.value }))
            }
          >
            <option value="all">All Versions</option>
            <option value="3.5">AiRE 3.5</option>
            <option value="4.0">AiRE 4.0</option>
          </select>
        </div>
      </div>

      {isSingleCompany ? (
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
                  <h2 className="text-xl text-[#f8485e] font-semibold">
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
                  {(company.usedCapacity / 1024).toFixed(2)} TB / {(company.totalCapacity / 1024).toFixed(2)} TB
                </div>
              </div>

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
                    <div className={`${healthShouldBlur ? 'blur-sm pointer-events-none' : ''}`}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-[#eeeeee]/60">System Health</span>
                        <Server className="w-4 h-4 text-[#22c1d4]" />
                      </div>
                      <div className="text-2xl font-bold mb-1">
                        {healthShouldBlur ? 'N/A' : `${Math.round(company.avgHealthScore)}%`}
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

              <div className="bg-[#06272b] rounded-lg p-4 flex-1">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-[#eeeeee]/60">Telemetry Status</span>
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

            <div className="mt-4">
              <div className="flex items-center gap-2 text-sm text-[#eeeeee]/60 mb-2">
                <Users className="w-4 h-4 text-[#22c1d4]" />
                <span>System Versions:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(company.versions).map(([version, count]) => (
                  <span key={version} className="px-2 py-1 bg-[#06272b] rounded text-xs">
                    {version} ({count})
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))
      ) : (
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
                    <h2 className="text-xl text-[#f8485e] font-semibold">
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
                    {(company.usedCapacity / 1024).toFixed(2)} TB / {(company.totalCapacity / 1024).toFixed(2)} TB
                  </div>
                </div>

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
                      <div className={`${healthShouldBlur ? 'blur-sm pointer-events-none' : ''}`}>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm text-[#eeeeee]/60">System Health</span>
                          <Server className="w-4 h-4 text-[#22c1d4]" />
                        </div>
                        <div className="text-2xl font-bold mb-1">
                          {healthShouldBlur ? 'N/A' : `${Math.round(company.avgHealthScore)}%`}
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

                <div className="bg-[#06272b] rounded-lg p-4 flex-1">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-[#eeeeee]/60">Telemetry Status</span>
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

              <div className="mt-4">
                <div className="flex items-center gap-2 text-sm text-[#eeeeee]/60 mb-2">
                  <Users className="w-4 h-4 text-[#22c1d4]" />
                  <span>System Versions:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(company.versions).map(([version, count]) => (
                    <span key={version} className="px-2 py-1 bg-[#06272b] rounded text-xs">
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
