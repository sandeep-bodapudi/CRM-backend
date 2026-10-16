import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  AlertCircle,
  Plus,
  Sparkles,
  X,
  Send,
  Users,
  Briefcase,
  ListTodo,
  CheckSquare,
  Calendar,
  Building2,
  PhoneCall,
  MessageCircle,
  Search,
  UserCircle2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Roles } from '../../shared';
import { API_BASE_URL } from '../../config';
import { TaskItem, EmployeeListItem } from '../../types';
import { formatEmployeeLabel } from '../../utils/employeeLabel';
import { StatusPill } from '../ui/StatusPill';
import { StatCard } from '../ui/StatCard';
import { useToast } from '../../context/ToastContext';
import { handleApiError, toUserFacingError } from '../../utils/userFacingError';
import { buildWhatsAppUrl } from '../../utils/phone';
import { CallOutcomeModal } from '../leads/CallOutcomeModal';

const DONE_STATUSES = ['COMPLETED', 'CANCELLED'];
const TEAM_PAGE_SIZE = 200;

/** Calendar day (IST) of an instant, as YYYY-MM-DD. */
const istDay = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);

export const TaskManager: React.FC = () => {
  const { user, fetchWithAuth, activeRole } = useAuth();
  const { showError } = useToast();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [teamTasks, setTeamTasks] = useState<TaskItem[]>([]);
  const [teamTotal, setTeamTotal] = useState(0);
  const [search, setSearch] = useState('');
  // Task whose lead is being called: the outcome form opens when they come
  // back from the dialer, like on the telecaller dashboard.
  const [callLead, setCallLead] = useState<{
    id: number;
    customer_name: string;
    phone?: string | null;
    status?: string;
  } | null>(null);
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [activeTab, setActiveTab] = useState<'my_tasks' | 'team_tasks'>('my_tasks');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [cheerUpToast, setCheerUpToast] = useState<string | null>(null);

  // New task form modal state
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [priority, setPriority] = useState('MEDIUM');
  const [deadline, setDeadline] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canViewTeam = (
    [
      Roles.MD,
      Roles.MARKETING_DIRECTOR,
      Roles.ADMIN,
      Roles.HR_MANAGER,
      Roles.PROJECT_MANAGER,
      Roles.SALES_MANAGER,
    ] as string[]
  ).includes(activeRole);
  const canCreateTask = (
    [
      Roles.MD,
      Roles.HR_MANAGER,
      Roles.ADMIN,
      Roles.MARKETING_DIRECTOR,
      Roles.SALES_MANAGER,
      Roles.PROJECT_MANAGER,
      Roles.DIGITAL_LEAD_OPERATOR,
    ] as string[]
  ).includes(activeRole);

  const fetchTasks = async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/tasks/my-tasks`);
      const data = await res.json();
      if (res.ok) {
        setTasks(data.tasks || []);
      } else {
        setHasError(true);
      }

      if (canViewTeam) {
        const teamRes = await fetchWithAuth(
          `${API_BASE_URL}/tasks/all-team-tasks?limit=${TEAM_PAGE_SIZE}&offset=0`,
        );
        if (teamRes.ok) {
          const teamData = await teamRes.json();
          setTeamTasks(teamData.tasks || []);
          setTeamTotal(teamData.total ?? (teamData.tasks || []).length);
        }
      }
    } catch (e) {
      console.error('Failed to load tasks');
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchEmployees = async () => {
    if (!canCreateTask) return;
    try {
      // Everyone the caller may assign to (whole company), not just their
      // reporting team -- a PM with no direct reports saw an empty list.
      const res = await fetchWithAuth(`${API_BASE_URL}/tasks/assignees`);
      const data = await res.json();
      if (res.ok) {
        setEmployees(data.employees || []);
      }
    } catch (e) {
      console.error('Failed to load employees for task assignment');
    }
  };

  useEffect(() => {
    fetchTasks();
    fetchEmployees();
  }, []);

  const loadMoreTeam = async () => {
    try {
      const res = await fetchWithAuth(
        `${API_BASE_URL}/tasks/all-team-tasks?limit=${TEAM_PAGE_SIZE}&offset=${teamTasks.length}`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return handleApiError(res, showError, data);
      setTeamTasks((prev) => [...prev, ...(data.tasks || [])]);
      setTeamTotal(data.total ?? teamTotal);
    } catch (e) {
      showError(
        toUserFacingError({ message: e instanceof Error ? e.message : String(e), body: e }),
      );
    }
  };

  const handleUpdateStatus = async (taskId: number, newStatus: string) => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // A failed update used to do nothing at all, so the task looked
        // unchanged with no hint why.
        await handleApiError(res, showError, data);
        return;
      }

      const apply = (list: TaskItem[]) =>
        list.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status: newStatus,
                is_overdue:
                  !DONE_STATUSES.includes(newStatus) &&
                  new Date(t.target_date).getTime() < Date.now(),
              }
            : t,
        );
      setTasks(apply);
      setTeamTasks(apply);
      if (data.cheerUp) {
        setCheerUpToast(
          `🎉 Fantastic work! Task completed! +1.0 Performance Boost added to your score!`,
        );
        setTimeout(() => setCheerUpToast(null), 5000);
      }
    } catch (e) {
      showError(
        toUserFacingError({ message: e instanceof Error ? e.message : String(e), body: e }),
      );
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const selectedAssignee = parseInt(assigneeId, 10);

      const res = await fetchWithAuth(`${API_BASE_URL}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          assignee_id: selectedAssignee,
          priority,
          deadline: deadline || new Date(Date.now() + 86400000).toISOString(),
        }),
      });

      if (res.ok) {
        setTitle('');
        setDescription('');
        setAssigneeId('');
        setIsCreating(false);
        fetchTasks();
      } else {
        await handleApiError(res, showError, await res.json().catch(() => ({})));
      }
    } catch (e) {
      showError(
        toUserFacingError({ message: e instanceof Error ? e.message : String(e), body: e }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper: Live relative countdown timer badge
  const getCountdownBadge = (deadlineIso: string, status: string) => {
    if (DONE_STATUSES.includes(status)) return null;

    const now = new Date().getTime();
    const target = new Date(deadlineIso).getTime();
    const diff = target - now;

    if (diff < 0) {
      const minsOverdue = Math.abs(Math.floor(diff / (1000 * 60)));
      const hoursOverdue = Math.floor(minsOverdue / 60);
      const remMins = minsOverdue % 60;
      return (
        <span className="bg-red-100 text-red-800 font-mono font-bold text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1 border border-red-200 animate-pulse w-max">
          <AlertTriangle className="w-3 h-3 text-red-600" />
          <span>
            Overdue {hoursOverdue > 0 ? `${hoursOverdue}h ${remMins}m` : `${minsOverdue}m`}
          </span>
        </span>
      );
    }

    const minsLeft = Math.floor(diff / (1000 * 60));
    const hoursLeft = Math.floor(minsLeft / 60);
    const remMins = minsLeft % 60;

    const isUrgentWindow = hoursLeft < 1;

    return (
      <span
        className={`font-mono font-bold text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1 border w-max ${
          isUrgentWindow
            ? 'bg-amber-100 text-amber-900 border-amber-300 animate-pulse'
            : 'bg-slate-100 text-slate-700 border-slate-200'
        }`}
      >
        <Clock className="w-3 h-3 text-slate-500" />
        <span>Due in {hoursLeft > 0 ? `${hoursLeft}h ${remMins}m` : `${minsLeft}m`}</span>
      </span>
    );
  };

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case 'URGENT':
        return (
          <span className="bg-danger-100 text-danger-800 text-[10px] font-bold px-2 py-0.5 rounded border border-danger-200">
            URGENT
          </span>
        );
      case 'HIGH':
        return (
          <span className="bg-warning-100 text-warning-800 text-[10px] font-bold px-2 py-0.5 rounded border border-warning-200">
            HIGH
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="bg-navy-100 text-navy-800 text-[10px] font-bold px-2 py-0.5 rounded border border-navy-200">
            MEDIUM
          </span>
        );
      default:
        return (
          <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded border border-slate-200">
            LOW
          </span>
        );
    }
  };

  const isDone = (t: TaskItem) => DONE_STATUSES.includes(t.status || '');
  // Overdue is decided from the target time (the API's is_overdue), not from
  // the stored status, which only changes when the overdue sweep runs.
  const overdueNow = (t: TaskItem) =>
    !isDone(t) && (t.is_overdue ?? new Date(t.target_date).getTime() < Date.now());
  const effectiveStatus = (t: TaskItem) =>
    isDone(t) ? t.status || 'COMPLETED' : overdueNow(t) ? 'OVERDUE' : t.status || 'PENDING';

  const currentTaskList = activeTab === 'my_tasks' ? tasks : teamTasks;
  const q = search.trim().toLowerCase();
  const filteredTasks = currentTaskList.filter((t) => {
    if (filterStatus !== 'ALL' && effectiveStatus(t) !== filterStatus) return false;
    if (!q) return true;
    return [t.title, t.description, t.lead?.customer_name, t.lead?.phone]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  // Quick Metrics Calcs
  const pendingCount = currentTaskList.filter((t) => !isDone(t)).length;
  const overdueCount = currentTaskList.filter(overdueNow).length;

  // Tasks completed today
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const completedTodayCount = currentTaskList.filter((t) => {
    if (t.status !== 'COMPLETED' || !t.completed_at) return false;
    return new Date(t.completed_at) >= startOfToday;
  }).length;

  const today = istDay(new Date());
  const byTime = (a: TaskItem, b: TaskItem) =>
    new Date(a.target_date).getTime() - new Date(b.target_date).getTime();
  const groups: { key: string; label: string; tone: string; items: TaskItem[] }[] = [
    {
      key: 'overdue',
      label: 'Overdue',
      tone: 'text-red-700',
      items: filteredTasks.filter(overdueNow).sort(byTime),
    },
    {
      key: 'today',
      label: 'Due today',
      tone: 'text-amber-700',
      items: filteredTasks
        .filter((t) => !isDone(t) && !overdueNow(t) && istDay(new Date(t.target_date)) === today)
        .sort(byTime),
    },
    {
      key: 'upcoming',
      label: 'Upcoming',
      tone: 'text-navy-700',
      items: filteredTasks
        .filter((t) => !isDone(t) && !overdueNow(t) && istDay(new Date(t.target_date)) > today)
        .sort(byTime),
    },
    {
      key: 'done',
      label: 'Done',
      tone: 'text-emerald-700',
      items: filteredTasks
        .filter(isDone)
        .sort(
          (a, b) =>
            new Date(b.completed_at || b.target_date).getTime() -
            new Date(a.completed_at || a.target_date).getTime(),
        ),
    },
  ];

  const renderTask = (t: TaskItem) => {
    const done = isDone(t);
    const status = effectiveStatus(t);
    const mine = t.assignee_id === user?.id;
    const phone = t.lead?.phone || '';
    const assignedBy =
      t.created_by === t.assignee_id
        ? 'Self-assigned'
        : t.creator
          ? `Assigned by ${formatEmployeeLabel(t.creator)}`
          : null;
    return (
      <div
        key={t.id}
        className={`bg-white rounded-2xl border p-4 space-y-3 shadow-sm ${
          status === 'OVERDUE' ? 'border-red-200' : 'border-slate-200'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`font-bold text-sm break-words ${done ? 'text-slate-400 line-through' : 'text-slate-800'}`}
              >
                {t.title}
              </span>
              {!done && getPriorityBadge(t.priority || 'MEDIUM')}
            </div>
            {t.description && (
              <p className="text-xs text-slate-600 whitespace-pre-wrap break-words">
                {t.description}
              </p>
            )}
          </div>
          <StatusPill
            status={status}
            type={status === 'COMPLETED' ? 'success' : status === 'OVERDUE' ? 'danger' : 'pending'}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5 font-mono">
            <Calendar className="w-3.5 h-3.5" />
            {new Date(t.target_date || '').toLocaleString([], {
              dateStyle: 'short',
              timeStyle: 'short',
              timeZone: 'Asia/Kolkata',
            })}
          </span>
          {getCountdownBadge(t.target_date || '', t.status || 'PENDING')}
          {assignedBy && (
            <span className="flex items-center gap-1">
              <UserCircle2 className="w-3.5 h-3.5" />
              {assignedBy}
            </span>
          )}
          {activeTab === 'team_tasks' && t.assignee && (
            <span className="font-semibold text-slate-700">
              For {formatEmployeeLabel(t.assignee)}
            </span>
          )}
          {t.lead && (
            <span className="flex items-center gap-1 font-semibold text-navy-800">
              <Building2 className="w-3.5 h-3.5 text-gold-600" />
              {t.lead.customer_name}
              {phone ? <span className="font-mono font-normal text-slate-400">{phone}</span> : null}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {!done && mine && t.lead && phone && (
            <>
              <a
                href={`tel:${phone}`}
                onClick={() => {
                  // Let the dialer open first; the outcome form is waiting when they return.
                  const lead = {
                    id: t.lead!.id,
                    customer_name: t.lead!.customer_name || 'Customer',
                    phone,
                    status: t.lead!.status,
                  };
                  setTimeout(() => setCallLead(lead), 400);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg"
              >
                <PhoneCall className="w-3.5 h-3.5" /> Call
              </a>
              <a
                href={buildWhatsAppUrl(phone)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-emerald-600 text-emerald-700 hover:bg-emerald-50 font-bold text-xs rounded-lg"
              >
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </a>
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            {done ? (
              <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />{' '}
                {t.status === 'CANCELLED' ? 'Cancelled' : 'Done'}
              </span>
            ) : (
              <>
                <select
                  value={t.status || 'PENDING'}
                  onChange={(e) => handleUpdateStatus(t.id, e.target.value)}
                  className="p-1.5 text-[11px] font-bold bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-navy-500"
                >
                  <option value="PENDING">PENDING</option>
                  <option value="IN_PROGRESS">IN PROGRESS</option>
                  {t.status === 'OVERDUE' && (
                    <option value="OVERDUE" disabled>
                      OVERDUE
                    </option>
                  )}
                </select>
                <button
                  onClick={() => handleUpdateStatus(t.id, 'COMPLETED')}
                  className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors border border-emerald-200"
                  title="Mark as Completed"
                >
                  <CheckCircle2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Cheer-Up Toast */}
      {cheerUpToast && (
        <div className="fixed top-6 right-6 z-50 bg-gradient-to-r from-navy-800 to-navy-900 text-white p-4 rounded-2xl shadow-2xl border border-gold-500/30 flex items-center gap-3 animate-bounce">
          <Sparkles className="w-6 h-6 text-gold-400 shrink-0" />
          <div>
            <h4 className="font-bold text-sm text-gold-400">Celebration Time!</h4>
            <p className="text-xs text-slate-200">{cheerUpToast}</p>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-navy-900 via-navy-800 to-slate-900 rounded-3xl p-6 text-white shadow-xl flex flex-wrap items-center justify-between gap-4 border border-navy-700/30">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ListTodo className="w-5 h-5 text-gold-500" />
            <h2 className="text-xl font-extrabold tracking-tight">Task Management</h2>
          </div>
          <p className="text-xs text-navy-200/80">
            Log calls, accept visits, and manage follow-ups. Every task drives the CRM funnel
            forward.
          </p>
        </div>

        {canCreateTask && (
          <button
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-gold-600 hover:bg-gold-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Task</span>
          </button>
        )}
      </div>

      {hasError && (
        <div className="text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-4 py-3 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-danger-600" />
          Unable to load tasks. Please try again later.
        </div>
      )}

      {/* Quick Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Pending Tasks" value={pendingCount} icon={Briefcase} />
        <StatCard
          label="Overdue Tasks"
          value={overdueCount}
          icon={AlertTriangle}
          trend={{ direction: 'down', value: String(overdueCount), label: 'Requires Attention' }}
        />
        <StatCard
          label="Completed Today"
          value={completedTodayCount}
          icon={CheckSquare}
          trend={{ direction: 'up', value: 'Great job!', label: 'Performance Boost' }}
        />
      </div>

      {/* Main Content Area */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('my_tasks')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'my_tasks'
                  ? 'bg-white text-navy-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              My Tasks ({tasks.length})
            </button>
            {canViewTeam && (
              <button
                onClick={() => setActiveTab('team_tasks')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === 'team_tasks'
                    ? 'bg-white text-navy-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Team Tasks ({teamTasks.length})</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-500">Filter Status:</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold focus:outline-none focus:border-navy-500"
            >
              <option value="ALL">All Tasks</option>
              <option value="PENDING">PENDING</option>
              <option value="IN_PROGRESS">IN PROGRESS</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="OVERDUE">OVERDUE</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-slate-500">Loading tasks...</div>
        ) : (
          <div className="space-y-6">
            <div className="relative max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search task, customer or phone..."
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-navy-500"
              />
            </div>

            {filteredTasks.length === 0 && (
              <div className="py-12 text-center text-sm text-slate-500 bg-slate-50 rounded-2xl border border-slate-100">
                No tasks found matching your criteria.
              </div>
            )}

            {groups
              .filter((g) => g.items.length > 0)
              .map((g) => (
                <section key={g.key} className="space-y-3">
                  <h3 className={`text-xs font-extrabold uppercase tracking-wider ${g.tone}`}>
                    {g.label} <span className="text-slate-400">({g.items.length})</span>
                  </h3>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {g.items.map(renderTask)}
                  </div>
                </section>
              ))}

            {activeTab === 'team_tasks' && teamTasks.length < teamTotal && (
              <button
                onClick={loadMoreTeam}
                className="w-full py-3 rounded-2xl border border-slate-200 bg-white text-navy-700 font-bold text-sm hover:bg-slate-50"
              >
                Load more ({teamTotal - teamTasks.length} remaining)
              </button>
            )}
          </div>
        )}
      </div>

      {callLead && (
        <CallOutcomeModal
          lead={callLead}
          onClose={() => setCallLead(null)}
          onLogged={() => {
            setCallLead(null);
            fetchTasks();
          }}
        />
      )}

      {/* New Task Creation Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-[60] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-100 animate-scaleUp">
            <div className="bg-navy-900 p-5 flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <ListTodo className="w-5 h-5 text-gold-500" />
                <h3 className="font-bold text-sm tracking-wide">Create New Task</h3>
              </div>
              <button
                onClick={() => setIsCreating(false)}
                className="p-1.5 text-slate-300 hover:text-white rounded-full hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1.5 uppercase tracking-wider text-[10px]">
                  Task Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Review Gachibowli Property Documentation"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-600 text-sm"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5 uppercase tracking-wider text-[10px]">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Provide task scope, instructions, or specific criteria..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-600 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5 uppercase tracking-wider text-[10px]">
                    Assignee
                  </label>
                  <select
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-surface border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-600 text-sm font-semibold text-slate-700"
                  >
                    <option value="" disabled className="text-slate-700 bg-white">
                      Select Assignee
                    </option>
                    {employees
                      .filter((emp) => emp.id !== user?.id)
                      .map((emp) => (
                        <option key={emp.id} value={emp.id} className="text-slate-700 bg-white">
                          {formatEmployeeLabel(emp)} - {emp.roles.join(', ')}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1.5 uppercase tracking-wider text-[10px]">
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full px-3 py-2 bg-surface border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-600 text-sm font-semibold text-slate-700"
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="URGENT">URGENT</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5 uppercase tracking-wider text-[10px]">
                  Deadline Date/Time *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-slate-200 rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-navy-600 text-sm"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2 bg-navy-900 hover:bg-navy-800 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-md flex items-center justify-center gap-2 transition-all"
                >
                  <Send className="w-4 h-4" />
                  <span>{isSubmitting ? 'Creating...' : 'Create & Assign Task'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
