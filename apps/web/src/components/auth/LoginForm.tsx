import React, { useState } from 'react';
import { Lock, User, ShieldCheck, ArrowRight, AlertCircle, Sparkles, Bug } from 'lucide-react';
import { EMPLOYEE_CODE_REGEX } from '../../shared';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import { LoginResponseData } from '../../types';
import { PasswordInput } from '../ui/PasswordInput';

interface LoginFormProps {
  onSuccess?: (data: LoginResponseData) => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSuccess }) => {
  const { login } = useAuth();
  const [employeeCode, setEmployeeCode] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [debugDetails, setDebugDetails] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  // 2-step login: shown once the server says this account needs a code.
  const [otpNeeded, setOtpNeeded] = useState(false);
  const [otp, setOtp] = useState('');

  const handleCodeChange = (val: string) => {
    const formatted = val.toUpperCase().trim();
    setEmployeeCode(formatted);

    if (formatted && !EMPLOYEE_CODE_REGEX.test(formatted)) {
      setCodeError('Format must be RRH-<DEPT>-000 (e.g. RRH-SL-001)');
    } else {
      setCodeError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setDebugDetails(null);

    if (!employeeCode) {
      setCodeError('Employee ID is required');
      return;
    }

    if (!EMPLOYEE_CODE_REGEX.test(employeeCode)) {
      setCodeError('Invalid format. Expected: RRH-<DEPT>-000 (e.g. RRH-SL-001)');
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    if (otpNeeded && otp.length !== 6) {
      setErrorMessage('Enter the 6-digit code from your authenticator app.');
      return;
    }

    setIsLoading(true);

    try {
      const loginUrl = `${API_BASE_URL}/auth/login`;

      const res = await fetch(loginUrl, {
        method: 'POST',
        // 'include' so the httpOnly refreshToken cookie set by the server is stored
        // cross-origin (frontend dev server on :5173, API on :3000). Without this the
        // cookie is dropped and the token refresh on page reload fails (session lost).
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_code: employeeCode,
          password: password,
          ...(otpNeeded ? { otp } : {}),
        }),
      });

      const responseText = await res.text();
      let responseJson: LoginResponseData = {};
      try {
        responseJson = JSON.parse(responseText) as LoginResponseData;
      } catch (e) {
        // Raw text response fallback
      }

      if (!res.ok) {
        const code = (responseJson as { code?: string })?.code;
        if (code === 'OTP_REQUIRED') {
          setOtpNeeded(true);
          return;
        }
        if (code === 'OTP_INVALID') setOtp('');
        const errorText = responseJson?.error || responseJson?.message || responseText;
        if (res.status === 404) {
          setErrorMessage('System authentication is temporarily unavailable.');
        } else {
          setErrorMessage(
            errorText || 'Authentication failed. Please check your credentials and try again.',
          );
        }
        return;
      }

      // Authenticate inside AuthContext!
      if (responseJson.accessToken && responseJson.user) {
        const u = responseJson.user;
        const userProfile = {
          id: u.id,
          employeeCode: u.employeeCode || u.employee_code || '',
          fullName: u.fullName || u.full_name || '',
          department: u.department || '',
          company: (typeof u.company === 'string' ? u.company : u.company?.name) || 'RS CRM',
          branch: u.branch || 'HO',
          roles: u.roles || [],
          // Was reading responseJson.permissions, which doesn't exist at that level —
          // the API nests permissions inside the `user` object — so user.permissions
          // was always [], silently breaking every permission-gated UI element
          // (Edit Project, Add Units, etc.) app-wide regardless of the user's role.
          permissions: u.permissions || [],
          attendanceRequired: u.attendanceRequired ?? true,
          reportRequired: u.reportRequired ?? true,
          firstLoginDone: u.firstLoginDone ?? false,
        };
        login(userProfile, responseJson.accessToken, responseJson.refreshToken);
      }

      if (onSuccess) {
        onSuccess(responseJson);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[Auth Exception]', err);
      setErrorMessage(`Network Error: Failed to connect to server. ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white shadow-2xl rounded-3xl p-8 pt-10 border border-slate-100 relative overflow-hidden">
      {/* Brand Header */}
      <div className="text-center mb-7">
        <div className="w-16 h-16 rounded-2xl shadow-lg mx-auto mb-4 bg-gradient-to-br from-navy-50 to-white border border-navy-100 flex items-center justify-center">
          <img src="/logo.svg" alt="RS CRM Logo" className="w-11 h-11 object-contain" />
        </div>
        <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight">Welcome Back</h2>
        <p className="text-xs text-slate-500 mt-1.5">Sign in to RS CRM</p>
      </div>

      {/* Global Error Banner */}
      {errorMessage && (
        <div className="mb-4 p-3.5 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 space-y-1.5 animate-fadeIn">
          <div className="flex items-start gap-2 font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* Employee Code Input */}
        <div>
          <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Employee ID
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <User className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={employeeCode}
              onChange={(e) => handleCodeChange(e.target.value)}
              placeholder="e.g. RRH-SL-001"
              maxLength={15}
              className={`w-full pl-10 pr-4 py-3 bg-slate-50 border ${
                codeError
                  ? 'border-red-400 focus:ring-red-400'
                  : 'border-slate-200 focus:ring-navy-600'
              } rounded-xl focus:outline-none focus:ring-2 focus:bg-white transition-all font-mono tracking-wide placeholder:font-sans placeholder:tracking-normal text-slate-800 font-bold`}
            />
          </div>
          {codeError ? (
            <p className="text-xs text-red-600 mt-1.5 font-medium">{codeError}</p>
          ) : (
            <p className="text-[11px] text-slate-400 mt-1">
              Format:{' '}
              <span className="font-mono text-slate-600">RRH-&lt;DEPT&gt;-&lt;3-DIGITS&gt;</span>
            </p>
          )}
        </div>

        {/* Password Input */}
        <div>
          <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Password
          </label>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full pl-11 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-600 focus:bg-white transition-all text-slate-800 font-bold"
            icon={<Lock className="w-4 h-4" />}
          />
        </div>

        {otpNeeded && (
          <div>
            <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Code from your authenticator app
            </label>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-600 focus:bg-white text-center font-mono text-lg tracking-[0.4em] text-slate-800 font-bold"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Lost your phone? Ask the MD or Admin to reset your 2-step login.
            </p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full mt-6 bg-gradient-to-r from-navy-700 to-navy-900 hover:from-navy-800 hover:to-navy-950 text-white font-bold py-3.5 px-4 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0"
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <span>Sign In to EMS</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <p className="text-center text-[11px] text-slate-400 mt-5">
        Forgot your password? Contact HR and they'll help you reset it.
      </p>
    </div>
  );
};
