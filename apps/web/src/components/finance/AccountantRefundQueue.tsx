/**
 * AccountantRefundQueue.tsx
 *
 * Queue management view for Finance/Accountant and MD roles.
 * Shows pending refund requests with action buttons.
 * - Accountant: sees PENDING + MD_APPROVED queues
 * - MD: sees ACCOUNTANT_APPROVED queue
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle,
  XCircle,
  Eye,
  IndianRupee,
  Loader2,
  Clock,
  BadgeCheck,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';

interface RefundItem {
  id: number;
  employee_id: number;
  purpose: string;
  amount: number;
  status: string;
  proof_image_url: string | null;
  accountant_note: string | null;
  md_note: string | null;
  created_at: string;
  employee: {
    id: number;
    full_name: string | null;
    employee_code: string;
    department: string | null;
  };
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  PENDING: { label: 'Pending Review', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  ACCOUNTANT_APPROVED: {
    label: 'Accountant Approved',
    color: 'text-navy-700',
    bg: 'bg-navy-50 border-navy-200',
  },
  MD_APPROVED: {
    label: 'MD Approved — Pay Now',
    color: 'text-navy-700',
    bg: 'bg-navy-50 border-navy-200',
  },
  REFUNDED: { label: 'Refunded ✓', color: 'text-slate-500', bg: 'bg-slate-50 border-slate-200' },
  REJECTED_BY_ACCOUNTANT: {
    label: 'Rejected',
    color: 'text-red-700',
    bg: 'bg-red-50 border-red-200',
  },
  REJECTED_BY_MD: {
    label: 'Rejected by MD',
    color: 'text-red-700',
    bg: 'bg-red-50 border-red-200',
  },
};

interface Props {
  isMD: boolean;
}

export const AccountantRefundQueue: React.FC<Props> = ({ isMD }) => {
  const { fetchWithAuth } = useAuth();
  const [refunds, setRefunds] = useState<RefundItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<number | null>(null);
  const [noteModal, setNoteModal] = useState<{
    id: number;
    action: 'approve' | 'reject';
    forMD: boolean;
  } | null>(null);
  const [noteText, setNoteText] = useState('');
  // Render-side cap, independent of the fetch: rendering thousands of DOM
  // cards at once freezes the browser regardless of how much data the API
  // returned, now that the fetch itself can return up to 100000. "Load More"
  // reveals more of the already-fetched queue.
  const REFUNDS_PAGE_SIZE = 30;
  const [visibleRefundCount, setVisibleRefundCount] = useState(REFUNDS_PAGE_SIZE);

  const fetchQueue = useCallback(async () => {
    try {
      setLoading(true);
      // Explicit high limit: the backend previously had no limit at all
      // (now defaults to 2000) — refund requests accumulate continuously
      // company-wide with no date filter.
      const res = await fetchWithAuth(`${API_BASE_URL}/expense-refunds/queue?limit=100000`);
      const data = await res.json();
      setRefunds(data.refunds || []);
      setVisibleRefundCount(REFUNDS_PAGE_SIZE);
    } catch {
      // noop
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleAccountantDecision = async (
    id: number,
    decision: 'APPROVE' | 'REJECT',
    note: string,
  ) => {
    setActionId(id);
    try {
      await fetchWithAuth(`${API_BASE_URL}/expense-refunds/${id}/accountant-review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note }),
      });
      fetchQueue();
    } finally {
      setActionId(null);
      setNoteModal(null);
      setNoteText('');
    }
  };

  const handleMDDecision = async (id: number, decision: 'APPROVE' | 'REJECT', note: string) => {
    setActionId(id);
    try {
      await fetchWithAuth(`${API_BASE_URL}/expense-refunds/${id}/md-review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note }),
      });
      fetchQueue();
    } finally {
      setActionId(null);
      setNoteModal(null);
      setNoteText('');
    }
  };

  const handleMarkRefunded = async (id: number) => {
    setActionId(id);
    try {
      await fetchWithAuth(`${API_BASE_URL}/expense-refunds/${id}/mark-refunded`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });
      fetchQueue();
    } finally {
      setActionId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400 gap-3">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading refund queue...</span>
      </div>
    );
  }

  if (refunds.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <BadgeCheck className="w-10 h-10 mx-auto mb-3 opacity-50" />
        <p className="font-semibold text-slate-500">All clear!</p>
        <p className="text-sm mt-1">No refund requests pending your action.</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-700 text-sm">
          {isMD ? 'Awaiting Your Final Approval' : 'Refund Requests Queue'}
          <span className="ml-2 bg-navy-100 text-navy-700 text-xs font-bold px-2 py-0.5 rounded-full">
            {refunds.length}
          </span>
        </h3>
        <button
          onClick={fetchQueue}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-3">
        {refunds.slice(0, visibleRefundCount).map((r) => {
          const statusCfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.PENDING;
          const isWorking = actionId === r.id;
          return (
            <div
              key={r.id}
              className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3"
            >
              {/* Top row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-800 text-sm">
                      {r.employee?.full_name || r.employee?.employee_code}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      {r.employee?.employee_code}
                    </span>
                    {r.employee?.department && (
                      <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                        {r.employee.department}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 mt-1 line-clamp-2">{r.purpose}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-extrabold text-navy-800">
                    ₹{r.amount.toLocaleString('en-IN')}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {new Date(r.created_at).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              </div>

              {/* Status badge */}
              <div
                className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${statusCfg.bg} ${statusCfg.color}`}
              >
                <Clock className="w-3 h-3" />
                {statusCfg.label}
              </div>

              {/* Notes */}
              {r.accountant_note && (
                <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                  <span className="font-semibold">Accountant note:</span> {r.accountant_note}
                </p>
              )}
              {r.md_note && (
                <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                  <span className="font-semibold">MD note:</span> {r.md_note}
                </p>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-1">
                {/* View Proof */}
                {r.proof_image_url && (
                  <a
                    href={`${API_BASE_URL}/expense-refunds/${r.id}/proof`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    View Bill
                  </a>
                )}

                {/* Accountant Actions */}
                {!isMD && r.status === 'PENDING' && (
                  <>
                    <button
                      disabled={isWorking}
                      onClick={() => setNoteModal({ id: r.id, action: 'approve', forMD: false })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-600 text-white text-xs font-bold hover:bg-navy-700 transition-colors disabled:opacity-50"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Approve
                    </button>
                    <button
                      disabled={isWorking}
                      onClick={() => setNoteModal({ id: r.id, action: 'reject', forMD: false })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 text-xs font-bold hover:bg-red-100 transition-colors disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Reject
                    </button>
                  </>
                )}

                {/* Accountant — Mark Refunded (after MD approval) */}
                {!isMD && r.status === 'MD_APPROVED' && (
                  <button
                    disabled={isWorking}
                    onClick={() => handleMarkRefunded(r.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-600 text-white text-xs font-bold hover:bg-navy-700 transition-colors disabled:opacity-50"
                  >
                    {isWorking ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <IndianRupee className="w-3.5 h-3.5" />
                    )}
                    Mark as Refunded
                  </button>
                )}

                {/* MD Actions */}
                {isMD && r.status === 'ACCOUNTANT_APPROVED' && (
                  <>
                    <button
                      disabled={isWorking}
                      onClick={() => setNoteModal({ id: r.id, action: 'approve', forMD: true })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-600 text-white text-xs font-bold hover:bg-navy-700 transition-colors disabled:opacity-50"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Final Approve
                    </button>
                    <button
                      disabled={isWorking}
                      onClick={() => setNoteModal({ id: r.id, action: 'reject', forMD: true })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 text-xs font-bold hover:bg-red-100 transition-colors disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {refunds.length > visibleRefundCount && (
        <button
          onClick={() => setVisibleRefundCount((c) => c + REFUNDS_PAGE_SIZE)}
          className="w-full mt-3 py-3 rounded-2xl border border-slate-200 bg-white text-navy-700 font-bold text-sm hover:bg-slate-50 transition-colors"
        >
          Load More ({refunds.length - visibleRefundCount} remaining)
        </button>
      )}

      {/* Note Modal */}
      {noteModal && (
        <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              {noteModal.action === 'approve' ? (
                <CheckCircle className="w-6 h-6 text-navy-600" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-red-500" />
              )}
              <h3 className="font-bold text-slate-800">
                {noteModal.action === 'approve'
                  ? 'Approve Refund Request'
                  : 'Reject Refund Request'}
              </h3>
            </div>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={3}
              placeholder={
                noteModal.action === 'reject'
                  ? 'Reason for rejection (required)...'
                  : 'Add a note (optional)...'
              }
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-navy-500"
            />
            {noteModal.action === 'reject' && !noteText.trim() && (
              <p className="text-xs text-red-500">Please provide a reason for rejection.</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setNoteModal(null);
                  setNoteText('');
                }}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={noteModal.action === 'reject' && !noteText.trim()}
                onClick={() => {
                  const decision = noteModal.action === 'approve' ? 'APPROVE' : 'REJECT';
                  if (noteModal.forMD) {
                    handleMDDecision(noteModal.id, decision, noteText);
                  } else {
                    handleAccountantDecision(noteModal.id, decision, noteText);
                  }
                }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 ${
                  noteModal.action === 'approve'
                    ? 'bg-navy-700 text-white hover:bg-navy-800'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                Confirm {noteModal.action === 'approve' ? 'Approval' : 'Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
