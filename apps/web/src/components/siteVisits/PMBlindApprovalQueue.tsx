import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  MapPin,
  Building2,
  UserCircle,
  CheckCircle,
  RefreshCcw,
  Calendar,
  FileText,
  X,
  Layers,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';
import { Roles } from '../../shared';
import { SiteVisitCountdownBadge } from './SiteVisitCountdownBadge';
import { handleApiError, toUserFacingError } from '../../utils/userFacingError';
import { EmployeeListItem } from '../../types';
import { formatEmployeeLabel } from '../../utils/employeeLabel';

interface SiteVisitPropertyLink {
  property_id: number | null;
  project_unit_id: number | null;
  property?: { id: number; title: string; property_code: string };
  project_unit?: {
    id: number;
    unit_code: string;
    unit_number: string;
    flat_number?: string | null;
    villa_number?: string | null;
    plot_number?: string | null;
    project: { id: number; name: string };
  };
}

interface BlindSiteVisit {
  id: number;
  booking_code: string;
  scheduled_date: string;
  status: string;
  verification_call_notes?: string | null;
  telecaller?: { id: number; full_name: string; employee_code: string };
  property?: { id: number; title: string; property_code: string };
  project_unit?: {
    unit_code: string;
    unit_number: string;
    flat_number?: string | null;
    villa_number?: string | null;
    plot_number?: string | null;
    project: { id: number; name: string };
  };
  project?: { id: number; project_code: string; name: string };
  site_visit_properties?: SiteVisitPropertyLink[];
  lead?: { preferred_location?: string };
}

/** A visit booked for a project outside the CRM keeps its name in the notes ("Other project: X. ..."). */
const otherProjectName = (notes?: string | null) => {
  const m = /^Other project: (.+?)(?:\. |$)/.exec(notes || '');
  return m ? `${m[1]} (not in CRM)` : null;
};

export const PMBlindApprovalQueue: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();

  const [visits, setVisits] = useState<BlindSiteVisit[]>([]);
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [selectedVisitId, setSelectedVisitId] = useState<number | null>(null);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignTargetId, setReassignTargetId] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchQueue = async () => {
    setIsLoading(true);
    try {
      // Fetch only PENDING_ACCEPTANCE visits
      const res = await fetchWithAuth(`${API_BASE_URL}/site-visits?status=PENDING_ACCEPTANCE`);
      const data = await res.json();
      if (res.ok) {
        setVisits(data.visits || []);
      }

      const empRes = await fetchWithAuth(`${API_BASE_URL}/employees`);
      const empData = await empRes.json();
      if (empRes.ok) {
        // Updated: PROJECT_MANAGER, SALES_MANAGER, and AGENT now hold site_visits.accept
        // per RolePermissionsMatrix. Agents can now accept site visits.
        const targets = (empData.employees || []).filter((e: EmployeeListItem) =>
          e.roles?.some(
            (r: string) =>
              r === Roles.PROJECT_MANAGER || r === Roles.SALES_MANAGER || r === Roles.AGENT,
          ),
        );
        setEmployees(targets);
      }
    } catch (e) {
      console.error('Fetch queue error:', e);
      showError(
        toUserFacingError({ message: e instanceof Error ? e.message : String(e), body: e }),
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const handleAccept = async (visitId: number) => {
    if (!window.confirm('Are you sure you want to accept and assign this visit to yourself?'))
      return;

    setIsSubmitting(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/site-visits/${visitId}/accept`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        const lead = data.visit?.lead;
        showToast(
          lead?.customer_name
            ? `Accepted. Customer: ${lead.customer_name}${lead.phone ? ` (${lead.phone})` : ''}`
            : 'Site visit accepted successfully',
          'success',
        );
        fetchQueue();
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

  const handleReassignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVisitId || !reassignTargetId || !reassignReason) return;

    setIsSubmitting(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/site-visits/${selectedVisitId}/reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Bug 1 fix: API schema expects `to_employee_id`, not `assigned_to_id`
          to_employee_id: parseInt(reassignTargetId, 10),
          reason: reassignReason,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        showToast('Site visit routed successfully', 'success');
        setShowReassignModal(false);
        setReassignReason('');
        setReassignTargetId('');
        fetchQueue();
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

  /** Bug 2 fix: resolve a human-readable label for what property/unit this visit is for */
  const resolveVisitTarget = (visit: BlindSiteVisit): string => {
    // Multi-property links take priority
    const links = visit.site_visit_properties ?? [];
    if (links.length > 0) {
      const names = links.map((lnk) => {
        if (lnk.property) return lnk.property.title;
        if (lnk.project_unit) {
          const u = lnk.project_unit;
          const num =
            u.flat_number || u.villa_number || u.plot_number || u.unit_number || u.unit_code;
          return `${u.project.name} — Unit ${num}`;
        }
        return 'Unknown';
      });
      return names.join(', ');
    }
    // Fallback to single convenience columns
    if (visit.project_unit) {
      const u = visit.project_unit;
      const num = u.flat_number || u.villa_number || u.plot_number || u.unit_number;
      return `${u.project.name} — Unit ${num}`;
    }
    if (visit.property) return visit.property.title;
    if (visit.project) return visit.project.name;
    return otherProjectName(visit.verification_call_notes) || 'General Inquiry';
  };

  /** Get the project name from any of the linked items */
  const resolveProjectName = (visit: BlindSiteVisit): string | null => {
    if (visit.project) return visit.project.name;
    const links = visit.site_visit_properties ?? [];
    for (const lnk of links) {
      if (lnk.project_unit?.project?.name) return lnk.project_unit.project.name;
      if (lnk.property) return null; // property has no guaranteed project name
    }
    if (visit.project_unit) return visit.project_unit.project.name;
    return otherProjectName(visit.verification_call_notes);
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-slate-500">Loading incoming site visit queue...</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-navy-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-navy-600" />
            Incoming Site Visits
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Accept or route new requests. Customer PII is hidden until accepted.
          </p>
        </div>
      </div>

      {visits.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-slate-300" />
          </div>
          <h3 className="text-lg font-bold text-navy-900 mb-1">Queue is empty</h3>
          <p className="text-slate-500 text-sm">No new site visits waiting for approval.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visits.map((visit) => {
            const projectName = resolveProjectName(visit);
            const targetLabel = resolveVisitTarget(visit);
            const isMultiProperty = (visit.site_visit_properties ?? []).length > 1;

            return (
              <div
                key={visit.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all flex flex-col"
              >
                {/* Header: code + countdown */}
                <div className="flex justify-between items-start mb-3">
                  <div className="bg-navy-50 text-navy-700 px-3 py-1 rounded-lg text-xs font-bold font-mono border border-navy-100">
                    {visit.booking_code}
                  </div>
                  <SiteVisitCountdownBadge scheduledDate={visit.scheduled_date} />
                </div>

                {/* Body: enriched info */}
                <div className="space-y-3 mb-5 flex-1">
                  {/* Scheduled date/time — Bug 2: was completely missing */}
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-navy-50 rounded-lg flex items-center justify-center shrink-0 border border-navy-100">
                      <Calendar className="w-4 h-4 text-navy-600" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5">
                        Scheduled
                      </p>
                      <p className="font-bold text-navy-900 text-sm leading-tight">
                        {new Date(visit.scheduled_date).toLocaleDateString('en-IN', {
                          weekday: 'short',
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                        {' at '}
                        {new Date(visit.scheduled_date).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>

                  {/* Property / unit / project — Bug 2: project name was missing */}
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center shrink-0 border border-slate-100">
                      {isMultiProperty ? (
                        <Layers className="w-4 h-4 text-slate-500" />
                      ) : (
                        <Building2 className="w-4 h-4 text-slate-500" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5">
                        {isMultiProperty
                          ? `Properties / Units (${(visit.site_visit_properties ?? []).length})`
                          : 'Property / Unit'}
                      </p>
                      <p className="font-bold text-navy-900 leading-snug text-sm">{targetLabel}</p>
                      {projectName && (
                        <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                          Project: {projectName}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Location preference */}
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center shrink-0 border border-slate-100">
                      <MapPin className="w-4 h-4 text-slate-500" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5">
                        Location Preference
                      </p>
                      <p className="font-semibold text-slate-700 text-sm">
                        {visit.lead?.preferred_location || 'Not Specified'}
                      </p>
                    </div>
                  </div>

                  {/* Telecaller + their notes — Bug 2: notes were never shown to PM */}
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center shrink-0 border border-slate-100">
                      <UserCircle className="w-4 h-4 text-slate-500" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5">
                        Booked By
                      </p>
                      <p className="font-semibold text-slate-700 text-sm">
                        {visit.telecaller?.full_name || 'System'}
                      </p>
                    </div>
                  </div>

                  {/* Booking notes / telecaller context — Bug 2: never displayed to PM */}
                  {visit.verification_call_notes && (
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center shrink-0 border border-amber-100">
                        <FileText className="w-4 h-4 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-0.5">
                          Telecaller Notes
                        </p>
                        <p className="text-sm text-slate-700 italic leading-snug">
                          "{visit.verification_call_notes}"
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-4 border-t border-slate-100">
                  <button
                    onClick={() => handleAccept(visit.id)}
                    disabled={isSubmitting}
                    className="flex-1 bg-navy-600 hover:bg-navy-700 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Accept
                  </button>
                  <button
                    onClick={() => {
                      setSelectedVisitId(visit.id);
                      setShowReassignModal(true);
                    }}
                    disabled={isSubmitting}
                    className="flex-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold py-2.5 px-4 rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCcw className="w-4 h-4" />
                    Route
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reassign Modal */}
      {showReassignModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-navy-900">
                  Route to Another PM / Sales Manager
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  The visit will move back to PENDING_ACCEPTANCE for the selected person.
                </p>
              </div>
              <button
                onClick={() => setShowReassignModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleReassignSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  Select Colleague (PM / Sales Manager)
                </label>
                <select
                  required
                  value={reassignTargetId}
                  onChange={(e) => setReassignTargetId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500"
                >
                  <option value="" className="text-slate-800 bg-white">
                    -- Choose Colleague --
                  </option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id} className="text-slate-800 bg-white">
                      {formatEmployeeLabel(emp)} - {emp.roles?.join(', ')}
                    </option>
                  ))}
                </select>
                {employees.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1.5">
                    No other PMs or Sales Managers found to route to.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  Reason for Routing
                </label>
                <textarea
                  required
                  rows={3}
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500"
                  placeholder="Why are you routing this to them?"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReassignModal(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !reassignTargetId || !reassignReason}
                  className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-navy-600 hover:bg-navy-700 rounded-xl disabled:opacity-50 shadow-sm"
                >
                  {isSubmitting ? 'Routing...' : 'Confirm Route'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
