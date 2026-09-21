import React, { useState } from 'react';
import { User, Phone, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import { useToast } from '../../context/ToastContext';
import { handleApiError, toUserFacingError } from '../../utils/userFacingError';

interface QuickAddLeadModalProps {
  onClose: () => void;
  onSuccess: (leadId: number) => void;
}

export const QuickAddLeadModal: React.FC<QuickAddLeadModalProps> = ({ onClose, onSuccess }) => {
  const { fetchWithAuth } = useAuth();
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

    setIsLoading(true);

    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName,
          phone,
          source,
          ownership_type: ownershipType,
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
