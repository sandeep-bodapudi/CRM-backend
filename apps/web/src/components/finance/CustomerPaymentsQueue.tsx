import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CheckCircle2, RefreshCw, RotateCcw, XCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';
import { handleApiError } from '../../utils/userFacingError';

interface QueuePayment {
  id: number;
  payment_code: string;
  amount: number;
  payment_method: string;
  reference_number: string | null;
  payment_date: string;
  status: string;
  notes: string | null;
  recorded_by?: { id: number; full_name: string | null } | null;
  booking?: {
    id: number;
    booking_code: string;
    status: string;
    customer?: { first_name?: string; last_name?: string | null; phone?: string } | null;
  } | null;
}

export interface PaymentQueueCounts {
  to_verify: number;
  to_verify_amount: number;
  refund_due: number;
  refund_due_amount: number;
}

const rupees = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const METHOD: Record<string, string> = {
  CASH: 'Cash',
  CHEQUE: 'Cheque',
  BANK_TRANSFER: 'Bank transfer',
  ONLINE: 'Online / UPI',
};
const waited = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return days <= 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`;
};

export const usePaymentQueueCounts = () => {
  const { fetchWithAuth } = useAuth();
  return useQuery({
    queryKey: ['paymentQueueCounts'],
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE_URL}/payments/queue-counts`);
      if (!res.ok) throw new Error('unavailable');
      return (await res.json()) as PaymentQueueCounts;
    },
    staleTime: 30_000,
    retry: false,
  });
};

type Tab = 'VERIFY' | 'REFUND';
type Decision = { payment: QueuePayment; status: 'SUCCESS' | 'FAILED' | 'REFUNDED' } | null;

/**
 * Finance's work on customer money: payments recorded by sales staff wait here
 * until Finance confirms the money really arrived (Received) or not (Bounced /
 * failed); payments on cancelled bookings wait here until refunded.
 */
export const CustomerPaymentsQueue: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('VERIFY');
  const [decision, setDecision] = useState<Decision>(null);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const counts = usePaymentQueueCounts();

  const status = tab === 'VERIFY' ? 'PENDING' : 'REFUND_DUE';
  const list = useQuery({
    queryKey: ['paymentQueue', status],
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE_URL}/payments?status=${status}&limit=500`);
      if (!res.ok) throw new Error('unavailable');
      return (await res.json()) as QueuePayment[];
    },
    staleTime: 15_000,
  });

  const open = (payment: QueuePayment, s: 'SUCCESS' | 'FAILED' | 'REFUNDED') => {
    setDecision({ payment, status: s });
    setReference(payment.reference_number || '');
    setNote('');
  };

  const confirm = async () => {
    if (!decision) return;
    if (decision.status === 'FAILED' && note.trim().length < 3) {
      showError('Write why it failed (e.g. cheque bounced).');
      return;
    }
    setBusy(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/payments/${decision.payment.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: decision.status,
          reference_number: reference.trim() || undefined,
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return handleApiError(res, showError, data);
      showToast(
        decision.status === 'SUCCESS'
          ? 'Marked received'
          : decision.status === 'REFUNDED'
            ? 'Marked refunded'
            : 'Marked failed',
        'success',
      );
      setDecision(null);
      queryClient.invalidateQueries({ queryKey: ['paymentQueue'] });
      queryClient.invalidateQueries({ queryKey: ['paymentQueueCounts'] });
    } finally {
      setBusy(false);
    }
  };

  const c = counts.data;
  const items = list.data || [];
  const tabBtn = (t: Tab, label: string, n?: number, amount?: number) => (
    <button
      onClick={() => setTab(t)}
      className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
    >
      {label}
      {n !== undefined && (
        <span className="block text-[11px] font-semibold text-slate-500">
          {n} · {rupees(amount || 0)}
        </span>
      )}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
        {tabBtn('VERIFY', 'To verify', c?.to_verify, c?.to_verify_amount)}
        {tabBtn('REFUND', 'Refund due', c?.refund_due, c?.refund_due_amount)}
      </div>

      <p className="text-xs text-slate-500">
        {tab === 'VERIFY'
          ? 'Payments recorded by the sales team. Check your bank / cash book, then mark each one received or failed. Only received money reduces the booking balance.'
          : 'Money recorded on bookings that were cancelled or rejected. Mark each one refunded once the customer has it back.'}
      </p>

      {list.isLoading ? (
        <p className="text-center text-xs text-slate-400 py-8">Loading…</p>
      ) : list.isError ? (
        <div className="text-center py-8 space-y-2">
          <p className="text-sm text-slate-500">Could not load payments.</p>
          <button
            onClick={() => list.refetch()}
            className="inline-flex items-center gap-1 text-xs font-bold text-navy-700"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-2xl border border-slate-200">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-bold text-slate-700">
            {tab === 'VERIFY' ? 'Nothing to verify' : 'No refunds due'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((p) => {
            const name = [p.booking?.customer?.first_name, p.booking?.customer?.last_name]
              .filter(Boolean)
              .join(' ');
            return (
              <li key={p.id} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-black text-slate-900">{rupees(p.amount)}</p>
                    <p className="text-xs text-slate-600">
                      {METHOD[p.payment_method] || p.payment_method}
                      {p.reference_number ? ` · Ref ${p.reference_number}` : ' · no reference'}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                    {waited(p.payment_date)}
                  </span>
                </div>
                <div className="text-xs text-slate-600 space-y-0.5">
                  <p>
                    <span className="font-bold text-slate-800">{name || 'Customer'}</span>
                    {p.booking?.customer?.phone ? ` · ${p.booking.customer.phone}` : ''}
                  </p>
                  <p>
                    Booking{' '}
                    {p.booking ? (
                      <Link
                        to={`/bookings/${p.booking.id}`}
                        className="tap-inline font-bold text-navy-700 underline"
                      >
                        {p.booking.booking_code}
                      </Link>
                    ) : (
                      '—'
                    )}
                    {p.booking?.status === 'CANCELLED' ? ' (cancelled)' : ''} · recorded by{' '}
                    {p.recorded_by?.full_name || '—'} on{' '}
                    {new Date(p.payment_date).toLocaleDateString('en-IN')}
                  </p>
                  {p.notes && <p className="text-slate-500 italic">“{p.notes}”</p>}
                </div>
                <div className="flex gap-2">
                  {tab === 'VERIFY' ? (
                    <>
                      <button
                        onClick={() => open(p, 'SUCCESS')}
                        className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Received
                      </button>
                      <button
                        onClick={() => open(p, 'FAILED')}
                        className="flex-1 py-2.5 rounded-xl border border-rose-300 text-rose-700 text-xs font-black flex items-center justify-center gap-1.5"
                      >
                        <XCircle className="w-4 h-4" /> Bounced / failed
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => open(p, 'REFUNDED')}
                        className="flex-1 py-2.5 rounded-xl bg-navy-900 text-white text-xs font-black flex items-center justify-center gap-1.5"
                      >
                        <RotateCcw className="w-4 h-4" /> Refunded
                      </button>
                      <button
                        onClick={() => open(p, 'FAILED')}
                        className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-black"
                      >
                        Never received
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {decision && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-5 space-y-3 max-h-[90vh] overflow-y-auto">
            <h3 className="font-black text-navy-900">
              {decision.status === 'SUCCESS'
                ? `Mark ${rupees(decision.payment.amount)} as received?`
                : decision.status === 'REFUNDED'
                  ? `Mark ${rupees(decision.payment.amount)} as refunded?`
                  : tab === 'VERIFY'
                    ? `Mark ${rupees(decision.payment.amount)} as bounced / failed?`
                    : `Mark ${rupees(decision.payment.amount)} as never received?`}
            </h3>
            {decision.status === 'SUCCESS' && (
              <label className="block text-[11px] font-bold text-slate-600 uppercase">
                Cheque / UTR / receipt number
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  maxLength={100}
                  className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-xl text-sm normal-case"
                />
              </label>
            )}
            <label className="block text-[11px] font-bold text-slate-600 uppercase">
              {decision.status === 'FAILED' ? 'Why? *' : 'Note (optional)'}
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                placeholder={decision.status === 'FAILED' ? 'e.g. Cheque bounced' : ''}
                className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-xl text-sm normal-case"
              />
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setDecision(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold"
              >
                Back
              </button>
              <button
                onClick={confirm}
                disabled={busy}
                className="flex-1 py-2.5 rounded-xl bg-navy-900 text-white text-xs font-black disabled:opacity-40"
              >
                {busy ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
