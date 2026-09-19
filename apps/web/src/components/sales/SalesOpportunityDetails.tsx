import React, { useState, useEffect } from 'react';
import {
  X,
  Building,
  MapPin,
  DollarSign,
  Clock,
  Target,
  CalendarDays,
  CheckSquare,
  History,
  Edit3,
  Save,
  AlertTriangle,
} from 'lucide-react';
import { useSalesPipeline } from '../../hooks/useSalesPipeline';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';
import { SALES_STAGE_LABELS, SALES_STAGE_COLORS } from './SalesConstants';
import { SalesOpportunityData, OpportunityHistoryEntry, SavedInterestItem } from '../../types';

interface SalesOpportunityDetailsProps {
  opportunityId: number;
  onClose: () => void;
}

export const SalesOpportunityDetails: React.FC<SalesOpportunityDetailsProps> = ({
  opportunityId,
  onClose,
}) => {
  const { getSalesOpportunityDetails, finalizeOpportunity } = useSalesPipeline();
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();
  const [opportunity, setOpportunity] = useState<SalesOpportunityData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'journey' | 'tasks' | 'visits'>('journey');

  // Finalizing sets the target property + deal value the workflow requires
  // before this lead can move to BOOKING_INITIATED (see finalizeOpportunity
  // in useSalesPipeline.ts). Most Opportunities already have these — this
  // form only needs to be used when they're still missing.
  const [isEditingDeal, setIsEditingDeal] = useState(false);
  const [savedInterests, setSavedInterests] = useState<SavedInterestItem[]>([]);
  // "PROPERTY-123" or "UNIT-456" — matches the disambiguation pattern used
  // by the booking pickers.
  const [dealInventoryKey, setDealInventoryKey] = useState('');
  const [dealValue, setDealValue] = useState('');
  const [isSavingDeal, setIsSavingDeal] = useState(false);

  // getSalesOpportunityDetails/finalizeOpportunity come from useSalesPipeline()
  // as plain (non-memoized) functions, so they get a new reference on every
  // render — putting either in a dependency array here would re-fire on every
  // render (each fetch's setState triggers the next render) and flood the
  // network. Depending on opportunityId alone is intentional.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchDetails = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await getSalesOpportunityDetails(opportunityId);
      setOpportunity(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [opportunityId]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const startEditingDeal = async () => {
    setDealInventoryKey(
      opportunity?.property_id
        ? `PROPERTY-${opportunity.property_id}`
        : opportunity?.project_unit_id
          ? `UNIT-${opportunity.project_unit_id}`
          : '',
    );
    setDealValue(opportunity?.expected_value ? String(opportunity.expected_value) : '');
    setIsEditingDeal(true);
    if (!opportunity?.lead_id) return;
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/leads/${opportunity.lead_id}/properties`);
      const data = await res.json();
      if (res.ok) setSavedInterests(data.interests || []);
    } catch (e) {
      console.error('Failed to fetch saved interests', e);
    }
  };

  const saveDeal = async () => {
    if (!dealInventoryKey || !dealValue) {
      showError({ message: 'Select a property or unit and enter a deal value.' });
      return;
    }
    setIsSavingDeal(true);
    try {
      const [kind, idStr] = dealInventoryKey.split('-');
      await finalizeOpportunity(
        opportunityId,
        parseInt(idStr, 10),
        parseFloat(dealValue),
        kind === 'UNIT' ? 'UNIT' : 'PROPERTY',
      );
      showToast('Deal finalized — this lead can now move to Booking Initiated.', 'success');
      setIsEditingDeal(false);
      await fetchDetails();
    } catch (e: any) {
      showError({ message: e.message || 'Failed to finalize deal' });
    } finally {
      setIsSavingDeal(false);
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-y-0 right-0 w-full sm:w-[500px] md:w-[600px] bg-white shadow-2xl z-50 flex items-center justify-center border-l border-slate-200">
        <div className="w-8 h-8 border-4 border-navy-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!opportunity) return null;

  const expectedValue = Number(opportunity.expected_value || 0);
  const probability = Number(opportunity.probability || 0);
  const currentStage = opportunity.lead?.status || 'UNKNOWN';
  const stageColorClass =
    SALES_STAGE_COLORS[currentStage] || 'bg-slate-100 text-slate-700 border-slate-200';
  const needsFinalization =
    (!opportunity.property_id && !opportunity.project_unit_id) || !opportunity.expected_value;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/20 backdrop-blur-sm">
      <div className="w-full sm:w-[500px] md:w-[600px] bg-slate-50 shadow-2xl flex flex-col h-full animate-slideInRight border-l border-slate-200">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-bold text-slate-800">Sales Details</h2>
              <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                #{opportunity.id}
              </span>
            </div>
            <div
              className={`text-xs font-bold px-2 py-0.5 rounded border inline-flex ${stageColorClass}`}
            >
              {SALES_STAGE_LABELS[currentStage] || currentStage}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close sales details"
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-4 sm:p-6 space-y-6">
          {/* Key Metrics Banner */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
              <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">Expected Value</p>
                <p className="font-black text-slate-800">₹{(expectedValue / 100000).toFixed(1)}L</p>
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
              <div className="p-2 bg-navy-100 text-navy-600 rounded-lg">
                <Target className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">Probability</p>
                <p className="font-black text-slate-800">{probability}%</p>
              </div>
            </div>
          </div>

          {/* Deal Details — property + value the workflow requires before this
              lead can move to Booking Initiated. Usually already set from the
              customer's saved property interest; this is where to set or fix
              it by hand when that didn't happen. */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-1">
              <h3 className="font-bold text-slate-700 text-sm">Deal Details</h3>
              {!isEditingDeal && (
                <button
                  onClick={startEditingDeal}
                  className="flex items-center gap-1.5 text-xs font-bold text-navy-600 hover:text-navy-800 bg-navy-50 hover:bg-navy-100 px-2.5 py-1 rounded-lg transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" /> {needsFinalization ? 'Finalize' : 'Edit'}
                </button>
              )}
            </div>

            {needsFinalization && !isEditingDeal && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  This deal has no target property or value set yet — this lead can't move to
                  <strong> Booking Initiated</strong> until both are finalized here.
                </span>
              </div>
            )}

            {isEditingDeal ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Target Property
                  </label>
                  <select
                    value={dealInventoryKey}
                    onChange={(e) => {
                      setDealInventoryKey(e.target.value);
                      const [kind, idStr] = e.target.value.split('-');
                      const id = idStr ? parseInt(idStr, 10) : NaN;
                      if (kind === 'PROPERTY') {
                        const match = savedInterests.find((si) => si.property_id === id);
                        if (match?.property?.final_price)
                          setDealValue(String(match.property.final_price));
                      } else if (kind === 'UNIT') {
                        const match = savedInterests.find((si) => si.project_unit_id === id);
                        if (match?.project_unit?.final_price)
                          setDealValue(String(match.project_unit.final_price));
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500"
                  >
                    <option value="">-- Select from customer's saved interests --</option>
                    {savedInterests.filter((si) => si.property).length > 0 && (
                      <optgroup label="Saved Properties">
                        {savedInterests
                          .filter((si) => si.property)
                          .map((si) => (
                            <option
                              key={`p-${si.property_id}`}
                              value={`PROPERTY-${si.property_id}`}
                            >
                              {si.property!.title} ({si.property!.property_code})
                            </option>
                          ))}
                      </optgroup>
                    )}
                    {savedInterests.filter((si) => si.project_unit).length > 0 && (
                      <optgroup label="Saved Project Units">
                        {savedInterests
                          .filter((si) => si.project_unit)
                          .map((si) => {
                            const u = si.project_unit!;
                            const unitLabel =
                              u.flat_number || u.villa_number || u.plot_number || u.unit_number;
                            return (
                              <option
                                key={`u-${si.project_unit_id}`}
                                value={`UNIT-${si.project_unit_id}`}
                              >
                                {u.project?.name} — Unit {unitLabel}
                              </option>
                            );
                          })}
                      </optgroup>
                    )}
                  </select>
                  {savedInterests.length === 0 && (
                    <p className="text-[11px] text-slate-400 mt-1">
                      No saved property interests on this lead yet — add one from the lead's Matches
                      tab first.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Deal Value (₹)
                  </label>
                  <input
                    type="number"
                    value={dealValue}
                    onChange={(e) => setDealValue(e.target.value)}
                    placeholder="e.g. 5000000"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setIsEditingDeal(false)}
                    disabled={isSavingDeal}
                    className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveDeal}
                    disabled={isSavingDeal}
                    className="flex-1 py-2 bg-navy-700 hover:bg-navy-800 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" /> {isSavingDeal ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs font-semibold text-slate-500">Target Property</p>
                  <p className="font-medium text-slate-800">
                    {opportunity.property?.title ||
                      opportunity.project_unit?.unit_number ||
                      'Not set'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Deal Value</p>
                  <p className="font-medium text-slate-800">
                    {opportunity.expected_value
                      ? `₹${(Number(opportunity.expected_value) / 100000).toFixed(1)}L`
                      : 'Not set'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Context Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
            <h3 className="font-bold text-slate-700 text-sm border-b border-slate-100 pb-2 mb-3">
              Context
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs font-semibold text-slate-500">Prospect</p>
                <p className="font-medium text-slate-800">
                  {opportunity.lead?.customer_name || 'N/A'}
                </p>
                <p className="text-xs text-slate-500">{opportunity.lead?.phone || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500">Sales Exec</p>
                <p className="font-medium text-slate-800">
                  {opportunity.owner?.full_name || 'Unassigned'}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500">Project</p>
                <div className="flex items-center gap-1 font-medium text-slate-800">
                  <Building className="w-3.5 h-3.5 text-slate-400" />
                  {opportunity.project?.name || 'N/A'}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500">Property</p>
                <div className="flex items-center gap-1 font-medium text-slate-800">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  {opportunity.property?.title || opportunity.project_unit?.unit_number || 'N/A'}
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-200 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveTab('journey')}
              className={`shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${
                activeTab === 'journey'
                  ? 'border-navy-600 text-navy-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <History className="w-4 h-4" /> Sales Journey
            </button>
            <button
              onClick={() => setActiveTab('tasks')}
              className={`shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${
                activeTab === 'tasks'
                  ? 'border-navy-600 text-navy-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <CheckSquare className="w-4 h-4" /> Tasks
            </button>
            <button
              onClick={() => setActiveTab('visits')}
              className={`shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${
                activeTab === 'visits'
                  ? 'border-navy-600 text-navy-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <CalendarDays className="w-4 h-4" /> Site Visits
            </button>
          </div>

          {/* Tab Content */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 min-h-[300px]">
            {activeTab === 'journey' && (
              <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
                {opportunity.history?.length > 0 ? (
                  opportunity.history.map((hist: OpportunityHistoryEntry, index: number) => (
                    <div
                      key={index}
                      className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
                    >
                      <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-200 text-slate-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-3 rounded border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between space-x-2 mb-1">
                          <div className="font-bold text-slate-800 text-xs">
                            {hist.to_stage
                              ? SALES_STAGE_LABELS[hist.to_stage] || hist.to_stage
                              : 'Unknown Stage'}
                          </div>
                          <time className="text-[10px] text-slate-400 font-medium">
                            {new Date(hist.created_at || '').toLocaleDateString('en-IN')}
                          </time>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {hist.duration_minutes
                            ? `Time in stage: ${Math.round(hist.duration_minutes / 60 / 24)} days`
                            : 'Current Stage'}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-slate-400 text-sm italic py-8">
                    No journey history available.
                  </p>
                )}
              </div>
            )}

            {activeTab === 'tasks' && (
              <div className="text-center text-slate-400 text-sm italic py-8">
                Task list integration pending phase sync.
              </div>
            )}

            {activeTab === 'visits' && (
              <div className="text-center text-slate-400 text-sm italic py-8">
                Site Visit integration pending phase sync.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
