import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';
import { handleApiError, toUserFacingError } from '../../utils/userFacingError';

interface LeadHit {
  id: number;
  lead_code: string;
  customer_name: string;
  phone: string;
  assigned_to_id: number | null;
}

export const RATINGS: { value: string; label: string; hint: string }[] = [
  { value: 'HOT_INTERESTED', label: 'Very interested', hint: 'Ready to move forward' },
  { value: 'WARM', label: 'Interested', hint: 'Liked it, still deciding' },
  { value: 'COLD', label: 'Lukewarm', hint: 'Unsure' },
  { value: 'NOT_INTERESTED', label: 'Not interested', hint: 'The lead will be dropped' },
];

/** Local "now" in the format a datetime-local input wants (also its max). */
const localNow = () => {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};

/**
 * Record a visit the customer made on their own (no booking, no project
 * manager): already completed, reported by the telecaller who owns the lead.
 */
export const WalkInVisitModal: React.FC<{
  onClose: () => void;
  onDone: () => void;
  /** Open with a lead already chosen (from a lead's own page). */
  presetLead?: { id: number; customer_name: string };
}> = ({ onClose, onDone, presetLead }) => {
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();
  const [mode, setMode] = useState<'EXISTING' | 'NEW'>(presetLead ? 'EXISTING' : 'EXISTING');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<LeadHit[]>([]);
  const [lead, setLead] = useState<{ id: number; label: string } | null>(
    presetLead ? { id: presetLead.id, label: presetLead.customer_name } : null,
  );
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
  const [projectId, setProjectId] = useState('');
  const [when, setWhen] = useState(localNow());
  const [rating, setRating] = useState('WARM');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchWithAuth(`${API_BASE_URL}/projects?limit=200`)
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then((d) =>
        setProjects(
          (d.projects || []).map((p: { id: number; name: string }) => ({ id: p.id, name: p.name })),
        ),
      )
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search the telecaller's own leads as they type.
  useEffect(() => {
    if (mode !== 'EXISTING' || lead || query.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      fetchWithAuth(`${API_BASE_URL}/leads?q=${encodeURIComponent(query.trim())}&limit=8`)
        .then((r) => (r.ok ? r.json() : { leads: [] }))
        .then((d) => setHits(d.leads || []))
        .catch(() => setHits([]));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, mode, lead]);

  const customerOk =
    mode === 'EXISTING' ? !!lead : name.trim().length >= 2 && phone.trim().length >= 6;
  const canSave = !saving && customerOk && !!projectId && notes.trim().length >= 3 && !!when;

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/site-visits/walk-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(mode === 'EXISTING'
            ? { lead_id: lead!.id }
            : { customer_name: name.trim(), phone: phone.trim() }),
          project_id: parseInt(projectId, 10),
          visit_date: new Date(when).toISOString(),
          rating,
          feedback_notes: notes.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return handleApiError(res, showError, data);
      showToast(data.note || 'Walk-in recorded. A feedback request is ready to send.', 'success');
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
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Walk-in visit
            </p>
            <h3 className="font-black text-navy-900 text-base">
              The customer came to the project on their own
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

        {!presetLead && (
          <div className="grid grid-cols-2 gap-2">
            {(['EXISTING', 'NEW'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`py-2 rounded-xl text-xs font-bold border ${
                  mode === m
                    ? 'bg-navy-900 text-white border-navy-900'
                    : 'bg-white text-slate-700 border-slate-300'
                }`}
              >
                {m === 'EXISTING' ? 'A customer already in the CRM' : 'A new customer'}
              </button>
            ))}
          </div>
        )}

        {mode === 'EXISTING' ? (
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Customer *
            </label>
            {lead ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2.5 border border-slate-300 rounded-xl text-sm">
                <span className="font-semibold text-slate-800 truncate">{lead.label}</span>
                {!presetLead && (
                  <button
                    onClick={() => {
                      setLead(null);
                      setQuery('');
                    }}
                    className="text-xs font-bold text-navy-600"
                  >
                    Change
                  </button>
                )}
              </div>
            ) : (
              <>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, phone or lead code"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm"
                />
                {hits.length > 0 && (
                  <ul className="mt-1 border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-48 overflow-y-auto">
                    {hits.map((h) => (
                      <li key={h.id}>
                        <button
                          onClick={() =>
                            setLead({ id: h.id, label: `${h.customer_name} (${h.lead_code})` })
                          }
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                        >
                          <span className="font-semibold text-slate-800">{h.customer_name}</span>
                          <span className="text-xs text-slate-500">
                            {' '}
                            · {h.phone} · {h.lead_code}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            <p className="text-[11px] text-slate-500 mt-1">
              You can record a walk-in only for a lead that is yours.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Customer name *
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Phone *
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                type="tel"
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                A new lead is created for you, with the source "Walk-In".
              </p>
            </div>
          </div>
        )}

        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
            Project visited *
          </label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm bg-white text-slate-800"
          >
            <option value="">Choose a project...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
            When did they come? *
          </label>
          <input
            type="datetime-local"
            value={when}
            max={localNow()}
            onChange={(e) => setWhen(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
            How interested were they? *
          </label>
          <div className="grid grid-cols-2 gap-2">
            {RATINGS.map((r) => (
              <button
                key={r.value}
                onClick={() => setRating(r.value)}
                className={`text-left px-3 py-2 rounded-xl border ${
                  rating === r.value ? 'border-navy-900 bg-navy-50' : 'border-slate-300 bg-white'
                }`}
              >
                <span className="block text-xs font-bold text-slate-800">{r.label}</span>
                <span className="block text-[10px] text-slate-500">{r.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
            What did they say? *
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={900}
            placeholder="e.g. Liked the 3BHK, wants a loan quote"
            className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
          />
        </div>

        <button
          onClick={save}
          disabled={!canSave}
          className="w-full py-3 rounded-2xl bg-navy-900 text-white font-black text-sm disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Record walk-in'}
        </button>
      </div>
    </div>
  );
};
