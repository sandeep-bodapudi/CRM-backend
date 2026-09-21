import { RefreshCw, Sparkles } from 'lucide-react';
import { useSwUpdate } from '../../hooks/useSwUpdate';

// Takes updateAvailable/applyUpdate as props rather than calling
// useSwUpdate() itself -- useRegisterSW (which the hook wraps) is not a
// shared singleton, so a second call here would register a second,
// redundant service-worker update flow in parallel with App.tsx's. See
// App.tsx's swUpdate/AppShell wiring for the single call site.
export const UpdateAvailableBanner: React.FC<ReturnType<typeof useSwUpdate>> = ({
  updateAvailable,
  applyUpdate,
}) => {
  if (!updateAvailable) return null;

  return (
    <div className="fixed bottom-16 md:bottom-6 right-4 left-4 md:left-6 md:right-auto md:w-96 z-50 bg-gradient-to-r from-navy-950 via-slate-800 to-slate-900 text-white rounded-3xl p-4 shadow-2xl border border-navy-500/30 flex items-center justify-between gap-3 backdrop-blur-xl animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-navy-500/20 border border-navy-500/40 flex items-center justify-center shrink-0">
          <RefreshCw className="w-5 h-5 text-navy-400" />
        </div>
        <div>
          <h4 className="font-extrabold text-xs text-white flex items-center gap-1">
            Update available
            <Sparkles className="w-3 h-3 text-amber-400" />
          </h4>
          <p className="text-[10px] text-slate-300">
            A new version is ready. Refresh to get the latest fixes.
          </p>
        </div>
      </div>
      <button
        onClick={applyUpdate}
        className="px-3 py-1.5 bg-navy-500 hover:bg-navy-400 text-navy-950 font-extrabold text-[11px] rounded-xl shadow transition-all flex items-center gap-1 shrink-0"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        <span>Update Now</span>
      </button>
    </div>
  );
};
