import React, { useState } from 'react';
import { MyWorkSummary } from './MyWorkSummary';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import { IndianRupee, Clock, FileCheck, Briefcase, ChevronDown, AlertCircle } from 'lucide-react';
import { StatCard, ListWidget, ListItem } from '../ui';
import { TaskManager } from '../tasks/TaskManager';
import { PerformanceScoreWidget } from '../performance/PerformanceScoreWidget';
import { useQuery } from '@tanstack/react-query';

export const FinanceDashboard: React.FC = () => {
  const { user, fetchWithAuth } = useAuth();
  const [showOps, setShowOps] = useState(false);

  const {
    data,
    isLoading,
    isError: hasError,
  } = useQuery({
    queryKey: ['financeDashboardData'],
    queryFn: async () => {
      const [refundsRes, bookingsRes] = await Promise.all([
        fetchWithAuth(`${API_BASE_URL}/expense-refunds/queue`),
        fetchWithAuth(`${API_BASE_URL}/bookings`),
      ]);
      if (!refundsRes.ok) throw new Error('Failed to load expense refund queue');

      const refundsData = await refundsRes.json();
      const refunds = refundsData.refunds || [];
      const pendingRefunds = refunds.filter((r: any) => r.status === 'PENDING');

      let pendingPayments = 0;
      if (bookingsRes.ok) {
        const bookingsData = await bookingsRes.json();
        const bookings = Array.isArray(bookingsData) ? bookingsData : bookingsData.bookings || [];
        pendingPayments = bookings.filter(
          (b: any) => b.balance_amount > 0 && b.status !== 'CANCELLED',
        ).length;
      }

      const refundItems: ListItem[] = pendingRefunds.slice(0, 10).map((r: any) => ({
        id: r.id,
        title: r.employee?.full_name || r.employee?.employee_code || 'Unknown',
        subtitle: r.purpose,
        meta: `₹${r.amount}`,
        icon: IndianRupee,
        link: '/finance',
      }));

      return { pendingRefundsCount: pendingRefunds.length, pendingPayments, refundItems };
    },
    enabled: !!user?.id,
  });

  const metrics = data || { pendingRefundsCount: 0, pendingPayments: 0, refundItems: [] };

  return (
    <div className="space-y-6 pb-20 sm:pb-6">
      <MyWorkSummary />
      <div className="flex items-center justify-between mb-2 p-6 rounded-3xl bg-gradient-to-r from-amber-700 to-orange-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-white/10 blur-3xl"></div>
        <div className="relative z-10">
          <h1 className="text-3xl font-black text-white tracking-tight">Finance Workspace</h1>
          <p className="text-amber-100 text-sm mt-2 font-medium">
            Welcome back,{' '}
            <strong className="text-white bg-white/20 px-2 py-0.5 rounded-md">
              {user?.fullName || user?.employeeCode}
            </strong>
          </p>
        </div>
      </div>

      {hasError && (
        <div className="text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-4 py-3 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-danger-600" />
          Unable to load finance data. Please try again later.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Refunds Pending Review"
          value={isLoading ? '...' : metrics.pendingRefundsCount.toString()}
          icon={Clock}
          link="/finance"
        />
        <StatCard
          label="Bookings With Balance Due"
          value={isLoading ? '...' : metrics.pendingPayments.toString()}
          icon={FileCheck}
          link="/bookings"
        />
        <StatCard label="My Expense Requests" value="View" icon={IndianRupee} link="/finance" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-lg border border-white/50 p-6">
            <h3 className="font-black text-navy-900 mb-6 flex items-center gap-2 text-lg">
              <Briefcase className="w-5 h-5 text-amber-600" /> Task Management
            </h3>
            <TaskManager />
          </div>
        </div>

        <div className="space-y-6">
          <ListWidget
            title="Refund Review Queue"
            items={metrics.refundItems}
            emptyStateMessage="No refund requests waiting on review."
            viewAllLink="/finance"
          />

          <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-lg border border-white/50 overflow-hidden">
            <button
              onClick={() => setShowOps(!showOps)}
              className="w-full flex items-center justify-between p-5 text-sm font-black text-slate-800 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${showOps ? 'rotate-180' : ''}`}
                  />
                </span>
                <span>Operational Metrics (Attendance & Performance)</span>
              </div>
            </button>
            {showOps && (
              <div className="p-5 border-t border-slate-100 bg-white/50">
                <PerformanceScoreWidget />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
