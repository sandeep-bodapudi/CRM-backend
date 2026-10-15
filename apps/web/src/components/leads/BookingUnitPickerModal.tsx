import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';
import { handleApiError, toUserFacingError } from '../../utils/userFacingError';

interface OppRow {
  id: number;
  lead_id?: number;
  project_id?: number | null;
  property_id?: number | null;
  project_unit_id?: number | null;
  expected_value?: number | null;
}
interface UnitRow {
  id: number;
  unit_code: string;
  unit_number: string;
  final_price?: number;
}

interface Props {
  lead: { id: number; customer_name: string };
  onClose: () => void;
  /** The deal now names a unit and a value; the caller moves the lead to Booking initiated. */
  onConfirmed: () => void | Promise<void>;
}

/**
 * Booking initiated needs the Opportunity to name the unit being booked and
 * its value. Negotiation can be reached with only an estimate and no unit
 * (project visit where nothing was picked yet; a lead added at Negotiation),
 * so the unit is chosen here, at the point it is really needed.
 */
export const BookingUnitPickerModal: React.FC<Props> = ({ lead, onClose, onConfirmed }) => {
  const { fetchWithAuth } = useAuth();
  const { showError } = useToast();
  const [opp, setOpp] = useState<OppRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [projectId, setProjectId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [oppRes, projRes] = await Promise.all([
          fetchWithAuth(`${API_BASE_URL}/opportunities`),
          fetchWithAuth(`${API_BASE_URL}/projects?limit=200`),
        ]);
        const oppData = oppRes.ok ? await oppRes.json() : { opportunities: [] };
        const projData = projRes.ok ? await projRes.json() : { projects: [] };
        if (cancelled) return;
        const mine = ((oppData.opportunities || []) as OppRow[])
          .filter((o) => o.lead_id === lead.id)
          .sort((a, b) => b.id - a.id)[0];
        setOpp(mine || null);
        setProjects((projData.projects || []).map((p: any) => ({ id: p.id, name: p.name })));
        if (mine?.project_id) setProjectId(String(mine.project_id));
        if (mine?.project_unit_id) setUnitId(String(mine.project_unit_id));
        if (mine?.expected_value) setValue(String(mine.expected_value));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  useEffect(() => {
    setUnits([]);
    if (!projectId) return;
    let cancelled = false;
    fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/units?limit=200`)
      .then(async (res) => (res.ok ? (await res.json()).units || [] : []))
      .then((u) => !cancelled && setUnits(u))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const hasProperty = !!opp?.property_id && !unitId;
  const canConfirm = !!opp && (!!unitId || hasProperty) && Number(value) > 0;

  const pickUnit = (id: string) => {
    setUnitId(id);
    const u = units.find((x) => String(x.id) === id);
    if (u?.final_price && u.final_price > 0) setValue(String(u.final_price));
  };

  const confirm = async () => {
    if (!opp || !canConfirm) return;
    setBusy(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/opportunities/${opp.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(projectId ? { project_id: parseInt(projectId, 10) } : {}),
          ...(unitId ? { project_unit_id: parseInt(unitId, 10) } : {}),
          expected_value: Number(value),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await handleApiError(res, showError, data);
        return;
      }
      await onConfirmed();
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    'w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-600 font-bold text-slate-800';

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/80 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-slate-100 relative max-h-[90dvh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
        >
          <X className="w-5 h-5" />
        </button>
        <h3 className="font-bold text-slate-800 text-lg mb-1">Which unit is being booked?</h3>
        <p className="text-xs text-slate-500 mb-4">
          Booking for <strong className="text-slate-800">{lead.customer_name}</strong> needs the
          unit and the agreed value.
        </p>

        {loading ? (
          <p className="text-sm text-slate-400 py-6 text-center">Loading...</p>
        ) : !opp ? (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
            This lead has no sales opportunity yet. Move it to Negotiation first.
          </p>
        ) : (
          <div className="space-y-4">
            {hasProperty && (
              <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                A property is already chosen for this deal. Confirm the value, or pick a project
                unit instead.
              </p>
            )}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Project
              </label>
              <select
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setUnitId('');
                }}
                className={inputCls}
              >
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Unit
              </label>
              <select
                value={unitId}
                onChange={(e) => pickUnit(e.target.value)}
                disabled={!projectId}
                className={inputCls}
              >
                <option value="">{projectId ? 'Select unit' : 'Choose a project first'}</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.unit_number} ({u.unit_code})
                    {u.final_price ? ` - Rs ${(u.final_price / 100000).toFixed(1)}L` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Agreed deal value (Rs)
              </label>
              <input
                type="number"
                min={1}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={!canConfirm || busy}
                className="px-5 py-2 bg-navy-700 hover:bg-navy-800 disabled:bg-slate-300 text-white font-extrabold text-xs rounded-xl shadow-md"
              >
                {busy ? 'Saving...' : 'Confirm & Move to Booking'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
