import React, { useEffect, useState } from 'react';
import { User, Phone, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import { useToast } from '../../context/ToastContext';
import { handleApiError, toUserFacingError } from '../../utils/userFacingError';
import { Roles } from '../../shared';
import type { AssociateRef } from '../worklog/workLogKinds';

interface QuickAddLeadModalProps {
  onClose: () => void;
  onSuccess: (leadId: number) => void;
}

export const QuickAddLeadModal: React.FC<QuickAddLeadModalProps> = ({ onClose, onSuccess }) => {
  const { fetchWithAuth, activeRole } = useAuth();
  // Channel Partner Managers' leads come from an associate (external agent);
  // the server requires these details and always keeps the lead with them.
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
  const [source, setSource] = useState('ORGANIC_SEARCH');
  const [ownershipType, setOwnershipType] = useState<'POOL' | 'DIRECT'>('POOL');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !phone) {
      showError({ message: 'Name and Phone are required' });
      return;
    }
    if (isCpm && (!agentName.trim() || !agentPhone.trim() || !agentId.trim())) {
      showError({ message: "Enter the associate's name, phone and associate ID" });
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName,
          phone,
          source,
          ownership_type: isCpm ? 'DIRECT' : ownershipType,
          ...(isCpm
            ? {
                source: 'REFERRAL',
                external_agent_name: agentName.trim(),
                external_agent_phone: agentPhone.trim(),
                external_agent_associate_id: agentId.trim(),
                external_agent_company: agentCompany.trim() || null,
              }
            : {}),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        showToast(`Lead Captured Successfully! ID: ${data.lead.lead_code}`, 'success');
        onSuccess(data.lead.id);
      } else {
        throw new Error(data.message || 'Failed to add lead');
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

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col relative animate-in zoom-in-95 duration-200">
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
              <option value="ORGANIC_SEARCH">Organic Search</option>
              <option value="SOCIAL_MEDIA">Social Media</option>
              <option value="REFERRAL">Referral</option>
              <option value="BILLBOARD">Billboard</option>
              <option value="DIRECT_TRAFFIC">Direct Traffic</option>
            </select>
          </div>

          {isCpm ? (
            <div className="space-y-3 p-4 rounded-xl border border-navy-100 bg-navy-50/40">
              <div className="text-sm font-bold text-navy-900">
                Associate who referred this customer
              </div>
              <input
                list="lead-associate-suggestions"
                value={agentName}
                onChange={(e) => pickAgent(e.target.value)}
                placeholder="Associate name *"
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm"
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
                  className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm"
                />
                <input
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  placeholder="Associate ID *"
                  className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm"
                />
              </div>
              <input
                value={agentCompany}
                onChange={(e) => setAgentCompany(e.target.value)}
                placeholder="Associate's company (optional)"
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm"
              />
              <p className="text-[11px] text-slate-500">
                The lead stays with you. Associates you've used before are suggested.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Assign this lead to</label>
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
                  <div className="text-sm">Me</div>
                  <p className="text-[11px] text-slate-500 font-normal mt-1">Keep this lead.</p>
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
                  <div className="text-sm">Pool</div>
                  <p className="text-[11px] text-slate-500 font-normal mt-1">Auto-distribute.</p>
                </button>
              </div>
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
