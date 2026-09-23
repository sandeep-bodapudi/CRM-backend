import React, { useEffect, useState } from 'react';
import { Image, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { API_BASE_URL } from '../../config';
import { useAuth } from '../../context/AuthContext';
import { mediaUrl } from '../../utils/imageUtils';

interface Offer {
  id: number;
  image_url: string;
  audience: 'ALL' | 'EMPLOYEES' | 'CHANNEL_PARTNERS';
  active: boolean;
  sort_order: number;
}

const AUDIENCE_LABELS: Record<Offer['audience'], string> = {
  ALL: 'Everyone',
  EMPLOYEES: 'Employees Only',
  CHANNEL_PARTNERS: 'CPs & Associates Only',
};

export const BannerControlWidget: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newAudience, setNewAudience] = useState<Offer['audience']>('ALL');
  const [isAdding, setIsAdding] = useState(false);

  const fetchOffers = async () => {
    setIsLoading(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/offers/admin`);
      if (res.ok) {
        const data = await res.json();
        setOffers(data.offers || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOffers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = async () => {
    if (!newImageUrl.trim()) return;
    setIsAdding(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: newImageUrl.trim(),
          audience: newAudience,
          active: true,
          sort_order: offers.length,
        }),
      });
      if (res.ok) {
        setNewImageUrl('');
        setNewAudience('ALL');
        fetchOffers();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggleActive = async (offer: Offer) => {
    setOffers((prev) => prev.map((o) => (o.id === offer.id ? { ...o, active: !o.active } : o)));
    try {
      await fetchWithAuth(`${API_BASE_URL}/offers/${offer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !offer.active }),
      });
    } catch (e) {
      console.error(e);
      fetchOffers();
    }
  };

  const handleAudienceChange = async (offer: Offer, audience: Offer['audience']) => {
    setOffers((prev) => prev.map((o) => (o.id === offer.id ? { ...o, audience } : o)));
    try {
      await fetchWithAuth(`${API_BASE_URL}/offers/${offer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audience }),
      });
    } catch (e) {
      console.error(e);
      fetchOffers();
    }
  };

  const handleDelete = async (offer: Offer) => {
    setOffers((prev) => prev.filter((o) => o.id !== offer.id));
    try {
      await fetchWithAuth(`${API_BASE_URL}/offers/${offer.id}`, { method: 'DELETE' });
    } catch (e) {
      console.error(e);
      fetchOffers();
    }
  };

  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
      <div className="flex items-center gap-2 mb-4">
        <Image className="w-5 h-5 text-navy-500" />
        <h3 className="font-extrabold text-slate-900 text-lg">Offers Carousel</h3>
      </div>
      <p className="text-xs text-slate-500 mb-6">
        Add one or more offer images shown as a rotating carousel at the top of every dashboard.
        Target each offer to everyone, employees only, or channel partners & associates only.
        Recommended dimensions: <strong>1200x200 pixels</strong>.
      </p>

      <div className="space-y-3 mb-6">
        {isLoading ? (
          <div className="text-xs text-slate-400 py-4 text-center">Loading offers...</div>
        ) : offers.length === 0 ? (
          <div className="text-xs text-slate-400 py-4 text-center">
            No offers yet. Add one below.
          </div>
        ) : (
          offers.map((offer) => (
            <div
              key={offer.id}
              className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200"
            >
              <img
                src={mediaUrl(offer.image_url)}
                alt="Offer preview"
                className="w-20 h-12 object-cover rounded-lg border border-slate-200 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-500 truncate">{offer.image_url}</p>
                <select
                  value={offer.audience}
                  onChange={(e) => handleAudienceChange(offer, e.target.value as Offer['audience'])}
                  className="mt-1 text-xs font-semibold border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-navy-500"
                >
                  {Object.entries(AUDIENCE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => handleToggleActive(offer)}
                title={offer.active ? 'Active — click to disable' : 'Inactive — click to enable'}
                className={`p-1 rounded-full transition-colors shrink-0 ${offer.active ? 'text-emerald-500' : 'text-slate-400'}`}
              >
                {offer.active ? (
                  <ToggleRight className="w-7 h-7" />
                ) : (
                  <ToggleLeft className="w-7 h-7" />
                )}
              </button>
              <button
                onClick={() => handleDelete(offer)}
                title="Delete offer"
                className="p-1.5 text-danger-500 hover:bg-danger-50 rounded-lg transition-colors shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="pt-3 border-t border-slate-200 space-y-3">
        <label className="block text-xs font-bold text-slate-700">Add New Offer</label>
        <input
          type="text"
          placeholder="https://example.com/offer.jpg"
          value={newImageUrl}
          onChange={(e) => setNewImageUrl(e.target.value)}
          className="w-full px-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-500"
        />
        <select
          value={newAudience}
          onChange={(e) => setNewAudience(e.target.value as Offer['audience'])}
          className="w-full px-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-500"
        >
          {Object.entries(AUDIENCE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button
          onClick={handleAdd}
          disabled={isAdding || !newImageUrl.trim()}
          className="w-full py-2.5 bg-navy-600 hover:bg-navy-700 text-white font-bold text-sm rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          {isAdding ? 'Adding...' : 'Add Offer'}
        </button>
      </div>
    </div>
  );
};
