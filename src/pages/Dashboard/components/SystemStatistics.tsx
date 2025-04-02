import React from 'react';
import { Database, TrendingUp, TrendingDown, Users, Activity, BarChart2 } from 'lucide-react';
import { AggregatedStats, BusinessMetric } from '../types';

interface SystemStatisticsProps {
  aggregatedStats: AggregatedStats;
  businessMetrics: () => BusinessMetric[];
  subscription: { canAccess: boolean; shouldBlur: boolean };
}

const SystemStatistics: React.FC<SystemStatisticsProps> = ({ aggregatedStats, businessMetrics, subscription }) => {
  const metrics = businessMetrics().map((metric, idx) => ({
    ...metric,
    // Se l'icona non è definita, usa una di default (es. Database)
    icon: metric.icon || Database
  }));

  return (
    <div className="relative mb-6">
      {subscription.shouldBlur && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center">
          <div className="w-6 h-6 text-white mb-2">
            <Database />
          </div>
          <span className="text-white text-lg">
            Upgrade subscription to see System Statistics
          </span>
        </div>
      )}
      <div className={`${subscription.shouldBlur ? 'blur-sm pointer-events-none' : ''}`}>
        <div className="bg-[#0b3c43] rounded-lg p-6 shadow-lg border border-[#22c1d4]/10 transition-all hover:border-[#22c1d4]/30">
          <h2 className="text-xl text-[#f8485e] font-semibold mb-6 flex items-center gap-2">
            <Database className="w-6 h-6 text-[#22c1d4]" />
            System Statistics
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {metrics.map((metric, idx) => (
              <div key={`${metric.title}-${idx}`} className="bg-[#06272b] rounded-lg p-4 shadow-md">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-[#eeeeee]/60">{metric.title}</h3>
                  <metric.icon className="w-5 h-5 text-[#22c1d4]" />
                </div>
                <div className="text-2xl font-bold text-[#22c1d4] mb-1">
                  {subscription.shouldBlur ? 'N/A' : metric.value}
                  {metric.unit && !subscription.shouldBlur && (
                    <span className="text-lg ml-1">{metric.unit}</span>
                  )}
                </div>
                {/* Visualizzazione della sub-statistica */}
                {metric.subValue && (
                  <div className="text-sm text-[#eeeeee]/70 mb-2">
                    {subscription.shouldBlur ? '' : `${metric.subValue} ${metric.unit || ''}`} <span className="text-xs">{metric.subDescription}</span>
                  </div>
                )}
                <div className="flex items-center gap-1 text-sm mt-2">
                  {metric.trend !== 0 && (
                    <>
                      {metric.trend >= 0 ? (
                        <TrendingUp className="w-3 h-3 text-[#22c1d4]" />
                      ) : (
                        <TrendingDown className="w-3 h-3 text-[#f8485e]" />
                      )}
                      <span className={metric.trend >= 0 ? 'text-[#22c1d4]' : 'text-[#f8485e]'}>
                        {subscription.shouldBlur ? '' : (metric.trend >= 0 ? '+' : '') + metric.trend + '%'}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemStatistics;
