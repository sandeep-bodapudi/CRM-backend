import React, { useEffect, useState } from 'react';
import { X, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  FieldLabel,
  inputCls,
  selectCls,
  BHK_OPTIONS,
  LISTING_TYPE_OPTIONS,
} from '../properties/propertyWizardShared';
import { formatAreaDual } from '../../utils/measurement';
import { CostSheet } from '../shared/CostSheet';
import {
  createProjectUnit,
  previewUnitPrice,
  ProjectUnitInput,
  UnitType,
  PriceComputation,
} from '../../api/projectUnits';
import { UNIT_TYPE_LABEL, PRICE_BASIS_BY_UNIT_TYPE, unitTypesForProject } from './unitTypeProfile';

// A dropdown with a free-text "Other" escape hatch (#14) — falls open to the
// text box automatically when the unit's current bhk value (legacy free
// text, or a value this list doesn't happen to cover) isn't one of the fixed
// options, so existing data is never silently hidden.
const BhkSelect: React.FC<{
  value: string | null | undefined;
  onChange: (v: string | null) => void;
}> = ({ value, onChange }) => {
  const isKnown = !value || BHK_OPTIONS.includes(value);
  const [showOther, setShowOther] = useState(!isKnown);
  return (
    <div>
      <FieldLabel>BHK</FieldLabel>
      <select
        className={selectCls}
        value={showOther ? 'OTHER' : value || ''}
        onChange={(e) => {
          if (e.target.value === 'OTHER') {
            setShowOther(true);
            onChange(null);
          } else {
            setShowOther(false);
            onChange(e.target.value || null);
          }
        }}
      >
        <option value="">Not specified</option>
        {BHK_OPTIONS.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value="OTHER">Other…</option>
      </select>
      {showOther && (
        <input
          className={`${inputCls} mt-2`}
          value={value || ''}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder="Enter BHK / configuration"
        />
      )}
    </div>
  );
};

// A single-unit add form. Deliberately does not collect an address anywhere —
// a unit always inherits the parent project's (spec section 28) — and always
// prices through the server preview endpoint, never client-side arithmetic
// (see services/pricing/engine.ts). The fuller "Add one / Generate many" flow
// with type-specific step branching is Phase 4's AddUnitsWizard; this covers
// the single-unit case so the Units tab is usable today.

interface AddUnitModalProps {
  projectId: number;
  projectName: string;
  /** Project.project_type — limits the unit types offered (a plotted venture only adds plots). */
  projectType?: string | null;
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

// Switching unit type starts from a clean form, so a plot's area never rides
// along into a flat's price (or the reverse). Only what every type shares is kept.
const freshForm = (unitType: UnitType, prev?: ProjectUnitInput): ProjectUnitInput => ({
  unit_number: prev?.unit_number ?? '',
  unit_type: unitType,
  price_basis: PRICE_BASIS_BY_UNIT_TYPE[unitType],
  facing: prev?.facing ?? null,
  listing_type: prev?.listing_type ?? null,
  base_rate: prev?.base_rate ?? null,
  discount_amount: prev?.discount_amount ?? null,
});

export const AddUnitModal: React.FC<AddUnitModalProps> = ({
  projectId,
  projectName,
  projectType,
  onClose,
  onSuccess,
}) => {
  const unitTypes = unitTypesForProject(projectType);
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();

  const [unitType, setUnitType] = useState<UnitType>(unitTypes[0]);
  const [form, setForm] = useState<ProjectUnitInput>(() => freshForm(unitTypes[0]));
  const [preview, setPreview] = useState<PriceComputation | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof ProjectUnitInput>(key: K, value: ProjectUnitInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    setForm((f) => (f.unit_type === unitType ? f : freshForm(unitType, f)));
  }, [unitType]);

  // Debounced live preview — the server is always the source of truth.
  useEffect(() => {
    const hasEnoughArea =
      form.plot_area_sqyd ||
      form.super_built_up_area_sqft ||
      form.built_up_area_sqft ||
      form.carpet_area_sqft ||
      form.area_value;
    if (!hasEnoughArea) {
      setPreview(null);
      return;
    }
    const t = setTimeout(() => {
      setPreviewLoading(true);
      previewUnitPrice(fetchWithAuth, projectId, form)
        .then(({ computation }) => setPreview(computation))
        .catch(() => setPreview(null))
        .finally(() => setPreviewLoading(false));
    }, 400);
    return () => clearTimeout(t);
  }, [projectId, form, fetchWithAuth]);

  const handleSubmit = async () => {
    if (!form.unit_number.trim()) {
      showError({ message: 'Unit number is required' });
      return;
    }
    setSubmitting(true);
    try {
      await createProjectUnit(fetchWithAuth, projectId, form);
      showToast(`Unit ${form.unit_number} created`, 'success');
      onSuccess();
    } catch (err: any) {
      showError({ message: err?.message || 'Failed to create unit' });
    } finally {
      setSubmitting(false);
    }
  };

  const areaSqft = form.plot_area_sqyd
    ? form.plot_area_sqyd * 9
    : form.super_built_up_area_sqft ||
      form.built_up_area_sqft ||
      form.carpet_area_sqft ||
      form.area_value ||
      0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-100 flex flex-col max-h-[92vh] animate-scaleUp">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-black text-slate-800">Add Unit</h2>
            <p className="text-xs text-slate-500">
              Inherits address from <span className="font-bold text-navy-700">{projectName}</span> —
              no location fields needed here.
            </p>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar space-y-5 flex-1">
          {unitTypes.length > 1 ? (
            <div>
              <FieldLabel required>Unit Type</FieldLabel>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {unitTypes.map((t) => (
                  <button
                    key={t}
                    onClick={() => setUnitType(t)}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-colors ${unitType === t ? 'bg-navy-700 text-white border-navy-700' : 'bg-white border-slate-200 text-slate-600 hover:border-navy-300'}`}
                  >
                    {UNIT_TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs font-bold text-slate-500">
              Unit type: <span className="text-slate-800">{UNIT_TYPE_LABEL[unitType]}</span>
            </p>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <FieldLabel required>Unit Number</FieldLabel>
              <input
                className={inputCls}
                value={form.unit_number}
                onChange={(e) => set('unit_number', e.target.value)}
                placeholder={
                  unitType === 'PLOT' ? 'P-001' : unitType === 'FLAT' ? 'A-101' : 'V-001'
                }
              />
            </div>

            {unitType === 'PLOT' && (
              <>
                <div>
                  <FieldLabel>Plot Number</FieldLabel>
                  <input
                    className={inputCls}
                    value={form.plot_number || ''}
                    onChange={(e) => set('plot_number', e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel>Survey Number</FieldLabel>
                  <input
                    className={inputCls}
                    value={form.survey_number || ''}
                    onChange={(e) => set('survey_number', e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel required>Plot Area (Sq.Yd)</FieldLabel>
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    value={form.plot_area_sqyd ?? ''}
                    onChange={(e) =>
                      set(
                        'plot_area_sqyd',
                        e.target.value === '' ? null : parseFloat(e.target.value),
                      )
                    }
                  />
                </div>
                <div>
                  <FieldLabel>Length (ft)</FieldLabel>
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    value={form.plot_length_ft ?? ''}
                    onChange={(e) =>
                      set(
                        'plot_length_ft',
                        e.target.value === '' ? null : parseFloat(e.target.value),
                      )
                    }
                  />
                </div>
                <div>
                  <FieldLabel>Width (ft)</FieldLabel>
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    value={form.plot_width_ft ?? ''}
                    onChange={(e) =>
                      set(
                        'plot_width_ft',
                        e.target.value === '' ? null : parseFloat(e.target.value),
                      )
                    }
                  />
                </div>
                <div>
                  <FieldLabel>Road Width (ft)</FieldLabel>
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    value={form.road_width_ft ?? ''}
                    onChange={(e) =>
                      set(
                        'road_width_ft',
                        e.target.value === '' ? null : parseFloat(e.target.value),
                      )
                    }
                  />
                </div>
              </>
            )}

            {unitType === 'FLAT' && (
              <>
                <div>
                  <FieldLabel>Tower</FieldLabel>
                  <input
                    className={inputCls}
                    value={form.tower || ''}
                    onChange={(e) => set('tower', e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel>Floor</FieldLabel>
                  <input
                    className={inputCls}
                    type="number"
                    value={form.floor ?? ''}
                    onChange={(e) =>
                      set('floor', e.target.value === '' ? null : parseInt(e.target.value, 10))
                    }
                  />
                </div>
                <div>
                  <FieldLabel>Flat Number</FieldLabel>
                  <input
                    className={inputCls}
                    value={form.flat_number || ''}
                    onChange={(e) => set('flat_number', e.target.value)}
                  />
                </div>
                <BhkSelect value={form.bhk} onChange={(v) => set('bhk', v)} />
                <div>
                  <FieldLabel>Bedrooms</FieldLabel>
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    value={form.bedrooms ?? ''}
                    onChange={(e) =>
                      set('bedrooms', e.target.value === '' ? null : parseInt(e.target.value, 10))
                    }
                  />
                </div>
                <div>
                  <FieldLabel>Bathrooms</FieldLabel>
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    value={form.bathrooms ?? ''}
                    onChange={(e) =>
                      set('bathrooms', e.target.value === '' ? null : parseInt(e.target.value, 10))
                    }
                  />
                </div>
                <div>
                  <FieldLabel>Balconies</FieldLabel>
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    value={form.balconies ?? ''}
                    onChange={(e) =>
                      set('balconies', e.target.value === '' ? null : parseInt(e.target.value, 10))
                    }
                  />
                </div>
                <div>
                  <FieldLabel required>Super Built-up Area (Sq.Ft)</FieldLabel>
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    value={form.super_built_up_area_sqft ?? ''}
                    onChange={(e) =>
                      set(
                        'super_built_up_area_sqft',
                        e.target.value === '' ? null : parseFloat(e.target.value),
                      )
                    }
                  />
                </div>
                <div>
                  <FieldLabel>View</FieldLabel>
                  <input
                    className={inputCls}
                    value={form.view || ''}
                    onChange={(e) => set('view', e.target.value)}
                    placeholder="Garden View"
                  />
                </div>
                <div>
                  <FieldLabel>Car Parks</FieldLabel>
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    value={form.parking_count ?? ''}
                    onChange={(e) =>
                      set(
                        'parking_count',
                        e.target.value === '' ? null : parseInt(e.target.value, 10),
                      )
                    }
                  />
                </div>
              </>
            )}

            {(unitType === 'VILLA' || unitType === 'HOUSE') && (
              <>
                <div>
                  <FieldLabel>{unitType === 'VILLA' ? 'Villa' : 'House'} Number</FieldLabel>
                  <input
                    className={inputCls}
                    value={form.villa_number || ''}
                    onChange={(e) => set('villa_number', e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel>Type Code</FieldLabel>
                  <input
                    className={inputCls}
                    value={form.type_code || ''}
                    onChange={(e) => set('type_code', e.target.value)}
                    placeholder="Type A"
                  />
                </div>
                <BhkSelect value={form.bhk} onChange={(v) => set('bhk', v)} />
                <div>
                  <FieldLabel>Plot Area (Sq.Yd)</FieldLabel>
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    value={form.plot_area_sqyd ?? ''}
                    onChange={(e) =>
                      set(
                        'plot_area_sqyd',
                        e.target.value === '' ? null : parseFloat(e.target.value),
                      )
                    }
                  />
                </div>
                <div>
                  <FieldLabel required>Built-up Area (sqft)</FieldLabel>
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    value={form.built_up_area_sqft ?? ''}
                    onChange={(e) =>
                      set(
                        'built_up_area_sqft',
                        e.target.value === '' ? null : parseFloat(e.target.value),
                      )
                    }
                  />
                </div>
                <div>
                  <FieldLabel>Ground Floor Area (sqft)</FieldLabel>
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    value={form.ground_floor_area_sqft ?? ''}
                    onChange={(e) =>
                      set(
                        'ground_floor_area_sqft',
                        e.target.value === '' ? null : parseFloat(e.target.value),
                      )
                    }
                  />
                </div>
                <div>
                  <FieldLabel>First Floor Area (sqft)</FieldLabel>
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    value={form.first_floor_area_sqft ?? ''}
                    onChange={(e) =>
                      set(
                        'first_floor_area_sqft',
                        e.target.value === '' ? null : parseFloat(e.target.value),
                      )
                    }
                  />
                </div>
                <div>
                  <FieldLabel>Bedrooms</FieldLabel>
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    value={form.bedrooms ?? ''}
                    onChange={(e) =>
                      set('bedrooms', e.target.value === '' ? null : parseInt(e.target.value, 10))
                    }
                  />
                </div>
                <div>
                  <FieldLabel>Bathrooms</FieldLabel>
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    value={form.bathrooms ?? ''}
                    onChange={(e) =>
                      set('bathrooms', e.target.value === '' ? null : parseInt(e.target.value, 10))
                    }
                  />
                </div>
                <div>
                  <FieldLabel>Parking (count)</FieldLabel>
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    value={form.parking_count ?? ''}
                    onChange={(e) =>
                      set(
                        'parking_count',
                        e.target.value === '' ? null : parseInt(e.target.value, 10),
                      )
                    }
                  />
                </div>
              </>
            )}

            {(unitType === 'COMMERCIAL' || unitType === 'OTHER') && (
              <>
                <div>
                  <FieldLabel required>Area</FieldLabel>
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    value={form.area_value ?? ''}
                    onChange={(e) =>
                      set('area_value', e.target.value === '' ? null : parseFloat(e.target.value))
                    }
                  />
                </div>
                <div>
                  <FieldLabel>Area Unit</FieldLabel>
                  <select
                    className={selectCls}
                    value={form.area_unit || 'SQFT'}
                    onChange={(e) => set('area_unit', e.target.value as any)}
                  >
                    <option value="SQFT">Sq.Ft</option>
                    <option value="SQYD">Sq.Yd</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <FieldLabel>Facing</FieldLabel>
              <select
                className={selectCls}
                value={form.facing || ''}
                onChange={(e) => set('facing', e.target.value || null)}
              >
                <option value="">Not specified</option>
                {FACING_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f.replace(/_/g, '-')}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <FieldLabel>New / Resale</FieldLabel>
              <select
                className={selectCls}
                value={form.listing_type || ''}
                onChange={(e) =>
                  set('listing_type', (e.target.value || null) as ProjectUnitInput['listing_type'])
                }
              >
                <option value="">Not specified</option>
                {LISTING_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {unitType !== 'OTHER' && (
              <div className="col-span-2 flex flex-wrap gap-4 items-end pb-2">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={!!form.is_corner}
                    onChange={(e) => set('is_corner', e.target.checked)}
                  />{' '}
                  Corner
                </label>
                {unitType !== 'FLAT' && unitType !== 'COMMERCIAL' && (
                  <>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={!!form.is_road_facing}
                        onChange={(e) => set('is_road_facing', e.target.checked)}
                      />{' '}
                      Road-facing
                    </label>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={!!form.is_park_facing}
                        onChange={(e) => set('is_park_facing', e.target.checked)}
                      />{' '}
                      Park-facing
                    </label>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={!!form.is_main_road_facing}
                        onChange={(e) => set('is_main_road_facing', e.target.checked)}
                      />{' '}
                      Main road-facing
                    </label>
                  </>
                )}
              </div>
            )}

            <div>
              <FieldLabel>
                Base Rate Override (
                {unitType === 'PLOT' ? '₹ / Sq.Yd' : unitType === 'OTHER' ? '₹' : '₹ / Sq.Ft'})
              </FieldLabel>
              <input
                className={inputCls}
                type="number"
                value={form.base_rate ?? ''}
                onChange={(e) =>
                  set('base_rate', e.target.value === '' ? null : parseFloat(e.target.value))
                }
                placeholder="Leave blank to use project's base rate rule"
              />
            </div>
            <div>
              <FieldLabel>Discount</FieldLabel>
              <input
                className={inputCls}
                type="number"
                min={0}
                value={form.discount_amount ?? ''}
                onChange={(e) =>
                  set('discount_amount', e.target.value === '' ? null : parseFloat(e.target.value))
                }
              />
            </div>
          </div>

          {/* Live cost sheet preview — server-computed, never client math */}
          <div className="p-4 bg-navy-50/50 border border-navy-100 rounded-2xl">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-black text-navy-800 uppercase tracking-wide">
                Cost Sheet Preview
              </h4>
              {previewLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-navy-500" />}
            </div>
            {!preview ? (
              <p className="text-xs text-slate-400">
                Enter the area to see a live price breakdown.
              </p>
            ) : (
              <>
                <CostSheet computation={preview} />
                {areaSqft > 0 && (
                  <p className="text-[10px] text-slate-400 pt-2">{formatAreaDual(areaSqft)}</p>
                )}
              </>
            )}
          </div>
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
            disabled={submitting}
            className="flex items-center gap-2 px-6 py-2.5 bg-navy-700 hover:bg-navy-800 text-white font-bold rounded-xl shadow-lg disabled:opacity-60 text-sm"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" /> Create Unit
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
