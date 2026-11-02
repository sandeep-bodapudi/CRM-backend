import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Lock, Mic, MicOff, Pencil } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';

export interface SheetField {
  id: string;
  label: string;
  /** What the CRM recorded today; null for a typed-only question. */
  recorded: number | null;
  input: 'COUNT' | 'MONEY' | 'TEXT' | null;
  required: boolean;
  hint: string | null;
}

export interface ReportToday {
  role: string;
  required: boolean;
  fields: SheetField[];
  checks: { label: string; done: number; target: number }[];
  below_target: boolean;
  report: {
    id: number;
    submitted_at: string;
    summary: string;
    below_target_reason: string | null;
    target_met: boolean;
    typed: Record<string, unknown>;
  } | null;
  checked_out: boolean;
  can_edit: boolean;
  /** Every change they made in the CRM today, oldest first. */
  crm_actions?: { at: string; label: string }[];
}

export const REPORT_TODAY_KEY = 'reportToday';

export function useReportToday(enabled = true) {
  const { fetchWithAuth, activeRole } = useAuth();
  return useQuery({
    queryKey: [REPORT_TODAY_KEY, activeRole],
    queryFn: async () => {
      const q = activeRole ? `?role=${encodeURIComponent(activeRole)}` : '';
      const res = await fetchWithAuth(`${API_BASE_URL}/reports/today${q}`);
      if (!res.ok) throw new Error('Could not load the report');
      return (await res.json()) as ReportToday;
    },
    staleTime: 30_000,
    enabled,
  });
}

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });

const show = (v: unknown) => (v === undefined || v === null || v === '' ? '—' : String(v));

/**
 * The end-of-day report. Numbers the CRM records are filled in already (the
 * person may add their own count beside them); they type only what the CRM
 * cannot know and the day's summary. It can be corrected until the QR checkout.
 */
export const EndOfDayReportForm: React.FC<{ onDone?: () => void }> = ({ onDone }) => {
  const { fetchWithAuth } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useReportToday();
  const [editing, setEditing] = useState(false);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [listening, setListening] = useState<any>(null);

  const report = data?.report || null;
  const formOpen = !!data && (!report || editing);

  // Start the form from the report already sent (when correcting it).
  useEffect(() => {
    if (!data) return;
    if (report && editing) {
      setTyped(
        Object.fromEntries(
          Object.entries(report.typed).map(([k, v]) => [k, show(v) === '—' ? '' : String(v)]),
        ),
      );
      setSummary(report.summary);
      setReason(report.below_target_reason || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, report?.id]);

  if (isLoading) return <p className="text-sm text-slate-400 py-6 text-center">Loading…</p>;
  if (error || !data)
    return <p className="text-sm text-red-600 py-6 text-center">Could not load the report.</p>;

  const needReason = report ? !report.target_met : data.below_target;

  const speech = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return null;
    return SR;
  };
  const toggleMic = () => {
    if (listening) {
      listening.stop();
      setListening(null);
      return;
    }
    const SR = speech();
    if (!SR) return;
    const r = new SR();
    r.lang = 'en-IN';
    r.continuous = true;
    r.interimResults = false;
    const base = summary;
    let said = '';
    r.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++)
        if (e.results[i].isFinal) said += ' ' + e.results[i][0].transcript;
      setSummary(`${base} ${said}`.replace(/\s+/g, ' ').trim());
    };
    r.onend = () => setListening(null);
    r.onerror = () => setListening(null);
    r.start();
    setListening(r);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    for (const f of data.fields) {
      if (f.input && f.required && !(typed[f.id] || '').trim()) {
        setMessage(`Fill in "${f.label}".`);
        return;
      }
    }
    if (summary.trim().length < 5) {
      setMessage('Write a short summary of your day (at least 5 characters).');
      return;
    }
    if (needReason && reason.trim().length < 15) {
      setMessage('Explain why the target was missed (at least 15 characters).');
      return;
    }
    const metrics = Object.fromEntries(
      Object.entries(typed)
        .filter(([, v]) => v.trim() !== '')
        .map(([k, v]) => {
          const f = data.fields.find((x) => x.id === k);
          return [k, f && f.input !== 'TEXT' ? Number(v) : v.trim()];
        }),
    );
    setBusy(true);
    try {
      const res = await fetchWithAuth(
        report ? `${API_BASE_URL}/reports/daily/${report.id}` : `${API_BASE_URL}/reports/daily`,
        {
          method: report ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role_name: data.role,
            metrics,
            summary_notes: summary.trim(),
            below_target_reason: needReason ? reason.trim() : null,
          }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.details?.[0]?.message || body.error || 'Could not send the report.');
        return;
      }
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: [REPORT_TODAY_KEY] });
      queryClient.invalidateQueries({ queryKey: ['reportStatus'] });
      onDone?.();
    } catch {
      setMessage('Network error, please try again.');
    } finally {
      setBusy(false);
    }
  };

  const recordedFields = data.fields.filter((f) => f.recorded !== null);
  const typedFields = data.fields.filter((f) => f.recorded === null);

  // ---- Sent: show it, with "Correct it" until checkout ----
  if (report && !editing) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <span className="font-bold text-emerald-800">Sent at {time(report.submitted_at)}</span>
          {!report.target_met && (
            <span className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-0.5">
              Below target
            </span>
          )}
        </div>
        {data.fields.length > 0 && (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {data.fields.map((f) => (
              <div
                key={f.id}
                className="flex justify-between gap-3 border-b border-slate-100 py-1.5"
              >
                <dt className="text-slate-500">{f.label}</dt>
                <dd className="font-bold text-navy-900 text-right">
                  {f.recorded !== null ? f.recorded : show(report.typed[f.id])}
                  {f.recorded !== null && show(report.typed[f.id]) !== '—' && (
                    <span className="font-normal text-slate-400">
                      {' '}
                      (you said {show(report.typed[f.id])})
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-xl p-3">
          {report.summary}
        </p>
        {report.below_target_reason && (
          <p className="text-sm text-rose-800 bg-rose-50 rounded-xl p-3">
            Why below target: {report.below_target_reason}
          </p>
        )}
        {data.can_edit ? (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-navy-800"
          >
            <Pencil className="w-4 h-4" /> Correct the report
          </button>
        ) : (
          <p className="text-xs text-slate-500 inline-flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> Final: you have checked out for today.
          </p>
        )}
        {data.can_edit && (
          <p className="text-xs text-slate-500">
            You can correct it until you check out. Then scan the QR to check out.
          </p>
        )}
      </div>
    );
  }

  if (!formOpen) return null;

  return (
    <form onSubmit={submit} className="space-y-5">
      {data.checks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.checks.map((c) => {
            const ok = c.done >= c.target;
            return (
              <span
                key={c.label}
                className={`text-xs font-bold rounded-full px-3 py-1 border ${ok ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'}`}
              >
                {c.label}: {c.done} of {c.target}
              </span>
            );
          })}
        </div>
      )}

      {(data.crm_actions || []).length > 0 && (
        <details className="rounded-2xl border border-slate-200 px-3 py-2">
          <summary className="cursor-pointer text-sm font-bold text-slate-700">
            Everything you did in the CRM today ({data.crm_actions!.length})
          </summary>
          <ul className="mt-2 space-y-1 max-h-64 overflow-y-auto text-xs">
            {data.crm_actions!.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-slate-400 shrink-0 w-14">
                  {new Date(a.at).toLocaleTimeString('en-IN', {
                    hour: 'numeric',
                    minute: '2-digit',
                    timeZone: 'Asia/Kolkata',
                  })}
                </span>
                <span className="text-slate-700">{a.label}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {recordedFields.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Recorded by the CRM today
          </p>
          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
            {recordedFields.map((f) => (
              <div key={f.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="flex-1 text-sm text-slate-700">{f.label}</span>
                <span className="text-lg font-black text-navy-900 w-10 text-right">
                  {f.recorded}
                </span>
                <input
                  inputMode="numeric"
                  aria-label={`Your count: ${f.label}`}
                  placeholder="Your count"
                  value={typed[f.id] || ''}
                  onChange={(e) =>
                    setTyped({ ...typed, [f.id]: e.target.value.replace(/[^0-9]/g, '') })
                  }
                  className="w-24 p-2 text-sm bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Targets are checked on the CRM numbers. If something is missing (a call you made but did
            not log), log it in the CRM before sending. “Your count” is optional.
          </p>
        </div>
      )}

      {typedFields.map((f) => (
        <label key={f.id} className="block text-sm font-semibold text-slate-700">
          {f.label}
          {f.required && <span className="text-rose-600"> *</span>}
          {f.input === 'TEXT' ? (
            <textarea
              rows={2}
              value={typed[f.id] || ''}
              onChange={(e) => setTyped({ ...typed, [f.id]: e.target.value })}
              className="mt-1 w-full p-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl"
            />
          ) : (
            <input
              inputMode="numeric"
              value={typed[f.id] || ''}
              onChange={(e) =>
                setTyped({ ...typed, [f.id]: e.target.value.replace(/[^0-9]/g, '') })
              }
              className="mt-1 w-40 block p-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl"
            />
          )}
          {f.hint && <span className="block text-xs font-normal text-slate-400">{f.hint}</span>}
        </label>
      ))}

      <label className="block text-sm font-semibold text-slate-700">
        What did you do today? <span className="text-rose-600">*</span>
        <div className="relative">
          <textarea
            rows={4}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Main work done, follow-ups for tomorrow, anything the team should know."
            className="mt-1 w-full p-2.5 pr-12 text-sm bg-slate-50 border border-slate-200 rounded-xl"
          />
          {speech() && (
            <button
              type="button"
              onClick={toggleMic}
              aria-label={listening ? 'Stop dictation' : 'Dictate'}
              className={`absolute right-2 top-3 p-2 rounded-lg ${listening ? 'bg-rose-600 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}
            >
              {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}
        </div>
      </label>

      {needReason && (
        <label className="block text-sm font-semibold text-rose-800">
          Why is today below target? <span className="text-rose-600">*</span>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="For example: 3 hours at the site with a customer for the agreement."
            className="mt-1 w-full p-2.5 text-sm bg-rose-50 border border-rose-200 rounded-xl"
          />
          <span className="block text-xs font-normal text-rose-700">At least 15 characters.</span>
        </label>
      )}

      {message && (
        <p className="flex items-center gap-2 text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 shrink-0" /> {message}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 sm:flex-none px-6 py-3 rounded-xl bg-navy-900 hover:bg-navy-800 disabled:bg-slate-300 text-white font-black text-sm"
        >
          {busy ? 'Sending…' : report ? 'Save changes' : 'Send report'}
        </button>
        {report && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="px-4 py-3 rounded-xl border border-slate-300 text-sm font-bold text-slate-600"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
};
