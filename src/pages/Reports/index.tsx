import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { FaEnvelope, FaHistory, FaCalendarAlt } from 'react-icons/fa';
import {
  Plus,
  X as CloseIcon,
  Lock,
  Edit2 as EditIcon,
  Trash2 as TrashIcon,
} from 'lucide-react';

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
  updateDoc,
} from 'firebase/firestore';

/* --------------------------- TIPI & COSTANTI -------------------------- */
type Frequency = 'once' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';

interface MailSchedule {
  id: string;
  company: string;
  createdBy: string;
  createdAt: Timestamp;

  recipients: string[];
  subject?: string;
  body?: string;

  frequency: Frequency;
  customInterval?: number | null;

  firstRunAt: Timestamp;
  nextRunAt: Timestamp;
}

const freqLabels: Record<Exclude<Frequency, 'custom'>, string> = {
  once: 'Una volta',
  hourly: 'Ogni ora',
  daily: 'Ogni giorno',
  weekly: 'Ogni settimana',
  monthly: 'Ogni mese',
};

/* ----------------------------- MAIN PAGE ------------------------------ */
export default function EmailReports() {
  const { user, isAuthenticated, isInitializingSession } = useAuth();

  if (isInitializingSession) {
    return (
      <div className="text-[#eee] p-8">
        Loading session…
      </div>
    );
  }
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;

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

/* ---------------------------------------------------------------------- */
/*               SEZIONE 1 · FORM DI SCHEDULAZIONE EMAIL                  */
/* ---------------------------------------------------------------------- */
function ScheduleEmailSection({ user }: { user: any }) {
  const { shouldBlur } = useSubscriptionPermissions('Emails', 'Schedule Email');

  const [recipients, setRecipients] = useState<string[]>([]);
  const [newRecipient, setNewRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [firstRun, setFirstRun] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('once');
  const [customInterval, setCustomInterval] = useState<number>(0);
  const [notification, setNotification] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const resetForm = () => {
    setRecipients([]);
    setNewRecipient('');
    setSubject('');
    setBody('');
    setFirstRun('');
    setFrequency('once');
    setCustomInterval(0);
    setEditingId(null);
  };

  const handleAddRecipient = () => {
    if (newRecipient.trim() && !recipients.includes(newRecipient.trim())) {
      setRecipients([...recipients, newRecipient.trim()]);
      setNewRecipient('');
    }
  };

  const handleSave = async () => {
    if (recipients.length === 0 || !firstRun) {
      setNotification('Inserisci almeno un destinatario e la data/ora di invio.');
      return;
    }
    try {
      const payload = {
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
      };

      if (editingId) {
        await updateDoc(doc(firestore, 'ScheduleMail', editingId), payload);
        setNotification('Programmazione aggiornata con successo.');
      } else {
        await addDoc(collection(firestore, 'ScheduleMail'), payload);
        setNotification('Programmazione salvata con successo.');
      }

      resetForm();
    } catch (err) {
      console.error(err);
      setNotification('Errore nel salvataggio.');
    }
  };

  const loadForEdit = (m: MailSchedule) => {
    setEditingId(m.id);
    setRecipients(m.recipients);
    setSubject(m.subject ?? '');
    setBody(m.body ?? '');
    setFirstRun(new Date(m.firstRunAt.seconds * 1000).toISOString().slice(0, 16));
    setFrequency(m.frequency);
    if (m.frequency === 'custom' && m.customInterval) {
      setCustomInterval(m.customInterval);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    (window as any).loadEmailForEdit = loadForEdit;
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[#f8485e] mb-4">Schedule Email</h2>

      <div className={shouldBlur ? 'blur-sm pointer-events-none space-y-4' : 'space-y-4'}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1 text-[#eee]">Destinatari</label>
            <div className="flex gap-2">
              <input
                type="email"
                value={newRecipient}
                onChange={(e) => setNewRecipient(e.target.value)}
                className="flex-1 p-2 bg-[#06272b] text-[#eee] rounded border border-[#22c1d4]/20"
                placeholder="email@dominio"
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
                      onClick={() =>
                        setRecipients(recipients.filter((_, idx) => idx !== i))
                      }
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
            <label className="block text-sm mb-1 text-[#eee]">Oggetto</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full p-2 bg-[#06272b] text-[#eee] rounded border border-[#22c1d4]/20"
              placeholder="Oggetto email"
            />
          </div>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1 text-[#eee]">Data e Ora</label>
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
              onChange={(e) => setFrequency(e.target.value as Frequency)}
              className="w-full p-2 bg-[#06272b] text-[#eee] rounded border border-[#22c1d4]/20"
            >
              <option value="once">Una sola volta</option>
              <option value="hourly">Ogni ora</option>
              <option value="daily">Ogni giorno</option>
              <option value="weekly">Ogni settimana</option>
              <option value="monthly">Ogni mese</option>
              <option value="custom">Custom</option>
            </select>
          </div>
        </div>

        {frequency === 'custom' && (
          <div>
            <label className="block text-sm mb-1 text-[#eee]">
              Intervallo
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

        <div className="flex justify-start">
          <button
            onClick={handleSave}
            className="mt-2 px-6 py-3 bg-[#22c1d4] text-[#061e22] font-bold rounded hover:bg-[#2df5fa] transition transform hover:scale-105"
          >
            {editingId ? '✏️ Aggiorna Email' : '📤 Programma Email'}
          </button>
        </div>

        {notification && (
          <p className="text-sm text-[#22c1d4]">{notification}</p>
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
  );
}

/* ---------------------------------------------------------------------- */
/*            SEZIONE 2 · LISTA DELLE EMAIL PROGRAMMATE                   */
/* ---------------------------------------------------------------------- */
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
        const all = snap.docs.map(
          (d) =>
            ({
              id: d.id,
              ...(d.data() as Omit<MailSchedule, 'id'>),
            } as MailSchedule)
        );

        const list = all
          .filter((m) => m.company === user.company)
          .sort(
            (a, b) => a.nextRunAt.seconds - b.nextRunAt.seconds
          );

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
      setNotification('Programmazione cancellata.');
    } catch (err) {
      console.error(err);
      setNotification('Errore nella cancellazione.');
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[#f8485e] mb-4">Scheduled Emails</h2>

      <div className={shouldBlur ? 'blur-sm pointer-events-none space-y-4' : 'space-y-4'}>
        {loading && <p className="text-[#22c1d4]">Loading…</p>}

        {!loading && mailSchedules.length === 0 && (
          <p className="text-[#eee]">Nessuna email programmata</p>
        )}

        {mailSchedules.map((m) => {
          const nextDate = new Date(m.nextRunAt.seconds * 1000);
          const nextStr = nextDate.toLocaleString('it-IT', {
            dateStyle: 'short',
            timeStyle: 'short',
          });

          const freqLabel =
            m.frequency === 'custom'
              ? `Ogni ${m.customInterval!}${
                  m.customInterval! <= 24 ? 'h' : 'd'
                }`
              : freqLabels[m.frequency];

          const isActive = nextDate > new Date();
          const statusColor = isActive
            ? 'bg-green-100 text-green-800'
            : 'bg-gray-100 text-gray-600';

          return (
            <div
              key={m.id}
              className="flex items-center justify-between bg-[#06272b] rounded-xl p-4 shadow transition-colors duration-200 hover:bg-[#0f4e56]"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusColor}`}
                >
                  {isActive ? 'Attiva' : 'Conclusa'}
                </span>

                <div>
                  <p className="font-semibold text-[#eee]">{m.subject || '(no subject)'}</p>
                  <p className="text-sm text-[#22c1d4]">{nextStr}</p>
                  <p className="text-xs text-[#eee] flex items-center gap-1 mt-1">
                    <FaCalendarAlt /> {freqLabel}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => (window as any).loadEmailForEdit(m)}
                  disabled={shouldBlur}
                  className="px-4 py-2 bg-[#22c1d4] text-[#061e22] font-bold rounded hover:bg-[#2df5fa] transition transform hover:scale-105 disabled:opacity-50"
                  title="Modifica"
                >
                  <EditIcon size={16} />
                </button>

                <button
                  onClick={() => handleCancel(m.id)}
                  disabled={shouldBlur}
                  className="px-4 py-2 bg-[#22c1d4] text-[#061e22] font-bold rounded hover:bg-[#2df5fa] transition transform hover:scale-105 disabled:opacity-50"
                  title="Elimina"
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
          <span className="text-white">
            Upgrade your subscription to view history.
          </span>
        </div>
      )}
    </div>
  );
}
