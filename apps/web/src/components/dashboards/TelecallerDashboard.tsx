import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PhoneCall,
  Calendar,
  MessageCircle,
  Users,
  Clock,
  ChevronRight,
  TrendingUp,
  Zap,
  Star,
  MapPin,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { CallOutcomeModal } from '../leads/CallOutcomeModal';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';
import { LeadListItem } from '../../types';
import { PerformanceScoreWidget } from '../performance/PerformanceScoreWidget';
import { TaskManager } from '../tasks/TaskManager';
import { StatusPill, ListItem } from '../ui';
import { QualificationFormModal, QualificationData } from '../leads/QualificationFormModal';
import { LeadDetailModal } from '../leads/LeadDetailModal';
import { getPropertyTypeLabel } from '../../constants/propertyTypes';
import { LEAD_STATUS_LABELS, getLeadSourceLabel, getRelativeAge } from '../../constants/leadStatus';
import { toUserFacingError } from '../../utils/userFacingError';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Label text lives in constants/leadStatus.ts (shared with LeadManagement's
// Lead Pipeline table, so the same status reads the same way everywhere).
// Colors stay local -- they're paired with this card's own light/pastel
// palette, distinct from the StatusPill semantic-color system used elsewhere.
const STATUS_LABEL = LEAD_STATUS_LABELS;

const STATUS_COLOR: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-700',
  ASSIGNED: 'bg-slate-100 text-slate-600',
  CONTACTED: 'bg-amber-100 text-amber-700',
  QUALIFIED: 'bg-emerald-100 text-emerald-700',
  DEMO_SCHEDULED: 'bg-purple-100 text-purple-700',
  DEMO_COMPLETED: 'bg-violet-100 text-violet-700',
  SITE_VISIT_SCHEDULED: 'bg-yellow-100 text-yellow-700',
  SITE_VISIT_COMPLETED: 'bg-orange-100 text-orange-700',
  NEGOTIATION: 'bg-rose-100 text-rose-700',
  BOOKING_INITIATED: 'bg-pink-100 text-pink-700',
  BOOKED: 'bg-green-100 text-green-700',
  DROPPED: 'bg-slate-100 text-slate-400',
};

// Per-lead call history from GET /leads/call-queue.
interface CallMeta {
  calls: number;
  last_call_at: string | null;
  last_outcome: string | null;
  follow_up_at: string | null;
}
const OUTCOME_LABEL: Record<string, string> = {
  CONNECTED_INTERESTED: 'Interested',
  CONNECTED_NOT_INTERESTED: 'Not interested',
  CALL_BACK: 'Asked to call back',
  NO_ANSWER: 'No answer',
  BUSY_OR_SWITCHED_OFF: 'Busy / switched off',
  WRONG_NUMBER: 'Wrong number',
};
const RETRY_OUTCOMES = ['NO_ANSWER', 'BUSY_OR_SWITCHED_OFF'];

const dayLabel = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'No date';
const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

/** Leads handed over together: same source, given the same day. */
const batchKey = (l: LeadListItem) =>
  `${l.source || 'UNKNOWN'}|${l.assigned_at ? new Date(l.assigned_at).toDateString() : ''}`;

export const TelecallerDashboard: React.FC = () => {
  const { user, fetchWithAuth } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [selectedLead, setSelectedLead] = useState<LeadListItem | null>(null);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [qualifyingLead, setQualifyingLead] = useState<LeadListItem | null>(null);
  const [activeSection, setActiveSection] = useState<'leads' | 'tasks'>('leads');
  // Lead whose call outcome we're waiting for (set when Call is tapped; the
  // dialog is waiting when the telecaller comes back from the dialer).
  const [callLead, setCallLead] = useState<LeadListItem | null>(null);
  // Render-side cap, independent of the fetch: a telecaller can have
  // thousands of active leads after a big bulk import, and rendering that
  // many DOM cards at once freezes the browser regardless of how much data
  // the API returned. "Load More" reveals more of the already-fetched list.
  const LEADS_PAGE_SIZE = 50;
  const [visibleLeadCount, setVisibleLeadCount] = useState(LEADS_PAGE_SIZE);
  // New calls (never called) and follow-ups (called before) are separate
  // lists, so a fresh upload can't bury older leads among follow-ups.
  const [leadTab, setLeadTab] = useState<'new' | 'followups' | 'all' | null>(null);
  const [batchFilter, setBatchFilter] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['telecallerDashboardData'],
    queryFn: async () => {
      const [leadsRes, visitsRes, tasksRes, queueRes] = await Promise.all([
        // Explicit high limit: this is a personal, already-scoped list (see
        // GET /leads's own comment) that can legitimately run into the tens
        // of thousands after a large bulk import gets auto-distributed —
        // the backend default alone (2000) isn't enough to guarantee "all
        // of mine". Rendering is separately capped below (visibleLeadCount)
        // so the DOM never has to hold that many cards at once.
        fetchWithAuth(`${API_BASE_URL}/leads?limit=100000`),
        fetchWithAuth(`${API_BASE_URL}/site-visits`),
        fetchWithAuth(`${API_BASE_URL}/tasks/my-tasks`),
        fetchWithAuth(`${API_BASE_URL}/leads/call-queue`),
      ]);

      let callMeta: Record<number, CallMeta> = {};
      let callsToday = { new_calls: 0, follow_up_calls: 0 };
      if (queueRes.ok) {
        const q = await queueRes.json();
        callMeta = q.leads || {};
        callsToday = q.today || callsToday;
      }

      let assignedLeads = [];
      let tomorrowVisits: ListItem[] = [];
      let whatsappTasks = 0;
      let callBacksDue = 0;
      let visitsByLead: Record<number, any[]> = {};

      if (leadsRes.ok) {
        const data = await leadsRes.json();
        assignedLeads = data.leads || [];
      }

      if (visitsRes.ok) {
        const data = await visitsRes.json();
        const visits = data.visits || [];

        for (const visit of visits) {
          if (!visit.lead_id) continue;
          if (!visitsByLead[visit.lead_id]) visitsByLead[visit.lead_id] = [];
          visitsByLead[visit.lead_id].push(visit);
        }

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

        tomorrowVisits = tmrVisits.map((v: any) => ({
          id: v.id.toString(),
          title: `Visit for ${v.customer?.customer_name || 'Customer'}`,
          subtitle: `Project: ${v.project?.name || 'N/A'}`,
          icon: Calendar,
          link: '/site-visits',
        }));
      }

      // Fetch demos for telecaller's leads
      let demosByLead: Record<number, any[]> = {};
      try {
        const demosRes = await fetchWithAuth(`${API_BASE_URL}/demos`);
        if (demosRes.ok) {
          const demosData = await demosRes.json();
          const demos = demosData.demos || [];
          for (const demo of demos) {
            if (!demosByLead[demo.lead_id]) demosByLead[demo.lead_id] = [];
            demosByLead[demo.lead_id].push(demo);
          }
        }
      } catch (e) {
        console.error('Failed to fetch demos', e);
      }

      if (tasksRes.ok) {
        const data = await tasksRes.json();
        const tasks = data.tasks || [];
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);
        callBacksDue = tasks.filter(
          (t: any) =>
            !['COMPLETED', 'CANCELLED'].includes(t.status) &&
            typeof t.title === 'string' &&
            t.title.startsWith('Call back ') &&
            new Date(t.target_date) <= endOfToday,
        ).length;
        whatsappTasks = tasks.filter(
          (t: any) =>
            !['COMPLETED', 'CANCELLED'].includes(t.status) &&
            (t.title?.toLowerCase().includes('whatsapp') ||
              t.description?.toLowerCase().includes('whatsapp')),
        ).length;
      }

      return {
        assignedLeads,
        tomorrowVisits,
        whatsappTasks,
        callBacksDue,
        demosByLead,
        visitsByLead,
        callMeta,
        callsToday,
      };
    },
  });

  const assignedLeads = data?.assignedLeads || [];
  const tomorrowVisits = data?.tomorrowVisits || [];
  const whatsappTasks = data?.whatsappTasks || 0;
  const callBacksDue = data?.callBacksDue || 0;
  const demosByLead = data?.demosByLead || {};
  const visitsByLead = data?.visitsByLead || {};
  const callMeta: Record<number, CallMeta> = data?.callMeta || {};
  const callsToday = data?.callsToday || { new_calls: 0, follow_up_calls: 0 };

  const updateLeadStatusMutation = useMutation({
    mutationFn: async ({
      leadId,
      newStatus,
      qualification,
    }: {
      leadId: number;
      newStatus: string;
      qualification?: QualificationData;
    }) => {
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
      if (!res.ok) {
        const formattedError = toUserFacingError({
          status: res.status,
          body: data,
        });
        showToast({ ...formattedError, type: 'error' });
        throw new Error('SILENT');
      }
      return data;
    },
    onSuccess: () => {
      showToast('Lead status updated successfully!', 'success');
      queryClient.invalidateQueries({ queryKey: ['telecallerDashboardData'] });
    },
    onError: (error: any) => {
      if (error.message !== 'SILENT') {
        const formattedError = toUserFacingError({ message: error.message });
        showToast({ ...formattedError, type: 'error' });
      }
    },
  });

  const updateLeadStatus = async (
    leadId: number,
    newStatus: string,
    qualification?: QualificationData,
  ) => {
    return updateLeadStatusMutation.mutateAsync({ leadId, newStatus, qualification });
  };

  // Compute KPIs from existing data
  const myAssignedLeadsRaw = assignedLeads.filter((l: any) => l.assigned_to?.id === user?.id);

  const activeStatuses = ['NEW', 'ASSIGNED', 'CONTACTED', 'QUALIFIED', 'SITE_VISIT_SCHEDULED'];
  const myAssignedLeads: LeadListItem[] = myAssignedLeadsRaw.filter(
    (l: any): l is typeof l & { status: string } =>
      typeof l.status === 'string' && activeStatuses.includes(l.status),
  );

  // New call = not called yet and still fresh. Everything else is a
  // follow-up (including leads moved on before calls were logged).
  const isNewCall = (l: LeadListItem) =>
    !callMeta[l.id]?.calls && (l.status === 'NEW' || l.status === 'ASSIGNED');
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const isDue = (l: LeadListItem) => {
    const f = callMeta[l.id]?.follow_up_at;
    return !!f && new Date(f) <= endOfToday;
  };
  const isRetry = (l: LeadListItem) => {
    const m = callMeta[l.id];
    return (
      !m?.follow_up_at &&
      !!m?.last_outcome &&
      RETRY_OUTCOMES.includes(m.last_outcome) &&
      !!m.last_call_at &&
      new Date(m.last_call_at).toDateString() !== new Date().toDateString()
    );
  };

  // Oldest hand-over first, so leads given earlier are finished before the
  // next upload's (the list used to show the newest leads on top).
  const newCallLeads = myAssignedLeads
    .filter(isNewCall)
    .sort(
      (a, b) =>
        new Date(a.assigned_at || a.created_at || 0).getTime() -
        new Date(b.assigned_at || b.created_at || 0).getTime(),
    );
  // Due call-backs (overdue first), then unanswered calls to retry, then the
  // rest by how long since the last call; later call-backs at the end.
  const followUpRank = (l: LeadListItem) =>
    isDue(l) ? 0 : isRetry(l) ? 1 : callMeta[l.id]?.follow_up_at ? 3 : 2;
  const followUpTime = (l: LeadListItem) => {
    const m = callMeta[l.id];
    return new Date((m?.follow_up_at || m?.last_call_at || 0) as any).getTime();
  };
  const followUpLeads = myAssignedLeads
    .filter((l) => !isNewCall(l))
    .sort((a, b) => followUpRank(a) - followUpRank(b) || followUpTime(a) - followUpTime(b));
  const followUpsDue = followUpLeads.filter((l) => isDue(l) || isRetry(l)).length;

  // Which hand-overs still have leads waiting for a first call.
  const batches = Object.values(
    myAssignedLeads.reduce<
      Record<string, { key: string; label: string; when: number; total: number; left: number }>
    >((acc, l) => {
      const key = batchKey(l);
      const b = (acc[key] ??= {
        key,
        label: `${getLeadSourceLabel(l.source)} · ${dayLabel(l.assigned_at)}`,
        when: l.assigned_at ? new Date(l.assigned_at).getTime() : 0,
        total: 0,
        left: 0,
      });
      b.total += 1;
      if (isNewCall(l)) b.left += 1;
      return acc;
    }, {}),
  )
    .filter((b) => b.left > 0)
    .sort((a, b) => a.when - b.when);

  const tab = leadTab ?? (followUpsDue > 0 ? 'followups' : 'new');
  const shownLeads =
    tab === 'new'
      ? newCallLeads.filter((l) => !batchFilter || batchKey(l) === batchFilter)
      : tab === 'followups'
        ? followUpLeads
        : myAssignedLeads;

  const followUpHint = (l: LeadListItem): { text: string; tone: string } | null => {
    const m = callMeta[l.id];
    if (m?.follow_up_at) {
      const f = new Date(m.follow_up_at);
      if (f < new Date())
        return {
          text: `Call-back overdue (${dayLabel(m.follow_up_at)}, ${timeLabel(m.follow_up_at)})`,
          tone: 'bg-red-50 border-red-200 text-red-700',
        };
      if (f <= endOfToday)
        return {
          text: `Call back today at ${timeLabel(m.follow_up_at)}`,
          tone: 'bg-emerald-50 border-emerald-200 text-emerald-700',
        };
      return {
        text: `Call back on ${dayLabel(m.follow_up_at)}`,
        tone: 'bg-slate-50 border-slate-200 text-slate-600',
      };
    }
    if (isRetry(l) && m?.last_outcome)
      return {
        text: `Try again: ${(OUTCOME_LABEL[m.last_outcome] || '').toLowerCase()} last time`,
        tone: 'bg-amber-50 border-amber-200 text-amber-700',
      };
    return null;
  };

  return (
    <div className="space-y-0 -mx-4 -mt-4 sm:mx-0 sm:mt-0 sm:space-y-6">
      {/* ─── HERO HEADER ─── */}
      <div className="bg-gradient-to-br from-navy-900 to-navy-700 px-5 pt-6 pb-5 sm:rounded-2xl">
        <div className="mb-5">
          <p className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-1">
            Welcome back
          </p>
          <h1 className="text-white font-black text-xl leading-tight">
            {user?.fullName || user?.employeeCode}
          </h1>
          <p className="text-white/50 text-xs mt-0.5">
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </p>
        </div>

        {/* KPI Chips */}
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => {
              setActiveSection('leads');
              setLeadTab('new');
            }}
            className="bg-white/10 rounded-2xl p-3 text-center border border-white/10"
          >
            <p className="text-white font-black text-xl">{newCallLeads.length}</p>
            <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mt-0.5">
              New to call
            </p>
          </button>
          <button
            onClick={() => {
              setActiveSection('leads');
              setLeadTab('followups');
            }}
            className="bg-white/10 rounded-2xl p-3 text-center border border-white/10"
          >
            <p className="text-amber-400 font-black text-xl">{followUpsDue}</p>
            <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mt-0.5">
              Follow-ups due
            </p>
          </button>
          <div className="bg-white/10 rounded-2xl p-3 text-center border border-white/10">
            <p className="text-emerald-400 font-black text-xl">
              {callsToday.new_calls + callsToday.follow_up_calls}
            </p>
            <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mt-0.5">
              Calls today
            </p>
            <p className="text-white/50 text-[10px] mt-0.5">
              {callsToday.new_calls} new · {callsToday.follow_up_calls} follow-up
            </p>
          </div>
        </div>
      </div>

      {/* ─── QUALIFICATION MODAL ─── */}
      {qualifyingLead && (
        <QualificationFormModal
          title="Qualify Lead"
          requireAllFields={true}
          onClose={() => setQualifyingLead(null)}
          onSave={async (data) => {
            await updateLeadStatus(qualifyingLead.id, 'QUALIFIED', data);
            setQualifyingLead(null);
          }}
        />
      )}

      {/* ─── LEAD DETAIL MODAL ─── */}
      {selectedLead && (
        <LeadDetailModal
          lead={selectedLead as any}
          onClose={() => {
            setSelectedLead(null);
            setScheduleModalOpen(false);
          }}
          onUpdateStatus={updateLeadStatus}
          onRefreshLeads={() =>
            queryClient.invalidateQueries({ queryKey: ['telecallerDashboardData'] })
          }
          onDemoComplete={async () => {}}
          initialShowScheduleModal={scheduleModalOpen}
        />
      )}

      {callLead && (
        <CallOutcomeModal
          lead={callLead}
          onClose={() => setCallLead(null)}
          onLogged={() => queryClient.invalidateQueries({ queryKey: ['telecallerDashboardData'] })}
        />
      )}

      {/* ─── CALL-BACKS DUE ─── */}
      {callBacksDue > 0 && (
        <div className="mx-4 sm:mx-0">
          <div
            onClick={() => setActiveSection('tasks')}
            className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3.5 flex items-center gap-3 cursor-pointer hover:bg-emerald-100 transition-colors"
          >
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <PhoneCall className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-emerald-900 text-sm">
                {callBacksDue} call-back{callBacksDue > 1 ? 's' : ''} due today
              </p>
              <p className="text-emerald-700/70 text-xs mt-0.5">Customers waiting for your call</p>
            </div>
            <ChevronRight className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          </div>
        </div>
      )}

      {/* ─── TOMORROW VISITS BANNER ─── */}
      {tomorrowVisits.length > 0 && (
        <div className="mx-4 sm:mx-0">
          <div
            onClick={() => navigate('/site-visits')}
            className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5 flex items-center gap-3 cursor-pointer hover:bg-amber-100 transition-colors"
          >
            <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-amber-900 text-sm">Reconfirm Tomorrow's Visits</p>
              <p className="text-amber-700/70 text-xs mt-0.5">
                {tomorrowVisits.length} visit{tomorrowVisits.length > 1 ? 's' : ''} pending
                reconfirmation
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-amber-500 flex-shrink-0" />
          </div>
        </div>
      )}

      {/* ─── SECTION TOGGLE ─── */}
      <div className="px-4 sm:px-0">
        <div className="flex gap-2 bg-slate-100 p-1 rounded-2xl">
          <button
            onClick={() => setActiveSection('leads')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-black transition-all ${activeSection === 'leads' ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Users className="w-4 h-4" /> My Leads
            {myAssignedLeads.length > 0 && (
              <span
                className={`min-w-[20px] h-5 px-1 rounded-full text-[10px] font-black flex items-center justify-center ${activeSection === 'leads' ? 'bg-navy-900 text-white' : 'bg-slate-200 text-slate-600'}`}
              >
                {myAssignedLeads.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveSection('tasks')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-black transition-all ${activeSection === 'tasks' ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Clock className="w-4 h-4" /> Tasks
            {whatsappTasks > 0 && (
              <span
                className={`min-w-[20px] h-5 px-1 rounded-full text-[10px] font-black flex items-center justify-center ${activeSection === 'tasks' ? 'bg-navy-900 text-white' : 'bg-slate-200 text-slate-600'}`}
              >
                {whatsappTasks}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ─── LEAD LIST ─── */}
      {activeSection === 'leads' && (
        <div className="px-4 sm:px-0 space-y-3 pb-6">
          <div className="flex gap-2 overflow-x-auto">
            {(
              [
                ['new', `New calls (${newCallLeads.length})`],
                [
                  'followups',
                  `Follow-ups (${followUpLeads.length}${followUpsDue ? `, ${followUpsDue} due` : ''})`,
                ],
                ['all', `All (${myAssignedLeads.length})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => {
                  setLeadTab(key);
                  setVisibleLeadCount(LEADS_PAGE_SIZE);
                }}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${tab === key ? 'bg-navy-900 text-white border-navy-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'new' && batches.length > 1 && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
              <p className="text-[11px] font-bold text-slate-500 mb-2">
                Your lead batches, oldest first. Tap one to see only those leads.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setBatchFilter(null)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${!batchFilter ? 'bg-navy-900 text-white border-navy-900' : 'bg-white text-slate-600 border-slate-200'}`}
                >
                  All batches
                </button>
                {batches.map((b) => (
                  <button
                    key={b.key}
                    onClick={() => {
                      setBatchFilter(batchFilter === b.key ? null : b.key);
                      setVisibleLeadCount(LEADS_PAGE_SIZE);
                    }}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${batchFilter === b.key ? 'bg-navy-900 text-white border-navy-900' : 'bg-white text-slate-600 border-slate-200'}`}
                  >
                    {b.label}: {b.left} of {b.total} left
                  </button>
                ))}
              </div>
            </div>
          )}
          {isLoading ? (
            <div className="py-12 text-center text-sm text-slate-400 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-navy-500 border-t-transparent rounded-full animate-spin" />
              Loading your leads...
            </div>
          ) : myAssignedLeads.length > 0 && shownLeads.length === 0 ? (
            <div className="py-10 text-center bg-slate-50 rounded-2xl border border-slate-100">
              <p className="font-bold text-slate-500 text-sm">
                {tab === 'new' ? 'Every lead has been called at least once' : 'No follow-ups'}
              </p>
            </div>
          ) : myAssignedLeads.length === 0 ? (
            <div className="py-12 text-center bg-slate-50 rounded-2xl border border-slate-100">
              <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Users className="w-7 h-7 text-slate-300" />
              </div>
              <p className="font-bold text-slate-500 text-sm">No active leads</p>
              <p className="text-slate-400 text-xs mt-1">
                Keep your performance score high for priority assignments!
              </p>
            </div>
          ) : (
            shownLeads.slice(0, visibleLeadCount).map((lead: LeadListItem) => (
              <div
                key={lead.id}
                onClick={() => setSelectedLead(lead)}
                className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden active:scale-[0.99] transition-transform cursor-pointer"
              >
                {/* Lead Header */}
                <div className="px-4 pt-4 pb-3 flex items-start gap-3">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-navy-700 to-navy-500 flex items-center justify-center text-white font-black text-sm flex-shrink-0">
                    {lead.customer_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h4 className="font-black text-navy-900 text-sm truncate">
                        {lead.customer_name}
                      </h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-400 text-xs">{lead.lead_code}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black ${STATUS_COLOR[lead.status ?? ''] || 'bg-slate-100 text-slate-500'}`}
                      >
                        {STATUS_LABEL[lead.status ?? ''] || lead.status}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0 mt-1" />
                </div>

                {/* Where it came from, and its call history */}
                <div className="px-4 pb-2 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                    {getLeadSourceLabel(lead.source)} · given {dayLabel(lead.assigned_at)}
                  </span>
                  {callMeta[lead.id]?.calls ? (
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                      {callMeta[lead.id].calls} call{callMeta[lead.id].calls > 1 ? 's' : ''}
                      {callMeta[lead.id].last_outcome &&
                        ` · last: ${OUTCOME_LABEL[callMeta[lead.id].last_outcome as string] || ''}`}
                      {callMeta[lead.id].last_call_at &&
                        ` · ${getRelativeAge(callMeta[lead.id].last_call_at)}`}
                    </span>
                  ) : (
                    isNewCall(lead) && (
                      <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        Not called yet
                      </span>
                    )
                  )}
                  {(() => {
                    const hint = followUpHint(lead);
                    return hint ? (
                      <span className={`px-2 py-0.5 rounded-full border ${hint.tone}`}>
                        {hint.text}
                      </span>
                    ) : null;
                  })()}
                </div>

                {/* Demo/Visit Status Badges */}
                {(demosByLead[lead.id]?.length ?? 0) > 0 && (
                  <div className="px-4 pb-1 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 border border-purple-200 rounded-full text-[10px] font-bold text-purple-700">
                      <Calendar className="w-3 h-3" />
                      {
                        demosByLead[lead.id].filter((d: any) => d.status !== 'CANCELLED').length
                      }{' '}
                      Demo
                      {demosByLead[lead.id].filter((d: any) => d.status !== 'CANCELLED').length !==
                      1
                        ? 's'
                        : ''}
                    </span>
                  </div>
                )}

                {/* Inline site visit status for leads with visits */}
                {(visitsByLead[lead.id]?.length ?? 0) > 0 && (
                  <div className="px-4 pb-1 flex items-center gap-2">
                    {visitsByLead[lead.id].filter(
                      (v: any) => v.status !== 'CANCELLED' && v.status !== 'COMPLETED',
                    ).length > 0 ? (
                      <>
                        {visitsByLead[lead.id].filter((v: any) => v.status === 'PENDING_ACCEPTANCE')
                          .length > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded-full text-[10px] font-bold text-amber-700">
                            <MapPin className="w-3 h-3" />
                            Visit Pending
                          </span>
                        )}
                        {visitsByLead[lead.id].filter((v: any) => v.status === 'COMPLETED').length >
                          0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded-full text-[10px] font-bold text-emerald-700">
                            <CheckCircle2 className="w-3 h-3" />
                            Visit Done
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-50 border border-slate-200 rounded-full text-[10px] font-bold text-slate-500">
                        <Calendar className="w-3 h-3" />
                        Visits Completed
                      </span>
                    )}
                  </div>
                )}

                {/* Property / Budget Info */}
                <div className="px-4 pb-3 flex gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-300" />
                    {lead.preferred_location || 'No location'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-slate-300" />
                    {getPropertyTypeLabel(lead.property_type_preference) || 'Any type'}
                  </span>
                </div>

                {/* Action Bar */}
                <div
                  className="border-t border-slate-100 grid grid-cols-3 divide-x divide-slate-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <a
                    href={`tel:${lead.phone}`}
                    onClick={() => {
                      // Let the dialer open first; the outcome dialog is
                      // waiting when they come back to the app.
                      if (lead.can_edit !== false) setTimeout(() => setCallLead(lead), 400);
                    }}
                    className="flex items-center justify-center gap-2 py-3 text-emerald-600 font-bold text-xs hover:bg-emerald-50 transition-colors"
                  >
                    <PhoneCall className="w-3.5 h-3.5" /> Call
                  </a>

                  {(lead.status === 'NEW' || lead.status === 'ASSIGNED') && (
                    <button
                      className="flex items-center justify-center gap-2 py-3 text-amber-600 font-bold text-xs hover:bg-amber-50 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Replaces the old one-tap "Contacted": a lead becomes
                        // contacted when a call is logged as answered.
                        setCallLead(lead);
                      }}
                      disabled={lead.can_edit === false}
                    >
                      <Zap className="w-3.5 h-3.5" /> Log call
                    </button>
                  )}

                  {lead.status === 'CONTACTED' && (
                    <button
                      className="flex items-center justify-center gap-2 py-3 text-navy-700 font-bold text-xs hover:bg-navy-50 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setQualifyingLead(lead);
                      }}
                      disabled={lead.can_edit === false}
                    >
                      <TrendingUp className="w-3.5 h-3.5" /> Qualify
                    </button>
                  )}

                  {(lead.status === 'QUALIFIED' || lead.status === 'DEMO_COMPLETED') && (
                    <button
                      className="flex items-center justify-center gap-2 py-3 text-gold-600 font-bold text-xs hover:bg-gold-50 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedLead(lead);
                        setScheduleModalOpen(true);
                      }}
                      disabled={lead.can_edit === false}
                    >
                      <Calendar className="w-3.5 h-3.5" /> Visit
                    </button>
                  )}

                  {/* If none of the above, show "View" */}
                  {!['NEW', 'ASSIGNED', 'CONTACTED', 'QUALIFIED', 'DEMO_COMPLETED'].includes(
                    lead.status ?? '',
                  ) && (
                    <div className="flex items-center justify-center py-3 text-slate-400 text-xs font-bold col-start-2">
                      Tap to View
                    </div>
                  )}

                  <button
                    className="flex items-center justify-center gap-2 py-3 text-slate-500 font-bold text-xs hover:bg-slate-50 transition-colors col-start-3"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedLead(lead);
                    }}
                  >
                    Details <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
          {shownLeads.length > visibleLeadCount && (
            <button
              onClick={() => setVisibleLeadCount((c) => c + LEADS_PAGE_SIZE)}
              className="w-full py-3 rounded-2xl border border-slate-200 bg-white text-navy-700 font-bold text-sm hover:bg-slate-50 transition-colors"
            >
              Load More ({shownLeads.length - visibleLeadCount} remaining)
            </button>
          )}
        </div>
      )}

      {/* ─── TASKS SECTION ─── */}
      {activeSection === 'tasks' && (
        <div className="px-4 sm:px-0 pb-6 space-y-4">
          {/* WhatsApp Follow-ups Banner */}
          {whatsappTasks > 0 && (
            <div
              onClick={() => navigate('/tasks')}
              className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3.5 flex items-center gap-3 cursor-pointer hover:bg-emerald-100 transition-colors"
            >
              <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-black text-emerald-900 text-sm">
                  {whatsappTasks} WhatsApp Follow-up{whatsappTasks > 1 ? 's' : ''}
                </p>
                <p className="text-emerald-700/70 text-xs mt-0.5">Tap to view all tasks</p>
              </div>
              <ChevronRight className="w-4 h-4 text-emerald-400" />
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-100 bg-slate-50/60">
              <h3 className="font-black text-navy-900 text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-navy-600" /> My Task Board
              </h3>
            </div>
            <div className="p-4">
              <TaskManager />
            </div>
          </div>

          {/* Performance Score */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-100 bg-slate-50/60">
              <h3 className="font-black text-navy-900 text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-navy-600" /> My Performance Score
              </h3>
            </div>
            <div className="p-4">
              <PerformanceScoreWidget />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
