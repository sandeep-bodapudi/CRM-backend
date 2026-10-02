import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config';

const REFRESH_MS = 30 * 1000;

/**
 * Live attendance QR. The server signs each code with the time it was issued
 * and the kiosk accepts it for 2 minutes, so a screenshot forwarded to a
 * colleague stops working almost immediately. This keeps the code on screen
 * fresh by re-fetching every 30 s (and right away when the app comes back to
 * the foreground). Pass null to pause.
 */
export function useLiveAttendanceQr(path: string | null) {
  const { fetchWithAuth } = useAuth();
  // fetchWithAuth is a new function on every render; keep the latest in a
  // ref so the effect below runs once per path, not on every render.
  const fetchRef = useRef(fetchWithAuth);
  fetchRef.current = fetchWithAuth;
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!!path);
  const [failed, setFailed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(REFRESH_MS / 1000);

  useEffect(() => {
    setToken(null);
    if (!path) return;
    setIsLoading(true);
    let cancelled = false;
    let lastFetch = 0;

    const load = async () => {
      lastFetch = Date.now();
      try {
        const res = await fetchRef.current(`${API_BASE_URL}${path}`, { cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || 'Failed');
        setToken(data.qrData || data.signedToken || null);
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    const refresh = setInterval(load, REFRESH_MS);
    const tick = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((REFRESH_MS - (Date.now() - lastFetch)) / 1000)));
    }, 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(refresh);
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [path]);

  return { token, isLoading, failed, secondsLeft };
}
