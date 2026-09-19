import React, { useState, useEffect } from 'react';
import { Clock, Calendar, Send, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import { Roles } from '../../shared';
import { ProposalItem } from '../../types';

interface LateLeaveProposalsProps {
  hrViewOnly?: boolean;
}

export const LateLeaveProposals: React.FC<LateLeaveProposalsProps> = ({ hrViewOnly = false }) => {
  const { user, fetchWithAuth, activeRole } = useAuth();
  const [activeTab, setActiveTab] = useState<'submit' | 'queue'>(hrViewOnly ? 'queue' : 'submit');
  const [proposalType, setProposalType] = useState<'late' | 'leave' | 'field_work'>('late');

  // Form states
  const [date, setDate] = useState('');
  const [expectedTime, setExpectedTime] = useState('11:00');
  const [reason, setReason] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [leaveType, setLeaveType] = useState('FULL_DAY');

  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [queue, setQueue] = useState<ProposalItem[]>([]);

  const isHrOrMd = ([Roles.HR_MANAGER, Roles.MD] as string[]).includes(activeRole);

  useEffect(() => {
    if (isHrOrMd && activeTab === 'queue') {
      fetchQueue();
    }
  }, [activeTab, isHrOrMd]);

  const fetchQueue = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/attendance/proposals/queue`);
      const data = await res.json();
      if (res.ok) {
        setQueue(data.proposals || []);
      }
    } catch (e) {
      console.error('Failed to load proposal queue');
    }
  };

  const handleSubmitLate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setIsLoading(true);

    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/attendance/late-proposal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: date || new Date().toISOString().split('T')[0],
          expected_time: expectedTime,
          reason,
        }),
      });

      if (res.ok) {
        setMessage({ type: 'success', text: 'Late request submitted to HR.' });
        setReason('');
      } else {
        const err = await res.json();
        setMessage({ type: 'error', text: err.error || 'Failed to submit.' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'An unexpected error occurred.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async (id: number, action: 'approve' | 'reject') => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/attendance/proposals/${id}/${action}`, {
        method: 'POST',
      });
      if (res.ok) {
        fetchQueue();
      } else {
        alert('Failed to update proposal');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setIsLoading(true);

    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/attendance/leave-proposal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_date: startDate,
          end_date: endDate || null,
          leave_type: leaveType,
          reason,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit leave proposal');
      }

      setMessage({ type: 'success', text: 'Leave proposal submitted to HR queue!' });
      setReason('');
      setStartDate('');
      setEndDate('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setMessage({ type: 'error', text: message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitFieldWork = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setIsLoading(true);

    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/attendance/field-work-proposal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: date || new Date().toISOString().split('T')[0],
          reason,
        }),
      });

      if (res.ok) {
        setMessage({ type: 'success', text: 'Field work request submitted to HR.' });
        setReason('');
      } else {
        const err = await res.json();
        setMessage({ type: 'error', text: err.error || 'Failed to submit.' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'An unexpected error occurred.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      {/* Header Tabs */}
      {!hrViewOnly && (
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Attendance Proposals</h3>
            <p className="text-xs text-slate-500">Submit late arrival requests or view HR queue</p>
          </div>

          {isHrOrMd && (
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
              <button
                onClick={() => setActiveTab('submit')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === 'submit' ? 'bg-white text-navy-800 shadow-sm' : 'text-slate-600'
                }`}
              >
                Submit Request
              </button>
              <button
                onClick={() => setActiveTab('queue')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === 'queue' ? 'bg-white text-navy-800 shadow-sm' : 'text-slate-600'
                }`}
              >
                HR Queue
              </button>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      {message && (
        <div
          className={`p-4 rounded-xl mb-6 text-sm flex flex-col items-center justify-center text-center border ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}
        >
          {message.type === 'success' ? (
            <span className="text-2xl mb-2">🎉</span>
          ) : (
            <span className="text-2xl mb-2">⚠️</span>
          )}
          {message.text}
        </div>
      )}

      {activeTab === 'submit' && !hrViewOnly ? (
        <div>
          {/* Proposal Type Toggle */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <button
              type="button"
              onClick={() => setProposalType('late')}
              className={`p-3 rounded-xl border text-left transition-all ${
                proposalType === 'late'
                  ? 'border-navy-600 bg-navy-50/50 text-navy-900 font-bold'
                  : 'border-slate-200 text-slate-600'
              }`}
            >
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-navy-700" />
                <span>Late Arrival</span>
              </div>
              <p className="text-[11px] text-slate-500 font-normal mt-1">Before 09:30 AM</p>
            </button>

            <button
              type="button"
              onClick={() => setProposalType('leave')}
              className={`p-3 rounded-xl border text-left transition-all ${
                proposalType === 'leave'
                  ? 'border-navy-600 bg-navy-50/50 text-navy-900 font-bold'
                  : 'border-slate-200 text-slate-600'
              }`}
            >
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-navy-700" />
                <span>Leave</span>
              </div>
              <p className="text-[11px] text-slate-500 font-normal mt-1">≥ 1 day advance</p>
            </button>

            <button
              type="button"
              onClick={() => setProposalType('field_work')}
              className={`p-3 rounded-xl border text-left transition-all ${
                proposalType === 'field_work'
                  ? 'border-navy-600 bg-navy-50/50 text-navy-900 font-bold'
                  : 'border-slate-200 text-slate-600'
              }`}
            >
              <div className="flex items-center gap-2 text-sm">
                <Send className="w-4 h-4 text-navy-700" />
                <span>Field Work</span>
              </div>
              <p className="text-[11px] text-slate-500 font-normal mt-1">Client visits/Meetings</p>
            </button>
          </div>

          {/* Form */}
          {proposalType === 'late' ? (
            <form onSubmit={handleSubmitLate} className="space-y-4 max-w-lg">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full p-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Expected Arrival Time
                  </label>
                  <input
                    type="time"
                    value={expectedTime}
                    onChange={(e) => setExpectedTime(e.target.value)}
                    required
                    className="w-full p-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason for Late Arrival
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  rows={3}
                  placeholder="e.g. Doctor appointment, traffic delay..."
                  className="w-full p-3 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="px-5 py-2.5 bg-navy-700 hover:bg-navy-800 text-white font-medium rounded-xl text-sm transition-all flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>Submit Late Request</span>
              </button>
            </form>
          ) : proposalType === 'leave' ? (
            <form onSubmit={handleSubmitLeave} className="space-y-4 max-w-lg">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                    className="w-full p-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    End Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full p-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Leave Type
                </label>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setLeaveType('FULL_DAY')}
                    className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                      leaveType === 'FULL_DAY'
                        ? 'bg-white shadow-sm text-navy-800'
                        : 'text-slate-500'
                    }`}
                  >
                    Full Day
                  </button>
                  <button
                    type="button"
                    onClick={() => setLeaveType('FIRST_HALF')}
                    className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                      leaveType === 'FIRST_HALF'
                        ? 'bg-white shadow-sm text-navy-800'
                        : 'text-slate-500'
                    }`}
                  >
                    1st Half
                  </button>
                  <button
                    type="button"
                    onClick={() => setLeaveType('SECOND_HALF')}
                    className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                      leaveType === 'SECOND_HALF'
                        ? 'bg-white shadow-sm text-navy-800'
                        : 'text-slate-500'
                    }`}
                  >
                    2nd Half
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason for Leave
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  rows={3}
                  placeholder="e.g. Vacation, sick leave..."
                  className="w-full p-3 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              {startDate && new Date(startDate) <= new Date(new Date().setHours(0, 0, 0, 0)) && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Leave requests must be submitted at least 1 day in advance.</span>
                </div>
              )}

              <button
                type="submit"
                disabled={
                  isLoading ||
                  (!!startDate && new Date(startDate) <= new Date(new Date().setHours(0, 0, 0, 0)))
                }
                className="px-5 py-2.5 bg-navy-700 hover:bg-navy-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-xl text-sm transition-all flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>Submit Leave Request</span>
              </button>
            </form>
          ) : proposalType === 'field_work' ? (
            <form onSubmit={handleSubmitFieldWork} className="space-y-4 max-w-lg">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className="w-full p-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason & Location
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  rows={3}
                  placeholder="e.g. Field visit at XYZ site..."
                  className="w-full p-3 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="px-5 py-2.5 bg-navy-700 hover:bg-navy-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-xl text-sm transition-all flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>Submit Field Work Request</span>
              </button>
            </form>
          ) : null}
        </div>
      ) : (
        /* HR Queue View */
        <div className="space-y-3">
          <h4 className="text-sm font-bold text-slate-700">
            Pending Requests Queue ({queue.length})
          </h4>
          {queue.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">
              No pending late or leave proposals.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {queue.map((item) => (
                <div key={item.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-800">
                      {item.employee?.full_name || 'Unknown Employee'} (
                      {item.employee?.employee_code || '---'})
                    </span>
                    <span className="ml-2 text-slate-500 font-mono">
                      {item.type}
                      {item.type === 'LEAVE' && item.leave_type && item.leave_type !== 'FULL_DAY'
                        ? ` (${item.leave_type === 'FIRST_HALF' ? '1st Half' : '2nd Half'})`
                        : ''}{' '}
                      {item.target_date
                        ? new Date(item.target_date).toLocaleDateString('en-IN')
                        : ''}
                    </span>
                    <p className="text-slate-600 mt-0.5 font-medium">{item.reason}</p>
                    {item.monthlyStats && (
                      <p className="mt-1 text-[10px] text-slate-400">
                        This month — Lates: {item.monthlyStats.lates} (
                        {item.monthlyStats.approvedLates} appr.) · Half Days:{' '}
                        {item.monthlyStats.halfDays} ({item.monthlyStats.approvedHalfDays} appr.) ·
                        Leaves: {item.monthlyStats.leaves} ({item.monthlyStats.approvedLeaves}{' '}
                        appr.)
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAction(item.id, 'approve')}
                      className="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg hover:bg-emerald-200 font-medium transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleAction(item.id, 'reject')}
                      className="p-1.5 bg-red-100 text-red-800 rounded-lg hover:bg-red-200 font-medium transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
