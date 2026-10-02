import React, { useEffect, useState } from 'react';
import { GitBranch, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';

interface Suggestion {
  id: number;
  name: string;
  employee_code: string;
  roles: string[];
  current_manager: string | null;
  suggested_manager_id: number;
  suggested_manager: string;
}
interface SuggestionsResponse {
  leaders: { md: string | null; marketing_director: string | null; digital_head: string | null };
  suggestions: Suggestion[];
}

/**
 * Employees with no reporting manager (or one that is only a fallback, e.g.
 * the MD while a Marketing Director now exists) and the manager the
 * company's default rule gives them. Shown only when there is something to
 * fix; the MD/HR ticks who to update and applies.
 */
export const ReportingSuggestionsCard: React.FC<{ onApplied?: () => void }> = ({ onApplied }) => {
  const { fetchWithAuth } = useAuth();
  const [data, setData] = useState<SuggestionsResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/employees/reporting-suggestions`);
      if (!res.ok) return;
      const body: SuggestionsResponse = await res.json();
      setData(body);
      setSelected(body.suggestions.map((s) => s.id));
    } catch {
      // Optional helper card: stay hidden if it can't load.
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data || (data.suggestions.length === 0 && !message)) return null;

  const apply = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/employees/reporting-suggestions/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_ids: selected }),
      });
      const body = await res.json().catch(() => ({}));
      setMessage({
        ok: res.ok,
        text: res.ok
          ? `Updated ${body.updated} employee${body.updated === 1 ? '' : 's'}.`
          : body.error || 'Failed',
      });
      if (res.ok) {
        setOpen(false);
        await load();
        onApplied?.();
      }
    } catch {
      setMessage({ ok: false, text: 'Network error, please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: number) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <GitBranch className="w-5 h-5 text-amber-700 mt-0.5" />
          <div>
            <div className="text-sm font-bold text-amber-900">
              {data.suggestions.length > 0
                ? `${data.suggestions.length} employee${data.suggestions.length === 1 ? '' : 's'} need a reporting manager`
                : 'Reporting structure'}
            </div>
            <div className="text-xs text-amber-800">
              Managers only see their team when people report to them.
              {message && (
                <span
                  className={`ml-2 font-bold ${message.ok ? 'text-emerald-700' : 'text-red-600'}`}
                >
                  {message.text}
                </span>
              )}
            </div>
          </div>
        </div>
        {data.suggestions.length > 0 && (
          <button
            onClick={() => setOpen(true)}
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold"
          >
            Review &amp; apply
          </button>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h2 className="font-extrabold text-slate-900">Set reporting managers</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto">
              <p className="text-xs text-slate-500">
                Rule: the digital team reports to the Digital Head; everyone else to the Marketing
                Director; if either post is empty, to the MD. HR and accounts report to the MD.
                Managers you set by hand are never changed.
                <br />
                Current leaders: MD <b>{data.leaders.md || '—'}</b> · Marketing Director{' '}
                <b>{data.leaders.marketing_director || 'none'}</b> · Digital Head{' '}
                <b>{data.leaders.digital_head || 'none'}</b>
              </p>
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                {data.suggestions.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(s.id)}
                      onChange={() => toggle(s.id)}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="font-bold text-slate-800">{s.name}</span>{' '}
                      <span className="text-[11px] text-slate-400">{s.roles.join(', ')}</span>
                    </span>
                    <span className="text-xs text-slate-500 shrink-0">
                      {s.current_manager || 'no manager'} →{' '}
                      <b className="text-slate-800">{s.suggested_manager}</b>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="p-4 border-t border-slate-100">
              <button
                disabled={busy || selected.length === 0}
                onClick={apply}
                className="w-full py-3 bg-navy-700 hover:bg-navy-800 disabled:bg-slate-300 text-white font-bold text-sm rounded-xl"
              >
                Apply to {selected.length} employee{selected.length === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
