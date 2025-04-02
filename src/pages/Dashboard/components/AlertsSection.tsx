import React from 'react';
import { Lock } from 'lucide-react';
import Alerts from '../Alerts'; // Ensure the path is correct
import { FilterSelections } from '../types';

interface AlertsSectionProps {
  filters: FilterSelections;
  subscription: { canAccess: boolean; shouldBlur: boolean };
}

const AlertsSection: React.FC<AlertsSectionProps> = ({ filters, subscription }) => {
  return (
    <div className="relative mb-6">
      {subscription.shouldBlur && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-blur-sm">
          <Lock className="w-6 h-6 text-white mb-2" />
          <span className="text-white text-lg">
            Upgrade your subscription to see Alerts Card.
          </span>
        </div>
      )}
      <div className={`rounded-lg ${subscription.shouldBlur ? 'blur-sm pointer-events-none' : ''}`}>
        <Alerts filters={filters} />
      </div>
    </div>
  );
};

export default AlertsSection;
