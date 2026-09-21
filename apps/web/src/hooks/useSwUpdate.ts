import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 min
const AUTO_UPDATE_GRACE_MS = 4 * 60 * 60 * 1000; // 4 hr

export const useSwUpdate = () => {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // The browser only checks for a new sw.js on navigation by default --
      // this keeps checking while the app just sits open.
      setInterval(() => registration.update(), UPDATE_CHECK_INTERVAL_MS);
    },
    onRegisterError(error) {
      console.error('SW registration failed', error);
    },
  });

  const appliedRef = useRef(false);
  const applyUpdate = () => {
    if (appliedRef.current) return;
    appliedRef.current = true;
    updateServiceWorker(true);
  };

  // Grace-period fallback: silently update if the user never clicks and
  // never backgrounds the tab, so nobody stays on a stale build indefinitely.
  useEffect(() => {
    if (!needRefresh) return;
    const timer = setTimeout(applyUpdate, AUTO_UPDATE_GRACE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needRefresh]);

  // Focus/visibility fallback: a backgrounded tab has no in-flight work to
  // lose, so treat regaining focus as a safe point to update.
  useEffect(() => {
    if (!needRefresh) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') applyUpdate();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needRefresh]);

  return { updateAvailable: needRefresh, applyUpdate };
};
