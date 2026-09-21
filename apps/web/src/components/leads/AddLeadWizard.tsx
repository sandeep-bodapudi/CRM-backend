import React, { useState } from 'react';
import {
  User,
  Phone,
  Mail,
  Building,
  CheckCircle2,
  IndianRupee,
  Clock,
  ArrowRight,
  ArrowLeft,
  X,
  MessageSquare,
  AlertCircle,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import { useToast } from '../../context/ToastContext';
import { PROPERTY_TYPE_OPTIONS, getPropertyTypeLabel } from '../../constants/propertyTypes';
import { handleApiError, toUserFacingError } from '../../utils/userFacingError';
import { LocationListInput } from '../common/ui/LocationListInput';

interface AddLeadWizardProps {
  onClose: () => void;
  onSuccess: () => void;
  users: { id: number; name: string }[];
}

export const AddLeadWizard: React.FC<AddLeadWizardProps> = ({ onClose, onSuccess, users }) => {
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();

  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Step 1: Contact
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [source, setSource] = useState('ORGANIC_SEARCH');

  // Phase 4: Marketing Attribution
  const [campaign, setCampaign] = useState('');
  const [utmSource, setUtmSource] = useState('');
  const [utmMedium, setUtmMedium] = useState('');
  const [utmCampaign, setUtmCampaign] = useState('');
  const [referralPersonName, setReferralPersonName] = useState('');
  const [referralEmployeeId, setReferralEmployeeId] = useState('');

  // Step 2: Requirements (Quick Selects)
  const [propertyType, setPropertyType] = useState('RESIDENTIAL_APARTMENT');
  const [bhkPreference, setBhkPreference] = useState('');
  const [preferredLocations, setPreferredLocations] = useState<string[]>([]);

  // Step 3: Budget & Financing
  const [budgetRange, setBudgetRange] = useState('');
  const [buyingTimeline, setBuyingTimeline] = useState('');
  const [purpose, setPurpose] = useState('');
  const [requiresLoan, setRequiresLoan] = useState<boolean | null>(null);

  // Step 4: Final Notes
  const [notes, setNotes] = useState('');
  // Assignment defaults to the performance-weighted distribution engine
  // (POOL); "Assign to Me" (DIRECT) keeps the lead with whoever's adding
  // it, so a self-sourced contact doesn't get handed to a teammate.
  const [ownershipType, setOwnershipType] = useState<'POOL' | 'DIRECT'>('POOL');

  const handleNext = () => setStep((s) => Math.min(s + 1, 4));
  const handleBack = () => setStep((s) => Math.max(s - 1, 1));

  const handleSubmit = async () => {
    if (!customerName || !phone) {
      showError({ message: 'Name and Phone are required' });
      return;
    }

    setIsLoading(true);

    // Compile all the quick-select answers into a structured note if we don't have DB columns for them yet
    let structuredNotes = `[Lead Capture Summary]\n`;
    if (bhkPreference) structuredNotes += `- BHK: ${bhkPreference}\n`;
    if (budgetRange) structuredNotes += `- Budget: ${budgetRange}\n`;
    if (buyingTimeline) structuredNotes += `- Timeline: ${buyingTimeline}\n`;
    if (purpose) structuredNotes += `- Purpose: ${purpose}\n`;
    if (requiresLoan !== null) structuredNotes += `- Needs Loan: ${requiresLoan ? 'Yes' : 'No'}\n`;
    if (notes) structuredNotes += `\n[Agent Notes]\n${notes}`;

    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName,
          phone,
          email,
          source,
          property_type_preference: propertyType,
          preferred_locations: preferredLocations,
          notes: structuredNotes,
          campaign: campaign || null,
          utm_source: utmSource || null,
          utm_medium: utmMedium || null,
          utm_campaign: utmCampaign || null,
          referral_person_name: source === 'REFERRAL' ? referralPersonName || null : null,
          referral_employee_id:
            source === 'REFERRAL' && referralEmployeeId ? parseInt(referralEmployeeId, 10) : null,
          // budget_max could be parsed from budgetRange if needed, skipping for now as it's in notes
          ownership_type: ownershipType,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        showToast(`Lead Captured Successfully! ID: ${data.lead.lead_code}`, 'success');
        onSuccess();
      } else {
        if (res.status === 409) {
          showError({ message: `Duplicate Lead: ${data.error}` });
        } else {
          await handleApiError(res, showError, data);
        }
      }
    } catch (e) {
      showError(
        toUserFacingError({ message: e instanceof Error ? e.message : String(e), body: e }),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-6 animate-fadeIn">
            {/* Lead Attribution Badge */}
            <div className="flex items-center gap-3 bg-navy-50 border border-navy-100 rounded-2xl px-4 py-3">
              <div className="p-1.5 bg-navy-100 rounded-lg flex-shrink-0">
                <ShieldCheck className="w-4 h-4 text-navy-600" />
              </div>
              <div>
                <span className="text-navy-500 text-[9px] uppercase font-black tracking-widest block">
                  Introduced By
                </span>
                <span className="text-navy-900 text-xs font-bold">
                  You — automatically recorded
                </span>
                <span className="text-navy-400 text-[9px] block">
                  Attribution credit is assigned to you and cannot be changed
                </span>
              </div>
            </div>

            <div className="bg-navy-50 border-l-4 border-navy-500 p-4 rounded-r-xl mb-6">
              <h3 className="font-bold text-navy-900 text-sm flex items-center gap-2">
                <MessageSquare className="w-4 h-4" /> Lead Capture Prompt:
              </h3>
              <p className="text-navy-800 text-xs mt-1 italic">
                "Hello, am I speaking with [Name]? I'm calling from Radha Real Homes regarding your
                recent inquiry..."
              </p>
            </div>

            <h2 className="text-2xl font-bold text-slate-800">Contact Details</h2>

            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Customer Name *
                </label>
                <div className="relative">
                  <User className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    autoFocus
                    className="w-full p-3 pl-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500 font-bold"
                    placeholder="e.g. Rahul Sharma"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Phone Number *
                </label>
                <div className="relative">
                  <Phone className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full p-3 pl-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500 font-bold font-mono text-lg"
                    placeholder="98765 43210"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full p-3 pl-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500 text-sm"
                      placeholder="Optional"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Lead Source</label>
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500 text-sm font-semibold"
                  >
                    <option value="ORGANIC_SEARCH">Organic / Website</option>
                    <option value="FACEBOOK_ADS">Facebook / Instagram Ads</option>
                    <option value="GOOGLE_ADS">Google Ads</option>
                    <option value="HOUSING_COM">Housing.com</option>
                    <option value="WALK_IN">Direct Walk-in</option>
                    <option value="REFERRAL">Referral</option>
                    <option value="MANUAL_ENTRY">Manual Entry</option>
                  </select>
                </div>
              </div>

              {source === 'REFERRAL' && (
                <div className="mt-4 p-4 border border-slate-200 rounded-xl bg-slate-50">
                  <h4 className="text-sm font-bold text-slate-800 mb-3">Referral Details</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Referral Person Name
                      </label>
                      <input
                        type="text"
                        value={referralPersonName}
                        onChange={(e) => setReferralPersonName(e.target.value)}
                        className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500 text-sm"
                        placeholder="Name of referrer"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Referral Employee ID
                      </label>
                      <input
                        type="number"
                        value={referralEmployeeId}
                        onChange={(e) => setReferralEmployeeId(e.target.value)}
                        className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500 text-sm"
                        placeholder="Optional Employee ID"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-6 pt-6 border-t border-slate-200">
                <h4 className="text-sm font-bold text-slate-800 mb-4">
                  Advanced Marketing Attribution
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Campaign</label>
                    <input
                      type="text"
                      value={campaign}
                      onChange={(e) => setCampaign(e.target.value)}
                      className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500 text-sm"
                      placeholder="e.g. Summer Sale"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      UTM Source
                    </label>
                    <input
                      type="text"
                      value={utmSource}
                      onChange={(e) => setUtmSource(e.target.value)}
                      className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500 text-sm"
                      placeholder="e.g. google"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      UTM Medium
                    </label>
                    <input
                      type="text"
                      value={utmMedium}
                      onChange={(e) => setUtmMedium(e.target.value)}
                      className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500 text-sm"
                      placeholder="e.g. cpc"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      UTM Campaign
                    </label>
                    <input
                      type="text"
                      value={utmCampaign}
                      onChange={(e) => setUtmCampaign(e.target.value)}
                      className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500 text-sm"
                      placeholder="e.g. summer_sale"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl mb-6">
              <h3 className="font-bold text-amber-900 text-sm flex items-center gap-2">
                <MessageSquare className="w-4 h-4" /> Lead Capture Prompt:
              </h3>
              <p className="text-amber-800 text-xs mt-1 italic">
                "Are you looking for an Apartment, Villa, or a Plot? And which areas are you
                primarily focusing on?"
              </p>
            </div>

            <h2 className="text-2xl font-bold text-slate-800">Property Requirements</h2>

            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">Property Type</label>
                <div className="flex flex-wrap gap-2">
                  {PROPERTY_TYPE_OPTIONS.map((pt) => (
                    <button
                      key={pt.value}
                      onClick={() => setPropertyType(pt.value)}
                      className={`px-4 py-2 rounded-full border text-sm font-bold transition-colors ${propertyType === pt.value ? 'bg-navy-600 text-white border-navy-700 shadow-md' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                    >
                      {pt.label}
                    </button>
                  ))}
                </div>
              </div>

              {['RESIDENTIAL_APARTMENT', 'RESIDENTIAL_VILLA'].includes(propertyType) && (
                <div className="animate-fadeIn">
                  <label className="block text-xs font-bold text-slate-700 mb-2">
                    BHK Preference
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {['1 BHK', '2 BHK', '2.5 BHK', '3 BHK', '4+ BHK'].map((bhk) => (
                      <button
                        key={bhk}
                        onClick={() => setBhkPreference(bhk)}
                        className={`px-4 py-2 rounded-xl border text-sm font-bold transition-colors ${bhkPreference === bhk ? 'bg-navy-600 text-white border-navy-700' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                      >
                        {bhk}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <LocationListInput
                label="Preferred Location(s) / Area"
                values={preferredLocations}
                onChange={setPreferredLocations}
                placeholder="e.g. Miyapur, Gachibowli, or Any"
              />
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded-r-xl mb-6">
              <h3 className="font-bold text-emerald-900 text-sm flex items-center gap-2">
                <MessageSquare className="w-4 h-4" /> Lead Capture Prompt:
              </h3>
              <p className="text-emerald-800 text-xs mt-1 italic">
                "What is your comfortable budget range? Are you planning to buy immediately or
                within a few months? Do you need assistance with bank loans?"
              </p>
            </div>

            <h2 className="text-2xl font-bold text-slate-800">Budget & Timeline</h2>

            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">Budget Range</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    'Under 50L',
                    '50L - 80L',
                    '80L - 1.2Cr',
                    '1.2Cr - 2Cr',
                    '2Cr - 5Cr',
                    '5Cr+',
                  ].map((budget) => (
                    <button
                      key={budget}
                      onClick={() => setBudgetRange(budget)}
                      className={`px-3 py-3 rounded-xl border text-sm font-bold transition-colors flex items-center justify-center gap-1 ${budgetRange === budget ? 'bg-emerald-600 text-white border-emerald-700 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                    >
                      <IndianRupee className="w-3.5 h-3.5" /> {budget}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Buying Timeline
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    'Immediate (Ready to move)',
                    '1 - 3 Months',
                    '3 - 6 Months',
                    'Just exploring (6+ Months)',
                  ].map((time) => (
                    <button
                      key={time}
                      onClick={() => setBuyingTimeline(time)}
                      className={`px-4 py-2 rounded-xl border text-sm font-bold transition-colors ${buyingTimeline === time ? 'bg-violet-600 text-white border-violet-700' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                    >
                      {time}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2">
                    Purpose of Purchase
                  </label>
                  <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button
                      onClick={() => setPurpose('End-Use')}
                      className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${purpose === 'End-Use' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                    >
                      End-Use
                    </button>
                    <button
                      onClick={() => setPurpose('Investment')}
                      className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${purpose === 'Investment' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                    >
                      Investment
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2">
                    Requires Bank Loan?
                  </label>
                  <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button
                      onClick={() => setRequiresLoan(true)}
                      className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${requiresLoan === true ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setRequiresLoan(false)}
                      className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${requiresLoan === false ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                    >
                      No
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6 animate-fadeIn">
            <h2 className="text-2xl font-bold text-slate-800">Final Notes & Summary</h2>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-4 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-3 border-b border-slate-200 pb-2">
                Lead Snapshot
              </h3>
              <div className="grid grid-cols-2 text-sm gap-y-3">
                <div>
                  <span className="text-slate-400 block text-xs">Name & Phone</span>
                  <span className="font-semibold text-navy-800">
                    {customerName} - {phone}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-xs">Requirement</span>
                  <span className="font-semibold">
                    {getPropertyTypeLabel(propertyType)} {bhkPreference ? `(${bhkPreference})` : ''}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-xs">Budget</span>
                  <span className="font-semibold">{budgetRange || 'Not specified'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-xs">Timeline</span>
                  <span className="font-semibold">{buyingTimeline || 'Not specified'}</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Agent Notes (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="Any specific requests, objections, or general summary of the call..."
                className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-navy-500 text-sm"
              ></textarea>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                Assign this lead to
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setOwnershipType('DIRECT')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    ownershipType === 'DIRECT'
                      ? 'border-navy-600 bg-navy-50/50 text-navy-900 font-bold'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="text-sm">Assign to Me</div>
                  <p className="text-[11px] text-slate-500 font-normal mt-1">
                    Keep this lead — skip auto-distribution.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setOwnershipType('POOL')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    ownershipType === 'POOL'
                      ? 'border-navy-600 bg-navy-50/50 text-navy-900 font-bold'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="text-sm">Add to Pool</div>
                  <p className="text-[11px] text-slate-500 font-normal mt-1">
                    Auto-distribute by performance & load.
                  </p>
                </button>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-0 md:p-6">
      <div className="w-full h-full md:h-auto md:max-h-[85vh] max-w-3xl bg-white md:rounded-3xl shadow-2xl flex flex-col relative overflow-hidden animate-scaleUp">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-white sticky top-0 z-10">
          <div className="flex items-center gap-2 text-navy-700 font-bold">
            <Phone className="w-5 h-5" />
            <span>Lead Capture</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Progress */}
        <div className="flex bg-slate-50 border-b border-slate-100 px-6 py-3">
          {[1, 2, 3, 4].map((num) => (
            <div key={num} className="flex-1 flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step >= num ? 'bg-navy-600 text-white' : 'bg-slate-200 text-slate-400'}`}
              >
                {num}
              </div>
              {num < 4 && (
                <div
                  className={`flex-1 h-1 mx-2 rounded-full transition-colors ${step > num ? 'bg-navy-600' : 'bg-slate-200'}`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 p-6 md:p-8 overflow-y-auto bg-white custom-scrollbar">
          {renderStepContent()}
        </div>

        {/* Footer Navigation */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between sticky bottom-0">
          <button
            onClick={handleBack}
            disabled={step === 1}
            className="px-6 py-2.5 text-slate-600 font-bold hover:bg-slate-200 rounded-xl transition-colors disabled:opacity-0"
          >
            Back
          </button>

          {step < 4 ? (
            <button
              onClick={handleNext}
              disabled={step === 1 && (!customerName || !phone)}
              className="px-8 py-2.5 bg-navy-700 text-white font-bold rounded-xl shadow-md hover:bg-navy-800 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={isLoading}
              className="px-8 py-2.5 bg-emerald-600 text-white font-bold text-base rounded-xl shadow-lg hover:bg-emerald-700 transition-colors flex items-center gap-2 disabled:opacity-70"
            >
              {isLoading ? 'Saving...' : 'Save & Capture Lead'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
