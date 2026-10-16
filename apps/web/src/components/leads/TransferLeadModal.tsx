import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';
import { handleApiError, toUserFacingError } from '../../utils/userFacingError';

interface Colleague {
  id: number;
  fullName: string;
  employeeCode: string;
}

/**
 * Hand a lead to a colleague. The lead's open call-backs, the sales
 * opportunity and visits that have not happened yet move with it, both people
 * are told, and the reason is kept in the lead's history.
 */
export const TransferLeadModal: React.FC<{
  lead: { id: number; customer_name: string };
  onClose: () => void;
  onDone: () => void;
}> = ({ lead, onClose, onDone }) => {
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [toId, setToId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchWithAuth(`${API_BASE_URL}/leads/assignees`)
      .then((r) => (r.ok ? r.json() : { employees: [] }))
      .then((d) => setColleagues(d.employees || []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSave = !saving && !!toId && reason.trim().length >= 3;

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/leads/${lead.id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_employee_id: parseInt(toId, 10), reason: reason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return handleApiError(res, showError, data);
      showToast('Lead transferred', 'success');
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
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Transfer lead
            </p>
            <h3 className="font-black text-navy-900 text-base break-words">{lead.customer_name}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <p className="text-xs text-slate-600">
          The lead, its open call-backs and its sales opportunity move to your colleague, and you
          both are told. This cannot be undone by you; they can transfer it on.
        </p>

        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
            Transfer to *
          </label>
          <select
            value={toId}
            onChange={(e) => setToId(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm bg-white text-slate-800"
          >
            <option value="">Choose a colleague...</option>
            {colleagues.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName || c.employeeCode} ({c.employeeCode})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
            Why? *
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="e.g. Customer prefers Telugu; Ravi speaks it"
            className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
          />
        </div>

        <button
          onClick={save}
          disabled={!canSave}
          className="w-full py-3 rounded-2xl bg-navy-900 text-white font-black text-sm disabled:opacity-40"
        >
          {saving ? 'Transferring…' : 'Transfer lead'}
        </button>
      </div>
    </div>
  );
};
