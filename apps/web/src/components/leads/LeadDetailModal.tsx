import React, { useState, useEffect } from 'react';
import {
  Building2,
  PhoneCall,
  Calendar,
  ShieldCheck,
  MapPin,
  LineChart,
  Briefcase,
  X,
  Plus,
  UserCheck,
  CheckCircle2,
  Send,
  IndianRupee,
  Clock,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useWhatsApp } from '../../hooks/useWhatsApp';
import { API_BASE_URL } from '../../config';
import { Permissions } from '../../shared';
import { formatEmployeeLabel } from '../../utils/employeeLabel';
import {
  LeadActivity,
  MatchItem,
  SavedInterestItem,
  LeadVisitItem,
  LeadDemoItem,
  LeadTaskItem,
  LeadSalesOppItem,
} from '../../types';
import { StatusPill } from '../ui/StatusPill';
import { QualificationFormModal } from './QualificationFormModal';
import { getPropertyTypeLabel } from '../../constants/propertyTypes';
import { getLeadStatusLabel } from '../../constants/leadStatus';
import { toUserFacingError } from '../../utils/userFacingError';
import { DropLeadModal } from './DropLeadModal';

interface Lead {
  id: number;
  lead_code: string;
  customer_name: string;
  phone: string;
  email?: string;
  source: string;
  status: string;
  assignment_type?: string;
  property_type_preference?: string;
  preferred_location?: string;
  // Full multi-location list (§ Phase 2) — preferred_location above stays as
  // the primary/first entry for backward compatibility.
  preferred_locations?: { id: number; location: string; sort_order: number }[];
  budget_min?: number;
  budget_max?: number;
  assigned_to?: { id: number; employee_code: string; full_name: string; phone: string };
  created_by?: { id: number; employee_code: string; full_name: string };
  created_at: string;
  activities?: LeadActivity[];
  lead_score?: number;
  sla_breach_at?: string | null;
  campaign?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  referral_person_name?: string | null;
  external_agent_name?: string | null;
  external_agent_phone?: string | null;
  external_agent_associate_id?: string | null;
  external_agent_company?: string | null;
  can_edit?: boolean;
  converted_customer?: { customer_code: string } | null;
}

interface LeadDetailModalProps {
  lead: Lead;
  onClose: () => void;
  onUpdateStatus: (leadId: number, newStatus: string) => Promise<void>;
  onRefreshLeads: () => void;
  onDemoComplete?: (leadId: number, qualification: any, notes: string) => Promise<void>;
  // Fired right after Schedule Demo / Complete Demo succeed, with just the
  // fields that changed. onRefreshLeads() only refetches the parent's list —
  // it doesn't touch whatever object THIS modal is still holding as its
  // `lead` prop, so without this the badge and Next Actions kept showing the
  // pre-action status until the modal was closed and reopened. Optional so
  // callers that don't track a "selected lead" (e.g. dashboard widgets) can
  // skip it with no regression from before.
  onLeadPatched?: (patch: Partial<Lead>) => void;
  initialShowScheduleModal?: boolean;
}

export const LeadDetailModal: React.FC<LeadDetailModalProps> = ({
  lead,
  onClose,
  onUpdateStatus,
  onRefreshLeads,
  onDemoComplete,
  onLeadPatched,
  initialShowScheduleModal,
}) => {
  const { user, fetchWithAuth } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { sendWhatsAppMessage } = useWhatsApp();

  const [dossierTab, setDossierTab] = useState<
    'DETAILS' | 'MATCHES' | 'INTERESTS' | 'VISITS' | 'DEMOS' | 'FOLLOW_UPS' | 'SALES_OPPS'
  >('DETAILS');
  const [activeTab, setActiveTab] = useState('DETAILS');
  const [showQualifyModal, setShowQualifyModal] = useState(false);
  const [showDropModal, setShowDropModal] = useState(false);
  const [isConverting, setIsConverting] = useState(false);

  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [savedInterests, setSavedInterests] = useState<SavedInterestItem[]>([]);
  const [leadVisits, setLeadVisits] = useState<LeadVisitItem[]>([]);
  const [leadDemos, setLeadDemos] = useState<LeadDemoItem[]>([]);
  const [leadTasks, setLeadTasks] = useState<LeadTaskItem[]>([]);
  const [leadSalesOpps, setLeadSalesOpps] = useState<LeadSalesOppItem[]>([]);

  const [isLoadingMatches, setIsLoadingMatches] = useState(false);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [isLoadingSalesOpps, setIsLoadingSalesOpps] = useState(false);

  // New Task Form State
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskDeadline, setNewTaskDeadline] = useState(
    new Date(Date.now() + 86400000).toISOString().slice(0, 16),
  );
  const [newTaskPriority, setNewTaskPriority] = useState('MEDIUM');
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  // Site Visit Schedule Form
  const [showScheduleModal, setShowScheduleModal] = useState(initialShowScheduleModal || false);
  const [scheduleSuccess, setScheduleSuccess] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(
    new Date(Date.now() + 86400000).toISOString().slice(0, 16),
  );
  const [scheduleNotes, setScheduleNotes] = useState(
    'Telecaller booked site visit for client discussion.',
  );
  // "PROPERTY-123" or "UNIT-456" — matches the same disambiguation pattern
  // used by the booking pickers (CreateBookingModal, BookingInitiationWizard).
  const [scheduleInventoryKey, setScheduleInventoryKey] = useState<string>('');

  // Demo completion modal (§1 row 4: demo handler may revise qualification fields)
  const [showDemoCompleteModal, setShowDemoCompleteModal] = useState(false);
  const [demoCompleteLoading, setDemoCompleteLoading] = useState(false);
  const [demoPropertyType, setDemoPropertyType] = useState('');
  const [demoPreferredLocation, setDemoPreferredLocation] = useState('');
  const [demominBudget, setDemominBudget] = useState('');
  const [demomaxBudget, setDemomaxBudget] = useState('');
  const [demoNotes, setDemoNotes] = useState('');
  const [demoSiteVisitCompleted, setDemoSiteVisitCompleted] = useState(false);

  // Qualification state for editing
  const [showQualificationModal, setShowQualificationModal] = useState(false);

  // Eligible demo-handler list for the Schedule Demo modal.
  const [demoAssignees, setDemoAssignees] = useState<
    { id: number; full_name?: string; employee_code?: string }[]
  >([]);
  const [isLoadingDemoAssignees, setIsLoadingDemoAssignees] = useState(false);
  const [demoHandlerId, setDemoHandlerId] = useState('');
  const [showDemoScheduleModal, setShowDemoScheduleModal] = useState(false);
  const [demoScheduleSuccess, setDemoScheduleSuccess] = useState(false);
  const [demoScheduleDate, setDemoScheduleDate] = useState(
    new Date(Date.now() + 86400000).toISOString().slice(0, 16),
  );
  const [isSchedulingDemo, setIsSchedulingDemo] = useState(false);

  // Pre-fill demo completion form when modal opens
  useEffect(() => {
    if (showDemoCompleteModal) {
      setDemoPropertyType(lead.property_type_preference || '');
      setDemoPreferredLocation(lead.preferred_location || '');
      setDemominBudget(lead.budget_min ? String(lead.budget_min) : '');
      setDemomaxBudget(lead.budget_max ? String(lead.budget_max) : '');
      setDemoNotes('');
      setDemoSiteVisitCompleted(false);
    }
  }, [showDemoCompleteModal, lead]);

  const fetchDemoAssignees = async () => {
    setIsLoadingDemoAssignees(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/employees/demo-assignees`);
      const data = await res.json();
      if (res.ok) {
        setDemoAssignees(data.assignees || []);
      }
    } catch (e) {
      console.error('Fetch demo assignees error:', e);
    } finally {
      setIsLoadingDemoAssignees(false);
    }
  };

  // Reset + fetch the eligible-assignee list every time the Schedule Demo
  // modal opens, so a stale selection can't leak across leads/openings.
  useEffect(() => {
    if (showDemoScheduleModal) {
      setDemoHandlerId('');
      setDemoScheduleSuccess(false);
      fetchDemoAssignees();
    }
  }, [showDemoScheduleModal]);

  const fetchMatchesForLead = async (leadId: number) => {
    setIsLoadingMatches(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/leads/${leadId}/matches`);
      const data = await res.json();
      if (res.ok) {
        setMatches(data.matches || []);
      }
    } catch (e) {
      console.error('Fetch matches error:', e);
    } finally {
      setIsLoadingMatches(false);
    }
  };

  const fetchSavedInterests = async (leadId: number) => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/leads/${leadId}/properties`);
      const data = await res.json();
      if (res.ok) {
        setSavedInterests(data.interests || []);
      }
    } catch (e) {
      console.error('Fetch interests error:', e);
    }
  };

  const fetchLeadVisits = async (leadId: number) => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/site-visits?leadId=${leadId}`);
      const data = await res.json();
      if (res.ok) {
        setLeadVisits(data.visits || []);
      }
    } catch (e) {
      console.error('Fetch lead visits error:', e);
    }
  };

  const fetchLeadDemos = async (leadId: number) => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/demos?leadId=${leadId}`);
      const data = await res.json();
      if (res.ok) {
        setLeadDemos(data.demos || []);
      }
    } catch (e) {
      console.error('Fetch lead demos error:', e);
    }
  };

  const fetchLeadTasks = async (leadId: number) => {
    setIsLoadingTasks(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/leads/${leadId}/tasks`);
      const data = await res.json();
      if (res.ok) {
        setLeadTasks(data.tasks || []);
      }
    } catch (e) {
      console.error('Fetch lead tasks error:', e);
    } finally {
      setIsLoadingTasks(false);
    }
  };

  const fetchLeadSalesOpps = async (leadId: number) => {
    setIsLoadingSalesOpps(true);
    try {
      const resAll = await fetchWithAuth(`${API_BASE_URL}/opportunities`);
      const data = await resAll.json();
      if (resAll.ok) {
        const filtered = (data.opportunities || []).filter(
          (o: LeadSalesOppItem) => o.lead_id === leadId,
        );
        setLeadSalesOpps(filtered);
      }
    } catch (e) {
      console.error('Fetch sales opps error:', e);
    } finally {
      setIsLoadingSalesOpps(false);
    }
  };

  useEffect(() => {
    if (lead) {
      fetchMatchesForLead(lead.id);
      fetchSavedInterests(lead.id);
      fetchLeadVisits(lead.id);
    }
  }, [lead.id]);

  const handleCreateTask = async (leadId: number) => {
    if (!newTaskTitle) return showToast('Title is required', 'error');
    setIsCreatingTask(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTaskTitle,
          description: newTaskDesc,
          priority: newTaskPriority,
          deadline: newTaskDeadline,
          lead_id: leadId,
          assignee_id: user?.id,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Follow-up task scheduled', 'success');
        setNewTaskTitle('');
        setNewTaskDesc('');
        fetchLeadTasks(leadId);
      } else {
        showToast(data.error || 'Failed to create task', 'error');
      }
    } catch (e) {
      showToast('Network error creating task', 'error');
    } finally {
      setIsCreatingTask(false);
    }
  };

  // `kind` defaults to 'PROPERTY' so every pre-existing call site (which never
  // passed one) keeps working unchanged — only the Matches tab's project-unit
  // cards pass 'UNIT'.
  const handleAddInterest = async (
    leadId: number,
    id: number,
    kind: 'PROPERTY' | 'UNIT' = 'PROPERTY',
  ) => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/leads/${leadId}/properties`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kind === 'UNIT' ? { project_unit_id: id } : { property_id: id }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(
          kind === 'UNIT' ? 'Unit saved to interests' : 'Property saved to interests',
          'success',
        );
        fetchSavedInterests(leadId);
      } else {
        showToast(data.error || 'Failed to save interest', 'error');
      }
    } catch (e) {
      showToast('Network error saving interest', 'error');
    }
  };

  const handleRemoveInterest = async (
    leadId: number,
    id: number,
    kind: 'PROPERTY' | 'UNIT' = 'PROPERTY',
  ) => {
    try {
      const res = await fetchWithAuth(
        `${API_BASE_URL}/leads/${leadId}/properties/${id}${kind === 'UNIT' ? '?kind=UNIT' : ''}`,
        { method: 'DELETE' },
      );
      const data = await res.json();
      if (res.ok) {
        showToast('Removed from interests', 'success');
        fetchSavedInterests(leadId);
      } else {
        showToast(data.error || 'Failed to remove interest', 'error');
      }
    } catch (e) {
      showToast('Network error removing interest', 'error');
    }
  };

  const handleSendWhatsAppProposal = async (
    leadId: number,
    id: number,
    defaultUrl?: string,
    kind: 'PROPERTY' | 'UNIT' = 'PROPERTY',
  ) => {
    try {
      const res = await fetchWithAuth(
        `${API_BASE_URL}/leads/${leadId}/whatsapp-proposal/${id}${kind === 'UNIT' ? '?kind=UNIT' : ''}`,
        {
          method: 'POST',
        },
      );
      const data = await res.json();
      if (res.ok) {
        showToast('WhatsApp Proposal generated & logged in activity history!', 'success');
        const targetUrl = data.whatsAppUrl || defaultUrl;
        if (targetUrl) {
          window.open(targetUrl, '_blank');
        }
        onRefreshLeads();
      } else {
        showToast(data.error || 'Failed to send WhatsApp proposal', 'error');
      }
    } catch (e) {
      showToast('Error generating WhatsApp proposal', 'error');
    }
  };

  /**
   * Demo completion handler (§1 row 4).
   * Submits revised qualification fields + DEMO_COMPLETED transition in one flow:
   *  1. PATCH lead with optional qualification fields (idempotent — null leaves current value).
   *  2. PATCH lead status to DEMO_COMPLETED with qualification guard fields.
   */
  const handleDemoCompleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDemoCompleteLoading(true);
    try {
      // Build qualification object from form values (omit empty strings → null)
      const qualification: any = {};
      if (demoPropertyType && demoPropertyType !== lead.property_type_preference) {
        qualification.property_type_preference = demoPropertyType;
      }
      if (demoPreferredLocation && demoPreferredLocation !== lead.preferred_location) {
        qualification.preferred_location = demoPreferredLocation;
      }
      if (demominBudget) {
        const val = parseInt(demominBudget, 10);
        if (!isNaN(val)) qualification.budget_min = val;
      }
      if (demomaxBudget) {
        const val = parseInt(demomaxBudget, 10);
        if (!isNaN(val)) qualification.budget_max = val;
      }

      // If nothing changed and no notes, skip — but still transition
      const hasQualification = Object.keys(qualification).length > 0;

      // Step 1: PATCH qualification fields if any were provided
      if (hasQualification) {
        const patchRes = await fetchWithAuth(`${API_BASE_URL}/leads/${lead.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            property_type_preference: qualification.property_type_preference,
            preferred_location: qualification.preferred_location,
            budget_min: qualification.budget_min,
            budget_max: qualification.budget_max,
          }),
        });
        if (!patchRes.ok) {
          const data = await patchRes.json();
          throw new Error(data.message || 'Failed to save demo qualification revisions');
        }
      }

      // Step 2: Transition to DEMO_COMPLETED with qualification guard fields
      const statusRes = await fetchWithAuth(`${API_BASE_URL}/leads/${lead.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'DEMO_COMPLETED',
          notes: demoNotes || undefined,
          qualification: hasQualification ? qualification : undefined,
        }),
      });
      const data = await statusRes.json();

      if (statusRes.ok) {
        showToast('Demo completed — lead moved to next stage', 'success');
        setShowDemoCompleteModal(false);
        onLeadPatched?.({ status: 'DEMO_COMPLETED', ...qualification });
        onRefreshLeads();
      } else {
        throw new Error(data.message || 'Failed to complete demo');
      }
    } catch (err: any) {
      showToast(err.message || 'Error completing demo', 'error');
    } finally {
      setDemoCompleteLoading(false);
    }
  };

  const getStatusMap = (status: string) => {
    switch (status) {
      case 'NEW':
      case 'QUALIFIED':
      case 'SITE_VISIT_SCHEDULED':
      case 'SITE_VISIT_COMPLETED':
      case 'NEGOTIATION':
        return 'hot';
      case 'CONTACTED':
      case 'DEMO_SCHEDULED':
      case 'DEMO_COMPLETED':
        return 'warm';
      case 'ASSIGNED':
        return 'pending';
      case 'BOOKING_INITIATED':
      case 'BOOKED':
      case 'WON':
        return 'success';
      case 'DROPPED':
      case 'LOST':
        return 'danger';
      default:
        return 'default';
    }
  };

  const availableNextTransitions = () => {
    const current = lead.status;
    // Mirrors LeadWorkflow.DROPPABLE_FROM (apps/api/src/workflows/lead.workflow.ts)
    // exactly — NEW, BOOKED, DROPPED and RECOVERED_TO_POOL cannot be dropped,
    // and offering the button there always errored on click.
    const DROPPABLE_FROM = new Set([
      'ASSIGNED',
      'CONTACTED',
      'QUALIFIED',
      'DEMO_SCHEDULED',
      'DEMO_COMPLETED',
      'SITE_VISIT_SCHEDULED',
      'SITE_VISIT_COMPLETED',
      'NEGOTIATION',
      'BOOKING_INITIATED',
    ]);

    let valid: string[] = DROPPABLE_FROM.has(current) ? ['DROPPED'] : [];

    if (current === 'NEW') valid.push('ASSIGNED');
    if (current === 'ASSIGNED') valid.push('CONTACTED');
    if (current === 'CONTACTED') valid.push('QUALIFIED');
    if (current === 'QUALIFIED') valid.push('DEMO_SCHEDULED', 'SITE_VISIT_SCHEDULED');
    if (current === 'DEMO_SCHEDULED') valid.push('DEMO_COMPLETED');
    if (current === 'DEMO_COMPLETED') valid.push('SITE_VISIT_SCHEDULED');
    if (current === 'SITE_VISIT_SCHEDULED') valid.push('SITE_VISIT_COMPLETED');
    if (current === 'SITE_VISIT_COMPLETED') valid.push('NEGOTIATION');
    if (current === 'NEGOTIATION') valid.push('BOOKING_INITIATED');
    if (current === 'BOOKING_INITIATED') valid.push('BOOKED');
    if (current === 'DROPPED') valid.push('RECOVERED_TO_POOL');
    if (current === 'RECOVERED_TO_POOL') valid.push('ASSIGNED');

    return valid.filter((v) => v !== current);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
        <div className="w-full max-w-2xl bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 relative max-h-[90vh] overflow-y-auto">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-navy-900 bg-slate-50 rounded-full hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3 mb-2">
            <span className="font-mono font-bold text-navy-800 text-sm">{lead.lead_code}</span>
            <StatusPill status={lead.status} type={getStatusMap(lead.status)} />
            {lead.can_edit === false && (
              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-bold uppercase tracking-wider border border-slate-200">
                View only — {lead.assigned_to ? 'assigned to someone else' : 'not assigned to you'}
              </span>
            )}
          </div>

          <div className="flex items-start justify-between mb-5">
            <div>
              <h3 className="font-bold text-navy-900 text-2xl">{lead.customer_name}</h3>
              <p className="text-sm text-slate-500 font-mono mt-1">
                {lead.phone} {lead.email ? `• ${lead.email}` : ''}
              </p>
            </div>
            {lead.lead_score !== undefined && (
              <div className="flex flex-col items-end">
                <div className="px-3 py-1.5 bg-gold-100 text-gold-700 rounded-lg font-bold text-xs shadow-sm border border-gold-200">
                  {lead.lead_score} PTS
                </div>
                {lead.sla_breach_at && new Date(lead.sla_breach_at) < new Date() && (
                  <span className="text-[10px] text-danger-700 font-bold mt-1">SLA BREACHED</span>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 p-5 bg-surface rounded-2xl mb-6 text-sm">
            <div className="col-span-2 grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1 p-3 bg-white rounded-xl shadow-sm border border-slate-100">
                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-widest flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-navy-600" /> Introduced By
                </span>
                <div className="font-semibold text-navy-900 truncate">
                  {lead.created_by?.full_name || lead.created_by?.employee_code || 'System'}
                </div>
              </div>

              <div className="flex flex-col gap-1 p-3 bg-white rounded-xl shadow-sm border border-slate-100">
                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-widest flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-navy-600" /> Assigned To
                </span>
                <div className="font-semibold text-navy-900 truncate">
                  {lead.assigned_to?.full_name || 'Unassigned'}
                </div>
              </div>
            </div>

            <div>
              <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                Source
              </span>
              <div className="font-semibold text-navy-900 mt-0.5">
                {lead.source}
                {lead.source === 'REFERRAL' && lead.referral_person_name && (
                  <span className="ml-1 text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                    by {lead.referral_person_name}
                  </span>
                )}
              </div>
            </div>

            <div>
              <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                Created
              </span>
              <div className="font-semibold text-navy-900 mt-0.5">
                {new Date(lead.created_at).toLocaleDateString('en-IN')}
              </div>
            </div>

            <div>
              <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                Location
              </span>
              <div className="font-semibold text-navy-900 mt-0.5">
                {lead.preferred_location || 'N/A'}
              </div>
            </div>

            <div>
              <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                Preference & Budget
              </span>
              <div className="font-semibold text-navy-900 mt-0.5 flex items-center gap-2">
                {lead.property_type_preference || 'Unspecified'}
                <span className="text-slate-500">
                  (₹{lead.budget_max ? (lead.budget_max / 100000).toFixed(1) + 'L' : 'Flexible'})
                </span>
                {lead.can_edit !== false && (
                  <button
                    onClick={() => setShowQualifyModal(true)}
                    className="px-2 py-0.5 text-[10px] font-bold bg-navy-50 text-navy-600 hover:bg-navy-100 rounded-md transition-colors"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>

            {lead.campaign && (
              <div className="col-span-2 mt-2 pt-3 border-t border-slate-200 flex flex-wrap gap-4">
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                    Campaign
                  </span>
                  <div className="font-semibold text-navy-900 mt-0.5">{lead.campaign}</div>
                </div>
                {lead.utm_source && (
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                      UTM Source
                    </span>
                    <div className="font-semibold text-navy-900 mt-0.5">{lead.utm_source}</div>
                  </div>
                )}
                {lead.utm_medium && (
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                      UTM Medium
                    </span>
                    <div className="font-semibold text-navy-900 mt-0.5">{lead.utm_medium}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex overflow-x-auto gap-2 border-b border-slate-100 mb-5 pb-1 hide-scrollbar">
            {[
              { id: 'DETAILS', label: 'Info & Activity' },
              { id: 'MATCHES', label: `Matches (${matches.length})`, icon: Building2 },
              { id: 'INTERESTS', label: `Interests (${savedInterests.length})`, icon: ShieldCheck },
              { id: 'VISITS', label: `Visits (${leadVisits.length})`, icon: MapPin },
              { id: 'DEMOS', label: `Demos (${leadDemos.length})`, icon: Calendar },
              { id: 'FOLLOW_UPS', label: `Tasks (${leadTasks.length})`, icon: PhoneCall },
              { id: 'SALES_OPPS', label: 'Sales Opps', icon: LineChart },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setDossierTab(tab.id as any);
                  if (tab.id === 'MATCHES') fetchMatchesForLead(lead.id);
                  if (tab.id === 'INTERESTS') fetchSavedInterests(lead.id);
                  if (tab.id === 'VISITS') fetchLeadVisits(lead.id);
                  if (tab.id === 'DEMOS') fetchLeadDemos(lead.id);
                  if (tab.id === 'FOLLOW_UPS') fetchLeadTasks(lead.id);
                  if (tab.id === 'SALES_OPPS') fetchLeadSalesOpps(lead.id);
                }}
                className={`px-4 py-2 rounded-t-xl text-sm font-semibold flex items-center gap-2 whitespace-nowrap border-b-2 transition-colors ${
                  dossierTab === tab.id
                    ? 'border-navy-600 text-navy-900 bg-navy-50/50'
                    : 'border-transparent text-slate-500 hover:text-navy-700 hover:bg-slate-50'
                }`}
              >
                {tab.icon && <tab.icon className="w-4 h-4 opacity-70" />}
                {tab.label}
              </button>
            ))}
          </div>

          <div className="min-h-[250px]">
            {dossierTab === 'DETAILS' && (
              <div className="space-y-6">
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-bold text-navy-900 text-sm">Next Actions</h4>
                    {lead.converted_customer && (
                      <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-lg flex items-center gap-1.5 border border-green-200">
                        <Building2 className="w-3.5 h-3.5" />
                        Customer: {lead.converted_customer.customer_code}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setShowScheduleModal(true)}
                      disabled={lead.can_edit === false}
                      className={`px-4 py-2 bg-gold-600 hover:bg-gold-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-2 shadow-sm ${lead.can_edit === false ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <MapPin className="w-4 h-4" />
                      Book Site Visit / Demo
                    </button>

                    {lead.status === 'DEMO_SCHEDULED' && (
                      <button
                        onClick={() => setShowDemoCompleteModal(true)}
                        disabled={lead.can_edit === false}
                        className={`px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-2 shadow-sm ${lead.can_edit === false ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Complete Demo
                      </button>
                    )}

                    {availableNextTransitions()
                      .filter(
                        (st) => !(lead.status === 'DEMO_SCHEDULED' && st === 'DEMO_COMPLETED'),
                      )
                      .map((st) => (
                        <button
                          key={st}
                          onClick={() => {
                            if (st === 'DEMO_SCHEDULED') {
                              setShowDemoScheduleModal(true);
                            } else if (st === 'QUALIFIED') {
                              setShowQualifyModal(true);
                            } else if (st === 'DROPPED') {
                              setShowDropModal(true);
                            } else {
                              onUpdateStatus(lead.id, st);
                            }
                          }}
                          disabled={lead.can_edit === false}
                          className={`px-4 py-2 bg-white hover:bg-slate-50 text-navy-700 border border-slate-200 font-semibold text-xs rounded-lg transition-colors ${lead.can_edit === false ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {st === 'DEMO_SCHEDULED'
                            ? 'Schedule Demo'
                            : st === 'QUALIFIED'
                              ? 'Qualify Lead'
                              : `Move to ${st.replace(/_/g, ' ')}`}
                        </button>
                      ))}
                  </div>
                </div>

                <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-bold text-navy-900 text-sm">Qualification Details</h4>
                    {lead.can_edit !== false && (
                      <button
                        onClick={() => setShowQualificationModal(true)}
                        className="text-xs font-semibold text-navy-600 hover:text-navy-700 transition-colors"
                      >
                        Edit Details
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="block text-slate-500 mb-1 text-xs uppercase tracking-wider font-bold">
                        Property Type
                      </span>
                      <span className="font-semibold text-navy-900">
                        {getPropertyTypeLabel(lead.property_type_preference)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-slate-500 mb-1 text-xs uppercase tracking-wider font-bold">
                        Location
                      </span>
                      <span className="font-semibold text-navy-900">
                        {lead.preferred_location || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="block text-slate-500 mb-1 text-xs uppercase tracking-wider font-bold">
                        Min Budget
                      </span>
                      <span className="font-semibold text-navy-900">
                        {lead.budget_min ? `₹${lead.budget_min.toLocaleString('en-IN')}` : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="block text-slate-500 mb-1 text-xs uppercase tracking-wider font-bold">
                        Max Budget
                      </span>
                      <span className="font-semibold text-navy-900">
                        {lead.budget_max ? `₹${lead.budget_max.toLocaleString('en-IN')}` : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-bold text-navy-900 text-sm">Activity Timeline</h4>
                  <div className="space-y-4 border-l-2 border-slate-100 ml-2 pl-4">
                    {lead.activities?.map((act: LeadActivity) => (
                      <div key={act.id} className="relative">
                        <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-navy-200 ring-4 ring-white" />
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-navy-900 text-sm">
                            {act.activity_type.replace(/_/g, ' ')}
                          </span>
                          <span className="text-xs text-slate-400 font-mono">
                            {new Date(act.created_at).toLocaleString([], {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </span>
                        </div>
                        <p className="text-slate-600 text-sm">{act.notes}</p>
                      </div>
                    ))}
                    {(!lead.activities || lead.activities.length === 0) && (
                      <p className="text-slate-400 text-sm italic">No activity recorded yet.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {dossierTab === 'MATCHES' && (
              <div className="space-y-4">
                {isLoadingMatches ? (
                  <div className="py-8 text-center text-sm text-slate-400 flex flex-col items-center">
                    <div className="w-6 h-6 border-2 border-navy-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                    Evaluating live property matches...
                  </div>
                ) : matches.length === 0 ? (
                  <div className="py-8 px-6 text-center text-sm text-slate-400 bg-surface rounded-xl border border-slate-100">
                    {(!lead.budget_min && !lead.budget_max) ||
                    !lead.property_type_preference ||
                    !lead.preferred_location
                      ? "No matches yet — please fill in this lead's budget, property type, and preferred location."
                      : "No properties or project units currently match this lead's requirements."}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {matches.map((m: MatchItem) => {
                      const isUnit = m.kind === 'UNIT';
                      return (
                        <div
                          key={`${m.kind ?? 'PROPERTY'}-${m.propertyId}`}
                          className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-mono font-semibold text-slate-500 text-xs">
                                {m.propertyCode}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${m.matchScore >= 80 ? 'bg-success-100 text-success-800' : 'bg-warning-100 text-warning-800'}`}
                              >
                                {m.matchScore}% Match
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 mb-1">
                              <h4 className="font-bold text-navy-900 text-sm">{m.title}</h4>
                              {isUnit && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-navy-100 text-navy-700 uppercase tracking-wide shrink-0">
                                  Project Unit
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mb-3">
                              {m.location} • ₹{(m.price / 100000).toFixed(1)}L • {m.areaSqft} sqft
                            </p>
                          </div>

                          <div className="flex items-center gap-2 mt-auto">
                            <button
                              onClick={() =>
                                handleAddInterest(
                                  lead.id,
                                  m.propertyId,
                                  isUnit ? 'UNIT' : 'PROPERTY',
                                )
                              }
                              disabled={lead.can_edit === false}
                              className={`flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-navy-700 font-semibold text-xs rounded-lg transition-colors ${lead.can_edit === false ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              Save
                            </button>
                            <button
                              onClick={() =>
                                handleSendWhatsAppProposal(
                                  lead.id,
                                  m.propertyId,
                                  m.whatsAppUrl,
                                  isUnit ? 'UNIT' : 'PROPERTY',
                                )
                              }
                              disabled={lead.can_edit === false}
                              className={`flex-1 py-1.5 bg-success-600 hover:bg-success-700 text-white font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 ${lead.can_edit === false ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              <PhoneCall className="w-3.5 h-3.5" /> WhatsApp
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {dossierTab === 'INTERESTS' && (
              <div className="space-y-4">
                {savedInterests.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-400 bg-surface rounded-xl border border-slate-100">
                    No properties saved to interests.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {savedInterests.map((interest: SavedInterestItem) => {
                      const isUnit = !!interest.project_unit;
                      const code = isUnit
                        ? interest.project_unit!.unit_code
                        : interest.property?.property_code;
                      const title = isUnit
                        ? `${interest.project_unit!.project.name} — Unit ${
                            interest.project_unit!.flat_number ||
                            interest.project_unit!.villa_number ||
                            interest.project_unit!.plot_number ||
                            interest.project_unit!.unit_number
                          }`
                        : interest.property?.title;
                      const removeId = isUnit ? interest.project_unit_id : interest.property_id;
                      return (
                        <div
                          key={interest.id}
                          className="bg-white rounded-xl p-4 border border-slate-200 flex items-center justify-between shadow-sm group"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-medium text-slate-400 text-xs">
                                {code}
                              </span>
                              {isUnit && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-navy-100 text-navy-700 uppercase tracking-wide">
                                  Project Unit
                                </span>
                              )}
                            </div>
                            <h4 className="font-bold text-navy-900 text-sm mt-0.5">{title}</h4>
                            <p className="text-xs text-slate-500 mt-1">
                              Saved on {new Date(interest.created_at).toLocaleDateString('en-IN')}
                            </p>
                          </div>
                          <button
                            onClick={() =>
                              removeId != null &&
                              handleRemoveInterest(lead.id, removeId, isUnit ? 'UNIT' : 'PROPERTY')
                            }
                            className="p-2 text-slate-400 hover:text-danger-600 bg-slate-50 hover:bg-danger-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {dossierTab === 'VISITS' && (
              <div className="space-y-4">
                {leadVisits.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-400 bg-surface rounded-xl border border-slate-100">
                    No site visits scheduled.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {leadVisits.map((visit: LeadVisitItem) => (
                      <div
                        key={visit.id}
                        className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono font-medium text-slate-400 text-xs">
                              {visit.booking_code}
                            </span>
                            <StatusPill status={visit.status} type={getStatusMap(visit.status)} />
                          </div>
                          {visit.property && (
                            <h4 className="font-bold text-navy-900 text-sm mt-1">
                              {visit.property.title}
                            </h4>
                          )}
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-2">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{new Date(visit.scheduled_date).toLocaleString('en-IN')}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {dossierTab === 'DEMOS' && (
              <div className="space-y-4">
                {leadDemos.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-400 bg-surface rounded-xl border border-slate-100">
                    No demos scheduled.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {leadDemos.map((demo: LeadDemoItem) => (
                      <div
                        key={demo.id}
                        className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <StatusPill status={demo.status} type={getStatusMap(demo.status)} />
                          </div>
                          {demo.handler && (
                            <h4 className="font-bold text-navy-900 text-sm mt-1">
                              {demo.handler.full_name}
                            </h4>
                          )}
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-2">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{new Date(demo.scheduled_at).toLocaleString('en-IN')}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {dossierTab === 'FOLLOW_UPS' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-bold text-navy-900 text-sm mb-4">Schedule Follow-up</h4>
                  <div className="bg-surface rounded-xl p-4 border border-slate-200 space-y-3">
                    <input
                      type="text"
                      placeholder="Task Title"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-navy-600 outline-none"
                    />
                    <textarea
                      placeholder="Notes..."
                      value={newTaskDesc}
                      onChange={(e) => setNewTaskDesc(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-navy-600 outline-none min-h-[80px]"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="datetime-local"
                        value={newTaskDeadline}
                        onChange={(e) => setNewTaskDeadline(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-navy-600 outline-none"
                      />
                      <select
                        value={newTaskPriority}
                        onChange={(e) => setNewTaskPriority(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-navy-600 outline-none"
                      >
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                        <option value="URGENT">Urgent</option>
                      </select>
                    </div>
                    <button
                      onClick={() => handleCreateTask(lead.id)}
                      disabled={isCreatingTask || !newTaskTitle}
                      className="w-full py-2 bg-navy-900 hover:bg-navy-800 disabled:opacity-50 text-white font-bold text-sm rounded-lg transition-colors"
                    >
                      {isCreatingTask ? 'Scheduling...' : 'Schedule Task'}
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-navy-900 text-sm mb-4">Upcoming Tasks</h4>
                  {isLoadingTasks ? (
                    <div className="py-8 text-center text-sm text-slate-400">Loading...</div>
                  ) : leadTasks.length === 0 ? (
                    <div className="py-8 text-center text-sm text-slate-400 bg-surface rounded-xl border border-slate-100">
                      No pending tasks.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {leadTasks.map((task: LeadTaskItem) => (
                        <div
                          key={task.id}
                          className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <h5
                              className={`font-semibold text-sm ${task.status === 'COMPLETED' ? 'line-through text-slate-400' : 'text-navy-900'}`}
                            >
                              {task.title}
                            </h5>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${task.priority === 'HIGH' || task.priority === 'URGENT' ? 'bg-danger-100 text-danger-800' : 'bg-slate-100 text-slate-600'}`}
                            >
                              {task.priority}
                            </span>
                          </div>
                          {task.description && (
                            <p className="text-xs text-slate-500 mb-2">{task.description}</p>
                          )}
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                            <Calendar className="w-3 h-3" />
                            {new Date(task.target_date).toLocaleString('en-IN')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {dossierTab === 'SALES_OPPS' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-bold text-navy-900 text-sm">Linked Sales Opportunities</h4>
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetchWithAuth(`${API_BASE_URL}/opportunities`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ lead_id: lead.id }),
                        });
                        if (!res.ok) throw new Error('Failed to create sales opportunity');
                        showToast('Sales opportunity created', 'success');
                        fetchLeadSalesOpps(lead.id);
                      } catch (e: unknown) {
                        const msg = e instanceof Error ? e.message : String(e);
                        showToast(msg, 'error');
                      }
                    }}
                    className="px-3 py-1.5 bg-navy-100 hover:bg-navy-200 text-navy-800 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> Create Opp
                  </button>
                </div>

                {isLoadingSalesOpps ? (
                  <div className="py-8 text-center text-sm text-slate-400">Loading...</div>
                ) : leadSalesOpps.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-400 bg-surface rounded-xl border border-slate-100">
                    No sales opportunities found.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {leadSalesOpps.map((opp: LeadSalesOppItem) => (
                      <div
                        key={opp.id}
                        className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="text-[10px] font-mono text-slate-400 mb-0.5">
                              #{opp.id}
                            </div>
                            <h5 className="font-bold text-navy-900 text-sm truncate max-w-[150px]">
                              {opp.project?.name ? `${opp.project.name} Sales` : 'Open Opportunity'}
                            </h5>
                          </div>
                          <StatusPill status={getLeadStatusLabel(lead.status)} type="pending" />
                        </div>
                        <div className="flex items-center justify-between text-sm mt-4 pt-3 border-t border-slate-100">
                          <div>
                            <p className="text-[10px] text-slate-400 font-semibold uppercase">
                              Value
                            </p>
                            <p className="font-bold text-navy-900">
                              ₹{(Number(opp.expected_value || 0) / 100000).toFixed(1)}L
                            </p>
                          </div>
                          <button
                            onClick={() => navigate('/sales-pipeline')}
                            className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-navy-700 font-semibold text-xs rounded-lg transition-colors"
                          >
                            View Pipeline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showScheduleModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-100">
            <div className="bg-gold-600 p-5 flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                <h3 className="font-bold text-sm tracking-wide">Book Site Visit</h3>
              </div>
              <button
                onClick={() => {
                  setShowScheduleModal(false);
                  setScheduleSuccess(false);
                }}
                className="hover:bg-black/10 p-1.5 rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {scheduleSuccess ? (
              <div className="p-8 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </div>
                <h4 className="text-xl font-bold text-navy-900">Site Visit Scheduled!</h4>
                <p className="text-sm text-slate-500">
                  The site visit has been successfully booked and routed.
                </p>
                <button
                  onClick={() => {
                    sendWhatsAppMessage('SITE_VISIT_SCHEDULED', lead.phone, {
                      customer_name: lead.customer_name,
                      visit_date: new Date(scheduleDate).toLocaleDateString('en-IN'),
                      visit_time: new Date(scheduleDate).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      }),
                      lead_code: lead.lead_code,
                    });
                  }}
                  className="mt-4 px-6 py-3 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Send Site Visit Scheduled WhatsApp
                </button>
                <button
                  onClick={() => {
                    setShowScheduleModal(false);
                    setScheduleSuccess(false);
                  }}
                  className="mt-2 px-6 py-2 w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition-all"
                >
                  Close
                </button>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Scheduled Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="w-full px-3 py-2 bg-surface border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Notes
                  </label>
                  <textarea
                    value={scheduleNotes}
                    onChange={(e) => setScheduleNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-surface border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 min-h-[80px]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Attach Property or Project Unit
                  </label>
                  <select
                    value={scheduleInventoryKey}
                    onChange={(e) => setScheduleInventoryKey(e.target.value)}
                    className="w-full px-3 py-2 bg-surface border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
                  >
                    <option value="">-- Nothing Attached --</option>
                    {savedInterests.filter((i) => i.property).length > 0 && (
                      <optgroup label="Saved Properties">
                        {savedInterests
                          .filter((interest) => interest.property)
                          .map((interest) => (
                            <option
                              key={`PROPERTY-${interest.property_id}`}
                              value={`PROPERTY-${interest.property_id}`}
                            >
                              {interest.property!.title} ({interest.property!.property_code})
                            </option>
                          ))}
                      </optgroup>
                    )}
                    {savedInterests.filter((i) => i.project_unit).length > 0 && (
                      <optgroup label="Saved Project Units">
                        {savedInterests
                          .filter((interest) => interest.project_unit)
                          .map((interest) => {
                            const u = interest.project_unit!;
                            const label =
                              u.flat_number || u.villa_number || u.plot_number || u.unit_number;
                            return (
                              <option
                                key={`UNIT-${interest.project_unit_id}`}
                                value={`UNIT-${interest.project_unit_id}`}
                              >
                                {u.project.name} — Unit {label}
                              </option>
                            );
                          })}
                      </optgroup>
                    )}
                  </select>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowScheduleModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!scheduleDate) return;
                      const [kind, idStr] = scheduleInventoryKey.split('-');
                      const id = idStr ? parseInt(idStr, 10) : undefined;
                      try {
                        const res = await fetchWithAuth(`${API_BASE_URL}/site-visits`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            lead_id: lead.id,
                            scheduled_date: new Date(scheduleDate).toISOString(),
                            notes: scheduleNotes,
                            // SiteVisitCreateSchema only recognises the plural
                            // *_ids arrays — a bare property_id here was
                            // previously silently stripped by zod's default
                            // unknown-key handling before ever reaching
                            // bookVisit(), so "Attach Property" never actually
                            // attached anything.
                            property_ids: kind === 'PROPERTY' && id ? [id] : undefined,
                            project_unit_ids: kind === 'UNIT' && id ? [id] : undefined,
                          }),
                        });
                        const data = await res.json();
                        if (res.ok) {
                          showToast('Site visit booked successfully', 'success');
                          setScheduleSuccess(true);
                          onRefreshLeads();
                          fetchLeadVisits(lead.id);
                        } else {
                          showToast(data.error || 'Failed to book site visit', 'error');
                        }
                      } catch (err) {
                        showToast('Error booking site visit', 'error');
                      }
                    }}
                    className="px-6 py-2 bg-gold-600 hover:bg-gold-700 text-white font-bold text-sm rounded-xl shadow-md transition-all"
                  >
                    Confirm Booking
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showDemoScheduleModal && (
        <div className="fixed inset-0 z-[70] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col relative animate-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Schedule Demo</h2>
                <p className="text-sm text-slate-500 mt-1">Pick a date and who will run it.</p>
              </div>
              <button
                onClick={() => {
                  setShowDemoScheduleModal(false);
                  setDemoScheduleSuccess(false);
                }}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-white border border-transparent hover:border-slate-200 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {demoScheduleSuccess ? (
              <div className="p-8 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </div>
                <h4 className="text-xl font-bold text-navy-900">Demo Scheduled!</h4>
                <p className="text-sm text-slate-500">
                  The demo has been booked and is awaiting the handler's acceptance.
                </p>
                <button
                  onClick={() => {
                    sendWhatsAppMessage('DEMO_SCHEDULED', lead.phone, {
                      customer_name: lead.customer_name,
                      visit_date: new Date(demoScheduleDate).toLocaleDateString('en-IN'),
                      visit_time: new Date(demoScheduleDate).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      }),
                      lead_code: lead.lead_code,
                    });
                  }}
                  className="mt-4 px-6 py-3 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Send Demo Scheduled WhatsApp
                </button>
                <button
                  onClick={() => {
                    setShowDemoScheduleModal(false);
                    setDemoScheduleSuccess(false);
                  }}
                  className="mt-2 px-6 py-2 w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition-all"
                >
                  Close
                </button>
              </div>
            ) : (
              <div className="p-6 space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-navy-500" />
                    Date &amp; Time
                  </label>
                  <input
                    type="datetime-local"
                    value={demoScheduleDate}
                    onChange={(e) => setDemoScheduleDate(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-navy-500" />
                    Handler <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={demoHandlerId}
                    onChange={(e) => setDemoHandlerId(e.target.value)}
                    disabled={isLoadingDemoAssignees}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 transition-all appearance-none disabled:opacity-50"
                  >
                    <option value="" className="text-slate-800 bg-white">
                      Select who will run this demo...
                    </option>
                    {demoAssignees.map((a) => (
                      <option key={a.id} value={a.id} className="text-slate-800 bg-white">
                        {formatEmployeeLabel(a)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDemoScheduleModal(false);
                      setDemoScheduleSuccess(false);
                    }}
                    disabled={isSchedulingDemo}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-2xl transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSchedulingDemo}
                    onClick={async () => {
                      if (!demoScheduleDate) {
                        showToast('Please select a date and time for this demo', 'error');
                        return;
                      }
                      if (!demoHandlerId) {
                        showToast('Please select who will handle this demo', 'error');
                        return;
                      }
                      setIsSchedulingDemo(true);
                      try {
                        const res = await fetchWithAuth(`${API_BASE_URL}/leads/${lead.id}/status`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            status: 'DEMO_SCHEDULED',
                            demo_scheduled_at: new Date(demoScheduleDate).toISOString(),
                            demo_handler_id: parseInt(demoHandlerId, 10),
                          }),
                        });
                        const data = await res.json();
                        if (res.ok) {
                          showToast('Demo scheduled successfully', 'success');
                          setDemoScheduleSuccess(true);
                          onLeadPatched?.({ status: 'DEMO_SCHEDULED' });
                          onRefreshLeads();
                          fetchLeadDemos(lead.id);
                          setDossierTab('DEMOS');
                        } else {
                          showToast(data.error || 'Failed to schedule demo', 'error');
                        }
                      } catch (err) {
                        showToast('Error scheduling demo', 'error');
                      } finally {
                        setIsSchedulingDemo(false);
                      }
                    }}
                    className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm rounded-2xl shadow-md transition-colors disabled:opacity-50"
                  >
                    {isSchedulingDemo ? 'Scheduling...' : 'Confirm Schedule'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showDemoCompleteModal && (
        <div className="fixed inset-0 z-[70] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col relative animate-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Complete Demo</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Record demo outcome and any revised requirements.
                </p>
              </div>
              <button
                onClick={() => setShowDemoCompleteModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-white border border-transparent hover:border-slate-200 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleDemoCompleteSubmit}
              className="p-6 space-y-6 max-h-[70vh] overflow-y-auto"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1 space-y-2">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-navy-500" />
                    Property Type
                  </label>
                  <select
                    value={demoPropertyType}
                    onChange={(e) => setDemoPropertyType(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 transition-all appearance-none"
                  >
                    <option value={lead.property_type_preference || ''}>
                      {lead.property_type_preference || '— unchanged —'}
                    </option>
                    <option value="RESIDENTIAL_APARTMENT">Apartment</option>
                    <option value="RESIDENTIAL_VILLA">Villa</option>
                    <option value="RESIDENTIAL_PLOT">Plot</option>
                    <option value="COMMERCIAL_OFFICE">Commercial Office</option>
                    <option value="COMMERCIAL_SHOP">Commercial Shop</option>
                  </select>
                </div>

                <div className="col-span-2 sm:col-span-1 space-y-2">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-navy-500" />
                    Preferred Location
                  </label>
                  <input
                    type="text"
                    value={demoPreferredLocation}
                    onChange={(e) => setDemoPreferredLocation(e.target.value)}
                    placeholder={lead.preferred_location || 'e.g. Kondapur'}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 transition-all"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1 space-y-2">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <IndianRupee className="w-4 h-4 text-navy-500" />
                    Min Budget (₹)
                  </label>
                  <input
                    type="number"
                    value={demominBudget}
                    onChange={(e) => setDemominBudget(e.target.value)}
                    placeholder={lead.budget_min ? String(lead.budget_min) : 'e.g. 5000000'}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 transition-all"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1 space-y-2">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <IndianRupee className="w-4 h-4 text-navy-500" />
                    Max Budget (₹)
                  </label>
                  <input
                    type="number"
                    value={demomaxBudget}
                    onChange={(e) => setDemomaxBudget(e.target.value)}
                    placeholder={lead.budget_max ? String(lead.budget_max) : 'e.g. 15000000'}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 transition-all"
                  />
                </div>

                <div className="col-span-2 space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={demoSiteVisitCompleted}
                      onChange={(e) => setDemoSiteVisitCompleted(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-navy-600 focus:ring-navy-500"
                    />
                    <span className="text-sm font-semibold text-slate-700">
                      Site visit completed
                    </span>
                  </label>
                  <p className="text-xs text-slate-400 ml-7">
                    Check if the customer toured the site during this demo.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-navy-500" />
                  Demo Notes
                </label>
                <textarea
                  rows={3}
                  value={demoNotes}
                  onChange={(e) => setDemoNotes(e.target.value)}
                  placeholder="What was shown, customer feedback, any concerns..."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 transition-all resize-none"
                />
              </div>
            </form>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDemoCompleteModal(false)}
                className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 hover:border-slate-300 rounded-xl transition-all shadow-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                onClick={handleDemoCompleteSubmit}
                disabled={demoCompleteLoading}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-navy-900 hover:bg-navy-800 rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {demoCompleteLoading ? 'Completing...' : 'Confirm Demo Completion'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showQualifyModal && (
        <QualificationFormModal
          title="Qualify Lead"
          initialData={{
            budget_min: lead.budget_min,
            budget_max: lead.budget_max,
            property_type_preference: lead.property_type_preference,
            preferred_location: lead.preferred_location,
            preferred_locations: lead.preferred_locations?.map((pl) => pl.location),
          }}
          // Moving to QUALIFIED requires every field — the backend rejects
          // the transition otherwise (lead.workflow.ts) — so this is the one
          // place requireAllFields must be true, unlike the "Edit
          // Qualification Details" instance below which allows partial saves.
          requireAllFields
          onClose={() => setShowQualifyModal(false)}
          onSave={async (data) => {
            const patchRes = await fetchWithAuth(`${API_BASE_URL}/leads/${lead.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data),
            });
            const resData = await patchRes.json().catch(() => ({}));
            if (!patchRes.ok) {
              const formatted = toUserFacingError({ status: patchRes.status, body: resData });
              showToast({ ...formatted, type: 'error' });
              throw new Error('SILENT');
            }
            setShowQualifyModal(false);
            // Qualification fields are saved by this point — but that alone
            // doesn't move the lead to QUALIFIED, so the transition still
            // needs to happen explicitly.
            await onUpdateStatus(lead.id, 'QUALIFIED');
            onRefreshLeads();
            onClose();
          }}
        />
      )}

      {showQualificationModal && (
        <QualificationFormModal
          title="Edit Qualification Details"
          initialData={{
            budget_min: lead.budget_min,
            budget_max: lead.budget_max,
            property_type_preference: lead.property_type_preference,
            preferred_location: lead.preferred_location,
            // lead.preferred_locations (the full multi-location list) was
            // fetched but never passed in here, so this modal — which
            // already fully supports editing multiple locations — only ever
            // showed the single legacy value, silently discarding the rest
            // whenever it was reopened and re-saved.
            preferred_locations: lead.preferred_locations?.map((pl) => pl.location),
          }}
          requireAllFields={false} // Editing doesn't force all fields unless moving to QUALIFIED
          onClose={() => setShowQualificationModal(false)}
          onSave={async (data) => {
            const patchRes = await fetchWithAuth(`${API_BASE_URL}/leads/${lead.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data),
            });
            const resData = await patchRes.json().catch(() => ({}));
            if (!patchRes.ok) {
              const formatted = toUserFacingError({ status: patchRes.status, body: resData });
              showToast({ ...formatted, type: 'error' });
              throw new Error('SILENT');
            }
            showToast('Qualification details updated', 'success');
            onRefreshLeads();
            setShowQualificationModal(false);
          }}
        />
      )}
      {showDropModal && (
        <DropLeadModal
          onClose={() => setShowDropModal(false)}
          onConfirm={async (reason, detail) => {
            const patchRes = await fetchWithAuth(`${API_BASE_URL}/leads/${lead.id}/status`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                status: 'DROPPED',
                exit_reason: reason,
                exit_reason_detail: detail,
              }),
            });
            const resData = await patchRes.json().catch(() => ({}));
            if (!patchRes.ok) {
              const formatted = toUserFacingError({ status: patchRes.status, body: resData });
              showToast({ ...formatted, type: 'error' });
              return;
            }
            showToast('Lead dropped', 'success');
            onRefreshLeads();
            setShowDropModal(false);
          }}
        />
      )}
    </>
  );
};
