import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';
import { handleApiError, toUserFacingError } from '../../utils/userFacingError';

type TaskRef = { id: number; title: string };

/** Tomorrow 11:00 local, formatted for <input type="datetime-local">. */
const tomorrowMorning = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(11, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const OUTCOMES: { value: string; label: string; hint: string; tone: string }[] = [
  { value: 'COMPLETED', label: 'Completed', hint: 'The task is done.', tone: 'emerald' },
  {
    value: 'NEED_MORE_TIME',
    label: 'Need more time',
    hint: 'Still working on it; you set a new date.',
    tone: 'amber',
  },
  {
    value: 'BLOCKED',
    label: 'Blocked',
    hint: 'Something outside your control is stopping it.',
    tone: 'red',
  },
  {
    value: 'NOT_COMPLETED',
    label: 'Not completed',
    hint: 'It could not be done. Say why.',
    tone: 'slate',
  },
];

const toneClass = (tone: string, selected: boolean) => {
  if (!selected) return 'border-slate-200 text-slate-700 bg-white';
  return (
    {
      emerald: 'border-emerald-500 bg-emerald-50 text-emerald-800',
      amber: 'border-amber-500 bg-amber-50 text-amber-800',
      red: 'border-red-500 bg-red-50 text-red-800',
      slate: 'border-navy-500 bg-navy-50 text-navy-900',
    } as Record<string, string>
  )[tone];
};

const Shell: React.FC<{
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, subtitle, onClose, children }) => (
  <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
    <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {subtitle}
          </p>
          <h3 className="font-black text-navy-900 text-base break-words">{title}</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-slate-100"
          aria-label="Close"
        >
          <X className="w-5 h-5 text-slate-500" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

/** "How did it go?" -- finish a task with an outcome and a note. */
export const FinishTaskModal: React.FC<{
  task: TaskRef;
  onClose: () => void;
  onDone: (cheerUp: boolean) => void;
}> = ({ task, onClose, onDone }) => {
  const { fetchWithAuth } = useAuth();
  const { showError } = useToast();
  const [outcome, setOutcome] = useState('COMPLETED');
  const [feedback, setFeedback] = useState('');
  const [newDate, setNewDate] = useState(tomorrowMorning());
  const [saving, setSaving] = useState(false);

  const needsNote = outcome !== 'COMPLETED';
  const canSave =
    !saving &&
    (!needsNote || feedback.trim().length >= 3) &&
    (outcome !== 'NEED_MORE_TIME' || !!newDate);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/tasks/${task.id}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcome,
          feedback: feedback.trim() || undefined,
          reschedule_to: outcome === 'NEED_MORE_TIME' ? new Date(newDate).toISOString() : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return handleApiError(res, showError, data);
      onDone(!!data.cheerUp);
      onClose();
    } catch (e) {
      showError(
        toUserFacingError({ message: e instanceof Error ? e.message : String(e), body: e }),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell title={task.title} subtitle="How did it go?" onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        {OUTCOMES.map((o) => (
          <button
            key={o.value}
            onClick={() => setOutcome(o.value)}
            className={`px-3 py-3 rounded-2xl border-2 text-xs font-bold text-left transition-colors ${toneClass(o.tone, outcome === o.value)}`}
          >
            {o.label}
            <span className="block font-normal text-[10px] opacity-80 mt-0.5">{o.hint}</span>
          </button>
        ))}
      </div>

      {outcome === 'NEED_MORE_TIME' && (
        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
            New date *
          </label>
          <input
            type="datetime-local"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm"
          />
        </div>
      )}

      <div>
        <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
          {needsNote ? 'What happened? *' : 'Note (optional)'}
        </label>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={3}
          maxLength={1000}
          className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
        />
      </div>

      <button
        onClick={save}
        disabled={!canSave}
        className="w-full py-3 rounded-2xl bg-navy-900 text-white font-black text-sm disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </Shell>
  );
};

/** The assigner sends a "not completed" / "blocked" report back, with an optional note and new date. */
export const SendBackModal: React.FC<{
  task: TaskRef;
  onClose: () => void;
  onDone: () => void;
}> = ({ task, onClose, onDone }) => {
  const { fetchWithAuth } = useAuth();
  const { showError } = useToast();
  const [note, setNote] = useState('');
  const [newDate, setNewDate] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/tasks/${task.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REOPEN',
          note: note.trim() || undefined,
          new_date: newDate ? new Date(newDate).toISOString() : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return handleApiError(res, showError, data);
      onDone();
      onClose();
    } catch (e) {
      showError(
        toUserFacingError({ message: e instanceof Error ? e.message : String(e), body: e }),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell title={task.title} subtitle="Send this task back" onClose={onClose}>
      <p className="text-xs text-slate-600">
        The task becomes an open task again. If its date has passed it will count as overdue.
      </p>
      <div>
        <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
          Note (optional)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={500}
          className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
        />
      </div>
      <div>
        <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
          New date (optional)
        </label>
        <input
          type="datetime-local"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm"
        />
      </div>
      <button
        onClick={save}
        disabled={saving}
        className="w-full py-3 rounded-2xl bg-navy-900 text-white font-black text-sm disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Send back'}
      </button>
    </Shell>
  );
};
