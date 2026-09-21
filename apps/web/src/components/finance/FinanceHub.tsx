/**
 * FinanceHub.tsx
 *
 * Main Finance page at /finance.
 * Role-based view:
 *  - Any employee: their own refund submissions + "New Request" button
 *  - Finance/Accountant: also sees the accountant queue tab
 *  - MD: also sees the MD approval tab
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  IndianRupee,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Bell,
  BellOff,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import { Permissions } from '../../shared';
import { ExpenseRefundForm } from './ExpenseRefundForm';
import { AccountantRefundQueue } from './AccountantRefundQueue';
import { usePushNotifications } from '../../hooks/usePushNotifications';

interface RefundItem {
  id: number;
  purpose: string;
  amount: number;
  status: string;
  accountant_note: string | null;
  md_note: string | null;
  created_at: string;
  refunded_at: string | null;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; color: string; bg: string }
> = {
  PENDING: {
    label: 'Pending Review',
    icon: <Clock className="w-3.5 h-3.5" />,
    color: 'text-amber-700',
    bg: 'bg-amber-50 border-amber-200',
  },
  ACCOUNTANT_APPROVED: {
    label: 'Verified by Accountant',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    color: 'text-navy-700',
    bg: 'bg-navy-50 border-navy-200',
  },
  MD_APPROVED: {
    label: 'MD Approved',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    color: 'text-navy-700',
    bg: 'bg-navy-50 border-navy-200',
  },
  REFUNDED: {
    label: 'Refunded ✓',
    icon: <IndianRupee className="w-3.5 h-3.5" />,
    color: 'text-slate-600',
    bg: 'bg-slate-50 border-slate-200',
  },
  REJECTED_BY_ACCOUNTANT: {
    label: 'Rejected',
    icon: <XCircle className="w-3.5 h-3.5" />,
    color: 'text-red-700',
    bg: 'bg-red-50 border-red-200',
  },
  REJECTED_BY_MD: {
    label: 'Rejected by MD',
    icon: <XCircle className="w-3.5 h-3.5" />,
    color: 'text-red-700',
    bg: 'bg-red-50 border-red-200',
  },
};

export const FinanceHub: React.FC = () => {
  const { user, fetchWithAuth } = useAuth();
  const [myRefunds, setMyRefunds] = useState<RefundItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'my' | 'queue'>('my');
  const { isSupported, permission, isSubscribing, subscribe } = usePushNotifications();

  // Permission-based queue access (canonical values; backend enforces EXPENSES_*)
  const canReviewQueue = user?.permissions?.includes(Permissions.EXPENSES_REVIEW) ?? false;
  const canMdApprove = user?.permissions?.includes(Permissions.EXPENSES_MD_APPROVE) ?? false;
  const canCreateRequest = user?.permissions?.includes(Permissions.EXPENSES_CREATE) ?? false;
  const hasQueueAccess = canReviewQueue || canMdApprove;

  const fetchMyRefunds = useCallback(async () => {
    try {
      setLoading(true);
      setFetchFailed(false);
      // Explicit high limit: the backend previously had no limit at all
      // (now defaults to 2000). Scoped to one employee so lower risk than
      // the accountant queue, but the same unguarded pattern.
      const res = await fetchWithAuth(`${API_BASE_URL}/expense-refunds/my?limit=100000`);
      const data = await res.json();
      if (res.ok) {
        setMyRefunds(data.refunds || []);
      } else {
        setFetchFailed(true);
      }
    } catch {
      setFetchFailed(true);
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth]);

  useEffect(() => {
    fetchMyRefunds();
  }, [fetchMyRefunds]);

  const totalPending = myRefunds.filter((r) =>
    ['PENDING', 'ACCOUNTANT_APPROVED', 'MD_APPROVED'].includes(r.status),
  ).length;
  const totalRefunded = myRefunds
    .filter((r) => r.status === 'REFUNDED')
    .reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="space-y-6 pb-24 md:pb-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-navy-900 via-navy-800 to-slate-900 rounded-3xl p-6 text-white shadow-xl flex flex-wrap items-center justify-between gap-4 border border-navy-700/30">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <IndianRupee className="w-5 h-5 text-gold-500" />
            <h1 className="text-xl font-extrabold tracking-tight">Finance & Expense Refunds</h1>
          </div>
          <p className="text-xs text-navy-200/80">
            Submit and track your petty cash reimbursements and expenses.
          </p>
        </div>
        {canCreateRequest && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gold-500 text-navy-900 rounded-xl text-sm font-bold hover:bg-gold-400 transition-colors shadow-md"
          >
            <Plus className="w-4 h-4" />
            New Request
          </button>
        )}
      </div>

      {/* Push Notification Banner */}
      {isSupported && permission === 'default' && (
        <div className="bg-gradient-to-r from-navy-50 to-navy-50 border border-navy-200 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-navy-100 flex items-center justify-center shrink-0">
            <Bell className="w-5 h-5 text-navy-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-800 text-sm">Enable Push Notifications</p>
            <p className="text-xs text-slate-500">
              Get instant alerts when your refund status changes and when HR updates your profile.
            </p>
          </div>
          <button
            onClick={subscribe}
            disabled={isSubscribing}
            className="shrink-0 px-3 py-2 bg-navy-600 text-white text-xs font-bold rounded-xl hover:bg-navy-700 transition-colors disabled:opacity-50"
          >
            {isSubscribing ? 'Enabling...' : 'Enable'}
          </button>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Total Requests
          </p>
          <p className="text-2xl font-extrabold text-slate-800 mt-1">{myRefunds.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            In Progress
          </p>
          <p className="text-2xl font-extrabold text-amber-600 mt-1">{totalPending}</p>
        </div>
        <div className="bg-white rounded-xl border border-navy-100 p-4 shadow-sm bg-gradient-to-br from-navy-50 to-white col-span-2 sm:col-span-1">
          <p className="text-[11px] font-bold text-navy-600 uppercase tracking-wider">
            Total Refunded
          </p>
          <p className="text-2xl font-extrabold text-navy-800 mt-1">
            ₹{totalRefunded.toLocaleString('en-IN')}
          </p>
        </div>
      </div>

      {/* Tabs (only shown if user has queue access) */}
      {hasQueueAccess && (
        <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
          <button
            onClick={() => setActiveTab('my')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'my'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            My Submissions
          </button>
          <button
            onClick={() => setActiveTab('queue')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'queue'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {canMdApprove ? 'Approval Queue' : 'Review Queue'}
          </button>
        </div>
      )}

      {/* My Submissions Tab */}
      {activeTab === 'my' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-700 text-sm">My Refund Requests</h3>
            <button
              onClick={fetchMyRefunds}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12 text-slate-400 text-sm">Loading your requests...</div>
          ) : fetchFailed ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-amber-200">
              <XCircle className="w-10 h-10 mx-auto mb-3 text-amber-400" />
              <p className="font-semibold text-slate-600">Unable to load your refund requests</p>
              <p className="text-xs text-slate-400 mt-1">
                You may not have access to expense submissions yet. Contact your administrator if
                this seems wrong.
              </p>
            </div>
          ) : myRefunds.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
              <IndianRupee className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="font-semibold text-slate-500">No refund requests yet</p>
              <p className="text-xs text-slate-400 mt-1">
                Click "New Request" to submit an expense for reimbursement.
              </p>
            </div>
          ) : (
            myRefunds.map((r) => {
              const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.PENDING;
              return (
                <div
                  key={r.id}
                  className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-slate-700 font-medium">{r.purpose}</p>
                    </div>
                    <p className="shrink-0 font-extrabold text-navy-800 text-base">
                      ₹{r.amount.toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.color}`}
                    >
                      {cfg.icon}
                      {cfg.label}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {new Date(r.created_at).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                  {(r.accountant_note || r.md_note) && (
                    <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                      {r.md_note || r.accountant_note}
                    </p>
                  )}
                  {r.refunded_at && (
                    <p className="text-xs text-navy-600 font-semibold">
                      💚 Refunded on {new Date(r.refunded_at).toLocaleDateString('en-IN')}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Queue Tab */}
      {activeTab === 'queue' && hasQueueAccess && <AccountantRefundQueue isMD={canMdApprove} />}

      {/* Submit Form Modal */}
      {showForm && (
        <ExpenseRefundForm onClose={() => setShowForm(false)} onSuccess={fetchMyRefunds} />
      )}
    </div>
  );
};
