import React, { useState, useEffect } from 'react';
import { ShieldAlert, Clock, Calendar, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import { ProposalItem } from '../../types';

export const ApprovalsDashboard: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const [queue, setQueue] = useState<ProposalItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchQueue();
  }, []);

  const fetchQueue = async () => {
    setIsLoading(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/attendance/proposals/queue`);
      const data = await res.json();
      if (res.ok) {
        setQueue(data.proposals || []);
      }
    } catch (e) {
      console.error('Failed to load proposal queue');
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

  const leaves = queue.filter((q) => q.type === 'LEAVE');
  const lates = queue.filter((q) => q.type === 'LATE_CHECKIN');
  const earlys = queue.filter((q) => q.type === 'EARLY_CHECKOUT');

  const leaveTypeLabel = (leaveType?: string | null) => {
    if (leaveType === 'FIRST_HALF') return '1st Half';
    if (leaveType === 'SECOND_HALF') return '2nd Half';
    return 'Full Day';
  };

  const renderQueueSection = (
    title: string,
    items: ProposalItem[],
    icon: React.ReactNode,
    emptyMsg: string,
  ) => (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          {icon}
          {title} ({items.length})
        </h3>
      </div>
      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">{emptyMsg}</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((item) => (
              <div key={item.id} className="py-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 text-sm">
                      {item.employee?.full_name || 'Unknown Employee'} (
                      {item.employee?.employee_code || '---'})
                    </span>
                    <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md font-mono">
                      Target: {new Date(item.target_date).toLocaleDateString()}
                    </span>
                    {item.type === 'LEAVE' && (
                      <span className="text-xs bg-navy-50 text-navy-700 border border-navy-200 px-2 py-0.5 rounded-md font-semibold">
                        {leaveTypeLabel(item.leave_type)}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-600 mt-2 text-sm font-medium">"{item.reason}"</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAction(item.id, 'approve')}
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors text-sm font-medium"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Approve
                  </button>
                  <button
                    onClick={() => handleAction(item.id, 'reject')}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  if (isLoading) {
    return <div className="p-8 text-center text-slate-500">Loading approvals...</div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6">
      <div className="bg-gradient-to-r from-navy-900 via-navy-800 to-slate-900 rounded-3xl p-6 text-white shadow-xl border border-navy-700/30">
        <div className="flex items-center gap-3 mb-2">
          <ShieldAlert className="w-6 h-6 text-gold-500" />
          <h1 className="text-2xl font-extrabold tracking-tight">HR Approvals</h1>
        </div>
        <p className="text-sm text-navy-200/80 max-w-2xl">
          Review and process pending employee requests for leaves, late arrivals, and early
          checkouts.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {renderQueueSection(
          'Leave Requests',
          leaves,
          <Calendar className="w-5 h-5 text-navy-500" />,
          'No pending leave requests.',
        )}
        {renderQueueSection(
          'Late Arrivals',
          lates,
          <Clock className="w-5 h-5 text-amber-500" />,
          'No pending late arrival requests.',
        )}
        {renderQueueSection(
          'Early Checkouts',
          earlys,
          <Clock className="w-5 h-5 text-emerald-500" />,
          'No pending early checkout requests.',
        )}
      </div>
    </div>
  );
};
