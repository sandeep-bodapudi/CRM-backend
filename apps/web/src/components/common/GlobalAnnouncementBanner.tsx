import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../config';
import { mediaUrl } from '../../utils/imageUtils';
import { useAuth } from '../../context/AuthContext';

const ROTATE_INTERVAL_MS = 5000;

interface Offer {
  id: number;
  image_url: string;
}

export const GlobalAnnouncementBanner: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const fetchOffers = async () => {
      try {
        const response = await fetchWithAuth(`${API_BASE_URL}/offers`);
        if (response.ok) {
          const data = await response.json();
          setOffers(data.offers || []);
        }
      } catch (e) {
        console.error('Failed to fetch offers banner');
      }
    };
    fetchOffers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (offers.length < 2) return;
    const timer = setInterval(() => {
      setActiveIndex((i) => (i + 1) % offers.length);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [offers.length]);

  if (offers.length === 0) return null;

  return (
    <div className="w-full bg-slate-950 overflow-hidden relative shadow-md">
      {offers.map((offer, i) => (
        <img
          key={offer.id}
          src={mediaUrl(offer.image_url)}
          alt="Special Offer"
          className={`w-full h-auto max-h-[150px] md:max-h-[250px] object-cover object-center transition-opacity duration-700 ease-out ${
            i === activeIndex ? 'block animate-in fade-in duration-700' : 'hidden'
          }`}
        />
      ))}
      {offers.length > 1 && (
        <div className="absolute bottom-1.5 left-0 right-0 flex items-center justify-center gap-1.5">
          {offers.map((offer, i) => (
            <button
              key={offer.id}
              onClick={() => setActiveIndex(i)}
              aria-label={`Show offer ${i + 1}`}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                i === activeIndex ? 'bg-white w-4' : 'bg-white/50'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};
