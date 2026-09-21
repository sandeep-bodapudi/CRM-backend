import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatEmployeeLabel } from '../../utils/employeeLabel';
import {
  Users,
  Plus,
  Upload,
  TrendingUp,
  PhoneCall,
  ChevronRight,
  X,
  AlertCircle,
  Search,
  MapPin,
  Home,
  IndianRupee,
  UserCircle2,
  Download,
  Building2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';
import { getLeadStatusLabel, getLeadSourceLabel, getRelativeAge } from '../../constants/leadStatus';
import { getPropertyTypeLabel } from '../../constants/propertyTypes';
import { Roles, Permissions } from '../../shared';
import { QuickAddLeadModal } from './QuickAddLeadModal';
import { UnclaimedLeadsBanner } from './UnclaimedLeadsBanner';
import { LeadDetailModal } from './LeadDetailModal';
import { DropLeadModal } from './DropLeadModal';
import { MonitorData, EmployeeListItem, ParsedBulkLeadRow } from '../../types';
import { DataTable, ColumnDef } from '../ui/DataTable';
import { StatusPill } from '../ui/StatusPill';
import { handleApiError, toUserFacingError } from '../../utils/userFacingError';
import {
  parseLeadImportFile,
  buildLeadImportTemplate,
  LeadImportError,
  ACCEPT_ATTRIBUTE,
  SkippedRow,
} from '../../utils/leadImportParser';

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
  budget_min?: number;
  budget_max?: number;
  assigned_to?: { id: number; employee_code: string; full_name: string; phone: string };
  created_by?: { id: number; employee_code: string; full_name: string };
  created_at: string;
  activities?: any[];
  lead_score?: number;
  sla_breach_at?: string | null;
  campaign?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  referral_person_name?: string | null;
  can_edit?: boolean;
  converted_customer?: { customer_code: string } | null;
}

// Compact list-card for the Lead Pipeline section. Borrows the Telecaller
// dashboard's strongest idea -- avatar, name, and a clear colored status
// pill let one lead register at a glance -- but drops that card's action
// bar (Call / Contacted / Qualify / Visit), since the viewer here (Ops/
// Admin scanning dozens-to-hundreds of leads) isn't the person who'd work
// any single lead; the job on this page is fast comprehension and
// reassignment, not per-lead actions.
interface LeadCardProps {
  lead: Lead;
  canAssign: boolean;
  employees: any[];
  onAssign: (leadId: number, assigneeId: string) => void;
  onOpen: (lead: Lead) => void;
  statusType: string;
}

const LeadCard: React.FC<LeadCardProps> = ({
  lead,
  canAssign,
  employees,
  onAssign,
  onOpen,
  statusType,
}) => {
  const hasBudget = lead.budget_min || lead.budget_max;
  const budgetText = hasBudget
    ? `₹${((lead.budget_min || 0) / 100000).toFixed(0)}L - ₹${((lead.budget_max || 0) / 100000).toFixed(0)}L`
    : null;

  return (
    <div
      onClick={() => onOpen(lead)}
      className="bg-white rounded-2xl border border-slate-200 shadow-card hover:shadow-card-hover transition-shadow cursor-pointer flex flex-col"
    >
      {/* Header: identity + status */}
      <div className="p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-navy-700 to-navy-500 flex items-center justify-center text-white font-black text-sm shrink-0">
          {lead.customer_name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-slate-800 text-sm truncate">{lead.customer_name}</h4>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono mt-0.5">
            <span>{lead.lead_code}</span>
            <span>·</span>
            <PhoneCall className="w-3 h-3" />
            <span>{lead.phone}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <StatusPill status={getLeadStatusLabel(lead.status)} type={statusType as any} />
          <div className="text-[10px] text-slate-400 mt-1">{getRelativeAge(lead.created_at)}</div>
        </div>
      </div>

      {/* Body: what they want, what they can afford */}
      <div className="px-4 pb-3 space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <Home className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="font-medium">
            {getPropertyTypeLabel(lead.property_type_preference) || 'Any type'}
          </span>
          <span className="text-slate-300">•</span>
          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="truncate">{lead.preferred_location || 'Location not set'}</span>
        </div>
        {budgetText && (
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <IndianRupee className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="font-medium">{budgetText}</span>
          </div>
        )}
        {lead.converted_customer && (
          <div className="flex items-center gap-1.5 text-[11px] text-green-700 font-bold bg-green-50 px-2 py-1 rounded w-fit border border-green-200 mt-1">
            <Building2 className="w-3.5 h-3.5" />
            Customer: {lead.converted_customer.customer_code}
          </div>
        )}
      </div>

      {/* Footer: source, assignment, and the one action this page needs */}
      <div className="mt-auto px-4 py-3 border-t border-slate-100 bg-slate-50/60 rounded-b-2xl flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold shrink-0">
            {getLeadSourceLabel(lead.source)}
          </span>
          {canAssign ? (
            <select
              value={lead.assigned_to?.id || ''}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onAssign(lead.id, e.target.value)}
              className="min-w-0 flex-1 py-1 px-1.5 text-[11px] font-semibold bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-navy-500"
            >
              <option value="" className="text-slate-700 bg-white">
                Unassigned Pool
              </option>
              {employees.map((emp: any) => (
                <option key={emp.id} value={emp.id} className="text-slate-700 bg-white">
                  {formatEmployeeLabel(emp)}
                </option>
              ))}
            </select>
          ) : (
            <span className="flex items-center gap-1 text-[11px] text-slate-500 truncate">
              <UserCircle2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              {lead.assigned_to?.full_name || 'Unassigned Pool'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {lead.can_edit === false && (
            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-bold uppercase tracking-wider border border-slate-200">
              View Only
            </span>
          )}
          <ChevronRight className="w-4 h-4 text-slate-300" />
        </div>
      </div>
    </div>
  );
};

export const LeadManagement: React.FC = () => {
  const { user, fetchWithAuth, activeRole } = useAuth();
  const { showToast, showError } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [monitorData, setMonitorData] = useState<MonitorData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Lets dashboard widgets (e.g. the MD/Admin Lead Pipeline cards) deep-link
  // straight into a pre-filtered view via /leads?status=X.
  const [statusFilter, setStatusFilterState] = useState<string>(
    searchParams.get('status') || 'ALL',
  );
  const [leadSearchQuery, setLeadSearchQuery] = useState<string>('');
  const [leadViewTab, setLeadViewTabState] = useState<'pipeline' | 'added_by_me'>(
    (searchParams.get('tab') as 'pipeline' | 'added_by_me') || 'pipeline',
  );

  const setStatusFilter = (val: string) => {
    setStatusFilterState(val);
    setSearchParams(
      (prev) => {
        if (val === 'ALL') prev.delete('status');
        else prev.set('status', val);
        return prev;
      },
      { replace: true },
    );
  };

  const setLeadViewTab = (val: 'pipeline' | 'added_by_me') => {
    setLeadViewTabState(val);
    setSearchParams(
      (prev) => {
        if (val === 'pipeline') prev.delete('tab');
        else prev.set('tab', val);
        return prev;
      },
      { replace: true },
    );
  };
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);

  const fetchEmployees = async () => {
    if (!user?.permissions?.includes(Permissions.EMPLOYEES_READ)) return;
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/employees`);
      const data = await res.json();
      if (res.ok) {
        setEmployees(data.employees || []);
      }
    } catch (e) {
      console.error('Failed to load employees for lead assignment');
    }
  };

  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [dropLeadId, setDropLeadId] = useState<number | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [parsedBulkLeads, setParsedBulkLeads] = useState<ParsedBulkLeadRow[]>([]);
  const [bulkSkippedRows, setBulkSkippedRows] = useState<SkippedRow[]>([]);
  const [bulkHeaderMatched, setBulkHeaderMatched] = useState(true);
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const [bulkOwnershipType, setBulkOwnershipType] = useState<'POOL' | 'DIRECT'>('POOL');

  const canBulkUpload = !!user?.permissions?.includes(Permissions.LEADS_BULK_UPLOAD);
  const canCreateLead =
    !!user?.permissions?.includes(Permissions.LEADS_CREATE) || activeRole === Roles.ADMIN;

  const handleBulkUploadBtnClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      // .xlsx / .csv both go through SheetJS — see utils/leadImportParser.ts
      // for why (Excel used to be read as plain text and imported as garbage).
      const result = await parseLeadImportFile(file);
      if (result.rows.length === 0) {
        showError({
          message:
            result.skipped.length > 0
              ? `No importable rows: ${result.skipped[0].reason} (row ${result.skipped[0].row})${
                  result.skipped.length > 1 ? ` and ${result.skipped.length - 1} more` : ''
                }.`
              : 'No lead rows found. Expected columns: Name, Phone, Email, Property type, Location, Notes.',
        });
        return;
      }
      setParsedBulkLeads(result.rows);
      setBulkSkippedRows(result.skipped);
      setBulkHeaderMatched(result.headerMatched);
      setShowBulkModal(true);
    } catch (err) {
      showError({
        message:
          err instanceof LeadImportError
            ? err.message
            : `Could not read "${file.name}". Please upload an Excel (.xlsx) or CSV file.`,
      });
    }
  };

  const handleDownloadTemplate = () => {
    const url = URL.createObjectURL(buildLeadImportTemplate());
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lead-import-template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const closeBulkModal = () => {
    setShowBulkModal(false);
    setParsedBulkLeads([]);
    setBulkSkippedRows([]);
    setBulkOwnershipType('POOL');
  };

  const handleConfirmBulkUpload = async () => {
    if (parsedBulkLeads.length === 0) return;
    setIsBulkUploading(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/leads/bulk-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: parsedBulkLeads, ownership_type: bulkOwnershipType }),
      });
      const data = await res.json();
      if (res.ok) {
        const problems: string[] = [];
        if (data.duplicates) problems.push(`${data.duplicates} already existed`);
        if (data.failed_rows) problems.push(`${data.failed_rows} failed`);
        showToast(
          `Imported ${data.count} of ${data.total_rows ?? parsedBulkLeads.length} leads` +
            (problems.length ? ` (${problems.join(', ')})` : '') +
            '.',
          problems.length ? 'info' : 'success',
        );
        closeBulkModal();
        fetchLeads();
      } else {
        await handleApiError(res, showError, data);
      }
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    } finally {
      setIsBulkUploading(false);
    }
  };

  const fetchLeads = async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/leads`);
      const data = await res.json();
      if (res.ok) {
        setLeads(data.leads || []);
      } else {
        setHasError(true);
      }

      if (canBulkUpload) {
        const monRes = await fetchWithAuth(`${API_BASE_URL}/leads/distribution-monitor`);
        const monData = await monRes.json();
        if (monRes.ok) {
          setMonitorData(monData);
        }
      }
    } catch (e) {
      console.error('Fetch leads error:', e);
      setHasError(true);
      showError(
        toUserFacingError({ message: e instanceof Error ? e.message : String(e), body: e }),
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
    if (user?.permissions?.includes(Permissions.LEADS_ASSIGN)) {
      fetchEmployees();
    }
  }, [user]);

  const handleUpdateLeadAssignment = async (leadId: number, assigneeIdStr: string) => {
    const assigneeId = parseInt(assigneeIdStr, 10);
    if (!assigneeId) return;

    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/leads/${leadId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_to_id: assigneeId, reason: 'Inline reassignment' }),
      });

      const data = await res.json();
      if (res.ok) {
        showToast('Lead assigned successfully', 'success');
        fetchLeads();
      } else {
        await handleApiError(res, showError, data);
      }
    } catch (e) {
      showError(
        toUserFacingError({ message: e instanceof Error ? e.message : String(e), body: e }),
      );
    }
  };

  const handleUpdateStatus = async (leadId: number, newStatus: string) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.status === newStatus) return;

    // Dropping requires a structured exit_reason the backend validates — hand
    // off to DropLeadModal (see handleConfirmDrop) instead of collecting a
    // free-text reason here that the API would reject.
    if (newStatus === 'DROPPED') {
      setDropLeadId(leadId);
      return;
    }

    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/leads/${leadId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();
      if (res.ok) {
        showToast(`Lead status updated`, 'success');
        fetchLeads();
        if (selectedLead && selectedLead.id === leadId) {
          setSelectedLead({ ...selectedLead, status: newStatus });
        }
      } else {
        await handleApiError(res, showError, data);
      }
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    }
  };

  const handleConfirmDrop = async (exitReason: string, exitReasonDetail: string) => {
    if (dropLeadId == null) return;
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/leads/${dropLeadId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'DROPPED',
          exit_reason: exitReason,
          exit_reason_detail: exitReasonDetail,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Lead dropped', 'success');
        if (selectedLead && selectedLead.id === dropLeadId) {
          setSelectedLead({ ...selectedLead, status: 'DROPPED' });
        }
        setDropLeadId(null);
        fetchLeads();
      } else {
        await handleApiError(res, showError, data);
      }
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    }
  };

  /**
   * Demo completion handler — called from LeadDetailModal when user
   * completes a DEMO_SCHEDULED → DEMO_COMPLETED transition with optional
   * qualification revisions (§1 row 4).
   */
  const handleDemoCompletion = async (leadId: number, qualification: any, notes: string) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;

    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/leads/${leadId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'DEMO_COMPLETED',
          notes: notes || undefined,
          qualification: Object.keys(qualification).length > 0 ? qualification : undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        showToast('Demo completed — lead moved forward', 'success');
        fetchLeads();
        if (selectedLead && selectedLead.id === leadId) {
          setSelectedLead({ ...selectedLead, status: 'DEMO_COMPLETED' });
        }
      } else {
        await handleApiError(res, showError, data);
      }
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
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

  const addedByMe = leads.filter((l) => l.created_by?.id === user?.id);
  const baseLeads = leadViewTab === 'added_by_me' ? addedByMe : leads;
  const filteredLeads = baseLeads.filter(
    (l) => statusFilter === 'ALL' || l.status === statusFilter,
  );

  const columns: ColumnDef<Lead>[] = [
    {
      key: 'customer_name',
      header: 'Customer',
      sortable: true,
      render: (l) => (
        <div>
          <div className="font-bold text-slate-800">{l.customer_name}</div>
          <div className="text-[11px] text-slate-400 font-mono mt-0.5">{l.lead_code}</div>
          <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
            <PhoneCall className="w-3 h-3 text-slate-400" />
            {l.phone}
          </div>
        </div>
      ),
    },
    {
      key: 'property_type_preference',
      header: 'Looking For',
      sortable: true,
      render: (l) => (
        <div>
          <div className="font-medium text-slate-800">
            {l.property_type_preference || 'Residential'}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {l.preferred_location || 'Location not set'}
          </div>
        </div>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      sortable: true,
      render: (l) => (
        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold">
          {getLeadSourceLabel(l.source)}
        </span>
      ),
    },
    {
      key: 'assigned_to',
      header: 'Assigned To',
      sortable: true,
      render: (l) => {
        if (user?.permissions?.includes(Permissions.LEADS_ASSIGN)) {
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <select
                value={l.assigned_to?.id || ''}
                onChange={(e) => handleUpdateLeadAssignment(l.id, e.target.value)}
                className="w-full max-w-[140px] py-2 px-1.5 text-xs font-semibold bg-surface border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-navy-500"
              >
                <option value="" className="text-slate-700 bg-white">
                  Unassigned Pool
                </option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id} className="text-slate-700 bg-white">
                    {formatEmployeeLabel(emp)}
                  </option>
                ))}
              </select>
            </div>
          );
        }
        return l.assigned_to ? (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-navy-100 text-navy-800 flex items-center justify-center font-bold text-[10px] shrink-0">
              {l.assigned_to.employee_code.slice(-3)}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-slate-800 text-[11px] truncate">
                {l.assigned_to.full_name || l.assigned_to.employee_code}
              </div>
              <div className="text-[9px] text-slate-400 font-mono truncate">
                {l.assignment_type || 'AUTO'}
              </div>
            </div>
          </div>
        ) : (
          <span className="text-slate-400 italic text-[11px]">Unassigned Pool</span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (l) => (
        <div>
          <StatusPill status={getLeadStatusLabel(l.status)} type={getStatusMap(l.status) as any} />
          <div className="text-[10px] text-slate-400 mt-1">
            {getRelativeAge(l.created_at)} in pipeline
          </div>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (l) => (
        <div className="text-right flex items-center justify-end gap-2">
          {l.can_edit === false && (
            <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-bold uppercase tracking-wider border border-slate-200">
              View Only
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedLead(l);
            }}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-action hover:text-navy-900 transition-colors inline-flex items-center gap-1 font-semibold text-xs whitespace-nowrap"
          >
            <span>View Details</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-navy-900 via-navy-800 to-slate-900 rounded-3xl p-6 text-white shadow-xl flex flex-wrap items-center justify-between gap-4 border border-navy-700/30">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-5 h-5 text-navy-400" />
            <h2 className="text-xl font-extrabold tracking-tight">Leads & Distribution</h2>
          </div>
          <p className="text-xs text-navy-200/80">
            Intelligent auto-distribution algorithm based on telecaller score, response speed, and
            active load
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            accept={ACCEPT_ATTRIBUTE}
            onChange={handleFileSelect}
            className="hidden"
          />

          {canBulkUpload && (
            <button
              onClick={handleBulkUploadBtnClick}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl border border-white/20 transition-all flex items-center gap-1.5 shadow"
            >
              <Upload className="w-4 h-4 text-navy-300" />
              <span>Bulk Upload (Excel / CSV)</span>
            </button>
          )}

          {canBulkUpload && (
            <button
              onClick={handleDownloadTemplate}
              title="Download an Excel template with the expected columns"
              className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl border border-white/20 transition-all flex items-center gap-1.5 shadow"
            >
              <Download className="w-4 h-4 text-navy-300" />
              <span>Template</span>
            </button>
          )}

          {canCreateLead && (
            <button
              onClick={() => setShowAddModal(true)}
              data-tour="lead-create"
              className="px-4 py-2 bg-gold-600 hover:bg-gold-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Lead</span>
            </button>
          )}
        </div>
      </div>

      {user?.permissions?.includes(Permissions.LEADS_UPDATE) && (
        <UnclaimedLeadsBanner onClaimed={fetchLeads} />
      )}

      {hasError && (
        <div className="text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-4 py-3 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-danger-600" />
          Unable to load leads. Please try again later.
        </div>
      )}

      {/* Digital Lead Operator Intake Monitor */}
      {canBulkUpload && monitorData && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-navy-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-navy-600" /> Active Load Balancing
            </h3>
            <span className="text-xs font-semibold text-slate-500 bg-surface px-3 py-1 rounded-full">
              Total Leads: {monitorData.totalLeadsCount}
            </span>
          </div>

          {/* A roster of every telecaller's current load is reference
              material for rebalancing assignments, not a headline metric --
              a compact, sortable table reads at a glance; a grid of
              full-sized StatCards (one per telecaller) drew as much
              attention to each row as the KPIs above it. */}
          <div className="max-h-72 md:max-h-96 overflow-y-auto overscroll-contain pr-1">
            <DataTable
              columns={[
                {
                  key: 'name',
                  header: 'Telecaller',
                  sortable: true,
                  render: (tc: any) => (
                    <div>
                      <div className="font-semibold text-navy-900">
                        {tc.fullName || tc.full_name || 'Unknown'}
                      </div>
                      <div className="text-xs text-slate-400 font-mono">
                        {tc.employeeCode || tc.employee_code || tc.id}
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'activeLeadCount',
                  header: 'Active Leads',
                  sortable: true,
                  render: (tc: any) => (
                    <span className="font-semibold text-navy-700">{tc.activeLeadCount || 0}</span>
                  ),
                },
                {
                  key: 'closureRate',
                  header: 'Closure Rate',
                  sortable: true,
                  render: (tc: any) => (
                    <span className="text-slate-600">{tc.closureRate || '0.0%'}</span>
                  ),
                },
              ]}
              data={monitorData.telecallers}
              searchable={false}
              emptyMessage="No active telecallers found."
            />
          </div>
        </div>
      )}

      {/* Lead Pipeline -- compact cards, one lead per glance */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setLeadViewTab('pipeline')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              leadViewTab === 'pipeline'
                ? 'bg-navy-900 text-white shadow-sm'
                : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Lead Pipeline
          </button>
          <button
            onClick={() => setLeadViewTab('added_by_me')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 ${
              leadViewTab === 'added_by_me'
                ? 'bg-navy-900 text-white shadow-sm'
                : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Leads Added by Me
            {addedByMe.length > 0 && (
              <span className="bg-navy-100 text-navy-700 px-2 py-0.5 rounded-full text-xs font-semibold shadow-inner">
                {addedByMe.length}
              </span>
            )}
          </button>
        </div>

        {leadViewTab === 'added_by_me' && (
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
            Leads you added that are currently unassigned. View only — once assigned to someone,
            they'll move to Lead Pipeline.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-slate-400">
            Showing {filteredLeads.length} of {baseLeads.length} leads
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={leadSearchQuery}
                onChange={(e) => setLeadSearchQuery(e.target.value)}
                placeholder="Search name, phone, code..."
                className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm w-56 focus:outline-none focus:border-navy-500"
              />
            </div>
            <label className="text-xs font-semibold text-slate-500">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold focus:outline-none focus:border-navy-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="NEW">New</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="CONTACTED">Contacted</option>
              <option value="QUALIFIED">Qualified</option>
              <option value="SITE_VISIT_SCHEDULED">Site Visit</option>
              <option value="NEGOTIATION">Negotiation</option>
              <option value="BOOKING_INITIATED">Booking</option>
              <option value="BOOKED">Booked</option>
              <option value="DROPPED">Dropped</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-slate-500">Loading leads...</div>
        ) : filteredLeads.length === 0 ? (
          <div className="py-16 text-center bg-slate-50 rounded-2xl border border-slate-100">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="font-bold text-slate-500 text-sm">
              {leadViewTab === 'added_by_me'
                ? "You haven't added any leads that are currently unassigned."
                : 'No leads found matching your criteria.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredLeads.map((lead: Lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                canAssign={
                  leadViewTab === 'added_by_me'
                    ? false
                    : !!user?.permissions?.includes(Permissions.LEADS_ASSIGN)
                }
                employees={employees}
                onAssign={handleUpdateLeadAssignment}
                onOpen={setSelectedLead}
                statusType={getStatusMap(lead.status)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Quick Add Lead Modal */}
      {showAddModal && (
        <QuickAddLeadModal
          onClose={() => setShowAddModal(false)}
          onSuccess={(leadId) => {
            setShowAddModal(false);
            fetchLeads();
          }}
        />
      )}

      {/* Lead Detail Dossier Modal */}
      {selectedLead && (
        <LeadDetailModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onUpdateStatus={handleUpdateStatus}
          onRefreshLeads={fetchLeads}
          onDemoComplete={handleDemoCompletion}
          onLeadPatched={(patch) =>
            setSelectedLead((prev) => (prev ? { ...prev, ...patch } : prev))
          }
        />
      )}

      {/* Drop Lead Reason Modal */}
      {dropLeadId != null && (
        <DropLeadModal onClose={() => setDropLeadId(null)} onConfirm={handleConfirmDrop} />
      )}

      {/* Bulk lead import preview modal */}
      {showBulkModal && parsedBulkLeads.length > 0 && (
        <div className="fixed inset-0 z-[60] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 relative max-h-[90vh] overflow-y-auto space-y-4">
            <button
              onClick={closeBulkModal}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-navy-700" />
              <h3 className="font-extrabold text-slate-800 text-lg">Bulk Lead Importer</h3>
            </div>
            <p className="text-sm text-slate-600">
              Ready to import{' '}
              <strong className="text-slate-900">{parsedBulkLeads.length} leads</strong>
              {bulkSkippedRows.length > 0 && (
                <>
                  {' '}
                  —{' '}
                  <strong className="text-amber-700">{bulkSkippedRows.length} rows skipped</strong>
                </>
              )}
              .
              {!bulkHeaderMatched && (
                <span className="block text-xs text-slate-500 mt-1">
                  No header row was recognised, so columns were read in the order Name, Phone,
                  Email, Property type, Location, Notes. Use the Template button for named columns.
                </span>
              )}
            </p>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Assign these leads to</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setBulkOwnershipType('DIRECT')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    bulkOwnershipType === 'DIRECT'
                      ? 'border-navy-600 bg-navy-50/50 text-navy-900 font-bold'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="text-sm">Assign to Me</div>
                  <p className="text-[11px] text-slate-500 font-normal mt-1">
                    Keep every lead in this import — none go to auto-distribution.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setBulkOwnershipType('POOL')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    bulkOwnershipType === 'POOL'
                      ? 'border-navy-600 bg-navy-50/50 text-navy-900 font-bold'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="text-sm">Add to Pool</div>
                  <p className="text-[11px] text-slate-500 font-normal mt-1">
                    Auto-distribute across telecallers by performance & load.
                  </p>
                </button>
              </div>
            </div>

            <div className="h-60">
              <DataTable
                columns={[
                  { key: 'customer_name', header: 'Name' },
                  { key: 'phone', header: 'Phone' },
                  { key: 'location', header: 'Location' },
                ]}
                data={parsedBulkLeads}
                searchable={false}
                emptyMessage="No leads found in this source."
              />
            </div>

            {bulkSkippedRows.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 max-h-32 overflow-y-auto">
                <p className="font-bold mb-1">
                  Skipped rows (fix them in the file and upload again):
                </p>
                <ul className="space-y-0.5">
                  {bulkSkippedRows.map((s) => (
                    <li key={s.row}>
                      Row {s.row}: {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={closeBulkModal}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isBulkUploading}
                onClick={handleConfirmBulkUpload}
                className="px-5 py-2 bg-navy-900 hover:bg-navy-800 text-white font-semibold text-sm rounded-lg shadow transition-colors"
              >
                {isBulkUploading ? 'Importing...' : 'Confirm & Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
