import React from 'react';
import { FileText, X } from 'lucide-react';
import { EndOfDayReportForm } from './EndOfDayReportForm';

interface DailyReportProps {
  isOpen?: boolean;
  onClose?: () => void;
  onSuccess: () => void;
  mode?: 'modal' | 'inline';
}

/** The end-of-day report in a dialog (the logout gate) or inline. */
export const DailyReportModal: React.FC<DailyReportProps> = ({
  isOpen = true,
  onClose,
  onSuccess,
  mode = 'modal',
}) => {
  if (mode === 'modal' && !isOpen) return null;

  const body = (
    <div
      className={`w-full flex flex-col ${mode === 'modal' ? 'max-w-2xl bg-white rounded-3xl p-6 shadow-2xl relative max-h-[90vh]' : ''}`}
    >
      {mode === 'modal' && onClose && (
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
        >
          <X className="w-5 h-5" />
        </button>
      )}
      {mode === 'modal' && (
        <h2 className="text-xl font-bold text-slate-800 mb-1 flex items-center gap-2 pr-10">
          <FileText className="w-5 h-5 text-navy-700" /> End-of-day report
        </h2>
      )}
      {mode === 'modal' && (
        <p className="text-xs text-slate-500 mb-4">Needed before you check out by QR.</p>
      )}
      <div className="overflow-y-auto">
        <EndOfDayReportForm
          onDone={() => {
            onSuccess();
            if (mode === 'modal') onClose?.();
          }}
        />
      </div>
    </div>
  );

  if (mode === 'inline') return body;
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
      {body}
    </div>
  );
};
