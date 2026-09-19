import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Loader2,
  IndianRupee,
  Layers,
  Ruler,
  Compass,
  Car,
  Plus,
  Trash2,
  FileText,
  Activity as ActivityIcon,
  Edit,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Permissions } from '../../shared';
import { CostSheet } from '../shared/CostSheet';
import { formatAreaDual, loadingFactor } from '../../utils/measurement';
import {
  getProjectUnit,
  changeUnitStatus,
  overrideUnitPrice,
  addUnitFeature,
  removeUnitFeature,
  getUnitActivity,
  SalesStatus,
  UnitActivityEvent,
} from '../../api/projectUnits';

type Tab = 'overview' | 'cost_sheet' | 'features' | 'documents' | 'activity';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: Layers },
  { id: 'cost_sheet', label: 'Cost Sheet', icon: IndianRupee },
  { id: 'features', label: 'Features', icon: Compass },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'activity', label: 'Activity', icon: ActivityIcon },
];

const STATUS_DOT: Record<SalesStatus, string> = {
  AVAILABLE: 'bg-emerald-500',
  HOLD: 'bg-amber-500',
  RESERVED: 'bg-blue-500',
  BOOKED: 'bg-indigo-500',
  SOLD: 'bg-slate-500',
  BLOCKED: 'bg-rose-500',
  UNAVAILABLE: 'bg-slate-300',
};

const InfoRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex justify-between text-xs py-1">
    <span className="text-slate-400">{label}</span>
    <span className="font-bold text-slate-700 text-right">{value ?? '—'}</span>
  </div>
);

const Card: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({
  title,
  children,
  className,
}) => (
  <div
    className={`bg-white p-5 rounded-2xl border border-slate-200 shadow-card ${className || ''}`}
  >
    <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider border-b border-slate-100 pb-2 mb-3">
      {title}
    </h3>
    {children}
  </div>
);

export const UnitDetail: React.FC = () => {
  const { projectId: projectIdParam, unitId: unitIdParam } = useParams<{
    projectId: string;
    unitId: string;
  }>();
  const projectId = parseInt(projectIdParam || '0', 10);
  const unitId = parseInt(unitIdParam || '0', 10);
  const navigate = useNavigate();
  const { fetchWithAuth, user } = useAuth();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [showAddFeature, setShowAddFeature] = useState(false);

  const canEdit = user?.permissions?.includes(Permissions.PROJECTS_UPDATE);

  const { data, isLoading } = useQuery({
    queryKey: ['project', projectId, 'units', unitId],
    queryFn: () => getProjectUnit(fetchWithAuth, projectId, unitId).then((r) => r.unit),
    enabled: !!projectId && !!unitId,
  });

  const { data: activity } = useQuery({
    queryKey: ['project', projectId, 'units', unitId, 'activity'],
    queryFn: () => getUnitActivity(fetchWithAuth, projectId, unitId).then((r) => r.events),
    enabled: !!projectId && !!unitId && activeTab === 'activity',
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['project', projectId, 'units', unitId] });

  if (isLoading || !data) {
    return (
      <div className="py-24 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-navy-600 mx-auto mb-3" />
        <p className="text-xs text-slate-400 font-semibold">Loading unit...</p>
      </div>
    );
  }

  const unit = data;
  const summaryLine = [
    unit.bhk,
    unit.tower ? `Tower ${unit.tower}` : null,
    unit.floor != null ? `Floor ${unit.floor}` : null,
  ]
    .filter(Boolean)
    .join(' • ');
  const areaSqft =
    unit.area_sqft ||
    unit.super_built_up_area_sqft ||
    unit.built_up_area_sqft ||
    unit.carpet_area_sqft ||
    (unit.plot_area_sqyd ? unit.plot_area_sqyd * 9 : null);
  const loading = loadingFactor(unit.carpet_area_sqft, unit.super_built_up_area_sqft);

  return (
    <div className="space-y-0 -m-4 sm:-m-6">
      <div className="bg-gradient-to-r from-slate-900 via-navy-950 to-slate-900 p-6 text-white">
        <button
          onClick={() => navigate(`/projects/${projectId}`)}
          className="flex items-center gap-1.5 text-navy-300 hover:text-white text-xs font-bold mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> {unit.project?.name || 'Project'} → Units
        </button>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[unit.sales_status]}`} />
              <span className="text-xs font-bold text-navy-200 uppercase">{unit.sales_status}</span>
              <span className="font-mono text-navy-300 text-xs px-2 py-0.5 bg-black/20 rounded">
                {unit.unit_code}
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight">{unit.unit_number}</h1>
            {summaryLine && <p className="text-sm text-navy-100/80 mt-1">{summaryLine}</p>}
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowStatusModal(true)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl border border-white/20 flex items-center gap-1.5"
              >
                <Edit className="w-3.5 h-3.5" /> Change Status
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 px-4 sm:px-6 border-b border-slate-200 bg-white overflow-x-auto">
        {TABS.map((tab) => {
          const TabIcon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-bold border-b-2 whitespace-nowrap transition-colors ${isActive ? 'border-navy-600 text-navy-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            >
              <TabIcon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          );
        })}
      </div>

      <div className="p-4 sm:p-6 bg-slate-50 min-h-[60vh]">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 animate-fadeIn">
            <Card title="Identity">
              <InfoRow label="Type" value={unit.unit_type} />
              <InfoRow label="Plot Number" value={unit.plot_number} />
              <InfoRow label="Survey Number" value={unit.survey_number} />
              <InfoRow label="Flat Number" value={unit.flat_number} />
              <InfoRow label="Villa Number" value={unit.villa_number} />
              <InfoRow label="Type Code" value={unit.type_code} />
            </Card>
            <Card title="Area">
              <InfoRow label="Area" value={areaSqft ? formatAreaDual(areaSqft) : '—'} />
              <InfoRow
                label="Carpet"
                value={unit.carpet_area_sqft ? `${unit.carpet_area_sqft} sqft` : '—'}
              />
              <InfoRow
                label="Built-up"
                value={unit.built_up_area_sqft ? `${unit.built_up_area_sqft} sqft` : '—'}
              />
              <InfoRow
                label="Super Built-up"
                value={
                  unit.super_built_up_area_sqft ? `${unit.super_built_up_area_sqft} sqft` : '—'
                }
              />
              {loading != null && (
                <InfoRow label="Loading Factor" value={`${(loading * 100).toFixed(1)}%`} />
              )}
              <InfoRow label="Price Basis" value={unit.price_basis} />
            </Card>
            <Card title="Configuration">
              <InfoRow label="BHK" value={unit.bhk} />
              <InfoRow label="Bedrooms" value={unit.bedrooms} />
              <InfoRow label="Bathrooms" value={unit.bathrooms} />
              <InfoRow label="Balconies" value={unit.balconies} />
              <InfoRow label="Total Floors" value={unit.total_floors} />
            </Card>
            <Card title="Characteristics">
              <InfoRow label="Facing" value={unit.facing?.replace(/_/g, '-')} />
              <InfoRow label="Corner" value={unit.is_corner ? 'Yes' : 'No'} />
              <InfoRow label="Road-facing" value={unit.is_road_facing ? 'Yes' : 'No'} />
              <InfoRow label="Park-facing" value={unit.is_park_facing ? 'Yes' : 'No'} />
              <InfoRow label="View" value={unit.view} />
            </Card>
            <Card title="Parking">
              <InfoRow label="Included" value={unit.parking_included ? 'Yes' : 'No'} />
              <InfoRow label="Type" value={unit.parking_type} />
              <InfoRow label="Count" value={unit.parking_count} />
            </Card>
            <Card title="Status">
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-3 h-3 rounded-full ${STATUS_DOT[unit.sales_status]}`} />
                <span className="font-black text-slate-800">{unit.sales_status}</span>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                {unit.locked_by_booking_id
                  ? 'Locked by an active booking.'
                  : 'No active booking on this unit.'}
              </p>
              {canEdit && (
                <button
                  onClick={() => setShowStatusModal(true)}
                  className="text-xs font-bold text-navy-700 hover:underline"
                >
                  Change Status →
                </button>
              )}
            </Card>
          </div>
        )}

        {activeTab === 'cost_sheet' && (
          <div className="max-w-2xl animate-fadeIn space-y-4">
            <Card title="Cost Sheet">
              {unit.price_lines && unit.price_lines.length > 0 ? (
                <CostSheet
                  computation={{
                    lines: unit.price_lines as any,
                    base_price: unit.base_price,
                    premiums_total: unit.premiums_total,
                    charges_total: unit.charges_total,
                    discount_amount: unit.discount_amount || 0,
                    calculated_price: unit.calculated_price,
                    taxes_total: unit.taxes_total,
                    all_inclusive_price: unit.calculated_price + unit.taxes_total,
                    refundable_total: 0,
                    warnings: [],
                  }}
                  finalPrice={unit.final_price}
                  overridePrice={unit.override_price}
                  overrideReason={unit.override_reason}
                  overriddenAt={unit.overridden_at}
                />
              ) : (
                <p className="text-xs text-slate-400">No price lines yet.</p>
              )}
            </Card>
            {canEdit && (
              <button
                onClick={() => setShowOverrideModal(true)}
                className="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold rounded-xl"
              >
                {unit.override_price != null ? 'Edit Price Override' : 'Override Final Price'}
              </button>
            )}
          </div>
        )}

        {activeTab === 'features' && (
          <div className="max-w-xl animate-fadeIn">
            <Card title="Features">
              <div className="space-y-2 mb-3">
                {(unit.features || []).length === 0 && (
                  <p className="text-xs text-slate-400">No features added.</p>
                )}
                {(unit.features || []).map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg"
                  >
                    <span className="text-sm font-semibold text-slate-700">
                      {f.label}
                      {f.charge_amount ? ` — ₹${f.charge_amount.toLocaleString('en-IN')}` : ''}
                    </span>
                    {canEdit && (
                      <button
                        onClick={async () => {
                          try {
                            await removeUnitFeature(fetchWithAuth, projectId, unitId, f.id);
                            refresh();
                          } catch {
                            showError({ message: 'Failed to remove feature' });
                          }
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {canEdit &&
                (showAddFeature ? (
                  <AddFeatureForm
                    onCancel={() => setShowAddFeature(false)}
                    onAdd={async (label, amount) => {
                      try {
                        await addUnitFeature(fetchWithAuth, projectId, unitId, label, amount);
                        setShowAddFeature(false);
                        refresh();
                        showToast('Feature added', 'success');
                      } catch (err: any) {
                        showError({ message: err?.message || 'Failed to add feature' });
                      }
                    }}
                  />
                ) : (
                  <button
                    onClick={() => setShowAddFeature(true)}
                    className="flex items-center gap-1.5 text-xs font-bold text-navy-700 hover:text-navy-900"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Feature
                  </button>
                ))}
            </Card>
          </div>
        )}

        {activeTab === 'documents' && (
          <Card title="Documents" className="max-w-xl animate-fadeIn">
            {(unit.documents || []).length === 0 ? (
              <p className="text-xs text-slate-400">No documents uploaded yet.</p>
            ) : (
              <div className="space-y-2">
                {(unit.documents || []).map((d) => (
                  <a
                    key={d.id}
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-navy-700 hover:underline"
                  >
                    <FileText className="w-4 h-4" /> {d.title || 'Document'}
                  </a>
                ))}
              </div>
            )}
          </Card>
        )}

        {activeTab === 'activity' && (
          <Card title="Activity" className="max-w-2xl animate-fadeIn">
            {!activity || activity.length === 0 ? (
              <p className="text-xs text-slate-400">No activity recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {activity.map((e: UnitActivityEvent) => (
                  <div
                    key={e.id}
                    className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <div className="flex justify-between">
                      <span className="font-bold text-slate-700">
                        {e.action.replace(/_/g, ' ')}
                      </span>
                      <span className="text-slate-400">
                        {new Date(e.created_at).toLocaleString('en-IN')}
                      </span>
                    </div>
                    {(e.old_value || e.new_value) && (
                      <p className="text-slate-500 mt-1">
                        {e.old_value} → {e.new_value}
                      </p>
                    )}
                    {e.reason && <p className="text-slate-400 italic mt-0.5">"{e.reason}"</p>}
                    <p className="text-slate-400 mt-0.5">
                      by {e.actor_name || `Employee #${e.actor_id}`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>

      {showStatusModal && (
        <StatusModal
          current={unit.sales_status}
          onClose={() => setShowStatusModal(false)}
          onSubmit={async (status, reason) => {
            try {
              await changeUnitStatus(fetchWithAuth, projectId, unitId, status, reason);
              setShowStatusModal(false);
              refresh();
              showToast('Status updated', 'success');
            } catch (err: any) {
              showError({ message: err?.message || 'Failed to change status' });
            }
          }}
        />
      )}

      {showOverrideModal && (
        <OverrideModal
          currentOverride={unit.override_price}
          calculatedPrice={unit.calculated_price}
          onClose={() => setShowOverrideModal(false)}
          onSubmit={async (price, reason) => {
            try {
              await overrideUnitPrice(fetchWithAuth, projectId, unitId, price, reason);
              setShowOverrideModal(false);
              refresh();
              showToast('Price override applied', 'success');
            } catch (err: any) {
              showError({ message: err?.message || 'Failed to override price' });
            }
          }}
        />
      )}
    </div>
  );
};

const AddFeatureForm: React.FC<{
  onAdd: (label: string, amount?: number | null) => void;
  onCancel: () => void;
}> = ({ onAdd, onCancel }) => {
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  return (
    <div className="flex items-end gap-2 flex-wrap">
      <div>
        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Label</label>
        <input
          className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Park Facing"
        />
      </div>
      <div>
        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
          Charge (optional)
        </label>
        <input
          className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs w-28"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <button onClick={onCancel} className="px-3 py-1.5 text-xs font-bold text-slate-500">
        Cancel
      </button>
      <button
        onClick={() => label.trim() && onAdd(label.trim(), amount ? parseFloat(amount) : null)}
        className="px-3 py-1.5 bg-navy-700 text-white text-xs font-bold rounded-lg"
      >
        Add
      </button>
    </div>
  );
};

const StatusModal: React.FC<{
  current: SalesStatus;
  onClose: () => void;
  onSubmit: (status: SalesStatus, reason?: string) => void;
}> = ({ current, onClose, onSubmit }) => {
  const [status, setStatus] = useState<SalesStatus>(current);
  const [reason, setReason] = useState('');
  const options: SalesStatus[] = [
    'AVAILABLE',
    'HOLD',
    'BLOCKED',
    'UNAVAILABLE',
    ...(current === 'BOOKED' ? (['SOLD'] as SalesStatus[]) : []),
  ];
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 space-y-4">
        <h3 className="font-black text-slate-800">Change Status</h3>
        <select
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value as SalesStatus)}
        >
          {options.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <textarea
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-slate-500 font-bold text-sm">
            Cancel
          </button>
          <button
            onClick={() => onSubmit(status, reason || undefined)}
            className="px-4 py-2 bg-navy-700 text-white font-bold rounded-lg text-sm"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

const OverrideModal: React.FC<{
  currentOverride: number | null;
  calculatedPrice: number;
  onClose: () => void;
  onSubmit: (price: number | null, reason?: string | null) => void;
}> = ({ currentOverride, calculatedPrice, onClose, onSubmit }) => {
  const [price, setPrice] = useState(currentOverride != null ? String(currentOverride) : '');
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 space-y-4">
        <h3 className="font-black text-slate-800">Override Final Price</h3>
        <p className="text-xs text-slate-500">
          Calculated price: ₹{calculatedPrice.toLocaleString('en-IN')}
        </p>
        <input
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Override price"
        />
        <textarea
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
          placeholder="Reason (required)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex justify-between gap-2">
          {currentOverride != null && (
            <button
              onClick={() => onSubmit(null, null)}
              className="px-4 py-2 text-rose-600 font-bold text-sm"
            >
              Clear Override
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose} className="px-4 py-2 text-slate-500 font-bold text-sm">
              Cancel
            </button>
            <button
              onClick={() => price && onSubmit(parseFloat(price), reason)}
              className="px-4 py-2 bg-navy-700 text-white font-bold rounded-lg text-sm"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
