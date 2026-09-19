import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  MapPin,
  Calendar,
  ShieldCheck,
  Edit,
  Plus,
  Home,
  IndianRupee,
  CheckSquare,
  Image as ImageIcon,
  FileText,
  Activity,
  Settings as SettingsIcon,
  Trash2,
  Layers,
  Loader2,
  Wand2,
  Search,
  ChevronLeft,
  ChevronRight,
  Pause,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';
import { Permissions } from '../../shared';
import { ProjectListItem } from '../../types';
import { formatEmployeeLabel } from '../../utils/employeeLabel';
import { handleApiError, toUserFacingError } from '../../utils/userFacingError';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ProjectWizard } from './ProjectWizard';
import { PricingRulesPanel } from './PricingRulesPanel';
import { ProjectAmenityEditor } from './ProjectAmenityEditor';
import { AddUnitModal } from './AddUnitModal';
import { GenerateUnitsWizard } from './GenerateUnitsWizard';
import { formatAreaDual } from '../../utils/measurement';
import { resolveImageUrl } from '../../utils/imageUtils';
import { ProjectMediaTab } from './ProjectMediaTab';
import { ProjectDocumentsTab } from './ProjectDocumentsTab';
import { ProjectActivityTab } from './ProjectActivityTab';
import {
  listProjectUnits,
  getInventorySummary,
  changeUnitStatus,
  ProjectUnit,
  SalesStatus,
  previewRecalculateProject,
  applyRecalculateProject,
} from '../../api/projectUnits';

type Tab =
  | 'overview'
  | 'units'
  | 'pricing'
  | 'amenities'
  | 'location'
  | 'media'
  | 'documents'
  | 'activity'
  | 'settings';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: ShieldCheck },
  { id: 'units', label: 'Units', icon: Home },
  { id: 'pricing', label: 'Pricing', icon: IndianRupee },
  { id: 'amenities', label: 'Amenities', icon: CheckSquare },
  { id: 'location', label: 'Location', icon: MapPin },
  { id: 'media', label: 'Media', icon: ImageIcon },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

const STATUS_BADGE: Record<string, string> = {
  PLANNING: 'bg-navy-900/50 text-navy-300 border-navy-700',
  UNDER_CONSTRUCTION: 'bg-amber-900/40 text-amber-300 border-amber-700',
  COMPLETED: 'bg-emerald-900/40 text-emerald-300 border-emerald-700',
  CANCELLED: 'bg-rose-900/40 text-rose-300 border-rose-700',
  ON_HOLD: 'bg-slate-700/60 text-slate-200 border-slate-500',
};

// Verification is a separate gate from the operational status above: a
// DRAFT/REJECTED/PENDING_DM_POLISH/PENDING_MD_APPROVAL project is only
// visible to MD/Admin, its assigned PM, and (for the DM stage) DM staff —
// everyone else only ever sees VERIFIED projects (see
// apps/api/src/authz/dataScope.ts). This badge makes that gate visible in the
// UI it was previously invisible in.
// Item 1.7 (2026-09-15): this used to be a direct PM-submit -> MD-approve
// gate (PENDING_VERIFICATION). Now mirrors Property's PM -> DM -> MD chain —
// PENDING_VERIFICATION is kept only for any pre-existing row still in that
// legacy state.
const VERIFICATION_BADGE: Record<string, string> = {
  DRAFT: 'bg-slate-700/60 text-slate-200 border-slate-500',
  PENDING_DM_POLISH: 'bg-amber-900/40 text-amber-300 border-amber-700',
  PENDING_MD_APPROVAL: 'bg-amber-900/40 text-amber-300 border-amber-700',
  PENDING_VERIFICATION: 'bg-amber-900/40 text-amber-300 border-amber-700',
  VERIFIED: 'bg-emerald-900/40 text-emerald-300 border-emerald-700',
  REJECTED: 'bg-rose-900/40 text-rose-300 border-rose-700',
};
const VERIFICATION_LABEL: Record<string, string> = {
  DRAFT: 'Not Submitted',
  PENDING_DM_POLISH: 'Pending Marketing Review',
  PENDING_MD_APPROVAL: 'Pending MD Review',
  PENDING_VERIFICATION: 'Pending MD Review',
  VERIFIED: 'Verified — Visible to All Staff',
  REJECTED: 'Rejected',
};

const SALES_STATUS_COLORS: Record<SalesStatus, string> = {
  AVAILABLE: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  HOLD: 'bg-amber-100 text-amber-800 border-amber-300',
  RESERVED: 'bg-blue-100 text-blue-800 border-blue-300',
  BOOKED: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  SOLD: 'bg-slate-200 text-slate-800 border-slate-400',
  BLOCKED: 'bg-rose-100 text-rose-800 border-rose-300',
  UNAVAILABLE: 'bg-slate-100 text-slate-500 border-slate-300',
};

const ComingSoon: React.FC<{ label: string }> = ({ label }) => (
  <div className="py-16 text-center text-slate-400">
    <p className="font-bold text-slate-500">{label} is coming in a future update</p>
    <p className="text-xs mt-1">This module is being built out as part of the ongoing rebuild.</p>
  </div>
);

export const ProjectDashboard: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || '0', 10);
  const navigate = useNavigate();
  const { fetchWithAuth, user } = useAuth();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [showEditWizard, setShowEditWizard] = useState(false);
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [showGenerateUnits, setShowGenerateUnits] = useState(false);
  const [unitStatusFilter, setUnitStatusFilter] = useState<string>('ALL');
  const [unitFilters, setUnitFilters] = useState({
    unit_type: '',
    tower: '',
    floor: '',
    bhk: '',
    facing: '',
    search: '',
  });
  const [unitPage, setUnitPage] = useState(0);
  const UNIT_PAGE_SIZE = 25;
  const [recalcPreview, setRecalcPreview] = useState<Awaited<
    ReturnType<typeof previewRecalculateProject>
  > | null>(null);
  const [recalculating, setRecalculating] = useState(false);

  const canEdit = user?.permissions?.includes(Permissions.PROJECTS_UPDATE);

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () =>
      fetchWithAuth(`${API_BASE_URL}/projects/${projectId}`)
        .then((r) => r.json())
        .then((d) => d.project as ProjectListItem),
    enabled: !!projectId,
  });

  const { data: summary } = useQuery({
    queryKey: ['project', projectId, 'summary'],
    queryFn: () => getInventorySummary(fetchWithAuth, projectId).then((r) => r.summary),
    enabled: !!projectId,
  });

  const { data: unitsData, isLoading: unitsLoading } = useQuery({
    queryKey: ['project', projectId, 'units', unitStatusFilter, unitFilters, unitPage],
    queryFn: () =>
      listProjectUnits(fetchWithAuth, projectId, {
        sales_status: unitStatusFilter === 'ALL' ? undefined : unitStatusFilter,
        unit_type: unitFilters.unit_type || undefined,
        tower: unitFilters.tower || undefined,
        floor: unitFilters.floor ? parseInt(unitFilters.floor, 10) : undefined,
        bhk: unitFilters.bhk || undefined,
        facing: unitFilters.facing || undefined,
        search: unitFilters.search || undefined,
        limit: UNIT_PAGE_SIZE,
        offset: unitPage * UNIT_PAGE_SIZE,
      }),
    enabled: !!projectId && activeTab === 'units',
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['project', projectId] });
  };

  const handleDeleteProject = async () => {
    if (
      !window.confirm(
        `Cancel "${project?.name}"? This is blocked if any unit underneath is still active inventory.`,
      )
    )
      return;
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/projects/${projectId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        await handleApiError(res, showError, data);
        return;
      }
      showToast('Project cancelled', 'success');
      navigate('/projects');
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    }
  };

  // #15: Hold/Activate — a pause distinct from Cancel. Holding blocks NEW
  // bookings against every unit/property under this project (enforced
  // server-side in services/inventory/reference.ts's assertClaimable);
  // anything already locked or booked is untouched.
  const [statusChanging, setStatusChanging] = useState(false);
  const handleToggleHold = async () => {
    if (!project) return;
    const isHeld = project.status === 'ON_HOLD';
    const nextStatus = isHeld ? 'UNDER_CONSTRUCTION' : 'ON_HOLD';
    if (
      !isHeld &&
      !window.confirm(
        `Put "${project.name}" on hold? New bookings against its inventory will be blocked until you Activate it again. Existing locks/bookings are unaffected.`,
      )
    )
      return;
    setStatusChanging(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        await handleApiError(res, showError, data);
        return;
      }
      showToast(isHeld ? 'Project activated' : 'Project put on hold', 'success');
      invalidateAll();
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    } finally {
      setStatusChanging(false);
    }
  };

  // Verification workflow (submit -> DM polish -> MD approve-or-reject) —
  // see the VERIFICATION_BADGE comment above for why this exists as a gate
  // separate from the operational status toggle.
  const canSubmitForVerification = user?.permissions?.includes(Permissions.PROJECTS_SUBMIT_VERIFY);
  const canDMPolish = user?.permissions?.includes(Permissions.PROJECTS_DM_POLISH);
  const canVerifyProject = user?.permissions?.includes(Permissions.PROJECTS_VERIFY);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [showRejectPrompt, setShowRejectPrompt] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');
  const [showDMPolishForm, setShowDMPolishForm] = useState(false);
  const [dmExecutives, setDmExecutives] = useState<
    { id: number; full_name?: string; employee_code?: string }[]
  >([]);
  const [dmExecutiveId, setDmExecutiveId] = useState('');

  useEffect(() => {
    if (!showDMPolishForm || dmExecutives.length > 0) return;
    fetchWithAuth(`${API_BASE_URL}/employees?role=DIGITAL_MARKETING_EXECUTIVE`)
      .then((res) => res.json())
      .then((data) => setDmExecutives(data.employees || []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDMPolishForm]);

  const handleSubmitForReview = async () => {
    if (!project) return;
    setVerifyBusy(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/submit-for-review`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        await handleApiError(res, showError, data);
        return;
      }
      showToast('Submitted for Marketing review', 'success');
      invalidateAll();
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleDMPolish = async () => {
    if (!project || !dmExecutiveId) return;
    setVerifyBusy(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/dm-polish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ digital_marketing_executive_id: parseInt(dmExecutiveId, 10) }),
      });
      const data = await res.json();
      if (!res.ok) {
        await handleApiError(res, showError, data);
        return;
      }
      showToast('Assigned for content polish and forwarded to MD', 'success');
      setShowDMPolishForm(false);
      setDmExecutiveId('');
      invalidateAll();
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleDMVerifyAsIs = async () => {
    if (!project) return;
    setVerifyBusy(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/dm-verify-as-is`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        await handleApiError(res, showError, data);
        return;
      }
      showToast('Verified as-is and forwarded to MD', 'success');
      invalidateAll();
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleVerifyDecision = async (approved: boolean, notes?: string) => {
    if (!project) return;
    setVerifyBusy(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/md-approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved, notes }),
      });
      const data = await res.json();
      if (!res.ok) {
        await handleApiError(res, showError, data);
        return;
      }
      showToast(approved ? 'Project approved and is now live' : 'Project rejected', 'success');
      setShowRejectPrompt(false);
      setRejectNotes('');
      invalidateAll();
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleUnitStatusChange = async (unit: ProjectUnit, status: SalesStatus) => {
    try {
      await changeUnitStatus(fetchWithAuth, projectId, unit.id, status);
      showToast('Unit status updated', 'success');
      queryClient.invalidateQueries({ queryKey: ['project', projectId, 'units'] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId, 'summary'] });
    } catch (err: any) {
      showError({ message: err?.message || 'Failed to change unit status' });
    }
  };

  const handleRecalcPreview = async () => {
    setRecalculating(true);
    try {
      const preview = await previewRecalculateProject(fetchWithAuth, projectId);
      setRecalcPreview(preview);
    } catch {
      showError({ message: 'Failed to preview recalculation' });
    } finally {
      setRecalculating(false);
    }
  };

  const handleRecalcApply = async () => {
    setRecalculating(true);
    try {
      const result = await applyRecalculateProject(fetchWithAuth, projectId);
      showToast(result.message, 'success');
      setRecalcPreview(null);
      queryClient.invalidateQueries({ queryKey: ['project', projectId, 'units'] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId, 'summary'] });
    } catch {
      showError({ message: 'Failed to apply recalculation' });
    } finally {
      setRecalculating(false);
    }
  };

  if (isLoading || !project) {
    return (
      <div className="py-24 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-navy-600 mx-auto mb-3" />
        <p className="text-xs text-slate-400 font-semibold">Loading project...</p>
      </div>
    );
  }

  const units = unitsData?.units || [];
  const unitsTotal = unitsData?.pagination.total ?? 0;
  const unitsFrom = unitsTotal === 0 ? 0 : unitPage * UNIT_PAGE_SIZE + 1;
  const unitsTo = Math.min(unitsTotal, (unitPage + 1) * UNIT_PAGE_SIZE);

  const setStatusFilter = (key: string) => {
    setUnitStatusFilter(key);
    setUnitPage(0);
  };
  const setFilter = (patch: Partial<typeof unitFilters>) => {
    setUnitFilters((f) => ({ ...f, ...patch }));
    setUnitPage(0);
  };

  const statusChips: { key: string; label: string }[] = [
    { key: 'ALL', label: `All ${summary?.total_units ?? 0}` },
    { key: 'AVAILABLE', label: `Available ${summary?.by_status.AVAILABLE ?? 0}` },
    { key: 'HOLD', label: `Hold ${summary?.by_status.HOLD ?? 0}` },
    { key: 'RESERVED', label: `Reserved ${summary?.by_status.RESERVED ?? 0}` },
    { key: 'BOOKED', label: `Booked ${summary?.by_status.BOOKED ?? 0}` },
    { key: 'SOLD', label: `Sold ${summary?.by_status.SOLD ?? 0}` },
  ];

  return (
    <div className="space-y-0 -m-4 sm:-m-6">
      {/* Hero */}
      <div
        className="relative bg-gradient-to-r from-slate-900 via-navy-950 to-slate-900 p-6 text-white bg-cover bg-center"
        style={
          project.cover_image_url
            ? {
                backgroundImage: `linear-gradient(to right, rgba(2,6,23,0.92), rgba(2,6,23,0.75)), url(${resolveImageUrl(project.cover_image_url)})`,
              }
            : undefined
        }
      >
        <button
          onClick={() => navigate('/projects')}
          className="flex items-center gap-1.5 text-navy-300 hover:text-white text-xs font-bold mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All Projects
        </button>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${STATUS_BADGE[project.status] || 'bg-slate-800 text-slate-300 border-slate-600'}`}
              >
                {project.status.replace(/_/g, ' ')}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${VERIFICATION_BADGE[project.verification_status || 'DRAFT']}`}
                title="Only MD/Admin and the assigned PM can see this project until it's verified"
              >
                {VERIFICATION_LABEL[project.verification_status || 'DRAFT']}
              </span>
              <span className="font-mono text-navy-200 text-xs px-2 py-0.5 bg-black/20 rounded">
                {project.project_code}
              </span>
              {project.rera_number && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-900/30 border border-emerald-700 px-2 py-0.5 rounded-full">
                  <ShieldCheck className="w-3 h-3" /> RERA
                </span>
              )}
            </div>
            <h1 className="text-2xl font-black tracking-tight">{project.name}</h1>
            <p className="text-sm text-navy-100/80 flex items-center gap-1.5 mt-1">
              <MapPin className="w-4 h-4 text-navy-400" /> {project.location}
              {project.assigned_pm && (
                <span className="text-navy-400 ml-2">• PM: {project.assigned_pm.full_name}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && ['PLANNING', 'UNDER_CONSTRUCTION', 'ON_HOLD'].includes(project.status) && (
              <button
                onClick={handleToggleHold}
                disabled={statusChanging}
                className={`px-4 py-2 text-xs font-bold rounded-xl border flex items-center gap-1.5 disabled:opacity-50 ${
                  project.status === 'ON_HOLD'
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                    : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
                }`}
              >
                {statusChanging ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Pause className="w-3.5 h-3.5" />
                )}
                {project.status === 'ON_HOLD' ? 'Activate Project' : 'Put On Hold'}
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => setShowEditWizard(true)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl border border-white/20 flex items-center gap-1.5"
              >
                <Edit className="w-3.5 h-3.5" /> Edit Project
              </button>
            )}
            {canSubmitForVerification &&
              ['DRAFT', 'REJECTED'].includes(project.verification_status || 'DRAFT') && (
                <button
                  onClick={handleSubmitForReview}
                  disabled={verifyBusy}
                  className="px-4 py-2 bg-gold-600 hover:bg-gold-500 text-white text-xs font-bold rounded-xl border border-gold-500 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {verifyBusy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-3.5 h-3.5" />
                  )}
                  Submit for Review
                </button>
              )}
            {canDMPolish && project.verification_status === 'PENDING_DM_POLISH' && (
              <>
                <button
                  onClick={handleDMVerifyAsIs}
                  disabled={verifyBusy}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl border border-white/20 flex items-center gap-1.5 disabled:opacity-50"
                >
                  Verify As-Is
                </button>
                <button
                  onClick={() => setShowDMPolishForm(true)}
                  disabled={verifyBusy}
                  className="px-4 py-2 bg-gold-600 hover:bg-gold-500 text-white text-xs font-bold rounded-xl border border-gold-500 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {verifyBusy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-3.5 h-3.5" />
                  )}
                  Assign for Polish
                </button>
              </>
            )}
            {canVerifyProject &&
              ['PENDING_MD_APPROVAL', 'PENDING_VERIFICATION'].includes(
                project.verification_status || '',
              ) && (
                <>
                  <button
                    onClick={() => setShowRejectPrompt(true)}
                    disabled={verifyBusy}
                    className="px-4 py-2 bg-rose-900/40 hover:bg-rose-900/60 text-rose-200 text-xs font-bold rounded-xl border border-rose-700 flex items-center gap-1.5 disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => handleVerifyDecision(true)}
                    disabled={verifyBusy}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl border border-emerald-600 flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {verifyBusy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-3.5 h-3.5" />
                    )}
                    Approve — Make Visible
                  </button>
                </>
              )}
          </div>
        </div>

        {showDMPolishForm && (
          <div className="mt-4 p-3 bg-black/20 border border-white/20 rounded-xl text-xs text-navy-100 flex items-center gap-2">
            <span className="font-bold shrink-0">Assign DM Executive:</span>
            <select
              value={dmExecutiveId}
              onChange={(e) => setDmExecutiveId(e.target.value)}
              className="flex-1 px-2 py-1.5 bg-white/10 border border-white/20 rounded-lg text-white text-xs"
            >
              <option value="" className="text-slate-800 bg-white">
                -- Select --
              </option>
              {dmExecutives.map((dm) => (
                <option key={dm.id} value={dm.id} className="text-slate-800 bg-white">
                  {formatEmployeeLabel(dm)}
                </option>
              ))}
            </select>
            <button
              onClick={handleDMPolish}
              disabled={verifyBusy || !dmExecutiveId}
              className="px-3 py-1.5 bg-gold-600 hover:bg-gold-500 text-white font-bold rounded-lg disabled:opacity-50"
            >
              Assign
            </button>
            <button
              onClick={() => setShowDMPolishForm(false)}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-lg"
            >
              Cancel
            </button>
          </div>
        )}

        {project.verification_status === 'REJECTED' && project.verification_notes && (
          <div className="mt-4 p-3 bg-rose-900/30 border border-rose-700 rounded-xl text-xs text-rose-200 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Rejection reason: </span>
              {project.verification_notes}
              {canSubmitForVerification && (
                <span className="block mt-1 text-rose-300/80">
                  Fix the issue above, then click "Submit for Review" to resend.
                </span>
              )}
            </div>
          </div>
        )}

        {/* Inventory summary tiles */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-6">
          {[
            { label: 'Total', value: summary?.total_units ?? 0, color: 'text-white' },
            {
              label: 'Available',
              value: summary?.by_status.AVAILABLE ?? 0,
              color: 'text-emerald-300',
            },
            { label: 'Hold', value: summary?.by_status.HOLD ?? 0, color: 'text-amber-300' },
            { label: 'Reserved', value: summary?.by_status.RESERVED ?? 0, color: 'text-blue-300' },
            { label: 'Booked', value: summary?.by_status.BOOKED ?? 0, color: 'text-indigo-300' },
            { label: 'Sold', value: summary?.by_status.SOLD ?? 0, color: 'text-slate-300' },
          ].map((tile) => (
            <div
              key={tile.label}
              className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center"
            >
              <p className={`text-xl font-black ${tile.color}`}>{tile.value}</p>
              <p className="text-[10px] text-navy-300 uppercase font-bold tracking-wide">
                {tile.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 sm:px-6 border-b border-slate-200 bg-white overflow-x-auto">
        {TABS.map((tab) => {
          const TabIcon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-bold border-b-2 whitespace-nowrap transition-colors ${isActive ? 'border-navy-600 text-navy-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            >
              <TabIcon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="p-4 sm:p-6 bg-slate-50 min-h-[60vh]">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 animate-fadeIn">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-card space-y-3">
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider border-b border-slate-100 pb-2">
                Project Information
              </h3>
              {[
                ['Type', project.project_type?.replace(/_/g, ' ') || '—'],
                ['Developer', project.developer_name || '—'],
                [
                  'Total Area',
                  project.total_area_value
                    ? `${project.total_area_value} ${project.total_area_unit}`
                    : project.total_area || '—',
                ],
                [
                  'Towers / Blocks / Floors',
                  [project.towers_count, project.blocks_count, project.floors_count]
                    .map((v) => v ?? '—')
                    .join(' / '),
                ],
                ['Phase', project.project_phase || '—'],
                [
                  'Launch Date',
                  project.launch_date
                    ? new Date(project.launch_date).toLocaleDateString('en-IN')
                    : 'TBA',
                ],
                [
                  'Expected Completion',
                  project.completion_date
                    ? new Date(project.completion_date).toLocaleDateString('en-IN')
                    : 'TBA',
                ],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between text-xs">
                  <span className="text-slate-400">{label}</span>
                  <span className="font-bold text-slate-700 text-right">{value}</span>
                </div>
              ))}
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-card md:col-span-2">
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider border-b border-slate-100 pb-2 mb-3">
                Description
              </h3>
              <p className="text-slate-600 text-sm whitespace-pre-wrap leading-relaxed">
                {project.description || 'No description provided.'}
              </p>
              {Array.isArray((project as any).amenities) &&
                (project as any).amenities.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                      Amenities
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {(project as any).amenities.map((a: string) => (
                        <span
                          key={a}
                          className="text-[11px] font-semibold bg-navy-50 text-navy-700 border border-navy-100 px-2.5 py-1 rounded-full"
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          </div>
        )}

        {activeTab === 'units' && (
          <div className="animate-fadeIn space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-1.5 bg-white p-1 rounded-2xl border border-slate-200 overflow-x-auto">
                {statusChips.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => setStatusFilter(c.key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${unitStatusFilter === c.key ? 'bg-navy-700 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              {canEdit && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowGenerateUnits(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 hover:border-navy-300 text-navy-700 text-xs font-bold rounded-xl"
                  >
                    <Wand2 className="w-3.5 h-3.5" /> Generate Units
                  </button>
                  <button
                    onClick={() => setShowAddUnit(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-navy-700 hover:bg-navy-800 text-white text-xs font-bold rounded-xl shadow"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Unit
                  </button>
                </div>
              )}
            </div>

            <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-card flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[160px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  className="w-full pl-8 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500"
                  placeholder="Search unit/plot/flat number..."
                  value={unitFilters.search}
                  onChange={(e) => setFilter({ search: e.target.value })}
                />
              </div>
              <select
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                value={unitFilters.unit_type}
                onChange={(e) => setFilter({ unit_type: e.target.value })}
              >
                <option value="">All Types</option>
                {['PLOT', 'FLAT', 'VILLA', 'HOUSE', 'COMMERCIAL', 'OTHER'].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                className="w-20 text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                placeholder="Tower"
                value={unitFilters.tower}
                onChange={(e) => setFilter({ tower: e.target.value })}
              />
              <input
                className="w-20 text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                type="number"
                placeholder="Floor"
                value={unitFilters.floor}
                onChange={(e) => setFilter({ floor: e.target.value })}
              />
              <input
                className="w-20 text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                placeholder="BHK"
                value={unitFilters.bhk}
                onChange={(e) => setFilter({ bhk: e.target.value })}
              />
              <select
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                value={unitFilters.facing}
                onChange={(e) => setFilter({ facing: e.target.value })}
              >
                <option value="">Any Facing</option>
                {[
                  'EAST',
                  'WEST',
                  'NORTH',
                  'SOUTH',
                  'NORTH_EAST',
                  'NORTH_WEST',
                  'SOUTH_EAST',
                  'SOUTH_WEST',
                ].map((f) => (
                  <option key={f} value={f}>
                    {f.replace(/_/g, '-')}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
              {unitsLoading ? (
                <div className="py-12 text-center text-xs text-slate-400">Loading units...</div>
              ) : units.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">
                  No units match these filters.
                  {canEdit &&
                    unitStatusFilter === 'ALL' &&
                    ' Click "Add Unit" to create the first one.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        {['Unit', 'Type', 'BHK', 'Floor', 'Area', 'Facing', 'Price', 'Status'].map(
                          (h) => (
                            <th
                              key={h}
                              className="text-left px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wide"
                            >
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {units.map((u) => (
                        <tr
                          key={u.id}
                          className="hover:bg-slate-50 cursor-pointer"
                          onClick={() => navigate(`/projects/${projectId}/units/${u.id}`)}
                        >
                          <td className="px-4 py-3 font-bold text-slate-800">{u.unit_number}</td>
                          <td className="px-4 py-3 text-slate-600">{u.unit_type}</td>
                          <td className="px-4 py-3 text-slate-600">{u.bhk || '—'}</td>
                          <td className="px-4 py-3 text-slate-600">{u.floor ?? '—'}</td>
                          <td className="px-4 py-3 text-slate-600 text-xs">
                            {formatAreaDual(u.area_sqft, 'SQYD')}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {u.facing?.replace(/_/g, '-') || '—'}
                          </td>
                          <td className="px-4 py-3 font-bold text-navy-800">
                            ₹{u.final_price.toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={u.sales_status}
                              disabled={!canEdit || ['RESERVED', 'BOOKED'].includes(u.sales_status)}
                              onChange={(e) =>
                                handleUnitStatusChange(u, e.target.value as SalesStatus)
                              }
                              className={`text-[10px] font-bold px-2 py-1 rounded-full border ${SALES_STATUS_COLORS[u.sales_status]} disabled:opacity-70`}
                            >
                              <option value="AVAILABLE">Available</option>
                              <option value="HOLD">Hold</option>
                              <option value="RESERVED" disabled>
                                Reserved (booking)
                              </option>
                              <option value="BOOKED" disabled>
                                Booked (booking)
                              </option>
                              {u.sales_status === 'BOOKED' && <option value="SOLD">Sold</option>}
                              <option value="BLOCKED">Blocked</option>
                              <option value="UNAVAILABLE">Unavailable</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {unitsTotal > UNIT_PAGE_SIZE && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
                  <span>
                    {unitsFrom}–{unitsTo} of {unitsTotal}
                  </span>
                  <div className="flex gap-1">
                    <button
                      disabled={unitPage === 0}
                      onClick={() => setUnitPage((p) => p - 1)}
                      className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      disabled={unitsTo >= unitsTotal}
                      onClick={() => setUnitPage((p) => p + 1)}
                      className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'pricing' && (
          <div className="animate-fadeIn space-y-4">
            <PricingRulesPanel projectId={projectId} readOnly={!canEdit} />
            {canEdit && (
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-card">
                <h3 className="font-bold text-slate-800 text-sm mb-1">Recalculate All Units</h3>
                <p className="text-xs text-slate-500 mb-3">
                  Re-applies the current pricing rules to every unit. Preview the effect before
                  committing — a unit's calculated price never changes silently.
                </p>
                {!recalcPreview ? (
                  <button
                    onClick={handleRecalcPreview}
                    disabled={recalculating}
                    className="px-4 py-2 bg-navy-700 hover:bg-navy-800 text-white text-xs font-bold rounded-xl disabled:opacity-60 flex items-center gap-2"
                  >
                    {recalculating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Layers className="w-3.5 h-3.5" />
                    )}{' '}
                    Preview Recalculation
                  </button>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-slate-700">
                      {recalcPreview.changed_count} of {recalcPreview.total_units} unit(s) would
                      change:
                    </p>
                    {recalcPreview.changes.length > 0 && (
                      <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                        {recalcPreview.changes.map((c) => (
                          <div key={c.unit_id} className="flex justify-between px-3 py-2 text-xs">
                            <span className="font-bold text-slate-700">{c.unit_number}</span>
                            <span className={c.delta > 0 ? 'text-emerald-700' : 'text-rose-700'}>
                              ₹{c.old_final_price.toLocaleString('en-IN')} → ₹
                              {c.new_final_price.toLocaleString('en-IN')} ({c.delta > 0 ? '+' : ''}
                              {c.delta.toLocaleString('en-IN')})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setRecalcPreview(null)}
                        className="px-4 py-2 text-slate-500 font-bold text-xs hover:bg-slate-100 rounded-xl"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleRecalcApply}
                        disabled={recalculating || recalcPreview.changed_count === 0}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl disabled:opacity-50"
                      >
                        Apply to {recalcPreview.changed_count} unit(s)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'amenities' && <ProjectAmenityEditor projectId={projectId} />}

        {activeTab === 'location' && (
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-card animate-fadeIn max-w-2xl">
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider border-b border-slate-100 pb-2 mb-3">
              Structured Address
            </h3>
            <div className="grid grid-cols-2 gap-y-2 text-xs">
              {[
                ['State', project.state],
                ['District', project.district],
                ['City', project.city],
                ['Mandal', project.mandal],
                ['Village', project.village],
                ['Locality', project.locality],
                ['Pincode', project.pincode],
              ].map(([label, value]) => (
                <React.Fragment key={label as string}>
                  <span className="text-slate-400">{label}</span>
                  <span className="font-bold text-slate-700">{value || '—'}</span>
                </React.Fragment>
              ))}
            </div>
            {project.address && (
              <p className="mt-3 pt-3 border-t border-slate-100 text-slate-600">
                {project.address}
              </p>
            )}
            {project.maps_link && (
              <a
                href={project.maps_link}
                target="_blank"
                rel="noreferrer"
                className="inline-block mt-3 text-xs font-bold text-navy-700 hover:underline"
              >
                View on Google Maps →
              </a>
            )}
            <p className="mt-4 text-[11px] text-slate-400">
              The site-plan/layout image pin-map is being reconnected to the new unit model and will
              reappear here shortly.
            </p>
          </div>
        )}

        {activeTab === 'media' && (
          <div className="animate-fadeIn">
            <ProjectMediaTab
              projectId={projectId}
              onCoverChanged={() =>
                queryClient.invalidateQueries({ queryKey: ['project', projectId] })
              }
            />
          </div>
        )}
        {activeTab === 'documents' && (
          <div className="animate-fadeIn">
            <ProjectDocumentsTab projectId={projectId} />
          </div>
        )}
        {activeTab === 'activity' && (
          <div className="animate-fadeIn">
            <ProjectActivityTab projectId={projectId} />
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-card animate-fadeIn max-w-xl space-y-4">
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider border-b border-slate-100 pb-2">
              Danger Zone
            </h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-700">Cancel this project</p>
                <p className="text-xs text-slate-500">
                  Blocked while any unit is still active inventory (Available, Hold, Reserved,
                  Booked or Sold).
                </p>
              </div>
              <button
                onClick={handleDeleteProject}
                className="flex items-center gap-1.5 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl border border-rose-200"
              >
                <Trash2 className="w-3.5 h-3.5" /> Cancel Project
              </button>
            </div>
          </div>
        )}
      </div>

      {showEditWizard && (
        <ProjectWizard
          initialData={project}
          onClose={() => setShowEditWizard(false)}
          onSuccess={() => {
            setShowEditWizard(false);
            invalidateAll();
          }}
        />
      )}

      {showRejectPrompt && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="bg-rose-700 p-4 flex items-center justify-between text-white">
              <h3 className="font-bold text-sm">Reject Project</h3>
              <button
                onClick={() => setShowRejectPrompt(false)}
                className="p-1 text-rose-100 hover:text-white rounded-full hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <label className="block text-xs font-bold text-slate-700">
                Reason for rejection *
              </label>
              <textarea
                autoFocus
                rows={4}
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                placeholder="e.g. Approval authority documents missing, unit count doesn't match layout..."
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <p className="text-[11px] text-slate-400">
                The PM will see this reason and can fix it before resubmitting.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setShowRejectPrompt(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleVerifyDecision(false, rejectNotes)}
                  disabled={!rejectNotes.trim() || verifyBusy}
                  className="px-4 py-2 bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white font-bold text-sm rounded-xl"
                >
                  {verifyBusy ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddUnit && (
        <AddUnitModal
          projectId={projectId}
          projectName={project.name}
          onClose={() => setShowAddUnit(false)}
          onSuccess={() => {
            setShowAddUnit(false);
            queryClient.invalidateQueries({ queryKey: ['project', projectId, 'units'] });
            queryClient.invalidateQueries({ queryKey: ['project', projectId, 'summary'] });
          }}
        />
      )}

      {showGenerateUnits && (
        <GenerateUnitsWizard
          projectId={projectId}
          projectName={project.name}
          onClose={() => setShowGenerateUnits(false)}
          onSuccess={() => {
            setShowGenerateUnits(false);
            queryClient.invalidateQueries({ queryKey: ['project', projectId, 'units'] });
            queryClient.invalidateQueries({ queryKey: ['project', projectId, 'summary'] });
          }}
        />
      )}
    </div>
  );
};
