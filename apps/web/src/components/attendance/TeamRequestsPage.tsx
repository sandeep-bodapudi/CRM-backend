import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, MapPin } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';

interface Evidence {
  calls: number;
  activities: number;
  first_activity: string | null;
  last_activity: string | null;
  visits_completed: number;
  attendance: { check_in_at: string; check_out_at: string | null; source: string } | null;
}
interface TeamRequest {
  id: number;
  type: string;
  date: string;
  reason: string;
  employee_id: number;
  employee_name: string | null;
  evidence: Evidence | null;
}
interface Checkin {
  id: number;
  employee_name: string | null;
  place_type: string;
  latitude: number | null;
  longitude: number | null;
  distance_m: number | null;
  flags: string[];
  ai_note: string | null;
  created_at: string;
  selfie: string;
  surroundings: string;
}
interface Person {
  id: number;
  name: string;
  employee_code: string;
  weekly_off_day: number | null;
  roles: string[];
}

const TYPE_NAME: Record<string, string> = {
  DUTY_DAY: 'Work on an off day',
  SWAP_OFF: 'Week-off swap (day off)',
  COMP_OFF: 'Use a comp-off',
  ATTENDANCE_CLAIM: 'Mark attendance (missed check-in)',
};
const time = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString('en-IN', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata',
      })
    : '—';

/** A photo behind the login: fetched with the session and shown as a blob. */
const ProofPhoto: React.FC<{ path: string; label: string }> = ({ path, label }) => {
  const { fetchWithAuth } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let gone = false;
    let made: string | null = null;
    fetchWithAuth(`${API_BASE_URL}${path}`)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (b && !gone) {
          made = URL.createObjectURL(b);
          setUrl(made);
        }
      })
      .catch(() => {});
    return () => {
      gone = true;
      if (made) URL.revokeObjectURL(made);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  return (
    <figure className="space-y-1">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img
            src={url}
            alt={label}
            className="w-full aspect-[3/4] object-cover rounded-xl border"
          />
        </a>
      ) : (
        <div className="w-full aspect-[3/4] rounded-xl bg-slate-100" />
      )}
      <figcaption className="text-[10px] text-slate-500 text-center">{label}</figcaption>
    </figure>
  );
};

/**
 * The reporting manager's queue (HR / MD see the whole company): duty days,
 * week-off swaps, comp-offs and missed-attendance requests, with that day's CRM
 * work as evidence; phone check-ins the system was unsure about, with both photos
 * and where the phone was; putting the team on duty; and (HR) weekly offs and
 * office locations.
 */
export const TeamRequestsPage: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();
  const [tab, setTab] = useState<'REQUESTS' | 'CHECKINS' | 'DUTY' | 'WEEKOFFS'>('REQUESTS');
  const [requests, setRequests] = useState<TeamRequest[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [weekdays, setWeekdays] = useState<string[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [branches, setBranches] = useState<
    { id: number; name: string; latitude: number | null; longitude: number | null }[]
  >([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [dutyDate, setDutyDate] = useState('');
  const [dutyReason, setDutyReason] = useState('');
  const [dutyPick, setDutyPick] = useState<number[]>([]);

  const load = useCallback(async () => {
    const [q, w, b] = await Promise.all([
      fetchWithAuth(`${API_BASE_URL}/attendance/team-requests`).then((r) =>
        r.ok ? r.json() : { requests: [], checkins: [] },
      ),
      fetchWithAuth(`${API_BASE_URL}/attendance/weekly-offs`).then((r) =>
        r.ok ? r.json() : { employees: [], weekdays: [] },
      ),
      fetchWithAuth(`${API_BASE_URL}/attendance/branches`).then((r) =>
        r.ok ? r.json() : { branches: [] },
      ),
    ]);
    setRequests(q.requests || []);
    setCheckins(q.checkins || []);
    setPeople(w.employees || []);
    setWeekdays(w.weekdays || []);
    setCanEdit(!!w.can_edit);
    setBranches(b.branches || []);
  }, [fetchWithAuth]);

  useEffect(() => {
    load();
  }, [load]);

  const post = async (url: string, body: object, method = 'POST') => {
    const res = await fetchWithAuth(`${API_BASE_URL}${url}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      showError(d.error || 'Could not save.');
      return false;
    }
    showToast(d.message || 'Saved', 'success');
    await load();
    return true;
  };

  const tabs: [typeof tab, string][] = [
    ['REQUESTS', `Requests (${requests.length})`],
    ['CHECKINS', `Check-ins to review (${checkins.length})`],
    ['DUTY', 'Put on duty'],
    ['WEEKOFFS', 'Weekly offs'],
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-navy-100 text-navy-700 flex items-center justify-center">
          <ClipboardCheck className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team requests</h1>
          <p className="text-sm text-slate-500">
            Duty days, swaps, comp-offs, missed check-ins and phone check-ins of your team.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-3 py-2 rounded-xl text-xs font-bold border ${tab === k ? 'bg-navy-900 text-white border-navy-900' : 'bg-white text-slate-700 border-slate-300'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'REQUESTS' && (
        <div className="space-y-3">
          {requests.length === 0 && <p className="text-sm text-slate-400">Nothing waiting.</p>}
          {requests.map((r) => (
            <div key={r.id} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-bold text-slate-800">
                  {r.employee_name} · {TYPE_NAME[r.type] || r.type}
                </p>
                <p className="text-sm font-semibold text-slate-600">
                  {new Date(r.date + 'T00:00:00').toLocaleDateString('en-IN', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                </p>
              </div>
              <p className="text-sm text-slate-600">{r.reason}</p>
              {r.evidence && (
                <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                  That day in the CRM: {r.evidence.calls} calls, {r.evidence.activities} actions
                  {r.evidence.first_activity
                    ? ` (${time(r.evidence.first_activity)} – ${time(r.evidence.last_activity)})`
                    : ''}
                  , {r.evidence.visits_completed} visits completed.
                  {r.evidence.attendance
                    ? ` Attendance: in ${time(r.evidence.attendance.check_in_at)} (${r.evidence.attendance.source}).`
                    : ' No attendance yet.'}
                </p>
              )}
              <div className="flex gap-2">
                <input
                  value={notes[`r${r.id}`] || ''}
                  onChange={(e) => setNotes({ ...notes, [`r${r.id}`]: e.target.value })}
                  placeholder="Note (optional)"
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-xs"
                />
                <button
                  onClick={() =>
                    post(`/attendance/team-requests/${r.id}/decide`, {
                      action: 'REJECT',
                      note: notes[`r${r.id}`],
                    })
                  }
                  className="px-3 py-2 rounded-xl border border-rose-300 text-rose-700 text-xs font-bold"
                >
                  Reject
                </button>
                <button
                  onClick={() =>
                    post(`/attendance/team-requests/${r.id}/decide`, {
                      action: 'APPROVE',
                      note: notes[`r${r.id}`],
                    })
                  }
                  className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"
                >
                  Approve
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'CHECKINS' && (
        <div className="space-y-3">
          {checkins.length === 0 && (
            <p className="text-sm text-slate-400">No phone check-ins waiting for a check.</p>
          )}
          {checkins.map((c) => (
            <div key={c.id} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-bold text-slate-800">
                  {c.employee_name} · {c.place_type === 'OFFICE' ? 'Office' : 'Field'} ·{' '}
                  {time(c.created_at)}
                </p>
                {c.latitude !== null && c.longitude !== null && (
                  <a
                    href={`https://www.google.com/maps?q=${c.latitude},${c.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-bold text-navy-700 flex items-center gap-1"
                  >
                    <MapPin className="w-3.5 h-3.5" /> Where the phone was
                    {c.distance_m !== null ? ` (${c.distance_m} m away)` : ''}
                  </a>
                )}
              </div>
              <ul className="text-xs text-amber-800 list-disc pl-5">
                {c.flags.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              {c.ai_note && <p className="text-[11px] text-slate-500">{c.ai_note}</p>}
              <div className="grid grid-cols-2 gap-3 max-w-sm">
                <ProofPhoto path={c.selfie} label="Selfie" />
                <ProofPhoto path={c.surroundings} label="Surroundings" />
              </div>
              <div className="flex gap-2">
                <input
                  value={notes[`c${c.id}`] || ''}
                  onChange={(e) => setNotes({ ...notes, [`c${c.id}`]: e.target.value })}
                  placeholder="Note (optional)"
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-xs"
                />
                <button
                  onClick={() =>
                    post(`/attendance/checkin-proofs/${c.id}/review`, {
                      action: 'REJECT',
                      note: notes[`c${c.id}`],
                    })
                  }
                  className="px-3 py-2 rounded-xl border border-rose-300 text-rose-700 text-xs font-bold"
                >
                  Reject (absent)
                </button>
                <button
                  onClick={() =>
                    post(`/attendance/checkin-proofs/${c.id}/review`, {
                      action: 'ACCEPT',
                      note: notes[`c${c.id}`],
                    })
                  }
                  className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"
                >
                  Accept
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'DUTY' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
          <p className="text-sm text-slate-600">
            Put people on duty on their week off or a holiday (for example weekend site visits).
            They are told, can check in with a selfie, and earn a comp-off day.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="date"
              value={dutyDate}
              onChange={(e) => setDutyDate(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-xl text-sm"
            />
            <input
              value={dutyReason}
              onChange={(e) => setDutyReason(e.target.value)}
              placeholder="Why? e.g. Sunday site visits at Lakeside"
              className="px-3 py-2 border border-slate-300 rounded-xl text-sm"
            />
          </div>
          <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
            {people.map((x) => (
              <label key={x.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={dutyPick.includes(x.id)}
                  onChange={(e) =>
                    setDutyPick(
                      e.target.checked ? [...dutyPick, x.id] : dutyPick.filter((i) => i !== x.id),
                    )
                  }
                />
                <span className="font-semibold text-slate-800">{x.name}</span>
                <span className="text-[11px] text-slate-500">
                  week off: {x.weekly_off_day === null ? 'none' : weekdays[x.weekly_off_day]}
                </span>
              </label>
            ))}
          </div>
          <button
            onClick={async () => {
              if (
                await post('/attendance/duty-days/assign', {
                  employee_ids: dutyPick,
                  date: dutyDate,
                  reason: dutyReason,
                })
              )
                setDutyPick([]);
            }}
            disabled={!dutyDate || dutyReason.trim().length < 3 || dutyPick.length === 0}
            className="w-full py-2.5 rounded-xl bg-navy-900 text-white text-sm font-black disabled:opacity-40"
          >
            Put {dutyPick.length || ''} on duty
          </button>
        </div>
      )}

      {tab === 'WEEKOFFS' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2">Person</th>
                  <th className="text-left px-3 py-2">Role</th>
                  <th className="text-left px-3 py-2">Weekly off</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {people.map((x) => (
                  <tr key={x.id}>
                    <td className="px-3 py-2 font-semibold text-slate-800">{x.name}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{x.roles.join(', ')}</td>
                    <td className="px-3 py-2">
                      {canEdit ? (
                        <select
                          value={x.weekly_off_day === null ? '' : String(x.weekly_off_day)}
                          onChange={(e) =>
                            post(
                              `/attendance/weekly-offs/${x.id}`,
                              {
                                weekly_off_day:
                                  e.target.value === '' ? null : Number(e.target.value),
                              },
                              'PATCH',
                            )
                          }
                          className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
                        >
                          {weekdays.map((d, i) => (
                            <option key={d} value={i}>
                              {d}
                            </option>
                          ))}
                          <option value="">No fixed day</option>
                        </select>
                      ) : (
                        <span>
                          {x.weekly_off_day === null ? 'No fixed day' : weekdays[x.weekly_off_day]}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
              <p className="font-bold text-slate-800 text-sm">
                Office locations (for phone check-ins)
              </p>
              <p className="text-xs text-slate-500">
                Stand at the office and tap “Use my location here”. A phone check-in more than 300 m
                away is flagged for the manager.
              </p>
              {branches.map((b) => (
                <div
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2"
                >
                  <span className="text-sm text-slate-700">
                    {b.name}{' '}
                    <span className="text-[11px] text-slate-500">
                      {b.latitude !== null
                        ? `(${b.latitude.toFixed(5)}, ${b.longitude?.toFixed(5)})`
                        : '(not set)'}
                    </span>
                  </span>
                  <button
                    onClick={() =>
                      navigator.geolocation?.getCurrentPosition(
                        (pos) =>
                          post(
                            `/attendance/branches/${b.id}/location`,
                            { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
                            'PATCH',
                          ),
                        () => showError('Turn on location for this browser first.'),
                        { enableHighAccuracy: true, timeout: 15000 },
                      )
                    }
                    className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold flex items-center gap-1"
                  >
                    <MapPin className="w-3.5 h-3.5" /> Use my location here
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
