import React, { useState } from 'react';
import { X } from 'lucide-react';

export interface LocationListInputProps {
  label?: React.ReactNode;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  error?: string;
}

// A lead may be interested in more than one area (§ Phase 2) — this replaces
// the old single "Preferred Location" text field wherever it's entered or
// edited. The first entry is treated as primary everywhere else in the app.
const LocationListInput: React.FC<LocationListInputProps> = ({
  label = 'Preferred Location(s)',
  values,
  onChange,
  placeholder = 'e.g., Gachibowli, Hyderabad',
  error,
}) => {
  const [draft, setDraft] = useState('');

  const addLocation = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (values.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...values, trimmed]);
    setDraft('');
  };

  const removeLocation = (idx: number) => {
    onChange(values.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-1.5">
      {label && <label className="block text-xs font-medium text-neutral-700 mb-1">{label}</label>}
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addLocation();
            }
          }}
          placeholder={placeholder}
          className="w-full input-field rounded-md"
        />
        <button
          type="button"
          onClick={addLocation}
          className="px-4 py-2 bg-navy-600 hover:bg-navy-700 text-white text-sm font-bold rounded-md transition-colors whitespace-nowrap"
        >
          Add
        </button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {values.map((loc, idx) => (
            <span
              key={loc}
              className="inline-flex items-center gap-1 bg-navy-50 text-navy-700 text-xs font-semibold px-3 py-1.5 rounded-full border border-navy-100"
            >
              {idx === 0 && (
                <span className="text-[10px] uppercase tracking-wide text-navy-400">Primary</span>
              )}
              {loc}
              <button
                type="button"
                onClick={() => removeLocation(idx)}
                className="text-navy-400 hover:text-navy-700"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
};

export { LocationListInput };
