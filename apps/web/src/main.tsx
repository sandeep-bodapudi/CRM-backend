import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

// Service worker registration (and update detection) now happens via
// useSwUpdate/useRegisterSW (virtual:pwa-register/react), called from
// App.tsx, instead of a bare navigator.serviceWorker.register() here --
// that gives us registration.waiting/controllerchange events to drive
// UpdateAvailableBanner, which a plain register() call can't.

// Every deploy renames JS chunk files (content hash) and deletes the old
// ones. A tab that's been open since before the deploy -- or one serving a
// stale cached index.html -- still references the old, now-404ing chunk
// filenames, and Vite's dynamic import() throws this exact event instead of
// a normal error. A plain reload re-fetches the current index.html (and its
// current chunk hashes), which is all that's needed to recover -- this is
// Vite's own documented fix for "Failed to fetch dynamically imported
// module". sessionStorage guards against a reload loop if the failure is a
// real, persistent one (bad deploy, network outage) rather than staleness.
//
// The guard is a timestamp, not a flag cleared on 'load': 'load' fires before
// most lazy routes are ever requested, so clearing it there let a
// persistent failure reload -> clear -> fail -> reload forever (the app
// "stuck" on a blank/loading screen). Now at most one automatic reload per
// 30 s; a later deploy in the same tab's life still gets its own retry.
const PRELOAD_RETRY_KEY = 'vite-preload-reload-at';
const PRELOAD_RETRY_WINDOW_MS = 30 * 1000;
window.addEventListener('vite:preloadError', () => {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(PRELOAD_RETRY_KEY)) || 0;
  } catch {
    // storage unavailable -- fall through and allow the single reload
  }
  if (Date.now() - last < PRELOAD_RETRY_WINDOW_MS) return;
  try {
    sessionStorage.setItem(PRELOAD_RETRY_KEY, String(Date.now()));
  } catch {
    // ignore
  }
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
