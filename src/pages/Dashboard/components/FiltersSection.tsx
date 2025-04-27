// FiltersSection.tsx
import React from 'react';
import { Filter } from 'lucide-react';
import { FilterOptions, FilterSelections } from '../types';

interface FiltersSectionProps {
  filters: FilterSelections;
  setFilters: React.Dispatch<React.SetStateAction<FilterSelections>>;
  filterOptions: FilterOptions;
  user: {
    role: 'admin' | 'admin_employee' | string;
    visibleCompanies?: string[] | null;
  };
  filtersOpen: boolean;
  subscription: { canAccess: boolean; shouldBlur: boolean };
}

const FiltersSection: React.FC<FiltersSectionProps> = ({
  filters,
  setFilters,
  filterOptions,
  user,
  filtersOpen,
  subscription
}) => {
  // Se è admin_employee e visibleCompanies contiene 'all', mostro tutte le companies
  const companyOptions =
    user.role === 'admin_employee'
      ? (user.visibleCompanies?.includes('all')
          ? filterOptions.companies.filter(c => c !== 'all')
          : user.visibleCompanies || []
        )
      : filterOptions.companies.filter(c => c !== 'all');

  return (
    <div
      className={`
        relative
        border border-[#22c1d4]/10 rounded-lg bg-[#0b3c43] shadow-lg overflow-hidden 
        transition-all duration-300 ease-in-out
        ${filtersOpen ? 'max-h-[400px] p-4 mt-2' : 'max-h-0 p-0'}
        ${subscription.shouldBlur ? 'blur-sm pointer-events-none' : ''}
      `}
    >
      {subscription.shouldBlur && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-blur-sm">
          <div>
            <Filter className="w-6 h-6 text-white mb-2" />
            <span className="text-white text-lg">
              Alerts Card - Upgrade your subscription to see this content.
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        {(user.role === 'admin' || user.role === 'admin_employee') && (
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs text-[#eeeeee]/60 mb-1">Company</label>
            <select
              value={filters.company}
              onChange={e =>
                setFilters(prev => ({ ...prev, company: e.target.value }))
              }
              className="w-full bg-[#06272b] rounded-lg px-3 py-2 border border-[#22c1d4]/20"
            >
              <option value="all">All Companies</option>
              {companyOptions.map((company, idx) => (
                <option key={`${company}-${idx}`} value={company}>
                  {company}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* System Type */}
        <div className="flex-1 min-w-[150px]">
          <label className="block text-xs text-[#eeeeee]/60 mb-1">System Type</label>
          <select
            value={filters.type}
            onChange={e =>
              setFilters(prev => ({ ...prev, type: e.target.value }))
            }
            className="w-full bg-[#06272b] rounded-lg px-3 py-2 border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]"
          >
            <option value="all">All Types</option>
            {filterOptions.types.filter(t => t !== 'all').map((type, idx) => (
              <option key={`${type}-${idx}`} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        {/* Pool */}
        <div className="flex-1 min-w-[150px]">
          <label className="block text-xs text-[#eeeeee]/60 mb-1">Pool</label>
          <select
            value={filters.pool}
            onChange={e =>
              setFilters(prev => ({ ...prev, pool: e.target.value }))
            }
            className="w-full bg-[#06272b] rounded-lg px-3 py-2 border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]"
          >
            <option value="all">All Pools</option>
            {filterOptions.pools.filter(p => p !== 'all').map((pool, idx) => (
              <option key={`${pool}-${idx}`} value={pool}>
                {pool}
              </option>
            ))}
          </select>
        </div>

        {/* Telemetry Status */}
        <div className="flex-1 min-w-[150px]">
          <label className="block text-xs text-[#eeeeee]/60 mb-1">Telemetry Status</label>
          <select
            value={filters.telemetry}
            onChange={e =>
              setFilters(prev => ({ ...prev, telemetry: e.target.value }))
            }
            className="w-full bg-[#06272b] rounded-lg px-3 py-2 border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]"
          >
            <option value="all">All Systems</option>
            <option value="active">Telemetry Active</option>
            <option value="inactive">Telemetry Inactive</option>
          </select>
        </div>

        {/* Time Range */}
        <div className="flex-1 min-w-[150px]">
          <label className="block text-xs text-[#eeeeee]/60 mb-1">Time Range</label>
          <select
            value={filters.timeRange}
            onChange={e => {
              const newValue = e.target.value;
              // Se "all" è selezionato per Company e il valore supera 90, forziamo 90
              if (filters.company === 'all' && parseInt(newValue) > 90) {
                setFilters(prev => ({ ...prev, timeRange: '90' }));
              } else {
                setFilters(prev => ({ ...prev, timeRange: newValue }));
              }
            }}
            className="w-full bg-[#06272b] rounded-lg px-3 py-2 border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]"
          >
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
            {filters.company !== 'all' && (
              <>
                <option value="180">Last 6 Months</option>
                <option value="365">Last Year</option>
                <option value="4000">All</option>
              </>
            )}
          </select>
        </div>
      </div>
    </div>
  );
};

export default FiltersSection;
