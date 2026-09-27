import React, { createContext, useContext, useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

// § Phase 6 — App Lock. `rrh_applock_enabled` is a fast local cache of what
// the server already knows (source of truth is the WebAuthnCredential
// table) so the very first render of a returning session can decide to
// start locked WITHOUT waiting on a network round-trip — the whole point of
// the lock screen is that it must not flash the underlying app open even
// for a moment. `rrh_unlocked_session` lives in sessionStorage (not
// localStorage) so it's scoped to one tab and cleared on tab close,
// matching "reopened -> locked again" from the approved plan.
const APPLOCK_ENABLED_KEY = 'rrh_applock_enabled';
const UNLOCKED_SESSION_KEY = 'rrh_unlocked_session';

export interface UserProfile {
  id: number;
  employeeCode: string;
  fullName?: string;
  department?: string;
  company: string;
  branch: string;
  roles: string[];
  permissions?: string[];
  attendanceRequired: boolean;
  reportRequired: boolean;
  firstLoginDone: boolean;
  phone?: string | null;
  secondaryPhone?: string | null;
  whatsappNumber?: string | null;
  email?: string | null;
  bloodGroup?: string | null;
  socialLinks?: string | null;
  currentAddress?: string | null;
  permanentAddress?: string | null;
  emergencyContactName?: string | null;
  emergencyContactRelation?: string | null;
  emergencyContactPhone?: string | null;
  profileImageUrl?: string | null;
  panNumber?: string | null;
  aadhaarNumber?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
  bankBranch?: string | null;
}

type AuthStatus = 'bootstrapping' | 'authenticated' | 'unauthenticated';

interface AuthContextType {
  user: UserProfile | null;
  accessToken: string | null;
  authStatus: AuthStatus;
  firstLoginDone: boolean;
  attendanceStamped: boolean;
  activeRole: string;
  setActiveRole: (role: string) => void;
  login: (userData: UserProfile, token: string, refreshToken?: string) => void;
  logout: () => void;
  setFirstLoginDone: (done: boolean) => void;
  setAttendanceStamped: (stamped: boolean) => void;
  updateUser: (partialUser: Partial<UserProfile>) => void;
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
  /** § Phase 6 — App Lock */
  isLocked: boolean;
  appLockEnabled: boolean;
  setAppLockEnabled: (enabled: boolean) => void;
  lock: () => void;
  unlockSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type RefreshResult =
  | { success: true; token: string }
  | { success: false; reason: 'unauthorized' | 'network_error' | 'server_error' };

// Shared single-flight refresh state
let refreshPromise: Promise<RefreshResult> | null = null;

const performRefresh = async (): Promise<RefreshResult> => {
  try {
    const refreshToken = await idbGet('rrh_refresh_token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (refreshToken) {
      headers['x-refresh-token'] = refreshToken;
    }

    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers,
    });

    if (res.ok) {
      const data = await res.json();
      if (data.refreshToken) {
        await idbSet('rrh_refresh_token', data.refreshToken);
      }
      return { success: true, token: data.accessToken };
    } else if (res.status === 401 || res.status === 403) {
      return { success: false, reason: 'unauthorized' };
    } else {
      return { success: false, reason: 'server_error' };
    }
  } catch (err) {
    console.error('Refresh network failed', err);
    return { success: false, reason: 'network_error' };
  }
};

const refreshAccessToken = async (): Promise<RefreshResult> => {
  if (refreshPromise) {
    return refreshPromise;
  }

  // `refreshPromise` only de-duplicates within this tab. Refresh tokens
  // rotate on every use and the server treats a second use of the same one
  // as theft (revoking every session for the user) -- so two tabs, or the
  // installed app plus a browser tab, refreshing at the same moment with the
  // same stored token logged the employee out everywhere. The Web Locks API
  // serializes refreshes across all tabs of this origin; performRefresh reads
  // the token from IndexedDB *inside* the lock, so the second tab picks up
  // the token the first tab just stored instead of reusing the old one.
  const run = (): Promise<RefreshResult> =>
    typeof navigator !== 'undefined' && navigator.locks?.request
      ? navigator.locks.request('rrh-token-refresh', performRefresh)
      : performRefresh();

  refreshPromise = run().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('rrh_user');
    return saved ? JSON.parse(saved) : null;
  });

  // Access token strictly in memory
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('bootstrapping');

  const [firstLoginDone, setFirstLoginDoneState] = useState<boolean>(() => {
    if (!user) return true;
    return Boolean(user.firstLoginDone);
  });

  const [activeRole, setActiveRoleState] = useState<string>(() => {
    const savedUser = localStorage.getItem('rrh_user');
    const u = savedUser ? JSON.parse(savedUser) : null;
    const savedRole = localStorage.getItem('rrh_active_role');
    if (savedRole && u?.roles?.includes(savedRole)) return savedRole;
    return u?.roles?.[0] || 'Employee';
  });

  const setActiveRole = (role: string) => {
    setActiveRoleState(role);
    localStorage.setItem('rrh_active_role', role);
  };

  const [attendanceStamped, setAttendanceStamped] = useState<boolean>(false);

  // § Phase 6 — App Lock state. Starts locked (synchronously, no network
  // wait) whenever the cached "app lock is enabled" flag is set AND this tab
  // hasn't already been unlocked this session — covers both "reopened after
  // being closed" and "idle-locked, then this exact tab reloaded".
  const [appLockEnabled, setAppLockEnabledState] = useState<boolean>(
    () => localStorage.getItem(APPLOCK_ENABLED_KEY) === '1',
  );
  const [isLocked, setIsLocked] = useState<boolean>(() => {
    const enabled = localStorage.getItem(APPLOCK_ENABLED_KEY) === '1';
    const unlockedThisTab = sessionStorage.getItem(UNLOCKED_SESSION_KEY) === '1';
    return enabled && !unlockedThisTab;
  });

  const setAppLockEnabled = (enabled: boolean) => {
    setAppLockEnabledState(enabled);
    localStorage.setItem(APPLOCK_ENABLED_KEY, enabled ? '1' : '0');
    if (!enabled) {
      // Disabling app lock also means nothing to unlock — never show the
      // lock screen for an account that just turned this feature off.
      setIsLocked(false);
      sessionStorage.setItem(UNLOCKED_SESSION_KEY, '1');
    }
  };

  const lock = () => {
    if (!appLockEnabled) return; // no-op if this employee never enabled it
    sessionStorage.removeItem(UNLOCKED_SESSION_KEY);
    setIsLocked(true);
    // Drop the in-memory access token so a locked tab genuinely cannot make
    // an authenticated call, not just visually hide the app behind an
    // overlay — see AppLockScreen.tsx / fetchWithAuth's lock check below.
    setAccessToken(null);
  };

  const unlockSession = async () => {
    sessionStorage.setItem(UNLOCKED_SESSION_KEY, '1');
    setIsLocked(false);
    // The refresh-token cookie was never touched by locking — this is the
    // exact same silent-refresh the app already does on every mount, just
    // gated behind the WebAuthn proof the caller already completed.
    const result = await refreshAccessToken();
    if (result.success) {
      setAccessToken(result.token);
    } else if (result.reason === 'unauthorized') {
      logout();
    }
  };

  const logout = async () => {
    setUser(null);
    setAccessToken(null);
    setAttendanceStamped(false);
    localStorage.removeItem('rrh_user');
    // Ensure no token persistence remains
    localStorage.removeItem('rrh_token');
    // A real logout clears app-lock state too — the next person to log in
    // on this device must not inherit a stale "locked" screen belonging to
    // whoever was signed in before.
    localStorage.removeItem(APPLOCK_ENABLED_KEY);
    sessionStorage.removeItem(UNLOCKED_SESSION_KEY);
    setAppLockEnabledState(false);
    setIsLocked(false);
    setAuthStatus('unauthenticated');

    const refreshToken = await idbGet('rrh_refresh_token').catch(() => null);
    idbDel('rrh_refresh_token').catch(() => {});

    const headers: Record<string, string> = {};
    if (refreshToken) {
      headers['x-refresh-token'] = refreshToken;
    }

    // Best effort background request to destroy backend session explicitly
    fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include', headers }).catch(
      () => {},
    );
  };

  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      const savedUser = localStorage.getItem('rrh_user');

      if (savedUser && !accessToken) {
        // Fast path: Immediately transition to authenticated to avoid blocking UI
        setAuthStatus('authenticated');

        // § Phase 6 — if this tab is starting locked, do NOT proactively
        // fetch an access token: the whole point of the lock screen is that
        // the app must not become usable (even silently, in the background)
        // until the employee actually unlocks with WebAuthn. AppLockScreen
        // calls unlockSession() itself once that happens, which does this
        // exact refresh.
        if (isLocked) return;

        // Proactively refresh in background
        const result = await refreshAccessToken();
        if (!isMounted) return;

        if (result.success) {
          setAccessToken(result.token);

          // Background sync profile
          fetch(`${API_BASE_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${result.token}` },
          })
            .then((res) => {
              if (res.ok) return res.json();
              throw new Error('Failed to fetch /me');
            })
            .then((data) => {
              if (data.user && isMounted) {
                setUser(data.user);
                localStorage.setItem('rrh_user', JSON.stringify(data.user));
                const currentActiveRole = localStorage.getItem('rrh_active_role');
                if (!currentActiveRole || !data.user.roles.includes(currentActiveRole)) {
                  const newRole = data.user.roles?.[0] || 'Employee';
                  setActiveRoleState(newRole);
                  localStorage.setItem('rrh_active_role', newRole);
                }
              }
            })
            .catch(console.error);
        } else if (result.reason === 'unauthorized') {
          logout();
        }
      } else if (savedUser && accessToken) {
        setAuthStatus('authenticated');
      } else {
        logout();
      }
    };

    initAuth();

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  const login = (userData: UserProfile, token: string, refreshToken?: string) => {
    setUser(userData);
    setAccessToken(token);
    // A fresh, explicit password login already proves identity — this tab
    // shouldn't immediately demand a WebAuthn unlock too. The first lock
    // trigger after this is the next idle timeout or tab reopen.
    sessionStorage.setItem(UNLOCKED_SESSION_KEY, '1');
    setIsLocked(false);
    if (refreshToken) {
      idbSet('rrh_refresh_token', refreshToken).catch(console.error);
    }
    const savedRole = localStorage.getItem('rrh_active_role');
    if (savedRole && userData.roles?.includes(savedRole)) {
      setActiveRoleState(savedRole);
    } else {
      const initialRole = userData.roles?.[0] || 'Employee';
      setActiveRoleState(initialRole);
      localStorage.setItem('rrh_active_role', initialRole);
    }
    const isDone = Boolean(userData.firstLoginDone);
    setFirstLoginDoneState(isDone);
    localStorage.setItem('rrh_user', JSON.stringify({ ...userData, firstLoginDone: isDone }));
    localStorage.removeItem('rrh_token'); // Make sure it's strictly removed
    setAuthStatus('authenticated');
  };

  const setFirstLoginDone = (done: boolean) => {
    setFirstLoginDoneState(done);
    if (user) {
      const updated = { ...user, firstLoginDone: done };
      setUser(updated);
      localStorage.setItem('rrh_user', JSON.stringify(updated));
    }
  };

  const updateUser = (partialUser: Partial<UserProfile>) => {
    if (user) {
      const updated = { ...user, ...partialUser };
      setUser(updated);
      localStorage.setItem('rrh_user', JSON.stringify(updated));
    }
  };

  const fetchWithAuth = async (url: string, options: RequestInit = {}): Promise<Response> => {
    // § Phase 6 — while locked, refuse outright rather than silently
    // completing a background request with no token (or worse, triggering
    // a silent refresh that would populate one). The lock screen blocks the
    // UI, but this is the actual enforcement: no real API call succeeds
    // until unlockSession() runs.
    if (isLocked) {
      return new Response(JSON.stringify({ error: 'App is locked', code: 'APP_LOCKED' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const headers = new Headers(options.headers || {});
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    const res = await fetch(url, { ...options, headers });

    if (res.status === 403) {
      const clone = res.clone();
      const body = await clone.json().catch(() => ({}));
      window.dispatchEvent(
        new CustomEvent('auth:forbidden', {
          detail: body.error || 'Forbidden: Insufficient permissions',
        }),
      );
      return res;
    }

    if (res.status === 401) {
      const clone = res.clone();
      const body = await clone.json().catch(() => ({}));
      if (body.error === 'Permissions updated. Please log in again.') {
        logout();
        window.dispatchEvent(new CustomEvent('auth:force_logout', { detail: body.error }));
        return res;
      }

      const result = await refreshAccessToken();

      if (result.success) {
        setAccessToken(result.token);

        const retryHeaders = new Headers(options.headers || {});
        retryHeaders.set('Authorization', `Bearer ${result.token}`);
        return fetch(url, { ...options, headers: retryHeaders });
      } else if (result.reason === 'unauthorized') {
        logout();
      }
    }

    return res;
  };

  // § Phase 6 — keep the local "app lock enabled" cache in sync with the
  // server's actual WebAuthnCredential state (source of truth) whenever we
  // have a real access token to ask with. Covers: enabled on another device,
  // last device removed from the Settings page elsewhere, etc. Only ever
  // narrows the window between "server truth" and "this tab's cache" — it
  // does not itself lock or unlock anything.
  useEffect(() => {
    if (!accessToken || isLocked) return;
    let cancelled = false;
    fetch(`${API_BASE_URL}/auth/app-lock/status`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        localStorage.setItem(APPLOCK_ENABLED_KEY, data.enabled ? '1' : '0');
        setAppLockEnabledState(data.enabled);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [accessToken, isLocked]);

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        authStatus,
        firstLoginDone: firstLoginDone,
        attendanceStamped,
        activeRole,
        setActiveRole,
        login,
        logout,
        setFirstLoginDone,
        setAttendanceStamped,
        updateUser,
        fetchWithAuth,
        isLocked,
        appLockEnabled,
        setAppLockEnabled,
        lock,
        unlockSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
