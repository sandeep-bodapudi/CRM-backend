import React, { useState, useEffect } from 'react';
import {
  Building2,
  MapPin,
  CheckCircle2,
  ArrowRight,
  Plus,
  CheckSquare,
  X,
  ArrowLeft,
  ChevronRight,
  IndianRupee,
  FileText,
  Info,
  SquareStack,
  Layers,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';
import { handleApiError, toUserFacingError } from '../../utils/userFacingError';
import { DataTable, ColumnDef } from '../ui/DataTable';
import {
  UnitRow,
  PROPERTY_CATEGORIES,
  AMENITIES_BY_TYPE,
  AREA_UNITS,
  FACING_OPTIONS,
  convertToSqft,
  groupForCategory,
  brandForCategory,
  formatINR,
  lookupPincode,
  SectionCard,
  FieldLabel,
  inputCls,
  selectCls,
} from '../properties/propertyWizardShared';

interface BulkUnitWizardProps {
  onClose: () => void;
  onSuccess: () => void;
  /** When launched from a project's own Units tab, skip the project-picker step. */
  preselectedProjectId?: number;
}

/** Shared pricing template applied across every unit added in this wizard. */
interface PropertyPricing {
  base_price_per_unit?: number;
  facing_premium?: number;
  corner_premium?: number;
  park_facing_premium?: number;
  road_facing_premium?: number;
  development_charges?: number;
  maintenance_charges?: number;
  other_charges?: number;
  discount?: number;
}

/** Project-mode steps (extracted from AddPropertyWizard.tsx in Phase 2.20) */
const PROJECT_STEPS = [
  { label: 'Select Project', icon: Building2 },
  { label: 'Unit Type', icon: Layers },
  { label: 'Common Details', icon: FileText },
  { label: 'Pricing Template', icon: IndianRupee },
  { label: 'Add Units', icon: SquareStack },
  { label: 'Amenities', icon: CheckSquare },
  { label: 'Review & Submit', icon: CheckCircle2 },
];

export function BulkUnitWizard({ onSuccess, onClose, preselectedProjectId }: BulkUnitWizardProps) {
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();

  const [projects, setProjects] = useState<any[]>([]);
  const [isLookingUp, setIsLookingUp] = useState(false);

  const firstStep = preselectedProjectId ? 2 : 1;
  const [projectStep, setProjectStep] = useState(firstStep);
  const [selectedProjectId, setSelectedProjectId] = useState(
    preselectedProjectId ? String(preselectedProjectId) : '',
  );
  const [projectCategory, setProjectCategory] = useState('');
  const [projectCommon, setProjectCommon] = useState({
    description: '',
    pincode: '',
    state: '',
    city: '',
    locality: '',
    location: '',
    phase: '',
    block: '',
  });
  const [projectPricing, setProjectPricing] = useState<Partial<PropertyPricing>>({});
  const [projectAreaUnit, setProjectAreaUnit] = useState('SQFT');
  const [projectAmenities, setProjectAmenities] = useState<string[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [unitCount, setUnitCount] = useState(5);
  const [unitPrefix, setUnitPrefix] = useState('Plot-');
  const [unitStartNum, setUnitStartNum] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Explicit high limit: the backend default (previously 50, now 2000)
    // silently truncated this project picker once the company passed that.
    fetchWithAuth(`${API_BASE_URL}/projects?limit=100000`)
      .then((r) => r.json())
      .then((d) => setProjects(d.data || d.projects || []))
      .catch(() => {});
  }, []);

  // Auto-calc unit prices whenever the pricing template changes
  useEffect(() => {
    if (projectPricing.base_price_per_unit) {
      setUnits((prev) =>
        prev.map((u) => {
          const areaVal = u.area ? convertToSqft(u.area, projectAreaUnit) : 0;
          const base = Number(projectPricing.base_price_per_unit || 0) * areaVal;
          const premiums =
            (projectPricing.development_charges || 0) +
            (projectPricing.maintenance_charges || 0) +
            (projectPricing.other_charges || 0) +
            u.extra_charges;
          return {
            ...u,
            base_price: base,
            final_price: base + premiums - (projectPricing.discount || 0),
          };
        }),
      );
    }
  }, [projectPricing, projectAreaUnit]);

  const toggleProjectAmenity = (am: string) =>
    setProjectAmenities((prev) =>
      prev.includes(am) ? prev.filter((a) => a !== am) : [...prev, am],
    );

  const generateUnits = () => {
    const isLand = groupForCategory(projectCategory) === 'LAND';
    const generated: UnitRow[] = Array.from({ length: unitCount }, (_, i) => {
      const num = unitStartNum + i;
      return {
        id: `unit-${Date.now()}-${i}`,
        unit_label: `${unitPrefix}${num}`,
        plot_number: isLand ? `${num}` : '',
        survey_number: '',
        area: '',
        facing: '',
        is_corner: false,
        is_park_facing: false,
        is_road_facing: false,
        is_main_road_facing: false,
        extra_charges: 0,
        base_price: 0,
        final_price: 0,
      };
    });
    setUnits(generated);
  };

  const updateUnit = (id: string, field: keyof UnitRow, value: any) => {
    setUnits((prev) =>
      prev.map((u) => {
        if (u.id !== id) return u;
        const updated = { ...u, [field]: value };
        if (field === 'area' || field === 'extra_charges') {
          const areaVal = (field === 'area' ? value : u.area) as number | '';
          const sqft = areaVal ? convertToSqft(Number(areaVal), projectAreaUnit) : 0;
          const base = Number(projectPricing.base_price_per_unit || 0) * sqft;
          const charges =
            Number(field === 'extra_charges' ? value : u.extra_charges) +
            (projectPricing.development_charges || 0) +
            (projectPricing.maintenance_charges || 0) +
            (projectPricing.other_charges || 0);
          updated.base_price = base;
          updated.final_price = base + charges - (projectPricing.discount || 0);
        }
        return updated;
      }),
    );
  };

  const addEmptyUnit = () => {
    const lastUnit = units[units.length - 1];
    const lastNum = parseInt(lastUnit?.plot_number || '0') + 1;
    setUnits((prev) => [
      ...prev,
      {
        id: `unit-${Date.now()}`,
        unit_label: `${unitPrefix}${lastNum}`,
        plot_number: String(lastNum),
        survey_number: '',
        area: '',
        facing: '',
        is_corner: false,
        is_park_facing: false,
        is_road_facing: false,
        is_main_road_facing: false,
        extra_charges: 0,
        base_price: 0,
        final_price: 0,
      },
    ]);
  };

  const removeUnit = (id: string) => setUnits((prev) => prev.filter((u) => u.id !== id));

  // Phase 2.20: submits the whole batch in ONE request to the dedicated bulk
  // endpoint (Phase 2.19), instead of looping individual POST /properties
  // calls — that loop couldn't realistically handle hundreds/thousands of
  // units and units created that way went through the full PM/DM/MD
  // approval pipeline (blocked without a photo). Bulk units now go LIVE
  // immediately, matching the confirmed product decision.
  const handleSubmit = async () => {
    if (!selectedProjectId || !projectCategory || units.length === 0) {
      showError({ message: 'Please complete all steps before submitting' });
      return;
    }
    const validUnits = units.filter((u) => u.unit_label && u.area);
    if (validUnits.length === 0) {
      showError({ message: 'Please add at least one unit with area filled' });
      return;
    }
    const isLand = groupForCategory(projectCategory) === 'LAND';
    setIsSubmitting(true);
    try {
      const payload = {
        common: {
          category: projectCategory,
          brand_type: brandForCategory(projectCategory),
          description: projectCommon.description,
          location: projectCommon.location,
          pincode: projectCommon.pincode,
          state: projectCommon.state,
          city: projectCommon.city,
          locality: projectCommon.locality,
          amenities: projectAmenities.join(', '),
        },
        units: validUnits.map((unit) => ({
          title: unit.unit_label,
          price: unit.final_price,
          area_sqft: convertToSqft(unit.area, projectAreaUnit),
          facing: unit.facing || undefined,
          pricing: {
            base_price_per_unit: Number(projectPricing.base_price_per_unit || 0),
            base_price: unit.base_price,
            facing_premium: projectPricing.facing_premium || 0,
            corner_premium: unit.is_corner ? projectPricing.corner_premium || 0 : 0,
            park_facing_premium: unit.is_park_facing ? projectPricing.park_facing_premium || 0 : 0,
            road_facing_premium: unit.is_road_facing ? projectPricing.road_facing_premium || 0 : 0,
            development_charges: projectPricing.development_charges || 0,
            maintenance_charges: projectPricing.maintenance_charges || 0,
            other_charges: projectPricing.other_charges || 0,
            discount: projectPricing.discount || 0,
            final_price: unit.final_price,
          },
          plot_details: isLand
            ? {
                plot_number: unit.plot_number,
                survey_number: unit.survey_number,
                is_corner: unit.is_corner,
                is_park_facing: unit.is_park_facing,
              }
            : undefined,
        })),
      };

      const res = await fetchWithAuth(`${API_BASE_URL}/projects/${selectedProjectId}/units/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        await handleApiError(res, showError, payload);
        setIsSubmitting(false);
        return;
      }
      const data = await res.json();
      const created = data.created ?? 0;
      const failed = data.failed ?? [];

      if (created > 0) {
        showToast(
          `${created} unit${created > 1 ? 's' : ''} created and live${failed.length > 0 ? ` — ${failed.length} failed` : ''}!`,
          failed.length > 0 ? 'error' : 'success',
        );
        onSuccess();
      } else {
        showError({
          message: failed[0]?.error || 'All unit submissions failed. Please try again.',
        });
      }
    } catch (e) {
      showError(
        toUserFacingError({ message: e instanceof Error ? e.message : String(e), body: e }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProjectNext = () => {
    if (projectStep === 1 && !selectedProjectId) {
      showError({ message: 'Please select a project' });
      return;
    }
    if (projectStep === 2 && !projectCategory) {
      showError({ message: 'Please select a unit type' });
      return;
    }
    if (projectStep === 3 && !projectCommon.location) {
      showError({ message: 'Location is required' });
      return;
    }
    if (projectStep === 4 && !projectPricing.base_price_per_unit) {
      showError({ message: 'Base price per unit is required' });
      return;
    }
    if (projectStep === 5 && units.length === 0) {
      showError({ message: 'Please generate or add at least one unit' });
      return;
    }
    setProjectStep((s) => Math.min(s + 1, PROJECT_STEPS.length));
  };
  const handleProjectBack = () => setProjectStep((s) => Math.max(s - 1, firstStep));

  const renderProjectStep = () => {
    const selectedProject = projects.find((p) => String(p.id) === selectedProjectId);

    switch (projectStep) {
      case 1:
        return (
          <div className="space-y-5 animate-fadeIn">
            <div>
              <h2 className="text-2xl font-black text-slate-800 mb-1">Select Project</h2>
              <p className="text-sm text-slate-500">Which project are you adding units to?</p>
            </div>
            {projects.length === 0 ? (
              <div className="p-6 bg-amber-50 border border-amber-200 rounded-2xl text-center">
                <Building2 className="w-12 h-12 text-amber-400 mx-auto mb-3" />
                <p className="font-bold text-amber-800 mb-1">No projects found</p>
                <p className="text-sm text-amber-600">
                  Create a project first from the Projects section, then return to add units.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProjectId(String(p.id))}
                    className={`p-4 rounded-2xl border-2 text-left transition-all ${String(p.id) === selectedProjectId ? 'border-navy-600 bg-navy-50 shadow-md' : 'border-slate-200 hover:border-navy-300 bg-white'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-black text-slate-800 text-sm">{p.name}</p>
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3" /> {p.location}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {p.total_units && (
                          <span className="text-xs text-slate-500 font-medium">
                            {p.total_units} total units
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                            p.status === 'COMPLETED'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : p.status === 'UNDER_CONSTRUCTION'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {p.status?.replace(/_/g, ' ')}
                        </span>
                        {String(p.id) === selectedProjectId && (
                          <CheckCircle2 className="w-5 h-5 text-navy-600" />
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        );

      case 2:
        return (
          <div className="space-y-5 animate-fadeIn">
            <div>
              <h2 className="text-2xl font-black text-slate-800 mb-1">Unit Type</h2>
              <p className="text-sm text-slate-500">
                What type of units are you adding to <strong>{selectedProject?.name}</strong>?
              </p>
            </div>
            {(['RESIDENTIAL', 'LAND', 'COMMERCIAL'] as const).map((grp) => (
              <div key={grp}>
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                  {grp === 'RESIDENTIAL'
                    ? '🏠 Residential'
                    : grp === 'LAND'
                      ? '🌿 Land'
                      : '🏢 Commercial'}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {PROPERTY_CATEGORIES.filter((c) => c.group === grp).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setProjectCategory(c.id)}
                      className={`p-3.5 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all font-semibold text-sm ${
                        projectCategory === c.id
                          ? 'border-navy-600 bg-navy-50 text-navy-800 shadow-md'
                          : 'border-slate-200 hover:border-navy-300 bg-white text-slate-700'
                      }`}
                    >
                      <c.icon
                        className={`w-5 h-5 ${projectCategory === c.id ? 'text-navy-600' : 'text-slate-400'}`}
                      />
                      <span className="text-center leading-tight text-xs">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );

      case 3:
        return (
          <div className="space-y-5 animate-fadeIn">
            <div>
              <h2 className="text-2xl font-black text-slate-800 mb-1">Common Details</h2>
              <p className="text-sm text-slate-500">
                These details apply to all units. Individual units can override where needed.
              </p>
            </div>
            <SectionCard
              title="Project Location"
              subtitle="Shared location for all units in this batch"
            >
              <div className="space-y-4">
                <div className="p-3 bg-navy-50 border border-navy-100 rounded-xl">
                  <p className="text-[11px] font-bold text-navy-700 mb-2">Auto-fill via Pincode</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      value={projectCommon.pincode}
                      onChange={(e) =>
                        setProjectCommon((p) => ({
                          ...p,
                          pincode: e.target.value.replace(/\D/g, ''),
                        }))
                      }
                      className="flex-1 p-2.5 border border-navy-200 rounded-xl text-sm bg-white"
                      placeholder="6-digit pincode"
                    />
                    <button
                      onClick={async () => {
                        setIsLookingUp(true);
                        await lookupPincode(
                          projectCommon.pincode,
                          (s, c, l, loc) =>
                            setProjectCommon((p) => ({
                              ...p,
                              state: s,
                              city: c,
                              locality: l,
                              location: p.location || loc,
                            })),
                          showError,
                          showToast,
                        );
                        setIsLookingUp(false);
                      }}
                      disabled={isLookingUp || projectCommon.pincode.length !== 6}
                      className="px-4 py-2.5 bg-navy-700 text-white font-bold rounded-xl disabled:opacity-50 text-sm hover:bg-navy-800"
                    >
                      {isLookingUp ? '...' : 'Lookup'}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>State</FieldLabel>
                    <input
                      type="text"
                      value={projectCommon.state}
                      onChange={(e) => setProjectCommon((p) => ({ ...p, state: e.target.value }))}
                      className={inputCls}
                      placeholder="e.g. Telangana"
                    />
                  </div>
                  <div>
                    <FieldLabel>City</FieldLabel>
                    <input
                      type="text"
                      value={projectCommon.city}
                      onChange={(e) => setProjectCommon((p) => ({ ...p, city: e.target.value }))}
                      className={inputCls}
                      placeholder="e.g. Hyderabad"
                    />
                  </div>
                  <div className="col-span-2">
                    <FieldLabel>Locality</FieldLabel>
                    <input
                      type="text"
                      value={projectCommon.locality}
                      onChange={(e) =>
                        setProjectCommon((p) => ({ ...p, locality: e.target.value }))
                      }
                      className={inputCls}
                      placeholder="e.g. Miyapur"
                    />
                  </div>
                  <div className="col-span-2">
                    <FieldLabel required>Full Address / Landmark</FieldLabel>
                    <div className="relative">
                      <MapPin className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={projectCommon.location}
                        onChange={(e) =>
                          setProjectCommon((p) => ({ ...p, location: e.target.value }))
                        }
                        className={inputCls + ' pl-9'}
                        placeholder="Survey number, landmark, full address"
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>Phase</FieldLabel>
                    <input
                      type="text"
                      value={projectCommon.phase}
                      onChange={(e) => setProjectCommon((p) => ({ ...p, phase: e.target.value }))}
                      className={inputCls}
                      placeholder="e.g. Phase 1"
                    />
                  </div>
                  <div>
                    <FieldLabel>Block / Sector</FieldLabel>
                    <input
                      type="text"
                      value={projectCommon.block}
                      onChange={(e) => setProjectCommon((p) => ({ ...p, block: e.target.value }))}
                      className={inputCls}
                      placeholder="e.g. Block A"
                    />
                  </div>
                </div>
                <div>
                  <FieldLabel>Common Description / USPs</FieldLabel>
                  <textarea
                    rows={3}
                    value={projectCommon.description}
                    onChange={(e) =>
                      setProjectCommon((p) => ({ ...p, description: e.target.value }))
                    }
                    className={inputCls + ' resize-none'}
                    placeholder="Describe the project's key features, investment potential, approvals..."
                  />
                </div>
              </div>
            </SectionCard>
          </div>
        );

      case 4: {
        const isLand = groupForCategory(projectCategory) === 'LAND';
        return (
          <div className="space-y-5 animate-fadeIn">
            <div>
              <h2 className="text-2xl font-black text-slate-800 mb-1">Pricing Template</h2>
              <p className="text-sm text-slate-500">
                Set the base pricing rate. Individual units will auto-calculate based on their area.
              </p>
            </div>
            <SectionCard
              title="Base Rate"
              subtitle="This rate applies to all units; individual prices computed from rate × area"
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel required>Price per {isLand ? 'Sq.Yd' : 'Sq.Ft'} (₹)</FieldLabel>
                  <input
                    type="number"
                    value={projectPricing.base_price_per_unit || ''}
                    onChange={(e) =>
                      setProjectPricing((p) => ({
                        ...p,
                        base_price_per_unit: Number(e.target.value),
                      }))
                    }
                    className={inputCls}
                    placeholder="e.g. 5000"
                  />
                </div>
                <div>
                  <FieldLabel>Area Unit for this Project</FieldLabel>
                  <select
                    value={projectAreaUnit}
                    onChange={(e) => setProjectAreaUnit(e.target.value)}
                    className={selectCls}
                  >
                    {AREA_UNITS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </SectionCard>
            <SectionCard
              title="Premium Charges"
              subtitle="These are defaults; you can override per unit in the next step"
            >
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Corner Premium (₹)', key: 'corner_premium' },
                  { label: 'Park Facing Premium (₹)', key: 'park_facing_premium' },
                  { label: 'Road Facing Premium (₹)', key: 'road_facing_premium' },
                  { label: 'Main Road Premium (₹)', key: 'facing_premium' },
                ].map((f) => (
                  <div key={f.key}>
                    <FieldLabel>{f.label}</FieldLabel>
                    <input
                      type="number"
                      value={(projectPricing as any)[f.key] || ''}
                      onChange={(e) =>
                        setProjectPricing((p) => ({ ...p, [f.key]: Number(e.target.value) }))
                      }
                      className={inputCls}
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
            </SectionCard>
            <SectionCard title="Mandatory Charges (applies to all units)">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Development Charges (₹)', key: 'development_charges' },
                  { label: 'Maintenance Charges (₹)', key: 'maintenance_charges' },
                  { label: 'Other Charges (₹)', key: 'other_charges' },
                  { label: 'Discount (₹)', key: 'discount', isDiscount: true },
                ].map((f) => (
                  <div key={f.key}>
                    <FieldLabel>
                      <span className={f.isDiscount ? 'text-emerald-600' : ''}>{f.label}</span>
                    </FieldLabel>
                    <input
                      type="number"
                      value={(projectPricing as any)[f.key] || ''}
                      onChange={(e) =>
                        setProjectPricing((p) => ({ ...p, [f.key]: Number(e.target.value) }))
                      }
                      className={inputCls}
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        );
      }

      case 5: {
        const isLand = groupForCategory(projectCategory) === 'LAND';
        return (
          <div className="space-y-5 animate-fadeIn">
            <div>
              <h2 className="text-2xl font-black text-slate-800 mb-1">Add Units</h2>
              <p className="text-sm text-slate-500">
                Generate units in bulk or add individually. Each unit gets its own area, facing, and
                price.
              </p>
            </div>

            <SectionCard
              title="🚀 Bulk Generator"
              subtitle="Generate multiple units at once with auto-numbered labels"
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <div>
                  <FieldLabel>Label Prefix</FieldLabel>
                  <input
                    type="text"
                    value={unitPrefix}
                    onChange={(e) => setUnitPrefix(e.target.value)}
                    className={inputCls}
                    placeholder="Plot-"
                  />
                </div>
                <div>
                  <FieldLabel>Starting Number</FieldLabel>
                  <input
                    type="number"
                    value={unitStartNum}
                    onChange={(e) => setUnitStartNum(Number(e.target.value))}
                    className={inputCls}
                    placeholder="1"
                    min={1}
                  />
                </div>
                <div>
                  <FieldLabel>Number of Units</FieldLabel>
                  <input
                    type="number"
                    value={unitCount}
                    onChange={(e) => setUnitCount(Number(e.target.value))}
                    className={inputCls}
                    placeholder="10"
                    min={1}
                    max={500}
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={generateUnits}
                    className="w-full py-3 bg-navy-700 hover:bg-navy-800 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
                  >
                    <SquareStack className="w-4 h-4" /> Generate {unitCount}
                  </button>
                </div>
              </div>
              {units.length === 0 && (
                <div className="text-xs text-slate-400 italic text-center py-2">
                  No units generated yet. Click Generate to create unit rows.
                </div>
              )}
              {unitCount > 500 && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2">
                  A single batch is capped at 500 units — generate and submit in multiple batches
                  for larger projects.
                </div>
              )}
            </SectionCard>

            {units.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-black text-slate-700 text-sm">
                    {units.length} Unit{units.length !== 1 ? 's' : ''} Configured
                  </h3>
                  <button
                    onClick={addEmptyUnit}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold rounded-xl text-xs hover:bg-emerald-100 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Unit
                  </button>
                </div>
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <DataTable<UnitRow>
                    columns={[
                      {
                        key: 'unit_label',
                        header: 'Unit Label',
                        render: (unit) => (
                          <input
                            type="text"
                            value={unit.unit_label}
                            onChange={(e) => updateUnit(unit.id, 'unit_label', e.target.value)}
                            className="w-full p-1.5 border border-slate-200 rounded-lg text-xs font-semibold min-w-[100px]"
                          />
                        ),
                      },
                      ...(isLand
                        ? [
                            {
                              key: 'plot_number',
                              header: 'Plot No.',
                              render: (unit: UnitRow) => (
                                <input
                                  type="text"
                                  value={unit.plot_number}
                                  onChange={(e) =>
                                    updateUnit(unit.id, 'plot_number', e.target.value)
                                  }
                                  className="w-full p-1.5 border border-slate-200 rounded-lg text-xs w-16"
                                  placeholder="No."
                                />
                              ),
                            } as ColumnDef<UnitRow>,
                          ]
                        : []),
                      {
                        key: 'area',
                        header: `Area (${projectAreaUnit})`,
                        render: (unit) => (
                          <input
                            type="number"
                            value={unit.area || ''}
                            onChange={(e) =>
                              updateUnit(
                                unit.id,
                                'area',
                                e.target.value ? Number(e.target.value) : '',
                              )
                            }
                            className="w-full p-1.5 border border-slate-200 rounded-lg text-xs w-20"
                            placeholder="Area"
                          />
                        ),
                      },
                      {
                        key: 'facing',
                        header: 'Facing',
                        render: (unit) => (
                          <select
                            value={unit.facing}
                            onChange={(e) => updateUnit(unit.id, 'facing', e.target.value)}
                            className="w-full p-1.5 border border-slate-200 rounded-lg text-xs bg-white min-w-[80px]"
                          >
                            <option value="">—</option>
                            {FACING_OPTIONS.map((f) => (
                              <option key={f.value} value={f.value}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        ),
                      },
                      ...(isLand
                        ? [
                            {
                              key: 'is_corner',
                              header: 'Corner',
                              render: (unit: UnitRow) => (
                                <input
                                  type="checkbox"
                                  checked={unit.is_corner}
                                  onChange={(e) =>
                                    updateUnit(unit.id, 'is_corner', e.target.checked)
                                  }
                                  className="w-3.5 h-3.5 accent-navy-600"
                                />
                              ),
                            } as ColumnDef<UnitRow>,
                            {
                              key: 'is_park_facing',
                              header: 'Park Facing',
                              render: (unit: UnitRow) => (
                                <input
                                  type="checkbox"
                                  checked={unit.is_park_facing}
                                  onChange={(e) =>
                                    updateUnit(unit.id, 'is_park_facing', e.target.checked)
                                  }
                                  className="w-3.5 h-3.5 accent-navy-600"
                                />
                              ),
                            } as ColumnDef<UnitRow>,
                            {
                              key: 'is_road_facing',
                              header: 'Road Facing',
                              render: (unit: UnitRow) => (
                                <input
                                  type="checkbox"
                                  checked={unit.is_road_facing}
                                  onChange={(e) =>
                                    updateUnit(unit.id, 'is_road_facing', e.target.checked)
                                  }
                                  className="w-3.5 h-3.5 accent-navy-600"
                                />
                              ),
                            } as ColumnDef<UnitRow>,
                          ]
                        : []),
                      {
                        key: 'final_price',
                        header: 'Final Price',
                        render: (unit) => (
                          <span
                            className={`font-bold ${unit.final_price > 0 ? 'text-navy-800' : 'text-slate-300'}`}
                          >
                            {unit.final_price > 0 ? formatINR(unit.final_price) : '—'}
                          </span>
                        ),
                      },
                      {
                        key: 'actions',
                        header: '',
                        render: (unit) => (
                          <button
                            onClick={() => removeUnit(unit.id)}
                            className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        ),
                      },
                    ]}
                    data={units}
                    searchable={false}
                    emptyMessage="No units generated yet."
                  />
                  <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      {units.filter((u) => u.area).length} of {units.length} units have area filled
                    </span>
                    <span className="text-xs font-bold text-navy-800">
                      Total: {formatINR(units.reduce((sum, u) => sum + u.final_price, 0))}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      }

      case 6:
        return (
          <div className="space-y-5 animate-fadeIn">
            <div>
              <h2 className="text-2xl font-black text-slate-800 mb-1">Amenities</h2>
              <p className="text-sm text-slate-500">
                Select all amenities that apply to this project ({projectAmenities.length} selected)
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {(AMENITIES_BY_TYPE[groupForCategory(projectCategory)] || AMENITIES_BY_TYPE.LAND).map(
                (am) => (
                  <button
                    key={am.label}
                    onClick={() => toggleProjectAmenity(am.label)}
                    className={`p-3 rounded-xl border-2 flex items-center gap-2 transition-all text-sm font-semibold text-left ${projectAmenities.includes(am.label) ? 'bg-navy-50 border-navy-500 text-navy-800 shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:border-navy-300'}`}
                  >
                    <span className="text-lg leading-none">{am.icon}</span>
                    <div
                      className={`w-3.5 h-3.5 rounded-sm border-2 flex-shrink-0 ${projectAmenities.includes(am.label) ? 'bg-navy-600 border-navy-600' : 'border-slate-300'}`}
                    />
                    <span className="flex-1 text-xs leading-tight">{am.label}</span>
                  </button>
                ),
              )}
            </div>
          </div>
        );

      case 7: {
        const validUnits = units.filter((u) => u.unit_label && u.area);
        const totalValue = validUnits.reduce((sum, u) => sum + u.final_price, 0);
        return (
          <div className="space-y-5 animate-fadeIn">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-600 to-teal-700 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-xl">
                <CheckCircle2 className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-black text-slate-800 mb-2">Ready to Submit</h2>
              <p className="text-slate-500 text-sm max-w-md mx-auto">
                {validUnits.length} unit{validUnits.length !== 1 ? 's' : ''} will be created and go
                LIVE immediately.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SectionCard title="Project">
                <div className="space-y-1 text-sm">
                  <p className="font-black text-slate-800">{selectedProject?.name}</p>
                  <p className="text-slate-500">{projectCommon.location}</p>
                  <p className="text-[11px] text-navy-600 font-semibold">
                    {PROPERTY_CATEGORIES.find((c) => c.id === projectCategory)?.label}
                  </p>
                </div>
              </SectionCard>
              <SectionCard title="Batch Summary">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Units to Create</span>
                    <span className="font-black text-navy-800 text-lg">{validUnits.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Price/Unit (base)</span>
                    <span className="font-bold">
                      ₹{(projectPricing.base_price_per_unit || 0).toLocaleString('en-IN')} /{' '}
                      {projectAreaUnit}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-100 pt-2">
                    <span className="text-slate-500">Total Batch Value</span>
                    <span className="font-black text-emerald-700">{formatINR(totalValue)}</span>
                  </div>
                </div>
              </SectionCard>
            </div>
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2">
              <Info className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-emerald-800">
                Units created here go <strong>LIVE immediately</strong> — no PM/DM/MD approval step
                and no photo required. Submitted as one batch; if a row fails (e.g. duplicate plot
                number), the rest still go through.
              </div>
            </div>
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="flex bg-white rounded-3xl shadow-2xl overflow-hidden max-w-5xl w-full border border-slate-100 min-h-[640px] max-h-[95vh]">
        <div className="hidden md:flex flex-col p-6 bg-gradient-to-b from-slate-900 to-slate-800 w-60 shrink-0 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-1">
              <SquareStack className="w-4 h-4 text-navy-300" />
              <h3 className="font-black text-white text-base">Project Units</h3>
            </div>
            <p className="text-slate-400 text-[11px]">Add units to an existing project</p>
          </div>
          <div className="space-y-1 flex-1">
            {PROJECT_STEPS.map((s, i) => {
              const stepNum = i + 1;
              if (preselectedProjectId && stepNum === 1) return null; // project already chosen
              const isActive = projectStep === stepNum;
              const isPassed = projectStep > stepNum;
              const StepIcon = s.icon;
              return (
                <button
                  key={s.label}
                  onClick={() => (isPassed ? setProjectStep(stepNum) : undefined)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${isActive ? 'bg-emerald-700 text-white' : isPassed ? 'text-slate-300 hover:bg-white/10 cursor-pointer' : 'text-slate-500 cursor-default'}`}
                >
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-white/20' : isPassed ? 'bg-emerald-500/20' : 'bg-white/5'}`}
                  >
                    {isPassed ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <StepIcon className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <span>{s.label}</span>
                  {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-60" />}
                </button>
              );
            })}
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-[10px] text-slate-400 mb-1.5">
              <span>Progress</span>
              <span>
                {Math.round(((projectStep - firstStep) / (PROJECT_STEPS.length - firstStep)) * 100)}
                %
              </span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                style={{
                  width: `${((projectStep - firstStep) / (PROJECT_STEPS.length - firstStep)) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>
        <div className="flex-1 flex flex-col max-h-[95vh] overflow-hidden">
          <div className="md:hidden p-4 flex items-center justify-between border-b border-slate-100 bg-slate-50 shrink-0">
            <div>
              <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wide">
                Step {projectStep} of {PROJECT_STEPS.length}
              </span>
              <p className="font-bold text-slate-800 text-sm">
                {PROJECT_STEPS[projectStep - 1]?.label}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 md:p-8 flex-1 overflow-y-auto">{renderProjectStep()}</div>
          <div className="p-4 md:p-5 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between shrink-0">
            <button
              onClick={projectStep === firstStep ? onClose : handleProjectBack}
              className="flex items-center gap-1.5 px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-200 rounded-xl transition-colors text-sm"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            {projectStep < PROJECT_STEPS.length ? (
              <button
                onClick={handleProjectNext}
                disabled={
                  (projectStep === 1 && !selectedProjectId) ||
                  (projectStep === 2 && !projectCategory)
                }
                className="flex items-center gap-2 px-7 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 text-sm"
              >
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-7 py-2.5 bg-gradient-to-r from-navy-700 to-slate-800 text-white font-bold text-sm rounded-xl shadow-lg hover:from-navy-800 hover:to-slate-900 transition-all disabled:opacity-70"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Submit {units.filter((u) => u.unit_label && u.area).length} Units
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
