import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';
import { handleApiError, toUserFacingError } from '../../utils/userFacingError';

interface HandoverSummary {
  moves: { leads: number; tasks: number; customers: number };
  manual: {
    pm_visits: number;
    agent_visits: number;
    projects: number;
    properties: number;
    complaints: number;
    demos: number;
    bookings: number;
    direct_reports: number;
  };
  targets: { id: number; name: string; code: string }[];
  suggested_target_id: number | null;
}

export type LeaverMode = 'resign' | 'notice' | 'handover';

const MANUAL_LABELS: Record<keyof HandoverSummary['manual'], string> = {
  pm_visits: 'upcoming visits as PM',
  agent_visits: 'upcoming visits as agent',
  projects: 'projects they manage',
  properties: 'properties they manage',
  complaints: 'open complaints',
  demos: 'open demos',
  bookings: 'bookings in progress',
  direct_reports: 'people reporting to them',
};

const fmtDay = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Resignation and hand-over, one modal for three moments:
 * - resign: record it. With a future last day they keep working until then;
 *   after that day they are locked out and their work goes to the colleague picked.
 * - notice: while serving notice, change the last day / colleague, or withdraw.
 * - handover: someone who has already left still owns work; move it now.
 */
export const LeaverModal: React.FC<{
  mode: LeaverMode;
  employee: {
    id: number;
    fullName: string;
    lastWorkingDay?: string | null;
    handoverToId?: number | null;
  };
  onClose: () => void;
  onDone: (message: string) => void;
}> = ({ mode, employee, onClose, onDone }) => {
  const { fetchWithAuth } = useAuth();
  const { showError } = useToast();
  const [summary, setSummary] = useState<HandoverSummary | null>(null);
  const [lastDay, setLastDay] = useState(mode === 'notice' ? employee.lastWorkingDay || '' : '');
  const [reason, setReason] = useState('');
  const [toId, setToId] = useState(
    mode === 'notice' && employee.handoverToId ? String(employee.handoverToId) : '',
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchWithAuth(`${API_BASE_URL}/employees/${employee.id}/handover-summary`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: HandoverSummary | null) => {
        if (!d) return;
        setSummary(d);
        if (mode !== 'notice' && d.suggested_target_id) setToId(String(d.suggested_target_id));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id]);

  const leavesNow = mode === 'resign' && (!lastDay || lastDay < todayStr());
  const targetName = summary?.targets.find((t) => String(t.id) === toId)?.name;
  const openWork = summary
    ? summary.moves.leads + summary.moves.tasks + summary.moves.customers
    : 0;
  const manualItems = summary
    ? (Object.keys(MANUAL_LABELS) as (keyof HandoverSummary['manual'])[]).filter(
        (k) => summary.manual[k] > 0,
      )
    : [];

  const send = async (url: string, method: string, body?: object) => {
    setSaving(true);
    try {
      const res = await fetchWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await handleApiError(res, showError, data);
        return null;
      }
      return data;
    } catch (e) {
      showError(
        toUserFacingError({ message: e instanceof Error ? e.message : String(e), body: e }),
      );
      return null;
    } finally {
      setSaving(false);
    }
  };

  const base = `${API_BASE_URL}/employees/${employee.id}`;
  const handoverId = toId ? parseInt(toId, 10) : null;

  const save = async () => {
    if (mode === 'resign') {
      const data = await send(`${base}/resign`, 'POST', {
        last_working_day: lastDay || undefined,
        reason: reason || undefined,
        handover_to_id: handoverId,
      });
      if (!data) return;
      onDone(
        data.serving_notice
          ? `${employee.fullName} is serving notice until ${fmtDay(lastDay)}.`
          : `${employee.fullName} has been marked as resigned.`,
      );
    } else if (mode === 'notice') {
      const data = await send(`${base}/resignation`, 'PATCH', {
        last_working_day: lastDay || undefined,
        handover_to_id: handoverId,
      });
      if (data) onDone(`${employee.fullName}'s resignation was updated.`);
    } else {
      if (!handoverId) return;
      const data = await send(`${base}/handover`, 'POST', {
        to_employee_id: handoverId,
        reason: reason || undefined,
      });
      if (data) {
        onDone(
          `${data.moved.leads} leads, ${data.moved.tasks + data.moved.call_backs} tasks and ${data.moved.customers} customers handed over to ${targetName}.`,
        );
      }
    }
  };

  const withdraw = async () => {
    if (!window.confirm(`Withdraw ${employee.fullName}'s resignation?`)) return;
    const data = await send(`${base}/resignation`, 'DELETE');
    if (data) onDone(`${employee.fullName}'s resignation was withdrawn.`);
  };

  const title =
    mode === 'resign'
      ? `Mark ${employee.fullName} as Resigned`
      : mode === 'notice'
        ? `${employee.fullName} — serving notice`
        : `Hand over ${employee.fullName}'s work`;

  const saveLabel = saving
    ? 'Saving...'
    : mode === 'handover'
      ? 'Hand over now'
      : mode === 'notice'
        ? 'Save changes'
        : leavesNow
          ? 'Lock out now'
          : `Lock out after ${fmtDay(lastDay)}`;

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-xl border border-slate-100 animate-scaleUp max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <span className="font-bold text-slate-800 text-sm">{title}</span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-3">
          {mode !== 'handover' && (
            <div>
              <label
                htmlFor="leaver-last-day"
                className="block text-[11px] font-bold text-slate-600 uppercase mb-1"
              >
                Last Working Day{mode === 'resign' ? ' (optional)' : ''}
              </label>
              <input
                id="leaver-last-day"
                type="date"
                value={lastDay}
                onChange={(e) => setLastDay(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                {!lastDay && mode === 'notice'
                  ? 'Pick their last working day.'
                  : leavesNow
                    ? 'No future last day: they are locked out as soon as you confirm.'
                    : `They keep working until the end of ${fmtDay(lastDay)}, then they are locked out.`}
              </p>
            </div>
          )}

          <div>
            <label
              htmlFor="leaver-handover"
              className="block text-[11px] font-bold text-slate-600 uppercase mb-1"
            >
              Hand over work to
            </label>
            <select
              id="leaver-handover"
              value={toId}
              onChange={(e) => setToId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-navy-500"
            >
              <option value="">
                {mode === 'handover' ? 'Choose a colleague' : 'Decide later'}
              </option>
              {summary?.targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.code})
                </option>
              ))}
            </select>
            {summary && (
              <p className="text-[11px] text-slate-500 mt-1">
                {openWork === 0
                  ? 'They have no open leads, tasks or customers right now.'
                  : `${summary.moves.leads} open leads, ${summary.moves.tasks} open tasks and ${summary.moves.customers} customers${
                      mode === 'handover' || leavesNow ? ' move now' : ' move on their last day'
                    }${targetName ? ` to ${targetName}` : ''}.`}
              </p>
            )}
          </div>

          {manualItems.length > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-900">
              <p className="font-bold mb-1">Give these a new owner yourself:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                {manualItems.map((k) => (
                  <li key={k}>
                    {summary!.manual[k]} {MANUAL_LABELS[k]}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {mode !== 'notice' && (
            <div>
              <label
                htmlFor="leaver-reason"
                className="block text-[11px] font-bold text-slate-600 uppercase mb-1"
              >
                Reason (optional)
              </label>
              <textarea
                id="leaver-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
              />
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {mode === 'notice' ? (
              <button
                onClick={withdraw}
                disabled={saving}
                className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl disabled:opacity-50"
              >
                Withdraw resignation
              </button>
            ) : (
              <button
                onClick={onClose}
                className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                Cancel
              </button>
            )}
            <button
              onClick={save}
              disabled={saving || (mode === 'handover' && !toId) || (mode === 'notice' && !lastDay)}
              className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl disabled:opacity-50"
            >
              {saveLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
