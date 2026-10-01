import React, { useEffect, useState, useCallback } from 'react';
import { API_BASE_URL } from '../../config';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Clock,
  AlertCircle,
  X,
  History,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { StatusPill } from '../ui/StatusPill';
import { attendanceStatusToPillType } from '../../utils/attendanceStatus';
import { toUserFacingError, handleApiError } from '../../utils/userFacingError';
import { EmployeeListItem } from '../../types';

interface AttendanceLog {
  id: number;
  check_in_at: string;
  check_out_at: string | null;
  working_duration_minutes: number | null;
  status: string;
  source: string;
  /** Last manual change, from the audit trail (null = never touched by hand). */
  edited_by?: {
    name: string;
    at: string;
    created_manually: boolean;
    edit_count: number;
  } | null;
  notes: string | null;
  employee: {
    id?: number;
    full_name: string;
    employee_code: string;
  };
}

interface AuditLogEntry {
  id: number;
  action: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

const STATUS_OPTIONS = [
  'PRESENT',
  'LATE',
  'APPROVED_LATE',
  'HALF_DAY',
  'APPROVED_HALF_DAY',
  'ABSENT',
  'LEAVE',
];

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in LOCAL time, with
// no timezone suffix — feeding it a raw ISO string (which toISOString()
// always renders in UTC) silently shows the wrong clock time to the user.
function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDuration(minutes: number | null): string {
  if (minutes === null) return '—';
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

interface RecordFormState {
  employee_id: string;
  check_in_at: string;
  check_out_at: string;
  status: string;
  notes: string;
}

const emptyForm: RecordFormState = {
  employee_id: '',
  check_in_at: '',
  check_out_at: '',
  status: 'PRESENT',
  notes: '',
};

export const AttendanceManagement: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();

  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 20;

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingLog, setEditingLog] = useState<AttendanceLog | null>(null);
  const [form, setForm] = useState<RecordFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [history, setHistory] = useState<AuditLogEntry[] | null>(null);
  const [employeeFilter, setEmployeeFilter] = useState('');

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const query = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) query.append('search', search);
      if (status) query.append('status', status);
      if (date) {
        query.append('startDate', date);
        query.append('endDate', date);
      }
      const res = await fetchWithAuth(
        `${API_BASE_URL}/admin/attendance/search?${query.toString()}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load attendance records');
      setLogs(data.logs || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
    // fetchWithAuth is a fresh function reference every render (see
    // AttendanceHistoryLog's identical note) — depending on it here would
    // re-fire this on unrelated renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, status, date]);

  useEffect(() => {
    const timer = setTimeout(fetchLogs, 300);
    return () => clearTimeout(timer);
  }, [fetchLogs]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithAuth(`${API_BASE_URL}/employees?limit=1000`);
        const data = await res.json();
        if (res.ok) setEmployees(data.employees || []);
      } catch {
        // Non-fatal — the Add modal's employee picker just stays empty; the
        // rest of the page (search/edit/delete) doesn't need this list.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAddModal = () => {
    setForm(emptyForm);
    setEmployeeFilter('');
    setShowAddModal(true);
  };

  const openEditModal = (log: AttendanceLog) => {
    setEditingLog(log);
    setHistory(null);
    setForm({
      employee_id: String(log.employee.id ?? ''),
      check_in_at: toDatetimeLocal(log.check_in_at),
      check_out_at: toDatetimeLocal(log.check_out_at),
      status: log.status,
      notes: log.notes || '',
    });
  };

  const closeModals = () => {
    setShowAddModal(false);
    setEditingLog(null);
    setHistory(null);
  };

  const loadHistory = async (logId: number) => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/admin/attendance/${logId}/log`);
      const data = await res.json();
      if (res.ok) setHistory(data.auditLogs || []);
    } catch {
      // History is supplementary — the edit form itself still works without it.
    }
  };

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employee_id || !form.check_in_at || !form.notes.trim()) return;
    setSaving(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/admin/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: Number(form.employee_id),
          check_in_at: new Date(form.check_in_at).toISOString(),
          check_out_at: form.check_out_at ? new Date(form.check_out_at).toISOString() : undefined,
          status: form.status,
          notes: form.notes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        await handleApiError(res, showError, data);
        return;
      }
      showToast(data.message, 'success');
      closeModals();
      fetchLogs();
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    } finally {
      setSaving(false);
    }
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLog) return;
    setSaving(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/admin/attendance/${editingLog.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: form.status,
          check_in_at: new Date(form.check_in_at).toISOString(),
          check_out_at: form.check_out_at ? new Date(form.check_out_at).toISOString() : null,
          notes: form.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        await handleApiError(res, showError, data);
        return;
      }
      showToast(data.message, 'success');
      closeModals();
      fetchLogs();
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    setSaving(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/admin/attendance/${confirmDeleteId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        await handleApiError(res, showError, data);
        return;
      }
      showToast(data.message, 'success');
      setConfirmDeleteId(null);
      closeModals();
      fetchLogs();
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    } finally {
      setSaving(false);
    }
  };

  const filteredEmployees = employees.filter((e) => {
    const name = e.full_name || e.fullName || '';
    const code = e.employee_code || e.employeeCode || '';
    const q = employeeFilter.toLowerCase();
    return name.toLowerCase().includes(q) || code.toLowerCase().includes(q);
  });

  const renderForm = (mode: 'add' | 'edit') => (
    <form onSubmit={mode === 'add' ? submitAdd : submitEdit} className="space-y-4">
      {mode === 'add' ? (
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
            Employee
          </label>
          <input
            type="text"
            placeholder="Search by name or code..."
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
            className="w-full mb-2 px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-navy-500 outline-none"
          />
          <select
            required
            value={form.employee_id}
            onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-navy-500 outline-none"
          >
            <option value="" className="text-slate-800 bg-white">
              -- Select employee --
            </option>
            {filteredEmployees.map((emp) => (
              <option key={emp.id} value={emp.id} className="text-slate-800 bg-white">
                {emp.full_name || emp.fullName} ({emp.employee_code || emp.employeeCode})
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
          <p className="font-bold text-slate-800">{editingLog?.employee.full_name}</p>
          <p className="text-xs text-slate-500 font-mono">{editingLog?.employee.employee_code}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
            Check-In
          </label>
          <input
            type="datetime-local"
            required
            value={form.check_in_at}
            onChange={(e) => setForm((f) => ({ ...f, check_in_at: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-navy-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
            Check-Out <span className="text-slate-400 normal-case font-normal">(optional)</span>
          </label>
          <input
            type="datetime-local"
            value={form.check_out_at}
            onChange={(e) => setForm((f) => ({ ...f, check_out_at: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-navy-500 outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
          Status
        </label>
        <select
          required
          value={form.status}
          onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-navy-500 outline-none"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
          {mode === 'add' ? 'Reason for manual entry' : 'Notes'}
        </label>
        <textarea
          required={mode === 'add'}
          rows={2}
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder={
            mode === 'add'
              ? 'e.g. Kiosk was offline at the branch this morning'
              : 'Optional notes...'
          }
          className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-navy-500 outline-none resize-none"
        />
      </div>

      {mode === 'edit' && editingLog && (
        <div>
          <button
            type="button"
            onClick={() => (history ? setHistory(null) : loadHistory(editingLog.id))}
            className="flex items-center gap-1.5 text-xs font-semibold text-navy-600 hover:text-navy-800"
          >
            <History className="w-3.5 h-3.5" />
            {history ? 'Hide change history' : 'View change history'}
          </button>
          {history && (
            <div className="mt-2 max-h-40 overflow-y-auto space-y-2 border border-slate-200 rounded-xl p-3 bg-slate-50">
              {history.length === 0 ? (
                <p className="text-xs text-slate-400">No changes recorded yet.</p>
              ) : (
                history.map((h) => (
                  <div
                    key={h.id}
                    className="text-xs text-slate-600 border-b border-slate-200 pb-1.5 last:border-0"
                  >
                    <span className="font-semibold text-slate-700">
                      {h.action.replace(/_/g, ' ')}
                    </span>
                    {' — '}
                    {new Date(h.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 bg-navy-900 hover:bg-navy-800 text-white font-bold text-sm py-2.5 rounded-xl transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : mode === 'add' ? 'Create Record' : 'Save Changes'}
        </button>
        {mode === 'edit' && editingLog?.source === 'MANUAL' && (
          <button
            type="button"
            onClick={() => setConfirmDeleteId(editingLog.id)}
            disabled={saving}
            className="px-4 py-2.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
            title="Delete this manual record"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </form>
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="p-4 sm:p-6 border-b border-slate-200 bg-slate-50 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-800 text-lg">Manage Attendance Records</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Add a record by hand when the kiosk is down, or correct a status/timing mistake.
              </p>
            </div>
            <button
              onClick={openAddModal}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-navy-900 hover:bg-navy-800 text-white font-bold text-sm rounded-xl transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
              Add Manual Record
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search employee name or code..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
              />
            </div>
            <div className="flex gap-3 flex-1 sm:flex-none">
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 text-slate-600"
              />
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 text-slate-600"
              >
                <option value="">All Statuses</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {isLoading && logs.length === 0 ? (
            <div className="flex justify-center items-center h-48 text-slate-500 animate-pulse">
              Loading records...
            </div>
          ) : error ? (
            <div className="m-6 p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-center gap-3">
              <AlertCircle className="w-5 h-5" />
              {error}
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400 space-y-2">
              <Clock className="w-10 h-10 opacity-50" />
              <p>No attendance records found for this filter.</p>
            </div>
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-semibold">Employee</th>
                  <th className="px-6 py-3 font-semibold">Date & Check-In</th>
                  <th className="px-6 py-3 font-semibold">Check-Out</th>
                  <th className="px-6 py-3 font-semibold">Duration</th>
                  <th className="px-6 py-3 font-semibold">Status</th>
                  <th className="px-6 py-3 font-semibold">Source</th>
                  <th className="px-6 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => {
                  const inTime = new Date(log.check_in_at);
                  const outTime = log.check_out_at ? new Date(log.check_out_at) : null;
                  return (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3">
                        <div className="font-bold text-slate-800">{log.employee.full_name}</div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">
                          {log.employee.employee_code}
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <div className="text-slate-700">
                          {inTime.toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {inTime.toLocaleTimeString('en-IN', {
                            timeZone: 'Asia/Kolkata',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        {outTime ? (
                          <div className="text-slate-700 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {outTime.toLocaleTimeString('en-IN', {
                              timeZone: 'Asia/Kolkata',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        ) : (
                          <span className="text-xs font-semibold px-2 py-1 bg-navy-50 text-navy-600 rounded-md border border-navy-100">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3 font-semibold text-slate-700">
                        {formatDuration(log.working_duration_minutes)}
                      </td>
                      <td className="px-6 py-3">
                        <StatusPill
                          status={log.status.replace(/_/g, ' ')}
                          type={attendanceStatusToPillType(log.status)}
                          bordered
                        />
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-md border ${
                            log.source === 'MANUAL'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : log.source === 'QR_SCAN_EDITED' || log.edited_by
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : log.source === 'PROPOSAL'
                                  ? 'bg-sky-50 text-sky-700 border-sky-200'
                                  : 'bg-slate-50 text-slate-500 border-slate-200'
                          }`}
                        >
                          {log.source === 'QR_SCAN_EDITED'
                            ? 'Scan · edited'
                            : log.source === 'PROPOSAL'
                              ? 'From approved request'
                              : log.source === 'QR_SCAN' && log.edited_by
                                ? 'Scan · edited'
                                : log.source.replace(/_/g, ' ')}
                        </span>
                        {/* Who changed it by hand -- so an edit can never pass
                            for a genuine scan, and a shared login stands out. */}
                        {log.edited_by && (
                          <div
                            className="text-[10px] text-slate-500 mt-1 leading-tight"
                            title={new Date(log.edited_by.at).toLocaleString('en-IN')}
                          >
                            {log.edited_by.created_manually ? 'Added' : 'Edited'} by{' '}
                            <span className="font-bold text-slate-700">{log.edited_by.name}</span>
                            {log.edited_by.edit_count > 1 && ` (${log.edited_by.edit_count}×)`}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <button
                          onClick={() => openEditModal(log)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-navy-700 hover:bg-navy-50 transition-colors"
                          title="Edit record"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <p className="text-xs text-slate-500 font-medium">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-slate-300 bg-white text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-slate-300 bg-white text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {(showAddModal || editingLog) && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold text-slate-900">
                {showAddModal ? 'Add Manual Attendance Record' : 'Edit Attendance Record'}
              </h3>
              <button onClick={closeModals} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">{renderForm(showAddModal ? 'add' : 'edit')}</div>
          </div>
        </div>
      )}

      {confirmDeleteId !== null && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-6 space-y-3">
              <h3 className="text-lg font-bold text-slate-900">Delete this record?</h3>
              <p className="text-sm text-slate-600">
                This permanently removes the manually-entered attendance record. This can't be
                undone.
              </p>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button
                onClick={() => setConfirmDeleteId(null)}
                disabled={saving}
                className="flex-1 bg-white text-slate-700 font-bold py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={saving}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl transition-colors disabled:opacity-50"
              >
                {saving ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
