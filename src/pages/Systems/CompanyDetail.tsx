// src/pages/Systems/CompanyDetail.tsx
import React, { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, Database, Server, Signal } from 'lucide-react';
import { calculateSystemHealthScore } from '../../utils/calculateSystemHealthScore';
import { getCompanyByName } from '../../utils/mockData';

export default function CompanyDetail() {
  const { companyName } = useParams<{ companyName: string }>();
  const navigate = useNavigate();
  const decodedName = decodeURIComponent(companyName || '');
  const company = getCompanyByName(decodedName);

  const stats = useMemo(() => {
    if (!company) return null;
    const systems = company.systems;
    const totalCapacity = systems.reduce((sum, sys) => sum + sys.avail, 0);
    const usedCapacity = systems.reduce((sum, sys) => sum + sys.used, 0);
    const avgUsage = systems.length ? usedCapacity / systems.length : 0;
    const telemetryActive = systems.filter(sys => sys.sending_telemetry).length;
    const healthyCount = systems.filter(sys => calculateSystemHealthScore(sys) >= 80).length;
    const warningCount = systems.filter(sys => {
      const score = calculateSystemHealthScore(sys);
      return score >= 50 && score < 80;
    }).length;
    const criticalCount = systems.filter(sys => calculateSystemHealthScore(sys) < 50).length;
    return {
      avgUsage,
      totalCapacity,
      usedCapacity,
      telemetryActive,
      healthyCount,
      warningCount,
      criticalCount,
    };
  }, [company]);

  if (!company || !stats) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <div className="text-[#f8485e] text-lg">Company not found in the offline dataset.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/systems')}
          className="p-2 rounded-full hover:bg-[#0b3c43]"
        >
          <ArrowLeft className="w-6 h-6 text-[#22c1d4]" />
        </button>
        <div className="flex items-center gap-3">
          <Building2 className="w-8 h-8 text-[#22c1d4]" />
          <div>
            <h1 className="text-2xl font-bold">{company.name}</h1>
            <p className="text-[#eeeeee]/70">{company.systems.length} systems monitored</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#0b3c43] rounded-lg p-4">
          <div className="flex items-center justify-between text-sm text-[#eeeeee]/70 mb-2">
            <span>Total used capacity</span>
            <Database className="w-4 h-4 text-[#22c1d4]" />
          </div>
          <div className="text-3xl font-semibold">{stats.avgUsage.toFixed(0)} GB</div>
          <div className="text-xs text-[#eeeeee]/60">{(stats.usedCapacity / 1024).toFixed(1)} TB su {(stats.totalCapacity / 1024).toFixed(1)} TB</div>
        </div>
        <div className="bg-[#0b3c43] rounded-lg p-4">
          <div className="flex items-center justify-between text-sm text-[#eeeeee]/70 mb-2">
            <span>System status</span>
            <Server className="w-4 h-4 text-[#22c1d4]" />
          </div>
          <div className="text-3xl font-semibold">{stats.healthyCount}/{company.systems.length}</div>
          <div className="text-xs text-[#eeeeee]/60">Healthy {stats.healthyCount} • Warning {stats.warningCount} • Critical {stats.criticalCount}</div>
        </div>
        <div className="bg-[#0b3c43] rounded-lg p-4">
          <div className="flex items-center justify-between text-sm text-[#eeeeee]/70 mb-2">
            <span>Telemetry</span>
            <Signal className="w-4 h-4 text-[#22c1d4]" />
          </div>
          <div className="text-3xl font-semibold">{stats.telemetryActive}/{company.systems.length}</div>
          <div className="text-xs text-[#eeeeee]/60">Sistemi che inviano telemetria</div>
        </div>
      </div>

      <div className="bg-[#0b3c43] rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-4">Systems</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {company.systems.map(sys => {
            const score = calculateSystemHealthScore(sys);
            const color = score >= 80 ? 'text-[#22c1d4]' : score >= 50 ? 'text-[#eeeeee]' : 'text-[#f8485e]';
            return (
              <div key={sys.unit_id} className="bg-[#06272b] rounded-lg p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{sys.name}</div>
                    <div className="text-xs text-[#eeeeee]/60">{sys.type}</div>
                  </div>
                  <div className={`text-lg font-bold ${color}`}>{score.toFixed(0)}</div>
                </div>
                <div className="text-sm text-[#eeeeee]/70">
                  Usage: {sys.perc_used}% • Snap: {sys.perc_snap}%
                </div>
                <button
                  onClick={() => navigate(`/systems/${sys.unit_id}`)}
                  className="self-start text-[#22c1d4] text-sm hover:underline"
                >
                  View details
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
