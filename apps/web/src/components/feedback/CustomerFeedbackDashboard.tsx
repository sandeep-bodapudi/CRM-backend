import React, { useEffect, useState } from 'react';
import { Star, MessageSquareText, CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';

interface FeedbackItem {
  id: number;
  ratedEmployeeId: number;
  ratedEmployeeName: string;
  rating: number | null;
  onTime: boolean | null;
  answeredQuestions: boolean | null;
  propertyAsDescribed: boolean | null;
  comment: string | null;
  submittedAt: string | null;
  customerName: string;
}

const YesNoBadge: React.FC<{ label: string; value: boolean | null }> = ({ label, value }) => (
  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
    {value ? (
      <CheckCircle2 className="w-3.5 h-3.5 text-teal-500" />
    ) : (
      <XCircle className="w-3.5 h-3.5 text-red-400" />
    )}
    <span>{label}</span>
  </div>
);

export const CustomerFeedbackDashboard: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithAuth(`${API_BASE_URL}/feedback/team`);
        if (!res.ok) throw new Error('Failed to load feedback');
        const data = await res.json();
        setItems(data.items);
      } catch (e) {
        setError('Could not load customer feedback.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [fetchWithAuth]);

  const ratedItems = items.filter((i) => i.rating != null);
  const avgRating = ratedItems.length
    ? (ratedItems.reduce((sum, i) => sum + (i.rating || 0), 0) / ratedItems.length).toFixed(1)
    : '—';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Customer Feedback</h1>
        <p className="text-slate-500 dark:text-slate-400">
          What customers said after their site visits.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Average Rating</p>
          <div className="flex items-center gap-2 mt-1">
            <Star className="w-6 h-6 fill-amber-400 text-amber-400" />
            <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              {avgRating}
            </span>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Responses</p>
          <div className="flex items-center gap-2 mt-1">
            <MessageSquareText className="w-6 h-6 text-navy-600" />
            <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              {items.length}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm divide-y divide-slate-100 dark:divide-slate-700">
        {isLoading && <p className="p-6 text-sm text-slate-400 text-center">Loading…</p>}
        {error && <p className="p-6 text-sm text-red-500 text-center">{error}</p>}
        {!isLoading && !error && items.length === 0 && (
          <p className="p-6 text-sm text-slate-400 text-center">No feedback submitted yet.</p>
        )}
        {items.map((item) => (
          <div key={item.id} className="p-5 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                  {item.ratedEmployeeName}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {item.customerName} ·{' '}
                  {item.submittedAt ? new Date(item.submittedAt).toLocaleDateString('en-IN') : ''}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={`w-4 h-4 ${item.rating != null && n <= item.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200 dark:text-slate-600'}`}
                  />
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <YesNoBadge label="On time" value={item.onTime} />
              <YesNoBadge label="Answered questions" value={item.answeredQuestions} />
              <YesNoBadge label="As described" value={item.propertyAsDescribed} />
            </div>
            {item.comment && (
              <p className="text-sm text-slate-600 dark:text-slate-300 italic">"{item.comment}"</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
