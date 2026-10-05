import React, { useEffect, useState } from 'react';
import { X, ArrowRightLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';
import { EmployeeListItem } from '../../types';
import { getLeadSourceLabel } from '../../constants/leadStatus';

interface UploadBatch {
  created_by_id: number | null;
  created_by_name: string;
  source: string;
  day: string;
  count: number;
}

interface Props {
  employees: EmployeeListItem[];
  onClose: () => void;
  onMoved: () => void;
}

/**
 * Moves a whole upload's not-yet-called leads from one person to another —
 * e.g. an Excel upload sent to the pool by mistake instead of "Assign to Me",
 * which otherwise meant reassigning a hundred leads one at a time.
 */
export const MoveLeadBatchModal: React.FC<Props> = ({ employees, onClose, onMoved }) => {
  const { fetchWithAuth } = useAuth();
  const { showToast } = useToast();
  const [fromId, setFromId] = useState('');
  const [batches, setBatches] = useState<UploadBatch[] | null>(null);
  const [batchIdx, setBatchIdx] = useState<number | null>(null);
  const [toId, setToId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = employees
    .filter((e: any) => !e.status || e.status === 'ACTIVE')
    .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));

  useEffect(() => {
    setBatches(null);
    setBatchIdx(null);
    if (!fromId) return;
    fetchWithAuth(`${API_BASE_URL}/leads/upload-batches?employee_id=${fromId}`)
      .then((r) => (r.ok ? r.json() : { batches: [] }))
      .then((d) => setBatches(d.batches || []))
      .catch(() => setBatches([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromId]);

  const batch = batchIdx !== null && batches ? batches[batchIdx] : null;

  // When the uploader is a real employee they're the obvious destination.
  useEffect(() => {
    if (batch?.created_by_id && String(batch.created_by_id) !== fromId) {
      setToId(String(batch.created_by_id));
    }
  }, [batch, fromId]);

  const submit = async () => {
    if (!batch || !toId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/leads/move-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_employee_id: parseInt(fromId, 10),
          to_employee_id: parseInt(toId, 10),
          created_by_id: batch.created_by_id,
          source: batch.source,
          day: batch.day,
          reason: reason.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not move the leads');
      showToast(data.message || 'Leads moved', 'success');
      onMoved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const fmtDay = (d: string) =>
    new Date(`${d}T00:00:00+05:30`).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-navy-600" /> Move a batch of leads
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Moves the leads from one upload that nobody has called yet. Leads already called stay
              where they are.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-3 p-3 bg-red-50 text-red-600 text-xs rounded-xl border border-red-200">
            {error}
          </div>
        )}

        <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
          1. Leads are currently with
        </label>
        <select
          value={fromId}
          onChange={(e) => setFromId(e.target.value)}
          className="w-full p-2.5 text-sm border border-slate-200 rounded-xl mb-4"
        >
          <option value="">Choose employee…</option>
          {active.map((e) => (
            <option key={e.id} value={e.id}>
              {e.full_name} ({e.employee_code})
            </option>
          ))}
        </select>

        {fromId && (
          <>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              2. Which upload
            </label>
            {batches === null ? (
              <p className="text-xs text-slate-400 mb-4">Loading…</p>
            ) : batches.length === 0 ? (
              <p className="text-xs text-slate-500 mb-4">No uncalled leads with this person.</p>
            ) : (
              <div className="space-y-2 mb-4 max-h-56 overflow-y-auto">
                {batches.map((b, i) => (
                  <button
                    key={`${b.created_by_id}|${b.source}|${b.day}`}
                    type="button"
                    onClick={() => setBatchIdx(i)}
                    className={`w-full text-left p-3 rounded-xl border text-sm ${batchIdx === i ? 'border-navy-600 bg-navy-50' : 'border-slate-200 hover:bg-slate-50'}`}
                  >
                    <span className="font-bold text-slate-800">{b.count} leads</span>{' '}
                    <span className="text-slate-600">
                      · {getLeadSourceLabel(b.source)} · added by {b.created_by_name} on{' '}
                      {fmtDay(b.day)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {batch && (
          <>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              3. Move them to
            </label>
            <select
              value={toId}
              onChange={(e) => setToId(e.target.value)}
              className="w-full p-2.5 text-sm border border-slate-200 rounded-xl mb-4"
            >
              <option value="">Choose employee…</option>
              {active
                .filter((e) => String(e.id) !== fromId)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name} ({e.employee_code})
                    {e.id === batch.created_by_id ? ' — uploaded these' : ''}
                  </option>
                ))}
            </select>

            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Reason
            </label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Uploaded to pool by mistake, meant for uploader"
              className="w-full p-2.5 text-sm border border-slate-200 rounded-xl mb-5"
            />
          </>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm rounded-lg"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!batch || !toId || reason.trim().length < 3 || saving}
            onClick={submit}
            className="px-5 py-2 bg-navy-900 hover:bg-navy-800 disabled:opacity-40 text-white font-semibold text-sm rounded-lg"
          >
            {saving ? 'Moving…' : batch ? `Move ${batch.count} leads` : 'Move leads'}
          </button>
        </div>
      </div>
    </div>
  );
};
