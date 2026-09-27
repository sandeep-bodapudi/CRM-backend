import React, { useEffect, useState } from 'react';
import {
  Building2,
  MapPin,
  Layers,
  ShieldCheck,
  IndianRupee,
  CheckSquare,
  Users,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  X,
  ChevronRight,
  Plus,
  Trash2,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';
import { Roles } from '../../shared';
import { ProjectListItem } from '../../types';
import { handleApiError, toUserFacingError } from '../../utils/userFacingError';
import {
  lookupPincode,
  SectionCard,
  FieldLabel,
  inputCls,
  selectCls,
} from '../properties/propertyWizardShared';
import { listPricingRules, PricingRule } from '../../api/projectUnits';
import { PricingRulesPanel } from './PricingRulesPanel';

interface ProjectWizardProps {
  onClose: () => void;
  onSuccess: () => void;
  /** Edit mode when provided. */
  initialData?: ProjectListItem;
}

const STEPS = [
  { label: 'Identity', icon: Building2 },
  { label: 'Location', icon: MapPin },
  { label: 'Project Size & Units', icon: Layers },
  { label: 'Approvals & Compliance', icon: ShieldCheck },
  { label: 'Pricing Rules', icon: IndianRupee },
  { label: 'Amenities', icon: CheckSquare },
  { label: 'Team & Review', icon: Users },
];

// #13: real Telangana approval bodies, replacing the old RERA/DTCP/HMDA/
// PANCHAYAT-only single-select. "Gram Panchayat" replaces the old bare
// "Panchayat" label per the user's correction.
const KNOWN_APPROVAL_AUTHORITIES = [
  { value: 'RERA', label: 'RERA (Telangana)' },
  { value: 'DTCP', label: 'DTCP' },
  { value: 'HMDA', label: 'HMDA' },
  { value: 'GHMC', label: 'GHMC' },
  { value: 'MUDA', label: 'MUDA' },
  { value: 'YTDA', label: 'YTDA (Yadadri Temple Development Authority)' },
  { value: 'KUDA', label: 'KUDA (Karimnagar UDA)' },
  { value: 'WUDA', label: 'WUDA (Warangal UDA)' },
  { value: 'HYDRAA', label: 'HYDRAA' },
  { value: 'GRAM_PANCHAYAT', label: 'Gram Panchayat' },
  { value: 'MUNICIPALITY', label: 'Municipality' },
];

const PROJECT_TYPES = [
  { value: 'PLOTTED', label: 'Plotted Development' },
  { value: 'APARTMENT', label: 'Apartment / Flats' },
  { value: 'VILLA', label: 'Villas' },
  { value: 'INDEPENDENT_HOUSE', label: 'Independent Houses' },
  { value: 'ROW_HOUSE', label: 'Row Houses' },
  { value: 'AGRICULTURAL_LAND', label: 'Agricultural / Farm Land' },
  { value: 'FARM_HOUSE', label: 'Farm Houses' },
  { value: 'COMMERCIAL_SHOP', label: 'Commercial Shops' },
  { value: 'COMMERCIAL_OFFICE', label: 'Commercial Office Space' },
  { value: 'MIXED_RESIDENTIAL', label: 'Mixed Residential (Flats + Villas)' },
  { value: 'MIXED_USE', label: 'Mixed Use (Residential + Commercial)' },
  { value: 'TOWNSHIP', label: 'Township' },
  { value: 'GATED_COMMUNITY', label: 'Gated Community' },
  { value: 'OTHER', label: 'Other' },
];

const AREA_UNITS = [
  { value: 'SQFT', label: 'Sq.Ft' },
  { value: 'SQYD', label: 'Sq.Yds' },
  { value: 'ACRE', label: 'Acres' },
  { value: 'GUNTA', label: 'Guntas' },
  { value: 'CENT', label: 'Cents' },
];

const PRICE_BASIS_OPTIONS = [
  { value: 'SUPER_BUILT_UP', label: 'Super Built-up Area (flats)' },
  { value: 'BUILT_UP', label: 'Built-up Area' },
  { value: 'CARPET', label: 'Carpet Area' },
  { value: 'PLOT_AREA', label: 'Plot Area (Sq.Yd)' },
  { value: 'LUMPSUM', label: 'Lump Sum (no area math)' },
];

const AMENITY_CHECKLIST = [
  'Swimming Pool',
  'Club House',
  "Children's Play Area",
  'Gymnasium',
  'Security & CCTV',
  'Landscaped Gardens',
  'Internal Roads',
  'Street Lighting',
  'Power Backup',
  'Rainwater Harvesting',
  'Visitor Parking',
  'Jogging Track',
  'Indoor Games',
  'Entrance Arch',
  'Water Supply',
  'Solar Lighting',
];

export const ProjectWizard: React.FC<ProjectWizardProps> = ({
  onClose,
  onSuccess,
  initialData,
}) => {
  const { fetchWithAuth, activeRole } = useAuth();
  const { showToast, showError } = useToast();
  const isEdit = !!initialData;

  const [step, setStep] = useState(1);
  const [projectId, setProjectId] = useState<number | null>(initialData?.id ?? null);
  const [isSaving, setIsSaving] = useState(false);

  // Step 1 — Identity
  const [name, setName] = useState(initialData?.name || '');
  const [projectType, setProjectType] = useState(initialData?.project_type || '');
  const [developerName, setDeveloperName] = useState(initialData?.developer_name || '');
  const [status, setStatus] = useState(initialData?.status || 'PLANNING');
  const [description, setDescription] = useState(initialData?.description || '');
  const [location, setLocation] = useState(initialData?.location || '');

  // Step 2 — Location
  const [state, setState] = useState(initialData?.state || '');
  const [district, setDistrict] = useState(initialData?.district || '');
  const [city, setCity] = useState(initialData?.city || '');
  const [mandal, setMandal] = useState(initialData?.mandal || '');
  const [village, setVillage] = useState(initialData?.village || '');
  const [locality, setLocality] = useState(initialData?.locality || '');
  const [address, setAddress] = useState(initialData?.address || '');
  const [pincode, setPincode] = useState(initialData?.pincode || '');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [latitude, setLatitude] = useState(
    initialData?.latitude != null ? String(initialData.latitude) : '',
  );
  const [longitude, setLongitude] = useState(
    initialData?.longitude != null ? String(initialData.longitude) : '',
  );
  const [mapsLink, setMapsLink] = useState(initialData?.maps_link || '');

  // Step 3 — Scale & Configuration
  const [totalAreaValue, setTotalAreaValue] = useState(
    initialData?.total_area_value != null ? String(initialData.total_area_value) : '',
  );
  const [totalAreaUnit, setTotalAreaUnit] = useState(initialData?.total_area_unit || 'ACRE');
  const [towersCount, setTowersCount] = useState(
    initialData?.towers_count != null ? String(initialData.towers_count) : '',
  );
  const [blocksCount, setBlocksCount] = useState(
    initialData?.blocks_count != null ? String(initialData.blocks_count) : '',
  );
  const [floorsCount, setFloorsCount] = useState(
    initialData?.floors_count != null ? String(initialData.floors_count) : '',
  );
  const [totalUnits, setTotalUnits] = useState<number | ''>(initialData?.total_units ?? '');
  const [projectPhase, setProjectPhase] = useState(initialData?.project_phase || '');
  const [launchDate, setLaunchDate] = useState(
    initialData?.launch_date ? new Date(initialData.launch_date).toISOString().split('T')[0] : '',
  );
  const [completionDate, setCompletionDate] = useState(
    initialData?.completion_date
      ? new Date(initialData.completion_date).toISOString().split('T')[0]
      : '',
  );

  // Step 4 — Approvals & Compliance
  const [reraStatus, setReraStatus] = useState(initialData?.rera_status || 'NOT_APPLICABLE');
  const [reraNumber, setReraNumber] = useState(initialData?.rera_number || '');
  // #13: multi-select (a project can need sign-off from more than one
  // Telangana authority at once), with an "Other" free-text escape hatch
  // (#14). Pre-fills from the old single-value column when a project was
  // created before this field existed, so nothing appears to vanish.
  const [approvalAuthorities, setApprovalAuthorities] = useState<string[]>(
    initialData?.approval_authorities?.length
      ? initialData.approval_authorities
      : initialData?.approval_authority
        ? [initialData.approval_authority]
        : [],
  );
  const [approvalAuthorityOther, setApprovalAuthorityOther] = useState('');
  const [approvalNumber, setApprovalNumber] = useState(initialData?.approval_number || '');
  const [lpNumber, setLpNumber] = useState(initialData?.lp_number || '');

  // Step 5 — Pricing Rules
  const [defaultPriceBasis, setDefaultPriceBasis] = useState(
    initialData?.default_price_basis || 'SUPER_BUILT_UP',
  );
  const [defaultAreaUnit, setDefaultAreaUnit] = useState(initialData?.default_area_unit || 'SQFT');
  // ruleCount is only for the Step 7 summary — PricingRulesPanel owns its own state.
  const [ruleCount, setRuleCount] = useState(0);

  // Step 6 — Amenities (simple checklist stored in the legacy Project.amenities
  // JSON field for now — the rich Included/Optional/Chargeable model is a
  // Phase 3 deliverable per the implementation plan).
  const [amenities, setAmenities] = useState<string[]>(
    Array.isArray((initialData as any)?.amenities) ? (initialData as any).amenities : [],
  );

  // Step 7 — Team & Review
  const [pms, setPms] = useState<any[]>([]);
  const [assignedPmId, setAssignedPmId] = useState<string>(
    initialData?.assigned_pm_id ? String(initialData.assigned_pm_id) : '',
  );

  // Inventory Executive enters projects on a PM's behalf and must name that
  // PM (they review and submit it); they get a PM-only lookup since their
  // own employee scope doesn't include the PMs.
  const isInventoryExecutive = activeRole === Roles.INVENTORY_EXECUTIVE;

  useEffect(() => {
    if (isInventoryExecutive) {
      fetchWithAuth(`${API_BASE_URL}/employees?role=PROJECT_MANAGER`)
        .then((res) => res.json())
        .then((data) => {
          if (data.employees) setPms(data.employees);
        })
        .catch(() => {});
      return;
    }
    if (([Roles.MD, Roles.ADMIN, Roles.HR_MANAGER] as string[]).includes(activeRole)) {
      fetchWithAuth(`${API_BASE_URL}/employees`)
        .then((res) => res.json())
        .then((data) => {
          if (data.employees)
            setPms(
              data.employees.filter((e: any) =>
                e.roles?.some((r: string) => r.includes(Roles.PROJECT_MANAGER)),
              ),
            );
        })
        .catch(() => {});
    }
  }, [activeRole, fetchWithAuth, isInventoryExecutive]);

  useEffect(() => {
    if ((step === 5 || step === 7) && projectId) {
      listPricingRules(fetchWithAuth, projectId)
        .then(({ rules }) => setRuleCount(rules.length))
        .catch(() => {});
    }
  }, [step, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const num = (v: string) => (v.trim() === '' ? null : Number(v));

  // Each step's own field subset — sent as a PUT once the project exists, or
  // folded into the initial POST on step 1. This is the "draft autosave":
  // once step 1 is submitted the project exists in the database, so closing
  // the wizard afterward never loses what was already entered.
  const buildStepPayload = (forStep: number): Record<string, any> => {
    switch (forStep) {
      case 1:
        return {
          name,
          location: location || city || 'TBD',
          description,
          project_type: projectType || null,
          developer_name: developerName || null,
          ...(isEdit ? { status } : {}),
        };
      case 2:
        return {
          state: state || null,
          district: district || null,
          city: city || null,
          mandal: mandal || null,
          village: village || null,
          locality: locality || null,
          address: address || null,
          pincode: pincode || null,
          latitude: num(latitude),
          longitude: num(longitude),
          maps_link: mapsLink || null,
          location: location || [locality, city].filter(Boolean).join(', ') || location,
        };
      case 3:
        return {
          total_area_value: num(totalAreaValue),
          total_area_unit: totalAreaUnit || null,
          towers_count: num(towersCount),
          blocks_count: num(blocksCount),
          floors_count: num(floorsCount),
          total_units: totalUnits === '' ? null : totalUnits,
          project_phase: projectPhase || null,
          launch_date: launchDate ? new Date(launchDate).toISOString() : null,
          completion_date: completionDate ? new Date(completionDate).toISOString() : null,
        };
      case 4:
        return {
          rera_status: reraStatus || null,
          rera_number: reraNumber || null,
          approval_authorities: approvalAuthorities.length ? approvalAuthorities : null,
          approval_number: approvalNumber || null,
          lp_number: lpNumber || null,
        };
      case 5:
        return {
          default_price_basis: defaultPriceBasis || null,
          default_area_unit: defaultAreaUnit || null,
        };
      case 6:
        return { amenities };
      case 7:
        return { assigned_pm_id: assignedPmId ? parseInt(assignedPmId, 10) : null };
      default:
        return {};
    }
  };

  const saveStep = async (forStep: number): Promise<boolean> => {
    if (forStep === 1 && !name.trim()) {
      showError({ message: 'Project name is required' });
      return false;
    }
    setIsSaving(true);
    try {
      const payload = buildStepPayload(forStep);
      const isCreate = forStep === 1 && !projectId;
      const url = isCreate ? `${API_BASE_URL}/projects` : `${API_BASE_URL}/projects/${projectId}`;
      const res = await fetchWithAuth(url, {
        method: isCreate ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        await handleApiError(res, showError, data);
        return false;
      }
      if (isCreate) {
        setProjectId(data.project.id);
        showToast(
          'Project created — you can continue filling details or finish anytime.',
          'success',
        );
      }
      return true;
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleNext = async () => {
    const ok = await saveStep(step);
    if (ok) setStep((s) => Math.min(s + 1, STEPS.length));
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 1));

  const handleFinish = async () => {
    const ok = await saveStep(step);
    if (ok) {
      showToast(isEdit ? 'Project updated successfully!' : 'Project setup complete!', 'success');
      onSuccess();
    }
  };

  const handleSkipToEnd = async () => {
    // "Save & Finish Later" — save whatever's on the current step, then close.
    const ok = await saveStep(step);
    if (ok) onSuccess();
  };

  const handlePincodeLookup = () => {
    setIsLookingUp(true);
    lookupPincode(
      pincode,
      (st, dist, loc, full) => {
        setState(st);
        setDistrict(dist);
        setLocality(loc);
        if (!city) setCity(dist);
      },
      showError,
      showToast,
    ).finally(() => setIsLookingUp(false));
  };

  const toggleAmenity = (label: string) => {
    setAmenities((prev) =>
      prev.includes(label) ? prev.filter((a) => a !== label) : [...prev, label],
    );
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-5 animate-fadeIn">
            <h3 className="text-lg font-bold text-slate-800">Project Identity</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <FieldLabel required>Project Name</FieldLabel>
                <input
                  className={inputCls}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Sonthillu Green Valley"
                />
              </div>
              <div>
                <FieldLabel>Project Type</FieldLabel>
                <select
                  className={selectCls}
                  value={projectType}
                  onChange={(e) => setProjectType(e.target.value as any)}
                >
                  <option value="">-- Select type --</option>
                  {PROJECT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>Developer</FieldLabel>
                <input
                  className={inputCls}
                  value={developerName}
                  onChange={(e) => setDeveloperName(e.target.value)}
                  placeholder="e.g. Sonthillu Constructions"
                />
              </div>
              <div className="md:col-span-2">
                <FieldLabel required>Location / City (short label)</FieldLabel>
                <input
                  className={inputCls}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Miyapur, Hyderabad"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Shown on cards and lists. Full structured address is captured in the next step.
                </p>
              </div>
              {isEdit && (
                <div>
                  <FieldLabel>Project Status</FieldLabel>
                  <select
                    className={selectCls}
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="PLANNING">Planning</option>
                    <option value="UNDER_CONSTRUCTION">Under Construction</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </div>
              )}
              <div className="md:col-span-2">
                <FieldLabel>Description</FieldLabel>
                <textarea
                  className={inputCls}
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Project overview, highlights, USPs..."
                />
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-5 animate-fadeIn">
            <h3 className="text-lg font-bold text-slate-800">Location</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <FieldLabel>Pincode</FieldLabel>
                <div className="flex gap-2">
                  <input
                    className={inputCls}
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value)}
                    placeholder="500049"
                    maxLength={6}
                  />
                  <button
                    type="button"
                    onClick={handlePincodeLookup}
                    disabled={isLookingUp || pincode.length !== 6}
                    className="px-3 py-2 bg-navy-600 hover:bg-navy-700 text-white text-xs font-bold rounded-xl shrink-0 disabled:opacity-50"
                  >
                    {isLookingUp ? '...' : 'Auto-fill'}
                  </button>
                </div>
              </div>
              <div>
                <FieldLabel>State</FieldLabel>
                <input
                  className={inputCls}
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="Telangana"
                />
              </div>
              <div>
                <FieldLabel>District</FieldLabel>
                <input
                  className={inputCls}
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  placeholder="Hyderabad"
                />
              </div>
              <div>
                <FieldLabel>City</FieldLabel>
                <input
                  className={inputCls}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Hyderabad"
                />
              </div>
              <div>
                <FieldLabel>Mandal</FieldLabel>
                <input
                  className={inputCls}
                  value={mandal}
                  onChange={(e) => setMandal(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>Village</FieldLabel>
                <input
                  className={inputCls}
                  value={village}
                  onChange={(e) => setVillage(e.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <FieldLabel>Locality / Area</FieldLabel>
                <input
                  className={inputCls}
                  value={locality}
                  onChange={(e) => setLocality(e.target.value)}
                  placeholder="Narsingi"
                />
              </div>
              <div className="md:col-span-3">
                <FieldLabel>Full Address</FieldLabel>
                <textarea
                  className={inputCls}
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>Latitude</FieldLabel>
                <input
                  className={inputCls}
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="17.4239"
                />
              </div>
              <div>
                <FieldLabel>Longitude</FieldLabel>
                <input
                  className={inputCls}
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="78.3378"
                />
              </div>
              <div>
                <FieldLabel>Google Maps Link</FieldLabel>
                <input
                  className={inputCls}
                  value={mapsLink}
                  onChange={(e) => setMapsLink(e.target.value)}
                  placeholder="https://maps.google.com/..."
                />
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-5 animate-fadeIn">
            <h3 className="text-lg font-bold text-slate-800">Project Size & Units</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <FieldLabel>Total Project Area</FieldLabel>
                <div className="flex gap-2">
                  <input
                    className={inputCls}
                    type="number"
                    value={totalAreaValue}
                    onChange={(e) => setTotalAreaValue(e.target.value)}
                    placeholder="10"
                  />
                  <select
                    className={selectCls}
                    value={totalAreaUnit}
                    onChange={(e) => setTotalAreaUnit(e.target.value as any)}
                  >
                    {AREA_UNITS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <FieldLabel>Towers</FieldLabel>
                <input
                  className={inputCls}
                  type="number"
                  value={towersCount}
                  onChange={(e) => setTowersCount(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>Blocks</FieldLabel>
                <input
                  className={inputCls}
                  type="number"
                  value={blocksCount}
                  onChange={(e) => setBlocksCount(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>Floors</FieldLabel>
                <input
                  className={inputCls}
                  type="number"
                  value={floorsCount}
                  onChange={(e) => setFloorsCount(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>Planned Units</FieldLabel>
                <input
                  className={inputCls}
                  type="number"
                  value={totalUnits}
                  onChange={(e) =>
                    setTotalUnits(e.target.value === '' ? '' : parseInt(e.target.value, 10))
                  }
                  placeholder="120"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  A target — the live count is always aggregated from actual units.
                </p>
              </div>
              <div>
                <FieldLabel>Project Phase</FieldLabel>
                <input
                  className={inputCls}
                  value={projectPhase}
                  onChange={(e) => setProjectPhase(e.target.value)}
                  placeholder="Phase 1"
                />
              </div>
              <div>
                <FieldLabel>Launch Date</FieldLabel>
                <input
                  className={inputCls}
                  type="date"
                  value={launchDate}
                  onChange={(e) => setLaunchDate(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>Expected Completion</FieldLabel>
                <input
                  className={inputCls}
                  type="date"
                  value={completionDate}
                  onChange={(e) => setCompletionDate(e.target.value)}
                />
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-5 animate-fadeIn">
            <h3 className="text-lg font-bold text-slate-800">Approvals & Compliance</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <FieldLabel>RERA Status</FieldLabel>
                <select
                  className={selectCls}
                  value={reraStatus}
                  onChange={(e) => setReraStatus(e.target.value as any)}
                >
                  <option value="NOT_APPLICABLE">Not Applicable</option>
                  <option value="APPLIED">Applied</option>
                  <option value="APPROVED">Approved</option>
                </select>
              </div>
              <div>
                <FieldLabel>RERA Registration Number</FieldLabel>
                <input
                  className={inputCls}
                  value={reraNumber}
                  onChange={(e) => setReraNumber(e.target.value)}
                  placeholder="P02400001234"
                />
              </div>
              <div className="md:col-span-2">
                <FieldLabel>Approval Authorities</FieldLabel>
                <p className="text-[11px] text-slate-400 -mt-1 mb-2">
                  Select every authority this project needs sign-off from.
                </p>
                <div className="flex flex-wrap gap-2">
                  {KNOWN_APPROVAL_AUTHORITIES.map((a) => {
                    const checked = approvalAuthorities.includes(a.value);
                    return (
                      <label
                        key={a.value}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${checked ? 'bg-navy-700 border-navy-700 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-navy-300'}`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={(e) =>
                            setApprovalAuthorities((prev) =>
                              e.target.checked
                                ? [...prev, a.value]
                                : prev.filter((v) => v !== a.value),
                            )
                          }
                        />
                        {a.label}
                      </label>
                    );
                  })}
                </div>
                {/* Any already-added value outside the known list (legacy data, or a
                    prior "Other" entry) — shown as a removable chip so it's never
                    silently hidden. */}
                {approvalAuthorities.filter(
                  (v) => !KNOWN_APPROVAL_AUTHORITIES.some((k) => k.value === v),
                ).length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {approvalAuthorities
                      .filter((v) => !KNOWN_APPROVAL_AUTHORITIES.some((k) => k.value === v))
                      .map((v) => (
                        <span
                          key={v}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-navy-700 text-white text-xs font-bold"
                        >
                          {v}
                          <button
                            type="button"
                            onClick={() =>
                              setApprovalAuthorities((prev) => prev.filter((x) => x !== v))
                            }
                            className="hover:text-rose-300"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                  </div>
                )}
                <div className="flex gap-2 mt-2">
                  <input
                    className={inputCls}
                    value={approvalAuthorityOther}
                    onChange={(e) => setApprovalAuthorityOther(e.target.value)}
                    placeholder="Other authority (e.g. HYDRAA)"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const v = approvalAuthorityOther.trim();
                      if (v && !approvalAuthorities.includes(v))
                        setApprovalAuthorities((prev) => [...prev, v]);
                      setApprovalAuthorityOther('');
                    }}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl shrink-0"
                  >
                    Add
                  </button>
                </div>
              </div>
              <div>
                <FieldLabel>Approval Number</FieldLabel>
                <input
                  className={inputCls}
                  value={approvalNumber}
                  onChange={(e) => setApprovalNumber(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>LP Number</FieldLabel>
                <input
                  className={inputCls}
                  value={lpNumber}
                  onChange={(e) => setLpNumber(e.target.value)}
                />
              </div>
            </div>
          </div>
        );

      case 5: {
        return (
          <div className="space-y-5 animate-fadeIn">
            <h3 className="text-lg font-bold text-slate-800">Pricing Rules</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <FieldLabel>Default Price Basis</FieldLabel>
                <select
                  className={selectCls}
                  value={defaultPriceBasis}
                  onChange={(e) => setDefaultPriceBasis(e.target.value as any)}
                >
                  {PRICE_BASIS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>Default Area Unit</FieldLabel>
                <select
                  className={selectCls}
                  value={defaultAreaUnit}
                  onChange={(e) => setDefaultAreaUnit(e.target.value as any)}
                >
                  {AREA_UNITS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {!projectId ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                Save the project's identity (Step 1) first to start adding pricing rules.
              </div>
            ) : (
              <PricingRulesPanel projectId={projectId} />
            )}
          </div>
        );
      }

      case 6:
        return (
          <div className="space-y-5 animate-fadeIn">
            <h3 className="text-lg font-bold text-slate-800">Project Amenities</h3>
            <p className="text-xs text-slate-500">
              Shared by every unit in this project. Per-amenity charges and
              Included/Optional/Chargeable rules are managed from the project dashboard's Amenities
              tab.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {AMENITY_CHECKLIST.map((label) => (
                <label
                  key={label}
                  className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${amenities.includes(label) ? 'bg-navy-50 border-navy-300 text-navy-800' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
                >
                  <input
                    type="checkbox"
                    checked={amenities.includes(label)}
                    onChange={() => toggleAmenity(label)}
                    className="accent-navy-600"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        );

      case 7:
        return (
          <div className="space-y-5 animate-fadeIn">
            <h3 className="text-lg font-bold text-slate-800">Team & Review</h3>
            {pms.length > 0 && (
              <div>
                <FieldLabel>
                  {isInventoryExecutive
                    ? 'Project Manager who provided this data *'
                    : 'Assign Project Manager'}
                </FieldLabel>
                <select
                  className={selectCls}
                  value={assignedPmId}
                  onChange={(e) => setAssignedPmId(e.target.value)}
                >
                  <option value="" className="text-slate-800 bg-white">
                    {isInventoryExecutive ? '-- Select Project Manager --' : '-- No PM Assigned --'}
                  </option>
                  {pms.map((pm) => (
                    <option key={pm.id} value={pm.id} className="text-slate-800 bg-white">
                      {pm.full_name || pm.fullName} ({pm.employee_code || pm.employeeCode})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <SectionCard title="Summary">
              <div className="grid grid-cols-2 gap-y-2 text-xs">
                <span className="text-slate-400">Name</span>
                <span className="font-bold text-slate-800">{name || '—'}</span>
                <span className="text-slate-400">Type</span>
                <span className="font-bold text-slate-800">
                  {PROJECT_TYPES.find((t) => t.value === projectType)?.label || '—'}
                </span>
                <span className="text-slate-400">Location</span>
                <span className="font-bold text-slate-800">{location || '—'}</span>
                <span className="text-slate-400">Total Area</span>
                <span className="font-bold text-slate-800">
                  {totalAreaValue ? `${totalAreaValue} ${totalAreaUnit}` : '—'}
                </span>
                <span className="text-slate-400">Planned Units</span>
                <span className="font-bold text-slate-800">{totalUnits || '—'}</span>
                <span className="text-slate-400">RERA Number</span>
                <span className="font-bold text-slate-800">{reraNumber || '—'}</span>
                <span className="text-slate-400">Pricing Rules</span>
                <span className="font-bold text-slate-800">{ruleCount} configured</span>
                <span className="text-slate-400">Amenities</span>
                <span className="font-bold text-slate-800">{amenities.length} selected</span>
              </div>
            </SectionCard>
          </div>
        );

      default:
        return null;
    }
  };

  const canSkip = step >= 3 && step <= 6 && !!projectId;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="flex bg-white rounded-3xl shadow-2xl overflow-hidden max-w-5xl w-full border border-slate-100 min-h-[640px] max-h-[95vh] animate-scaleUp">
        {/* Left rail */}
        <div className="hidden md:flex flex-col p-6 bg-gradient-to-b from-slate-900 to-slate-800 w-64 shrink-0 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="w-4 h-4 text-navy-300" />
              <h3 className="font-black text-white text-base">
                {isEdit ? 'Edit Project' : 'New Project'}
              </h3>
            </div>
            <p className="text-slate-400 text-[11px]">
              {isEdit ? 'Update site or venture details' : 'Set up a new development'}
            </p>
          </div>
          <div className="space-y-1 flex-1 overflow-y-auto">
            {STEPS.map((s, i) => {
              const stepNum = i + 1;
              const isActive = step === stepNum;
              const isPassed = step > stepNum || (stepNum === 1 && !!projectId);
              const StepIcon = s.icon;
              return (
                <button
                  key={s.label}
                  onClick={() => (isPassed ? setStep(stepNum) : undefined)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all text-left ${isActive ? 'bg-navy-600 text-white' : isPassed ? 'text-slate-300 hover:bg-white/10 cursor-pointer' : 'text-slate-500 cursor-default'}`}
                >
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-white/20' : isPassed ? 'bg-navy-500/20' : 'bg-white/5'}`}
                  >
                    {isPassed && !isActive ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-navy-300" />
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
              <span>{Math.round((step / STEPS.length) * 100)}%</span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-navy-500 to-navy-300 rounded-full transition-all duration-500"
                style={{ width: `${(step / STEPS.length) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col max-h-[95vh] overflow-hidden">
          <div className="md:hidden p-4 flex items-center justify-between border-b border-slate-100 bg-slate-50 shrink-0">
            <div>
              <span className="text-[10px] font-black text-navy-600 uppercase tracking-wide">
                Step {step} of {STEPS.length}
              </span>
              <p className="font-bold text-slate-800 text-sm">{STEPS[step - 1]?.label}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 md:p-8 flex-1 overflow-y-auto custom-scrollbar">{renderStep()}</div>

          <div className="p-4 md:p-5 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between shrink-0">
            <button
              onClick={step === 1 ? onClose : handleBack}
              className="flex items-center gap-1.5 px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-200 rounded-xl transition-colors text-sm"
            >
              <ArrowLeft className="w-4 h-4" /> {step === 1 ? 'Cancel' : 'Back'}
            </button>
            <div className="flex items-center gap-2">
              {canSkip && (
                <button
                  onClick={handleSkipToEnd}
                  disabled={isSaving}
                  className="px-4 py-2.5 text-navy-700 font-bold text-xs hover:bg-navy-50 rounded-xl transition-colors"
                >
                  Save & Finish Later
                </button>
              )}
              {step < STEPS.length ? (
                <button
                  onClick={handleNext}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-7 py-2.5 bg-navy-700 hover:bg-navy-800 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-60 text-sm"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Continue <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={handleFinish}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-7 py-2.5 bg-gradient-to-r from-navy-700 to-slate-800 text-white font-bold text-sm rounded-xl shadow-lg hover:from-navy-800 hover:to-slate-900 transition-all disabled:opacity-70"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      {isEdit ? 'Save Changes' : 'Finish Setup'}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
