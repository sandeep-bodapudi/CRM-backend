import React, { useEffect, useState } from 'react';
import { Loader2, Activity as ActivityIcon, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { listProjectActivity, ProjectActivityEvent } from '../../api/projectMedia';

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'created the project',
  UPDATE: 'updated the project',
  DELETE: 'deleted the project',
  REASSIGN: 'reassigned the project',
};

export const ProjectActivityTab: React.FC<{ projectId: number }> = ({ projectId }) => {
  const { fetchWithAuth } = useAuth();
  const { showError } = useToast();
  const [events, setEvents] = useState<ProjectActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    listProjectActivity(fetchWithAuth, projectId)
      .then((r) => setEvents(r.events))
      .catch(() => showError({ message: 'Failed to load activity' }))
      .finally(() => setLoading(false));
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="animate-spin text-navy-400" size={28} />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="py-16 text-center text-slate-400">
        <ActivityIcon size={32} className="mx-auto mb-2 opacity-40" />
        <p className="font-bold text-slate-500">No activity recorded yet</p>
        <p className="text-xs mt-1">Changes to this project will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-0 relative pl-6">
      <div className="absolute left-[9px] top-2 bottom-2 w-px bg-slate-200" />
      {events.map((e) => (
        <div key={e.id} className="relative pb-6 last:pb-0">
          <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-navy-100 border-2 border-white ring-1 ring-slate-200 flex items-center justify-center">
            <User size={9} className="text-navy-600" />
          </div>
          <p className="text-sm text-slate-700">
            <span className="font-bold">{e.actor_name || 'Unknown user'}</span>{' '}
            {ACTION_LABELS[e.action] || e.action.toLowerCase().replace(/_/g, ' ')}
          </p>
          {e.metadata?.changes && (
            <p className="text-xs text-slate-500 mt-0.5">
              {Object.entries(e.metadata.changes).map(([field, val]: [string, any]) => (
                <span key={field} className="mr-2">
                  {field}: {String(val?.from ?? '—')} → {String(val?.to ?? '—')}
                </span>
              ))}
            </p>
          )}
          <p className="text-[11px] text-slate-400 mt-0.5">
            {new Date(e.created_at).toLocaleString('en-IN')}
          </p>
        </div>
      ))}
    </div>
  );
};
