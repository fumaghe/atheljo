// src/pages/Systems/Companies.tsx
import React, { useMemo, useState } from 'react';
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
import { mockCompanies } from '../../utils/mockData';
import { calculateSystemHealthScore } from '../../utils/calculateSystemHealthScore';

export default function Companies() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({
    status: 'all',
    telemetry: 'onlyActive',
    searchTerm: '',
  });

  const companies = useMemo(() => {
    return mockCompanies.map(company => {
      const systems = company.systems;
      const healthyCount = systems.filter(sys => calculateSystemHealthScore(sys) >= 80).length;
      const warningCount = systems.filter(sys => {
        const score = calculateSystemHealthScore(sys);
        return score >= 50 && score < 80;
      }).length;
      const criticalCount = systems.filter(sys => calculateSystemHealthScore(sys) < 50).length;
      const telemetryActive = systems.filter(sys => sys.sending_telemetry).length;
      const poolCount = new Set(systems.map(sys => sys.pool)).size;
      const usedCapacity = systems.reduce((sum, sys) => sum + sys.used, 0);
      const totalCapacity = systems.reduce((sum, sys) => sum + sys.avail, 0);
      const avgUsage = systems.length ? usedCapacity / systems.length : 0;
      const avgHealthScore = systems.length
        ? systems.reduce((sum, sys) => sum + calculateSystemHealthScore(sys), 0) / systems.length
        : 0;
      const versions = systems.reduce<Record<string, number>>((acc, sys) => {
        acc[sys.version] = (acc[sys.version] || 0) + 1;
        return acc;
      }, {});

      return {
        name: company.name,
        systems,
        systemCount: systems.length,
        poolCount,
        totalCapacity,
        usedCapacity,
        avgUsage,
        avgHealthScore,
        healthyCount,
        warningCount,
        criticalCount,
        telemetryActive,
        versions,
      };
    });
  }, []);

  const filteredCompanies = companies.filter(company => {
    if (
      filters.status === 'healthy' &&
      !(company.healthyCount > company.warningCount && company.healthyCount > company.criticalCount)
    ) {
      return false;
    }
    if (filters.telemetry === 'onlyActive' && company.telemetryActive === 0) {
      return false;
    }
    if (
      filters.searchTerm &&
      !company.name.toLowerCase().includes(filters.searchTerm.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Companies</h1>
          <p className="text-[#eeeeee]/70">Panoramica dei sistemi con dati di esempio offline</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#22c1d4] absolute left-3 top-3" />
            <input
              value={filters.searchTerm}
              onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
              className="pl-9 pr-4 py-2 bg-[#06272b] border border-[#22c1d4]/20 rounded-lg text-white"
              placeholder="Search company"
            />
          </div>
          <select
            className="bg-[#06272b] border border-[#22c1d4]/20 rounded-lg px-4 py-2 text-white"
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
          >
            <option value="all">All health</option>
            <option value="healthy">Mostly healthy</option>
          </select>
          <select
            className="bg-[#06272b] border border-[#22c1d4]/20 rounded-lg px-4 py-2 text-white"
            value={filters.telemetry}
            onChange={(e) => setFilters(prev => ({ ...prev, telemetry: e.target.value }))}
          >
            <option value="all">All telemetry</option>
            <option value="onlyActive">Only active</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredCompanies.map(company => (
          <div
            key={company.name}
            className="bg-[#0b3c43] rounded-lg p-4 shadow relative group hover:shadow-lg transition-shadow"
          >
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <Building2 className="w-8 h-8 text-[#22c1d4]" />
                <div>
                  <h2 className="text-xl font-semibold">{company.name}</h2>
                  <p className="text-sm text-[#eeeeee]/60">{company.systemCount} systems • {company.poolCount} pools</p>
                </div>
              </div>
              <button
                onClick={() => navigate(`/systems/${company.systems[0].unit_id}`)}
                className="p-2 rounded-full hover:bg-[#06272b] transition-colors"
                aria-label={`Open ${company.name}`}
              >
                <ChevronRight className="w-5 h-5 text-[#22c1d4]" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 my-4 text-sm">
              <div className="p-3 rounded bg-[#06272b] flex items-center gap-2">
                <Server className="w-4 h-4 text-[#22c1d4]" />
                <div>
                  <div className="text-lg font-semibold">{company.systemCount}</div>
                  <div className="text-[#eeeeee]/60">Active systems</div>
                </div>
              </div>
              <div className="p-3 rounded bg-[#06272b] flex items-center gap-2">
                <Database className="w-4 h-4 text-[#22c1d4]" />
                <div>
                  <div className="text-lg font-semibold">{Math.round(company.avgUsage)} GB</div>
                  <div className="text-[#eeeeee]/60">Avg used per system</div>
                </div>
              </div>
              <div className="p-3 rounded bg-[#06272b] flex items-center gap-2">
                <Users className="w-4 h-4 text-[#22c1d4]" />
                <div>
                  <div className="text-lg font-semibold">{company.telemetryActive}/{company.systemCount}</div>
                  <div className="text-[#eeeeee]/60">Telemetry active</div>
                </div>
              </div>
              <div className="p-3 rounded bg-[#06272b] flex items-center gap-2">
                <Signal className="w-4 h-4 text-[#22c1d4]" />
                <div>
                  <div className="text-lg font-semibold">{company.avgHealthScore.toFixed(0)} / 100</div>
                  <div className="text-[#eeeeee]/60">Health score</div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 text-sm">
              <CheckCircle className="w-4 h-4 text-[#22c1d4]" />
              <span className="text-[#eeeeee]/80">{company.healthyCount} healthy</span>
              <AlertTriangle className="w-4 h-4 text-[#eeeeee]" />
              <span className="text-[#eeeeee]/80">{company.warningCount} warning</span>
              <Lock className="w-4 h-4 text-[#f8485e]" />
              <span className="text-[#eeeeee]/80">{company.criticalCount} critical</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
