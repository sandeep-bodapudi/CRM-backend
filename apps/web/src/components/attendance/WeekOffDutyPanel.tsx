import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Camera, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';
import { SelfieCheckInModal } from './SelfieCheckInModal';

export interface MyDays {
  date: string;
  weekly_off_day: number | null;
  weekly_off_name: string | null;
  today: { offDay: boolean; duty: boolean; label: string | null; holiday: string | null };
  can_selfie_checkin: boolean;
  field_day_today: boolean;
  log: { check_in_at: string; check_out_at: string | null; status: string; source: string } | null;
  proof: { id: number; review_status: string; flags: string[] } | null;
  comp_off: { available: number; pending: number; credits: { expires_at: string }[] };
  requests: { id: number; type: string; status: string; target_date: string; reason: string }[];
}

const TYPE_NAME: Record<string, string> = {
  DUTY_DAY: 'Duty day',
  SWAP_OFF: 'Swap: day off',
  COMP_OFF: 'Comp-off',
  ATTENDANCE_CLAIM: 'Mark my attendance',
};

export const useMyDays = () => {
  const { fetchWithAuth } = useAuth();
  return useQuery({
    queryKey: ['myDays'],
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE_URL}/attendance/my-days`);
      if (!res.ok) throw new Error('unavailable');
      return (await res.json()) as MyDays;
    },
    staleTime: 30_000,
    retry: false,
  });
};

type Form = 'DUTY' | 'SWAP' | 'COMP' | 'CLAIM' | null;

/** The person's own week-off, duty days, comp-off and missed-attendance requests. */
export const WeekOffDutyPanel: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const { data } = useMyDays();
  const [form, setForm] = useState<Form>(null);
  const [date, setDate] = useState('');
  const [date2, setDate2] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [selfieOpen, setSelfieOpen] = useState(false);

  if (!data) return null;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['myDays'] });

  const open = (f: Form) => {
    setForm(f);
    setDate('');
    setDate2('');
    setReason('');
  };

  const submit = async () => {
    setBusy(true);
    try {
      const path =
        form === 'DUTY'
          ? 'duty-request'
          : form === 'SWAP'
            ? 'swap-request'
            : form === 'COMP'
              ? 'comp-off-request'
              : 'claim-request';
      const body =
        form === 'SWAP' ? { work_date: date, off_date: date2, reason } : { date, reason };
      const res = await fetchWithAuth(`${API_BASE_URL}/attendance/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(d.error || d.details?.[0]?.message || 'Could not send the request.');
        return;
      }
      showToast(d.message || 'Sent to your manager', 'success');
      setForm(null);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const checkOut = async () => {
    const res = await fetchWithAuth(`${API_BASE_URL}/attendance/wfh/check-out`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return showError(d.error || 'Could not check out.');
    showToast('Checked out', 'success');
    refresh();
  };

  const appCheckedIn = data.log && data.log.source === 'APP_SELFIE' && !data.log.check_out_at;
  const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-xl text-sm';

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="w-5 h-5 text-navy-700" />
        <h2 className="text-base font-black text-navy-900">Week off, duty days and comp-off</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-[10px] font-bold uppercase text-slate-400">My weekly off</p>
          <p className="font-black text-slate-800">{data.weekly_off_name || 'No fixed day'}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-[10px] font-bold uppercase text-slate-400">Today</p>
          <p className="font-black text-slate-800">
            {data.today.duty ? 'Duty day' : data.today.offDay ? data.today.label : 'Working day'}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-[10px] font-bold uppercase text-slate-400">Comp-off days</p>
          <p className="font-black text-slate-800">
            {data.comp_off.available}
            {data.comp_off.credits[0] && (
              <span className="text-[11px] font-semibold text-slate-500">
                {' '}
                · first expires{' '}
                {new Date(data.comp_off.credits[0].expires_at).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
            )}
          </p>
        </div>
      </div>

      {data.can_selfie_checkin && (
        <button
          onClick={() => setSelfieOpen(true)}
          className="w-full py-3 rounded-2xl bg-emerald-600 text-white font-black text-sm flex items-center justify-center gap-2"
        >
          <Camera className="w-4 h-4" /> Check in with selfie (
          {data.today.duty ? 'duty day' : 'field day'})
        </button>
      )}
      {data.proof && data.proof.review_status === 'PENDING' && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          Checked in. Your manager will check the photos: {data.proof.flags.join('; ')}.
        </p>
      )}
      {appCheckedIn && (
        <button
          onClick={checkOut}
          className="w-full py-2.5 rounded-2xl border border-slate-300 text-sm font-bold flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" /> Check out
        </button>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(
          [
            ['DUTY', 'Work on an off day'],
            ['SWAP', 'Swap my week off'],
            ['COMP', 'Use a comp-off'],
            ['CLAIM', 'Mark my attendance'],
          ] as const
        ).map(([f, label]) => (
          <button
            key={f}
            onClick={() => open(f)}
            disabled={f === 'COMP' && data.comp_off.available < 1}
            className={`py-2 rounded-xl text-xs font-bold border disabled:opacity-40 ${form === f ? 'bg-navy-900 text-white border-navy-900' : 'bg-white text-slate-700 border-slate-300'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {form && (
        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <p className="text-[11px] text-slate-500">
            {form === 'DUTY' &&
              'Pick your week off or a holiday you will work. On that day you can check in with a selfie, and it earns a comp-off day.'}
            {form === 'SWAP' && 'Work on your week off, and take another day off instead.'}
            {form === 'COMP' && 'Take one comp-off day on a working day.'}
            {form === 'CLAIM' &&
              'You worked but could not check in (last 7 days). Your manager sees your work in the CRM that day.'}
          </p>
          <label className="block text-[11px] font-bold text-slate-600 uppercase">
            {form === 'SWAP' ? 'I will work on (my off day)' : 'Date'}
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputCls}
            />
          </label>
          {form === 'SWAP' && (
            <label className="block text-[11px] font-bold text-slate-600 uppercase">
              And take this day off instead
              <input
                type="date"
                value={date2}
                onChange={(e) => setDate2(e.target.value)}
                className={inputCls}
              />
            </label>
          )}
          <label className="block text-[11px] font-bold text-slate-600 uppercase">
            Why?
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              placeholder="e.g. Site visits at Lakeside"
              className={inputCls}
            />
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setForm(null)}
              className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={busy || !date || (form === 'SWAP' && !date2) || reason.trim().length < 3}
              className="flex-1 py-2 rounded-xl bg-navy-900 text-white text-xs font-black disabled:opacity-40"
            >
              Send to my manager
            </button>
          </div>
        </div>
      )}

      {data.requests.length > 0 && (
        <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl text-sm">
          {data.requests.slice(0, 12).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="text-slate-700">
                <span className="font-bold">{TYPE_NAME[r.type] || r.type}</span> ·{' '}
                {new Date(r.target_date).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  timeZone: 'Asia/Kolkata',
                })}
              </span>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${r.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' : r.status === 'REJECTED' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}
              >
                {r.status === 'PENDING'
                  ? 'Waiting'
                  : r.status === 'APPROVED'
                    ? 'Approved'
                    : 'Not approved'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {selfieOpen && <SelfieCheckInModal onClose={() => setSelfieOpen(false)} onDone={refresh} />}
    </section>
  );
};

/** A one-line reminder on dashboards when today is a duty day (or field day) not yet checked in. */
export const DutyTodayBanner: React.FC = () => {
  const { data } = useMyDays();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  if (!data || !data.can_selfie_checkin) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between gap-3 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-left"
      >
        <span className="text-sm font-bold text-emerald-800">
          {data.today.duty ? 'You are on duty today' : 'Field day today'} — check in with a selfie
        </span>
        <Camera className="w-5 h-5 text-emerald-700" />
      </button>
      {open && (
        <SelfieCheckInModal
          onClose={() => setOpen(false)}
          onDone={() => queryClient.invalidateQueries({ queryKey: ['myDays'] })}
        />
      )}
    </>
  );
};
