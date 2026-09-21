import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Building2,
  PhoneCall,
  UserCheck,
  X,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';
import { Permissions } from '../../shared';
import { CreateBookingModal } from '../commercial/CreateBookingModal';
import { handleApiError, toUserFacingError } from '../../utils/userFacingError';

interface Customer {
  id: number;
  customer_code: string;
  first_name: string;
  last_name: string;
  phone: string;
  email?: string;
  status: string;
  assigned_to?: {
    id: number;
    employee_code: string;
    full_name: string;
  };
  origin_lead?: {
    id: number;
    lead_code: string;
    status?: string;
  };
  created_at: string;
}

export const CustomerManagement: React.FC = () => {
  const { user, fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  // Render-side cap, independent of the fetch: rendering thousands of table
  // rows at once freezes the browser regardless of how much data the API
  // returned, now that the fetch itself can return up to 100000. "Load More"
  // reveals more of the already-fetched, filtered list; reset on search
  // change below so it never shows "page 4" of a different result set.
  const CUSTOMERS_PAGE_SIZE = 50;
  const [visibleCustomerCount, setVisibleCustomerCount] = useState(CUSTOMERS_PAGE_SIZE);

  // Dossier state
  const [dossierCustomer, setDossierCustomer] = useState<Customer | null>(null);
  const [isDossierLoading, setIsDossierLoading] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);

  const openDossier = async (cust: Customer) => {
    setDossierCustomer(cust);
    setIsDossierLoading(true);
    try {
      // List endpoint omits origin_lead; fetch full detail for the dossier
      const res = await fetchWithAuth(`${API_BASE_URL}/customers/${cust.id}`);
      const data = await res.json();
      if (res.ok && data.customer) {
        setDossierCustomer(data.customer);
      }
    } catch (e) {
      console.error('Fetch customer detail error:', e);
    } finally {
      setIsDossierLoading(false);
    }
  };

  const fetchCustomers = async () => {
    setIsLoading(true);
    try {
      // Explicit high limit: the backend default (previously 50, now 2000)
      // silently truncated the list for any company with more customers than
      // that — every booking creates one, so this accumulates over time.
      const res = await fetchWithAuth(`${API_BASE_URL}/customers?limit=100000`);
      const data = await res.json();
      if (res.ok) {
        setCustomers(data.customers || []);
      } else {
        await handleApiError(res, showError, data);
      }
    } catch (e) {
      showError(
        toUserFacingError({ message: e instanceof Error ? e.message : String(e), body: e }),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (
    customerId: number,
    newStatus: string,
    currentStatus: string,
  ) => {
    if (newStatus === currentStatus) return;

    if (newStatus === 'BLACKLISTED') {
      const confirmed = window.confirm(
        'Are you sure you want to BLACKLIST this customer? This is a severe action.',
      );
      if (!confirmed) return;
    }

    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        showToast('Customer status updated', 'success');
        setCustomers((prev) =>
          prev.map((c) => (c.id === customerId ? { ...c, status: newStatus } : c)),
        );
        if (dossierCustomer?.id === customerId) {
          setDossierCustomer({ ...dossierCustomer, status: newStatus });
        }
      } else {
        const data = await res.json();
        await handleApiError(res, showError, data);
      }
    } catch (e) {
      showError(
        toUserFacingError({ message: e instanceof Error ? e.message : String(e), body: e }),
      );
    }
  };

  useEffect(() => {
    if (user?.permissions?.includes(Permissions.CUSTOMERS_READ)) {
      fetchCustomers();
    }
  }, [user]);

  useEffect(() => {
    setVisibleCustomerCount(CUSTOMERS_PAGE_SIZE);
  }, [searchQuery]);

  if (!user?.permissions?.includes(Permissions.CUSTOMERS_READ)) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-slate-500">
        <ShieldCheck className="w-16 h-16 text-rose-300 mb-4" />
        <h2 className="text-xl font-bold text-slate-700">Access Denied</h2>
        <p className="text-sm mt-2 max-w-md text-center">
          You do not have the required permissions to view Customer records.
        </p>
      </div>
    );
  }

  const filteredCustomers = customers.filter(
    (c) =>
      c.customer_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.first_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.last_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery),
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-800 flex items-center gap-3">
              <Building2 className="w-8 h-8 text-navy-600" />
              Customer Details
            </h1>
            <p className="text-sm text-slate-500 font-medium mt-1">
              Unified customer records & identity resolution
            </p>
          </div>
          <div className="w-full sm:w-auto relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              aria-label="Search customers"
              placeholder="Search by code, name, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-64 pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 focus:bg-white transition-all font-medium"
            />
          </div>
        </div>
      </div>

      {/* Main List */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[11px] uppercase tracking-wider">
                <th scope="col" className="px-4 py-3 sm:px-6 sm:py-4">
                  Customer ID
                </th>
                <th scope="col" className="px-4 py-3 sm:px-6 sm:py-4">
                  Identity
                </th>
                <th scope="col" className="px-4 py-3 sm:px-6 sm:py-4">
                  Contact
                </th>
                <th scope="col" className="px-4 py-3 sm:px-6 sm:py-4">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 sm:px-6 sm:py-4">
                  Assigned To
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="w-6 h-6 border-2 border-navy-600 border-t-transparent rounded-full animate-spin"></div>
                      <span className="font-semibold text-xs uppercase tracking-widest">
                        Loading Customers...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                    <p className="font-semibold">No customers found.</p>
                  </td>
                </tr>
              ) : (
                filteredCustomers.slice(0, visibleCustomerCount).map((cust) => (
                  <tr
                    key={cust.id}
                    onClick={() => openDossier(cust)}
                    className="hover:bg-navy-50/50 cursor-pointer transition-colors group"
                  >
                    <td className="px-4 py-3 sm:px-6 sm:py-4">
                      <div className="inline-flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-md text-xs font-mono font-bold text-slate-700">
                        {cust.customer_code}
                      </div>
                    </td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4">
                      <p className="font-bold text-slate-800">
                        {cust.first_name} {cust.last_name}
                      </p>
                    </td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4">
                      <div className="flex items-center gap-1 text-slate-600 text-xs font-medium">
                        <PhoneCall className="w-3.5 h-3.5 text-navy-500" />
                        {cust.phone}
                      </div>
                      {cust.email && (
                        <div className="text-[10px] text-slate-400 mt-0.5">{cust.email}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4" onClick={(e) => e.stopPropagation()}>
                      {user?.permissions?.includes(Permissions.CUSTOMERS_UPDATE) ? (
                        <select
                          value={cust.status}
                          onChange={(e) => handleStatusChange(cust.id, e.target.value, cust.status)}
                          className="p-1.5 text-[10px] uppercase font-extrabold tracking-wider bg-navy-50 border border-navy-200 rounded text-navy-800 focus:ring-2 focus:ring-navy-500"
                        >
                          <option value="ACTIVE">ACTIVE</option>
                          <option value="INACTIVE">INACTIVE</option>
                          <option value="BLACKLISTED">BLACKLISTED</option>
                        </select>
                      ) : (
                        <span className="inline-flex px-2 py-1 bg-navy-100 text-navy-800 rounded text-[10px] font-extrabold uppercase tracking-wider">
                          {cust.status}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4">
                      {cust.assigned_to ? (
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                          <UserCheck className="w-3.5 h-3.5 text-navy-600" />
                          <span>{cust.assigned_to.full_name}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Unassigned</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!isLoading && filteredCustomers.length > visibleCustomerCount && (
          <button
            onClick={() => setVisibleCustomerCount((c) => c + CUSTOMERS_PAGE_SIZE)}
            className="w-full py-3 border-t border-slate-100 text-navy-700 font-bold text-sm hover:bg-slate-50 transition-colors"
          >
            Load More ({filteredCustomers.length - visibleCustomerCount} remaining)
          </button>
        )}
      </div>

      {/* FULL CUSTOMER DOSSIER MODAL */}
      {dossierCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-50 w-full max-w-4xl rounded-2xl shadow-2xl relative flex flex-col max-h-full animate-scaleUp border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-10 shrink-0">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="bg-navy-100 w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 border border-navy-200">
                  <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-navy-700" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="bg-slate-800 text-white text-[10px] px-2 py-0.5 rounded font-mono font-bold tracking-wider">
                      {dossierCustomer.customer_code}
                    </span>
                    <span className="bg-navy-100 text-navy-800 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                      {dossierCustomer.status}
                    </span>
                  </div>
                  <h3 className="font-black text-slate-800 text-lg sm:text-xl">
                    {dossierCustomer.first_name} {dossierCustomer.last_name}
                  </h3>
                </div>
              </div>
              <div className="flex gap-2 items-center">
                {user?.permissions?.includes(Permissions.BOOKINGS_CREATE) && (
                  <button
                    onClick={() => setShowBookingModal(true)}
                    className="bg-navy-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-navy-700"
                  >
                    Create Booking
                  </button>
                )}
                <button
                  onClick={() => setDossierCustomer(null)}
                  aria-label="Close customer details"
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Dossier Content */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-50 space-y-6">
              {/* Identity & Contact */}
              <div>
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4" /> Identity & Contact
                </h4>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="flex flex-col">
                    <span className="text-slate-400 text-xs mb-1">Phone Number</span>
                    <span className="font-bold text-slate-800 flex items-center gap-2">
                      <PhoneCall className="w-4 h-4 text-navy-500" />
                      {dossierCustomer.phone}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-slate-400 text-xs mb-1">Email Address</span>
                    <span className="font-bold text-slate-800">
                      {dossierCustomer.email || 'N/A'}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-slate-400 text-xs mb-1">Created At</span>
                    <span className="font-medium text-slate-700">
                      {new Date(dossierCustomer.created_at).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Ownership */}
              <div>
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" /> Account Ownership
                </h4>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 text-sm">
                  {dossierCustomer.assigned_to ? (
                    <div className="flex flex-col">
                      <span className="text-slate-400 text-xs mb-1">Assigned Employee</span>
                      <div className="flex items-center gap-2 font-bold text-slate-800">
                        <UserCheck className="w-4 h-4 text-navy-600" />
                        {dossierCustomer.assigned_to.full_name}
                        <span className="text-xs text-slate-400 font-normal font-mono bg-slate-100 px-1 py-0.5 rounded ml-2">
                          {dossierCustomer.assigned_to.employee_code}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <span className="text-slate-500 italic">
                      No employee currently assigned to this account.
                    </span>
                  )}
                </div>
              </div>

              {/* Origin */}
              <div>
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Building2 className="w-4 h-4" /> CRM Origin
                </h4>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 text-sm">
                  {dossierCustomer.origin_lead ? (
                    <div className="flex flex-col">
                      <span className="text-slate-400 text-xs mb-1">Originating Lead</span>
                      <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded inline-block w-fit">
                        {dossierCustomer.origin_lead.lead_code}
                      </span>
                    </div>
                  ) : isDossierLoading ? (
                    <span className="text-slate-400 italic">Loading origin details…</span>
                  ) : (
                    <span className="text-slate-500 italic">
                      Created directly as Customer (No origin lead).
                    </span>
                  )}
                </div>
              </div>

              {/* Activity History */}
              <div>
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> Activity History
                </h4>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center text-sm text-slate-500">
                  Activity history is not yet available for Customers in the API.
                  <br />
                  <span className="text-xs text-slate-400 mt-2 block">
                    (This will be supported in a future CRM automation phase.)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBookingModal && dossierCustomer && (
        <CreateBookingModal
          customerId={dossierCustomer.id}
          onClose={() => setShowBookingModal(false)}
          onSuccess={() => {
            // Can optionally navigate to bookings or refresh customer
          }}
        />
      )}
    </div>
  );
};
