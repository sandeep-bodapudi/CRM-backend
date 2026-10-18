import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Building,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Receipt,
  ClipboardCheck,
  Users,
  ArrowRight,
} from 'lucide-react';
import { API_BASE_URL } from '../../config';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatEmployeeLabel } from '../../utils/employeeLabel';

// MD/Admin's single "where do I go" page (reported 2026-09-15): several
// action-needed queues either had no dedicated list view at all (project/
// property MD-verification, bookings pending MD approval -- the latter had
// a working backend endpoint with zero frontend consuming it) or were
// scattered across separate pages the MD had to already know existed.
// This page pulls the ones with no home into real tabs, and quick-links the
// ones that already have a proper dedicated page instead of rebuilding them.

type TabId = 'unassigned' | 'verification' | 'bookings' | 'links';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'unassigned', label: 'Unassigned', icon: Building },
  { id: 'verification', label: 'Pending Verification', icon: ShieldCheck },
  { id: 'bookings', label: 'Pending Bookings', icon: ClipboardCheck },
  { id: 'links', label: 'Other Queues', icon: ArrowRight },
];

type UnassignedItem = { id: number; kind: 'PROPERTY' | 'PROJECT'; title: string; subtitle: string };
type VerificationItem = {
  id: number;
  kind: 'PROPERTY' | 'PROJECT';
  title: string;
  subtitle: string;
};
type BookingItem = {
  id: number;
  booking_code?: string;
  customer?: { first_name?: string; last_name?: string; phone?: string } | null;
  property?: { title?: string } | null;
  project_unit?: { unit_number?: string } | null;
  form_submitted_by?: { full_name?: string; employee_code?: string } | null;
  agreed_price?: number;
};

/** `embedded`: shown inside the Approvals page (no page title, no links tab). */
export const ActionCenter: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();
  const [activeTab, setActiveTab] = useState<TabId>('unassigned');

  // ── Unassigned ─────────────────────────────────────────────────────────
  const [unassigned, setUnassigned] = useState<UnassignedItem[]>([]);
  const [pms, setPms] = useState<any[]>([]);
  const [loadingUnassigned, setLoadingUnassigned] = useState(true);
  const [justAssigned, setJustAssigned] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const fetchUnassigned = useCallback(async () => {
    setLoadingUnassigned(true);
    try {
      const [propRes, projectRes, pmRes] = await Promise.all([
        fetchWithAuth(`${API_BASE_URL}/properties?unassigned=true&limit=100`),
        fetchWithAuth(`${API_BASE_URL}/projects?unassigned=true&limit=100`),
        fetchWithAuth(`${API_BASE_URL}/employees?role=PROJECT_MANAGER`),
      ]);
      const next: UnassignedItem[] = [];
      if (propRes.ok) {
        const d = await propRes.json();
        (d.properties || []).forEach((p: any) =>
          next.push({
            id: p.id,
            kind: 'PROPERTY',
            title: `${p.title} (${p.property_code})`,
            subtitle: `Location: ${p.city || p.location || 'Unknown'}`,
          }),
        );
      }
      if (projectRes.ok) {
        const d = await projectRes.json();
        (d.projects || []).forEach((proj: any) =>
          next.push({
            id: proj.id,
            kind: 'PROJECT',
            title: `${proj.name} (Project)`,
            subtitle: `Location: ${proj.city || proj.location || 'Unknown'}`,
          }),
        );
      }
      setUnassigned(next);
      if (pmRes.ok) {
        const d = await pmRes.json();
        setPms(d.employees || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingUnassigned(false);
    }
  }, [fetchWithAuth]);

  const handleAssignPm = async (item: UnassignedItem, pmId: string) => {
    if (!pmId) return;
    const key = `${item.kind}-${item.id}`;
    const pm = pms.find((p) => String(p.id) === pmId);
    const pmLabel = pm ? formatEmployeeLabel(pm) : 'the selected PM';
    setBusyKey(key);
    try {
      const endpoint =
        item.kind === 'PROPERTY'
          ? `${API_BASE_URL}/properties/${item.id}`
          : `${API_BASE_URL}/projects/${item.id}`;
      const res = await fetchWithAuth(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_pm_id: parseInt(pmId, 10) }),
      });
      if (res.ok) {
        showToast(`${item.title} assigned to ${pmLabel}`, 'success');
        setJustAssigned((prev) => ({ ...prev, [key]: pmLabel }));
        setTimeout(() => {
          setUnassigned((prev) => prev.filter((i) => !(i.id === item.id && i.kind === item.kind)));
          setJustAssigned((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }, 1400);
      } else {
        const data = await res.json().catch(() => ({}));
        showError({ message: data.error || `Failed to assign a PM to ${item.title}` });
      }
    } catch (e) {
      showError({ message: `Network error assigning a PM to ${item.title}` });
    } finally {
      setBusyKey(null);
    }
  };

  // ── Pending Verification (properties + projects awaiting MD approval) ──
  const [verification, setVerification] = useState<VerificationItem[]>([]);
  const [loadingVerification, setLoadingVerification] = useState(true);
  const [justVerified, setJustVerified] = useState<Record<string, 'VERIFIED' | 'REJECTED'>>({});

  const fetchVerification = useCallback(async () => {
    setLoadingVerification(true);
    try {
      const [propRes, projectRes] = await Promise.all([
        fetchWithAuth(`${API_BASE_URL}/properties?status=PENDING_MD_APPROVAL&limit=100`),
        fetchWithAuth(`${API_BASE_URL}/projects?verification_status=PENDING_MD_APPROVAL&limit=100`),
      ]);
      const next: VerificationItem[] = [];
      if (propRes.ok) {
        const d = await propRes.json();
        (d.properties || []).forEach((p: any) =>
          next.push({
            id: p.id,
            kind: 'PROPERTY',
            title: `${p.title} (${p.property_code})`,
            subtitle: `Location: ${p.city || p.location || 'Unknown'}`,
          }),
        );
      }
      if (projectRes.ok) {
        const d = await projectRes.json();
        (d.projects || []).forEach((proj: any) =>
          next.push({
            id: proj.id,
            kind: 'PROJECT',
            title: `${proj.name} (Project)`,
            subtitle: `Location: ${proj.city || proj.location || 'Unknown'}`,
          }),
        );
      }
      setVerification(next);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingVerification(false);
    }
  }, [fetchWithAuth]);

  const handleVerifyDecision = async (item: VerificationItem, approved: boolean) => {
    const key = `${item.kind}-${item.id}`;
    setBusyKey(key);
    try {
      const endpoint =
        item.kind === 'PROPERTY'
          ? `${API_BASE_URL}/properties/${item.id}/md-approve`
          : `${API_BASE_URL}/projects/${item.id}/md-approve`;
      const res = await fetchWithAuth(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      });
      if (res.ok) {
        showToast(
          approved ? `${item.title} approved and is now live` : `${item.title} rejected`,
          'success',
        );
        setJustVerified((prev) => ({ ...prev, [key]: approved ? 'VERIFIED' : 'REJECTED' }));
        setTimeout(() => {
          setVerification((prev) =>
            prev.filter((i) => !(i.id === item.id && i.kind === item.kind)),
          );
          setJustVerified((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }, 1400);
      } else {
        const data = await res.json().catch(() => ({}));
        showError({ message: data.error || `Failed to update ${item.title}` });
      }
    } catch (e) {
      showError({ message: `Network error updating ${item.title}` });
    } finally {
      setBusyKey(null);
    }
  };

  // ── Pending Bookings (MD approval on submitted booking forms) ──────────
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [justDecided, setJustDecided] = useState<Record<number, 'APPROVED' | 'REJECTED'>>({});

  const fetchBookings = useCallback(async () => {
    setLoadingBookings(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/bookings/pending-md-approval`);
      if (res.ok) {
        const data = await res.json();
        setBookings(Array.isArray(data) ? data : data.bookings || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingBookings(false);
    }
  }, [fetchWithAuth]);

  const handleBookingDecision = async (booking: BookingItem, approve: boolean) => {
    setBusyKey(`booking-${booking.id}`);
    try {
      const endpoint = approve
        ? `${API_BASE_URL}/bookings/${booking.id}/md-approve`
        : `${API_BASE_URL}/bookings/${booking.id}/md-reject`;
      const res = await fetchWithAuth(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: approve ? undefined : JSON.stringify({ reason: 'Rejected from Action Center' }),
      });
      if (res.ok) {
        showToast(
          approve
            ? `Booking ${booking.booking_code || booking.id} approved`
            : `Booking ${booking.booking_code || booking.id} rejected`,
          'success',
        );
        setJustDecided((prev) => ({ ...prev, [booking.id]: approve ? 'APPROVED' : 'REJECTED' }));
        setTimeout(() => {
          setBookings((prev) => prev.filter((b) => b.id !== booking.id));
          setJustDecided((prev) => {
            const next = { ...prev };
            delete next[booking.id];
            return next;
          });
        }, 1400);
      } else {
        const data = await res.json().catch(() => ({}));
        showError({ message: data.error || 'Failed to update booking' });
      }
    } catch (e) {
      showError({ message: 'Network error updating booking' });
    } finally {
      setBusyKey(null);
    }
  };

  useEffect(() => {
    fetchUnassigned();
    fetchVerification();
    fetchBookings();
  }, [fetchUnassigned, fetchVerification, fetchBookings]);

  // Open on the first queue that has something waiting (once, after loading),
  // instead of always on "Unassigned".
  const [pickedTab, setPickedTab] = useState(false);
  useEffect(() => {
    if (pickedTab) return;
    if (bookings.length > 0) setActiveTab('bookings');
    else if (verification.length > 0) setActiveTab('verification');
    else if (unassigned.length > 0) setActiveTab('unassigned');
    else return;
    setPickedTab(true);
  }, [pickedTab, bookings.length, verification.length, unassigned.length]);

  return (
    <div className="space-y-6">
      <div className={embedded ? 'hidden' : ''}>
        <h1 className="text-2xl font-bold text-navy-900 tracking-tight">Action Center</h1>
        <p className="text-slate-500 text-sm mt-1">
          Everything waiting on you — PM assignment, property/project verification, booking
          approvals — in one place.
        </p>
      </div>

      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto">
        {TABS.filter((t) => !(embedded && t.id === 'links')).map((tab) => {
          const Icon = tab.icon;
          const counts: Record<TabId, number> = {
            unassigned: unassigned.length,
            verification: verification.length,
            bookings: bookings.length,
            links: 0,
          };
          return (
            <button
              key={tab.id}
              onClick={() => {
                setPickedTab(true);
                setActiveTab(tab.id);
              }}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'border-navy-600 text-navy-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {counts[tab.id] > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-navy-100 text-navy-700 font-extrabold">
                  {counts[tab.id]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === 'unassigned' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-2">
          {loadingUnassigned ? (
            <p className="text-sm text-slate-400 text-center py-8">Loading...</p>
          ) : unassigned.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">
              All properties and projects have an assigned PM.
            </p>
          ) : (
            unassigned.map((item) => {
              const key = `${item.kind}-${item.id}`;
              const assignedLabel = justAssigned[key];
              return (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-slate-50 border border-slate-100"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-slate-800 truncate">{item.title}</p>
                    <p className="text-xs text-slate-500 truncate">{item.subtitle}</p>
                  </div>
                  {assignedLabel ? (
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1 shrink-0">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      Assigned to {assignedLabel}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        className="text-sm text-slate-800 bg-white border border-slate-200 rounded-md py-1 px-2 focus:outline-none focus:ring-1 focus:ring-navy-500 disabled:opacity-50"
                        onChange={(e) => handleAssignPm(item, e.target.value)}
                        defaultValue=""
                        disabled={busyKey === key}
                      >
                        <option value="" disabled className="text-slate-800 bg-white">
                          Assign PM...
                        </option>
                        {pms.map((pm) => (
                          <option key={pm.id} value={pm.id} className="text-slate-800 bg-white">
                            {formatEmployeeLabel(pm)}
                          </option>
                        ))}
                      </select>
                      {busyKey === key && (
                        <AlertCircle className="w-4 h-4 text-slate-400 animate-pulse" />
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'verification' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-2">
          {loadingVerification ? (
            <p className="text-sm text-slate-400 text-center py-8">Loading...</p>
          ) : verification.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">
              Nothing waiting on your final approval right now.
            </p>
          ) : (
            verification.map((item) => {
              const key = `${item.kind}-${item.id}`;
              const decision = justVerified[key];
              return (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-slate-50 border border-slate-100"
                >
                  <div className="min-w-0">
                    <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-navy-500 bg-navy-50 border border-navy-200 rounded px-1.5 py-0.5 mb-1">
                      {item.kind}
                    </span>
                    <p className="font-semibold text-sm text-slate-800 truncate">{item.title}</p>
                    <p className="text-xs text-slate-500 truncate">{item.subtitle}</p>
                  </div>
                  {decision ? (
                    <div
                      className={`flex items-center gap-1.5 text-sm font-semibold rounded-md px-2 py-1 shrink-0 border ${
                        decision === 'VERIFIED'
                          ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                          : 'text-rose-700 bg-rose-50 border-rose-200'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      {decision === 'VERIFIED' ? 'Approved' : 'Rejected'}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleVerifyDecision(item, false)}
                        disabled={busyKey === key}
                        className="px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg disabled:opacity-50"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => handleVerifyDecision(item, true)}
                        disabled={busyKey === key}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
                      >
                        Approve
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'bookings' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-2">
          {loadingBookings ? (
            <p className="text-sm text-slate-400 text-center py-8">Loading...</p>
          ) : bookings.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">
              No bookings pending your approval.
            </p>
          ) : (
            bookings.map((booking) => {
              const decision = justDecided[booking.id];
              const customerName = booking.customer
                ? `${booking.customer.first_name || ''} ${booking.customer.last_name || ''}`.trim()
                : 'Unknown customer';
              const target = booking.property?.title
                ? booking.property.title
                : booking.project_unit?.unit_number
                  ? `Unit ${booking.project_unit.unit_number}`
                  : 'Unknown property';
              return (
                <div
                  key={booking.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-slate-50 border border-slate-100"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-slate-800 truncate">
                      {booking.booking_code || `Booking #${booking.id}`} — {customerName}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {target}
                      {booking.agreed_price
                        ? ` · ₹${(booking.agreed_price / 100000).toFixed(1)}L`
                        : ''}
                      {booking.form_submitted_by
                        ? ` · Submitted by ${formatEmployeeLabel(booking.form_submitted_by)}`
                        : ''}
                    </p>
                  </div>
                  {decision ? (
                    <div
                      className={`flex items-center gap-1.5 text-sm font-semibold rounded-md px-2 py-1 shrink-0 border ${
                        decision === 'APPROVED'
                          ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                          : 'text-rose-700 bg-rose-50 border-rose-200'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      {decision === 'APPROVED' ? 'Approved' : 'Rejected'}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleBookingDecision(booking, false)}
                        disabled={busyKey === `booking-${booking.id}`}
                        className="px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg disabled:opacity-50"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => handleBookingDecision(booking, true)}
                        disabled={busyKey === `booking-${booking.id}`}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
                      >
                        Approve
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'links' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            to="/finance"
            className="flex items-center justify-between gap-3 p-5 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-navy-300 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-sm text-slate-800">Expense Refunds</p>
                <p className="text-xs text-slate-500">Review and approve refund requests</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
          </Link>
          <Link
            to="/pm/approvals"
            className="flex items-center justify-between gap-3 p-5 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-navy-300 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-navy-100 text-navy-700 flex items-center justify-center">
                <ClipboardCheck className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-sm text-slate-800">PM Approvals</p>
                <p className="text-xs text-slate-500">Site visits and demos awaiting PM accept</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
          </Link>
          <Link
            to="/approvals"
            className="flex items-center justify-between gap-3 p-5 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-navy-300 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-sm text-slate-800">HR Approvals</p>
                <p className="text-xs text-slate-500">Leave and attendance proposals</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
          </Link>
        </div>
      )}
    </div>
  );
};
