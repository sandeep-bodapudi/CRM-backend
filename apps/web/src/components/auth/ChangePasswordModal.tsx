import React, { useState } from 'react';
import { Lock, ShieldAlert, ArrowRight, CheckCircle2, X } from 'lucide-react';
import { PasswordInput } from '../ui/PasswordInput';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';

interface ChangePasswordModalProps {
  /** Set when opened from Profile/Settings (not the forced first-login
   * screen): shows "Change Password" wording, a close button, and a
   * confirmation once the new password is saved. */
  onClose?: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ onClose }) => {
  const { fetchWithAuth, setFirstLoginDone, login } = useAuth();
  const isFirstLogin = !onClose;
  const [done, setDone] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (newPassword !== confirmPassword) {
      setErrorMessage('New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setErrorMessage('Password must be at least 8 characters');
      return;
    }

    if (!/[A-Z]/.test(newPassword)) {
      setErrorMessage('Password must contain at least one uppercase letter');
      return;
    }

    if (!/[a-z]/.test(newPassword)) {
      setErrorMessage('Password must contain at least one lowercase letter');
      return;
    }

    if (!/[0-9]/.test(newPassword)) {
      setErrorMessage('Password must contain at least one number');
      return;
    }

    if (!/[^A-Za-z0-9]/.test(newPassword)) {
      setErrorMessage('Password must contain at least one special character');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update password');
      }

      // The server revoked every old session; keep the new refresh token or
      // the next token refresh uses the revoked one and signs the user out.
      if (data.accessToken && data.user) {
        login(data.user, data.accessToken, data.refreshToken);
      } else {
        setFirstLoginDone(true);
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setDone(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="relative w-full max-w-md bg-white rounded-2xl p-8 shadow-2xl border border-slate-100 animate-scaleUp max-h-[90vh] overflow-y-auto">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        {done && onClose ? (
          <div className="text-center py-4">
            <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800">Password changed</h2>
            <p className="text-sm text-slate-600 mt-2">
              Your new password is saved. Use it the next time you sign in — the old password no
              longer works.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full mt-6 py-3 bg-navy-700 hover:bg-navy-800 text-white font-medium rounded-xl transition-all shadow-md"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800">
                {isFirstLogin ? 'Action Required' : 'Change Password'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {isFirstLogin
                  ? 'First Login Password Change Required for Security'
                  : 'Enter your current password, then choose a new one'}
              </p>
            </div>

            {errorMessage && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 text-xs rounded-xl border border-red-200">
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Current Password
                </label>
                <PasswordInput
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  className="w-full pl-9 pr-10 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-navy-600 focus:bg-white transition-all"
                  icon={<Lock className="w-4 h-4 text-slate-400" />}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  New Password
                </label>
                <PasswordInput
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  placeholder="8+ chars, upper, lower, number, symbol"
                  className="w-full pl-9 pr-10 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-navy-600 focus:bg-white transition-all"
                  icon={<Lock className="w-4 h-4 text-slate-400" />}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Confirm New Password
                </label>
                <PasswordInput
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Confirm new password"
                  className="w-full pl-9 pr-10 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-navy-600 focus:bg-white transition-all"
                  icon={<Lock className="w-4 h-4 text-slate-400" />}
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 py-3 bg-navy-700 hover:bg-navy-800 text-white font-medium rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>{isFirstLogin ? 'Update Password & Continue' : 'Update Password'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
