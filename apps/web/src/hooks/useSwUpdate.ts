import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

// How often an open app asks the server "is there a newer build?". The
// check is a single tiny, uncached sw.js request -- cheap enough to run far
// more often than the previous 30 min, which (together with the 4 h grace
// below) meant a fix could take hours to reach someone who kept the app open.
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 min

// A found update is applied automatically as soon as the user has been idle
// this long (no key/tap/click/scroll), so it never lands mid-typing.
const IDLE_BEFORE_AUTO_UPDATE_MS = 60 * 1000; // 1 min

// Ceiling: even a user who never goes idle gets the update after this (still
// never while a form on screen has unsaved input).
const AUTO_UPDATE_GRACE_MS = 30 * 60 * 1000; // 30 min

const ACTIVITY_EVENTS = ['keydown', 'pointerdown', 'wheel', 'touchstart'] as const;

// Applying an update reloads the page, which would wipe a half-filled form --
// e.g. someone who switched to WhatsApp to copy a phone number mid-entry.
// Every automatic path below waits while any field on screen differs from
// its initial value (the banner's manual button still works).
const hasUnsavedInput = (): boolean => {
  const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input, textarea',
  );
  for (const el of Array.from(fields)) {
    if (el instanceof HTMLInputElement) {
      if (['hidden', 'submit', 'button', 'reset', 'file', 'image'].includes(el.type)) continue;
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.checked !== el.defaultChecked) return true;
        continue;
      }
    }
    if (el.value !== el.defaultValue) return true;
  }
  return false;
};

export const useSwUpdate = () => {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      registrationRef.current = registration;
      // The browser only checks for a new sw.js on navigation by default --
      // this keeps checking while the app just sits open.
      setInterval(() => registration.update().catch(() => {}), UPDATE_CHECK_INTERVAL_MS);
    },
    onRegisterError(error) {
      console.error('SW registration failed', error);
    },
  });

  // Also check the moment the app is brought back to the foreground or the
  // device comes back online -- the common "opened the PWA in the morning"
  // case, where the interval above hasn't had a chance to fire yet.
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'visible') {
        registrationRef.current?.update().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('online', check);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('online', check);
    };
  }, []);

  // Activate whichever new version is actually waiting, then reload.
  // updateServiceWorker(true) alone was not reliable: if a second deploy
  // landed while one update was already waiting, it could message a stale
  // worker and nothing happened; and a one-shot guard meant that after one
  // silent failure (e.g. an automatic attempt when the tab was hidden) the
  // "Update Now" button did nothing at all. Both seen on staging.
  const applyUpdate = async () => {
    let reloaded = false;
    const reload = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    try {
      const reg =
        registrationRef.current || (await navigator.serviceWorker?.getRegistration()) || null;
      const waiting = reg?.waiting;
      if (waiting) {
        navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
        waiting.postMessage({ type: 'SKIP_WAITING' });
        // Safety net if controllerchange never fires.
        setTimeout(reload, 4000);
        return;
      }
    } catch {
      // fall through to the plugin's own path
    }
    updateServiceWorker(true);
    setTimeout(reload, 4000);
  };
  const autoApplyIfSafe = () => {
    if (!hasUnsavedInput()) void applyUpdate();
  };

  // Once an update is waiting: apply it at the first safe moment --
  // the tab is hidden, or the user has been idle for a minute -- and at the
  // latest after the grace period.
  useEffect(() => {
    if (!needRefresh) return;

    const foundAt = Date.now();
    let lastActivity = foundAt;
    const onActivity = () => {
      lastActivity = Date.now();
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') autoApplyIfSafe();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const idleTimer = setInterval(() => {
      const idle = Date.now() - lastActivity >= IDLE_BEFORE_AUTO_UPDATE_MS;
      const pastGrace = Date.now() - foundAt >= AUTO_UPDATE_GRACE_MS;
      if (idle || pastGrace) autoApplyIfSafe();
    }, 10 * 1000);

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(idleTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needRefresh]);

  return { updateAvailable: needRefresh, applyUpdate };
};
