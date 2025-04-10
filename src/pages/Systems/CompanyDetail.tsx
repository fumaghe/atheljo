import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Server,
  AlertTriangle,
  CheckCircle,
  Building2,
  Database,
  Signal,
  ChevronRight,
  Lock
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSubscriptionPermissions } from '../../hooks/useSubscriptionPermissions';
import firestore from '../../firebaseClient';
import { collection, query, where, getDocs } from 'firebase/firestore';
import LoadingDots from '../Dashboard/components/LoadingDots';
import { calculateSystemHealthScore } from '../../utils/calculateSystemHealthScore';

interface SystemData {
  name: string;
  hostid: string;
  pool: string;
  unit_id: string; // Campo per collegare hostid e pool insieme
  type: string;
  used: number;
  avail: number;
  used_snap: number;
  perc_used: number;
  perc_snap: number;
  sending_telemetry: boolean;
  telemetryDelay: number; // in minuti
  first_date: string;
  last_date: string;
  MUP: number;
  avg_speed: number;
  avg_time: number; // già in minuti
  company: string;
}

// Interface per i sistemi aggregati: l'aggregazione per pool è fatta soltanto se i record appartengono allo stesso unit_id
interface AggregatedSystem extends SystemData {
  pools: string[];
  count: number;
}

interface CompanyStats {
  name: string;
  totalSystems: number;
  healthyCount: number;
  warningCount: number;
  criticalCount: number;
  telemetryActive: number;
  avgUsage: number;
  totalCapacity: number;
  usedCapacity: number;
  uniquePools: number;
  healthScore: number;
  healthBreakdown: {
    capacityImpact: number;
    snapshotImpact: number;
    telemetryImpact: number;
    performanceImpact: number;
    mupImpact: number;
  };
}

export default function CompanyDetail() {
  const { companyName } = useParams<{ companyName: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [systems, setSystems] = useState<AggregatedSystem[]>([]);
  const [companyStats, setCompanyStats] = useState<CompanyStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    type: 'all',
    status: 'all',
    telemetry: 'active'
  });
  const [searchTerm, setSearchTerm] = useState('');

  // Hook per "System Status"
  const { canAccess: statusCanAccess, shouldBlur: statusShouldBlur } =
    useSubscriptionPermissions('CompaniesDetail', 'System Status');

  // Hook per "System Health Score"
  const { canAccess: scoreCanAccess, shouldBlur: scoreShouldBlur } =
    useSubscriptionPermissions('CompaniesDetail', 'System Health Score');

  useEffect(() => {
    const loadSystems = async () => {
      try {
        setIsLoading(true);
        setError(null);
        // Recupera i sistemi dalla collection "system_data" filtrando per company
        const systemsRef = collection(firestore, 'system_data');
        const q = query(systemsRef, where('company', '==', decodeURIComponent(companyName!)));
        const querySnapshot = await getDocs(q);
        const rawSystems: SystemData[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          rawSystems.push({
            name: data.name || '',
            hostid: data.hostid || '',
            pool: data.pool || '',
            unit_id: data.unit_id || '', // Lettura del nuovo campo unit_id
            type: data.type || '',
            used: Number(data.used),
            avail: Number(data.avail),
            used_snap: Number(data.used_snap),
            perc_used: Number(data.perc_used),
            perc_snap: Number(data.perc_snap),
            sending_telemetry: String(data.sending_telemetry).toLowerCase() === 'true',
            telemetryDelay: Number(data.telemetryDelay) || 0,
            first_date: data.first_date || '',
            last_date: data.last_date || '',
            MUP: Number(data.MUP),
            avg_speed: Number(data.avg_speed),
            avg_time: Number(data.avg_time),
            company: data.company || ''
          });
        });

        // Raggruppa per unit_id e poi per pool all’interno dello stesso unit_id.
        const unitGroups: { [unitId: string]: { [pool: string]: SystemData } } = {};
        rawSystems.forEach(system => {
          if (!unitGroups[system.unit_id]) {
            unitGroups[system.unit_id] = {};
          }
          // Raggruppa per pool (all’interno dello stesso unit_id): se già presente, prendi quello con last_date più recente.
          if (!unitGroups[system.unit_id][system.pool]) {
            unitGroups[system.unit_id][system.pool] = system;
          } else if (new Date(system.last_date) > new Date(unitGroups[system.unit_id][system.pool].last_date)) {
            unitGroups[system.unit_id][system.pool] = system;
          }
        });

        // Calcola la data di cutoff: 1 mese fa dalla data corrente.
        const now = new Date();
        const cutoff = new Date(now);
        cutoff.setMonth(now.getMonth() - 1);

        // Per ogni unità, filtra i record per pool:
        // - Se esistono record con last_date ≥ cutoff, li si utilizza.
        // - Se non ce ne sono, allora si usa comunque l’insieme completo dei record (ossia, la pool con la last_date più recente, anche se "vecchia")
        const aggregatedSystems: AggregatedSystem[] = [];
        Object.keys(unitGroups).forEach(unitId => {
          const poolRecords = Object.values(unitGroups[unitId]);
          let validPoolRecords = poolRecords.filter(record => new Date(record.last_date) >= cutoff);
          if (validPoolRecords.length === 0) {
            // Fallback: usa tutti i record di quella unità
            validPoolRecords = poolRecords;
          }
          const count = validPoolRecords.length;
          // Se c'è un solo record valido, lo usiamo direttamente; altrimenti, tra i validi, prendiamo quello con la last_date più recente.
          if (count === 1) {
            const record = validPoolRecords[0];
            aggregatedSystems.push({
              ...record,
              pools: [record.pool],
              count
            });
          } else {
            const representativeRecord = validPoolRecords.reduce((prev, curr) =>
              new Date(prev.last_date) > new Date(curr.last_date) ? prev : curr
            );
            aggregatedSystems.push({
              ...representativeRecord,
              pools: [representativeRecord.pool],
              count
            });
          }
        });

        setSystems(aggregatedSystems);

        // Calcola le statistiche della company basandosi sui sistemi aggregati
        const totalCapacity = aggregatedSystems.reduce((sum, s) => sum + s.avail, 0);
        const usedCapacity = aggregatedSystems.reduce((sum, s) => sum + s.used, 0);
        const avgUsage = aggregatedSystems.reduce((sum, s) => sum + s.perc_used, 0) / aggregatedSystems.length;
        const poolSet = new Set<string>();
        aggregatedSystems.forEach(s => s.pools.forEach(pool => poolSet.add(pool)));
        const uniquePools = poolSet.size;
        const telemetryActive = aggregatedSystems.filter(s => s.sending_telemetry).length;

        let healthyCount = 0;
        let warningCount = 0;
        let criticalCount = 0;
        aggregatedSystems.forEach(system => {
          const score = calculateSystemHealthScore(system);
          if (score >= 80) healthyCount++;
          else if (score >= 50) warningCount++;
          else criticalCount++;
        });
        const totalSystems = aggregatedSystems.length;
        const companyHealthScore = 75; // Esempio semplificato

        const computedCompanyStats: CompanyStats = {
          name: decodeURIComponent(companyName!),
          totalSystems,
          healthyCount,
          warningCount,
          criticalCount,
          telemetryActive,
          avgUsage,
          totalCapacity,
          usedCapacity,
          uniquePools,
          healthScore: companyHealthScore,
          healthBreakdown: {
            capacityImpact: 0,
            snapshotImpact: 0,
            telemetryImpact: 0,
            performanceImpact: 0,
            mupImpact: 0
          }
        };

        // Verifica delle autorizzazioni in base al ruolo utente
        if (user) {
          if (user.role === 'admin_employee') {
            if (
              user.visibleCompanies &&
              !user.visibleCompanies.includes('all') &&
              !user.visibleCompanies.includes(computedCompanyStats.name)
            ) {
              setError('Access denied');
              return;
            }
          } else if (user.role !== 'admin' && computedCompanyStats.name !== user.company) {
            setError('Access denied');
            return;
          }
        }
        setCompanyStats(computedCompanyStats);
      } catch (error) {
        console.error('Error loading systems:', error);
        setError('Failed to load systems data');
      } finally {
        setIsLoading(false);
      }
    };

    if (companyName) {
      loadSystems();
    }
  }, [companyName, user]);

  // Helper per definire il colore dello health score
  const getHealthScoreColor = (score: number): string => {
    if (score >= 80) return 'text-[#22c1d4]';
    if (score >= 50) return 'text-[#eeeeee]';
    return 'text-[#f8485e]';
  };

  // Filtra i sistemi in base ai filtri selezionati
  const filteredSystems = systems.filter(system => {
    if (filters.type !== 'all' && !system.type.includes(filters.type)) return false;
    if (filters.status !== 'all') {
      const score = calculateSystemHealthScore(system);
      if (filters.status === 'healthy' && score < 80) return false;
      if (filters.status === 'warning' && (score < 50 || score >= 80)) return false;
      if (filters.status === 'critical' && score >= 50) return false;
    }
    if (filters.telemetry !== 'all') {
      if (filters.telemetry === 'active' && !system.sending_telemetry) return false;
      if (filters.telemetry === 'inactive' && system.sending_telemetry) return false;
    }
    return true;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <LoadingDots/>
      </div>
    );
  }

  if (error || !companyStats) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-[#f8485e] text-xl">{error || 'Systems data not found'}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/systems')}
            className="p-2 hover:bg-[#0b3c43] rounded-full transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-[#22c1d4]" />
          </button>
          <div className="flex items-center gap-3">
            <Building2 className="w-8 h-8 text-[#22c1d4]" />
            <div>
              <h1 className="text-2xl text-[#f8485e] font-bold">{companyStats.name}</h1>
              <p className="text-[#eeeeee]/60">
                {companyStats.totalSystems} Systems • {companyStats.uniquePools} Pools
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-4">
          <select
            className="bg-[#0b3c43] rounded-lg px-4 py-2 border border-[#22c1d4]/20"
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
          >
            <option value="all">All Status</option>
            <option value="healthy">Healthy</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
          <select
            className="bg-[#0b3c43] rounded-lg px-4 py-2 border border-[#22c1d4]/20"
            value={filters.telemetry}
            onChange={(e) => setFilters(prev => ({ ...prev, telemetry: e.target.value }))}
          >
            <option value="all">All Telemetry</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Blocco "System Status" in alto */}
      {(() => {
        if (!statusCanAccess && !statusShouldBlur) return null;
        return (
          <div className="relative bg-[#06272b] rounded-lg p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-6">
              {/* Storage Usage Card */}
              <div className="bg-[#0b3c43] rounded-lg p-6 shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[#eeeeee]/60">Total Used Capacity</span>
                  <Database className="w-5 h-5 text-[#22c1d4]" />
                </div>
                <div className="text-2xl font-bold mb-2">
                  {`${companyStats.avgUsage.toFixed(2)}%`}
                </div>
                <div className="relative h-2 bg-[#06272b] rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${
                      companyStats.avgUsage >= 90 ? 'bg-[#f8485e]' :
                      companyStats.avgUsage >= 80 ? 'bg-[#eeeeee]' :
                      'bg-[#22c1d4]'
                    }`}
                    style={{ width: `${companyStats.avgUsage}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1 text-xs text-white">
                  <span>{`${(companyStats.usedCapacity / 1024).toFixed(2)} TB`}</span>
                  <span>{`${(((companyStats.usedCapacity + companyStats.totalCapacity) / 1024).toFixed(2))} TB`}</span>
                </div>
                <div className="text-sm text-[#eeeeee]/60 mt-2">
                  Systems capacity usage
                </div>
              </div>

              {/* System Status Card */}
              <div className="bg-[#0b3c43] rounded-lg p-6 relative overflow-hidden shadow-lg">
                <div className={statusShouldBlur ? 'blur-sm pointer-events-none' : ''}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[#eeeeee]/60">System Status</span>
                    <Server className="w-5 h-5 text-[#22c1d4]" />
                  </div>
                  <div className="text-2xl font-bold mb-2">
                    {statusShouldBlur ? 'N/A' : `${companyStats.healthyCount}/${companyStats.totalSystems}`}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {statusShouldBlur ? (
                      <span className="text-[#eeeeee]">N/A</span>
                    ) : (
                      <>
                        <span className="flex items-center gap-1 text-[#22c1d4]">
                          Healthy: {companyStats.healthyCount}
                        </span>
                        <span className="flex items-center gap-1 text-[#eeeeee]">
                          Warning: {companyStats.warningCount}
                        </span>
                        {companyStats.criticalCount > 0 && (
                          <span className="flex items-center gap-1 text-[#f8485e]">
                            Critical: {companyStats.criticalCount}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {statusShouldBlur && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center px-4 overflow-hidden">
                    <Lock className="w-6 h-6 text-white mb-2" />
                    <span className="text-white text-lg break-words max-w-full">
                      Upgrade subscription to see System Status
                    </span>
                  </div>
                )}
              </div>

              {/* Telemetry Status Card */}
              <div className="bg-[#0b3c43] rounded-lg p-6 shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[#eeeeee]/60">Telemetry Status</span>
                  <Signal className="w-5 h-5 text-[#22c1d4]" />
                </div>
                <div className="text-2xl font-bold mb-2">
                  {`${companyStats.telemetryActive}/${companyStats.totalSystems}`}
                </div>
                <div className="text-sm text-[#eeeeee]/60">
                  Systems sending telemetry
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Elenco dei sistemi */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredSystems.map((system) => {
          const score = calculateSystemHealthScore(system);
          const performanceColor = system.avg_time >= 4 && system.avg_time <= 6 ? 'text-[#22c1d4]' : 'text-[#f8485e]';
          return (
            <div key={system.unit_id} className="bg-[#0b3c43] rounded-lg p-6 shadow-lg">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <Server className="w-6 h-6 text-[#22c1d4]" />
                  <div>
                    <h3 className="text-lg font-semibold">{system.name}</h3>
                    <span className="text-sm text-[#eeeeee]/60">{system.type}</span>
                  </div>
                </div>
                {(() => {
                  if (!scoreCanAccess && !scoreShouldBlur) return null;
                  return (
                    <div className="relative">
                      <div
                        className={`${scoreShouldBlur ? 'blur-sm pointer-events-none' : ''} text-lg font-bold ${getHealthScoreColor(score)}`}
                      >
                        {scoreShouldBlur ? 'N/A' : score}
                      </div>
                      {scoreShouldBlur && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center">
                          <Lock className="w-5 h-5 text-white" />
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Capacity Usage</span>
                    <span className={system.perc_used > 70 ? 'text-[#f8485e]' : 'text-[#22c1d4]'}>
                      {system.perc_used.toFixed(2)}%
                    </span>
                  </div>
                  <div className="relative h-2 bg-[#06272b] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${system.perc_used > 70 ? 'bg-[#f8485e]' : 'bg-[#22c1d4]'}`}
                      style={{ width: `${system.perc_used}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1 text-xs text-white">
                    <span>{`${(system.used / 1024).toFixed(2)} TB`}</span>
                    <span>{`${(((system.avail + system.used) / 1024).toFixed(2))} TB`}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-sm text-[#eeeeee]/60">Snapshots</div>
                    <div className="font-semibold text-[#22c1d4]">
                      {system.used_snap} GB
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-[#eeeeee]/60">Telemetry</div>
                    {(() => {
                      const telemetryDisplay = system.sending_telemetry ? 'Active' : 'Inactive';
                      const telemetryColor = system.sending_telemetry ? 'text-[#22c1d4]' : 'text-[#f8485e]';
                      return (
                        <div className={`font-semibold ${telemetryColor}`}>
                          {telemetryDisplay}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-[#eeeeee]/60">Performance</div>
                    <div className={`font-semibold ${performanceColor}`}>
                      {system.avg_speed} min
                    </div>
                  </div>
                </div>

                <div className="text-right text-xs text-[#eeeeee]/60 mt-2">
                  Last update: {system.last_date}
                </div>

                <button
                  onClick={() => navigate(`/systems/${system.unit_id}`)}
                  className="w-full py-2 mt-4 bg-[#22c1d4] text-[#06272b] rounded-lg font-semibold hover:bg-[#22c1d4]/90 transition-colors"
                >
                  View Details
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Helper per definire il colore dello health score
function getHealthScoreColor(score: number): string {
  if (score >= 80) return 'text-[#22c1d4]';
  if (score >= 50) return 'text-[#eeeeee]';
  return 'text-[#f8485e]';
}
