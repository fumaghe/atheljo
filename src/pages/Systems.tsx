// src/pages/System.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Server, AlertTriangle, CheckCircle } from 'lucide-react';
import { collection, getDocs, QueryDocumentSnapshot } from 'firebase/firestore';
import firestore from '../firebaseClient';

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

export default function Systems() {
  const navigate = useNavigate();
  const [systems, setSystems] = useState<SystemData[]>([]);
  const [versionFilter, setVersionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadSystems = async () => {
      try {
        const querySnapshot = await getDocs(collection(firestore, 'system_data'));
        const data: SystemData[] = querySnapshot.docs.map(
          (doc: QueryDocumentSnapshot) => doc.data() as SystemData
        );
        console.log('Loaded systems data:', data);
        setSystems(data);
      } catch (error) {
        console.error('Error loading systems:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSystems();
  }, []);

  const filteredSystems = systems.filter(system => {
    if (versionFilter !== 'all' && !system.type.includes(versionFilter)) return false;
    if (statusFilter !== 'all') {
      const healthScore = system.MUP;
      if (statusFilter === 'OK' && healthScore < 80) return false;
      if (statusFilter === 'WARNING' && (healthScore >= 80 || healthScore < 60)) return false;
      if (statusFilter === 'CRITICAL' && healthScore >= 60) return false;
    }
    return true;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-[#22c1d4] text-xl">Loading systems...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Systems Overview</h1>
        <div className="flex gap-4">
          <select 
            className="bg-[#0b3c43] rounded px-4 py-2 border border-[#22c1d4]/20"
            value={versionFilter}
            onChange={(e) => setVersionFilter(e.target.value)}
          >
            <option value="all">All Versions</option>
            <option value="3">AiRE 3.x</option>
            <option value="4">AiRE 4.x</option>
          </select>
          <select 
            className="bg-[#0b3c43] rounded px-4 py-2 border border-[#22c1d4]/20"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="OK">OK</option>
            <option value="WARNING">Warning</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredSystems.map((system) => (
          <div key={system.hostid} className="bg-[#0b3c43] rounded-lg p-6 shadow-lg">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <Server className="w-6 h-6 text-[#22c1d4]" />
                <div>
                  <h3 className="text-lg font-semibold">{system.name}</h3>
                  <span className="text-sm text-[#eeeeee]/60">{system.type}</span>
                </div>
              </div>
              {system.MUP >= 80 ? (
                <CheckCircle className="w-6 h-6 text-green-500" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-[#f8485e]" />
              )}
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Capacity Usage</span>
                  <span className={system.perc_used > 80 ? 'text-[#f8485e]' : 'text-[#22c1d4]'}>
                    {system.perc_used}%
                  </span>
                </div>
                <div className="h-2 bg-[#06272b] rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${system.perc_used > 80 ? 'bg-[#f8485e]' : 'bg-[#22c1d4]'}`}
                    style={{ width: `${system.perc_used}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-sm text-[#eeeeee]/60">Snapshots</div>
                  <div className="font-semibold text-[#22c1d4]">{system.used_snap} GB</div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-[#eeeeee]/60">Used</div>
                  <div className="font-semibold text-[#22c1d4]">{system.used} GB</div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-[#eeeeee]/60">Available</div>
                  <div className="font-semibold text-[#22c1d4]">{system.avail} GB</div>
                </div>
              </div>

              <button 
                onClick={() => navigate(`/systems/${system.hostid}`)}
                className="w-full py-2 mt-4 bg-[#22c1d4] text-[#06272b] rounded-lg font-semibold hover:bg-[#22c1d4]/90 transition-colors"
              >
                View Details
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
