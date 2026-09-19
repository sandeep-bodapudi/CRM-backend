import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import { Permissions } from '../../shared';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  IndianRupee,
  FileText,
  User,
  MapPin,
  Clock,
} from 'lucide-react';
import { RecordPaymentModal } from './RecordPaymentModal';
import { useToast } from '../../context/ToastContext';
import { BookingDossierData, HandoffData, PaymentItem } from '../../types';
import { handleApiError, toUserFacingError } from '../../utils/userFacingError';

export const BookingDossier: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { fetchWithAuth, user } = useAuth();
  const { showToast, showError } = useToast();
  const [booking, setBooking] = useState<BookingDossierData | null>(null);
  const [handoff, setHandoff] = useState<HandoffData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  useEffect(() => {
    fetchBooking();
  }, [id]);

  const fetchBooking = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/bookings/${id}`);
      if (res.ok) {
        const data = await res.json();
        setBooking(data);
        if (data.status === 'CONFIRMED') {
          fetchHandoffStatus();
        }
      } else {
        showError({ message: 'Failed to load booking details' });
        navigate('/bookings');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchHandoffStatus = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/bookings/${id}/handoff-status`);
      if (res.ok) {
        const data = await res.json();
        setHandoff(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateStatus = async (status: string) => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/bookings/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        showToast(`Booking marked as ${status}`, 'success');
        fetchBooking();
      } else {
        const data = await res.json();
        await handleApiError(res, showError, data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) return <div className="p-8 text-center text-sm">Loading booking details...</div>;
  if (!booking) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <button
        onClick={() => navigate('/bookings')}
        className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Bookings
      </button>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              Booking {booking.booking_code}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Status: <strong className="text-slate-700">{booking.status}</strong>
            </p>
            {handoff && (
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Portal:{' '}
                <strong
                  className={
                    handoff.handoff_status === 'ACTIVE'
                      ? 'text-green-600'
                      : handoff.handoff_status === 'FAILED'
                        ? 'text-red-600'
                        : 'text-amber-600'
                  }
                >
                  {handoff.handoff_status}
                </strong>
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {booking.status === 'PENDING' &&
              user?.permissions?.includes(Permissions.BOOKINGS_CONFIRM) && (
                <>
                  <button
                    onClick={() => handleUpdateStatus('CONFIRMED')}
                    className="bg-navy-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-navy-700"
                  >
                    Confirm Booking
                  </button>
                </>
              )}
            {booking.status !== 'CANCELLED' &&
              user?.permissions?.includes(Permissions.BOOKINGS_CANCEL) && (
                <button
                  onClick={() => handleUpdateStatus('CANCELLED')}
                  className="bg-white border border-rose-200 text-rose-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-rose-50"
                >
                  Cancel
                </button>
              )}
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="font-bold text-sm text-slate-700 flex items-center gap-2 border-b border-slate-100 pb-2">
              <User className="w-4 h-4 text-navy-600" /> Customer Details
            </h3>
            <div className="text-sm">
              <p>
                <strong>Name:</strong> {booking.customer?.first_name} {booking.customer?.last_name}
              </p>
              <p>
                <strong>Phone:</strong> {booking.customer?.phone}
              </p>
            </div>

            <h3 className="font-bold text-sm text-slate-700 flex items-center gap-2 border-b border-slate-100 pb-2 pt-4">
              <MapPin className="w-4 h-4 text-navy-600" />{' '}
              {booking.project_unit ? 'Project Unit Details' : 'Property Details'}
            </h3>
            {booking.project_unit ? (
              <div className="text-sm">
                <p>
                  <strong>Project:</strong> {booking.project_unit.project.name}
                </p>
                <p>
                  <strong>Unit:</strong>{' '}
                  {booking.project_unit.flat_number ||
                    booking.project_unit.villa_number ||
                    booking.project_unit.plot_number ||
                    booking.project_unit.unit_number}
                </p>
                <p>
                  <strong>Current Status:</strong> {booking.project_unit.sales_status}
                </p>
              </div>
            ) : (
              <div className="text-sm">
                <p>
                  <strong>Title:</strong> {booking.property?.title}
                </p>
                <p>
                  <strong>Current Status:</strong> {booking.property?.status}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="font-bold text-sm text-slate-700 flex items-center gap-2 border-b border-slate-100 pb-2">
              <IndianRupee className="w-4 h-4 text-navy-600" /> Financials
            </h3>
            <div className="text-sm bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Agreed Price</span>
                <span className="font-bold text-slate-800">
                  ₹{booking.agreed_price.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Token/Booking Amount</span>
                <span className="font-bold text-slate-800">
                  ₹{booking.booking_amount.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200">
                <span className="text-slate-500 font-semibold">Remaining Balance</span>
                <span className="font-bold text-rose-600">
                  ₹{booking.balance_amount.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
            Payment History
          </h3>
          {user?.permissions?.includes(Permissions.PAYMENTS_CREATE) &&
            booking.status !== 'CANCELLED' && (
              <button
                onClick={() => setShowPaymentModal(true)}
                className="bg-navy-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-navy-700 flex items-center gap-1"
              >
                <IndianRupee className="w-3 h-3" /> Record Payment
              </button>
            )}
        </div>

        <div className="p-6">
          {booking.payments?.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">No payments recorded yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {booking.payments?.map((p: PaymentItem) => (
                <div key={p.id} className="py-3 flex justify-between items-center">
                  <div>
                    <p className="font-bold text-sm text-slate-800">
                      ₹{p.amount.toLocaleString()}{' '}
                      <span className="text-xs font-normal text-slate-500">
                        via {p.payment_method}
                      </span>
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Ref: {p.reference_number || 'N/A'} •{' '}
                      {new Date(p.payment_date).toLocaleDateString('en-IN')}
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`px-2 py-1 rounded text-[10px] font-bold ${p.status === 'SUCCESS' ? 'bg-navy-100 text-navy-800' : p.status === 'PENDING' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}
                    >
                      {p.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showPaymentModal && (
        <RecordPaymentModal
          bookingId={booking.id}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={fetchBooking}
        />
      )}
    </div>
  );
};
