import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { API_BASE_URL } from '../../../config';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

interface SearchResult {
  leads: any[];
  bookings: any[];
  projects: any[];
  /** The searched phone number is marked "do not call" somewhere in the company. */
  do_not_call?: { reason: string; label: string } | null;
}

export const GlobalSearchInput: React.FC<{
  placeholder?: string;
  className?: string;
}> = ({ placeholder = 'Search...', className = '' }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult>({ leads: [], bookings: [], projects: [] });
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const { fetchWithAuth } = useAuth();
  const navigate = useNavigate();

  // Combine items to a single array for keyboard navigation
  const flatItems: { type: string; item: any }[] = [
    ...results.leads.map((item) => ({ type: 'Lead', item })),
    ...results.bookings.map((item) => ({ type: 'Booking', item })),
    ...results.projects.map((item) => ({ type: 'Project', item })),
  ];

  useEffect(() => {
    if (query.length < 2) {
      setResults({ leads: [], bookings: [], projects: [] });
      setIsOpen(false);
      return;
    }

    const delay = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetchWithAuth(`${API_BASE_URL}/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data);
          setIsOpen(true);
          setActiveIndex(-1);
        }
      } catch (err) {
        console.error('Search failed', err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(delay);
  }, [query, fetchWithAuth]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || flatItems.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev < flatItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : flatItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < flatItems.length) {
        handleSelect(flatItems[activeIndex].type, flatItems[activeIndex].item);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleSelect = (type: string, item: any) => {
    setIsOpen(false);
    setQuery('');

    if (type === 'Lead') {
      navigate(`/leads-clients?tab=leads&leadId=${item.id}`);
    } else if (type === 'Booking') {
      navigate(`/bookings?id=${item.id}`);
    } else if (type === 'Project') {
      navigate(`/projects/${item.id}`);
    }
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div className="relative flex items-center rounded-md border border-neutral-300 bg-white px-3 py-2">
        <span className="absolute left-3 text-neutral-400 flex items-center justify-center -translate-y-1/2 w-4 h-4 pointer-events-none top-1/2">
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-navy-600" />
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 21l-1.41-1.41M2 12l2.29-2.29M12 2l2.29 2.29M2 21l1.41-1.41M12 2l-2.29 2.29M2.29 2.29l2.29 2.29M2 12l-2.29-2.29M12 22l-1.41 1.41M4.41 4.41l1.41 1.41M 12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2z" />
            </svg>
          )}
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (flatItems.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          className="bg-transparent outline-none ring-0 text-sm text-neutral-700 w-full pl-7 pr-2 placeholder-shown:pl-8"
        />
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-[60vh] overflow-y-auto">
          {results.do_not_call && (
            <div className="mx-2 mt-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs font-bold text-red-700">
              Do not call this number: {results.do_not_call.label}.
            </div>
          )}
          {flatItems.length === 0 ? (
            <div className="px-4 py-3 text-sm text-slate-500">No results found</div>
          ) : (
            <div className="py-2">
              {results.leads.length > 0 && (
                <div className="mb-2">
                  <div className="px-3 py-1 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Leads
                  </div>
                  {results.leads.map((lead) => {
                    const idx = flatItems.findIndex(
                      (x) => x.type === 'Lead' && x.item.id === lead.id,
                    );
                    return (
                      <div
                        key={`lead-${lead.id}`}
                        onClick={() => handleSelect('Lead', lead)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={`px-4 py-2 cursor-pointer transition-colors ${activeIndex === idx ? 'bg-navy-50' : 'hover:bg-slate-50'}`}
                      >
                        <div className="font-semibold text-sm text-slate-800">
                          {lead.customer_name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {lead.phone} • {lead.status}
                          {lead.exit_reason === 'OTHER_COMPANY_SALESPERSON' && (
                            <span className="ml-1 text-red-600 font-bold">
                              • salesperson, do not call
                            </span>
                          )}
                          {lead.exit_reason === 'DO_NOT_CONTACT' && (
                            <span className="ml-1 text-red-600 font-bold">• do not call</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {results.bookings.length > 0 && (
                <div className="mb-2">
                  <div className="px-3 py-1 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Bookings
                  </div>
                  {results.bookings.map((booking) => {
                    const idx = flatItems.findIndex(
                      (x) => x.type === 'Booking' && x.item.id === booking.id,
                    );
                    return (
                      <div
                        key={`booking-${booking.id}`}
                        onClick={() => handleSelect('Booking', booking)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={`px-4 py-2 cursor-pointer transition-colors ${activeIndex === idx ? 'bg-navy-50' : 'hover:bg-slate-50'}`}
                      >
                        <div className="font-semibold text-sm text-slate-800">
                          {booking.booking_code}
                        </div>
                        <div className="text-xs text-slate-500">
                          {booking.customer?.first_name} {booking.customer?.last_name} •{' '}
                          {booking.status}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {results.projects.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Projects
                  </div>
                  {results.projects.map((project) => {
                    const idx = flatItems.findIndex(
                      (x) => x.type === 'Project' && x.item.id === project.id,
                    );
                    return (
                      <div
                        key={`project-${project.id}`}
                        onClick={() => handleSelect('Project', project)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={`px-4 py-2 cursor-pointer transition-colors ${activeIndex === idx ? 'bg-navy-50' : 'hover:bg-slate-50'}`}
                      >
                        <div className="font-semibold text-sm text-slate-800">{project.name}</div>
                        <div className="text-xs text-slate-500">{project.status}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
