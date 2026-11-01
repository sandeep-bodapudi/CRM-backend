import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, Calculator } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { SectionCard, FieldLabel, inputCls, selectCls } from '../properties/propertyWizardShared';
import {
  listPricingRules,
  createPricingRule,
  deletePricingRule,
  previewUnitPrice,
  PricingRule,
  PricingRuleInput,
  ChargeCategory,
  ChargeCalcMethod,
  PricingRuleKind,
  UnitType,
  PriceComputation,
} from '../../api/projectUnits';

// Shared between ProjectWizard.tsx's Pricing Rules step and
// ProjectDashboard.tsx's Pricing tab — extracted so the rule-builder UI is
// defined once (see Phase 2 implementation plan's "build once, reuse" note).

const RULE_CATEGORIES: { value: ChargeCategory; label: string }[] = [
  { value: 'FACING', label: 'Facing' },
  { value: 'FLOOR', label: 'Floor' },
  { value: 'CORNER', label: 'Corner' },
  { value: 'ROAD', label: 'Road-Facing' },
  { value: 'PARK', label: 'Park-Facing' },
  { value: 'VIEW', label: 'View' },
  { value: 'BHK', label: 'BHK / Type' },
  { value: 'PARKING', label: 'Parking' },
  { value: 'INFRA', label: 'Infrastructure (EDC/IDC)' },
  { value: 'MAINTENANCE', label: 'Maintenance (IFMS)' },
  { value: 'LEGAL', label: 'Legal / Documentation' },
  { value: 'CLUB', label: 'Club House' },
  { value: 'TAX', label: 'Tax (GST/Registration)' },
  { value: 'OTHER', label: 'Other' },
];

const CALC_METHODS: { value: ChargeCalcMethod; label: string }[] = [
  { value: 'PER_SQFT', label: '₹ per Sq.Ft' },
  { value: 'PER_SQYD', label: '₹ per Sq.Yd' },
  { value: 'FIXED', label: 'Fixed Amount' },
  { value: 'PERCENT_OF_BASE', label: '% of Base Price' },
  { value: 'QTY_X_RATE', label: 'Quantity × Rate' },
];

const PRICE_BASIS_OPTIONS = [
  { value: 'SUPER_BUILT_UP', label: 'Super Built-up Area (flats)' },
  { value: 'BUILT_UP', label: 'Built-up Area' },
  { value: 'CARPET', label: 'Carpet Area' },
  { value: 'PLOT_AREA', label: 'Plot Area (Sq.Yd)' },
  { value: 'LUMPSUM', label: 'Lump Sum (no area math)' },
];

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
        : `₹${r.rate.toLocaleString('en-IN')} / ${r.calc_method === 'PER_SQYD' ? 'Sq.Yd' : r.calc_method === 'PER_SQFT' ? 'Sq.Ft' : 'unit'}`;
  const conditions = [
    r.match_facing ? `${r.match_facing.replace(/_/g, '-')} facing only` : null,
    r.match_corner ? 'Corner only' : null,
    r.match_park_facing ? 'Park-facing only' : null,
    r.match_road_facing ? 'Road-facing only' : null,
    r.match_floor_min != null || r.match_floor_max != null
      ? `Floor ${r.match_floor_min ?? 0}-${r.match_floor_max ?? '+'}`
      : null,
    r.is_active === false ? 'Inactive' : null,
  ].filter(Boolean);
  return conditions.length ? `${amount} • ${conditions.join(' • ')}` : amount;
}

const SAMPLE_UNIT_TYPES: UnitType[] = ['PLOT', 'FLAT', 'VILLA', 'HOUSE', 'COMMERCIAL', 'OTHER'];

/**
 * The live sample-unit calculator (implementation plan section 6.1): the
 * admin fills in a hypothetical unit's fields and sees the server's actual
 * cost sheet render as they type — "the direct payoff of Decision 2" (the
 * pricing engine is real, not a demo), and the fastest way to sanity-check a
 * rule right after adding it, before creating any real unit.
 */
const SampleUnitCalculator: React.FC<{ projectId: number }> = ({ projectId }) => {
  const { fetchWithAuth } = useAuth();
  const [sample, setSample] = useState<{
    unit_type: UnitType;
    plot_area_sqyd: string;
    area_value: string;
    facing: string;
    floor: string;
    is_corner: boolean;
  }>({
    unit_type: 'PLOT',
    plot_area_sqyd: '150',
    area_value: '',
    facing: '',
    floor: '',
    is_corner: false,
  });
  const [computation, setComputation] = useState<PriceComputation | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const hasArea = sample.unit_type === 'PLOT' ? !!sample.plot_area_sqyd : !!sample.area_value;
    if (!hasArea) {
      setComputation(null);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      previewUnitPrice(fetchWithAuth, projectId, {
        unit_type: sample.unit_type,
        plot_area_sqyd:
          sample.unit_type === 'PLOT' && sample.plot_area_sqyd
            ? parseFloat(sample.plot_area_sqyd)
            : undefined,
        area_value:
          sample.unit_type !== 'PLOT' && sample.area_value
            ? parseFloat(sample.area_value)
            : undefined,
        area_unit: sample.unit_type !== 'PLOT' && sample.area_value ? 'SQFT' : undefined,
        facing: sample.facing || undefined,
        floor: sample.floor ? parseInt(sample.floor, 10) : undefined,
        is_corner: sample.is_corner,
      } as any)
        .then(({ computation: c }) => setComputation(c))
        .catch(() => setComputation(null))
        .finally(() => setLoading(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [sample, projectId, fetchWithAuth]);

  return (
    <SectionCard
      title="Sample Unit Calculator"
      subtitle="Try a hypothetical unit against your rules above — this is the exact same server calculation a real unit gets."
    >
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <FieldLabel>Unit Type</FieldLabel>
          <select
            className={selectCls}
            value={sample.unit_type}
            onChange={(e) => setSample((s) => ({ ...s, unit_type: e.target.value as UnitType }))}
          >
            {SAMPLE_UNIT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>
            {sample.unit_type === 'PLOT' ? 'Plot Area (Sq.Yd)' : 'Area (Sq.Ft)'}
          </FieldLabel>
          <input
            className={inputCls}
            type="number"
            min={0}
            value={sample.unit_type === 'PLOT' ? sample.plot_area_sqyd : sample.area_value}
            onChange={(e) =>
              setSample((s) =>
                s.unit_type === 'PLOT'
                  ? { ...s, plot_area_sqyd: e.target.value }
                  : { ...s, area_value: e.target.value },
              )
            }
          />
        </div>
        <div>
          <FieldLabel>Facing</FieldLabel>
          <select
            className={selectCls}
            value={sample.facing}
            onChange={(e) => setSample((s) => ({ ...s, facing: e.target.value }))}
          >
            <option value="">Any</option>
            {FACING_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f.replace(/_/g, '-')}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>Floor</FieldLabel>
          <input
            className={inputCls}
            type="number"
            value={sample.floor}
            onChange={(e) => setSample((s) => ({ ...s, floor: e.target.value }))}
          />
        </div>
        <div className="flex items-end pb-2 col-span-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={sample.is_corner}
              onChange={(e) => setSample((s) => ({ ...s, is_corner: e.target.checked }))}
            />
            Corner unit
          </label>
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

export const PricingRulesPanel: React.FC<{ projectId: number; readOnly?: boolean }> = ({
  projectId,
  readOnly,
}) => {
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();

  const [rules, setRules] = useState<PricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddRule, setShowAddRule] = useState(false);
  const [newRule, setNewRule] = useState<Partial<PricingRuleInput>>({
    kind: 'PREMIUM',
    calc_method: 'FIXED',
    category: 'OTHER',
  });

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
    try {
      const { rule } = await createPricingRule(
        fetchWithAuth,
        projectId,
        newRule as PricingRuleInput,
      );
      setRules((r) => [...r, rule]);
      setShowAddRule(false);
      setNewRule({ kind: 'PREMIUM', calc_method: 'FIXED', category: 'OTHER' });
      showToast('Pricing rule added', 'success');
    } catch (err: any) {
      showError({ message: err?.message || 'Failed to add pricing rule' });
    }
  };

  const handleDeleteRule = async (ruleId: number) => {
    try {
      await deletePricingRule(fetchWithAuth, projectId, ruleId);
      setRules((r) => r.filter((x) => x.id !== ruleId));
      showToast('Rule deactivated', 'success');
    } catch {
      showError({ message: 'Failed to remove rule' });
    }
  };

  const needsAreaBasis = newRule.calc_method === 'PER_SQFT' || newRule.calc_method === 'PER_SQYD';

  return (
    <div className="space-y-4">
      <SectionCard
        title="Base Rate, Premiums & Charges"
        subtitle="Facing, floor, corner premiums and mandatory charges — applied automatically when a unit matches."
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
                No rules yet. Add a Base Rate first, then facing/corner/floor premiums.
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
                  <button
                    onClick={() => handleDeleteRule(r.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
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
                  <FieldLabel required>Label</FieldLabel>
                  <input
                    className={inputCls}
                    value={newRule.label || ''}
                    onChange={(e) => setNewRule((r) => ({ ...r, label: e.target.value }))}
                    placeholder="e.g. East Facing Premium"
                  />
                </div>
                <div>
                  <FieldLabel>Rule Type</FieldLabel>
                  <select
                    className={selectCls}
                    value={newRule.kind}
                    onChange={(e) =>
                      setNewRule((r) => ({ ...r, kind: e.target.value as PricingRuleKind }))
                    }
                  >
                    <option value="BASE_RATE">Base Rate</option>
                    <option value="PREMIUM">Premium</option>
                    <option value="CHARGE">Charge</option>
                    <option value="TAX">Tax</option>
                  </select>
                </div>
                <div>
                  <FieldLabel>Category</FieldLabel>
                  <select
                    className={selectCls}
                    value={newRule.category}
                    onChange={(e) =>
                      setNewRule((r) => ({ ...r, category: e.target.value as ChargeCategory }))
                    }
                  >
                    {RULE_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel>Calculation</FieldLabel>
                  <select
                    className={selectCls}
                    value={newRule.calc_method}
                    onChange={(e) =>
                      setNewRule((r) => ({ ...r, calc_method: e.target.value as ChargeCalcMethod }))
                    }
                  >
                    {CALC_METHODS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
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
                {needsAreaBasis && (
                  <div>
                    <FieldLabel>Area Basis</FieldLabel>
                    <select
                      className={selectCls}
                      value={newRule.area_basis || ''}
                      onChange={(e) =>
                        setNewRule((r) => ({ ...r, area_basis: e.target.value as any }))
                      }
                    >
                      <option value="">Use unit's own basis</option>
                      {PRICE_BASIS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
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
                      Corner units only
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
                      Park-facing units only
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
                      Road-facing units only
                    </label>
                  </div>
                )}
                {newRule.category === 'FLOOR' && (
                  <>
                    <div>
                      <FieldLabel>Floor Min</FieldLabel>
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
                      <FieldLabel>Floor Max</FieldLabel>
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
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowAddRule(false)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddRule}
                  className="px-4 py-1.5 text-xs font-black bg-navy-700 hover:bg-navy-800 text-white rounded-lg"
                >
                  Add Rule
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
      <SampleUnitCalculator projectId={projectId} />
    </div>
  );
};
