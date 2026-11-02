import React, { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ShieldCheck, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import { useToast } from '../../context/ToastContext';
import { handleApiError, toUserFacingError } from '../../utils/userFacingError';
import { Roles } from '../../shared';

// 2-step login with an authenticator app (Google Authenticator, Microsoft
// Authenticator...). Required for MD, Admin and Finance: the server refuses
// their other requests until it is on (TWO_STEP_SETUP_REQUIRED).

export const TWO_STEP_ROLES: string[] = [Roles.MD, Roles.ADMIN, Roles.FINANCE];

interface TwoStepStatus {
  enabled: boolean;
  required: boolean;
}

/** Status for the signed-in person; null while loading or on error. */
export const useTwoStepStatus = (active = true) => {
  const { fetchWithAuth, user } = useAuth();
  const [status, setStatus] = useState<TwoStepStatus | null>(null);
  const reload = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/auth/two-step`);
      if (res.ok) setStatus(await res.json());
    } catch {
      // Leave as is; the server still enforces it.
    }
  }, [fetchWithAuth]);
  useEffect(() => {
    if (user && active) reload();
  }, [user?.id, active, reload]);
  return { status, reload };
};

/** QR code + first code. Calls onDone once 2-step login is on. */
export const TwoStepEnrol: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/auth/two-step/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setSetup(data);
      else await handleApiError(res, showError, data);
    } catch (e) {
      showError(toUserFacingError({ message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/auth/two-step/enable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: code }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast('2-step login is on. You will be asked for a code when you sign in.', 'success');
        onDone();
      } else {
        await handleApiError(res, showError, data);
      }
    } catch (e) {
      showError(toUserFacingError({ message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  };

  if (!setup) {
    return (
      <div className="space-y-3 text-sm text-slate-600">
        <p>
          Install an authenticator app on your phone (Google Authenticator or Microsoft
          Authenticator), then press the button to get your QR code.
        </p>
        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="w-full bg-navy-700 hover:bg-navy-800 text-white font-bold py-3 rounded-xl disabled:opacity-60"
        >
          {busy ? 'Please wait…' : 'Show my QR code'}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={confirm} className="space-y-4 text-sm text-slate-600">
      <p>1. In the app, add an account and scan this code.</p>
      <div className="flex justify-center">
        <div className="p-3 bg-white border border-slate-200 rounded-xl">
          <QRCodeSVG value={setup.uri} size={180} />
        </div>
      </div>
      <p className="text-xs text-slate-500 text-center break-all">
        Can't scan? Enter this key instead: <span className="font-mono">{setup.secret}</span>
      </p>
      <label className="block">
        <span className="block mb-1">2. Enter the 6-digit code the app shows</span>
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-center font-mono text-lg tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-navy-600"
          placeholder="000000"
        />
      </label>
      <button
        type="submit"
        disabled={busy || code.length !== 6}
        className="w-full bg-navy-700 hover:bg-navy-800 text-white font-bold py-3 rounded-xl disabled:opacity-60"
      >
        {busy ? 'Checking…' : 'Turn on 2-step login'}
      </button>
    </form>
  );
};

/** Full-screen step for MD/Admin/Finance who haven't turned it on yet. */
export const TwoStepRequiredScreen: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const { user, logout } = useAuth();
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl my-auto">
        <div className="flex flex-col items-center mb-5 mt-2">
          <div className="w-16 h-16 bg-navy-100 rounded-full flex items-center justify-center mb-3">
            <ShieldCheck className="w-8 h-8 text-navy-700" />
          </div>
          <h2 className="text-xl font-black text-slate-800 text-center">Turn on 2-step login</h2>
          <p className="text-sm text-slate-500 text-center mt-2">
            Hi {user?.fullName || 'there'}, your role can approve payments and change permissions,
            so signing in also needs a code from your phone.
          </p>
        </div>
        <TwoStepEnrol onDone={onDone} />
        <button
          type="button"
          onClick={() => logout()}
          className="mt-4 w-full flex items-center justify-center gap-2 text-xs text-slate-500 hover:text-slate-700"
        >
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
      </div>
    </div>
  );
};

/** Card for the settings page. */
export const TwoStepSettingsCard: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();
  const { status, reload } = useTwoStepStatus();
  const [enrolling, setEnrolling] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const turnOff = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/auth/two-step/disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, otp: code }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast('2-step login is off.', 'success');
        setPassword('');
        setCode('');
        reload();
      } else {
        await handleApiError(res, showError, data);
      }
    } catch (e) {
      showError(toUserFacingError({ message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3 rounded-xl border border-slate-100 dark:border-slate-700 space-y-2">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">2-step login</p>
      </div>
      {!status ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">Loading…</p>
      ) : status.enabled ? (
        <div className="space-y-3">
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            On. Signing in asks for a code from your authenticator app.
          </p>
          {status.required ? (
            <p className="text-xs text-slate-500">
              Your role must keep it on. New or lost phone? Ask the MD or Admin to reset it, then
              set it up again.
            </p>
          ) : (
            <form onSubmit={turnOff} className="grid gap-2 sm:grid-cols-3">
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
              <input
                inputMode="numeric"
                placeholder="6-digit code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono"
              />
              <button
                type="submit"
                disabled={busy || !password || code.length !== 6}
                className="px-3 py-2 rounded-lg text-sm font-semibold border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Turn off
              </button>
            </form>
          )}
        </div>
      ) : enrolling ? (
        <TwoStepEnrol
          onDone={() => {
            setEnrolling(false);
            reload();
          }}
        />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Off. Turn it on so a stolen password alone can't open your account.
          </p>
          <button
            type="button"
            onClick={() => setEnrolling(true)}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-navy-700 text-white hover:bg-navy-800"
          >
            Set up 2-step login
          </button>
        </div>
      )}
    </div>
  );
};
