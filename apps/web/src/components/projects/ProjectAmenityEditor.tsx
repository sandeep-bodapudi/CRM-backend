import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Loader2, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { SectionCard, FieldLabel, inputCls, selectCls } from '../properties/propertyWizardShared';
import {
  listAmenityCatalog,
  createCatalogAmenity,
  listProjectAmenities,
  setProjectAmenity,
  removeProjectAmenity,
  Amenity,
  AmenityCategory,
  ProjectAmenity,
  AmenityAvailability,
  AmenityApplicability,
} from '../../api/amenities';
import { listProjectUnits, UnitType, ChargeCalcMethod } from '../../api/projectUnits';

// Phase 3: the Amenities tab. Two parts — (a) the company-wide catalog, a
// simple add-once-rarely-touch list (implementation plan section 6.2 notes
// this doesn't need wizard polish), and (b) this project's configuration of
// each catalog entry. A CHARGEABLE amenity behaves exactly like a pricing
// rule (see services/pricing/pricing.service.ts's getEffectiveRules) but,
// same as editing a pricing rule, changing it here never moves an existing
// unit's price by itself — use the Pricing tab's "Recalculate All Units"
// afterward to apply it (and see the diff before committing).

const CATEGORIES: { value: AmenityCategory; label: string }[] = [
  { value: 'SECURITY', label: 'Security' },
  { value: 'RECREATION', label: 'Recreation' },
  { value: 'CONVENIENCE', label: 'Convenience' },
  { value: 'ENVIRONMENT', label: 'Environment' },
  { value: 'SPORTS', label: 'Sports' },
  { value: 'UTILITY', label: 'Utility' },
  { value: 'OTHER', label: 'Other' },
];

const CALC_METHODS: { value: ChargeCalcMethod; label: string }[] = [
  { value: 'FIXED', label: 'Fixed Amount' },
  { value: 'PER_SQFT', label: '₹ per Sq.Ft' },
  { value: 'PER_SQYD', label: '₹ per Sq.Yd' },
  { value: 'PERCENT_OF_BASE', label: '% of Base Price' },
];

const UNIT_TYPES: UnitType[] = ['PLOT', 'FLAT', 'VILLA', 'HOUSE', 'COMMERCIAL', 'OTHER'];

type RowState = {
  availability: AmenityAvailability;
  charge_calc_method: ChargeCalcMethod;
  charge_amount: string;
  applicability: AmenityApplicability;
  applicable_unit_type: UnitType | '';
  selected_unit_ids: number[];
};

const defaultRowState = (): RowState => ({
  availability: 'INCLUDED',
  charge_calc_method: 'FIXED',
  charge_amount: '',
  applicability: 'ALL_UNITS',
  applicable_unit_type: '',
  selected_unit_ids: [],
});

export const ProjectAmenityEditor: React.FC<{ projectId: number }> = ({ projectId }) => {
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();

  const [catalog, setCatalog] = useState<Amenity[]>([]);
  const [configured, setConfigured] = useState<ProjectAmenity[]>([]);
  const [units, setUnits] = useState<{ id: number; unit_number: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [rowDrafts, setRowDrafts] = useState<Record<number, RowState>>({});

  const [showAddCatalog, setShowAddCatalog] = useState(false);
  const [newAmenity, setNewAmenity] = useState<{ name: string; category: AmenityCategory }>({
    name: '',
    category: 'OTHER',
  });

  const load = () => {
    setLoading(true);
    Promise.all([
      listAmenityCatalog(fetchWithAuth),
      listProjectAmenities(fetchWithAuth, projectId),
      listProjectUnits(fetchWithAuth, projectId, { limit: 500 } as any),
    ])
      .then(([c, pa, u]) => {
        setCatalog(c.amenities);
        setConfigured(pa.amenities);
        setUnits(u.units.map((x) => ({ id: x.id, unit_number: x.unit_number })));
      })
      .catch(() => showError({ message: 'Failed to load amenities' }))
      .finally(() => setLoading(false));
  };

  useEffect(load, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const configByAmenityId = useMemo(() => {
    const map: Record<number, ProjectAmenity> = {};
    configured.forEach((c) => {
      map[c.amenity_id] = c;
    });
    return map;
  }, [configured]);

  const draftFor = (amenityId: number): RowState => {
    if (rowDrafts[amenityId]) return rowDrafts[amenityId];
    const existing = configByAmenityId[amenityId];
    if (!existing) return defaultRowState();
    return {
      availability: existing.availability,
      charge_calc_method: existing.charge_calc_method || 'FIXED',
      charge_amount: existing.charge_amount != null ? String(existing.charge_amount) : '',
      applicability: existing.applicability || 'ALL_UNITS',
      applicable_unit_type: existing.applicable_unit_type || '',
      selected_unit_ids: [],
    };
  };

  const updateDraft = (amenityId: number, patch: Partial<RowState>) => {
    setRowDrafts((d) => ({ ...d, [amenityId]: { ...draftFor(amenityId), ...patch } }));
  };

  const toggleUnit = (amenityId: number, unitId: number) => {
    const draft = draftFor(amenityId);
    const has = draft.selected_unit_ids.includes(unitId);
    updateDraft(amenityId, {
      selected_unit_ids: has
        ? draft.selected_unit_ids.filter((id) => id !== unitId)
        : [...draft.selected_unit_ids, unitId],
    });
  };

  const handleSave = async (amenity: Amenity) => {
    const draft = draftFor(amenity.id);
    if (draft.availability === 'CHARGEABLE' && !draft.charge_amount) {
      showError({ message: 'Enter a charge amount' });
      return;
    }
    setSaving(amenity.id);
    try {
      const { amenity: saved } = await setProjectAmenity(fetchWithAuth, projectId, amenity.id, {
        availability: draft.availability,
        charge_calc_method: draft.availability === 'CHARGEABLE' ? draft.charge_calc_method : null,
        charge_amount: draft.availability === 'CHARGEABLE' ? parseFloat(draft.charge_amount) : null,
        applicability: draft.applicability,
        applicable_unit_type:
          draft.applicability === 'BY_UNIT_TYPE' ? draft.applicable_unit_type || null : null,
        selected_unit_ids:
          draft.applicability === 'SELECTED_UNITS' ? draft.selected_unit_ids : undefined,
      });
      setConfigured((prev) => [...prev.filter((p) => p.amenity_id !== amenity.id), saved]);
      showToast(
        saved.availability === 'CHARGEABLE'
          ? 'Saved — run "Recalculate All Units" on the Pricing tab to apply this to existing units'
          : 'Amenity configuration saved',
        'success',
      );
    } catch (err: any) {
      showError({ message: err?.message || 'Failed to save amenity' });
    } finally {
      setSaving(null);
    }
  };

  const handleRemove = async (amenity: Amenity) => {
    setSaving(amenity.id);
    try {
      await removeProjectAmenity(fetchWithAuth, projectId, amenity.id);
      setConfigured((prev) => prev.filter((p) => p.amenity_id !== amenity.id));
      setRowDrafts((d) => {
        const next = { ...d };
        delete next[amenity.id];
        return next;
      });
      showToast(
        'Removed from project — recalculate to clear its charge from existing units',
        'success',
      );
    } catch (err: any) {
      showError({ message: err?.message || 'Failed to remove amenity' });
    } finally {
      setSaving(null);
    }
  };

  const handleAddCatalogAmenity = async () => {
    if (!newAmenity.name.trim()) {
      showError({ message: 'Name is required' });
      return;
    }
    try {
      const { amenity } = await createCatalogAmenity(fetchWithAuth, newAmenity);
      setCatalog((c) =>
        [...c, amenity].sort(
          (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
        ),
      );
      setNewAmenity({ name: '', category: 'OTHER' });
      setShowAddCatalog(false);
      showToast('Amenity added to catalog', 'success');
    } catch (err: any) {
      showError({ message: err?.message || 'Failed to add amenity' });
    }
  };

  if (loading) {
    return (
      <SectionCard title="Amenities">
        <div className="py-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading amenities...
        </div>
      </SectionCard>
    );
  }

  const grouped = CATEGORIES.map((cat) => ({
    ...cat,
    items: catalog.filter((a) => a.category === cat.value),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      <SectionCard
        title="Project Amenities"
        subtitle="Toggle each catalog amenity Included, Optional, or Chargeable. A chargeable amenity is applied by the pricing engine exactly like a pricing rule."
      >
        {catalog.length === 0 && (
          <p className="text-xs text-slate-400 py-2">
            No amenities in the company catalog yet — add one below.
          </p>
        )}
        <div className="space-y-4">
          {grouped.map((group) => (
            <div key={group.value}>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                {group.label}
              </h4>
              <div className="space-y-2">
                {group.items.map((amenity) => {
                  const isOn = expanded === amenity.id;
                  const existing = configByAmenityId[amenity.id];
                  const draft = draftFor(amenity.id);
                  return (
                    <div
                      key={amenity.id}
                      className="border border-slate-200 rounded-xl bg-white overflow-hidden"
                    >
                      <button
                        onClick={() => setExpanded(isOn ? null : amenity.id)}
                        className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-50"
                      >
                        <div>
                          <p className="text-sm font-bold text-slate-800">{amenity.name}</p>
                          {existing ? (
                            <p className="text-xs text-slate-500">
                              {existing.availability}
                              {existing.availability === 'CHARGEABLE' &&
                              existing.charge_amount != null
                                ? ` • ₹${existing.charge_amount.toLocaleString('en-IN')}${existing.charge_calc_method === 'PER_SQFT' ? '/Sq.Ft' : existing.charge_calc_method === 'PER_SQYD' ? '/Sq.Yd' : existing.charge_calc_method === 'PERCENT_OF_BASE' ? '%' : ''}`
                                : ''}
                              {existing.applicability && existing.applicability !== 'ALL_UNITS'
                                ? ` • ${existing.applicability === 'BY_UNIT_TYPE' ? existing.applicable_unit_type : 'Selected units'}`
                                : ''}
                            </p>
                          ) : (
                            <p className="text-xs text-slate-400">Not added to this project</p>
                          )}
                        </div>
                        <Plus
                          className={`w-4 h-4 text-slate-400 transition-transform ${isOn ? 'rotate-45' : ''}`}
                        />
                      </button>

                      {isOn && (
                        <div className="p-3 border-t border-slate-100 bg-slate-50/50 space-y-3">
                          <div className="flex gap-2">
                            {(['INCLUDED', 'OPTIONAL', 'CHARGEABLE'] as AmenityAvailability[]).map(
                              (opt) => (
                                <button
                                  key={opt}
                                  onClick={() => updateDraft(amenity.id, { availability: opt })}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${draft.availability === opt ? 'bg-navy-700 border-navy-700 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
                                >
                                  {opt.charAt(0) + opt.slice(1).toLowerCase()}
                                </button>
                              ),
                            )}
                          </div>

                          {draft.availability === 'CHARGEABLE' && (
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <FieldLabel>Calculation</FieldLabel>
                                <select
                                  className={selectCls}
                                  value={draft.charge_calc_method}
                                  onChange={(e) =>
                                    updateDraft(amenity.id, {
                                      charge_calc_method: e.target.value as ChargeCalcMethod,
                                    })
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
                                <FieldLabel required>Amount</FieldLabel>
                                <input
                                  className={inputCls}
                                  type="number"
                                  min={0}
                                  value={draft.charge_amount}
                                  onChange={(e) =>
                                    updateDraft(amenity.id, { charge_amount: e.target.value })
                                  }
                                />
                              </div>
                              <div>
                                <FieldLabel>Applies To</FieldLabel>
                                <select
                                  className={selectCls}
                                  value={draft.applicability}
                                  onChange={(e) =>
                                    updateDraft(amenity.id, {
                                      applicability: e.target.value as AmenityApplicability,
                                    })
                                  }
                                >
                                  <option value="ALL_UNITS">All Units</option>
                                  <option value="BY_UNIT_TYPE">A Specific Unit Type</option>
                                  <option value="SELECTED_UNITS">Selected Units Only</option>
                                </select>
                              </div>
                              {draft.applicability === 'BY_UNIT_TYPE' && (
                                <div>
                                  <FieldLabel>Unit Type</FieldLabel>
                                  <select
                                    className={selectCls}
                                    value={draft.applicable_unit_type}
                                    onChange={(e) =>
                                      updateDraft(amenity.id, {
                                        applicable_unit_type: e.target.value as UnitType,
                                      })
                                    }
                                  >
                                    <option value="">Select...</option>
                                    {UNIT_TYPES.map((t) => (
                                      <option key={t} value={t}>
                                        {t}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              {draft.applicability === 'SELECTED_UNITS' && (
                                <div className="col-span-2">
                                  <FieldLabel>Units</FieldLabel>
                                  {units.length === 0 ? (
                                    <p className="text-xs text-slate-400">
                                      No units in this project yet.
                                    </p>
                                  ) : (
                                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 border border-slate-200 rounded-lg bg-white">
                                      {units.map((u) => (
                                        <label
                                          key={u.id}
                                          className={`px-2 py-1 rounded text-[11px] font-semibold cursor-pointer border ${draft.selected_unit_ids.includes(u.id) ? 'bg-navy-50 border-navy-300 text-navy-800' : 'bg-white border-slate-200 text-slate-600'}`}
                                        >
                                          <input
                                            type="checkbox"
                                            className="hidden"
                                            checked={draft.selected_unit_ids.includes(u.id)}
                                            onChange={() => toggleUnit(amenity.id, u.id)}
                                          />
                                          {u.unit_number}
                                        </label>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          <div className="flex justify-between items-center">
                            {existing ? (
                              <button
                                onClick={() => handleRemove(amenity)}
                                disabled={saving === amenity.id}
                                className="flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-800"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Remove from project
                              </button>
                            ) : (
                              <span />
                            )}
                            <button
                              onClick={() => handleSave(amenity)}
                              disabled={saving === amenity.id}
                              className="px-4 py-1.5 text-xs font-black bg-navy-700 hover:bg-navy-800 text-white rounded-lg disabled:opacity-50"
                            >
                              {saving === amenity.id ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Amenity Catalog"
        subtitle="Shared across every project in your company. Add one here, then configure it per-project above."
      >
        <div className="flex flex-wrap gap-1.5 mb-3">
          {catalog.map((a) => (
            <span
              key={a.id}
              className="flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-600 rounded-full text-[11px] font-semibold"
            >
              <Sparkles className="w-3 h-3" />
              {a.name}
            </span>
          ))}
        </div>
        {showAddCatalog ? (
          <div className="p-3 bg-navy-50/50 border border-navy-100 rounded-xl space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel required>Name</FieldLabel>
                <input
                  className={inputCls}
                  value={newAmenity.name}
                  onChange={(e) => setNewAmenity((n) => ({ ...n, name: e.target.value }))}
                  placeholder="e.g. Swimming Pool"
                />
              </div>
              <div>
                <FieldLabel>Category</FieldLabel>
                <select
                  className={selectCls}
                  value={newAmenity.category}
                  onChange={(e) =>
                    setNewAmenity((n) => ({ ...n, category: e.target.value as AmenityCategory }))
                  }
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAddCatalog(false)}
                className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCatalogAmenity}
                className="px-4 py-1.5 text-xs font-black bg-navy-700 hover:bg-navy-800 text-white rounded-lg"
              >
                Add to Catalog
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddCatalog(true)}
            className="flex items-center gap-1.5 text-xs font-bold text-navy-700 hover:text-navy-900"
          >
            <Plus className="w-3.5 h-3.5" /> Add Catalog Amenity
          </button>
        )}
      </SectionCard>
    </div>
  );
};
