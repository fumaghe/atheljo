import React, { useState } from 'react';
import { Filter } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSubscriptionPermissions } from '../../hooks/useSubscriptionPermissions';
import FiltersSection from './components/FiltersSection';
import AlertsSection from './components/AlertsSection';
import CapacityTrendsCharts from './components/CapacityTrendsCharts';
import SystemStatistics from './components/SystemStatistics';
import SystemStatusChart from './components/SystemStatusChart';
import SystemTypesChart from './components/SystemTypesChart';
import CapacityDistributionChart from './components/CapacityDistributionChart';
import LoadingDots from './components/LoadingDots';
import { useDashboardData } from './hooks/useDashboardData';

export default function Dashboard() {
  const { user } = useAuth();
  const {
    aggregatedStats,
    filters,
    setFilters,
    filterOptions,
    isLoading,
    prepareUsedTrendsChart,
    prepareSnapshotTrendsChart,
    businessMetrics,
    progress
  } = useDashboardData(user);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [usedUnit, setUsedUnit] = useState<'TB' | '%'>('TB');
  const [snapUnit, setSnapUnit] = useState<'TB' | '%'>('TB');

  // Subscription permissions per le varie sezioni
  const filtersSubscription = useSubscriptionPermissions('Dashboard', 'Filters');
  const alertsSubscription = useSubscriptionPermissions('Dashboard', 'Alerts Card');
  const capTrendSubscription = useSubscriptionPermissions('Dashboard', 'Capacity Trends Chart');
  const statsSubscription = useSubscriptionPermissions('Dashboard', 'System Statistics');
  const statusChartSubscription = useSubscriptionPermissions('Dashboard', 'System Status Chart');
  const typesChartSubscription = useSubscriptionPermissions('Dashboard', 'System Types Chart');
  const capDistSubscription = useSubscriptionPermissions('Dashboard', 'Capacity Distribution Chart');

  return (
    <div className="max-w-screen-xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-start">
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="flex items-center gap-2 bg-[#06272b] text-[#22c1d4] px-4 py-2 rounded shadow-md hover:bg-[#06272b]/80 transition-colors"
        >
          <Filter className="w-5 h-5" />
          <span>{filtersOpen ? 'Hide' : 'Show'} Filters</span>
        </button>
      </div>
      <FiltersSection
        filters={filters}
        setFilters={setFilters}
        filterOptions={filterOptions}
        user={user}
        filtersOpen={filtersOpen}
        subscription={filtersSubscription}
      />
      <AlertsSection filters={filters} subscription={alertsSubscription} />


      {isLoading && !aggregatedStats ? (
        <div className="flex items-center justify-center h-[60vh]">
          <LoadingDots />
        </div>
      ) : !aggregatedStats ? (
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-[#f8485e] text-xl">No data available for the selected filters</div>
        </div>
      ) : (
        <>
          <SystemStatistics
            aggregatedStats={aggregatedStats}
            businessMetrics={businessMetrics}
            subscription={statsSubscription}
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <SystemStatusChart aggregatedStats={aggregatedStats} subscription={statusChartSubscription} />
            <SystemTypesChart aggregatedStats={aggregatedStats} subscription={typesChartSubscription} />
            <CapacityDistributionChart aggregatedStats={aggregatedStats} subscription={capDistSubscription} />
          </div>
          <CapacityTrendsCharts
            usedUnit={usedUnit}
            setUsedUnit={setUsedUnit}
            snapUnit={snapUnit}
            setSnapUnit={setSnapUnit}
            prepareUsedTrendsChart={prepareUsedTrendsChart}
            prepareSnapshotTrendsChart={prepareSnapshotTrendsChart}
            subscription={capTrendSubscription}
          />
        </>
      )}
    </div>
  );
}
