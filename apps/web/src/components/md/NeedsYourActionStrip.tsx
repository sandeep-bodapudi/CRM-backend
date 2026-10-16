import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';

interface InboxSection {
  key: string;
  label: string;
  link: string;
  count: number;
}

// Short names for the strip (the inbox's own labels are sentences).
const SHORT_LABEL: Record<string, string> = {
  properties: 'Properties to approve',
  projects: 'Projects to approve',
  bookings: 'Bookings to approve',
  refunds: 'Refunds to approve',
  leave: 'Leave & attendance',
  site_visits: 'Visits not accepted',
  complaints: 'Open complaints',
  overdue_tasks: 'Overdue tasks',
};

/**
 * "Needs your action": one count and one button per thing waiting on the MD,
 * at the very top of the dashboard (before, these counts existed only inside
 * the Approvals page and the clock and shortcuts came first). The counts come
 * from the same endpoint as the Approvals page, so each number matches the list
 * it opens.
 */
export const NeedsYourActionStrip: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['mdApprovalsInbox'],
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE_URL}/md/approvals-inbox`);
      if (!res.ok) throw new Error('inbox unavailable');
      return (await res.json()) as { total: number; sections: InboxSection[] };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });

  if (isLoading || !data) return null; // never block the dashboard on this strip

  const waiting = data.sections.filter((s) => s.count > 0);

  if (waiting.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        Nothing needs your action right now.
      </div>
    );
  }

  return (
    <section aria-label="Needs your action" className="space-y-2">
      <h2 className="text-xs font-extrabold uppercase tracking-wider text-amber-700">
        Needs your action
      </h2>
      <div className="flex flex-wrap gap-2">
        {waiting.map((s) => (
          <button
            key={s.key}
            onClick={() => navigate(s.link)}
            className="flex items-center gap-2 bg-white border border-amber-200 hover:border-amber-400 hover:bg-amber-50 rounded-2xl pl-3 pr-2 py-2 shadow-sm transition-colors"
          >
            <span className="min-w-[1.75rem] h-7 px-1.5 rounded-full bg-amber-500 text-white text-xs font-black flex items-center justify-center">
              {s.count}
            </span>
            <span className="text-xs font-bold text-slate-800">
              {SHORT_LABEL[s.key] || s.label}
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>
        ))}
      </div>
    </section>
  );
};
