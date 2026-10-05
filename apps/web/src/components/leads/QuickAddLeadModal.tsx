import React, { useEffect, useState } from 'react';
import { User, Phone, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import { useToast } from '../../context/ToastContext';
import { toUserFacingError } from '../../utils/userFacingError';
import { Roles } from '../../shared';
import { PROPERTY_TYPE_OPTIONS } from '../../constants/propertyTypes';
import type { AssociateRef } from '../worklog/workLogKinds';

interface QuickAddLeadModalProps {
  onClose: () => void;
  onSuccess: (leadId: number) => void;
}

// Stages a Channel Partner Manager can add a kept lead at: associates often
// bring customers who were already spoken to, qualified or taken on a visit.
const STAGES = [
  { value: 'ASSIGNED', label: 'New — not contacted yet' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'QUALIFIED', label: 'Qualified' },
  { value: 'SITE_VISIT_SCHEDULED', label: 'Site visit scheduled' },
  { value: 'SITE_VISIT_COMPLETED', label: 'Site visit completed' },
  { value: 'NEGOTIATION', label: 'Negotiation' },
] as const;
type Stage = (typeof STAGES)[number]['value'];
const stageIndex = (s: Stage) => STAGES.findIndex((x) => x.value === s);

const RATINGS = [
  { value: 'HOT_INTERESTED', label: 'Hot — very interested' },
  { value: 'WARM', label: 'Warm' },
  { value: 'COLD', label: 'Cold' },
  { value: 'NOT_INTERESTED', label: 'Not interested' },
];

const inputCls =
  'w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500';

/** Local "YYYY-MM-DDTHH:mm" for datetime-local inputs. */
const localInput = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export const QuickAddLeadModal: React.FC<QuickAddLeadModalProps> = ({ onClose, onSuccess }) => {
  const { fetchWithAuth, activeRole } = useAuth();
  // Channel Partner Managers: most leads come from an associate (external
  // agent) -- only then are the associate's details asked for.
  const isCpm = activeRole === Roles.CHANNEL_PARTNER_MANAGER;
  const [agentName, setAgentName] = useState('');
  const [agentPhone, setAgentPhone] = useState('');
  const [agentId, setAgentId] = useState('');
  const [agentCompany, setAgentCompany] = useState('');
  const [associates, setAssociates] = useState<AssociateRef[]>([]);
  useEffect(() => {
    if (!isCpm) return;
    fetchWithAuth(`${API_BASE_URL}/work-log/associates`)
      .then((r) => (r.ok ? r.json() : { associates: [] }))
      .then((d) => setAssociates(d.associates || []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCpm]);
  const pickAgent = (name: string) => {
    setAgentName(name);
    const hit = associates.find((a) => a.name.toLowerCase() === name.trim().toLowerCase());
    if (hit) {
      if (hit.associate_id) setAgentId(hit.associate_id);
      if (hit.phone) setAgentPhone(hit.phone);
      if (hit.company) setAgentCompany(hit.company);
    }
  };
  const { showToast, showError } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState(isCpm ? 'ASSOCIATE' : 'ORGANIC_SEARCH');
  // CPMs must choose Me or Pool explicitly; others keep the old default.
  const [ownershipType, setOwnershipType] = useState<'POOL' | 'DIRECT' | null>(
    isCpm ? null : 'POOL',
  );
  const fromAssociate = isCpm && source === 'ASSOCIATE';

  // Stage the lead is added at (CPM keeping the lead only) and its details.
  const [stage, setStage] = useState<Stage>('ASSIGNED');
  const [contactedAt, setContactedAt] = useState(localInput(new Date()));
  const [callNotes, setCallNotes] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [location, setLocation] = useState('');
  const [projectId, setProjectId] = useState('');
  const [visitAt, setVisitAt] = useState('');
  const [handlerId, setHandlerId] = useState('');
  const [rating, setRating] = useState('');
  const [feedback, setFeedback] = useState('');
  const [negotiationNotes, setNegotiationNotes] = useState('');
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
  const [handlers, setHandlers] = useState<
    { id: number; name: string; code: string; roles: string[] }[]
  >([]);

  const keepsLead = isCpm && ownershipType === 'DIRECT';
  const at = (s: Stage) => keepsLead && stageIndex(stage) >= stageIndex(s);
  const needsVisit = at('SITE_VISIT_SCHEDULED');

  useEffect(() => {
    if (!needsVisit || projects.length > 0) return;
    fetchWithAuth(`${API_BASE_URL}/projects?limit=200`)
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then((d) => setProjects((d.projects || []).map((p: any) => ({ id: p.id, name: p.name }))))
      .catch(() => {});
    fetchWithAuth(`${API_BASE_URL}/leads/visit-handlers`)
      .then((r) => (r.ok ? r.json() : { employees: [] }))
      .then((d) => setHandlers(d.employees || []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsVisit]);

  const fail = (message: string) => {
    showError({ message });
    return false;
  };

  const validate = () => {
    if (!customerName || !phone) return fail('Name and Phone are required');
    if (isCpm && !ownershipType)
      return fail('Choose whether the lead is yours or goes to the pool');
    if (fromAssociate && (!agentName.trim() || !agentPhone.trim() || !agentId.trim())) {
      return fail("Enter the associate's name, phone and associate ID");
    }
    if (!keepsLead || stage === 'ASSIGNED') return true;
    if (!contactedAt) return fail('Enter when the customer was first spoken to');
    if (at('QUALIFIED') && (!propertyType || !budgetMax || !location.trim())) {
      return fail('Property type, budget and preferred location are required');
    }
    if (needsVisit && (!projectId || !handlerId || !visitAt)) {
      return fail('Choose the project, who handles the visit, and the visit date and time');
    }
    if (at('SITE_VISIT_COMPLETED') && (!rating || !feedback.trim())) {
      return fail('Enter the customer’s interest and the site visit feedback');
    }
    if (stage === 'NEGOTIATION' && !negotiationNotes.trim()) {
      return fail('Enter what is being negotiated');
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    const iso = (v: string) => new Date(v).toISOString();

    try {
      const staged = keepsLead && stage !== 'ASSIGNED';
      const res = await fetchWithAuth(`${API_BASE_URL}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName,
          phone,
          source,
          ownership_type: ownershipType,
          ...(fromAssociate
            ? {
                external_agent_name: agentName.trim(),
                external_agent_phone: agentPhone.trim(),
                external_agent_associate_id: agentId.trim(),
                external_agent_company: agentCompany.trim() || null,
              }
            : {}),
          ...(staged
            ? {
                initial_stage: stage,
                ...(at('QUALIFIED')
                  ? {
                      property_type_preference: propertyType,
                      budget_min: budgetMin ? Number(budgetMin) : undefined,
                      budget_max: Number(budgetMax),
                      preferred_location: location.trim(),
                    }
                  : {}),
                stage_details: {
                  contacted_at: iso(contactedAt),
                  call_notes: callNotes.trim() || undefined,
                  ...(needsVisit
                    ? {
                        project_id: Number(projectId),
                        visit_at: iso(visitAt),
                        visit_handled_by_id: Number(handlerId),
                      }
                    : {}),
                  ...(at('SITE_VISIT_COMPLETED')
                    ? { visit_rating: rating, visit_feedback: feedback.trim() }
                    : {}),
                  ...(stage === 'NEGOTIATION'
                    ? { negotiation_notes: negotiationNotes.trim() }
                    : {}),
                },
              }
            : {}),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        showToast(`Lead Captured Successfully! ID: ${data.lead.lead_code}`, 'success');
        onSuccess(data.lead.id);
      } else {
        throw new Error(data.error || data.message || 'Failed to add lead');
      }
    } catch (err: any) {
      console.error(err);
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const ownershipChoice = (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-slate-700">
        Assign this lead to {isCpm && <span className="text-red-500">*</span>}
      </label>
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            ['DIRECT', 'Me', 'Keep this lead.'],
            ['POOL', 'Pool', 'Auto-distribute.'],
          ] as const
        ).map(([val, title, hint]) => (
          <button
            key={val}
            type="button"
            onClick={() => setOwnershipType(val)}
            className={`p-3 rounded-xl border text-left transition-all ${
              ownershipType === val
                ? 'border-navy-600 bg-navy-50/50 text-navy-900 font-bold'
                : 'border-slate-200 text-slate-600'
            }`}
          >
            <div className="text-sm">{title}</div>
            <p className="text-[11px] text-slate-500 font-normal mt-1">{hint}</p>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md max-h-[92vh] bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col relative animate-in zoom-in-95 duration-200">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Quick Add Lead</h2>
            <p className="text-sm text-slate-500 mt-1">Capture basic details to start.</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-white border border-transparent hover:border-slate-200 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 flex-1 overflow-y-auto">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <User className="w-4 h-4 text-navy-500" />
              Customer Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 transition-all"
              placeholder="e.g. John Doe"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Phone className="w-4 h-4 text-navy-500" />
              Phone Number <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 transition-all"
              placeholder="e.g. 9876543210"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Source</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 transition-all appearance-none"
            >
              {isCpm && <option value="ASSOCIATE">Associate</option>}
              <option value="ORGANIC_SEARCH">Organic Search</option>
              <option value="SOCIAL_MEDIA">Social Media</option>
              <option value="REFERRAL">Referral</option>
              <option value="BILLBOARD">Billboard</option>
              <option value="DIRECT_TRAFFIC">Direct Traffic</option>
            </select>
          </div>

          {fromAssociate && (
            <div className="space-y-3 p-4 rounded-xl border border-navy-100 bg-navy-50/40">
              <div className="text-sm font-bold text-navy-900">
                Associate who referred this customer
              </div>
              <input
                list="lead-associate-suggestions"
                value={agentName}
                onChange={(e) => pickAgent(e.target.value)}
                placeholder="Associate name *"
                className={inputCls}
              />
              <datalist id="lead-associate-suggestions">
                {associates.map((a) => (
                  <option key={(a.associate_id || '') + a.name} value={a.name}>
                    {a.associate_id || ''}
                  </option>
                ))}
              </datalist>
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={agentPhone}
                  onChange={(e) => setAgentPhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
                  placeholder="Associate phone *"
                  className={inputCls}
                />
                <input
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  placeholder="Associate ID *"
                  className={inputCls}
                />
              </div>
              <input
                value={agentCompany}
                onChange={(e) => setAgentCompany(e.target.value)}
                placeholder="Associate's company (optional)"
                className={inputCls}
              />
              <p className="text-[11px] text-slate-500">
                Associates you've used before are suggested.
              </p>
            </div>
          )}

          {ownershipChoice}

          {keepsLead && (
            <div className="space-y-4 p-4 rounded-xl border border-slate-200 bg-slate-50/60">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">
                  Where is this customer now?
                </label>
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value as Stage)}
                  className={inputCls}
                >
                  {STAGES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                {stage === 'ASSIGNED' && (
                  <p className="text-[11px] text-slate-500">
                    Pick a later stage if you have already spoken to the customer, qualified them or
                    taken them on a visit — you'll be asked for that stage's details.
                  </p>
                )}
              </div>

              {at('CONTACTED') && stage !== 'ASSIGNED' && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600 uppercase">
                    First spoken to on <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={contactedAt}
                    max={localInput(new Date())}
                    onChange={(e) => setContactedAt(e.target.value)}
                    className={inputCls}
                  />
                  <textarea
                    value={callNotes}
                    onChange={(e) => setCallNotes(e.target.value)}
                    rows={2}
                    placeholder="What was discussed (optional)"
                    className={inputCls}
                  />
                </div>
              )}

              {at('QUALIFIED') && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600 uppercase">
                    Requirement <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={propertyType}
                    onChange={(e) => setPropertyType(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Property type…</option>
                    {PROPERTY_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="number"
                      min={0}
                      value={budgetMin}
                      onChange={(e) => setBudgetMin(e.target.value)}
                      placeholder="Budget from (₹)"
                      className={inputCls}
                    />
                    <input
                      type="number"
                      min={0}
                      value={budgetMax}
                      onChange={(e) => setBudgetMax(e.target.value)}
                      placeholder="Budget up to (₹) *"
                      className={inputCls}
                    />
                  </div>
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Preferred location *"
                    className={inputCls}
                  />
                </div>
              )}

              {needsVisit && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600 uppercase">
                    Site visit <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Project visited…</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={handlerId}
                    onChange={(e) => setHandlerId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Visit handled by…</option>
                    {handlers.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name} ({h.code})
                      </option>
                    ))}
                  </select>
                  <label className="block text-[11px] text-slate-500">
                    {at('SITE_VISIT_COMPLETED') ? 'Visit took place on' : 'Visit scheduled for'}
                  </label>
                  <input
                    type="datetime-local"
                    value={visitAt}
                    {...(at('SITE_VISIT_COMPLETED') ? { max: localInput(new Date()) } : {})}
                    onChange={(e) => setVisitAt(e.target.value)}
                    className={inputCls}
                  />
                </div>
              )}

              {at('SITE_VISIT_COMPLETED') && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600 uppercase">
                    After the visit <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={rating}
                    onChange={(e) => setRating(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Customer's interest…</option>
                    {RATINGS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    rows={3}
                    placeholder="Site visit feedback — what the customer said, units liked, concerns *"
                    className={inputCls}
                  />
                </div>
              )}

              {stage === 'NEGOTIATION' && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600 uppercase">
                    Negotiation <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={negotiationNotes}
                    onChange={(e) => setNegotiationNotes(e.target.value)}
                    rows={3}
                    placeholder="Unit and price discussed, customer's offer, next step"
                    className={inputCls}
                  />
                </div>
              )}
            </div>
          )}
        </form>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 hover:border-slate-300 rounded-xl transition-all shadow-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={isLoading || !customerName || !phone}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-navy-900 hover:bg-navy-800 rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading ? 'Creating...' : 'Quick Add'}
          </button>
        </div>
      </div>
    </div>
  );
};
