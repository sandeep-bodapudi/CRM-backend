import React, { useCallback, useEffect, useState } from 'react';
import { Gauge, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';
import { Roles } from '../../shared';
import { handleApiError, toUserFacingError } from '../../utils/userFacingError';
import { TargetBar, TargetProgressRow } from './MyTargetsCard';

interface Rule {
  id: number;
  role_name: string | null;
  employee_id: number | null;
  employee_name: string | null;
  metric: string;
  metric_label: string;
  period: 'DAY' | 'WEEK' | 'MONTH';
  value: number;
}
interface TeamRow {
  id: number;
  name: string;
  employee_code: string;
  roles: string[];
  progress: TargetProgressRow[];
}
interface PersonOption {
  id: number;
  fullName: string;
  employeeCode: string;
}

const PERIOD_WORD = { DAY: 'a day', WEEK: 'a week', MONTH: 'a month' } as const;
const SELECTABLE_ROLES = Object.values(Roles).filter(
  (r) => ![Roles.ADMIN, Roles.MD].includes(r as any),
);

/**
 * Measured targets: "N calls a day", "N visits a month"... for a role or one
 * person, counted from what the system recorded. A person's own target replaces
 * their role's for the same measure.
 */
export const MeasuredTargetsPanel: React.FC = () => {
  const { fetchWithAuth, user } = useAuth();
  const { showToast, showError } = useToast();
  const [rules, setRules] = useState<Rule[]>([]);
  const [metrics, setMetrics] = useState<{ key: string; label: string }[]>([]);
  const [team, setTeam] = useState<TeamRow[]>([]);
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [forWho, setForWho] = useState<'ROLE' | 'PERSON'>('ROLE');
  const [roleName, setRoleName] = useState('');
  const [personId, setPersonId] = useState('');
  const [metric, setMetric] = useState('CALLS');
  const [period, setPeriod] = useState<'DAY' | 'WEEK' | 'MONTH'>('DAY');
  const [value, setValue] = useState('');

  const topManagement = !!user?.roles?.some((r: string) =>
    [Roles.MD, Roles.ADMIN, Roles.MARKETING_DIRECTOR].includes(r as any),
  );

  const load = useCallback(async () => {
    try {
      const [rRes, tRes] = await Promise.all([
        fetchWithAuth(`${API_BASE_URL}/targets/rules`),
        fetchWithAuth(`${API_BASE_URL}/targets/progress/team`),
      ]);
      if (rRes.ok) {
        const d = await rRes.json();
        setRules(d.rules || []);
        setMetrics(d.metrics || []);
      }
      if (tRes.ok) setTeam((await tRes.json()).employees || []);
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth]);

  useEffect(() => {
    load();
    fetchWithAuth(`${API_BASE_URL}/employees`)
      .then((r) => (r.ok ? r.json() : { employees: [] }))
      .then((d) => setPeople(d.employees || []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/targets/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(forWho === 'ROLE'
            ? { role_name: roleName }
            : { employee_id: parseInt(personId, 10) }),
          metric,
          period,
          value: parseInt(value, 10),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return handleApiError(res, showError, data);
      showToast('Target saved', 'success');
      setValue('');
      await load();
    } catch (e) {
      showError(
        toUserFacingError({ message: e instanceof Error ? e.message : String(e), body: e }),
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm('Stop using this target? Past results are kept.')) return;
    const res = await fetchWithAuth(`${API_BASE_URL}/targets/rules/${id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return handleApiError(res, showError, data);
    showToast('Target removed', 'success');
    await load();
  };

  const canSave =
    !saving &&
    parseInt(value, 10) >= 1 &&
    (forWho === 'ROLE' ? !!roleName : !!personId) &&
    (forWho === 'PERSON' || topManagement);

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-5">
      <div className="flex items-center gap-2">
        <Gauge className="w-5 h-5 text-navy-700" />
        <div>
          <h2 className="text-base font-black text-navy-900">Targets (counted by the system)</h2>
          <p className="text-xs text-slate-500">
            Calls, visits and bookings are counted from what was recorded, never typed. A person's
            own target replaces their role's for the same measure. The week starts on Monday.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
        <label className="col-span-2 text-[11px] font-bold text-slate-600 uppercase">
          For
          <div className="mt-1 grid grid-cols-2 gap-1">
            {(['ROLE', 'PERSON'] as const).map((w) => (
              <button
                key={w}
                onClick={() => setForWho(w)}
                disabled={w === 'ROLE' && !topManagement}
                className={`py-2 rounded-lg text-xs font-bold border disabled:opacity-40 ${
                  forWho === w
                    ? 'bg-navy-900 text-white border-navy-900'
                    : 'bg-white text-slate-700 border-slate-300'
                }`}
              >
                {w === 'ROLE' ? 'Everyone in a role' : 'One person'}
              </button>
            ))}
          </div>
        </label>
        {forWho === 'ROLE' ? (
          <label className="col-span-2 text-[11px] font-bold text-slate-600 uppercase">
            Role
            <select
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              className="mt-1 w-full px-2 py-2 border border-slate-300 rounded-lg text-sm bg-white normal-case font-normal"
            >
              <option value="">Choose...</option>
              {SELECTABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="col-span-2 text-[11px] font-bold text-slate-600 uppercase">
            Person
            <select
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              className="mt-1 w-full px-2 py-2 border border-slate-300 rounded-lg text-sm bg-white normal-case font-normal"
            >
              <option value="">Choose...</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName || p.employeeCode} ({p.employeeCode})
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="col-span-2 text-[11px] font-bold text-slate-600 uppercase">
          Measure
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            className="mt-1 w-full px-2 py-2 border border-slate-300 rounded-lg text-sm bg-white normal-case font-normal"
          >
            {metrics.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] font-bold text-slate-600 uppercase">
          How many
          <input
            value={value}
            onChange={(e) => /^[0-9]*$/.test(e.target.value) && setValue(e.target.value)}
            inputMode="numeric"
            className="mt-1 w-full px-2 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </label>
        <label className="text-[11px] font-bold text-slate-600 uppercase">
          Per
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as 'DAY' | 'WEEK' | 'MONTH')}
            className="mt-1 w-full px-2 py-2 border border-slate-300 rounded-lg text-sm bg-white normal-case font-normal"
          >
            <option value="DAY">Day</option>
            <option value="WEEK">Week</option>
            <option value="MONTH">Month</option>
          </select>
        </label>
        <button
          onClick={save}
          disabled={!canSave}
          className="col-span-2 sm:col-span-1 py-2 rounded-lg bg-navy-900 text-white text-xs font-black flex items-center justify-center gap-1 disabled:opacity-40"
        >
          <Plus className="w-4 h-4" /> Set target
        </button>
      </div>

      <div>
        <h3 className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 mb-2">
          Current targets
        </h3>
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : rules.length === 0 ? (
          <p className="text-sm text-slate-400">No targets set yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0 text-sm">
                  <span className="font-bold text-slate-800">
                    {r.employee_name ? r.employee_name : `Everyone: ${r.role_name}`}
                  </span>
                  <span className="text-slate-600">
                    {' '}
                    · {r.value} {r.metric_label.toLowerCase()} {PERIOD_WORD[r.period]}
                  </span>
                </div>
                <button
                  onClick={() => remove(r.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-600"
                  aria-label="Remove target"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {team.length > 0 && (
        <div>
          <h3 className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 mb-2">
            Progress right now
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {team.map((t) => (
              <div key={t.id} className="border border-slate-200 rounded-xl p-3 space-y-2">
                <div>
                  <p className="text-sm font-bold text-slate-800">{t.name}</p>
                  <p className="text-[10px] text-slate-400">{t.roles.join(', ')}</p>
                </div>
                {t.progress.map((r) => (
                  <div key={r.metric + r.period}>
                    <p className="text-[10px] uppercase font-bold text-slate-400">
                      {r.period === 'DAY'
                        ? 'Today'
                        : r.period === 'WEEK'
                          ? 'This week'
                          : 'This month'}
                    </p>
                    <TargetBar row={r} compact />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
