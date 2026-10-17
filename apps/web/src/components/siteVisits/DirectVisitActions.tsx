import React, { useState } from 'react';
import { CalendarClock, CheckCircle2, Footprints, UserX } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';
import { Roles } from '../../shared';
import { RATINGS } from './WalkInVisitModal';

/** Visit states that can still become a direct visit (mirrors CONVERTIBLE_STATES in the API). */
export const CONVERTIBLE_STATES = [
  'REQUESTED',
  'PENDING_ACCEPTANCE',
  'REASSIGNED',
  'ESCALATED_TO_MARKETING_DIRECTOR',
  'ACCEPTED',
  'PENDING_CUSTOMER_RECONFIRMATION',
  'RESCHEDULE_REQUESTED',
  'PENDING_PM_RECONFIRMATION',
  'CONFIRMED',
  'ON_HOLD',
];
const DIRECT_OPEN_STATES = ['CONFIRMED', 'PENDING_CUSTOMER_RECONFIRMATION', 'ON_HOLD'];

interface VisitLike {
  id: number;
  booking_code: string;
  status: string;
  visit_type?: string;
  scheduled_date: string;
  telecaller?: { id: number } | null;
  lead?: { assigned_to_id?: number | null } | null;
}

const istDay = (d: string | Date) =>
  new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/** May this user change the visit? The booker, the lead owner or management (same rule as the API). */
export const useCanChangeVisit = () => {
  const { user } = useAuth();
  const roles: string[] = user?.roles || [];
  const mgmt = [Roles.MD, Roles.ADMIN, Roles.MARKETING_DIRECTOR].some((r) => roles.includes(r));
  return (v: VisitLike) =>
    mgmt || v.telecaller?.id === user?.id || v.lead?.assigned_to_id === user?.id;
};

/**
 * Buttons for a direct visit (the customer goes on their own; nobody assigned):
 * the customer came / did not come / change the date. For any other visit that
 * has not started yet: turn it into a direct visit.
 */
export const DirectVisitActions: React.FC<{ visit: VisitLike; onDone: () => void }> = ({
  visit,
  onDone,
}) => {
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();
  const canChange = useCanChangeVisit()(visit);
  const [mode, setMode] = useState<'CAME' | 'NOT_CAME' | 'DATE' | null>(null);
  const [rating, setRating] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);

  if (!canChange) return null;
  const isDirect = visit.visit_type === 'DIRECT';

  const post = async (path: string, body?: unknown) => {
    setBusy(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/site-visits/${visit.id}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(d.error || d.message || d.details?.[0]?.message || 'Could not save.');
        return;
      }
      showToast(d.note || d.message || 'Saved', d.note ? 'info' : 'success');
      setMode(null);
      onDone();
    } catch {
      showError('No connection. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!isDirect) {
    if (!CONVERTIBLE_STATES.includes(visit.status) || visit.visit_type === 'WALK_IN') return null;
    return (
      <button
        onClick={() => {
          if (
            window.confirm(
              `Make ${visit.booking_code} a direct visit? The customer goes to the site on their own and no project manager is needed. Anyone assigned is told it is no longer needed.`,
            )
          )
            post('make-direct');
        }}
        disabled={busy}
        className="w-full py-2 bg-white border border-teal-600 text-teal-700 hover:bg-teal-50 font-extrabold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
      >
        <Footprints className="w-3.5 h-3.5" />
        <span>Make it a direct visit (no PM)</span>
      </button>
    );
  }

  if (!DIRECT_OPEN_STATES.includes(visit.status)) return null;
  const dayCome = istDay(visit.scheduled_date) <= istDay(new Date());
  const btn =
    'flex-1 py-2 font-extrabold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-50';
  const input = 'w-full px-3 py-2 border border-slate-300 rounded-xl text-xs';

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-teal-800 bg-teal-50 border border-teal-200 rounded-xl px-2.5 py-1.5">
        Direct visit: the customer goes on their own. After the visit day, record whether they came.
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => setMode(mode === 'CAME' ? null : 'CAME')}
          disabled={!dayCome}
          title={dayCome ? '' : 'Available from the visit day'}
          className={`${btn} bg-emerald-700 hover:bg-emerald-800 text-white`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" /> Customer came
        </button>
        <button
          onClick={() => setMode(mode === 'NOT_CAME' ? null : 'NOT_CAME')}
          className={`${btn} bg-white border border-rose-600 text-rose-600 hover:bg-rose-50`}
        >
          <UserX className="w-3.5 h-3.5" /> Did not come
        </button>
        <button
          onClick={() => setMode(mode === 'DATE' ? null : 'DATE')}
          className={`${btn} bg-amber-600 hover:bg-amber-700 text-white`}
        >
          <CalendarClock className="w-3.5 h-3.5" /> Date
        </button>
      </div>

      {mode === 'CAME' && (
        <div className="space-y-2 rounded-xl border border-slate-200 p-2.5">
          <div className="grid grid-cols-2 gap-1.5">
            {RATINGS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRating(r.value)}
                className={`py-1.5 rounded-lg text-[11px] font-bold border ${rating === r.value ? 'bg-navy-900 text-white border-navy-900' : 'bg-white text-slate-700 border-slate-300'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1000}
            placeholder="What did the customer say?"
            className={`${input} min-h-[60px]`}
          />
          <button
            onClick={() => post('direct-outcome', { visited: true, rating, feedback_notes: notes })}
            disabled={busy || !rating || notes.trim().length < 3}
            className={`${btn} w-full bg-navy-900 text-white`}
          >
            Save visit
          </button>
        </div>
      )}

      {mode === 'NOT_CAME' && (
        <div className="space-y-2 rounded-xl border border-slate-200 p-2.5">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={300}
            placeholder="Why? (optional)"
            className={input}
          />
          <button
            onClick={() => post('direct-outcome', { visited: false, feedback_notes: notes })}
            disabled={busy}
            className={`${btn} w-full bg-rose-600 text-white`}
          >
            Mark as not visited
          </button>
        </div>
      )}

      {mode === 'DATE' && (
        <div className="space-y-2 rounded-xl border border-slate-200 p-2.5">
          <input
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={input}
          />
          <button
            onClick={() =>
              post('direct-reschedule', { scheduled_date: new Date(date).toISOString() })
            }
            disabled={busy || !date}
            className={`${btn} w-full bg-amber-600 text-white`}
          >
            Change date
          </button>
        </div>
      )}
    </div>
  );
};
