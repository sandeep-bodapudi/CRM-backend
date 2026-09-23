import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import {
  FileText,
  CheckCircle2,
  IndianRupee,
  Users,
  Building,
  AlertTriangle,
  AlertCircle,
  Send,
  Plus,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BookingItem } from '../../types';
import { DataTable, ColumnDef } from '../ui/DataTable';
import { StatCard } from '../ui/StatCard';
import { StatusPill } from '../ui/StatusPill';
import { useWhatsApp } from '../../hooks/useWhatsApp';
import { BookingInitiationWizard } from './BookingInitiationWizard';

export const BookingManagement: React.FC = () => {
  const { fetchWithAuth, user } = useAuth();
  const navigate = useNavigate();
  const { sendWhatsAppMessage } = useWhatsApp();
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [showBookingWizard, setShowBookingWizard] = useState(false);

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/bookings`);
      if (res.ok) {
        const data = await res.json();
        setBookings(data);
        setHasError(false);
      } else {
        setHasError(true);
      }
    } catch (e) {
      console.error(e);
      setHasError(true);
    } finally {
      setLoading(false);
    }
  };

  const filteredBookings = bookings.filter(
    (b) => filterStatus === 'ALL' || b.status === filterStatus,
  );

  // Quick Stats
  const activeBookings = bookings.filter(
    (b) => b.status === 'CONFIRMED' || b.status === 'PENDING',
  ).length;
  const pendingPayments = bookings.filter(
    (b) => b.balance_amount > 0 && b.status !== 'CANCELLED',
  ).length;
  const totalRevenue = bookings
    .filter((b) => b.status === 'CONFIRMED' || b.status === 'COMPLETED')
    .reduce((sum, b) => sum + (b.agreed_price - b.balance_amount), 0);

  const columns: ColumnDef<BookingItem>[] = [
    {
      key: 'booking_code',
      header: 'Booking',
      sortable: true,
      render: (b) => (
        <div>
          <div className="font-mono font-bold text-navy-800 text-[11px] mb-0.5">
            {b.booking_code}
          </div>
          <div className="text-xs font-semibold text-slate-500">#{b.id}</div>
        </div>
      ),
    },
    {
      key: 'crm_linkage',
      header: 'CRM Pipeline Origin',
      render: (b) => (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-sm">
            <Users className="w-3.5 h-3.5 text-navy-500" />
            <span className="font-bold text-navy-900">
              {b.customer?.first_name} {b.customer?.last_name}
            </span>
          </div>
          <div className="text-[10px] text-slate-500 flex items-center gap-1">
            <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">Assigned To:</span>
            <span className="font-semibold">{b.assigned_employee?.full_name || 'System'}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'property',
      header: 'Property Details',
      render: (b) => {
        const unit = b.project_unit;
        const unitLabel = unit
          ? unit.flat_number || unit.villa_number || unit.plot_number || unit.unit_number
          : null;
        return (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Building className="w-3.5 h-3.5 text-slate-400" />
              <span className="line-clamp-1">
                {unit ? `${unit.project.name} — Unit ${unitLabel}` : b.property?.title}
              </span>
              {unit && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-navy-100 text-navy-700 uppercase tracking-wide shrink-0">
                  Project Unit
                </span>
              )}
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              {unit ? unit.unit_code : `Unit ID: ${b.property?.id ?? '—'}`}
            </div>
          </div>
        );
      },
    },
    {
      key: 'financials',
      header: 'Financials',
      render: (b) => (
        <div className="flex flex-col gap-1">
          <div className="text-xs font-bold text-slate-800 flex items-center gap-1">
            <span className="text-slate-400">Total:</span>₹{b.agreed_price.toLocaleString()}
          </div>
          {b.balance_amount > 0 ? (
            <div className="text-[10px] font-bold text-rose-600 flex items-center gap-1 bg-rose-50 w-max px-1.5 py-0.5 rounded border border-rose-100">
              <AlertTriangle className="w-3 h-3" />
              Bal: ₹{b.balance_amount.toLocaleString()}
            </div>
          ) : (
            <div className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Paid in Full
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (b) => {
        let type: 'pending' | 'success' | 'danger' = 'pending';
        if (b.status === 'CONFIRMED' || b.status === 'COMPLETED') type = 'success';
        if (b.status === 'CANCELLED') type = 'danger';
        return (
          <div className="flex flex-col gap-2 items-start">
            <StatusPill status={b.status} type={type} />
            {b.status === 'CONFIRMED' && b.customer?.phone && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const phone = b.customer?.phone;
                  if (phone) {
                    const unit = b.project_unit;
                    const unitLabel = unit
                      ? unit.flat_number ||
                        unit.villa_number ||
                        unit.plot_number ||
                        unit.unit_number
                      : null;
                    sendWhatsAppMessage('BOOKING_CONFIRMED', phone, {
                      customer_name: b.customer?.first_name,
                      property_name: unit
                        ? `${unit.project.name} — Unit ${unitLabel}`
                        : b.property?.title,
                      booking_code: b.booking_code,
                      company_name: 'Radha Real Homes',
                    });
                  }
                }}
                className="px-2 py-1 bg-[#25D366] hover:bg-[#1DA851] text-white text-[10px] font-bold rounded flex items-center gap-1 shadow-sm transition-colors uppercase tracking-wide"
              >
                <Send className="w-3 h-3" /> WA Confirm
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-navy-900 via-navy-800 to-slate-900 rounded-3xl p-6 text-white shadow-xl flex flex-wrap items-center justify-between gap-4 border border-navy-700/30">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-5 h-5 text-gold-500" />
            <h2 className="text-xl font-extrabold tracking-tight">Bookings & Reservations</h2>
          </div>
          <p className="text-xs text-navy-200/80">
            Manage active unit reservations, payment collections, and CRM booking pipelines.
          </p>
        </div>
        <button
          onClick={() => setShowBookingWizard(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gold-500 hover:bg-gold-600 text-navy-950 font-bold text-sm rounded-xl shadow-md transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Booking
        </button>
      </div>

      {showBookingWizard && (
        <BookingInitiationWizard
          onClose={() => setShowBookingWizard(false)}
          onSuccess={() => {
            setShowBookingWizard(false);
            fetchBookings();
          }}
        />
      )}

      {hasError && (
        <div className="text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-4 py-3 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-danger-600" />
          Unable to load bookings. Please try again later.
        </div>
      )}

      {/* Quick Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Active Bookings" value={activeBookings} icon={FileText} />
        <StatCard
          label="Accounts with Balance"
          value={pendingPayments}
          icon={AlertTriangle}
          trend={{ direction: 'down', value: 'Requires follow up', label: 'CRM task' }}
        />
        <StatCard
          label="Collected Revenue"
          value={`₹${(totalRevenue / 100000).toFixed(1)}L`}
          icon={IndianRupee}
          trend={{ direction: 'up', value: 'Healthy', label: 'Cashflow' }}
        />
      </div>

      {/* Main Content Area */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-500">Filter Status:</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold focus:outline-none focus:border-navy-500"
            >
              <option value="ALL">All Bookings</option>
              <option value="PENDING">PENDING</option>
              <option value="CONFIRMED">CONFIRMED</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-500">Loading bookings pipeline...</div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredBookings}
            searchable={true}
            emptyMessage="No bookings found matching your criteria."
            onRowClick={(b) => navigate(`/bookings/${b.id}`)}
          />
        )}
      </div>
    </div>
  );
};
