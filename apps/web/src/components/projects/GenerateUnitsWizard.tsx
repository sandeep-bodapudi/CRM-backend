import React, { useRef, useState } from 'react';
import { X, Loader2, CheckCircle2, Wand2, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { FieldLabel, inputCls, selectCls } from '../properties/propertyWizardShared';
import {
  generateProjectUnits,
  previewUnitPrice,
  ProjectUnitInput,
  UnitType,
} from '../../api/projectUnits';

// "Generate many" (implementation plan section 7.2) — replaces BulkUnitWizard's
// client-computed grid. Each row prices independently through the server's
// preview endpoint (debounced), so changing one row's facing/corner updates
// only that row's price — the concrete fix for "each unit has different
// charges like east facing charges".

interface GenerateUnitsWizardProps {
  projectId: number;
  projectName: string;
  onClose: () => void;
  onSuccess: () => void;
}

const FACING_OPTIONS = [
  'EAST',
  'WEST',
  'NORTH',
  'SOUTH',
  'NORTH_EAST',
  'NORTH_WEST',
  'SOUTH_EAST',
  'SOUTH_WEST',
];

type GenMode = 'FLAT' | 'PLOT' | 'VILLA';

interface Row {
  id: string;
  unit_number: string;
  plot_number?: string;
  tower?: string;
  floor?: number;
  flat_number?: string;
  villa_number?: string;
  type_code?: string;
  plot_area_sqyd?: number | null;
  built_up_area_sqft?: number | null;
  super_built_up_area_sqft?: number | null;
  facing?: string;
  is_corner?: boolean;
  price?: number | null;
  previewing?: boolean;
  error?: string;
}

export const GenerateUnitsWizard: React.FC<GenerateUnitsWizardProps> = ({
  projectId,
  projectName,
  onClose,
  onSuccess,
}) => {
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();

  const [mode, setMode] = useState<GenMode>('PLOT');
  const [rows, setRows] = useState<Row[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    created: number;
    total: number;
    failed: { index: number; error: string }[];
  } | null>(null);

  // Config per mode. Only `block` has a real home on ProjectUnit — unlike the
  // old BulkUnitWizard, there is no unit-level "phase" field (that's
  // Project.project_phase, a project-wide setting, not per-unit).
  const [block, setBlock] = useState('');
  const [plotPrefix, setPlotPrefix] = useState('Plot-');
  const [plotStart, setPlotStart] = useState(1);
  const [plotCount, setPlotCount] = useState(10);
  const [plotDefaultArea, setPlotDefaultArea] = useState<number | ''>('');

  const [towerName, setTowerName] = useState('A');
  const [floorsCount, setFloorsCount] = useState(5);
  const [unitsPerFloor, setUnitsPerFloor] = useState(4);
  const [flatDefaultArea, setFlatDefaultArea] = useState<number | ''>('');

  const [villaPrefix, setVillaPrefix] = useState('V-');
  const [villaCount, setVillaCount] = useState(10);
  const [villaTypeCode, setVillaTypeCode] = useState('Type A');
  const [villaDefaultArea, setVillaDefaultArea] = useState<number | ''>('');

  const rowToInput = (
    r: Row,
  ): Partial<ProjectUnitInput> & { unit_type: UnitType; unit_number: string } => {
    if (mode === 'PLOT') {
      return {
        unit_type: 'PLOT',
        unit_number: r.unit_number,
        plot_number: r.plot_number,
        plot_area_sqyd: r.plot_area_sqyd,
        price_basis: 'PLOT_AREA',
        facing: r.facing || null,
        is_corner: !!r.is_corner,
      };
    }
    if (mode === 'FLAT') {
      return {
        unit_type: 'FLAT',
        unit_number: r.unit_number,
        tower: r.tower,
        floor: r.floor,
        flat_number: r.flat_number,
        super_built_up_area_sqft: r.super_built_up_area_sqft,
        price_basis: 'SUPER_BUILT_UP',
        facing: r.facing || null,
        is_corner: !!r.is_corner,
      };
    }
    return {
      unit_type: 'VILLA',
      unit_number: r.unit_number,
      villa_number: r.villa_number,
      type_code: r.type_code,
      plot_area_sqyd: r.plot_area_sqyd,
      built_up_area_sqft: r.built_up_area_sqft,
      price_basis: 'BUILT_UP',
      facing: r.facing || null,
      is_corner: !!r.is_corner,
    };
  };

  const generateRows = () => {
    let generated: Row[] = [];
    if (mode === 'PLOT') {
      generated = Array.from({ length: plotCount }, (_, i) => {
        const num = plotStart + i;
        return {
          id: `r${i}`,
          unit_number: `${plotPrefix}${num}`,
          plot_number: String(num),
          plot_area_sqyd: plotDefaultArea || null,
        };
      });
    } else if (mode === 'FLAT') {
      generated = [];
      for (let f = 1; f <= floorsCount; f++) {
        for (let u = 1; u <= unitsPerFloor; u++) {
          const flatNo = `${towerName}-${f}${String(u).padStart(2, '0')}`;
          generated.push({
            id: `r${f}-${u}`,
            unit_number: flatNo,
            tower: towerName,
            floor: f,
            flat_number: flatNo,
            super_built_up_area_sqft: flatDefaultArea || null,
          });
        }
      }
    } else {
      generated = Array.from({ length: villaCount }, (_, i) => {
        const num = i + 1;
        return {
          id: `r${i}`,
          unit_number: `${villaPrefix}${num}`,
          villa_number: `${villaPrefix}${num}`,
          type_code: villaTypeCode,
          plot_area_sqyd: villaDefaultArea || null,
        };
      });
    }
    setRows(generated);
    setResult(null);

    // Price every row that already has a default area filled in — no need to
    // wait for the admin to touch each row individually.
    generated.forEach((r) => {
      const hasArea = mode === 'FLAT' ? !!r.super_built_up_area_sqft : !!r.plot_area_sqyd;
      if (!hasArea) return;
      setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, previewing: true } : x)));
      previewUnitPrice(fetchWithAuth, projectId, rowToInput(r) as any)
        .then(({ computation }) =>
          setRows((rs) =>
            rs.map((x) =>
              x.id === r.id ? { ...x, price: computation.calculated_price, previewing: false } : x,
            ),
          ),
        )
        .catch(() =>
          setRows((rs) =>
            rs.map((x) =>
              x.id === r.id ? { ...x, previewing: false, error: 'Preview failed' } : x,
            ),
          ),
        );
    });
  };

  // Per-row debounce timers, keyed by row id — each row prices independently
  // of every other row (the concrete fix for "east facing charges differ per
  // unit"), so one row's edit must never cancel or delay another's preview.
  const previewTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const updateRow = (id: string, patch: Partial<Row>) => {
    const merged = { ...(rows.find((r) => r.id === id) as Row), ...patch };
    setRows((prev) => prev.map((r) => (r.id === id ? merged : r)));

    if (previewTimers.current[id]) clearTimeout(previewTimers.current[id]);
    const hasArea = mode === 'FLAT' ? !!merged.super_built_up_area_sqft : !!merged.plot_area_sqyd;
    if (!hasArea) {
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, price: null, previewing: false } : r)));
      return;
    }
    previewTimers.current[id] = setTimeout(() => {
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, previewing: true } : r)));
      previewUnitPrice(fetchWithAuth, projectId, rowToInput(merged) as any)
        .then(({ computation }) =>
          setRows((rs) =>
            rs.map((r) =>
              r.id === id
                ? { ...r, price: computation.calculated_price, previewing: false, error: undefined }
                : r,
            ),
          ),
        )
        .catch(() =>
          setRows((rs) =>
            rs.map((r) => (r.id === id ? { ...r, previewing: false, error: 'Preview failed' } : r)),
          ),
        );
    }, 400);
  };

  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

  const handleSubmit = async () => {
    if (rows.length === 0) {
      showError({ message: 'Generate rows first' });
      return;
    }
    setSubmitting(true);
    try {
      const common: Partial<ProjectUnitInput> = {};
      if (block) common.block = block;
      const res = await generateProjectUnits(fetchWithAuth, projectId, {
        common,
        units: rows.map((r) => rowToInput(r) as any),
      });
      setResult(res);
      if (res.failed.length === 0) {
        showToast(res.message, 'success');
        onSuccess();
      } else {
        showToast(`${res.created} of ${res.total} created — see errors below`, 'error');
      }
    } catch (err: any) {
      showError({ message: err?.message || 'Failed to generate units' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-5xl bg-white rounded-3xl shadow-2xl border border-slate-100 flex flex-col max-h-[92vh] animate-scaleUp">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-black text-slate-800">Generate Units</h2>
            <p className="text-xs text-slate-500">
              Bulk-create units in <span className="font-bold text-navy-700">{projectName}</span> —
              each row prices independently from the server.
            </p>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar space-y-5 flex-1">
          <div>
            <FieldLabel required>Unit Type</FieldLabel>
            <div className="grid grid-cols-3 gap-2 max-w-md">
              {(['PLOT', 'FLAT', 'VILLA'] as GenMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m);
                    setRows([]);
                  }}
                  className={`p-2.5 rounded-xl border text-xs font-bold ${mode === m ? 'bg-navy-700 text-white border-navy-700' : 'bg-white border-slate-200 text-slate-600 hover:border-navy-300'}`}
                >
                  {m.charAt(0) + m.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <FieldLabel>Block</FieldLabel>
              <input
                className={inputCls}
                value={block}
                onChange={(e) => setBlock(e.target.value)}
                placeholder="Block A"
              />
            </div>
          </div>

          {mode === 'PLOT' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <FieldLabel>Prefix</FieldLabel>
                <input
                  className={inputCls}
                  value={plotPrefix}
                  onChange={(e) => setPlotPrefix(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>Start Number</FieldLabel>
                <input
                  className={inputCls}
                  type="number"
                  value={plotStart}
                  onChange={(e) => setPlotStart(parseInt(e.target.value, 10) || 1)}
                />
              </div>
              <div>
                <FieldLabel>Count</FieldLabel>
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  value={plotCount}
                  onChange={(e) => setPlotCount(parseInt(e.target.value, 10) || 1)}
                />
              </div>
              <div>
                <FieldLabel>Default Area (Sq.Yd)</FieldLabel>
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  value={plotDefaultArea}
                  onChange={(e) =>
                    setPlotDefaultArea(e.target.value === '' ? '' : parseFloat(e.target.value))
                  }
                />
              </div>
            </div>
          )}

          {mode === 'FLAT' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <FieldLabel>Tower</FieldLabel>
                <input
                  className={inputCls}
                  value={towerName}
                  onChange={(e) => setTowerName(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>Floors</FieldLabel>
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  value={floorsCount}
                  onChange={(e) => setFloorsCount(parseInt(e.target.value, 10) || 1)}
                />
              </div>
              <div>
                <FieldLabel>Units / Floor</FieldLabel>
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  value={unitsPerFloor}
                  onChange={(e) => setUnitsPerFloor(parseInt(e.target.value, 10) || 1)}
                />
              </div>
              <div>
                <FieldLabel>Default Super Built-up (sqft)</FieldLabel>
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  value={flatDefaultArea}
                  onChange={(e) =>
                    setFlatDefaultArea(e.target.value === '' ? '' : parseFloat(e.target.value))
                  }
                />
              </div>
            </div>
          )}

          {mode === 'VILLA' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <FieldLabel>Prefix</FieldLabel>
                <input
                  className={inputCls}
                  value={villaPrefix}
                  onChange={(e) => setVillaPrefix(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>Count</FieldLabel>
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  value={villaCount}
                  onChange={(e) => setVillaCount(parseInt(e.target.value, 10) || 1)}
                />
              </div>
              <div>
                <FieldLabel>Villa Type</FieldLabel>
                <input
                  className={inputCls}
                  value={villaTypeCode}
                  onChange={(e) => setVillaTypeCode(e.target.value)}
                  placeholder="Type A"
                />
              </div>
              <div>
                <FieldLabel>Default Plot Area (Sq.Yd)</FieldLabel>
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  value={villaDefaultArea}
                  onChange={(e) =>
                    setVillaDefaultArea(e.target.value === '' ? '' : parseFloat(e.target.value))
                  }
                />
              </div>
            </div>
          )}

          <button
            onClick={generateRows}
            className="flex items-center gap-1.5 px-4 py-2 bg-navy-700 hover:bg-navy-800 text-white text-xs font-bold rounded-xl"
          >
            <Wand2 className="w-3.5 h-3.5" /> Generate{' '}
            {mode === 'PLOT'
              ? plotCount
              : mode === 'FLAT'
                ? floorsCount * unitsPerFloor
                : villaCount}{' '}
            Rows
          </button>

          {rows.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {[
                        'Unit',
                        mode === 'FLAT' ? 'Floor' : 'Area (Sq.Yd)',
                        'Facing',
                        'Corner',
                        'Price',
                        '',
                      ].map((h) => (
                        <th
                          key={h}
                          className="text-left px-3 py-2 text-[10px] font-bold text-slate-500 uppercase"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-1.5 font-bold text-slate-700">{r.unit_number}</td>
                        <td className="px-3 py-1.5">
                          {mode === 'FLAT' ? (
                            <input
                              className={inputCls + ' !py-1 !text-xs w-16'}
                              type="number"
                              value={r.floor ?? ''}
                              onChange={(e) =>
                                updateRow(r.id, {
                                  floor: parseInt(e.target.value, 10) || undefined,
                                })
                              }
                            />
                          ) : (
                            <input
                              className={inputCls + ' !py-1 !text-xs w-24'}
                              type="number"
                              min={0}
                              value={
                                mode === 'VILLA'
                                  ? (r.plot_area_sqyd ?? '')
                                  : (r.plot_area_sqyd ?? '')
                              }
                              onChange={(e) =>
                                updateRow(r.id, {
                                  plot_area_sqyd:
                                    e.target.value === '' ? null : parseFloat(e.target.value),
                                })
                              }
                            />
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          <select
                            className={selectCls + ' !py-1 !text-xs'}
                            value={r.facing || ''}
                            onChange={(e) => updateRow(r.id, { facing: e.target.value })}
                          >
                            <option value="">Any</option>
                            {FACING_OPTIONS.map((f) => (
                              <option key={f} value={f}>
                                {f.replace(/_/g, '-')}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={!!r.is_corner}
                            onChange={(e) => updateRow(r.id, { is_corner: e.target.checked })}
                          />
                        </td>
                        <td className="px-3 py-1.5 font-bold text-navy-800 whitespace-nowrap">
                          {r.previewing ? (
                            <Loader2 className="w-3 h-3 animate-spin inline" />
                          ) : r.price != null ? (
                            `₹${r.price.toLocaleString('en-IN')}`
                          ) : r.error ? (
                            <span className="text-rose-500">{r.error}</span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          <button
                            onClick={() => removeRow(r.id)}
                            className="text-slate-300 hover:text-rose-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result && result.failed.length > 0 && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 space-y-1">
              <p className="font-bold">{result.failed.length} row(s) failed:</p>
              {result.failed.map((f) => (
                <p key={f.index}>
                  Row {f.index + 1}: {f.error}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-slate-100 bg-slate-50/80 flex justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-200 rounded-xl text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || rows.length === 0}
            className="flex items-center gap-2 px-6 py-2.5 bg-navy-700 hover:bg-navy-800 text-white font-bold rounded-xl shadow-lg disabled:opacity-60 text-sm"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" /> Create {rows.length} Unit(s)
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
