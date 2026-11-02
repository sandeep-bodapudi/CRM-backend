import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, Pencil } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  SectionCard,
  FieldLabel,
  inputCls,
  selectCls,
  BHK_OPTIONS,
} from '../properties/propertyWizardShared';
import {
  listPricingRules,
  createPricingRule,
  updatePricingRule,
  deletePricingRule,
  previewUnitPrice,
  PricingRule,
  PricingRuleInput,
  ChargeCategory,
  ChargeCalcMethod,
  PricingRuleKind,
  UnitType,
  PriceComputation,
  ProjectUnitInput,
} from '../../api/projectUnits';
import {
  UNIT_TYPE_LABEL,
  PRICE_BASIS_BY_UNIT_TYPE,
  PRICE_BASIS_TEXT,
  unitTypesForProject,
  ruleCategoriesFor,
  calcMethodsFor,
  allowsTax,
} from './unitTypeProfile';

// Shared between ProjectWizard.tsx's Pricing Rules step and
// ProjectDashboard.tsx's Pricing tab — extracted so the rule-builder UI is
// defined once (see Phase 2 implementation plan's "build once, reuse" note).
// Everything here follows the unit type: a plot rule only offers plot
// categories and per-Sq.Yd rates, a flat rule only flat ones (unitTypeProfile).

const CATEGORY_LABEL: Record<ChargeCategory, string> = {
  FACING: 'Facing',
  FLOOR: 'Floor rise',
  CORNER: 'Corner',
  ROAD: 'Road-Facing',
  PARK: 'Park-Facing',
  VIEW: 'View',
  BHK: 'BHK / Type',
  AMENITY: 'Amenity',
  PARKING: 'Car Parking',
  INFRA: 'Development / Infrastructure',
  MAINTENANCE: 'Maintenance (IFMS)',
  LEGAL: 'Legal / Documentation',
  CLUB: 'Club House',
  TAX: 'Tax (GST)',
  OTHER: 'Other',
};

const CALC_METHOD_LABEL: Record<ChargeCalcMethod, string> = {
  PER_SQFT: '₹ per Sq.Ft',
  PER_SQYD: '₹ per Sq.Yd',
  FIXED: 'Fixed Amount',
  PERCENT_OF_BASE: '% of Base Price',
  QTY_X_RATE: '₹ per car park',
};

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

function describeRule(r: PricingRule): string {
  const amount =
    r.calc_method === 'PERCENT_OF_BASE'
      ? `${r.rate}% of base`
      : r.calc_method === 'FIXED'
        ? `₹${r.rate.toLocaleString('en-IN')} fixed`
        : `₹${r.rate.toLocaleString('en-IN')} / ${r.calc_method === 'PER_SQYD' ? 'Sq.Yd' : r.calc_method === 'PER_SQFT' ? 'Sq.Ft' : 'car park'}`;
  const conditions = [
    r.applies_to_unit_type ? `${UNIT_TYPE_LABEL[r.applies_to_unit_type]}s only` : null,
    r.match_facing ? `${r.match_facing.replace(/_/g, '-')} facing only` : null,
    r.match_corner ? 'Corner only' : null,
    r.match_park_facing ? 'Park-facing only' : null,
    r.match_road_facing ? 'Road-facing only' : null,
    r.match_bhk ? `${r.match_bhk} only` : null,
    r.match_floor_min != null || r.match_floor_max != null
      ? `Floor ${r.match_floor_min ?? 0}-${r.match_floor_max ?? '+'}`
      : null,
    r.is_active === false ? 'Inactive' : null,
  ].filter(Boolean);
  return conditions.length ? `${amount} • ${conditions.join(' • ')}` : amount;
}

type SampleState = {
  unit_type: UnitType;
  area: string;
  plot_area_sqyd: string;
  facing: string;
  floor: string;
  bhk: string;
  parking_count: string;
  is_corner: boolean;
  is_road_facing: boolean;
  is_park_facing: boolean;
};

const blankSample = (unit_type: UnitType): SampleState => ({
  unit_type,
  area: '',
  plot_area_sqyd: unit_type === 'PLOT' ? '150' : '',
  facing: '',
  floor: '',
  bhk: '',
  parking_count: '',
  is_corner: false,
  is_road_facing: false,
  is_park_facing: false,
});

/** The area a unit type is priced on, as the calculator labels it. */
const SAMPLE_AREA_LABEL: Record<UnitType, string> = {
  PLOT: 'Plot Area (Sq.Yd)',
  FLAT: 'Super Built-up Area (Sq.Ft)',
  VILLA: 'Built-up Area (Sq.Ft)',
  HOUSE: 'Built-up Area (Sq.Ft)',
  COMMERCIAL: 'Super Built-up Area (Sq.Ft)',
  OTHER: 'Area (Sq.Ft)',
};

function sampleToInput(s: SampleState): Partial<ProjectUnitInput> & { unit_type: UnitType } {
  const n = (v: string) => (v === '' ? undefined : parseFloat(v));
  const t = s.unit_type;
  const input: Partial<ProjectUnitInput> & { unit_type: UnitType } = {
    unit_type: t,
    price_basis: PRICE_BASIS_BY_UNIT_TYPE[t],
    facing: s.facing || undefined,
    is_corner: s.is_corner,
  };
  if (t === 'PLOT') {
    input.plot_area_sqyd = n(s.plot_area_sqyd);
    input.is_road_facing = s.is_road_facing;
    input.is_park_facing = s.is_park_facing;
  } else if (t === 'FLAT' || t === 'COMMERCIAL') {
    input.super_built_up_area_sqft = n(s.area);
    input.floor = s.floor ? parseInt(s.floor, 10) : undefined;
    if (t === 'FLAT') {
      input.bhk = s.bhk || undefined;
      input.parking_count = s.parking_count ? parseInt(s.parking_count, 10) : undefined;
    }
  } else if (t === 'VILLA' || t === 'HOUSE') {
    input.built_up_area_sqft = n(s.area);
    input.plot_area_sqyd = n(s.plot_area_sqyd);
  } else {
    input.area_value = n(s.area);
    input.area_unit = 'SQFT';
  }
  return input;
}

/**
 * The live sample-unit calculator (implementation plan section 6.1): the
 * admin fills in a hypothetical unit's fields and sees the server's actual
 * cost sheet render as they type — the fastest way to sanity-check a rule
 * right after adding it. Shows only the fields of the unit type picked, and
 * only the unit types this project sells.
 */
const SampleUnitCalculator: React.FC<{ projectId: number; unitTypes: UnitType[] }> = ({
  projectId,
  unitTypes,
}) => {
  const { fetchWithAuth } = useAuth();
  const [sample, setSample] = useState<SampleState>(() => blankSample(unitTypes[0]));
  const [computation, setComputation] = useState<PriceComputation | null>(null);
  const [loading, setLoading] = useState(false);

  // Project type changed in the wizard: fall back to a type it still sells.
  useEffect(() => {
    if (!unitTypes.includes(sample.unit_type)) setSample(blankSample(unitTypes[0]));
  }, [unitTypes]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = sample.unit_type;
  const areaValue = t === 'PLOT' ? sample.plot_area_sqyd : sample.area;

  useEffect(() => {
    if (!areaValue) {
      setComputation(null);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      previewUnitPrice(fetchWithAuth, projectId, sampleToInput(sample))
        .then(({ computation: c }) => setComputation(c))
        .catch(() => setComputation(null))
        .finally(() => setLoading(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [sample, areaValue, projectId, fetchWithAuth]);

  const set = (patch: Partial<SampleState>) => setSample((s) => ({ ...s, ...patch }));
  const check = (key: 'is_corner' | 'is_road_facing' | 'is_park_facing', label: string) => (
    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
      <input
        type="checkbox"
        checked={sample[key]}
        onChange={(e) => set({ [key]: e.target.checked })}
      />
      {label}
    </label>
  );

  return (
    <SectionCard
      title="Sample Unit Calculator"
      subtitle="Try a hypothetical unit against your rules above — this is the exact same server calculation a real unit gets."
    >
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <FieldLabel>Unit Type</FieldLabel>
          {unitTypes.length > 1 ? (
            <select
              className={selectCls}
              value={t}
              onChange={(e) => setSample(blankSample(e.target.value as UnitType))}
            >
              {unitTypes.map((u) => (
                <option key={u} value={u}>
                  {UNIT_TYPE_LABEL[u]}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm font-bold text-slate-700 py-2">{UNIT_TYPE_LABEL[t]}</p>
          )}
        </div>
        <div>
          <FieldLabel>{SAMPLE_AREA_LABEL[t]}</FieldLabel>
          <input
            className={inputCls}
            type="number"
            min={0}
            value={areaValue}
            onChange={(e) =>
              set(t === 'PLOT' ? { plot_area_sqyd: e.target.value } : { area: e.target.value })
            }
          />
        </div>
        {(t === 'VILLA' || t === 'HOUSE') && (
          <div>
            <FieldLabel>Plot Area (Sq.Yd)</FieldLabel>
            <input
              className={inputCls}
              type="number"
              min={0}
              value={sample.plot_area_sqyd}
              onChange={(e) => set({ plot_area_sqyd: e.target.value })}
            />
          </div>
        )}
        <div>
          <FieldLabel>Facing</FieldLabel>
          <select
            className={selectCls}
            value={sample.facing}
            onChange={(e) => set({ facing: e.target.value })}
          >
            <option value="">Any</option>
            {FACING_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f.replace(/_/g, '-')}
              </option>
            ))}
          </select>
        </div>
        {(t === 'FLAT' || t === 'COMMERCIAL') && (
          <div>
            <FieldLabel>Floor</FieldLabel>
            <input
              className={inputCls}
              type="number"
              min={0}
              value={sample.floor}
              onChange={(e) => set({ floor: e.target.value })}
            />
          </div>
        )}
        {t === 'FLAT' && (
          <>
            <div>
              <FieldLabel>BHK</FieldLabel>
              <select
                className={selectCls}
                value={sample.bhk}
                onChange={(e) => set({ bhk: e.target.value })}
              >
                <option value="">Any</option>
                {BHK_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Car Parks</FieldLabel>
              <input
                className={inputCls}
                type="number"
                min={0}
                value={sample.parking_count}
                onChange={(e) => set({ parking_count: e.target.value })}
              />
            </div>
          </>
        )}
        <div className="flex flex-wrap items-end gap-4 pb-2 col-span-2">
          {check(
            'is_corner',
            t === 'FLAT' ? 'Corner flat' : t === 'PLOT' ? 'Corner plot' : 'Corner unit',
          )}
          {t === 'PLOT' && check('is_road_facing', 'Road-facing')}
          {t === 'PLOT' && check('is_park_facing', 'Park-facing')}
        </div>
      </div>
      {loading && (
        <div className="text-xs text-slate-400 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Calculating...
        </div>
      )}

      {!loading && computation && (
        <div className="border-t border-slate-100 pt-3 space-y-1.5">
          {computation.lines.map((l, i) => (
            <div key={i} className="flex justify-between text-xs">
              <span className="text-slate-500">
                {l.label}
                {l.quantity !== 1
                  ? ` (${l.quantity.toLocaleString('en-IN')} × ₹${l.rate.toLocaleString('en-IN')})`
                  : ''}
              </span>
              <span className="font-semibold text-slate-700">
                ₹{l.amount.toLocaleString('en-IN')}
              </span>
            </div>
          ))}
          <div className="flex justify-between text-sm font-black text-navy-800 pt-2 border-t border-slate-100 mt-2">
            <span>Calculated Price</span>
            <span>₹{computation.calculated_price.toLocaleString('en-IN')}</span>
          </div>
          {computation.taxes_total > 0 && (
            <div className="flex justify-between text-xs text-slate-500">
              <span>+ Taxes</span>
              <span>₹{computation.taxes_total.toLocaleString('en-IN')}</span>
            </div>
          )}
          {computation.warnings.map((w, i) => (
            <p key={i} className="text-[11px] text-amber-600">
              {w}
            </p>
          ))}
        </div>
      )}

      {!loading && !computation && (
        <p className="text-xs text-slate-400">Enter an area to see the calculation.</p>
      )}
    </SectionCard>
  );
};

/** A fresh rule draft for a unit type, with that type's first category/method. */
const blankRule = (unitType: UnitType): Partial<PricingRuleInput> => ({
  kind: 'PREMIUM',
  category: ruleCategoriesFor(unitType)[0],
  calc_method: 'FIXED',
  applies_to_unit_type: unitType,
});

export const PricingRulesPanel: React.FC<{
  projectId: number;
  /** Project.project_type — decides which unit types (and so which fields) appear. */
  projectType?: string | null;
  readOnly?: boolean;
  /** Approved (VERIFIED) project: every price change needs a reason, kept in its History. */
  approved?: boolean;
}> = ({ projectId, projectType, readOnly, approved }) => {
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();

  const unitTypes = unitTypesForProject(projectType);
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddRule, setShowAddRule] = useState(false);
  // Rule being edited in place (null = adding a new one).
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newRule, setNewRule] = useState<Partial<PricingRuleInput>>(() => blankRule(unitTypes[0]));
  const [changeReason, setChangeReason] = useState('');

  const ruleType: UnitType = (newRule.applies_to_unit_type as UnitType) || unitTypes[0];
  const categories = ruleCategoriesFor(ruleType);
  const methods = calcMethodsFor(ruleType);

  // A project-type change in the wizard can leave the draft on a type the
  // project no longer sells.
  useEffect(() => {
    if (!unitTypes.includes(ruleType)) setNewRule(blankRule(unitTypes[0]));
  }, [projectType]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = () => {
    setLoading(true);
    listPricingRules(fetchWithAuth, projectId)
      .then(({ rules }) => setRules(rules))
      .catch(() => showError({ message: 'Failed to load pricing rules' }))
      .finally(() => setLoading(false));
  };

  useEffect(load, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddRule = async () => {
    if (!newRule.label || !newRule.rate) {
      showError({ message: 'Label and rate are required' });
      return;
    }
    if (approved && !changeReason.trim()) {
      showError({ message: 'This project is approved. Say why the price is changing.' });
      return;
    }
    const body = {
      ...newRule,
      ...(approved ? { change_reason: changeReason.trim() } : {}),
      // The unit's own (fixed) basis always applies — no per-rule override.
      area_basis: null,
      is_tax: newRule.kind === 'TAX',
    } as PricingRuleInput;
    try {
      if (editingId) {
        const { id: _id, project_id: _p, ...changes } = body as any;
        const { rule } = await updatePricingRule(fetchWithAuth, projectId, editingId, changes);
        setRules((rs) => rs.map((x) => (x.id === editingId ? rule : x)));
        showToast('Pricing rule updated', 'success');
      } else {
        const { rule } = await createPricingRule(fetchWithAuth, projectId, body);
        setRules((r) => [...r, rule]);
        showToast('Pricing rule added', 'success');
      }
      setShowAddRule(false);
      setEditingId(null);
      setNewRule(blankRule(ruleType));
      setChangeReason('');
    } catch (err: any) {
      showError({ message: err?.message || 'Failed to save pricing rule' });
    }
  };

  const startEdit = (rule: PricingRule) => {
    setNewRule({ ...rule });
    setEditingId(rule.id);
    setShowAddRule(true);
  };

  const handleDeleteRule = async (ruleId: number) => {
    let reason: string | undefined;
    if (approved) {
      reason = window
        .prompt('This project is approved. Why is this price rule being removed?')
        ?.trim();
      if (!reason) return;
    }
    try {
      await deletePricingRule(fetchWithAuth, projectId, ruleId, reason);
      setRules((r) => r.filter((x) => x.id !== ruleId));
      showToast('Rule deactivated', 'success');
    } catch (err: any) {
      showError({ message: err?.message || 'Failed to remove rule' });
    }
  };

  const setKind = (kind: PricingRuleKind) =>
    setNewRule((r) => ({
      ...r,
      kind,
      // A base rate is always rate × the unit's own area.
      ...(kind === 'BASE_RATE'
        ? { category: 'OTHER' as ChargeCategory, calc_method: methods[0] }
        : {}),
      ...(kind === 'TAX'
        ? { category: 'TAX' as ChargeCategory, calc_method: 'PERCENT_OF_BASE' as ChargeCalcMethod }
        : {}),
    }));

  const setUnitType = (u: UnitType) =>
    setNewRule((r) => ({
      ...blankRule(u),
      label: r.label,
      rate: r.rate,
      kind: r.kind === 'TAX' && !allowsTax(u) ? 'PREMIUM' : r.kind,
    }));

  return (
    <div className="space-y-4">
      <SectionCard
        title="Base Rate, Premiums & Charges"
        subtitle={unitTypes
          .map((u) => `${UNIT_TYPE_LABEL[u]}s are priced ${PRICE_BASIS_TEXT[u]}.`)
          .join(' ')}
      >
        {loading ? (
          <div className="py-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading rules...
          </div>
        ) : (
          <div className="space-y-2">
            {rules.length === 0 && (
              <p className="text-xs text-slate-400 py-2">
                No rules yet. Add a Base Rate first, then facing/corner premiums. Development
                charges, if any, go in as a separate Charge.
              </p>
            )}
            {rules.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl"
              >
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    {r.label}{' '}
                    <span className="text-[10px] font-semibold text-slate-400 uppercase ml-1">
                      {r.kind}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500">{describeRule(r)}</p>
                </div>
                {!readOnly && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => startEdit(r)}
                      aria-label={`Edit ${r.label}`}
                      className="p-1.5 text-slate-400 hover:text-navy-700 hover:bg-navy-50 rounded-lg"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteRule(r.id)}
                      aria-label={`Remove ${r.label}`}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!readOnly &&
          (showAddRule ? (
            <div className="mt-4 p-4 bg-navy-50/50 border border-navy-100 rounded-xl space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel>Applies to</FieldLabel>
                  {unitTypes.length > 1 ? (
                    <select
                      className={selectCls}
                      value={ruleType}
                      onChange={(e) => setUnitType(e.target.value as UnitType)}
                    >
                      {unitTypes.map((u) => (
                        <option key={u} value={u}>
                          {UNIT_TYPE_LABEL[u]}s
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm font-bold text-slate-700 py-2">
                      {UNIT_TYPE_LABEL[ruleType]}s
                    </p>
                  )}
                </div>
                <div>
                  <FieldLabel required>Label</FieldLabel>
                  <input
                    className={inputCls}
                    value={newRule.label || ''}
                    onChange={(e) => setNewRule((r) => ({ ...r, label: e.target.value }))}
                    placeholder={
                      ruleType === 'PLOT' ? 'e.g. East Facing Premium' : 'e.g. Floor Rise 5th+'
                    }
                  />
                </div>
                <div>
                  <FieldLabel>Rule Type</FieldLabel>
                  <select
                    className={selectCls}
                    value={newRule.kind}
                    onChange={(e) => setKind(e.target.value as PricingRuleKind)}
                  >
                    <option value="BASE_RATE">Base Rate</option>
                    <option value="PREMIUM">Premium</option>
                    <option value="CHARGE">Charge</option>
                    {allowsTax(ruleType) && <option value="TAX">Tax (GST)</option>}
                  </select>
                </div>
                {newRule.kind !== 'BASE_RATE' && newRule.kind !== 'TAX' && (
                  <div>
                    <FieldLabel>Category</FieldLabel>
                    <select
                      className={selectCls}
                      value={newRule.category}
                      onChange={(e) =>
                        setNewRule((r) => ({ ...r, category: e.target.value as ChargeCategory }))
                      }
                    >
                      {categories
                        .filter((c) => c !== 'TAX')
                        .map((c) => (
                          <option key={c} value={c}>
                            {CATEGORY_LABEL[c]}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
                <div>
                  <FieldLabel>Calculation</FieldLabel>
                  <select
                    className={selectCls}
                    value={newRule.calc_method}
                    onChange={(e) =>
                      setNewRule((r) => ({ ...r, calc_method: e.target.value as ChargeCalcMethod }))
                    }
                  >
                    {methods
                      .filter((m) => newRule.category === 'PARKING' || m !== 'QTY_X_RATE')
                      .filter((m) => newRule.kind !== 'BASE_RATE' || m !== 'PERCENT_OF_BASE')
                      .filter((m) => newRule.kind !== 'TAX' || m === 'PERCENT_OF_BASE')
                      .map((m) => (
                        <option key={m} value={m}>
                          {CALC_METHOD_LABEL[m]}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <FieldLabel required>Rate</FieldLabel>
                  <input
                    className={inputCls}
                    type="number"
                    value={newRule.rate ?? ''}
                    onChange={(e) =>
                      setNewRule((r) => ({ ...r, rate: parseFloat(e.target.value) }))
                    }
                  />
                </div>
                {newRule.category === 'FACING' && (
                  <div>
                    <FieldLabel>Applies to Facing</FieldLabel>
                    <select
                      className={selectCls}
                      value={newRule.match_facing || ''}
                      onChange={(e) =>
                        setNewRule((r) => ({ ...r, match_facing: e.target.value || null }))
                      }
                    >
                      <option value="">Any facing</option>
                      {FACING_OPTIONS.map((f) => (
                        <option key={f} value={f}>
                          {f.replace(/_/g, '-')}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {newRule.category === 'BHK' && (
                  <div>
                    <FieldLabel>Applies to BHK</FieldLabel>
                    <select
                      className={selectCls}
                      value={newRule.match_bhk || ''}
                      onChange={(e) =>
                        setNewRule((r) => ({ ...r, match_bhk: e.target.value || null }))
                      }
                    >
                      <option value="">Any</option>
                      {BHK_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {newRule.category === 'CORNER' && (
                  <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={!!newRule.match_corner}
                        onChange={(e) =>
                          setNewRule((r) => ({ ...r, match_corner: e.target.checked }))
                        }
                      />
                      Corner {ruleType === 'PLOT' ? 'plots' : 'units'} only
                    </label>
                  </div>
                )}
                {newRule.category === 'PARK' && (
                  <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={!!newRule.match_park_facing}
                        onChange={(e) =>
                          setNewRule((r) => ({ ...r, match_park_facing: e.target.checked }))
                        }
                      />
                      Park-facing plots only
                    </label>
                  </div>
                )}
                {newRule.category === 'ROAD' && (
                  <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={!!newRule.match_road_facing}
                        onChange={(e) =>
                          setNewRule((r) => ({ ...r, match_road_facing: e.target.checked }))
                        }
                      />
                      Road-facing plots only
                    </label>
                  </div>
                )}
                {newRule.category === 'FLOOR' && (
                  <>
                    <div>
                      <FieldLabel>From Floor</FieldLabel>
                      <input
                        className={inputCls}
                        type="number"
                        value={newRule.match_floor_min ?? ''}
                        onChange={(e) =>
                          setNewRule((r) => ({
                            ...r,
                            match_floor_min:
                              e.target.value === '' ? null : parseInt(e.target.value, 10),
                          }))
                        }
                      />
                    </div>
                    <div>
                      <FieldLabel>To Floor</FieldLabel>
                      <input
                        className={inputCls}
                        type="number"
                        value={newRule.match_floor_max ?? ''}
                        onChange={(e) =>
                          setNewRule((r) => ({
                            ...r,
                            match_floor_max:
                              e.target.value === '' ? null : parseInt(e.target.value, 10),
                          }))
                        }
                      />
                    </div>
                  </>
                )}
              </div>
              {approved && (
                <label className="block">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    Reason for this price change
                  </span>
                  <input
                    value={changeReason}
                    onChange={(e) => setChangeReason(e.target.value)}
                    maxLength={500}
                    placeholder="e.g. Market rate revised from 1 Dec"
                    className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                  <span className="text-[11px] text-slate-400">
                    The project is approved, so this is kept in its History and the MD is told.
                  </span>
                </label>
              )}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowAddRule(false);
                    setEditingId(null);
                    setNewRule(blankRule(ruleType));
                    setChangeReason('');
                  }}
                  className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddRule}
                  className="px-4 py-1.5 text-xs font-black bg-navy-700 hover:bg-navy-800 text-white rounded-lg"
                >
                  {editingId ? 'Save Changes' : 'Add Rule'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddRule(true)}
              className="mt-3 flex items-center gap-1.5 text-xs font-bold text-navy-700 hover:text-navy-900"
            >
              <Plus className="w-3.5 h-3.5" /> Add Pricing Rule
            </button>
          ))}
      </SectionCard>
      <SampleUnitCalculator projectId={projectId} unitTypes={unitTypes} />
    </div>
  );
};
