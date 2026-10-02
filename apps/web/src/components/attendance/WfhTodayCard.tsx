import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Home, LogIn, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';

interface WfhToday {
  date: string;
  wfh_today: boolean;
  day_type: 'WORK_FROM_HOME' | 'FIELD_WORK' | null;
  log: { check_in_at: string; check_out_at: string | null; status: string; source: string } | null;
}

const t = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });

/**
 * Shown on My Attendance only on an approved work-from-home or field-work day: check in
 * and out from the app instead of the office kiosk.
 */
export const WfhTodayCard: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [note, setNote] = useState('');

  const { data } = useQuery({
    queryKey: ['wfhToday'],
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE_URL}/attendance/wfh/today`);
      if (!res.ok) throw new Error('Failed');
      return (await res.json()) as WfhToday;
    },
    staleTime: 60 * 1000,
  });

  if (!data?.wfh_today) return null;

  const act = async (kind: 'check-in' | 'check-out') => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/attendance/wfh/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note.trim() ? { note: note.trim() } : {}),
      });
      const body = await res.json().catch(() => ({}));
      setMessage({ ok: res.ok, text: body.message || body.error || (res.ok ? 'Done' : 'Failed') });
      queryClient.invalidateQueries({ queryKey: ['wfhToday'] });
    } catch {
      setMessage({ ok: false, text: 'Network error, please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const log = data.log;
  const officeLog = log && log.source !== 'REMOTE' && log.source !== 'FIELD';
  const isField = data.day_type === 'FIELD_WORK';

  return (
    <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-5 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
          <Home className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold text-slate-800">
            {isField ? 'Field work today' : 'Working from home today'}
          </h3>
          <p className="text-xs text-slate-500">
            Check in and out here, and add what you did to the Work Log — your manager sees it on
            Team Today.
          </p>
        </div>
      </div>

      {log && (
        <p className="text-xs font-bold text-slate-600">
          In {t(log.check_in_at)}
          {log.check_out_at ? ` · Out ${t(log.check_out_at)}` : ''} ·{' '}
          {log.status.replace(/_/g, ' ').toLowerCase()}
          {officeLog ? ' (office kiosk)' : ''}
        </p>
      )}

      {(!log || (!log.check_out_at && !officeLog)) && (
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          placeholder={
            isField ? 'Where are you? e.g. Kukatpally site, client meeting' : 'Note (optional)'
          }
          className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
        />
      )}
      {!log && (
        <button
          disabled={busy}
          onClick={() => act('check-in')}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2"
        >
          <LogIn className="w-4 h-4" />{' '}
          {isField ? 'Check in (field work)' : 'Check in (work from home)'}
        </button>
      )}
      {log && !log.check_out_at && !officeLog && (
        <button
          disabled={busy}
          onClick={() => act('check-out')}
          className="w-full py-3 bg-navy-700 hover:bg-navy-800 disabled:bg-slate-300 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" /> Check out
        </button>
      )}

      {message && (
        <p className={`text-xs font-bold ${message.ok ? 'text-emerald-700' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
};
