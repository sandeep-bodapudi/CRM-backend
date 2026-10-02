import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, NotebookPen, Send } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import {
  WORK_LOG_GROUPS,
  workLogKindLabel,
  workLogEntryLabel,
  isAssociateKind,
  AssociateRef,
} from './workLogKinds';
import { Roles } from '../../shared';

export interface WorkLogEntry {
  id: number;
  kind: string;
  note: string;
  link: string | null;
  count: number;
  title?: string | null;
  associate_name?: string | null;
  associate_id?: string | null;
  at: string;
}

const t = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });

/**
 * Work Log -- record work done outside the CRM (posts, reels, campaigns,
 * meetings, site trips) so it shows on Team Today next to CRM activity.
 */
export const WorkLogPage: React.FC = () => {
  const { fetchWithAuth, activeRole } = useAuth();
  const queryClient = useQueryClient();
  const isCpm = activeRole === Roles.CHANNEL_PARTNER_MANAGER;
  const [kind, setKind] = useState<string>(isCpm ? 'ASSOCIATE_CALL' : 'INSTAGRAM_POST');
  const [associateName, setAssociateName] = useState('');
  const [associateId, setAssociateId] = useState('');
  const [count, setCount] = useState(1);
  const [link, setLink] = useState('');
  const [note, setNote] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const { data } = useQuery({
    queryKey: ['myWorkLog'],
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE_URL}/work-log/my`);
      if (!res.ok) throw new Error('Failed');
      return (await res.json()) as { date: string; entries: WorkLogEntry[] };
    },
  });

  // Associates used before (work log + leads) -- suggestions until the
  // associates portal is connected.
  const { data: associatesData } = useQuery({
    queryKey: ['myAssociates'],
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE_URL}/work-log/associates`);
      if (!res.ok) return { associates: [] as AssociateRef[] };
      return (await res.json()) as { associates: AssociateRef[] };
    },
    enabled: isAssociateKind(kind),
  });
  const associates = associatesData?.associates || [];
  const pickAssociate = (name: string) => {
    setAssociateName(name);
    const hit = associates.find((a) => a.name.toLowerCase() === name.trim().toLowerCase());
    if (hit?.associate_id) setAssociateId(hit.associate_id);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/work-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          note,
          link: link.trim(),
          count,
          ...(kind === 'OTHER' ? { title: title.trim() } : {}),
          ...(isAssociateKind(kind)
            ? { associate_name: associateName.trim(), associate_id: associateId.trim() }
            : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage({ ok: true, text: 'Saved to your work log.' });
        setNote('');
        setTitle('');
        setAssociateName('');
        setAssociateId('');
        queryClient.invalidateQueries({ queryKey: ['myAssociates'] });
        setLink('');
        setCount(1);
        queryClient.invalidateQueries({ queryKey: ['myWorkLog'] });
      } else {
        const detail = body.details?.[0]?.message || body.error;
        setMessage({ ok: false, text: detail || 'Could not save.' });
      }
    } catch {
      setMessage({ ok: false, text: 'Network error, please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm('Remove this entry?')) return;
    const res = await fetchWithAuth(`${API_BASE_URL}/work-log/${id}`, { method: 'DELETE' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setMessage({ ok: false, text: body.error || 'Could not remove.' });
    queryClient.invalidateQueries({ queryKey: ['myWorkLog'] });
  };

  const entries = data?.entries || [];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-navy-100 text-navy-700 flex items-center justify-center">
          <NotebookPen className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Work Log</h1>
          <p className="text-sm text-slate-500">
            Log work done outside the CRM — associate calls and visits, posts, reels, campaigns,
            meetings. Your manager sees it on Team Today.
          </p>
        </div>
      </div>

      <form
        onSubmit={submit}
        className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="sm:col-span-2 text-xs font-semibold text-slate-700">
            What did you do?
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="mt-1 w-full p-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl"
            >
              {(isCpm ? WORK_LOG_GROUPS : [...WORK_LOG_GROUPS.slice(1), WORK_LOG_GROUPS[0]]).map(
                (g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.kinds.map((k) => (
                      <option key={k} value={k}>
                        {workLogKindLabel(k)}
                      </option>
                    ))}
                  </optgroup>
                ),
              )}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-700">
            How many
            <input
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
              className="mt-1 w-full p-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl"
            />
          </label>
        </div>
        {isAssociateKind(kind) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="sm:col-span-2 text-xs font-semibold text-slate-700">
              Associate name{kind === 'ASSOCIATE_NEW_CALL' ? ' (if known)' : ''}
              <input
                list="associate-suggestions"
                value={associateName}
                onChange={(e) => pickAssociate(e.target.value)}
                required={kind !== 'ASSOCIATE_NEW_CALL'}
                maxLength={120}
                placeholder="e.g. Ravi Kumar (Sri Sai Realty)"
                className="mt-1 w-full p-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl"
              />
              <datalist id="associate-suggestions">
                {associates.map((a) => (
                  <option key={(a.associate_id || '') + a.name} value={a.name}>
                    {a.associate_id
                      ? `${a.associate_id}${a.company ? ' · ' + a.company : ''}`
                      : a.company || ''}
                  </option>
                ))}
              </datalist>
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Associate ID (from the associates app)
              <input
                value={associateId}
                onChange={(e) => setAssociateId(e.target.value)}
                maxLength={60}
                placeholder="optional"
                className="mt-1 w-full p-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl"
              />
            </label>
          </div>
        )}
        {kind === 'OTHER' && (
          <label className="block text-xs font-semibold text-slate-700">
            What did you do?
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              minLength={3}
              maxLength={80}
              placeholder="e.g. Brochure printing follow-up, LinkedIn post"
              className="mt-1 w-full p-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl"
            />
          </label>
        )}
        <label className="block text-xs font-semibold text-slate-700">
          Link (optional) — post, reel or campaign URL
          <input
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://instagram.com/p/..."
            className="mt-1 w-full p-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl"
          />
        </label>
        <label className="block text-xs font-semibold text-slate-700">
          Note
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            required
            minLength={3}
            maxLength={500}
            rows={2}
            placeholder="e.g. Reel for Nagadhara Grand launch, 3 versions"
            className="mt-1 w-full p-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl"
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="px-5 py-2.5 bg-navy-700 hover:bg-navy-800 disabled:bg-slate-300 text-white font-bold rounded-xl text-sm flex items-center gap-2"
          >
            <Send className="w-4 h-4" /> Add to log
          </button>
          {message && (
            <span
              className={`text-xs font-bold ${message.ok ? 'text-emerald-700' : 'text-red-600'}`}
            >
              {message.text}
            </span>
          )}
        </div>
      </form>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">Today</h3>
        {entries.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing logged yet today.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map((w) => (
              <li key={w.id} className="py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-800">
                    {workLogEntryLabel(w)}
                    {w.count > 1 ? ` × ${w.count}` : ''}
                  </div>
                  {w.associate_name && (
                    <div className="text-xs font-semibold text-navy-700">
                      {w.associate_name}
                      {w.associate_id ? ` · ${w.associate_id}` : ''}
                    </div>
                  )}
                  <div className="text-xs text-slate-500 break-words">{w.note}</div>
                  {w.link && (
                    <a
                      href={w.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-navy-600 font-semibold inline-flex items-center gap-1 break-all"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" /> {w.link}
                    </a>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[11px] text-slate-400">{t(w.at)}</span>
                  <button
                    onClick={() => remove(w.id)}
                    className="text-[11px] font-bold text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
