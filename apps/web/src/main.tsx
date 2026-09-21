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

if ('serviceWorker' in navigator && (import.meta as ImportMeta).env?.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.log('SW registration skipped/failed:', err);
    });
  });
}

// Every deploy renames JS chunk files (content hash) and deletes the old
// ones. A tab that's been open since before the deploy -- or one serving a
// stale cached index.html -- still references the old, now-404ing chunk
// filenames, and Vite's dynamic import() throws this exact event instead of
// a normal error. A plain reload re-fetches the current index.html (and its
// current chunk hashes), which is all that's needed to recover -- this is
// Vite's own documented fix for "Failed to fetch dynamically imported
// module". sessionStorage guards against a reload loop if the failure is a
// real, persistent one (bad deploy, network outage) rather than staleness.
const PRELOAD_RETRY_KEY = 'vite-preload-reload-attempted';
window.addEventListener('vite:preloadError', () => {
  if (sessionStorage.getItem(PRELOAD_RETRY_KEY)) return;
  sessionStorage.setItem(PRELOAD_RETRY_KEY, '1');
  window.location.reload();
});
// A page that loads cleanly means the reload (if any) worked -- clear the
// guard so a later deploy, later in the same tab's life, gets its own retry
// instead of being silently swallowed by an earlier one.
window.addEventListener('load', () => sessionStorage.removeItem(PRELOAD_RETRY_KEY));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
