// src/pages/Reports/index.tsx
import React, { useState, useEffect, Fragment } from 'react';
import Select from 'react-select'; 
import { Navigate } from 'react-router-dom';
import { FaEnvelope, FaCalendarAlt } from 'react-icons/fa';
import {
  Plus,
  X as CloseIcon,
  Lock,
  Edit2 as EditIcon,
  Trash2 as TrashIcon,
  Send as SendIcon,
} from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import { useSubscriptionPermissions } from '../../hooks/useSubscriptionPermissions';

import firestore from '../../firebaseClient';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { generateSystemSummary } from '../../utils/generateSystemSummary';

/* ------------------------------------------------------------------ */
/*                           HELPERS                                  */
/* ------------------------------------------------------------------ */
type Role = 'admin' | 'admin_employee' | 'customer';

const getAccessibleCompanies = (user: any): string[] => {
  if (!user) return [];
  const role: Role = user.role;
  if (role === 'admin') return ['*'];
  if (role === 'admin_employee') return user.visibleCompanies ?? [];
  if (role === 'customer') return [user.company];
  return [];
};

const scheduleBelongsToUser = (m: MailSchedule, user: any) => {
  const role: Role = user.role;
  const comps = m.companies ?? [m.company]; // fallback per doc legacy
  if (role === 'admin') return true;
  if (role === 'admin_employee') {
    const vis = user.visibleCompanies ?? [];
    return comps.some((c) => vis.includes(c));
  }
  return comps.includes(user.company);
};

/* --------------------------- TYPES & CONSTANTS ---------------------- */
type Frequency = 'once' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';

interface MailSchedule {
  id: string;
  companies: string[];        // ALWAYS present grazie al mapping
  includeSlashPools: boolean;
  company: string;            // legacy
  createdBy: string;
  createdAt: Timestamp;

  recipients: string[];
  subject?: string;
  body?: string;
  runAlgorithm?: boolean;

  frequency: Frequency;
  customInterval?: number | null;

  firstRunAt: Timestamp;
  nextRunAt: Timestamp;
}

const freqLabels: Record<Exclude<Frequency, 'custom'>, string> = {
  once: 'Once',
  hourly: 'Every hour',
  daily: 'Every day',
  weekly: 'Every week',
  monthly: 'Every month',
};

/* ----------------------------- MAIN PAGE --------------------------- */
export default function EmailReports() {
  const { user, isAuthenticated, isInitializingSession } = useAuth();

  if (isInitializingSession) {
    return <div className="text-[#eee] p-8">Loading session…</div>;
  }
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-[#06272b] py-6">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <h1 className="flex items-center text-3xl font-bold text-[#f8485e] mb-6">
          <FaEnvelope className="text-[#22c1d4] mr-2" />
          Email Scheduler
        </h1>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-[#0b3c43] rounded-2xl shadow-xl p-6">
            <ScheduleEmailSection user={user} />
          </div>
          <div className="bg-[#0b3c43] rounded-2xl shadow-xl p-6">
            <ScheduledEmailsSection user={user} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- */
/*               SECTION 1 · EMAIL SCHEDULING FORM                     */
/* ------------------------------------------------------------------- */
function ScheduleEmailSection({ user }: { user: any }) {
  const { shouldBlur } = useSubscriptionPermissions('Emails', 'Schedule Email');

  /* company & pool state */
  const accessible = getAccessibleCompanies(user);
  const [selCompanies, setSelCompanies] = useState<string[]>(
    accessible[0] === '*' ? [] : accessible
  );
  const [includeSlashPools, setIncludeSlashPools] = useState(false);

    // ✏️ nuovo stato per options di react-select
  const [companyOptions, setCompanyOptions] = useState<{ label: string; value: string }[]>([]);

  // ✏️ carica le distinct companies da system_data per admin
  useEffect(() => {
    if (user.role !== 'admin') return;
    (async () => {
      const snap = await getDocs(collection(firestore, 'system_data'));
      // estrai tutti i valori s.company
      const all = snap.docs
        .map(d => (d.data() as any).company)
        .filter((c): c is string => typeof c === 'string');
      const unique = Array.from(new Set(all)).sort();
      setCompanyOptions([
        { label: 'All Companies', value: '*' },
        ...unique.map(c => ({ label: c, value: c })),
      ]);
    })();
  }, [user.role]);

  const showCompanySelector =
    accessible[0] === '*' || accessible.length > 1;

  /* email & schedule state */
  const [recipients, setRecipients] = useState<string[]>([]);
  const [newRecipient, setNewRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [firstRun, setFirstRun] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('once');
  const [customInterval, setCustomInterval] = useState(0);
  const [runAlgorithm, setRunAlgorithm] = useState(false);
  const [notification, setNotification] = useState('');
  const [generating, setGenerating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const resetForm = () => {
    setRecipients([]);
    setNewRecipient('');
    setSubject('');
    setBody('');
    setFirstRun('');
    setFrequency('once');
    setCustomInterval(0);
    setRunAlgorithm(false);
    if (accessible[0] !== '*') setSelCompanies(accessible);
    setIncludeSlashPools(false);
    setEditingId(null);
  };

  /* ---------------------- handlers ---------------------- */
  const handleAddRecipient = () => {
    if (newRecipient.trim() && !recipients.includes(newRecipient.trim())) {
      setRecipients([...recipients, newRecipient.trim()]);
      setNewRecipient('');
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const summary = await (generateSystemSummary as any)({
        windowDays: 21,
        companies:
          selCompanies.length > 0
            ? selCompanies
            : accessible[0] === '*'
            ? ['*']
            : accessible,
        includeSlashPools,
      });
      setBody(summary);
    } catch (err) {
      console.error(err);
      setNotification('Errore nella generazione del riepilogo.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (recipients.length === 0 || !firstRun) {
      setNotification('Please enter at least one recipient and a date/time.');
      return;
    }
    try {
      const companiesToSave =
        selCompanies.length > 0
          ? selCompanies
          : accessible[0] === '*'
          ? ['*']
          : accessible;

      const payload: Omit<MailSchedule, 'id'> = {
        createdBy: user.id,
        company: user.company, // legacy
        companies: companiesToSave,
        includeSlashPools,
        recipients,
        subject,
        body,
        runAlgorithm,
        frequency,
        customInterval: frequency === 'custom' ? customInterval : null,
        firstRunAt: Timestamp.fromDate(new Date(firstRun)),
        nextRunAt: Timestamp.fromDate(new Date(firstRun)),
        createdAt: Timestamp.now(),
      };

      if (editingId) {
        await updateDoc(doc(firestore, 'ScheduleMail', editingId), payload);
        setNotification('Schedule updated successfully.');
      } else {
        await addDoc(collection(firestore, 'ScheduleMail'), payload);
        setNotification('Schedule saved successfully.');
      }

      resetForm();
    } catch (err) {
      console.error(err);
      setNotification('Error saving schedule.');
    }
  };

  const loadForEdit = (m: MailSchedule) => {
    setEditingId(m.id);
    setRecipients(m.recipients);
    setSubject(m.subject ?? '');
    setBody(m.body ?? '');
    setRunAlgorithm(m.runAlgorithm ?? false);
    setFirstRun(new Date(m.firstRunAt.seconds * 1000).toISOString().slice(0, 16));
    setFrequency(m.frequency);
    if (m.frequency === 'custom' && m.customInterval) {
      setCustomInterval(m.customInterval);
    }
    setSelCompanies(m.companies);
    setIncludeSlashPools(m.includeSlashPools ?? false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    (window as any).loadEmailForEdit = loadForEdit;
  }, []);

  /* ----------------------------- UI ------------------------------ */
  return (
    <div className="space-y-6 relative">
      <h2 className="text-2xl font-bold text-[#f8485e] mb-4">Schedule Email</h2>

      <div className={shouldBlur ? 'blur-sm pointer-events-none space-y-4' : 'space-y-4'}>
        {/* Companies selector & pool toggle */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1 text-[#eee]">Companies</label>

            {user.role === 'customer' ? (
              // solo testo se customer
              <p className="text-[#22c1d4]">{accessible[0]}</p>
            ) : (
              // altrimenti Select multi
              <Select
                isMulti
                options={
                  user.role === 'admin'
                    ? companyOptions
                    : accessible.map(c => ({ label: c, value: c }))
                }
                value={
                  // mappa selCompanies a oggetti label/value
                  (user.role === 'admin'
                    ? companyOptions
                    : accessible.map(c => ({ label: c, value: c }))
                  ).filter(opt => selCompanies.includes(opt.value))
                }
                onChange={vals => {
                  setSelCompanies(vals.map(v => v.value));
                }}
                placeholder="Select companies..."
                className="text-[#eee] bg-[#06272b]"
                styles={{
                  control: (base) => ({
                    ...base,
                    backgroundColor: '#06272b',
                    borderColor: '#22c1d4',
                  }),
                  multiValue: (base) => ({
                    ...base,
                    backgroundColor: '#22c1d4',
                    color: '#061e22',
                  }),
                  option: (base) => ({
                    ...base,
                    backgroundColor: '#0b3c43',
                    color: '#eee',
                  }),
                }}
              />
            )}
          </div>

          <div className="flex items-end">
            <label className="flex gap-2 items-center text-sm text-[#eee]">
              <input
                type="checkbox"
                checked={includeSlashPools}
                onChange={() => setIncludeSlashPools(prev => !prev)}
                className="form-checkbox h-5 w-5 text-[#22c1d4] bg-[#06272b] rounded"
              />
              <span>Include pools with “/”</span>
            </label>
          </div>
        </div>
        
        {/* Recipients & Subject */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1 text-[#eee]">Recipients</label>
            <div className="flex gap-2">
              <input
                type="email"
                value={newRecipient}
                onChange={(e) => setNewRecipient(e.target.value)}
                className="flex-1 p-2 bg-[#06272b] text-[#eee] rounded border border-[#22c1d4]/20"
                placeholder="email@domain.com"
              />
              <button
                onClick={handleAddRecipient}
                className="px-4 py-2 bg-[#22c1d4] text-[#061e22] font-bold rounded hover:bg-[#2df5fa] transition transform hover:scale-105"
              >
                <Plus size={16} />
              </button>
            </div>
            {recipients.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-[#eee]">
                {recipients.map((r, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <span>{r}</span>
                    <button
                      onClick={() => setRecipients(recipients.filter((_, idx) => idx !== i))}
                      className="text-red-400 hover:text-red-300"
                    >
                      <CloseIcon size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <label className="block text-sm mb-1 text-[#eee]">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full p-2 bg-[#06272b] text-[#eee] rounded border border-[#22c1d4]/20"
              placeholder="Email subject"
            />
          </div>
        </div>

        {/* Body with Generate & Toggle */}
        <div>
          <label className="block text-sm mb-1 text-[#eee]">Message</label>
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-4 py-2 bg-[#f0ad4e] text-[#061e22] font-bold rounded hover:bg-[#ffc107] transition"
            >
              {generating ? 'Genero…' : 'Genera Riepilogo'}
            </button>
            <label className="flex items-center text-sm text-[#eee] gap-2">
              <input
                type="checkbox"
                checked={runAlgorithm}
                onChange={() => setRunAlgorithm(!runAlgorithm)}
                className="form-checkbox h-5 w-5 text-[#22c1d4] bg-[#06272b] rounded"
              />
              <span>Run Algorithm on Schedule</span>
            </label>
          </div>
          <textarea
            rows={12}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full p-2 bg-[#06272b] text-[#eee] rounded border border-[#22c1d4]/20"
            placeholder="Email body"
          />
        </div>

        {/* Date & Frequency */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1 text-[#eee]">Date & Time</label>
            <input
              type="datetime-local"
              value={firstRun}
              onChange={(e) => setFirstRun(e.target.value)}
              className="w-full p-2 bg-[#06272b] text-[#eee] rounded border border-[#22c1d4]/20"
            />
          </div>
          <div>
            <label className="block text-sm mb-1 text-[#eee]">Frequency</label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Frequency)}
              className="w-full p-2 bg-[#06272b] text-[#eee] rounded border border-[#22c1d4]/20"
            >
              <option value="once">Once</option>
              <option value="hourly">Every hour</option>
              <option value="daily">Every day</option>
              <option value="weekly">Every week</option>
              <option value="monthly">Every month</option>
              <option value="custom">Custom</option>
            </select>
          </div>
        </div>

        {frequency === 'custom' && (
          <div>
            <label className="block text-sm mb-1 text-[#eee]">Interval</label>
            <input
              type="number"
              value={customInterval}
              onChange={(e) => setCustomInterval(Number(e.target.value))}
              className="w-full p-2 bg-[#06272b] text-[#eee] rounded border border-[#22c1d4]/20"
              placeholder="e.g. 12 = hours, 48 = days"
            />
          </div>
        )}

        {/* Save Buttons */}
        <div className="flex space-x-4">
          <button
            onClick={handleSave}
            className="flex items-center mt-2 px-6 py-3 bg-[#22c1d4] text-[#061e22] font-bold rounded hover:bg-[#2df5fa] transition transform hover:scale-105"
          >
            {editingId ? (
              <>
                <EditIcon size={16} className="mr-2" />
                Update Email
              </>
            ) : (
              <>
                <SendIcon size={16} className="mr-2" />
                Schedule Email
              </>
            )}
          </button>
          {editingId && (
            <button
              onClick={resetForm}
              className="flex items-center mt-2 px-6 py-3 bg-[#f8485e] text-white font-bold rounded hover:bg-red-500 transition transform hover:scale-105"
            >
              <CloseIcon size={16} className="mr-2" />
              Exit Edit Mode
            </button>
          )}
        </div>

        {notification && <p className="text-sm text-[#22c1d4]">{notification}</p>}
      </div>

      {shouldBlur && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-4">
          <Lock className="w-8 h-8 text-white mb-2" />
          <span className="text-white">Upgrade your subscription to schedule emails.</span>
        </div>
      )}
    </div>
  );
}

/* componente per popolare tutte le company (solo per admin) */
function CompaniesOptions() {
  const [opts, setOpts] = useState<string[]>([]);
  useEffect(() => {
    let mounted = true;
    (async () => {
      const snap = await getDocs(collection(firestore, 'companies'));
      const all = snap.docs.map((d) => d.id).sort();
      if (mounted) setOpts(all);
    })();
    return () => {
      mounted = false;
    };
  }, []);
  return (
    <Fragment>
      {opts.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </Fragment>
  );
}

/* ------------------------------------------------------------------- */
/*            SECTION 2 · LIST OF SCHEDULED EMAILS                     */
/* ------------------------------------------------------------------- */
function ScheduledEmailsSection({ user }: { user: any }) {
  const { shouldBlur } = useSubscriptionPermissions('Emails', 'History Section');

  const [mailSchedules, setMailSchedules] = useState<MailSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState('');

  useEffect(() => {
    if (!user) return;

    const fetchSchedules = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(firestore, 'ScheduleMail'));
        const all = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            ...data,
            companies: data.companies ?? [data.company],           // fallback
            includeSlashPools: data.includeSlashPools ?? false,   // fallback
          } as MailSchedule;
        });

        const list = all
          .filter((m) => scheduleBelongsToUser(m, user))
          .sort((a, b) => a.nextRunAt.seconds - b.nextRunAt.seconds);

        setMailSchedules(list);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchSchedules();
  }, [user]);

  const handleCancel = async (id: string) => {
    try {
      await deleteDoc(doc(firestore, 'ScheduleMail', id));
      setMailSchedules((prev) => prev.filter((m) => m.id !== id));
      setNotification('Schedule cancelled.');
    } catch (err) {
      console.error(err);
      setNotification('Error cancelling schedule.');
    }
  };

  /* --------------------------- UI ------------------------- */
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[#f8485e] mb-4">Scheduled Emails</h2>

      <div className={shouldBlur ? 'blur-sm pointer-events-none space-y-4' : 'space-y-4'}>
        {loading && <p className="text-[#22c1d4]">Loading…</p>}

        {!loading && mailSchedules.length === 0 && <p className="text-[#eee]">No scheduled emails</p>}

        {mailSchedules.map((m) => {
          const nextDate = new Date(m.nextRunAt.seconds * 1000);
          const nextStr = nextDate.toLocaleString('en-US', {
            dateStyle: 'short',
            timeStyle: 'short',
          });

          const freqLabel =
            m.frequency === 'custom'
              ? `Every ${m.customInterval!}${m.customInterval! <= 24 ? 'h' : 'd'}`
              : freqLabels[m.frequency];

          const isActive = nextDate > new Date();
          const statusColor = isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600';

          return (
            <div
              key={m.id}
              className="flex items-center justify-between bg-[#06272b] rounded-xl p-4 shadow transition-colors duration-200 hover:bg-[#0f4e56]"
            >
              <div className="flex items-center gap-3">
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusColor}`}>
                  {isActive ? 'Active' : 'Completed'}
                </span>

                <div>
                  <p className="font-semibold text-[#eee]">{m.subject || '(no subject)'}</p>
                  <p className="text-sm text-[#22c1d4]">{nextStr}</p>
                  <p className="text-xs text-[#eee] flex items-center gap-1 mt-1">
                    <FaCalendarAlt /> {freqLabel}
                  </p>
                  <p className="text-xs text-[#22c1d4] mt-1">
                    {m.companies[0] === '*' ? 'All companies' : m.companies.join(', ')}
                    {m.includeSlashPools ? ' · pool “/” included' : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => (window as any).loadEmailForEdit(m)}
                  disabled={shouldBlur}
                  className="px-4 py-2 bg-[#22c1d4] text-[#061e22] font-bold rounded hover:bg-[#2df5fa] transition transform hover:scale-105 disabled:opacity-50"
                  title="Edit"
                >
                  <EditIcon size={16} />
                </button>

                <button
                  onClick={() => handleCancel(m.id)}
                  disabled={shouldBlur}
                  className="px-4 py-2 bg-[#22c1d4] text-[#061e22] font-bold rounded hover:bg-[#2df5fa] transition transform hover:scale-105 disabled:opacity-50"
                  title="Delete"
                >
                  <TrashIcon size={16} />
                </button>
              </div>
            </div>
          );
        })}

        {notification && <p className="text-sm text-[#22c1d4] mt-2">{notification}</p>}
      </div>

      {shouldBlur && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-4">
          <Lock className="w-8 h-8 text-white mb-2" />
          <span className="text-white">Upgrade your subscription to view history.</span>
        </div>
      )}
    </div>
  );
}
