import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, History as HistoryIcon, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { listProjectActivity, ProjectActivityEvent } from '../../api/projectMedia';

// The project's History (owner, 2026-11-02): an approved project can still
// change, and every change is listed here as "field: before → after, by whom,
// when, why".

const AREAS = [
  { id: 'ALL', label: 'All' },
  { id: 'PRICING', label: 'Prices' },
  { id: 'UNITS', label: 'Units' },
  { id: 'DETAILS', label: 'Details' },
] as const;
type AreaFilter = (typeof AREAS)[number]['id'];

const AREA_CHIP: Record<ProjectActivityEvent['area'], string> = {
  PRICING: 'bg-amber-50 text-amber-700 border-amber-200',
  UNITS: 'bg-sky-50 text-sky-700 border-sky-200',
  DETAILS: 'bg-slate-50 text-slate-600 border-slate-200',
};
const AREA_LABEL: Record<ProjectActivityEvent['area'], string> = {
  PRICING: 'Price',
  UNITS: 'Unit',
  DETAILS: 'Details',
};

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export const ProjectActivityTab: React.FC<{ projectId: number }> = ({ projectId }) => {
  const { fetchWithAuth } = useAuth();
  const { showError } = useToast();
  const [events, setEvents] = useState<ProjectActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [area, setArea] = useState<AreaFilter>('ALL');

  useEffect(() => {
    setLoading(true);
    listProjectActivity(fetchWithAuth, projectId)
      .then((r) => setEvents(r.events))
      .catch(() => showError({ message: 'Failed to load the project history' }))
      .finally(() => setLoading(false));
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(
    () => (area === 'ALL' ? events : events.filter((e) => e.area === area)),
    [events, area],
  );

  if (loading) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="animate-spin text-navy-400" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-black text-slate-800">History</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Every change made after MD approval, with who made it, when and why. Price changes on an
          approved project always carry a reason and are sent to the MD.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {AREAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setArea(a.id)}
            className={`px-3 py-1 rounded-full text-xs font-bold border ${
              area === a.id
                ? 'bg-navy-700 text-white border-navy-700'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="py-12 text-center text-slate-400">
          <HistoryIcon size={32} className="mx-auto mb-2 opacity-40" />
          <p className="font-bold text-slate-500">No changes recorded yet</p>
          <p className="text-xs mt-1">
            Changes to an approved project's details, prices and units appear here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white">
          {shown.map((e) => (
            <li key={e.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`px-1.5 py-0.5 rounded border text-[10px] font-black uppercase tracking-wide ${AREA_CHIP[e.area]}`}
                >
                  {AREA_LABEL[e.area]}
                </span>
                <span className="text-sm font-bold text-slate-800 break-words">{e.field}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
                <span className="text-slate-500 line-through decoration-slate-300 break-all">
                  {e.before ?? '—'}
                </span>
                <ArrowRight size={14} className="text-slate-400 shrink-0" />
                <span className="font-bold text-slate-900 break-all">{e.after ?? '—'}</span>
              </div>
              {e.reason && (
                <p className="mt-1 text-xs text-slate-600">
                  <span className="font-bold">Reason:</span> {e.reason}
                </p>
              )}
              <p className="mt-1 text-[11px] text-slate-400">
                by {e.actor_name || 'Unknown user'} · {when(e.created_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
