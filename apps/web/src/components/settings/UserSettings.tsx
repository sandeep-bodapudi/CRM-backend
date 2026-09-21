import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { ChangePasswordModal } from '../auth/ChangePasswordModal';
import {
  Moon,
  Sun,
  Monitor,
  Bell,
  BellOff,
  Navigation,
  User,
  Lock,
  LogOut,
  Smartphone,
  Download,
  Volume2,
  Check,
  Fingerprint,
  Trash2,
  ShieldAlert,
  RefreshCw,
} from 'lucide-react';
import {
  playNotificationSound,
  getStoredTone,
  setStoredTone,
  NotificationTone,
} from '../../hooks/useNotificationSound';
import { useTheme, ThemeMode } from '../../hooks/useTheme';
import {
  deviceSupportsAppLock,
  getAppLockStatus,
  registerAppLockDevice,
  removeAppLockDevice,
  defaultDeviceLabel,
  AppLockCredential,
} from '../../api/appLock';

export const UserSettings: React.FC = () => {
  const { user, logout, fetchWithAuth, appLockEnabled, setAppLockEnabled } = useAuth();
  const { isSupported, permission, isActive, isEnabled, isSubscribing, subscribe, unsubscribe } =
    usePushNotifications();
  const { canInstall, install } = usePWAInstall();

  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isForceRefreshing, setIsForceRefreshing] = useState(false);

  // Nuclear fallback for anyone stuck on a stale cached build: doesn't
  // depend on registration.waiting or any service-worker state being
  // coherent (unlike UpdateAvailableBanner/useSwUpdate), so it works even
  // when the automatic update flow itself is stuck. Also logs out (rather
  // than just reloading the current authenticated view) so the reload
  // lands on a genuinely clean boot: a stale build can carry stale
  // in-memory auth/app state alongside stale assets, and re-authenticating
  // from the login screen is the only way to guarantee the whole app --
  // not just its cache -- comes back fresh.
  const handleForceRefresh = async () => {
    setIsForceRefreshing(true);
    try {
      await logout();
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } finally {
      window.location.reload();
    }
  };

  // App Lock (WebAuthn) — hidden entirely on devices with no platform
  // authenticator, since offering it there would just fail on registration.
  const [appLockSupported, setAppLockSupported] = useState(false);
  const [appLockCredentials, setAppLockCredentials] = useState<AppLockCredential[]>([]);
  const [isAppLockBusy, setIsAppLockBusy] = useState(false);
  const [appLockError, setAppLockError] = useState<string | null>(null);

  useEffect(() => {
    deviceSupportsAppLock().then(setAppLockSupported);
  }, []);

  const refreshAppLockStatus = async () => {
    try {
      const status = await getAppLockStatus(fetchWithAuth);
      setAppLockCredentials(status.credentials);
      setAppLockEnabled(status.enabled);
    } catch {
      // Leave prior state — a transient fetch failure shouldn't flip the toggle.
    }
  };

  useEffect(() => {
    if (appLockSupported) {
      refreshAppLockStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appLockSupported]);

  const handleAddDevice = async () => {
    setIsAppLockBusy(true);
    setAppLockError(null);
    try {
      await registerAppLockDevice(fetchWithAuth, defaultDeviceLabel());
      await refreshAppLockStatus();
    } catch (e) {
      setAppLockError(e instanceof Error ? e.message : 'Could not register this device.');
    } finally {
      setIsAppLockBusy(false);
    }
  };

  const handleRemoveDevice = async (credentialId: number) => {
    setIsAppLockBusy(true);
    setAppLockError(null);
    try {
      await removeAppLockDevice(fetchWithAuth, credentialId);
      await refreshAppLockStatus();
    } catch (e) {
      setAppLockError(e instanceof Error ? e.message : 'Could not remove this device.');
    } finally {
      setIsAppLockBusy(false);
    }
  };
  const { theme, setTheme, isDark } = useTheme();
  const [notifTone, setNotifTone] = useState<NotificationTone>(getStoredTone);

  // Selecting a tone saves it AND plays it immediately (like alarm ringtone picker)
  const handleToneChange = (tone: NotificationTone) => {
    setNotifTone(tone);
    setStoredTone(tone);
    playNotificationSound(tone); // play immediately on selection
  };

  const persistKey = `rrh_sidebar_persist_off_${user?.id || 'default'}`;
  const [rememberNav, setRememberNav] = useState(() => {
    return localStorage.getItem(persistKey) !== 'true';
  });

  useEffect(() => {
    if (rememberNav) {
      localStorage.removeItem(persistKey);
    } else {
      localStorage.setItem(persistKey, 'true');
      // Also clear the existing memory
      localStorage.removeItem(`rrh_sidebar_state_${user?.id || 'default'}`);
      localStorage.removeItem(`rrh_mobile_nav_state_${user?.id || 'default'}`);
    }
  }, [rememberNav, user?.id]);

  const handleNotificationsToggle = async () => {
    if (isActive || isEnabled) {
      await unsubscribe(); // sets isEnabled = false in hook
    } else {
      await subscribe(); // requests permission + sets isEnabled = true
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Personal Settings</h1>
        <p className="text-slate-500 dark:text-slate-400">
          Manage your individual application preferences.
        </p>
      </div>

      {/* APPEARANCE */}
      <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-4">
        <div className="border-b border-slate-100 dark:border-slate-700 pb-4">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Appearance</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Choose how the application looks on your device.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 pt-2">
          {[
            {
              mode: 'light' as ThemeMode,
              icon: Sun,
              label: 'Light',
              preview: 'bg-white border-slate-200',
            },
            {
              mode: 'dark' as ThemeMode,
              icon: Moon,
              label: 'Dark',
              preview: 'bg-slate-900 border-slate-700',
            },
            {
              mode: 'system' as ThemeMode,
              icon: Monitor,
              label: 'System',
              preview: 'bg-gradient-to-br from-white to-slate-800 border-slate-300',
            },
          ].map(({ mode, icon: Icon, label, preview }) => {
            const isSelected = theme === mode;
            return (
              <button
                key={mode}
                onClick={() => setTheme(mode)}
                className={`relative flex flex-col items-center justify-center gap-2.5 p-4 rounded-2xl border-2 transition-all ${
                  isSelected
                    ? 'border-navy-600 bg-navy-50 dark:bg-navy-900/40 dark:border-navy-400 shadow-md'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                {/* Mini theme preview swatch */}
                <div
                  className={`w-full h-8 rounded-lg border ${preview} mb-1 flex items-center justify-center overflow-hidden`}
                >
                  <div className="w-2/3 h-2 rounded bg-current opacity-20" />
                </div>
                <Icon
                  className={`w-5 h-5 ${isSelected ? 'text-navy-700 dark:text-navy-300' : 'text-slate-400'}`}
                />
                <span
                  className={`text-xs font-bold ${isSelected ? 'text-navy-800 dark:text-navy-200' : 'text-slate-600 dark:text-slate-400'}`}
                >
                  {label}
                </span>
                {isSelected && (
                  <span className="absolute top-2 right-2 w-5 h-5 bg-navy-600 rounded-full flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {theme === 'system' && (
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center pt-1">
            Currently showing <strong>{isDark ? 'dark' : 'light'}</strong> based on your device
            preference.
          </p>
        )}
      </section>

      {/* NOTIFICATIONS */}
      <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-5">
        <div className="border-b border-slate-100 dark:border-slate-700 pb-4">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Notifications</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manage real-time alerts, push notifications, and alert sounds.
          </p>
        </div>

        {/* Push Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg transition-colors ${isActive ? 'bg-navy-100 text-navy-700' : 'bg-slate-100 text-slate-500'}`}
            >
              {isActive ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
            </div>
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-100">Push Notifications</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {!isSupported
                  ? 'Not supported in this browser'
                  : permission === 'denied'
                    ? 'Blocked — please enable in browser settings'
                    : isActive
                      ? 'On — you will receive real-time alerts'
                      : 'Off — tap to enable'}
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={isActive}
              disabled={!isSupported || permission === 'denied' || isSubscribing}
              onChange={handleNotificationsToggle}
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-navy-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-navy-600 disabled:opacity-50"></div>
          </label>
        </div>

        {/* Sound Selector — only visible when notifications are ON */}
        {isActive && (
          <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Volume2 className="w-4 h-4 text-navy-600 dark:text-navy-300" />
              <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                Alert Sound
              </p>
              <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">Tap to select</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {(['chime', 'ding', 'alert', 'pop', 'none'] as NotificationTone[]).map((tone) => (
                <button
                  key={tone}
                  onClick={() => handleToneChange(tone)}
                  className={`flex flex-col items-center justify-center gap-1.5 py-3 px-1 rounded-xl border-2 transition-all ${
                    notifTone === tone
                      ? 'border-navy-600 bg-navy-50 dark:bg-navy-900/40 text-navy-800 dark:text-navy-200 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <span className="text-lg">
                    {tone === 'none'
                      ? '🔕'
                      : tone === 'chime'
                        ? '🎵'
                        : tone === 'ding'
                          ? '🔔'
                          : tone === 'alert'
                            ? '⚡'
                            : '💫'}
                  </span>
                  <span className="text-[10px] font-bold capitalize">{tone}</span>
                  {notifTone === tone && (
                    <span className="w-1.5 h-1.5 rounded-full bg-navy-600 dark:bg-navy-400" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* NAVIGATION */}
      <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-4">
        <div className="border-b border-slate-100 dark:border-slate-700 pb-4">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Navigation</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Configure how the application menus behave.
          </p>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-navy-50 dark:bg-navy-900/40 text-navy-700 dark:text-navy-300">
              <Navigation className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-100">
                Remember Sidebar State
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Keep menu groups expanded/collapsed across visits
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={rememberNav}
              onChange={(e) => setRememberNav(e.target.checked)}
            />
            <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-navy-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-navy-600"></div>
          </label>
        </div>
      </section>

      {/* APP INSTALLATION */}
      <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-4">
        <div className="border-b border-slate-100 dark:border-slate-700 pb-4">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">App Installation</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Install RRH CRMS as a native app on your device.
          </p>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-navy-50 dark:bg-navy-900/40 text-navy-700 dark:text-navy-300">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                Install App
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Add to your home screen for quick access
              </p>
            </div>
          </div>

          <button
            disabled={!canInstall}
            onClick={install}
            className="flex items-center gap-2 px-4 py-2 bg-navy-600 hover:bg-navy-700 text-white font-semibold text-sm rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <Download className="w-4 h-4" />
            {canInstall ? 'Install Now' : 'Installed'}
          </button>
        </div>
      </section>

      {/* APP UPDATES */}
      <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-4">
        <div className="border-b border-slate-100 dark:border-slate-700 pb-4">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">App Updates</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            If the app feels stuck on an old version, force a fresh reload.
          </p>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-navy-50 dark:bg-navy-900/40 text-navy-700 dark:text-navy-300">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                Force refresh app
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Clears cached app data, signs you out, and reloads the latest version — sign in
                again once it's done
              </p>
            </div>
          </div>

          <button
            onClick={handleForceRefresh}
            disabled={isForceRefreshing}
            className="flex items-center gap-2 px-4 py-2 bg-navy-600 hover:bg-navy-700 text-white font-semibold text-sm rounded-xl transition-colors disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            {isForceRefreshing ? 'Refreshing…' : 'Force Refresh'}
          </button>
        </div>
      </section>

      {/* APP LOCK — only shown on devices that actually support a platform
          authenticator (Windows Hello, Touch ID, Android fingerprint/PIN). */}
      {appLockSupported && (
        <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-4">
          <div className="border-b border-slate-100 dark:border-slate-700 pb-4">
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">App Lock</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Your login never expires on this device. App Lock adds a quick fingerprint/Face/PIN
              check after 30 minutes idle, so no one else can browse the CRM if you step away
              unlocked.
            </p>
          </div>

          {appLockError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{appLockError}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-lg transition-colors ${appLockEnabled ? 'bg-navy-100 text-navy-700' : 'bg-slate-100 text-slate-500'}`}
              >
                <Fingerprint className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                  {appLockEnabled ? 'App Lock is on' : 'App Lock is off'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {appLockEnabled
                    ? 'This device will lock after 30 minutes idle'
                    : 'Add this device to turn it on'}
                </p>
              </div>
            </div>
            <button
              onClick={handleAddDevice}
              disabled={isAppLockBusy}
              className="flex items-center gap-2 px-4 py-2 bg-navy-600 hover:bg-navy-700 text-white font-semibold text-sm rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              <Fingerprint className="w-4 h-4" />
              Add This Device
            </button>
          </div>

          {appLockCredentials.length > 0 && (
            <div className="border-t border-slate-100 dark:border-slate-700 pt-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Registered devices
              </p>
              {appLockCredentials.map((cred) => (
                <div
                  key={cred.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-700"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      {cred.device_label || 'Unnamed device'}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      Added {new Date(cred.created_at).toLocaleDateString('en-IN')}
                      {cred.last_used_at
                        ? ` · last used ${new Date(cred.last_used_at).toLocaleDateString('en-IN')}`
                        : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemoveDevice(cred.id)}
                    disabled={isAppLockBusy}
                    className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                    title="Remove this device"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ACCOUNT */}
      <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-4">
        <div className="border-b border-slate-100 dark:border-slate-700 pb-4">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Account</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manage your profile and security credentials.
          </p>
        </div>

        <div className="pt-2 space-y-3">
          <a
            href="/profile"
            className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-700 hover:border-slate-200 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                <User className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                  View Profile
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  See your employment and contact details
                </p>
              </div>
            </div>
            <span className="text-slate-400 dark:text-slate-500 text-sm font-medium">
              View &rarr;
            </span>
          </a>

          <button
            onClick={() => setIsPasswordModalOpen(true)}
            className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-700 hover:border-slate-200 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                  Change Password
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Update your account access credentials
                </p>
              </div>
            </div>
            <span className="text-slate-400 dark:text-slate-500 text-sm font-medium">
              Update &rarr;
            </span>
          </button>

          <button
            onClick={logout}
            className="w-full flex items-center justify-between p-3 rounded-xl border border-red-100 dark:border-red-900/40 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 group-hover:bg-red-200 dark:group-hover:bg-red-900/60 transition-colors">
                <LogOut className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-red-700 dark:text-red-400 text-sm">Sign Out</p>
                <p className="text-xs text-red-500 dark:text-red-500">End your current session</p>
              </div>
            </div>
          </button>
        </div>
      </section>

      {isPasswordModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setIsPasswordModalOpen(false)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <ChangePasswordModal />
          </div>
        </div>
      )}
    </div>
  );
};
