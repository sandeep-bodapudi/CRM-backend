import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Inbox } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';

interface InboxItem {
  id: number;
  title: string;
  subtitle?: string;
  since: string;
  overdue?: boolean;
}
interface InboxSection {
  key: string;
  label: string;
  link: string;
  count: number;
  items: InboxItem[];
}

const ago = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'} waiting`;
  const hours = Math.floor(ms / 3600000);
  if (hours >= 1) return `${hours} h waiting`;
  return 'just now';
};

/**
 * Approvals — one inbox for everything waiting on the MD. Replaces checking
 * Action Center, Payments & Refunds, PM Approvals, HR Approvals, Complaints
 * and dashboard escalations one by one: each section shows how many items
 * are waiting, the oldest few, and a link to where they're handled.
 */
export const ApprovalsInboxPage: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['mdApprovalsInbox'],
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE_URL}/md/approvals-inbox`);
      if (!res.ok) throw new Error('Failed to load approvals');
      return (await res.json()) as { total: number; sections: InboxSection[] };
    },
    refetchOnWindowFocus: true,
    staleTime: 60 * 1000,
  });

  const sections = (data?.sections || []).slice().sort((a, b) => b.count - a.count);
  const waiting = sections.filter((s) => s.count > 0);
  const clear = sections.filter((s) => s.count === 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-navy-900 text-gold-400 flex items-center justify-center">
          <Inbox className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Approvals</h1>
          <p className="text-xs text-slate-500">
            {isLoading
              ? 'Loading…'
              : data
                ? data.total === 0
                  ? 'Nothing is waiting for you.'
                  : `${data.total} item${data.total === 1 ? '' : 's'} waiting for your decision`
                : ''}
          </p>
        </div>
      </div>

      {isError && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-sm text-red-700">
          Could not load approvals. Please refresh.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {waiting.map((s) => (
          <div key={s.key} className="bg-white rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h2 className="font-extrabold text-sm text-slate-800">{s.label}</h2>
              <span className="min-w-[24px] h-6 px-2 rounded-full bg-red-500 text-white text-xs font-black flex items-center justify-center">
                {s.count}
              </span>
            </div>
            <ul className="divide-y divide-slate-100">
              {s.items.map((it) => (
                <li key={it.id} className="px-4 py-2.5">
                  <div className="text-sm font-bold text-slate-800 truncate">{it.title}</div>
                  <div className="text-[11px] text-slate-500 flex gap-2">
                    {it.subtitle && <span className="truncate">{it.subtitle}</span>}
                    <span className={it.overdue ? 'text-red-600 font-bold' : ''}>
                      {it.overdue ? 'date passed · ' : ''}
                      {ago(it.since)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <Link
              to={s.link}
              className="flex items-center justify-between px-4 py-3 text-xs font-bold text-navy-700 hover:bg-slate-50 rounded-b-2xl border-t border-slate-100"
            >
              {s.count > s.items.length ? `Open all ${s.count}` : 'Open'}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ))}
      </div>

      {clear.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {clear.map((s) => (
            <span
              key={s.key}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-700"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> {s.label}: none
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
