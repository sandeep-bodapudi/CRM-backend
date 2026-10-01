import React, { useState } from 'react';
import { PhoneCall, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';
import { toUserFacingError } from '../../utils/userFacingError';

const OUTCOMES: { value: string; label: string; tone: string }[] = [
  { value: 'CONNECTED_INTERESTED', label: 'Spoke — interested', tone: 'emerald' },
  { value: 'CALL_BACK', label: 'Asked to call back', tone: 'amber' },
  { value: 'CONNECTED_NOT_INTERESTED', label: 'Spoke — not interested', tone: 'slate' },
  { value: 'NO_ANSWER', label: 'No answer', tone: 'slate' },
  { value: 'BUSY_OR_SWITCHED_OFF', label: 'Busy / switched off', tone: 'slate' },
  { value: 'WRONG_NUMBER', label: 'Wrong number', tone: 'red' },
];

/** Tomorrow 11:00 local, formatted for <input type="datetime-local">. */
const defaultFollowUp = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(11, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * "How did the call go?" — shown when a telecaller comes back from the phone
 * dialer (or taps Log call). Records the call and its outcome, and turns
 * "call me back on…" into a dated follow-up task, so a telecaller's day is
 * finally visible in the CRM instead of only in a typed daily report.
 */
export const CallOutcomeModal: React.FC<{
  lead: { id: number; customer_name: string; phone?: string | null };
  onClose: () => void;
  onLogged: () => void;
}> = ({ lead, onClose, onLogged }) => {
  const { fetchWithAuth } = useAuth();
  const { showToast } = useToast();
  const [outcome, setOutcome] = useState('');
  const [notes, setNotes] = useState('');
  const [followUpAt, setFollowUpAt] = useState(defaultFollowUp());
  const [saving, setSaving] = useState(false);

  // A call-back always needs a time; for "interested" a follow-up is offered
  // but optional; for the rest there's nothing to schedule.
  const askFollowUp = outcome === 'CALL_BACK' || outcome === 'CONNECTED_INTERESTED';

  const save = async () => {
    if (!outcome) return;
    setSaving(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/leads/${lead.id}/calls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcome,
          notes: notes.trim() || undefined,
          follow_up_at: askFollowUp && followUpAt ? new Date(followUpAt).toISOString() : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({ ...toUserFacingError({ status: res.status, body: data }), type: 'error' });
        return;
      }
      showToast(data.task ? 'Call logged and call-back scheduled' : 'Call logged', 'success');
      onLogged();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const toneClass = (tone: string, selected: boolean) => {
    if (!selected) return 'border-slate-200 text-slate-700 bg-white';
    return {
      emerald: 'border-emerald-500 bg-emerald-50 text-emerald-800',
      amber: 'border-amber-500 bg-amber-50 text-amber-800',
      red: 'border-red-500 bg-red-50 text-red-800',
      slate: 'border-navy-500 bg-navy-50 text-navy-900',
    }[tone];
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              How did the call go?
            </p>
            <h3 className="font-black text-navy-900 text-lg flex items-center gap-2">
              <PhoneCall className="w-4 h-4 text-emerald-600" /> {lead.customer_name}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {OUTCOMES.map((o) => (
            <button
              key={o.value}
              onClick={() => setOutcome(o.value)}
              className={`px-3 py-3 rounded-2xl border-2 text-xs font-bold text-left transition-colors ${toneClass(o.tone, outcome === o.value)}`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {askFollowUp && (
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              {outcome === 'CALL_BACK' ? 'Call back on *' : 'Next follow-up (optional)'}
            </label>
            <input
              type="datetime-local"
              value={followUpAt}
              onChange={(e) => setFollowUpAt(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm"
            />
          </div>
        )}

        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
            What did they say? (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="e.g. Wants 2BHK near Kompally, budget 60L, will visit Sunday"
            className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
          />
        </div>

        <button
          onClick={save}
          disabled={!outcome || saving || (outcome === 'CALL_BACK' && !followUpAt)}
          className="w-full py-3 rounded-2xl bg-navy-900 text-white font-black text-sm disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save call'}
        </button>
      </div>
    </div>
  );
};
