import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';
import {
  X,
  ChevronRight,
  ChevronLeft,
  User,
  Building2,
  IndianRupee,
  FileText,
  Search,
  Plus,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { handleApiError, toUserFacingError } from '../../utils/userFacingError';
import { InventoryItem } from '../../types';

// ─── Constants ────────────────────────────────────────────────────────────────
const FACING_OPTIONS = [
  'North',
  'South',
  'East',
  'West',
  'North-East',
  'North-West',
  'South-East',
  'South-West',
  'Corner',
  'Main Road',
  'East Side',
];

const TERMS_AND_CONDITIONS = [
  'Cheques/DD shall be drawn in favor of "Radha Real Home Properties" and payable at Hyderabad.',
  'As per rules and regulations of Radha Real Home Properties, the prices of plots which are facing Corner, Main Road, and East Side will be more.',
  'Upon failure of repayment of total outstanding plot amount as per the agreement they made with the company, Radha Real Home Properties has all rights to Cancel/Hold the existing Plot and allot the same plot to other customers on certain conditions.',
  'Customers can pay in flexible payment modes. Our authorized persons collect the payments in Cash, Cheques, and Cards. Once payment was received, we provide a receipt of payment confirmation on the spot to the customers for further acknowledgment purposes.',
  'Online payments shall be acknowledged by the Head Office/Branch Office after getting the statement of the Funds Transferred.',
  'Fraudulent payments shall not be entertained and accepted by Radha Real Home Properties. We are not responsible if any unauthorized persons/members are claiming themselves as authorized persons/members of Radha Real Home Properties.',
  'Cheque bounce or non-repayment of agreed installments for six consecutive months by any Member/Customer shall be treated as a non-payer and Radha Real Home Properties has all rights to Cancel the allotted Plot as per the Company Norms and late payment charges will be applicable.',
  '24% Per Annum rate of interest will be imposed on late payments on the agreed EMIs.',
  'Upon receiving 100% of payment, the management will move forward towards plot registration of the respective member/customer.',
  'Registration charges, Stamp Duty, Goods Service Tax (GST), and incidental expenses shall be upheld by the member/customer at the time of registration.',
  'Cancellation Policy: (a) In case of cancellation before agreement, full amount will be refunded to the customer within 30 working days. (b) In case of cancellation after agreement, 25% of the paid amount will be deducted and remaining amount will be refunded to the customer within 30 working days.',
  'Any legal issues subject to the transaction are under the jurisdiction of courts at Hyderabad city only.',
  'Uneven things like act of God, natural disasters, and government regulations resulting in loss to a customer/member, where the Company is not at all responsible for the unforeseen circumstances.',
  'No other person is authorized to make such promises or commitments other than the above-mentioned terms and conditions.',
  '*Registration charges actuals to be paid at last payment*',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function numberToWords(n: number): string {
  if (!n || isNaN(n)) return '';
  const ones = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const tens = [
    '',
    '',
    'Twenty',
    'Thirty',
    'Forty',
    'Fifty',
    'Sixty',
    'Seventy',
    'Eighty',
    'Ninety',
  ];

  function convert(num: number): string {
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
    if (num < 1000)
      return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + convert(num % 100) : '');
    if (num < 100000)
      return (
        convert(Math.floor(num / 1000)) +
        ' Thousand' +
        (num % 1000 ? ' ' + convert(num % 1000) : '')
      );
    if (num < 10000000)
      return (
        convert(Math.floor(num / 100000)) +
        ' Lakh' +
        (num % 100000 ? ' ' + convert(num % 100000) : '')
      );
    return (
      convert(Math.floor(num / 10000000)) +
      ' Crore' +
      (num % 10000000 ? ' ' + convert(num % 10000000) : '')
    );
  }
  return convert(Math.round(n)) + ' Rupees Only';
}

// Standard reducing-balance EMI formula (the same one banks/NBFCs use):
//   EMI = P × r × (1+r)^n / ((1+r)^n − 1),  r = monthly rate = annual% / 12 / 100
// At r = 0 this degenerates to a plain equal split (P / n), which is exactly
// the interest-free installment plan this business's printed T&C describes
// (24% p.a. is charged only as a penalty on LATE EMIs, not baked into the
// on-time schedule) — so the same formula legally covers both cases.
function computeMonthlyEMI(principal: number, annualRatePct: number, months: number): number {
  if (!months || months <= 0 || principal <= 0) return 0;
  const monthlyRate = annualRatePct > 0 ? annualRatePct / 12 / 100 : 0;
  if (monthlyRate === 0) return principal / months;
  const factor = Math.pow(1 + monthlyRate, months);
  return (principal * monthlyRate * factor) / (factor - 1);
}

interface EMIScheduleRow {
  sno: number;
  description: string;
  due_date: string;
  principal: number;
  interest: number;
  amount: number;
  balance: number;
}

function generateEMISchedule(
  principal: number,
  months: number,
  annualRatePct: number,
  overrideAmount?: number,
): {
  rows: EMIScheduleRow[];
  computedEmi: number;
  totalInterest: number;
  totalPayable: number;
  insufficientCoverage: boolean;
} {
  if (!months || months <= 0 || principal <= 0) {
    return {
      rows: [],
      computedEmi: 0,
      totalInterest: 0,
      totalPayable: 0,
      insufficientCoverage: false,
    };
  }
  const monthlyRate = annualRatePct > 0 ? annualRatePct / 12 / 100 : 0;
  const computedEmi = computeMonthlyEMI(principal, annualRatePct, months);
  const nominalEmi = overrideAmount && overrideAmount > 0 ? overrideAmount : computedEmi;

  let balance = principal;
  const rows: EMIScheduleRow[] = [];
  const startDate = new Date();
  startDate.setDate(1);
  startDate.setMonth(startDate.getMonth() + 1);
  let totalInterest = 0;
  let insufficientCoverage = false;

  for (let i = 1; i <= months; i++) {
    const due = new Date(startDate);
    due.setMonth(due.getMonth() + (i - 1));
    const interestComponent = Math.round(balance * monthlyRate);
    let principalComponent: number;
    let amount: number;
    if (i === months) {
      // Last installment always clears whatever balance remains, so the
      // schedule reconciles to the exact outstanding balance despite
      // per-row rounding.
      principalComponent = balance;
      amount = principalComponent + interestComponent;
    } else {
      principalComponent = Math.round(nominalEmi) - interestComponent;
      if (principalComponent < 0) {
        insufficientCoverage = true;
        principalComponent = 0;
      }
      principalComponent = Math.min(principalComponent, balance);
      amount = Math.round(nominalEmi);
    }
    balance = Math.max(0, balance - principalComponent);
    totalInterest += interestComponent;
    rows.push({
      sno: i,
      description: `EMI Installment ${i}`,
      due_date: due.toISOString().split('T')[0],
      principal: principalComponent,
      interest: interestComponent,
      amount,
      balance,
    });
  }

  return {
    rows,
    computedEmi: Math.round(computedEmi),
    totalInterest,
    totalPayable: principal + totalInterest,
    insufficientCoverage,
  };
}

// ─── Step components ──────────────────────────────────────────────────────────

interface StepIndicatorProps {
  steps: string[];
  current: number;
}
const StepIndicator: React.FC<StepIndicatorProps> = ({ steps, current }) => (
  <div className="flex items-center gap-0 mb-8">
    {steps.map((step, i) => (
      <React.Fragment key={i}>
        <div className="flex flex-col items-center">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
              i < current
                ? 'bg-emerald-500 border-emerald-500 text-white'
                : i === current
                  ? 'bg-navy-700 border-navy-700 text-white shadow-lg shadow-navy-200'
                  : 'bg-white border-slate-300 text-slate-400'
            }`}
          >
            {i < current ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
          </div>
          <span
            className={`text-[10px] font-semibold mt-1 text-center w-16 leading-tight ${
              i === current ? 'text-navy-700' : i < current ? 'text-emerald-600' : 'text-slate-400'
            }`}
          >
            {step}
          </span>
        </div>
        {i < steps.length - 1 && (
          <div className={`flex-1 h-0.5 mb-4 ${i < current ? 'bg-emerald-500' : 'bg-slate-200'}`} />
        )}
      </React.Fragment>
    ))}
  </div>
);

// ─── Main Wizard ──────────────────────────────────────────────────────────────

interface BookingInitiationWizardProps {
  onClose: () => void;
  onSuccess: () => void;
  isLegacyMode?: boolean;
}

export const BookingInitiationWizard: React.FC<BookingInitiationWizardProps> = ({
  onClose,
  onSuccess,
  isLegacyMode = false,
}) => {
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // ── Step 1: Customer ─────────────────────────────────────────────────────
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerSearchResults, setCustomerSearchResults] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
  });
  const [searchingCustomers, setSearchingCustomers] = useState(false);

  // ── Step 2: Property & Plot Details ──────────────────────────────────────
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  // "PROPERTY-123" or "UNIT-456" — a single <select> value that still
  // disambiguates which id to send, since a property and a unit can share
  // the same numeric id.
  const [selectedInventoryKey, setSelectedInventoryKey] = useState('');
  const [form, setForm] = useState({
    serial_no: '',
    plot_no: '',
    area_sqyd: '',
    facing: '',
    price_per_sqyd: '',
    sale_price_per_sqyd: '',
    charges_per_sqyd: '',
    // Legacy date
    legacy_booking_date: '',
    legacy_notes: '',
  });

  // ── Step 3: Financial Summary ─────────────────────────────────────────────
  const [financials, setFinancials] = useState({
    agreed_price: '',
    booking_amount: '',
    emi_months: '',
    emi_interest_rate: '0',
    emi_charges: '',
    total_cost: '',
    total_cost_words: '',
    receipt_no: '',
    receipt_date: '',
    booking_amount_words: '',
    referred_by: '',
    referred_by_code: '',
    notes: '',
  });
  const [emiRateMode, setEmiRateMode] = useState<'0' | '12' | '18' | '24' | 'custom'>('0');
  const [emiAmountOverridden, setEmiAmountOverridden] = useState(false);
  const [emiRows, setEmiRows] = useState<EMIScheduleRow[]>([]);
  const [emiComputed, setEmiComputed] = useState<{
    computedEmi: number;
    totalInterest: number;
    totalPayable: number;
    insufficientCoverage: boolean;
  }>({
    computedEmi: 0,
    totalInterest: 0,
    totalPayable: 0,
    insufficientCoverage: false,
  });

  // ── Step 4: T&C ───────────────────────────────────────────────────────────
  const [tcAccepted, setTcAccepted] = useState(false);
  const [purchaserName, setPurchaserName] = useState('');

  // ─── Load bookable inventory on mount (properties + available project units) ──
  useEffect(() => {
    fetchWithAuth(`${API_BASE_URL}/inventory?limit=200`)
      .then((r) => r.json())
      .then((d) => setInventory(d.items || []))
      .catch(() => {});
  }, []);

  // ─── Customer search ──────────────────────────────────────────────────────
  const searchCustomers = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        setCustomerSearchResults([]);
        return;
      }
      setSearchingCustomers(true);
      try {
        const res = await fetchWithAuth(
          `${API_BASE_URL}/customers?search=${encodeURIComponent(q)}`,
        );
        if (res.ok) {
          const data = await res.json();
          setCustomerSearchResults((data.customers || data).slice(0, 8));
        }
      } catch {}
      setSearchingCustomers(false);
    },
    [fetchWithAuth],
  );

  useEffect(() => {
    const t = setTimeout(() => searchCustomers(customerSearch), 300);
    return () => clearTimeout(t);
  }, [customerSearch, searchCustomers]);

  // ─── Auto-calculations ────────────────────────────────────────────────────
  useEffect(() => {
    const area = parseFloat(form.area_sqyd) || 0;
    const saleRate = parseFloat(form.sale_price_per_sqyd) || 0;
    const charges = parseFloat(form.charges_per_sqyd) || 0;
    const totalCost = area > 0 && saleRate > 0 ? area * saleRate + charges : 0;
    if (totalCost > 0) {
      setFinancials((f) => ({
        ...f,
        total_cost: totalCost.toFixed(0),
        total_cost_words: numberToWords(totalCost),
        agreed_price: f.agreed_price || totalCost.toFixed(0),
      }));
    }
  }, [form.area_sqyd, form.sale_price_per_sqyd, form.charges_per_sqyd]);

  useEffect(() => {
    const ba = parseFloat(financials.booking_amount) || 0;
    if (ba > 0) {
      setFinancials((f) => ({ ...f, booking_amount_words: numberToWords(ba) }));
    }
  }, [financials.booking_amount]);

  useEffect(() => {
    const balance = Math.max(
      0,
      (parseFloat(financials.agreed_price) || 0) - (parseFloat(financials.booking_amount) || 0),
    );
    const months = parseInt(financials.emi_months) || 0;
    const rate = parseFloat(financials.emi_interest_rate) || 0;
    const overrideAmount = emiAmountOverridden
      ? parseFloat(financials.emi_charges) || 0
      : undefined;

    if (months > 0 && balance > 0) {
      const result = generateEMISchedule(balance, months, rate, overrideAmount);
      setEmiRows(result.rows);
      setEmiComputed(result);
      // Keep the displayed/submitted EMI amount in sync with the computed
      // figure unless the user has explicitly chosen to override it. Setting
      // financials here (while also depending on financials.emi_charges
      // below) is safe: this branch only runs when NOT overridden, and it
      // writes the same computed value every time balance/months/rate are
      // unchanged, so it converges instead of looping.
      if (!emiAmountOverridden && financials.emi_charges !== String(result.computedEmi)) {
        setFinancials((f) => ({ ...f, emi_charges: String(result.computedEmi) }));
      }
    } else {
      setEmiRows([]);
      setEmiComputed({
        computedEmi: 0,
        totalInterest: 0,
        totalPayable: 0,
        insufficientCoverage: false,
      });
    }
  }, [
    financials.agreed_price,
    financials.booking_amount,
    financials.emi_months,
    financials.emi_interest_rate,
    financials.emi_charges,
    emiAmountOverridden,
  ]);

  // ─── Validation per step ──────────────────────────────────────────────────
  const canProceed = () => {
    if (step === 0) {
      if (isNewCustomer)
        return newCustomer.first_name.trim() && newCustomer.phone.trim().length >= 10;
      return !!selectedCustomer;
    }
    if (step === 1) return !!selectedInventoryKey;
    if (step === 2) return !!financials.agreed_price && !!financials.booking_amount;
    if (step === 3) return tcAccepted && purchaserName.trim().length >= 2;
    return true;
  };

  // ─── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const [inventoryKind, inventoryIdStr] = selectedInventoryKey.split('-');
      const inventoryId = parseInt(inventoryIdStr, 10);
      const payload: any = {
        ...(inventoryKind === 'UNIT'
          ? { project_unit_id: inventoryId }
          : { property_id: inventoryId }),
        agreed_price: parseFloat(financials.agreed_price),
        booking_amount: parseFloat(financials.booking_amount),
        notes: financials.notes || undefined,
        // Form fields
        serial_no: form.serial_no || undefined,
        plot_no: form.plot_no || undefined,
        area_sqyd: parseFloat(form.area_sqyd) || undefined,
        facing: form.facing || undefined,
        price_per_sqyd: parseFloat(form.price_per_sqyd) || undefined,
        sale_price_per_sqyd: parseFloat(form.sale_price_per_sqyd) || undefined,
        charges_per_sqyd: parseFloat(form.charges_per_sqyd) || undefined,
        emi_months: parseInt(financials.emi_months) || undefined,
        emi_charges: parseFloat(financials.emi_charges) || undefined,
        emi_interest_rate: parseFloat(financials.emi_interest_rate) || undefined,
        total_cost: parseFloat(financials.total_cost) || undefined,
        total_cost_words: financials.total_cost_words || undefined,
        receipt_no: financials.receipt_no || undefined,
        receipt_date: financials.receipt_date || undefined,
        booking_amount_words: financials.booking_amount_words || undefined,
        referred_by: financials.referred_by || undefined,
        referred_by_code: financials.referred_by_code || undefined,
        tc_accepted_by_name: purchaserName,
        is_legacy: isLegacyMode,
        legacy_booking_date: form.legacy_booking_date || undefined,
        legacy_notes: form.legacy_notes || undefined,
      };

      if (isNewCustomer) {
        payload.new_customer = {
          first_name: newCustomer.first_name,
          last_name: newCustomer.last_name || undefined,
          phone: newCustomer.phone,
          email: newCustomer.email || undefined,
        };
      } else {
        payload.customer_id = selectedCustomer.id;
      }

      const res = await fetchWithAuth(`${API_BASE_URL}/bookings/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showToast(
          isLegacyMode
            ? 'Legacy booking submitted — awaiting MD approval.'
            : 'Booking form submitted! Awaiting MD approval.',
          'success',
        );
        onSuccess();
        onClose();
      } else {
        const data = await res.json();
        await handleApiError(res, showError, data);
      }
    } catch (e) {
      showError(
        toUserFacingError({ message: e instanceof Error ? e.message : String(e), body: e }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const STEPS = ['Customer', 'Plot Details', 'Financials', 'Terms & Sign'];

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[96vh] flex flex-col overflow-hidden border border-slate-100">
        {/* Header */}
        <div
          className={`px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0 ${
            isLegacyMode
              ? 'bg-gradient-to-r from-amber-50 to-orange-50'
              : 'bg-gradient-to-r from-navy-50 to-slate-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                isLegacyMode ? 'bg-amber-100' : 'bg-navy-100'
              }`}
            >
              {isLegacyMode ? (
                <RotateCcw className="w-4 h-4 text-amber-700" />
              ) : (
                <FileText className="w-4 h-4 text-navy-700" />
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                {isLegacyMode ? 'Add Legacy Booking' : 'New Booking Initiation'}
              </h2>
              <p className="text-[11px] text-slate-500">
                {isLegacyMode
                  ? 'Backdated entry from paper records'
                  : 'Radha Real Home Properties — Official Form'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="px-6 pt-5 flex-shrink-0">
          <StepIndicator steps={STEPS} current={step} />
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 pb-4">
          {/* ── STEP 0: Customer ─────────────────────────────── */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <User className="w-4 h-4 text-navy-600" />
                <h3 className="font-bold text-slate-800">Select Customer</h3>
              </div>

              {/* Toggle: existing vs new */}
              <div className="flex rounded-xl overflow-hidden border border-slate-200 mb-4">
                <button
                  onClick={() => setIsNewCustomer(false)}
                  className={`flex-1 py-2.5 text-xs font-bold transition-colors ${!isNewCustomer ? 'bg-navy-700 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >
                  Existing Customer
                </button>
                <button
                  onClick={() => setIsNewCustomer(true)}
                  className={`flex-1 py-2.5 text-xs font-bold transition-colors flex items-center justify-center gap-1 ${isNewCustomer ? 'bg-navy-700 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >
                  <Plus className="w-3 h-3" /> New Customer
                </button>
              </div>

              {!isNewCustomer ? (
                <div>
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search by name or phone..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                    />
                    {searchingCustomers && (
                      <Loader2 className="absolute right-3 top-3 w-4 h-4 text-slate-400 animate-spin" />
                    )}
                  </div>

                  {selectedCustomer && (
                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-bold text-emerald-800">
                          {selectedCustomer.first_name} {selectedCustomer.last_name}
                        </p>
                        <p className="text-xs text-emerald-600">
                          {selectedCustomer.phone} • {selectedCustomer.customer_code}
                        </p>
                      </div>
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    </div>
                  )}

                  {customerSearchResults.length > 0 && !selectedCustomer && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                      {customerSearchResults.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setSelectedCustomer(c);
                            setCustomerSearchResults([]);
                            setCustomerSearch('');
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
                        >
                          <p className="text-sm font-semibold text-slate-800">
                            {c.first_name} {c.last_name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {c.phone} • {c.customer_code}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}

                  {customerSearch.length >= 2 &&
                    customerSearchResults.length === 0 &&
                    !searchingCustomers &&
                    !selectedCustomer && (
                      <p className="text-xs text-slate-400 text-center py-4">
                        No customers found. Try "New Customer" tab.
                      </p>
                    )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        First Name *
                      </label>
                      <input
                        required
                        value={newCustomer.first_name}
                        onChange={(e) =>
                          setNewCustomer({ ...newCustomer, first_name: e.target.value })
                        }
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                        placeholder="First name"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Last Name
                      </label>
                      <input
                        value={newCustomer.last_name}
                        onChange={(e) =>
                          setNewCustomer({ ...newCustomer, last_name: e.target.value })
                        }
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                        placeholder="Last name"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Mobile Number *
                    </label>
                    <input
                      required
                      type="tel"
                      value={newCustomer.phone}
                      onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                      placeholder="10-digit mobile"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Email (Optional)
                    </label>
                    <input
                      type="email"
                      value={newCustomer.email}
                      onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                      placeholder="email@example.com"
                    />
                  </div>
                </div>
              )}

              {/* Legacy date for backdated entries */}
              {isLegacyMode && (
                <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-xs font-bold text-amber-800 mb-3 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> Legacy Mode — Backdated Entry
                  </p>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Original Booking Date *
                    </label>
                    <input
                      type="date"
                      value={form.legacy_booking_date}
                      onChange={(e) => setForm({ ...form, legacy_booking_date: e.target.value })}
                      className="w-full px-3 py-2.5 border border-amber-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 1: Property & Plot ───────────────────────── */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="w-4 h-4 text-navy-600" />
                <h3 className="font-bold text-slate-800">Property & Plot Details</h3>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Select Property or Project Unit *
                </label>
                <select
                  required
                  value={selectedInventoryKey}
                  onChange={(e) => setSelectedInventoryKey(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 bg-white"
                >
                  <option value="">-- Select available inventory --</option>
                  {inventory.filter((i) => i.kind === 'PROPERTY').length > 0 && (
                    <optgroup label="Individual Properties">
                      {inventory
                        .filter((i) => i.kind === 'PROPERTY')
                        .map((p) => (
                          <option key={`PROPERTY-${p.id}`} value={`PROPERTY-${p.id}`}>
                            {p.title} {p.price ? `— ₹${p.price.toLocaleString()}` : ''}
                          </option>
                        ))}
                    </optgroup>
                  )}
                  {inventory.filter((i) => i.kind === 'UNIT').length > 0 && (
                    <optgroup label="Project Units">
                      {inventory
                        .filter((i) => i.kind === 'UNIT')
                        .map((u) => (
                          <option key={`UNIT-${u.id}`} value={`UNIT-${u.id}`}>
                            {u.project_name} — Unit {u.unit_number}{' '}
                            {u.price ? `— ₹${u.price.toLocaleString()}` : ''}
                          </option>
                        ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Serial No.</label>
                  <input
                    value={form.serial_no}
                    onChange={(e) => setForm({ ...form, serial_no: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                    placeholder="e.g. 001"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Plot No.</label>
                  <input
                    value={form.plot_no}
                    onChange={(e) => setForm({ ...form, plot_no: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                    placeholder="e.g. P-42"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Area (Sq.Yds)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.area_sqyd}
                    onChange={(e) => setForm({ ...form, area_sqyd: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                    placeholder="e.g. 150"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Facing</label>
                  <select
                    value={form.facing}
                    onChange={(e) => setForm({ ...form, facing: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 bg-white"
                  >
                    <option value="">-- Select facing --</option>
                    {FACING_OPTIONS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Price/Sq.Yd (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.price_per_sqyd}
                    onChange={(e) => setForm({ ...form, price_per_sqyd: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                    placeholder="Base price"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Sale Price/Sq.Yd (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.sale_price_per_sqyd}
                    onChange={(e) => setForm({ ...form, sale_price_per_sqyd: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                    placeholder="Sale price"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Charges/Sq.Yd (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.charges_per_sqyd}
                    onChange={(e) => setForm({ ...form, charges_per_sqyd: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                    placeholder="Extra charges"
                  />
                </div>
              </div>

              {/* Auto-calculated total cost preview */}
              {financials.total_cost && parseFloat(financials.total_cost) > 0 && (
                <div className="bg-navy-50 border border-navy-200 rounded-xl p-3">
                  <p className="text-xs text-navy-600 font-semibold">Auto-calculated Total Cost</p>
                  <p className="text-lg font-bold text-navy-800">
                    ₹{parseFloat(financials.total_cost).toLocaleString()}
                  </p>
                  <p className="text-[11px] text-navy-500 italic">{financials.total_cost_words}</p>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: Financial Summary ─────────────────────── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <IndianRupee className="w-4 h-4 text-navy-600" />
                <h3 className="font-bold text-slate-800">Financial Summary & Payment Schedule</h3>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Total Cost (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={financials.total_cost}
                    onChange={(e) =>
                      setFinancials({
                        ...financials,
                        total_cost: e.target.value,
                        total_cost_words: numberToWords(parseFloat(e.target.value) || 0),
                      })
                    }
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 font-bold"
                    placeholder="Agreed total"
                  />
                  {financials.total_cost_words && (
                    <p className="text-[10px] text-slate-400 mt-0.5 italic">
                      {financials.total_cost_words}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Agreed Sale Price (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={financials.agreed_price}
                    onChange={(e) => setFinancials({ ...financials, agreed_price: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                    placeholder="Final agreed price"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">EMI Months</label>
                  <input
                    type="number"
                    min="1"
                    value={financials.emi_months}
                    onChange={(e) => setFinancials({ ...financials, emi_months: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                    placeholder="e.g. 12"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Interest Rate (% p.a.)
                  </label>
                  <select
                    value={emiRateMode}
                    onChange={(e) => {
                      const mode = e.target.value as typeof emiRateMode;
                      setEmiRateMode(mode);
                      if (mode !== 'custom')
                        setFinancials((f) => ({ ...f, emi_interest_rate: mode }));
                    }}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 bg-white"
                  >
                    <option value="0">0% — Interest-free installment plan</option>
                    <option value="12">12% p.a.</option>
                    <option value="18">18% p.a.</option>
                    <option value="24">24% p.a. (standard late-fee rate)</option>
                    <option value="custom">Custom rate...</option>
                  </select>
                  {emiRateMode === 'custom' && (
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={financials.emi_interest_rate}
                      onChange={(e) =>
                        setFinancials({ ...financials, emi_interest_rate: e.target.value })
                      }
                      className="w-full mt-1.5 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                      placeholder="Custom % p.a."
                    />
                  )}
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">EMI Amount/Month (₹)</label>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={emiAmountOverridden}
                      onChange={(e) => {
                        setEmiAmountOverridden(e.target.checked);
                        if (!e.target.checked)
                          setFinancials((f) => ({
                            ...f,
                            emi_charges: String(emiComputed.computedEmi),
                          }));
                      }}
                      className="w-3.5 h-3.5 rounded border-slate-300 text-navy-600 focus:ring-navy-500"
                    />
                    Override with a custom amount
                  </label>
                </div>
                <input
                  type="number"
                  min="0"
                  value={financials.emi_charges}
                  disabled={!emiAmountOverridden}
                  onChange={(e) => setFinancials({ ...financials, emi_charges: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-navy-500 disabled:bg-slate-100 disabled:text-slate-500"
                  placeholder="Monthly EMI"
                />
                {!emiAmountOverridden && (
                  <p className="text-[10px] text-slate-400 italic">
                    Auto-calculated using the standard reducing-balance EMI formula on the balance
                    amount, tenure, and interest rate above.
                  </p>
                )}
                {emiComputed.insufficientCoverage && (
                  <p className="text-[10px] text-danger-600 font-semibold flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> This EMI amount doesn't fully cover the
                    monthly interest — increase the amount or tenure.
                  </p>
                )}
              </div>

              {/* EMI Schedule Table */}
              {emiRows.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-slate-600">
                      Balance Payment Schedule (Auto-generated)
                    </p>
                    {emiComputed.totalInterest > 0 && (
                      <p className="text-[10px] text-slate-500">
                        Total Interest:{' '}
                        <strong className="text-slate-700">
                          ₹{emiComputed.totalInterest.toLocaleString()}
                        </strong>
                        {' · '}Total Payable:{' '}
                        <strong className="text-slate-700">
                          ₹{emiComputed.totalPayable.toLocaleString()}
                        </strong>
                      </p>
                    )}
                  </div>
                  <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-bold text-slate-600 border-b border-slate-200">
                            S.No
                          </th>
                          <th className="px-3 py-2 text-left font-bold text-slate-600 border-b border-slate-200">
                            Balance Payment Details
                          </th>
                          <th className="px-3 py-2 text-left font-bold text-slate-600 border-b border-slate-200">
                            Due Date
                          </th>
                          {emiComputed.totalInterest > 0 && (
                            <>
                              <th className="px-3 py-2 text-right font-bold text-slate-600 border-b border-slate-200">
                                Principal (₹)
                              </th>
                              <th className="px-3 py-2 text-right font-bold text-slate-600 border-b border-slate-200">
                                Interest (₹)
                              </th>
                            </>
                          )}
                          <th className="px-3 py-2 text-right font-bold text-slate-600 border-b border-slate-200">
                            Amount (₹)
                          </th>
                          {emiComputed.totalInterest > 0 && (
                            <th className="px-3 py-2 text-right font-bold text-slate-600 border-b border-slate-200">
                              Balance After (₹)
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {emiRows.map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-mono text-slate-600">{row.sno}</td>
                            <td className="px-3 py-2">
                              <input
                                value={row.description}
                                onChange={(e) => {
                                  const updated = [...emiRows];
                                  updated[i] = { ...updated[i], description: e.target.value };
                                  setEmiRows(updated);
                                }}
                                className="w-full bg-transparent border-none outline-none text-slate-700"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="date"
                                value={row.due_date}
                                onChange={(e) => {
                                  const updated = [...emiRows];
                                  updated[i] = { ...updated[i], due_date: e.target.value };
                                  setEmiRows(updated);
                                }}
                                className="w-full bg-transparent border-none outline-none text-slate-700"
                              />
                            </td>
                            {emiComputed.totalInterest > 0 && (
                              <>
                                <td className="px-3 py-2 text-right text-slate-600">
                                  ₹{row.principal.toLocaleString()}
                                </td>
                                <td className="px-3 py-2 text-right text-slate-600">
                                  ₹{row.interest.toLocaleString()}
                                </td>
                              </>
                            )}
                            <td className="px-3 py-2 text-right font-bold text-slate-800">
                              ₹{row.amount.toLocaleString()}
                            </td>
                            {emiComputed.totalInterest > 0 && (
                              <td className="px-3 py-2 text-right text-slate-500">
                                ₹{row.balance.toLocaleString()}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 italic text-center">
                    *Registration charges actuals to be paid at last payment*
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Booking Amt (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={financials.booking_amount}
                    onChange={(e) =>
                      setFinancials({ ...financials, booking_amount: e.target.value })
                    }
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 font-bold"
                    placeholder="Token amount paid"
                  />
                  {financials.booking_amount_words && (
                    <p className="text-[10px] text-slate-400 mt-0.5 italic">
                      {financials.booking_amount_words}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Balance Amount (₹)
                  </label>
                  <div className="px-3 py-2.5 bg-rose-50 border border-rose-200 rounded-xl text-sm font-bold text-rose-700">
                    ₹
                    {Math.max(
                      0,
                      (parseFloat(financials.agreed_price) || 0) -
                        (parseFloat(financials.booking_amount) || 0),
                    ).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Receipt No.</label>
                  <input
                    value={financials.receipt_no}
                    onChange={(e) => setFinancials({ ...financials, receipt_no: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                    placeholder="Receipt number"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Receipt Date
                  </label>
                  <input
                    type="date"
                    value={financials.receipt_date}
                    onChange={(e) => setFinancials({ ...financials, receipt_date: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Referred By</label>
                  <input
                    value={financials.referred_by}
                    onChange={(e) => setFinancials({ ...financials, referred_by: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                    placeholder="Referrer name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Referral Code
                  </label>
                  <input
                    value={financials.referred_by_code}
                    onChange={(e) =>
                      setFinancials({ ...financials, referred_by_code: e.target.value })
                    }
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                    placeholder="Agent code"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Additional Notes
                </label>
                <textarea
                  value={financials.notes}
                  onChange={(e) => setFinancials({ ...financials, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                  placeholder="Special conditions or remarks..."
                />
              </div>
            </div>
          )}

          {/* ── STEP 3: Terms & Conditions ───────────────────── */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-navy-600" />
                <h3 className="font-bold text-slate-800">
                  Terms & Conditions — Radha Real Home Properties
                </h3>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 max-h-56 overflow-y-auto space-y-3">
                {TERMS_AND_CONDITIONS.map((clause, i) => (
                  <div key={i} className="flex gap-2.5 text-xs text-slate-700">
                    <span className="text-navy-600 font-bold mt-0.5 flex-shrink-0">{i + 1}.</span>
                    <p
                      className={
                        clause.startsWith('*') ? 'font-bold text-navy-800 text-center w-full' : ''
                      }
                    >
                      {clause}
                    </p>
                  </div>
                ))}
              </div>

              <label
                className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  tcAccepted
                    ? 'border-emerald-400 bg-emerald-50'
                    : 'border-slate-200 bg-white hover:border-navy-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={tcAccepted}
                  onChange={(e) => setTcAccepted(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-xs font-semibold text-slate-700 leading-relaxed">
                  I do, hereby declare that I have fully satisfied myself after visiting the project
                  site and <strong>accept the terms and conditions</strong> as mentioned above by
                  Radha Real Home Properties.
                </span>
              </label>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Name of the Purchaser *
                </label>
                <input
                  required
                  value={purchaserName}
                  onChange={(e) => setPurchaserName(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                  placeholder="Full name as per documents"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  This name will appear on the booking form as the purchaser's declaration.
                </p>
              </div>

              {/* Form summary */}
              <div className="bg-navy-50 border border-navy-200 rounded-xl p-4 space-y-2">
                <p className="text-xs font-bold text-navy-800 mb-2">📋 Booking Summary</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div>
                    <span className="text-slate-500">Customer:</span>{' '}
                    <strong>
                      {selectedCustomer
                        ? `${selectedCustomer.first_name} ${selectedCustomer.last_name || ''}`
                        : `${newCustomer.first_name} ${newCustomer.last_name}`}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Plot No:</span>{' '}
                    <strong>{form.plot_no || '—'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Area:</span>{' '}
                    <strong>{form.area_sqyd ? `${form.area_sqyd} Sq.Yds` : '—'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Facing:</span>{' '}
                    <strong>{form.facing || '—'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Total Cost:</span>{' '}
                    <strong>₹{parseFloat(financials.total_cost || '0').toLocaleString()}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Token Paid:</span>{' '}
                    <strong>
                      ₹{parseFloat(financials.booking_amount || '0').toLocaleString()}
                    </strong>
                  </div>
                  {emiRows.length > 0 && (
                    <>
                      <div>
                        <span className="text-slate-500">EMI Plan:</span>{' '}
                        <strong>
                          {financials.emi_months} months @ ₹
                          {parseFloat(financials.emi_charges || '0').toLocaleString()}/mo
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Interest Rate:</span>{' '}
                        <strong>
                          {parseFloat(financials.emi_interest_rate) > 0
                            ? `${financials.emi_interest_rate}% p.a.`
                            : 'Interest-free'}
                        </strong>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {isLegacyMode && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <p className="text-xs text-amber-700 font-medium">
                    Legacy booking — will still require MD approval before it becomes active in the
                    system.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer with navigation */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-between items-center flex-shrink-0 bg-slate-50/50">
          <button
            onClick={step === 0 ? onClose : () => setStep((s) => s - 1)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> {step === 0 ? 'Cancel' : 'Back'}
          </button>

          <div className="text-[11px] text-slate-400 font-medium">
            Step {step + 1} of {STEPS.length}
          </div>

          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canProceed()}
              className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold text-white bg-navy-700 hover:bg-navy-800 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!canProceed() || submitting}
              className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              {submitting ? 'Submitting...' : 'Submit for MD Approval'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
