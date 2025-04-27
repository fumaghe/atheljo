// src/pages/Reports/index.tsx
import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { FaEnvelope, FaHistory, FaCalendarAlt } from 'react-icons/fa';
import { Plus, X, Lock } from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import { useSubscriptionPermissions } from '../../hooks/useSubscriptionPermissions';
import NoPermission from '../../pages/NoPermission';

import firestore from '../../firebaseClient';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  Timestamp,
  query,
  where,
  orderBy,
} from 'firebase/firestore';

/* -------------------------------------------------------------------------- */
/*                        SEZIONE 1 – SCHEDULA UNA MAIL                       */
/* -------------------------------------------------------------------------- */

function ScheduleEmailSection() {
  const { user } = useAuth();
  const { canAccess, shouldBlur } = useSubscriptionPermissions('Emails', 'Schedule Email');

  /* ----------------------------- state form ------------------------------ */
  const [recipients, setRecipients] = useState<string[]>([]);
  const [newRecipient, setNewRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [firstRun, setFirstRun] = useState<string>(''); // datetime-local
  const [frequency, setFrequency] = useState<
    'once' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom'
  >('once');
  const [customInterval, setCustomInterval] = useState<number>(0);
  const [notification, setNotification] = useState('');

  const handleAddRecipient = () => {
    if (newRecipient.trim()) {
      setRecipients([...recipients, newRecipient.trim()]);
      setNewRecipient('');
    }
  };

  const handleSave = async () => {
    if (!user) return;
    if (recipients.length === 0 || !firstRun) {
      setNotification('Inserisci almeno un destinatario e la data/ora di invio.');
      return;
    }
    try {
      await addDoc(collection(firestore, 'ScheduleMail'), {
        createdBy: user.id,
        company: user.company,
        recipients,
        subject,
        body,
        frequency,
        customInterval: frequency === 'custom' ? customInterval : null,
        firstRunAt: Timestamp.fromDate(new Date(firstRun)),
        nextRunAt: Timestamp.fromDate(new Date(firstRun)),
        createdAt: Timestamp.now(),
      });
      // reset form
      setRecipients([]);
      setSubject('');
      setBody('');
      setFirstRun('');
      setFrequency('once');
      setCustomInterval(0);
      setNotification('Programmazione salvata con successo.');
    } catch (err) {
      console.error(err);
      setNotification('Errore nel salvataggio.');
    }
  };

  return (
    <>
      {!canAccess && !shouldBlur ? (
        <NoPermission />
      ) : (
        <div className="max-w-3xl mx-auto p-6 bg-[#0b3c43] rounded-lg shadow space-y-8">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FaEnvelope className="text-[#22c1d4]" />
            <span className="text-[#f8485e]">Schedule an Email</span>
          </h1>

          <div className={`relative ${shouldBlur ? 'blur-sm pointer-events-none' : ''}`}>
            {/* ------------------------ destinatari ------------------------ */}
            <div>
              <label className="block text-sm mb-1 text-[#eeeeee]">Destinatari</label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={newRecipient}
                  onChange={(e) => setNewRecipient(e.target.value)}
                  className="flex-1 p-2 bg-[#06272b] text-[#eee] rounded border border-[#22c1d4]/20"
                  placeholder="email@dominio"
                />
                <button onClick={handleAddRecipient} className="p-2 bg-[#22c1d4] rounded">
                  <Plus size={16} />
                </button>
              </div>
              {recipients.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {recipients.map((r, i) => (
                    <li key={i} className="flex items-center gap-2 text-[#eee] text-sm">
                      <span>{r}</span>
                      <button
                        onClick={() =>
                          setRecipients(recipients.filter((_, idx) => idx !== i))
                        }
                        className="text-red-400 hover:text-red-300"
                      >
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* ------------------------- subject/body ---------------------- */}
            <div>
              <label className="block text-sm mb-1 text-[#eee]">Oggetto</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full p-2 bg-[#06272b] text-[#eee] rounded border border-[#22c1d4]/20"
                placeholder="Oggetto email"
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-[#eee]">Messaggio</label>
              <textarea
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full p-2 bg-[#06272b] text-[#eee] rounded border border-[#22c1d4]/20"
                placeholder="Corpo della mail"
              />
            </div>

            {/* ---------------------- when & frequency --------------------- */}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-1 text-[#eee]">Invia il</label>
                <input
                  type="datetime-local"
                  value={firstRun}
                  onChange={(e) => setFirstRun(e.target.value)}
                  className="w-full p-2 bg-[#06272b] text-[#eee] rounded border border-[#22c1d4]/20"
                />
              </div>
              <div>
                <label className="block text-sm mb-1 text-[#eee]">Frequenza</label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as any)}
                  className="w-full p-2 bg-[#06272b] text-[#eee] rounded border border-[#22c1d4]/20"
                >
                  <option value="once">Una sola volta</option>
                  <option value="hourly">Ogni ora</option>
                  <option value="daily">Ogni giorno</option>
                  <option value="weekly">Ogni settimana</option>
                  <option value="monthly">Ogni mese</option>
                  <option value="custom">Custom (intervallo)</option>
                </select>
              </div>
            </div>

            {frequency === 'custom' && (
              <div className="mt-2">
                <label className="block text-sm mb-1 text-[#eee]">
                  Intervallo numerico (h ≤24 / d &gt;24)
                </label>
                <input
                  type="number"
                  value={customInterval}
                  onChange={(e) => setCustomInterval(Number(e.target.value))}
                  className="w-full p-2 bg-[#06272b] text-[#eee] rounded border border-[#22c1d4]/20"
                  placeholder="es. 12 = ore, 48 = giorni"
                />
              </div>
            )}

            {/* --------------------- CTA & notification -------------------- */}
            <button
              onClick={handleSave}
              className="mt-6 px-4 py-2 bg-[#22c1d4] text-[#06272b] font-bold rounded shadow hover:shadow-lg transition"
            >
              Salva Programmazione
            </button>
            {notification && (
              <p className="mt-2 text-sm text-[#22c1d4]">{notification}</p>
            )}
          </div>

          {shouldBlur && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-4">
              <Lock className="w-8 h-8 text-white mb-2" />
              <span className="text-white">
                Upgrade your subscription to schedule emails.
              </span>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                   SEZIONE 2 – LISTA / CANCELLA LE MAIL                     */
/* -------------------------------------------------------------------------- */

function ScheduledEmailsSection() {
  const { user } = useAuth();
  const { canAccess, shouldBlur } = useSubscriptionPermissions('Emails', 'History Section');

  const [mailSchedules, setMailSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState('');

  /* -------------------------- load from Firestore ------------------------- */
  useEffect(() => {
    if (!user) return;

    const fetchSchedules = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(firestore, 'ScheduleMail'),
          where('createdBy', '==', user.id),
          orderBy('nextRunAt', 'desc')
        );
        const snap = await getDocs(q);
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMailSchedules(list);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchSchedules();
  }, [user]);

  /* ------------------------------ cancel ---------------------------------- */
  const handleCancel = async (id: string) => {
    try {
      await deleteDoc(doc(firestore, 'ScheduleMail', id));
      setMailSchedules((prev) => prev.filter((m) => m.id !== id));
      setNotification('Programmazione cancellata.');
    } catch (err) {
      console.error(err);
      setNotification('Errore nella cancellazione.');
    }
  };

  /* ------------------------------ UI ------------------------------------- */
  return (
    <>
      {!canAccess && !shouldBlur ? (
        <NoPermission />
      ) : (
        <div className="max-w-5xl mx-auto p-6 bg-[#0b3c43] rounded-lg shadow relative">
          <h2 className="text-2xl font-bold flex items-center gap-2 mb-4">
            <FaHistory className="text-[#22c1d4]" />
            <span className="text-[#f8485e]">Scheduled Emails</span>
          </h2>

          <div className={shouldBlur ? 'blur-sm pointer-events-none' : ''}>
            {loading && <p className="text-center text-[#22c1d4]">Loading…</p>}
            {!loading && mailSchedules.length === 0 && (
              <p className="text-center text-[#eee]">Nessuna email programmata</p>
            )}

            {mailSchedules.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full table-auto border-separate border-spacing-0">
                  <thead className="bg-[#06272b]">
                    <tr>
                      <th className="p-2 border text-sm text-[#eee]">Next Run</th>
                      <th className="p-2 border text-sm text-[#eee]">Recipients</th>
                      <th className="p-2 border text-sm text-[#eee]">Subject</th>
                      <th className="p-2 border text-sm text-[#eee]">Frequency</th>
                      <th className="p-2 border text-sm text-[#eee]">Cancel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mailSchedules.map((m: any) => {
                      const next = new Date(
                        m.nextRunAt.seconds * 1000
                      ).toLocaleString();
                      const freq =
                        m.frequency === 'custom'
                          ? `Every ${m.customInterval}${
                              m.customInterval && m.customInterval <= 24 ? 'h' : 'd'
                            }`
                          : m.frequency;
                      return (
                        <tr key={m.id} className="hover:bg-[#06272b] transition">
                          <td className="p-2 border text-sm text-[#eee]">{next}</td>
                          <td className="p-2 border text-sm text-[#eee]">
                            {m.recipients.slice(0, 2).join(', ')}
                            {m.recipients.length > 2 &&
                              ` +${m.recipients.length - 2}`}
                          </td>
                          <td className="p-2 border text-sm text-[#eee]">
                            {m.subject || '(no subject)'}
                          </td>
                          <td className="p-2 border text-sm text-[#eee]">{freq}</td>
                          <td className="p-2 border text-sm">
                            <button
                              onClick={() => handleCancel(m.id)}
                              disabled={shouldBlur}
                              className="px-3 py-1 bg-red-500 text-[#06272b] rounded text-sm hover:bg-red-400 transition disabled:opacity-50"
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

            {notification && (
              <p className="mt-3 text-center text-sm text-[#22c1d4]">{notification}</p>
            )}
          </div>

          {shouldBlur && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-4">
              <Lock className="w-8 h-8 text-white mb-2" />
              <span className="text-white">
                Upgrade your subscription to view history.
              </span>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 ROOT PAGE                                  */
/* -------------------------------------------------------------------------- */

export default function Reports() {
  const { user, isAuthenticated, isInitializingSession } = useAuth();
  const [activeTab, setActiveTab] = useState<'schedule' | 'history'>('schedule');

  if (isInitializingSession) {
    return (
      <div style={{ color: '#eee', textAlign: 'center', padding: '2rem' }}>
        Loading session…
      </div>
    );
  }
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto mb-6">
        <div className="flex border-b border-[#06272b] mb-4">
          <button
            onClick={() => setActiveTab('schedule')}
            className={`flex items-center px-4 py-2 text-lg font-medium transition-colors ${
              activeTab === 'schedule'
                ? 'border-b-2 border-[#f8485e] text-[#f8485e]'
                : 'text-[#eee] hover:text-[#f8485e]'
            }`}
          >
            <FaEnvelope className="mr-2" /> Schedule Email
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center px-4 py-2 text-lg font-medium transition-colors ${
              activeTab === 'history'
                ? 'border-b-2 border-[#f8485e] text-[#f8485e]'
                : 'text-[#eee] hover:text-[#f8485e]'
            }`}
          >
            <FaHistory className="mr-2" /> Scheduled Emails
          </button>
        </div>

        {activeTab === 'schedule' ? <ScheduleEmailSection /> : <ScheduledEmailsSection />}
      </div>
    </div>
  );
}

