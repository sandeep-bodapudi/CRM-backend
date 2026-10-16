import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ClipboardCheck, ListTodo, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import { MyTargetsCard } from '../targets/MyTargetsCard';

const FINISHED = ['COMPLETED', 'CANCELLED', 'NOT_COMPLETED', 'BLOCKED'];

/**
 * What every role needs at the top of its dashboard, from the same sources the
 * Tasks page and Targets use (so the numbers match what they open):
 * open tasks, overdue tasks, reports waiting for the person's review, and the
 * person's own measured targets. Shows nothing when there is nothing to show.
 */
export const MyTasksStrip: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ['myTasksSummary'],
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE_URL}/tasks/my-tasks`);
      if (!res.ok) throw new Error('tasks unavailable');
      const d = (await res.json()) as {
        tasks: { status: string; is_overdue?: boolean }[];
        to_review: unknown[];
      };
      const open = d.tasks.filter((t) => !FINISHED.includes(t.status));
      return {
        open: open.length,
        overdue: open.filter((t) => t.is_overdue).length,
        review: (d.to_review || []).length,
      };
    },
    staleTime: 30_000,
    refetchInterval: 90_000,
    retry: false,
  });

  if (!data || (data.open === 0 && data.review === 0)) return null;

  const chips = [
    { label: 'Open tasks', n: data.open, icon: ListTodo, tone: 'text-navy-700 bg-navy-50' },
    { label: 'Overdue', n: data.overdue, icon: AlertTriangle, tone: 'text-rose-700 bg-rose-50' },
    {
      label: 'Waiting for your review',
      n: data.review,
      icon: ClipboardCheck,
      tone: 'text-amber-700 bg-amber-50',
    },
  ].filter((c) => c.n > 0);

  return (
    <section aria-label="My tasks" className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <button
          key={c.label}
          onClick={() => navigate('/tasks')}
          className={`flex items-center gap-2 rounded-2xl pl-3 pr-2 py-2 border border-slate-200 bg-white shadow-sm hover:shadow`}
        >
          <span className={`w-7 h-7 rounded-full flex items-center justify-center ${c.tone}`}>
            <c.icon className="w-4 h-4" />
          </span>
          <span className="text-xs font-black text-slate-800">{c.n}</span>
          <span className="text-xs font-semibold text-slate-600">{c.label}</span>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>
      ))}
    </section>
  );
};

export const MyWorkSummary: React.FC = () => (
  <>
    <MyTasksStrip />
    <MyTargetsCard />
  </>
);
