import React, { useCallback, useEffect, useState } from 'react';
import {
  MessageSquareWarning,
  Plus,
  X,
  Send,
  Search,
  AlertCircle,
  UserCheck,
  CheckCircle2,
  Lock,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Roles } from '../../shared';
import { API_BASE_URL } from '../../config';
import { DataTable, ColumnDef } from '../ui/DataTable';

interface ComplaintCustomer {
  id: number;
  first_name?: string;
  last_name?: string | null;
  phone?: string;
}

const customerDisplayName = (
  c: { first_name?: string; last_name?: string | null } | null | undefined,
) => (c ? [c.first_name, c.last_name].filter(Boolean).join(' ') || undefined : undefined);

interface ComplaintEmployee {
  id: number;
  full_name?: string;
  employee_code?: string;
}

interface Complaint {
  id: number;
  complaint_code: string;
  title: string;
  description: string | null;
  category: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'REOPENED';
  customer: ComplaintCustomer | null;
  assigned_employee: ComplaintEmployee | null;
  resolution_description: string | null;
  created_at: string;
}

interface CustomerSearchResult {
  id: number;
  first_name?: string;
  last_name?: string | null;
  phone?: string;
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
};

const STATUS_STYLES: Record<string, string> = {
  OPEN: 'text-amber-700 bg-amber-50 border-amber-200',
  IN_PROGRESS: 'text-navy-700 bg-navy-50 border-navy-200',
  RESOLVED: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  CLOSED: 'text-slate-600 bg-slate-100 border-slate-200',
  REOPENED: 'text-danger-700 bg-danger-50 border-danger-200',
};

const PRIORITY_STYLES: Record<string, string> = {
  HIGH: 'text-danger-700 bg-danger-50 border-danger-200',
  MEDIUM: 'text-navy-700 bg-navy-100 border-navy-200',
  LOW: 'text-slate-600 bg-slate-100 border-slate-200',
};

const NEXT_STATUS: Record<string, string[]> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED'],
  IN_PROGRESS: ['RESOLVED'],
  RESOLVED: ['CLOSED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['IN_PROGRESS', 'RESOLVED'],
};

export const ComplaintManagement: React.FC = () => {
  const { fetchWithAuth, activeRole } = useAuth();

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPriority, setFormPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [formError, setFormError] = useState<string | null>(null);

  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<CustomerSearchResult[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null);
  const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);

  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [resolutionText, setResolutionText] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  const canCreate = (
    [Roles.MD, Roles.ADMIN, Roles.PROJECT_MANAGER, Roles.AGENT] as string[]
  ).includes(activeRole);
  const canManage = (
    [
      Roles.MD,
      Roles.ADMIN,
      Roles.PROJECT_MANAGER,
      Roles.AGENT,
      Roles.DIGITAL_LEAD_OPERATOR,
    ] as string[]
  ).includes(activeRole);

  const fetchComplaints = async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      // Explicit high limit: the backend previously had no limit at all
      // (now defaults to 2000). Rendered via the shared DataTable, which is
      // already render-capped, so this only needed the fetch-side fix.
      params.set('limit', '100000');
      const res = await fetchWithAuth(`${API_BASE_URL}/complaints?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load complaints');
      const data = await res.json();
      setComplaints(Array.isArray(data) ? data : data.complaints || []);
    } catch (err) {
      console.error(err);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  };

  // fetchWithAuth (from AuthContext) is a plain function, not memoized, so it
  // gets a new reference on every AuthProvider render — depending on it here
  // would re-fire this fetch on renders unrelated to the actual filters.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchComplaints();
  }, [statusFilter, priorityFilter]);

  const searchCustomers = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setCustomerResults([]);
      return;
    }
    setIsSearchingCustomers(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/customers?search=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.customers || [];
        setCustomerResults(list.slice(0, 8));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearchingCustomers(false);
    }
    // fetchWithAuth is intentionally omitted (see note above) — this only
    // depends on the primitive search text, debounced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchCustomers(customerSearch), 300);
    return () => clearTimeout(t);
  }, [customerSearch, searchCustomers]);

  const resetForm = () => {
    setFormTitle('');
    setFormCategory('');
    setFormDescription('');
    setFormPriority('MEDIUM');
    setFormError(null);
    setCustomerSearch('');
    setCustomerResults([]);
    setSelectedCustomer(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) {
      setFormError('Select a customer for this complaint.');
      return;
    }
    setIsSubmitting(true);
    setFormError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/complaints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: selectedCustomer.id,
          title: formTitle,
          category: formCategory || null,
          description: formDescription || null,
          priority: formPriority,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to log complaint');
      setIsCreating(false);
      resetForm();
      fetchComplaints();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to log complaint');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (id: number, status: string) => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/complaints/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update status');
      }
      fetchComplaints();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const handleClose = async (id: number) => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/complaints/${id}/close`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to close complaint');
      }
      fetchComplaints();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to close complaint');
    }
  };

  const openResolve = (id: number) => {
    setResolvingId(id);
    setResolutionText('');
  };

  const submitResolve = async () => {
    if (!resolvingId || !resolutionText.trim()) return;
    setIsResolving(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/complaints/${resolvingId}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution_description: resolutionText }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to resolve complaint');
      }
      setResolvingId(null);
      setResolutionText('');
      fetchComplaints();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to resolve complaint');
    } finally {
      setIsResolving(false);
    }
  };

  const openCount = complaints.filter((c) => c.status === 'OPEN').length;
  const inProgressCount = complaints.filter((c) => c.status === 'IN_PROGRESS').length;
  const resolvedCount = complaints.filter(
    (c) => c.status === 'RESOLVED' || c.status === 'CLOSED',
  ).length;

  const columns: ColumnDef<Complaint>[] = [
    {
      key: 'title',
      header: 'Complaint',
      render: (c) => (
        <div className="space-y-1 max-w-[280px]">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-slate-800 truncate">{c.title}</span>
          </div>
          <div className="text-[11px] font-mono text-slate-400">{c.complaint_code}</div>
          {c.description && <p className="text-xs text-slate-500 line-clamp-1">{c.description}</p>}
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (c) => (
        <div className="text-xs">
          <div className="font-semibold text-slate-700">
            {customerDisplayName(c.customer) || '—'}
          </div>
          {c.customer?.phone && <div className="text-slate-400 font-mono">{c.customer.phone}</div>}
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (c) =>
        c.category ? (
          <span className="text-xs text-slate-600">{c.category}</span>
        ) : (
          <span className="text-xs text-slate-400 italic">Uncategorized</span>
        ),
    },
    {
      key: 'priority',
      header: 'Priority',
      sortable: true,
      render: (c) => (
        <span
          className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-bold border ${PRIORITY_STYLES[c.priority] || PRIORITY_STYLES.MEDIUM}`}
        >
          {c.priority}
        </span>
      ),
    },
    {
      key: 'assigned_employee',
      header: 'Assigned To',
      render: (c) =>
        c.assigned_employee ? (
          <span className="text-xs font-semibold text-slate-700">
            {c.assigned_employee.full_name || c.assigned_employee.employee_code}
          </span>
        ) : (
          <span className="text-xs text-slate-400">Unassigned</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (c) => (
        <span
          className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-bold border ${STATUS_STYLES[c.status] || STATUS_STYLES.OPEN}`}
        >
          {STATUS_LABELS[c.status] || c.status}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Action',
      render: (c) => {
        if (!canManage) return <span className="text-xs text-slate-300">—</span>;
        const nextStates = NEXT_STATUS[c.status] || [];
        return (
          <div className="flex items-center justify-end gap-1.5">
            {nextStates.includes('IN_PROGRESS') && (
              <button
                onClick={() => handleStatusChange(c.id, 'IN_PROGRESS')}
                className="p-1.5 bg-navy-50 hover:bg-navy-100 text-navy-700 rounded-lg transition-colors border border-navy-200"
                title="Start Working"
              >
                <UserCheck className="w-4 h-4" />
              </button>
            )}
            {nextStates.includes('RESOLVED') && (
              <button
                onClick={() => openResolve(c.id)}
                className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors border border-emerald-200"
                title="Mark Resolved"
              >
                <CheckCircle2 className="w-4 h-4" />
              </button>
            )}
            {nextStates.includes('CLOSED') && (
              <button
                onClick={() => handleClose(c.id)}
                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors border border-slate-300"
                title="Close Complaint"
              >
                <Lock className="w-4 h-4" />
              </button>
            )}
            {nextStates.includes('IN_PROGRESS') && c.status === 'REOPENED' && null}
            {c.status === 'CLOSED' && nextStates.includes('REOPENED') && (
              <button
                onClick={() => handleStatusChange(c.id, 'REOPENED')}
                className="p-1.5 bg-danger-50 hover:bg-danger-100 text-danger-700 rounded-lg transition-colors border border-danger-200"
                title="Reopen Complaint"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-navy-900 via-navy-800 to-slate-900 rounded-3xl p-6 text-white shadow-xl flex flex-wrap items-center justify-between gap-4 border border-navy-700/30">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <MessageSquareWarning className="w-5 h-5 text-gold-500" />
            <h2 className="text-xl font-extrabold tracking-tight">Complaints Management</h2>
          </div>
          <p className="text-xs text-navy-200/80">Track and resolve customer issues.</p>
        </div>

        {canCreate && (
          <button
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-gold-600 hover:bg-gold-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>New Complaint</span>
          </button>
        )}
      </div>

      {hasError && (
        <div className="text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-4 py-3 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-danger-600" />
          Unable to load complaints. Please try again later.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
          <div className="text-2xl font-extrabold text-amber-600">{openCount}</div>
          <div className="text-xs font-semibold text-slate-500 mt-0.5">Open</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
          <div className="text-2xl font-extrabold text-navy-700">{inProgressCount}</div>
          <div className="text-xs font-semibold text-slate-500 mt-0.5">In Progress</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
          <div className="text-2xl font-extrabold text-emerald-600">{resolvedCount}</div>
          <div className="text-xs font-semibold text-slate-500 mt-0.5">Resolved / Closed</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 focus:outline-none focus:border-navy-500"
        >
          <option value="">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
          <option value="REOPENED">Reopened</option>
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 focus:outline-none focus:border-navy-500"
        >
          <option value="">All Priorities</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-slate-500">Loading complaints...</div>
      ) : (
        <DataTable
          columns={columns}
          data={complaints}
          searchable
          emptyMessage="No complaints found. Try adjusting your filters or log a new complaint."
        />
      )}

      {isCreating && (
        <div className="fixed inset-0 z-[60] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col">
            <div className="bg-navy-900 p-5 flex items-center justify-between text-white shrink-0">
              <div className="flex items-center gap-2">
                <MessageSquareWarning className="w-5 h-5 text-gold-500" />
                <h3 className="font-bold text-sm tracking-wide">Log New Complaint</h3>
              </div>
              <button
                onClick={() => {
                  setIsCreating(false);
                  resetForm();
                }}
                className="p-1.5 text-slate-300 hover:text-white rounded-full hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4 text-xs overflow-y-auto">
              {formError && (
                <div className="text-xs text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">
                  {formError}
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1.5 uppercase tracking-wider text-[10px]">
                  Customer *
                </label>
                {selectedCustomer ? (
                  <div className="flex items-center justify-between px-3 py-2 bg-navy-50 border border-navy-200 rounded-xl">
                    <span className="text-sm font-semibold text-navy-800">
                      {customerDisplayName(selectedCustomer) || 'Unnamed Customer'}{' '}
                      {selectedCustomer.phone ? `(${selectedCustomer.phone})` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedCustomer(null)}
                      className="text-navy-500 hover:text-navy-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search customer by name or phone..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-surface border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-600 text-sm"
                    />
                    {customerSearch.length >= 2 && (
                      <div className="mt-1 border border-slate-200 rounded-xl overflow-hidden max-h-40 overflow-y-auto bg-white shadow-sm">
                        {isSearchingCustomers ? (
                          <div className="px-3 py-2 text-slate-400 text-xs">Searching...</div>
                        ) : customerResults.length === 0 ? (
                          <div className="px-3 py-2 text-slate-400 text-xs">
                            No customers found.
                          </div>
                        ) : (
                          customerResults.map((cust) => (
                            <button
                              type="button"
                              key={cust.id}
                              onClick={() => {
                                setSelectedCustomer(cust);
                                setCustomerSearch('');
                                setCustomerResults([]);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-slate-50 text-xs border-b border-slate-100 last:border-0"
                            >
                              <span className="font-semibold text-slate-700">
                                {customerDisplayName(cust) || 'Unnamed Customer'}
                              </span>
                              {cust.phone && (
                                <span className="text-slate-400 ml-2 font-mono">{cust.phone}</span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5 uppercase tracking-wider text-[10px]">
                  Complaint Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Delay in property handover"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-600 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5 uppercase tracking-wider text-[10px]">
                    Category
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Documentation"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-surface border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-600 text-sm"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5 uppercase tracking-wider text-[10px]">
                    Priority
                  </label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as 'LOW' | 'MEDIUM' | 'HIGH')}
                    className="w-full px-3 py-2 bg-surface border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-600 text-sm font-semibold text-slate-700"
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5 uppercase tracking-wider text-[10px]">
                  Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Describe the issue reported by the customer..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-600 text-sm"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    resetForm();
                  }}
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
                  <span>{isSubmitting ? 'Logging...' : 'Log Complaint'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resolvingId !== null && (
        <div className="fixed inset-0 z-[60] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-100">
            <div className="bg-emerald-700 p-5 flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                <h3 className="font-bold text-sm tracking-wide">Resolve Complaint</h3>
              </div>
              <button
                onClick={() => setResolvingId(null)}
                className="p-1.5 text-emerald-100 hover:text-white rounded-full hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <label className="block font-bold text-slate-700 mb-1.5 uppercase tracking-wider text-[10px]">
                Resolution Notes *
              </label>
              <textarea
                rows={4}
                required
                placeholder="Describe how this complaint was resolved..."
                value={resolutionText}
                onChange={(e) => setResolutionText(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 text-sm"
              />
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setResolvingId(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={submitResolve}
                  disabled={isResolving || !resolutionText.trim()}
                  className="px-6 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-md transition-all"
                >
                  {isResolving ? 'Saving...' : 'Mark Resolved'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
