// src/pages/Reports/index.tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Navigate } from 'react-router-dom';
import NoPermission from '../../pages/NoPermission';
import { FaFileAlt, FaHistory, FaCalendarAlt } from 'react-icons/fa';
import { useSubscriptionPermissions } from '../../hooks/useSubscriptionPermissions';
import { Lock } from 'lucide-react';
import { collection, getDocs, QueryDocumentSnapshot } from 'firebase/firestore';
import firestore from '../../firebaseClient';

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

// Funzione per aggregare le statistiche dai sistemi
const computeAggregatedStats = (systems: SystemData[]) => {
  if (systems.length === 0) return null;
  let totalAvail = 0,
    totalUsed = 0,
    totalSnap = 0,
    sumPercUsed = 0,
    sumPercSnap = 0,
    sumSpeed = 0,
    sumTime = 0,
    telemetryActive = 0;
  systems.forEach(s => {
    totalAvail += s.avail;
    totalUsed += s.used;
    totalSnap += s.used_snap;
    sumPercUsed += s.perc_used;
    sumPercSnap += s.perc_snap;
    sumSpeed += s.avg_speed;
    sumTime += s.avg_time;
    if (s.sending_telemetry) telemetryActive++;
  });
  const totalSystems = systems.length;
  return {
    totalSystems,
    totalAvail,
    totalUsed,
    totalSnap,
    avgPercUsed: sumPercUsed / totalSystems,
    avgPercSnap: sumPercSnap / totalSystems,
    avgSpeed: sumSpeed / totalSystems,
    avgTime: sumTime / totalSystems,
    telemetryActive
  };
};

const getEnhancedSystemHealthScore = (system: SystemData) => {
  const { perc_used, avg_time, used_snap, perc_snap, MUP, sending_telemetry } = system;
  const weightCapacity = 0.40;
  const weightPerformance = 0.20;
  const weightTelemetry = 0.15;
  const weightSnapshots = 0.10;
  const weightMUP = 0.15;

  const capacityScore = perc_used <= 55 ? 100 : Math.max(0, 100 - ((perc_used - 55) * (100 / 45)));
  const performanceScore = Math.max(0, 100 - 10 * Math.abs(avg_time - 5));
  const telemetryScore = sending_telemetry ? 100 : 0;
  const snapshotsScore = used_snap > 0 ? Math.max(0, Math.min(100, 100 - perc_snap)) : 0;
  const mupScore = MUP <= 55 ? 100 : Math.max(0, 100 - ((MUP - 55) * (100 / 45)));
  const finalScore = Math.round(
    weightCapacity * capacityScore +
    weightPerformance * performanceScore +
    weightTelemetry * telemetryScore +
    weightSnapshots * snapshotsScore +
    weightMUP * mupScore
  );

  return { finalScore, metrics: [] };
};

function GenerateReportSection() {
  const { user } = useAuth();
  const [systemsData, setSystemsData] = useState<SystemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHost, setSelectedHost] = useState('all');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const [notification, setNotification] = useState<string>('');
  const [scheduleFrequency, setScheduleFrequency] = useState('none');
  const [customInterval, setCustomInterval] = useState<number>(0);

  // Base URL dell'API backend
  const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';

  // Permessi per generazione report
  const { canAccess: reportCanAccess, shouldBlur: reportShouldBlur } =
    useSubscriptionPermissions('Reports', 'Generate Report');

  // Carica i dati dalla collection "system_data" su Firestore
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const systemsSnapshot = await getDocs(collection(firestore, 'system_data'));
        const systemsRaw = systemsSnapshot.docs.map((doc: QueryDocumentSnapshot) => doc.data());
        const systems: SystemData[] = systemsRaw.map((s: any) => ({
          ...s,
          used: Number(s.used),
          avail: Number(s.avail),
          used_snap: Number(s.used_snap),
          perc_used: Number(s.perc_used),
          perc_snap: Number(s.perc_snap),
          MUP: Number(s.MUP),
          avg_speed: Number(s.avg_speed),
          avg_time: Number(s.avg_time),
          sending_telemetry: String(s.sending_telemetry).toLowerCase() === 'true'
        }));
        setSystemsData(systems);
      } catch (error) {
        console.error('Error loading data from Firestore:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Filtra i sistemi in base all'utente
  const filteredSystems = React.useMemo(() => {
    if (!user) return systemsData;
    if (user.role === 'admin') return systemsData;
    if (user.role === 'admin_employee') {
      if (user.visibleCompanies && !user.visibleCompanies.includes('all')) {
        return systemsData.filter(s => user.visibleCompanies?.includes(s.company));
      } else {
        return systemsData;
      }
    }
    // Per customer ed employee il filtro avviene per company
    return systemsData.filter(s => s.company === user.company);
  }, [systemsData, user]);

  const uniqueHosts = React.useMemo(() => {
    const setHosts = new Set(filteredSystems.map(s => s.hostid));
    return Array.from(setHosts);
  }, [filteredSystems]);

  // Se il blocco deve apparire blur, mostriamo dei dummy host
  const dummyHosts = ['dummy-host-1', 'dummy-host-2', 'dummy-host-3'];
  const displayedHosts = reportShouldBlur ? dummyHosts : uniqueHosts;

  // Funzione per scaricare il report dopo la sua creazione
  const handleDownload = async (reportId: string, fileName: string) => {
    try {
      const resp = await fetch(`${API_BASE}/reports/download/${reportId}`);
      if (!resp.ok) {
        alert('Error downloading');
        return;
      }
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error', err);
      alert('Download error');
    }
  };

  const handleGenerateReport = async () => {
    setIsGeneratingReport(true);
    setNotification('');
    try {
      // Costruiamo il payload da inviare al backend per la creazione del report
      const payload: any = {
        userId: user!.id,
        username: user!.username,
        company: user!.company,
        host: selectedHost,
        sections: {
          systemStats: true,
          usageChart: true,
          capacityChart: true,
          detailedTable: true
        },
        format: 'pdf'
      };

      if (scheduleFrequency !== 'none') {
        payload.schedule = {
          frequency: scheduleFrequency,
          customInterval: scheduleFrequency === 'custom' ? customInterval : null
        };
      }

      if (sendEmail) {
        payload.sendEmail = true;
      }

      const response = await fetch(`${API_BASE}/reports/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error('Error creating report');
      }
      const data = await response.json();
      const reportId = data.reportId;

      if (!sendEmail) {
        // Scarica automaticamente il report se non è richiesto l'invio email
        handleDownload(
          reportId,
          selectedHost && selectedHost !== 'all'
            ? `${selectedHost}-report.pdf`
            : 'report.pdf'
        );
        setNotification('Report generated and downloaded');
      } else {
        setNotification(
          scheduleFrequency !== 'none'
            ? 'Report scheduled and sent via email'
            : 'Report sent via email'
        );
      }
    } catch (error) {
      console.error('Error generating report:', error);
      setNotification('Error generating report');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-xl text-[#22c1d4]">
        Loading data...
      </div>
    );
  }

  return (
    <>
      {(!reportCanAccess && !reportShouldBlur) ? (
        <NoPermission />
      ) : (
        <div className="max-w-6xl mx-auto p-6 bg-[#0b3c43] rounded-lg shadow-lg space-y-8">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FaFileAlt className="text-[#22c1d4]" />
            <span className="text-[#f8485e]">Generate Report</span>
          </h1>

          <div className="relative">
            <div className={`bg-[#06272b] rounded-lg p-4 ${reportShouldBlur ? 'blur-sm pointer-events-none' : ''}`}>
              <label className="block text-sm mb-2 text-[#eeeeee]/60">Select Host:</label>
              <select
                value={selectedHost}
                onChange={(e) => setSelectedHost(e.target.value)}
                className="w-full p-2 bg-[#06272b] text-[#eeeeee] rounded border border-[#22c1d4]/20"
              >
                <option value="all">All Hosts</option>
                {displayedHosts.map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>

              <div className="mt-4 flex items-center">
                <input
                  type="checkbox"
                  id="sendEmail"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className="mr-2"
                />
                <label htmlFor="sendEmail" className="text-sm text-[#eeeeee]">
                  Send report via email
                </label>
              </div>

              <div className="mt-4">
                <label className="block text-sm mb-2 text-[#eeeeee]/60">Schedule Report:</label>
                <select
                  value={scheduleFrequency}
                  onChange={(e) => setScheduleFrequency(e.target.value)}
                  className="w-full p-2 bg-[#06272b] text-[#eeeeee] rounded border border-[#22c1d4]/20"
                >
                  <option value="none">No scheduling</option>
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="custom">Custom</option>
                </select>
                {scheduleFrequency === 'custom' && (
                  <div className="mt-2">
                    <label className="block text-sm mb-1 text-[#eeeeee]">Interval (number):</label>
                    <input
                      type="number"
                      value={customInterval}
                      onChange={(e) => setCustomInterval(Number(e.target.value))}
                      className="w-full p-2 bg-[#06272b] text-[#eeeeee] rounded border border-[#22c1d4]/20"
                      placeholder="e.g., 12 for hours or 3 for days"
                    />
                    <small className="text-xs text-[#eeeeee]/60">
                      If ≤ 24, interpreted as hours; otherwise, as days.
                    </small>
                  </div>
                )}
              </div>

              <div className="flex items-center mt-6">
                <button
                  onClick={handleGenerateReport}
                  disabled={isGeneratingReport}
                  className="px-4 py-2 bg-[#22c1d4] text-[#06272b] font-bold rounded shadow hover:shadow-lg transition"
                >
                  {isGeneratingReport ? 'Generating PDF...' : 'Generate PDF'}
                </button>
                {notification && <span className="ml-4 text-sm text-[#22c1d4]">{notification}</span>}
              </div>
            </div>

            {reportShouldBlur && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-4 overflow-hidden">
                <Lock className="w-9 h-9 text-white mb-2" />
                <span className="text-white text-lg">
                  Upgrade your subscription to view report generation.
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function HistorySection() {
  const { user } = useAuth();
  const [reports, setReports] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancelNotification, setCancelNotification] = useState<string>('');
  const [reportSkip, setReportSkip] = useState(0);
  const [reportLimit] = useState(5);
  const [hasMoreReports, setHasMoreReports] = useState(true);
  const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';
  const { canAccess: historyCanAccess, shouldBlur: historyShouldBlur } =
    useSubscriptionPermissions('Reports', 'History Section');

  useEffect(() => {
    setReports([]);
    setReportSkip(0);
    setHasMoreReports(true);
    const loadReports = async (skip: number, limit: number) => {
      if (!user) return;
      setLoading(true);
      try {
        const resp = await fetch(
          `${API_BASE}/reports/list?userId=${user!.id}&company=${user!.company}&reportSkip=${skip}&reportLimit=${limit}`
        );
        if (!resp.ok) {
          console.error('Failed to fetch reports and schedules');
          setLoading(false);
          return;
        }
        const data = await resp.json();
        const newReports = data.reports || [];
        setReports(prev => [...prev, ...newReports]);
        if (newReports.length < limit) {
          setHasMoreReports(false);
        }
        setReportSkip(prev => prev + newReports.length);
        if (data.schedules) {
          setSchedules(data.schedules);
        }
      } catch (err) {
        console.error('Error fetching reports and schedules', err);
      } finally {
        setLoading(false);
      }
    };
    loadReports(0, reportLimit);
  }, [user, API_BASE, reportLimit]);

  const handleDownload = async (reportId: string, fileName: string) => {
    try {
      const resp = await fetch(`${API_BASE}/reports/download/${reportId}`);
      if (!resp.ok) {
        alert('Error downloading');
        return;
      }
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error', err);
      alert('Download error');
    }
  };

  const handleCancelSchedule = async (scheduleId: string) => {
    try {
      const resp = await fetch(`${API_BASE}/reports/schedule/${scheduleId}`, {
        method: 'DELETE'
      });
      if (!resp.ok) {
        alert('Error cancelling schedule');
        return;
      }
      setSchedules(prev => prev.filter((s: any) => s.id !== scheduleId));
      setCancelNotification('Schedule cancelled and cancellation email sent.');
    } catch (err) {
      console.error('Cancel schedule error', err);
      alert('Error cancelling schedule');
    }
  };

  const dummyReports = [
    {
      id: 'dummy-r1',
      createdAt: new Date().toString(),
      host: 'dummy-host-1',
      format: 'pdf',
      fileName: 'dummy_report_1.pdf',
      sections: { systemStats: true, usageChart: false },
    },
    {
      id: 'dummy-r2',
      createdAt: new Date().toString(),
      host: 'dummy-host-2',
      format: 'pdf',
      fileName: 'dummy_report_2.pdf',
      sections: { capacityChart: true, detailedTable: true },
    }
  ];

  const dummySchedules = [
    {
      id: 'dummy-sched-1',
      nextRunAt: new Date().toString(),
      host: 'dummy-host-1',
      frequency: 'daily',
      customInterval: null,
    },
    {
      id: 'dummy-sched-2',
      nextRunAt: new Date().toString(),
      host: 'dummy-host-2',
      frequency: 'custom',
      customInterval: 12,
    }
  ];

  const displayedReports = historyShouldBlur ? dummyReports : reports;
  const displayedSchedules = historyShouldBlur ? dummySchedules : schedules;

  return (
    <>
      {(!historyCanAccess && !historyShouldBlur) ? (
        <NoPermission />
      ) : (
        <div className="max-w-6xl mx-auto p-6 bg-[#0b3c43] rounded-lg shadow-lg space-y-8 relative">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <FaHistory className="text-[#22c1d4]" />
            <span className="text-[#f8485e]">Report & Schedule History</span>
          </h2>

          <div className={historyShouldBlur ? 'blur-sm pointer-events-none' : ''}>
            {loading && <p className="text-center text-[#22c1d4] text-xl">Loading...</p>}
            {!loading && displayedReports.length === 0 && displayedSchedules.length === 0 && (
              <p className="text-center text-[#eeeeee] text-lg">No reports or schedules found</p>
            )}

            {displayedReports.length > 0 && (
              <div className="overflow-x-auto">
                <h3 className="text-xl font-semibold text-[#eeeeee] mb-2 flex items-center gap-1">
                  <FaFileAlt /> Reports
                </h3>
                <table className="w-full table-auto border-separate border-spacing-0">
                  <thead className="bg-[#06272b]">
                    <tr>
                      <th className="p-2 border text-sm text-[#eeeeee]">
                        <FaCalendarAlt className="inline mr-1" /> Created
                      </th>
                      <th className="p-2 border text-sm text-[#eeeeee]">Host</th>
                      <th className="p-2 border text-sm text-[#eeeeee]">Format</th>
                      <th className="p-2 border text-sm text-[#eeeeee]">Sections</th>
                      <th className="p-2 border text-sm text-[#eeeeee]">Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedReports.map((r) => {
                      const dateStr = new Date(r.createdAt).toLocaleString();
                      const secArr = Object.entries(r.sections)
                        .filter(([_, v]) => v)
                        .map(([k]) => k)
                        .join(', ');
                      return (
                        <tr key={r.id} className="hover:bg-[#06272b] transition">
                          <td className="p-2 border text-sm text-[#eeeeee]">{dateStr}</td>
                          <td className="p-2 border text-sm text-[#eeeeee]">{r.host}</td>
                          <td className="p-2 border text-sm text-[#eeeeee]">{r.format}</td>
                          <td className="p-2 border text-sm text-[#eeeeee]">{secArr}</td>
                          <td className="p-2 border text-sm">
                            <button
                              onClick={() => handleDownload(r.id, r.fileName || 'report')}
                              disabled={historyShouldBlur}
                              className="px-3 py-1 rounded bg-[#22c1d4] text-[#06272b] text-sm hover:bg-[#22c1d4]/90 transition disabled:opacity-50"
                            >
                              Download
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!historyShouldBlur && hasMoreReports && (
                  <div className="mt-4 text-center">
                    <button
                      onClick={() => {
                        const newSkip = reportSkip;
                        (async () => {
                          setLoading(true);
                          try {
                            const resp = await fetch(
                              `${API_BASE}/reports/list?userId=${user!.id}&company=${user!.company}&reportSkip=${newSkip}&reportLimit=10`
                            );
                            if (!resp.ok) {
                              console.error('Failed to fetch reports and schedules');
                              return;
                            }
                            const data = await resp.json();
                            const newReports = data.reports || [];
                            setReports(prev => [...prev, ...newReports]);
                            if (newReports.length < 10) {
                              setHasMoreReports(false);
                            }
                            setReportSkip(prev => prev + newReports.length);
                            if (data.schedules) {
                              setSchedules(data.schedules);
                            }
                          } catch (err) {
                            console.error('Error fetching reports and schedules', err);
                          } finally {
                            setLoading(false);
                          }
                        })();
                      }}
                      className="px-4 py-2 bg-[#22c1d4] text-[#06272b] font-bold rounded shadow hover:shadow-lg transition"
                      disabled={loading}
                    >
                      {loading ? 'Loading...' : 'Load More Reports'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {displayedSchedules.length > 0 && (
              <div className="overflow-x-auto">
                <h3 className="text-xl font-semibold text-[#f8485e] mb-2 flex items-center gap-1">
                  <FaCalendarAlt /> Scheduled Reports
                </h3>
                {cancelNotification && (
                  <p className="text-center text-[#22c1d4] mb-2">{cancelNotification}</p>
                )}
                <table className="w-full table-auto border-separate border-spacing-0">
                  <thead className="bg-[#06272b]">
                    <tr>
                      <th className="p-2 border text-sm text-[#eeeeee]">Next Run</th>
                      <th className="p-2 border text-sm text-[#eeeeee]">Host</th>
                      <th className="p-2 border text-sm text-[#eeeeee]">Frequency</th>
                      <th className="p-2 border text-sm text-[#eeeeee]">Cancel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedSchedules.map((s: any) => {
                      const nextRun = new Date(s.nextRunAt).toLocaleString();
                      const freqText = s.frequency === 'custom'
                        ? `Every ${s.customInterval || 'N/A'} ${s.customInterval && s.customInterval <= 24 ? 'hours' : 'days'}`
                        : s.frequency;
                      return (
                        <tr key={s.id} className="hover:bg-[#06272b] transition">
                          <td className="p-2 border text-sm text-[#eeeeee]">{nextRun}</td>
                          <td className="p-2 border text-sm text-[#eeeeee]">{s.host}</td>
                          <td className="p-2 border text-sm text-[#eeeeee]">{freqText}</td>
                          <td className="p-2 border text-sm">
                            <button
                              onClick={() => handleCancelSchedule(s.id)}
                              disabled={historyShouldBlur}
                              className="px-3 py-1 rounded bg-red-500 text-[#06272b] text-sm hover:bg-red-400 transition disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {historyShouldBlur && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-4 overflow-hidden">
              <Lock className="w-9 h-9 text-white mb-2" />
              <span className="text-white text-lg">
                Upgrade subscription to see Report History
              </span>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default function Reports() {
  const { user, isAuthenticated, isInitializingSession } = useAuth();
  const [activeTab, setActiveTab] = useState<'generate' | 'history'>('generate');

  if (isInitializingSession) {
    return (
      <div style={{ color: '#eee', textAlign: 'center', padding: '2rem' }}>
        Loading session...
      </div>
    );
  }
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }
  // I controlli sui permessi sono gestiti all'interno dei componenti GenerateReportSection e HistorySection.
  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto mb-6">
        <div className="flex border-b border-[#06272b] mb-4">
          <button
            onClick={() => setActiveTab('generate')}
            className={`flex items-center px-4 py-2 text-lg font-medium transition-colors duration-200 ${
              activeTab === 'generate'
                ? 'border-b-2 border-[#f8485e] text-[#f8485e]'
                : 'text-[#eeeeee] hover:text-[#f8485e]'
            }`}
          >
            <FaFileAlt className="mr-2" /> Generate Report
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center px-4 py-2 text-lg font-medium transition-colors duration-200 ${
              activeTab === 'history'
                ? 'border-b-2 border-[#f8485e] text-[#f8485e]'
                : 'text-[#eeeeee] hover:text-[#f8485e]'
            }`}
          >
            <FaHistory className="mr-2" /> History & Schedules
          </button>
        </div>
        {activeTab === 'generate' ? <GenerateReportSection /> : <HistorySection />}
      </div>
    </div>
  );
}
