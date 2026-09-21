import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhoneCall, Calendar, MessageCircle, Users, Clock, ChevronDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';
import { LeadListItem } from '../../types';
import { PerformanceScoreWidget } from '../performance/PerformanceScoreWidget';
import { TaskManager } from '../tasks/TaskManager';
import { StatCard, ListWidget, StatusPill, ListItem } from '../ui';
import { Button } from '../common/ui/Button';
import { QualificationFormModal, QualificationData } from '../leads/QualificationFormModal';
import { LeadDetailModal } from '../leads/LeadDetailModal';
import { getPropertyTypeLabel } from '../../constants/propertyTypes';
import { toUserFacingError } from '../../utils/userFacingError';

export const CPMDashboard: React.FC = () => {
  const { user, fetchWithAuth } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [assignedLeads, setAssignedLeads] = useState<LeadListItem[]>([]);
  const [targetMetrics, setTargetMetrics] = useState<{ achieved: number; target: number }>({
    achieved: 0,
    target: 0,
  }); // Fallback to 0, not fake 25
  const [isLoading, setIsLoading] = useState(true);
  const [tomorrowVisits, setTomorrowVisits] = useState<ListItem[]>([]);
  const [whatsappTasks, setWhatsappTasks] = useState(0);
  // A Set (not a single id) so opening one lead's "Update Status" menu doesn't
  // force-close any other lead's menu that's already open.
  const [openDropdowns, setOpenDropdowns] = useState<Set<number>>(new Set());
  const [selectedLead, setSelectedLead] = useState<LeadListItem | null>(null);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [qualifyingLead, setQualifyingLead] = useState<LeadListItem | null>(null);

  useEffect(() => {
    const handleClickOutside = () => setOpenDropdowns(new Set());
    if (openDropdowns.size > 0) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => document.removeEventListener('click', handleClickOutside);
  }, [openDropdowns]);

  const toggleDropdown = (leadId: number) => {
    setOpenDropdowns((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) {
        next.delete(leadId);
      } else {
        next.add(leadId);
      }
      return next;
    });
  };

  const closeDropdown = (leadId: number) => {
    setOpenDropdowns((prev) => {
      if (!prev.has(leadId)) return prev;
      const next = new Set(prev);
      next.delete(leadId);
      return next;
    });
  };

  const updateLeadStatus = async (
    leadId: number,
    newStatus: string,
    qualification?: QualificationData,
  ) => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/leads/${leadId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          notes: 'Updated directly from Daily Calling List',
          ...(newStatus === 'QUALIFIED' && qualification ? { qualification } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast('Lead status updated successfully!', 'success');
        setAssignedLeads((prev) =>
          prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l)),
        );
      } else {
        const formattedError = toUserFacingError({
          status: res.status,
          body: data,
        });
        showToast({ ...formattedError, type: 'error' });
        throw new Error('SILENT');
      }
    } catch (e: any) {
      if (e.message !== 'SILENT') {
        const formattedError = toUserFacingError({ message: e.message });
        showToast({ ...formattedError, type: 'error' });
      }
      throw e;
    }
  };

  const fetchTelecallerData = async () => {
    setIsLoading(true);
    try {
      const [leadsRes, tgtRes, visitsRes, tasksRes] = await Promise.all([
        // Explicit high limit: leadsAssigned/contactedToday/uncontactedLeads
        // stats below are all computed from this array, so the backend's
        // own default (2000) would silently undercount them once this CPM's
        // scoped lead total passes that — same class of bug fixed in
        // TelecallerDashboard/LeadManagement. The rendered "Today's
        // High-Priority Leads" list itself stays additionally filtered to
        // activeStatuses and sits in its own scrollable, max-height
        // container, so it doesn't need the same render-side "Load More"
        // pagination those did.
        fetchWithAuth(`${API_BASE_URL}/leads?limit=100000`),
        fetchWithAuth(`${API_BASE_URL}/targets/my-target`),
        fetchWithAuth(`${API_BASE_URL}/site-visits`),
        fetchWithAuth(`${API_BASE_URL}/tasks/my-tasks`),
      ]);

      if (leadsRes.ok) {
        const data = await leadsRes.json();
        setAssignedLeads(data.leads || []);
      }

      if (tgtRes.ok) {
        const tgtData = await tgtRes.json();
        if (tgtData.target) {
          setTargetMetrics({
            achieved: tgtData.target.achieved_value || 0,
            target: tgtData.target.target_value || 0, // No fake fallback
          });
        }
      }

      if (visitsRes.ok) {
        const data = await visitsRes.json();
        const visits = data.visits || [];

        // Filter visits assigned to current user, scheduled for tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);

        const dayAfter = new Date(tomorrow);
        dayAfter.setDate(dayAfter.getDate() + 1);

        const tmrVisits = visits.filter((v: any) => {
          if (v.assigned_agent_id !== user?.id) return false;
          if (['COMPLETED', 'CANCELLED', 'REJECTED'].includes(v.status)) return false;

          const visitDate = new Date(v.scheduled_date);
          return visitDate >= tomorrow && visitDate < dayAfter;
        });

        const visitItems: ListItem[] = tmrVisits.map((v: any) => ({
          id: v.id.toString(),
          title: `Visit for ${v.customer?.customer_name || 'Customer'}`,
          subtitle: `Project: ${v.project?.name || 'N/A'}`,
          icon: Calendar,
          link: '/site-visits',
        }));
        setTomorrowVisits(visitItems);
      }

      if (tasksRes.ok) {
        const data = await tasksRes.json();
        const tasks = data.tasks || [];
        // Filter tasks related to WhatsApp follow-ups
        const waTasks = tasks.filter(
          (t: any) =>
            !['COMPLETED', 'CANCELLED'].includes(t.status) &&
            (t.title?.toLowerCase().includes('whatsapp') ||
              t.description?.toLowerCase().includes('whatsapp')),
        ).length;
        setWhatsappTasks(waTasks);
      }
    } catch (e) {
      console.error('Fetch telecaller dashboard error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTelecallerData();
  }, []);

  // Compute KPIs from existing data (Only those explicitly assigned to current user)
  const myAssignedLeadsRaw = assignedLeads.filter((l) => l.assigned_to?.id === user?.id);
  const leadsAssigned = myAssignedLeadsRaw.length;
  const contactedToday = myAssignedLeadsRaw.filter((l) => l.status === 'CONTACTED').length;
  const uncontactedLeads = myAssignedLeadsRaw.filter(
    (l) => l.status === 'NEW' || l.status === 'ASSIGNED',
  ).length;
  const whatsappFollowUps = whatsappTasks; // Now using real data from tasks endpoint

  const activeStatuses = ['NEW', 'ASSIGNED', 'CONTACTED', 'QUALIFIED', 'SITE_VISIT_SCHEDULED'];
  const myAssignedLeads = myAssignedLeadsRaw.filter(
    (l): l is typeof l & { status: string } =>
      typeof l.status === 'string' && activeStatuses.includes(l.status),
  );
  const getStatusMap = (
    status: string,
  ): 'hot' | 'warm' | 'cold' | 'success' | 'pending' | 'danger' | 'default' => {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 tracking-tight">
            Channel Partner Manager Dashboard
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Welcome back, {user?.employeeCode}. Here's your pipeline overview.
          </p>
        </div>
      </div>

      {qualifyingLead && (
        <QualificationFormModal
          title="Qualify Lead"
          requireAllFields={true}
          onClose={() => setQualifyingLead(null)}
          onSave={async (data) => {
            await updateLeadStatus(qualifyingLead.id, 'QUALIFIED', data);
          }}
        />
      )}

      {selectedLead && (
        <LeadDetailModal
          lead={selectedLead as any}
          onClose={() => {
            setSelectedLead(null);
            setScheduleModalOpen(false);
          }}
          onUpdateStatus={updateLeadStatus}
          onRefreshLeads={fetchTelecallerData}
          onDemoComplete={async () => {}}
          initialShowScheduleModal={scheduleModalOpen}
        />
      )}

      {/* Primary KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Leads Assigned" value={leadsAssigned} icon={Users} link="/leads" />
        <StatCard label="Contacted Today" value={contactedToday} icon={PhoneCall} link="/leads" />
        <StatCard label="Uncontacted Leads" value={uncontactedLeads} icon={Clock} link="/leads" />
        <StatCard
          label="WhatsApp Follow-ups"
          value={whatsappFollowUps}
          icon={MessageCircle}
          link="/tasks"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Left Column: Priority Call Queue & Lists */}
        <div className="lg:col-span-2 space-y-6">
          {/* Distinctive Widget: Reconfirm Tomorrow's Visits */}
          <ListWidget
            title="Reconfirm Tomorrow's Visits"
            items={tomorrowVisits}
            emptyStateMessage="No visits pending reconfirmation tomorrow."
            viewAllLink="/site-visits"
          />

          {/* Today's Priority Call Queue */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="font-bold text-navy-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-action" />
                <span>Today's High-Priority Leads</span>
              </h3>
              <StatusPill status={`${myAssignedLeads.length} Active`} type="default" />
            </div>

            {isLoading ? (
              <div className="py-8 text-center text-sm text-slate-400">
                Loading priority leads...
              </div>
            ) : myAssignedLeads.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">
                No leads currently assigned. Keep your performance score high for priority
                assignments!
              </div>
            ) : (
              <div className="space-y-3 max-h-72 md:max-h-96 overflow-y-auto overscroll-contain pr-1">
                {myAssignedLeads.map((lead: LeadListItem) => (
                  <div
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    className="p-4 bg-surface rounded-xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-sm transition-shadow group min-w-0 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-semibold text-navy-600 text-xs truncate">
                          {lead.lead_code}
                        </span>
                        <StatusPill
                          status={lead.status ?? 'UNKNOWN'}
                          type={getStatusMap(lead.status ?? 'UNKNOWN')}
                        />{' '}
                      </div>
                      <h4 className="font-bold text-navy-900 text-sm truncate">
                        {lead.customer_name}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                        {lead.phone} • {getPropertyTypeLabel(lead.property_type_preference)}
                      </p>
                    </div>

                    <div
                      className="flex items-center gap-3 shrink-0 relative"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <a
                        href={`tel:${lead.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="px-3 py-1.5 bg-action hover:bg-navy-700 text-white hover:text-white font-semibold text-xs rounded-lg shadow-sm transition-colors flex items-center gap-1.5 shrink-0"
                      >
                        <PhoneCall className="w-3.5 h-3.5" />
                        <span>Call</span>
                      </a>

                      <div className="relative">
                        <Button
                          size="sm"
                          variant="action"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleDropdown(lead.id);
                          }}
                          disabled={lead.can_edit === false}
                          className="flex items-center gap-1"
                        >
                          <span>Update Status</span>
                          <ChevronDown className="w-3.5 h-3.5" />
                        </Button>

                        {openDropdowns.has(lead.id) && (
                          <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-slate-100 py-1 z-10 flex flex-col overflow-hidden">
                            {(lead.status === 'NEW' || lead.status === 'ASSIGNED') && (
                              <button
                                className="px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateLeadStatus(lead.id, 'CONTACTED');
                                  closeDropdown(lead.id);
                                }}
                              >
                                Mark Contacted
                              </button>
                            )}
                            {lead.status === 'CONTACTED' && (
                              <button
                                className="px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setQualifyingLead(lead);
                                  closeDropdown(lead.id);
                                }}
                              >
                                Mark Qualified
                              </button>
                            )}
                            <button
                              className="px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (
                                  lead.status !== 'QUALIFIED' &&
                                  lead.status !== 'DEMO_COMPLETED'
                                ) {
                                  showToast({
                                    title: 'Qualify lead first',
                                    message:
                                      'This lead must be Qualified before a site visit can be scheduled.',
                                    nextStep:
                                      'Use Mark Qualified and complete the form, then schedule the visit.',
                                    type: 'error',
                                  });
                                } else {
                                  setSelectedLead(lead);
                                  setScheduleModalOpen(true);
                                }
                                closeDropdown(lead.id);
                              }}
                            >
                              Schedule Site Visit
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Score */}
        <div className="space-y-6">
          <PerformanceScoreWidget />
        </div>
      </div>

      {/* Task Manager (Full Width Below) */}
      <div className="w-full">
        <TaskManager />
      </div>
    </div>
  );
};
