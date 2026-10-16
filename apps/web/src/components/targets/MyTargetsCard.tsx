import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Target } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';

export interface TargetProgressRow {
  metric: string;
  metric_label: string;
  period: 'DAY' | 'WEEK' | 'MONTH';
  target: number;
  done: number;
  percent: number;
  source: 'PERSON' | 'ROLE';
}

const PERIOD_LABEL = { DAY: 'Today', WEEK: 'This week', MONTH: 'This month' } as const;

/** One progress bar: how far along a person is against one target. */
export const TargetBar: React.FC<{ row: TargetProgressRow; compact?: boolean }> = ({
  row,
  compact,
}) => {
  const met = row.done >= row.target;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className={`font-semibold text-slate-700 ${compact ? 'text-[11px]' : 'text-xs'}`}>
          {row.metric_label}
        </span>
        <span className={`font-black ${compact ? 'text-[11px]' : 'text-xs'} text-slate-800`}>
          {row.done}
          <span className="font-semibold text-slate-400"> / {row.target}</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            met ? 'bg-emerald-500' : row.percent >= 50 ? 'bg-amber-400' : 'bg-rose-400'
          }`}
          style={{ width: `${Math.max(row.percent, row.done > 0 ? 4 : 0)}%` }}
        />
      </div>
    </div>
  );
};

/**
 * "My targets": day / week / month progress, counted from what the system
 * recorded (calls logged, visits booked or run, bookings confirmed) and never
 * typed. Renders nothing when no target applies to the person.
 */
export const MyTargetsCard: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const { data } = useQuery({
    queryKey: ['myTargetProgress'],
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE_URL}/targets/progress`);
      if (!res.ok) throw new Error('targets unavailable');
      return (await res.json()) as { progress: TargetProgressRow[] };
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: false,
  });

  const rows = data?.progress || [];
  if (rows.length === 0) return null;

  const groups = (['DAY', 'WEEK', 'MONTH'] as const)
    .map((p) => ({ period: p, rows: rows.filter((r) => r.period === p) }))
    .filter((g) => g.rows.length > 0);

  return (
    <section
      aria-label="My targets"
      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4"
    >
      <div className="flex items-center gap-2">
        <Target className="w-4 h-4 text-navy-700" />
        <h2 className="text-sm font-black text-navy-900">My targets</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {groups.map((g) => (
          <div key={g.period} className="space-y-3">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
              {PERIOD_LABEL[g.period]}
            </p>
            {g.rows.map((r) => (
              <TargetBar key={r.metric + r.period} row={r} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
};
