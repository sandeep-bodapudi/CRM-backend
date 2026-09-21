import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Calendar,
  PhoneCall,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  Camera,
  Plus,
  X,
  User,
  ShieldCheck,
  Star,
  FileText,
  Send,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useWhatsApp } from '../../hooks/useWhatsApp';
import { API_BASE_URL } from '../../config';
import { Roles, Permissions } from '../../shared';
import { EmployeeListItem } from '../../types';
import { handleApiError, toUserFacingError } from '../../utils/userFacingError';

interface SiteVisit {
  id: number;
  booking_code: string;
  lead_id: number;
  scheduled_date: string;
  status:
    | 'REQUESTED'
    | 'PENDING_ACCEPTANCE'
    | 'REASSIGNED'
    | 'ESCALATED_TO_MARKETING_DIRECTOR'
    | 'ACCEPTED'
    | 'PENDING_CUSTOMER_RECONFIRMATION'
    | 'RESCHEDULE_REQUESTED'
    | 'PENDING_PM_RECONFIRMATION'
    | 'CONFIRMED'
    | 'ACTIVE'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'ON_HOLD'
    | 'CANCELLATION_PENDING_PM_CONFIRMATION'
    // Legacy values kept for backward-compat with any still-cached data
    | 'PENDING_VERIFICATION'
    | 'ASSIGNED_TO_AGENT'
    | 'RESCHEDULED';
  verification_call_notes?: string | null;
  feedback_notes?: string;
  rating?: string;
  proof_photo_url?: string;
  lead: {
    id: number;
    lead_code: string;
    customer_name: string;
    phone: string;
    preferred_location?: string;
  };
  telecaller: { id: number; employee_code: string; full_name: string; phone: string };
  project_manager?: { id: number; employee_code: string; full_name: string; phone: string };
  assigned_agent?: { id: number; employee_code: string; full_name: string; phone: string };
  property?: { id: number; property_code: string; title: string; status: string };
  project_unit?: {
    id: number;
    unit_code: string;
    unit_number: string;
    flat_number?: string | null;
    villa_number?: string | null;
    plot_number?: string | null;
    project: { id: number; name: string };
  };
  /** Multi-property links — the canonical source for what was visited */
  site_visit_properties?: { property_id: number | null; project_unit_id: number | null }[];
  project?: { id: number; project_code: string; name: string };
}

// Bug 3 fix: stages now match the REAL §2 site visit workflow states.
// Old keys (PENDING_VERIFICATION, ASSIGNED_TO_AGENT) no longer exist in the
// state machine — every visit used to show "Stage 0" or blank because none
// of its real statuses matched the legacy step keys.
const VISIT_STAGES = [
  { key: 'PENDING_ACCEPTANCE', label: '1. PM Pending' },
  { key: 'ACCEPTED', label: '2. Accepted' },
  { key: 'PENDING_CUSTOMER_RECONFIRMATION', label: '3. Reconfirm' },
  { key: 'CONFIRMED', label: '4. Confirmed' },
  { key: 'ACTIVE', label: '5. Active' },
  { key: 'COMPLETED', label: '6. Done' },
];

// States that live between real stepper steps — they should keep the stepper
// at the closest preceding completed step rather than showing "Stage 0".
const STATUS_STEPPER_MAP: Record<string, string> = {
  RESCHEDULE_REQUESTED: 'PENDING_CUSTOMER_RECONFIRMATION',
  PENDING_PM_RECONFIRMATION: 'PENDING_CUSTOMER_RECONFIRMATION',
  ON_HOLD: 'PENDING_CUSTOMER_RECONFIRMATION',
  CANCELLATION_PENDING_PM_CONFIRMATION: 'PENDING_CUSTOMER_RECONFIRMATION',
  REASSIGNED: 'PENDING_ACCEPTANCE',
  ESCALATED_TO_MARKETING_DIRECTOR: 'PENDING_ACCEPTANCE',
  // Legacy compat
  PENDING_VERIFICATION: 'ACCEPTED',
  ASSIGNED_TO_AGENT: 'CONFIRMED',
  RESCHEDULED: 'CONFIRMED',
};

const SiteVisitStepper: React.FC<{ status: SiteVisit['status'] }> = ({ status }) => {
  if (status === 'CANCELLED') {
    return (
      <div className="px-3 py-1 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 font-bold text-[11px] inline-flex items-center gap-1.5 my-1">
        <X className="w-3.5 h-3.5" />
        <span>Visit Cancelled</span>
      </div>
    );
  }

  // Map intermediate/branching states to the nearest stepper step
  const effectiveStatus = STATUS_STEPPER_MAP[status] ?? status;
  const currentIndex = VISIT_STAGES.findIndex((s) => s.key === effectiveStatus);

  return (
    <div className="w-full my-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
      <div className="flex items-center justify-between text-[9px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
        <span>Visit Progress</span>
        <span className="text-navy-800 font-bold">
          {status === 'COMPLETED'
            ? 'Visit Complete'
            : currentIndex >= 0
              ? `Step ${currentIndex + 1} of ${VISIT_STAGES.length}`
              : status.replace(/_/g, ' ')}
        </span>
      </div>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${VISIT_STAGES.length}, minmax(0, 1fr))` }}
      >
        {VISIT_STAGES.map((stg, idx) => {
          const isCurrent = stg.key === effectiveStatus;
          const isPassed = status === 'COMPLETED' || (currentIndex >= 0 && idx < currentIndex);
          return (
            <div
              key={stg.key}
              className={`px-1 py-1 rounded-lg text-[8px] font-bold text-center leading-tight transition-all ${
                isCurrent
                  ? 'bg-navy-600 text-white shadow-sm ring-1 ring-navy-400'
                  : isPassed
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-slate-200/70 text-slate-500'
              }`}
            >
              <div className="truncate">{stg.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const SiteVisitManagement: React.FC = () => {
  const { user, fetchWithAuth, activeRole } = useAuth();
  const { showToast, showError } = useToast();
  const { sendWhatsAppMessage } = useWhatsApp();
  const [visits, setVisits] = useState<SiteVisit[]>([]);
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'COMPLETED'>('ACTIVE');
  // Render-side cap, independent of the fetch: this page fetches every
  // matching site visit with no backend limit at all, so rendering all of
  // them as DOM cards would freeze the browser once a company's visit
  // volume runs into the thousands. "Load More" reveals more of the
  // already-fetched, tab-filtered list; reset on tab change below so it
  // never shows "page 4" of a different result set.
  const VISITS_PAGE_SIZE = 30;
  const [visibleVisitCount, setVisibleVisitCount] = useState(VISITS_PAGE_SIZE);

  // Modals
  const [selectedVisit, setSelectedVisit] = useState<SiteVisit | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleSuccess, setRescheduleSuccess] = useState(false);

  // Form states
  const [assignedAgentId, setAssignedAgentId] = useState('');
  const [dispatchNotes, setDispatchNotes] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState(
    new Date(Date.now() + 86400000).toISOString().slice(0, 16),
  );
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [rating, setRating] = useState('HOT_INTERESTED');
  const [proofPhotoUrl, setProofPhotoUrl] = useState('');
  const [propertyOutcome, setPropertyOutcome] = useState<'INTERESTED' | 'NOT_INTERESTED'>(
    'INTERESTED',
  );
  const [propertyOutcomeReason, setPropertyOutcomeReason] = useState('');
  // Confirm-cancel modal (P3)
  const [showConfirmCancelModal, setShowConfirmCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  const isPM = activeRole === Roles.PROJECT_MANAGER;
  const isMD = ([Roles.MD, Roles.ADMIN] as string[]).includes(activeRole);
  // site_visits.verify gates both /reconfirm-customer and /confirm server-side
  // (routes/siteVisits.ts) — real holders per RolePermissionsMatrix are
  // Digital Lead Operator and MD/Admin, NOT the Project Manager who accepted
  // the visit. Gating the buttons the same way avoids offering an action that
  // always 403s.
  const canVerify = !!user?.permissions?.includes(Permissions.SITE_VISITS_VERIFY);
  // site_visits.complete (POST /complete) — held by Agent/Channel Partner
  // Manager/MD/Admin, NOT the Project Manager, who only has assign_agent.
  const canComplete = !!user?.permissions?.includes(Permissions.SITE_VISITS_COMPLETE);

  const fetchVisitsData = async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/site-visits`);
      const data = await res.json();
      if (res.ok) setVisits(data.visits || []);
      else setHasError(true);

      const empRes = await fetchWithAuth(`${API_BASE_URL}/employees`);
      const empData = await empRes.json();
      if (empRes.ok) setEmployees(empData.employees || []);
    } catch (e) {
      console.error('Fetch site visits error:', e);
      setHasError(true);
      showError(
        toUserFacingError({ message: e instanceof Error ? e.message : String(e), body: e }),
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVisitsData();
  }, []);

  useEffect(() => {
    setVisibleVisitCount(VISITS_PAGE_SIZE);
  }, [activeTab]);

  const handleReconfirmCustomer = async (visitId: number) => {
    setIsSubmitting(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/site-visits/${visitId}/reconfirm-customer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message, 'success');
        fetchVisitsData();
      } else {
        await handleApiError(res, showError, data);
      }
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmVisit = async (visitId: number) => {
    setIsSubmitting(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/site-visits/${visitId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message, 'success');
        fetchVisitsData();
      } else {
        await handleApiError(res, showError, data);
      }
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartVisit = async (visitId: number) => {
    setIsSubmitting(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/site-visits/${visitId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message, 'success');
        fetchVisitsData();
      } else {
        await handleApiError(res, showError, data);
      }
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // P4: PUT ON HOLD — PENDING_CUSTOMER_RECONFIRMATION → ON_HOLD
  const handleHoldVisit = async (visitId: number) => {
    if (
      !window.confirm(
        'Put this visit on hold? The PM will be notified that you could not reach the customer.',
      )
    )
      return;
    setIsSubmitting(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/site-visits/${visitId}/hold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Visit placed on hold. PM has been notified.', 'info');
        fetchVisitsData();
      } else {
        await handleApiError(res, showError, data);
      }
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // P2: INITIATE CANCEL — ON_HOLD → CANCELLATION_PENDING_PM_CONFIRMATION (1-hr gate enforced server-side)
  const handleInitiateCancel = async (visitId: number) => {
    if (
      !window.confirm(
        'Send a cancellation cross-check request to the PM? This can only be done within 1 hour of the visit.',
      )
    )
      return;
    setIsSubmitting(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/site-visits/${visitId}/initiate-cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Cancellation cross-check sent to PM.', 'info');
        fetchVisitsData();
      } else {
        await handleApiError(res, showError, data);
      }
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // P3: REJECT CANCEL — PM says customer responded → revert to PENDING_CUSTOMER_RECONFIRMATION
  const handleRejectCancel = async (visitId: number) => {
    setIsSubmitting(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/site-visits/${visitId}/reject-cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(
          'Visit reverted — customer confirmed as responsive. Reconfirmation is active again.',
          'success',
        );
        fetchVisitsData();
      } else {
        await handleApiError(res, showError, data);
      }
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // P3: CONFIRM CANCEL — PM confirms no-show → CANCELLED
  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVisit || !cancelReason.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await fetchWithAuth(
        `${API_BASE_URL}/site-visits/${selectedVisit.id}/confirm-cancel`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: cancelReason }),
        },
      );
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || 'Visit cancelled.', 'success');
        setShowConfirmCancelModal(false);
        setCancelReason('');
        fetchVisitsData();
      } else {
        await handleApiError(res, showError, data);
      }
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAssignAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVisit || !assignedAgentId) return;

    setIsSubmitting(true);
    try {
      const res = await fetchWithAuth(
        `${API_BASE_URL}/site-visits/${selectedVisit.id}/assign-agent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent_id: parseInt(assignedAgentId, 10),
            notes: dispatchNotes,
          }),
        },
      );

      const data = await res.json();
      if (res.ok) {
        showToast(data.message, 'success');
        setShowAssignModal(false);
        fetchVisitsData();
      } else {
        await handleApiError(res, showError, data);
      }
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVisit || !feedbackNotes) return;

    // Every linked property/unit needs an outcome — the backend rejects the
    // completion outright if any is missing. The single propertyOutcome/
    // propertyOutcomeReason picker applies to all of them; for the common
    // case (one item, or none) this is exactly one outcome or zero.
    const linkedPropertyIds = new Set<number>(
      (selectedVisit.site_visit_properties || [])
        .map((sp) => sp.property_id)
        .filter((id): id is number => id != null),
    );
    if (selectedVisit.property) linkedPropertyIds.add(selectedVisit.property.id);
    const linkedUnitIds = new Set<number>(
      (selectedVisit.site_visit_properties || [])
        .map((sp) => sp.project_unit_id)
        .filter((id): id is number => id != null),
    );
    if (selectedVisit.project_unit) linkedUnitIds.add(selectedVisit.project_unit.id);
    const outcomes = [
      ...Array.from(linkedPropertyIds).map((property_id) => ({
        property_id,
        outcome: propertyOutcome,
        outcome_reason: propertyOutcome === 'NOT_INTERESTED' ? propertyOutcomeReason : undefined,
      })),
      ...Array.from(linkedUnitIds).map((project_unit_id) => ({
        project_unit_id,
        outcome: propertyOutcome,
        outcome_reason: propertyOutcome === 'NOT_INTERESTED' ? propertyOutcomeReason : undefined,
      })),
    ];

    setIsSubmitting(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/site-visits/${selectedVisit.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedback_notes: feedbackNotes,
          rating,
          proof_photo_url: proofPhotoUrl,
          outcomes,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        showToast(data.message, 'success');
        if (data.cascadeNote) {
          showToast(data.cascadeNote, 'info');
        }
        setShowCompleteModal(false);
        fetchVisitsData();
      } else {
        await handleApiError(res, showError, data);
      }
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVisit) return;

    setIsSubmitting(true);
    try {
      const res = await fetchWithAuth(
        `${API_BASE_URL}/site-visits/${selectedVisit.id}/reschedule`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scheduled_date: new Date(rescheduleDate).toISOString(),
          }),
        },
      );

      const data = await res.json();
      if (res.ok) {
        showToast(data.message || 'Visit rescheduled successfully', 'success');
        setRescheduleSuccess(true);
        fetchVisitsData();
      } else {
        await handleApiError(res, showError, data);
      }
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Bug 4 fix: map EVERY real §2 workflow status to a colour — old code only
  // handled legacy names so all live visits showed an identical grey badge.
  const getStatusBadge = (status: string) => {
    switch (status) {
      // Pre-acceptance
      case 'REQUESTED':
        return 'bg-slate-100 text-slate-700 border-slate-300';
      case 'PENDING_ACCEPTANCE':
        return 'bg-amber-100 text-amber-900 border-amber-300';
      case 'REASSIGNED':
        return 'bg-orange-100 text-orange-900 border-orange-300';
      case 'ESCALATED_TO_MARKETING_DIRECTOR':
        return 'bg-red-100 text-red-900 border-red-300';
      // Active processing
      case 'ACCEPTED':
        return 'bg-blue-100 text-blue-900 border-blue-300';
      case 'PENDING_CUSTOMER_RECONFIRMATION':
        return 'bg-violet-100 text-violet-900 border-violet-300';
      case 'RESCHEDULE_REQUESTED':
        return 'bg-orange-100 text-orange-900 border-orange-300';
      case 'PENDING_PM_RECONFIRMATION':
        return 'bg-orange-100 text-orange-900 border-orange-300';
      case 'ON_HOLD':
        return 'bg-slate-200 text-slate-700 border-slate-400';
      case 'CANCELLATION_PENDING_PM_CONFIRMATION':
        return 'bg-rose-100 text-rose-900 border-rose-300';
      // Confirmed & active
      case 'CONFIRMED':
        return 'bg-navy-100 text-navy-900 border-navy-300';
      case 'ACTIVE':
        return 'bg-emerald-200 text-emerald-900 border-emerald-400';
      // Terminal
      case 'COMPLETED':
        return 'bg-emerald-100 text-emerald-900 border-emerald-300';
      case 'CANCELLED':
        return 'bg-rose-100 text-rose-800 border-rose-300';
      // Legacy compat
      case 'PENDING_VERIFICATION':
        return 'bg-amber-100 text-amber-900 border-amber-300';
      case 'ASSIGNED_TO_AGENT':
        return 'bg-purple-100 text-purple-900 border-purple-300';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  const filteredVisits = visits.filter((visit) => {
    if (activeTab === 'ACTIVE') {
      return visit.status !== 'COMPLETED' && visit.status !== 'CANCELLED';
    } else {
      return visit.status === 'COMPLETED' || visit.status === 'CANCELLED';
    }
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-navy-950 via-slate-900 to-navy-950 rounded-3xl p-6 text-white shadow-xl flex flex-wrap items-center justify-between gap-4 border border-navy-700/30">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-5 h-5 text-navy-400" />
            <h2 className="text-xl font-extrabold tracking-tight">
              On-Site Visit & Field Agent Dispatch Workflow
            </h2>
          </div>
          <p className="text-xs text-navy-200/80">
            Real-time pipeline: Telecaller Booking → Verification Call Confirmation → PM Agent
            Dispatch → Field Visit Completion & On-Site Feedback Upload.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-white/10 rounded-2xl border border-white/10 text-center">
            <span className="text-[10px] uppercase font-bold text-navy-300 block">
              Total Site Visits
            </span>
            <span className="text-lg font-black text-white">{filteredVisits.length} Scheduled</span>
          </div>
        </div>
      </div>

      {hasError && (
        <div className="text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-4 py-3 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-danger-600" />
          Unable to load site visits. Please try again later.
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          className={`pb-3 px-4 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'ACTIVE'
              ? 'border-navy-600 text-navy-700'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
          onClick={() => setActiveTab('ACTIVE')}
        >
          Active
        </button>
        <button
          className={`pb-3 px-4 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'COMPLETED'
              ? 'border-navy-600 text-navy-700'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
          onClick={() => setActiveTab('COMPLETED')}
        >
          Completed
        </button>
      </div>

      {/* Visits Grid */}
      {isLoading ? (
        <div className="py-12 text-center text-xs text-slate-400">
          Loading site visit bookings...
        </div>
      ) : filteredVisits.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-400">
          No site visits found in this tab.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredVisits.slice(0, visibleVisitCount).map((visit) => (
            <div
              key={visit.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-card hover:shadow-card-hover transition-shadow p-5 space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-navy-900 text-xs">
                    {visit.booking_code}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${getStatusBadge(visit.status)}`}
                  >
                    {visit.status.replace(/_/g, ' ')}
                  </span>
                </div>

                <div>
                  <h3 className="font-extrabold text-slate-900 text-base leading-snug">
                    {visit.lead?.customer_name}
                  </h3>
                  <p className="text-xs text-slate-600 flex items-center gap-1 mt-0.5 font-mono">
                    <PhoneCall className="w-3.5 h-3.5 text-slate-400" />
                    {visit.lead?.phone} ({visit.lead?.preferred_location || 'Hyderabad'})
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1.5 text-xs">
                  <div className="flex items-center gap-2 text-slate-700 font-semibold">
                    <Calendar className="w-4 h-4 text-navy-600 shrink-0" />
                    <span>Scheduled: {new Date(visit.scheduled_date).toLocaleString('en-IN')}</span>
                  </div>

                  <div className="text-[11px] text-slate-500">
                    <span className="font-bold text-slate-700">Telecaller:</span>{' '}
                    {visit.telecaller?.full_name}
                  </div>

                  {visit.property && (
                    <div className="text-[11px] text-slate-500">
                      <span className="font-bold text-slate-700">Property:</span>{' '}
                      {visit.property.title} ({visit.property.property_code})
                    </div>
                  )}

                  {visit.project_manager && (
                    <div className="text-[11px] text-slate-500">
                      <span className="font-bold text-slate-700">
                        {visit.status === 'PENDING_ACCEPTANCE'
                          ? 'Awaiting PM acceptance:'
                          : 'Accepted by (PM):'}
                      </span>{' '}
                      {visit.project_manager?.full_name} ({visit.project_manager?.phone})
                    </div>
                  )}

                  {visit.assigned_agent && (
                    <div className="text-[11px] text-slate-700 font-bold bg-purple-50 p-1.5 rounded-xl border border-purple-200">
                      Field Agent Dispatched: {visit.assigned_agent?.full_name} (
                      {visit.assigned_agent?.phone})
                    </div>
                  )}
                </div>

                {visit.feedback_notes && (
                  <div className="p-3 bg-emerald-50/80 rounded-2xl border border-emerald-200/60 text-xs space-y-1">
                    <span className="font-extrabold text-emerald-900 block">
                      Customer Feedback ({visit.rating}):
                    </span>
                    <p className="text-slate-700 text-[11px] italic">"{visit.feedback_notes}"</p>
                  </div>
                )}
              </div>

              {/* Action Buttons based on Workflow Stage */}
              <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
                {/* ─── ACCEPTED: Telecaller reconfirms with customer ─── */}
                {visit.status === 'ACCEPTED' && canVerify && (
                  <button
                    onClick={() => handleReconfirmCustomer(visit.id)}
                    disabled={isSubmitting}
                    className="w-full py-2 bg-navy-700 hover:bg-navy-800 text-white font-extrabold text-xs rounded-xl shadow transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                    <span>Reconfirm With Customer</span>
                  </button>
                )}

                {/* Bug 10 / Bug 7 fix: "Send PM Accepted WA" fires at ACCEPTED (not CONFIRMED).
                    Telecaller needs PM name + phone NOW so they can relay it to the customer. */}
                {visit.status === 'ACCEPTED' && visit.project_manager && (
                  <button
                    onClick={() =>
                      sendWhatsAppMessage('SITE_VISIT_ACCEPTED', visit.lead.phone, {
                        customer_name: visit.lead.customer_name,
                        visit_date: new Date(visit.scheduled_date).toLocaleDateString('en-IN'),
                        visit_time: new Date(visit.scheduled_date).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        }),
                        pm_name: visit.project_manager?.full_name ?? 'Your Project Manager',
                        // pm_phone passed so the WA template can include it
                        agent_name: visit.project_manager?.phone ?? '',
                        property_name:
                          visit.property?.title ||
                          visit.project_unit?.project?.name ||
                          'the property',
                      })
                    }
                    className="w-full py-2 bg-[#25D366] hover:bg-[#1DA851] text-white font-bold text-[10px] uppercase tracking-wide rounded-xl shadow transition-all flex items-center justify-center gap-1.5"
                  >
                    <Send className="w-3 h-3" />
                    <span>Send PM Accepted WA to Customer</span>
                  </button>
                )}

                {/* ─── PENDING_CUSTOMER_RECONFIRMATION ─── */}
                {visit.status === 'PENDING_CUSTOMER_RECONFIRMATION' && canVerify && (
                  <button
                    onClick={() => handleConfirmVisit(visit.id)}
                    disabled={isSubmitting}
                    className="w-full py-2 bg-navy-700 hover:bg-navy-800 text-white font-extrabold text-xs rounded-xl shadow transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Confirm Visit (Customer OK)</span>
                  </button>
                )}

                {/* Bug 6 fix: Day-before WA appears here so telecaller can send it after reconfirmation call */}
                {visit.status === 'PENDING_CUSTOMER_RECONFIRMATION' && (
                  <button
                    onClick={() =>
                      sendWhatsAppMessage('DAY_BEFORE_RECONFIRMATION', visit.lead.phone, {
                        customer_name: visit.lead.customer_name,
                        visit_date: new Date(visit.scheduled_date).toLocaleDateString('en-IN'),
                        visit_time: new Date(visit.scheduled_date).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        }),
                        pm_name: visit.project_manager?.full_name || 'Your Project Manager',
                        agent_name: visit.project_manager?.phone || '',
                      })
                    }
                    className="w-full py-2 bg-white border border-[#25D366] text-[#25D366] hover:bg-[#25D366] hover:text-white font-bold text-[10px] uppercase tracking-wide rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5"
                  >
                    <Send className="w-3 h-3" />
                    <span>Send Day-Before WA Reminder</span>
                  </button>
                )}

                {/* P4: Put On Hold — customer completely unreachable */}
                {visit.status === 'PENDING_CUSTOMER_RECONFIRMATION' && canVerify && (
                  <button
                    onClick={() => handleHoldVisit(visit.id)}
                    disabled={isSubmitting}
                    className="w-full py-2 bg-slate-500 hover:bg-slate-600 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Put On Hold (Customer Unreachable)</span>
                  </button>
                )}

                {/* P2: ON_HOLD — telecaller can reschedule or initiate cancellation cross-check */}
                {visit.status === 'ON_HOLD' && canVerify && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <p className="text-[11px] font-bold text-slate-600">
                      Visit is on hold — customer was unreachable. What would you like to do?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setSelectedVisit(visit);
                          setRescheduleSuccess(false);
                          setShowRescheduleModal(true);
                        }}
                        className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        Reschedule Visit
                      </button>
                      <button
                        onClick={() => handleInitiateCancel(visit.id)}
                        disabled={isSubmitting}
                        className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" />
                        Initiate Cancellation (1-hr gate applies)
                      </button>
                    </div>
                  </div>
                )}

                {/* P3: CANCELLATION_PENDING_PM_CONFIRMATION — PM decides to keep or cancel */}
                {visit.status === 'CANCELLATION_PENDING_PM_CONFIRMATION' && (
                  <>
                    {isPM && visit.project_manager?.id === user?.id && (
                      <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
                        <p className="text-[11px] font-bold text-rose-800">
                          Telecaller could not reach the customer (1 hr before visit). Did the
                          customer contact you?
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleRejectCancel(visit.id)}
                            disabled={isSubmitting}
                            className="flex-1 py-2 bg-navy-700 hover:bg-navy-800 text-white font-bold text-xs rounded-xl shadow disabled:opacity-50 flex items-center justify-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Yes — Keep Visit
                          </button>
                          <button
                            onClick={() => {
                              setSelectedVisit(visit);
                              setCancelReason('');
                              setShowConfirmCancelModal(true);
                            }}
                            disabled={isSubmitting}
                            className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
                          >
                            <X className="w-3.5 h-3.5" />
                            No — Cancel Visit
                          </button>
                        </div>
                      </div>
                    )}
                    {isMD && (!visit.project_manager || visit.project_manager.id !== user?.id) && (
                      <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                        <p className="text-[11px] font-bold text-rose-800 flex items-center gap-2">
                          <AlertCircle className="w-3.5 h-3.5" />
                          Pending Cancellation Confirmation from PM:{' '}
                          {visit.project_manager?.full_name || 'Unassigned'}
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* ─── PENDING_PM_RECONFIRMATION: PM confirms or releases (Bug 8 fix) ─── */}
                {visit.status === 'PENDING_PM_RECONFIRMATION' && (
                  <>
                    {isPM && visit.project_manager?.id === user?.id && (
                      <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl space-y-2">
                        <p className="text-[11px] font-bold text-orange-800">
                          Customer requested a reschedule — do you confirm the new date?
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={async () => {
                              setIsSubmitting(true);
                              try {
                                const res = await fetchWithAuth(
                                  `${API_BASE_URL}/site-visits/${visit.id}/pm-reconfirm`,
                                  {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ release: false }),
                                  },
                                );
                                const d = await res.json();
                                if (res.ok) {
                                  showToast(
                                    'Reschedule confirmed — visit is now ACCEPTED.',
                                    'success',
                                  );
                                  fetchVisitsData();
                                } else {
                                  await handleApiError(res, showError, d);
                                }
                              } catch (err) {
                                showError(
                                  toUserFacingError({
                                    message: err instanceof Error ? err.message : String(err),
                                    body: err,
                                  }),
                                );
                              } finally {
                                setIsSubmitting(false);
                              }
                            }}
                            disabled={isSubmitting}
                            className="flex-1 py-2 bg-navy-700 hover:bg-navy-800 text-white font-bold text-xs rounded-xl shadow disabled:opacity-50 flex items-center justify-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Confirm Reschedule
                          </button>
                          <button
                            onClick={async () => {
                              setIsSubmitting(true);
                              try {
                                const res = await fetchWithAuth(
                                  `${API_BASE_URL}/site-visits/${visit.id}/pm-reconfirm`,
                                  {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ release: true }),
                                  },
                                );
                                const d = await res.json();
                                if (res.ok) {
                                  showToast(
                                    'Released — visit reset to PENDING_ACCEPTANCE for the project PM.',
                                    'info',
                                  );
                                  fetchVisitsData();
                                } else {
                                  await handleApiError(res, showError, d);
                                }
                              } catch (err) {
                                showError(
                                  toUserFacingError({
                                    message: err instanceof Error ? err.message : String(err),
                                    body: err,
                                  }),
                                );
                              } finally {
                                setIsSubmitting(false);
                              }
                            }}
                            disabled={isSubmitting}
                            className="flex-1 py-2 bg-white border border-orange-300 text-orange-700 hover:bg-orange-50 font-bold text-xs rounded-xl shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
                          >
                            Release Back
                          </button>
                        </div>
                      </div>
                    )}
                    {isMD && (!visit.project_manager || visit.project_manager.id !== user?.id) && (
                      <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl">
                        <p className="text-[11px] font-bold text-orange-800 flex items-center gap-2">
                          <AlertCircle className="w-3.5 h-3.5" />
                          Pending Reschedule Confirmation from PM:{' '}
                          {visit.project_manager?.full_name || 'Unassigned'}
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* ─── CONFIRMED ─── */}
                {visit.status === 'CONFIRMED' && (
                  <>
                    {isPM && visit.project_manager?.id === user?.id && (
                      <button
                        onClick={() => {
                          setSelectedVisit(visit);
                          setShowAssignModal(true);
                        }}
                        className="w-full py-2 bg-purple-700 hover:bg-purple-800 text-white font-extrabold text-xs rounded-xl shadow transition-all flex items-center justify-center gap-1.5"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Assign Field Agent</span>
                      </button>
                    )}
                    {isMD && (!visit.project_manager || visit.project_manager.id !== user?.id) && (
                      <div className="w-full py-2 bg-slate-50 border border-slate-200 text-slate-600 font-medium text-[10px] rounded-xl flex items-center justify-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        Waiting for PM to Assign Agent
                      </div>
                    )}
                  </>
                )}

                {/* COMPLETE is only valid from ACTIVE (siteVisit.workflow.ts),
                    never directly from CONFIRMED — START is the missing step. */}
                {visit.status === 'CONFIRMED' && canComplete && (
                  <button
                    onClick={() => handleStartVisit(visit.id)}
                    disabled={isSubmitting}
                    className="w-full py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs rounded-xl shadow transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Start Visit</span>
                  </button>
                )}

                {/* Day-before WA for CONFIRMED status as well */}
                {visit.status === 'CONFIRMED' && (
                  <button
                    onClick={() =>
                      sendWhatsAppMessage('DAY_BEFORE_RECONFIRMATION', visit.lead.phone, {
                        customer_name: visit.lead.customer_name,
                        visit_date: new Date(visit.scheduled_date).toLocaleDateString('en-IN'),
                        visit_time: new Date(visit.scheduled_date).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        }),
                        pm_name: visit.project_manager?.full_name || 'Your Project Manager',
                        agent_name: visit.project_manager?.phone || '',
                      })
                    }
                    className="w-full py-2 bg-white border border-[#25D366] text-[#25D366] hover:bg-[#25D366] hover:text-white font-bold text-[10px] uppercase tracking-wide rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5"
                  >
                    <Send className="w-3 h-3" />
                    <span>Day-Before WA</span>
                  </button>
                )}

                {/* ─── ACTIVE ─── */}
                {visit.status === 'ACTIVE' && canComplete && (
                  <button
                    onClick={() => {
                      setSelectedVisit(visit);
                      setShowCompleteModal(true);
                    }}
                    className="w-full py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs rounded-xl shadow transition-all flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Record Visit Feedback & Photo</span>
                  </button>
                )}

                {/* ─── GENERIC RESCHEDULE & CANCEL ─── */}
                {visit.status !== 'COMPLETED' &&
                  visit.status !== 'CANCELLED' &&
                  visit.status !== 'ON_HOLD' &&
                  visit.status !== 'CANCELLATION_PENDING_PM_CONFIRMATION' &&
                  canVerify && (
                    <div className="flex gap-2 w-full pt-1">
                      <button
                        onClick={() => {
                          setSelectedVisit(visit);
                          setRescheduleSuccess(false);
                          setShowRescheduleModal(true);
                        }}
                        className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs rounded-xl shadow transition-all flex items-center justify-center gap-1.5"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>Reschedule</span>
                      </button>
                      <button
                        onClick={() => {
                          setSelectedVisit(visit);
                          setCancelReason('');
                          setShowConfirmCancelModal(true);
                        }}
                        className="flex-1 py-2 bg-white border border-rose-600 text-rose-600 hover:bg-rose-50 font-extrabold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Cancel</span>
                      </button>
                    </div>
                  )}

                {/* ─── COMPLETED ─── */}
                {visit.status === 'COMPLETED' && (
                  <button
                    onClick={() =>
                      sendWhatsAppMessage('POST_VISIT_INTERESTED', visit.lead.phone, {
                        customer_name: visit.lead.customer_name,
                        visit_date: new Date(visit.scheduled_date).toLocaleDateString('en-IN'),
                        visit_time: new Date(visit.scheduled_date).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        }),
                        pm_name: visit.project_manager?.full_name || 'Your Project Manager',
                        property_name: visit.property?.title || 'the property',
                      })
                    }
                    className="w-full py-2 bg-[#25D366] hover:bg-[#1DA851] text-white font-bold text-[10px] uppercase tracking-wide rounded-xl shadow transition-all flex items-center justify-center gap-1.5"
                  >
                    <Send className="w-3 h-3" />
                    <span>Post-Visit Follow-Up WA</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {!isLoading && filteredVisits.length > visibleVisitCount && (
        <button
          onClick={() => setVisibleVisitCount((c) => c + VISITS_PAGE_SIZE)}
          className="w-full py-3 rounded-2xl border border-slate-200 bg-white text-navy-700 font-bold text-sm hover:bg-slate-50 transition-colors"
        >
          Load More ({filteredVisits.length - visibleVisitCount} remaining)
        </button>
      )}

      {/* Modal 2: PM Assign Field Agent */}
      {showAssignModal && selectedVisit && (
        <div className="fixed inset-0 z-[60] bg-slate-900/80 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4">
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-slate-100 relative max-h-[90dvh] overflow-y-auto">
            <button
              onClick={() => setShowAssignModal(false)}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="font-bold text-slate-800 text-lg mb-1">
              Assign Field Agent for Site Visit
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Dispatch an on-site field agent for visit{' '}
              <strong className="text-slate-800">{selectedVisit.booking_code}</strong>
            </p>

            <form onSubmit={handleAssignAgent} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Select Field Agent *
                </label>
                <select
                  required
                  value={assignedAgentId}
                  onChange={(e) => setAssignedAgentId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600 font-bold text-slate-800"
                >
                  <option value="" className="text-slate-800 bg-white">
                    Select Agent
                  </option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id} className="text-slate-800 bg-white">
                      {emp.full_name || emp.employeeCode} ({emp.employeeCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Dispatch Instructions
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Pickup key from site office, show 3BHK Villa #4..."
                  value={dispatchNotes}
                  onChange={(e) => setDispatchNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-purple-700 hover:bg-purple-800 text-white font-extrabold text-xs rounded-xl shadow-md"
                >
                  {isSubmitting ? 'Dispatching...' : 'Dispatch Field Agent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Complete Visit, Upload Feedback & Photo */}
      {showCompleteModal && selectedVisit && (
        <div className="fixed inset-0 z-[60] bg-slate-900/80 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4">
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-slate-100 relative max-h-[90dvh] overflow-y-auto">
            <button
              onClick={() => setShowCompleteModal(false)}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="font-bold text-slate-800 text-lg mb-1">Record Site Visit Completion</h3>
            <p className="text-xs text-slate-500 mb-4">
              Enter customer feedback and proof photo for{' '}
              <strong className="text-slate-800">{selectedVisit.lead?.customer_name}</strong>
            </p>

            <form onSubmit={handleCompleteVisit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Customer Interest Rating *
                </label>
                <select
                  value={rating}
                  onChange={(e) => setRating(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 font-extrabold text-slate-800"
                >
                  <option value="HOT_INTERESTED">🔥 Hot - Highly Interested</option>
                  <option value="WARM">☀️ Warm - Interested</option>
                  <option value="COLD">❄️ Cold - Low Interest</option>
                  <option value="NOT_INTERESTED">❌ Not Interested</option>
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  For your records only — moving the lead forward is decided by the property outcome
                  below.
                </p>
              </div>

              {!selectedVisit.property && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                  No property is attached to this visit, so it can't automatically advance to
                  Negotiation — that needs a specific property to base the offer on. Attach one to
                  the lead first if the customer is interested.
                </p>
              )}

              {selectedVisit.property && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase">
                    Outcome for {selectedVisit.property.title} *
                  </label>
                  <select
                    value={propertyOutcome}
                    onChange={(e) =>
                      setPropertyOutcome(e.target.value as 'INTERESTED' | 'NOT_INTERESTED')
                    }
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 font-bold text-slate-800"
                  >
                    <option value="INTERESTED">✅ Interested</option>
                    <option value="NOT_INTERESTED">❌ Not Interested</option>
                  </select>
                  {propertyOutcome === 'NOT_INTERESTED' && (
                    <textarea
                      required
                      rows={2}
                      placeholder="Reason customer is not interested in this property..."
                      value={propertyOutcomeReason}
                      onChange={(e) => setPropertyOutcomeReason(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  )}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  On-Site Customer Feedback *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Liked 3BHK corner unit, requested 5% discount on registration charges..."
                  value={feedbackNotes}
                  onChange={(e) => setFeedbackNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  On-Site Proof Photo URL
                </label>
                <input
                  type="text"
                  placeholder="e.g. https://images.unsplash.com/photo-1600585154340-be6161a56a0c"
                  value={proofPhotoUrl}
                  onChange={(e) => setProofPhotoUrl(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCompleteModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs rounded-xl shadow-md"
                >
                  {isSubmitting ? 'Recording...' : 'Complete Visit & Update Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 4: Reschedule Visit */}
      {showRescheduleModal && selectedVisit && (
        <div className="fixed inset-0 z-[60] bg-slate-900/80 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4">
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-slate-100 relative max-h-[90dvh] overflow-y-auto">
            <button
              onClick={() => {
                setShowRescheduleModal(false);
                setRescheduleSuccess(false);
              }}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>

            {rescheduleSuccess ? (
              <div className="py-8 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-2">
                  <CheckCircle2 className="w-8 h-8 text-amber-600" />
                </div>
                <h4 className="text-xl font-bold text-navy-900">Visit Rescheduled!</h4>
                <p className="text-sm text-slate-500">
                  The site visit has been updated and a reconfirmation is pending.
                </p>
                <button
                  onClick={() => {
                    sendWhatsAppMessage('RESCHEDULE_CONFIRMED', selectedVisit.lead.phone, {
                      customer_name: selectedVisit.lead.customer_name,
                      visit_date: new Date(rescheduleDate).toLocaleDateString('en-IN'),
                      visit_time: new Date(rescheduleDate).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      }),
                    });
                  }}
                  className="mt-4 px-6 py-3 w-full bg-[#25D366] hover:bg-[#1DA851] text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Send Reschedule WA
                </button>
                <button
                  onClick={() => {
                    setShowRescheduleModal(false);
                    setRescheduleSuccess(false);
                  }}
                  className="mt-2 px-6 py-2 w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition-all"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <h3 className="font-bold text-slate-800 text-lg mb-1">Reschedule Site Visit</h3>
                <p className="text-xs text-slate-500 mb-4">
                  Select a new date and time for{' '}
                  <strong className="text-slate-800">{selectedVisit.lead?.customer_name}</strong>
                </p>

                <form onSubmit={handleReschedule} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      New Date & Time *
                    </label>
                    <input
                      type="datetime-local"
                      required
                      value={rescheduleDate}
                      onChange={(e) => setRescheduleDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-600"
                    />
                  </div>

                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowRescheduleModal(false)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs rounded-xl shadow-md"
                    >
                      {isSubmitting ? 'Rescheduling...' : 'Confirm Reschedule'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal 5: Confirm Cancel (PM provides cancellation reason) — P3 */}
      {showConfirmCancelModal && selectedVisit && (
        <div className="fixed inset-0 z-[70] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-rose-100 bg-rose-50 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-rose-900">Confirm Visit Cancellation</h3>
                <p className="text-xs text-rose-600 mt-0.5">
                  This permanently cancels {selectedVisit.booking_code}. A reason is required.
                </p>
              </div>
              <button
                onClick={() => setShowConfirmCancelModal(false)}
                className="p-2 text-rose-400 hover:text-rose-600 rounded-full hover:bg-rose-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleConfirmCancel} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  Cancellation Reason
                </label>
                <textarea
                  required
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. No-Show — customer did not attend and cannot be reached after multiple attempts."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 resize-none"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  If the reason contains "no show", the system will track it. 2+ no-shows triggers a
                  manager alert.
                </p>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowConfirmCancelModal(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !cancelReason.trim()}
                  className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl disabled:opacity-50 shadow-sm"
                >
                  {isSubmitting ? 'Cancelling...' : 'Confirm Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
