import React, { useState, useEffect } from 'react';
import { PerformanceEvent } from '../../types';
import { History, TrendingUp, TrendingDown, Award, Calendar, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';

export const PerformanceHistoryTimeline: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const [events, setEvents] = useState<PerformanceEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchWithAuth(`${API_BASE_URL}/performance/history`)
      .then((res) => res.json())
      .then((data) => setEvents(data.events || []))
      .catch(() => console.error('Failed to load performance history'))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="p-6 bg-white rounded-2xl border border-slate-200 text-xs text-slate-400">
        Loading performance history timeline...
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-navy-700" />
          <div>
            <h3 className="text-lg font-bold text-slate-800">Performance History & Audit Log</h3>
            <p className="text-xs text-slate-500">
              Track every score boost, attendance stamp, and daily target outcome
            </p>
          </div>
        </div>
        <span className="text-xs font-mono font-bold text-navy-800 bg-navy-50 border border-navy-200 px-3 py-1 rounded-xl">
          Base: 50 pts
        </span>
      </div>

      {events.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400">
          No performance events recorded yet.
        </div>
      ) : (
        <div className="relative border-l-2 border-slate-100 ml-4 pl-6 space-y-6">
          {events.map((ev) => {
            const points = ev.points || 0;
            const isBoost = points > 0;
            return (
              <div key={ev.id} className="relative group">
                {/* Timeline Node Dot */}
                <div
                  className={`absolute -left-[31px] top-0.5 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs shadow-sm ${
                    isBoost ? 'bg-emerald-600' : 'bg-red-500'
                  }`}
                >
                  {isBoost ? (
                    <TrendingUp className="w-3.5 h-3.5" />
                  ) : (
                    <TrendingDown className="w-3.5 h-3.5" />
                  )}
                </div>

                {/* Content Box */}
                <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-200/80 hover:bg-white transition-colors">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-bold text-sm text-slate-800">{ev.title}</span>
                    <span
                      className={`font-mono font-extrabold text-xs px-2.5 py-0.5 rounded-lg ${
                        isBoost ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {isBoost ? `+${points}` : points} pts
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed mb-2">{ev.description}</p>

                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    <span>{new Date(ev.timestamp || '').toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
