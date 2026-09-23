import React, { useState, useEffect, useRef } from 'react';
import {
  QrCode,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  XCircle,
  LogOut,
  Lock,
  User,
  Key,
  Camera,
  VideoOff,
  Eye,
  EyeOff,
} from 'lucide-react';
import { API_BASE_URL } from '../../config';
import { ScanResult } from '../../types';
import jsQR from 'jsqr';
import { getTimeBasedGreeting } from '../../utils/greeting';

type KioskMode = 'KIOSK_LOGIN' | 'IDLE' | 'PROCESSING' | 'SUCCESS' | 'ERROR';

export const Kiosk: React.FC = () => {
  const [mode, setMode] = useState<KioskMode>('KIOSK_LOGIN');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [timeIST, setTimeIST] = useState<string>('');

  // Kiosk credential login state
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showKioskPassword, setShowKioskPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [branchName, setBranchName] = useState<string | null>(null);
  const [credentialLabel, setCredentialLabel] = useState<string | null>(null);

  // Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const kioskToken = useRef<string | null>(null);
  const scanDelayRef = useRef(false);
  const cameraRunningRef = useRef(false);

  // Clock
  useEffect(() => {
    const updateTime = () => {
      setTimeIST(
        new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: false }),
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // § Phase 6 — while on /kiosk, point the browser at a distinctly-branded
  // manifest (its own name/icon/start_url) so "Install app" here creates a
  // separate home-screen icon that opens straight into kiosk mode, rather
  // than the main CRM's icon. Reuses the same root-scoped service worker —
  // no separate SW registration, avoids Service-Worker-Allowed complexity.
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) return;
    const originalHref = link.getAttribute('href');
    link.setAttribute('href', '/kiosk-manifest.json');
    return () => {
      if (originalHref) link.setAttribute('href', originalHref);
    };
  }, []);

  // Restore token
  useEffect(() => {
    const stored = localStorage.getItem('rrh_kiosk_token');
    if (stored) {
      kioskToken.current = stored;
      setMode('IDLE');
    }
  }, []);

  // Auto-start camera on entering IDLE
  useEffect(() => {
    if (mode === 'IDLE' && !cameraActive) {
      startCamera();
    }
  }, [mode]);

  const stopCamera = () => {
    cameraRunningRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.play();
        setCameraActive(true);
        cameraRunningRef.current = true;
        requestAnimationFrame(tick);
      }
    } catch (err) {
      console.error('Error accessing camera', err);
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setErrorMessage('Camera access denied. Please grant permission in your browser.');
      } else if (err instanceof Error && err.name === 'NotFoundError') {
        setErrorMessage('No camera found on this device.');
      } else {
        setErrorMessage(
          'Camera access denied or unavailable. Please ensure you are using HTTPS or localhost.',
        );
      }
      setMode('ERROR');
      startCountdown();
    }
  };

  const tick = () => {
    if (!cameraRunningRef.current) return;
    if (!videoRef.current || !canvasRef.current || mode !== 'IDLE') return;

    if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      canvasRef.current.height = videoRef.current.videoHeight;
      canvasRef.current.width = videoRef.current.videoWidth;
      const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
        const imageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code && !scanDelayRef.current) {
          scanDelayRef.current = true;
          handleScan(code.data);
          setTimeout(() => {
            scanDelayRef.current = false;
          }, 2000);
        }
      }
    }
    requestAnimationFrame(tick);
  };

  // Cleanup camera on unmount or mode change
  useEffect(() => {
    if (mode !== 'IDLE') stopCamera();
    return () => stopCamera();
  }, [mode]);

  const resetKiosk = () => {
    setMode('IDLE');
    setScanResult(null);
    setErrorMessage(null);
    setCountdown(null);
  };

  const startCountdown = () => {
    setCountdown(5);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev && prev > 1) return prev - 1;
        clearInterval(interval);
        resetKiosk();
        return null;
      });
    }, 1000);
  };

  const fetchWithKioskToken = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(options.headers || {});
    if (kioskToken.current) {
      headers.set('Authorization', `Bearer ${kioskToken.current}`);
    }
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      kioskToken.current = null;
      localStorage.removeItem('rrh_kiosk_token');
      setMode('KIOSK_LOGIN');
      setLoginError('Session ended — please log in again');
      throw new Error('Kiosk session ended');
    }
    return res;
  };

  const handleKioskLogin = async () => {
    if (!loginUsername.trim() || !loginPassword) {
      setLoginError('Both username and password are required.');
      return;
    }
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/kiosk-auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || 'Login failed');
        return;
      }
      kioskToken.current = data.accessToken;
      localStorage.setItem('rrh_kiosk_token', data.accessToken);
      setBranchName(data.branchName || null);
      setCredentialLabel(data.label || null);
      setMode('IDLE');
    } catch (err) {
      setLoginError('Network error during login.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleScan = async (payload: string) => {
    if (!payload.trim()) return;
    if (!kioskToken.current) {
      setErrorMessage('Not authenticated — please log in first.');
      setMode('ERROR');
      startCountdown();
      return;
    }
    setMode('PROCESSING');
    stopCamera();

    try {
      const res = await fetchWithKioskToken(`${API_BASE_URL}/attendance/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrPayload: payload }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      if (data.alreadyStamped) {
        const outRes = await fetchWithKioskToken(`${API_BASE_URL}/attendance/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ qrPayload: payload }),
        });

        const outData = await outRes.json();

        if (!outRes.ok) {
          throw new Error(outData.error || 'Logout failed');
        }

        setScanResult({
          type: 'LOG_OUT',
          time: outData.timeIST,
          duration: outData.working_duration_minutes,
          name: outData.full_name || 'Employee',
        });
      } else {
        setScanResult({
          type: 'LOG_IN',
          time: data.timeIST,
          status: data.status,
          name: data.full_name || 'Employee',
        });
      }

      setMode('SUCCESS');
      startCountdown();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message !== 'Kiosk session ended') {
        setErrorMessage(message);
        setMode('ERROR');
        startCountdown();
      }
    }
  };

  const handleLogout = () => {
    stopCamera();
    kioskToken.current = null;
    localStorage.removeItem('rrh_kiosk_token');
    setBranchName(null);
    setCredentialLabel(null);
    setMode('KIOSK_LOGIN');
    setLoginError(null);
    setLoginUsername('');
    setLoginPassword('');
  };

  if (mode === 'KIOSK_LOGIN') {
    return (
      <div className="flex flex-col h-screen bg-slate-900 text-white relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
          <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-navy-600/20 rounded-full blur-[120px]" />
          <div className="absolute top-[60%] -right-[10%] w-[40%] h-[40%] bg-emerald-600/10 rounded-full blur-[100px]" />
        </div>

        <div className="flex-1 flex items-center justify-center z-10 p-6">
          <div className="w-full max-w-sm bg-slate-800/80 backdrop-blur-xl rounded-3xl p-8 border border-slate-700 shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 bg-navy-500/20 rounded-full flex items-center justify-center border border-navy-500/30">
                <Lock className="w-8 h-8 text-navy-400" />
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight">RRH-CRMS</h1>
              <p className="text-navy-400 font-medium text-sm tracking-widest uppercase mt-1">
                Kiosk Terminal Login
              </p>
            </div>

            {loginError && (
              <div className="mb-4 bg-red-500/20 border border-red-500/30 rounded-xl p-3 text-red-300 text-sm">
                {loginError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">
                  <User className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                  Kiosk Username
                </label>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleKioskLogin()}
                  placeholder="Enter kiosk username"
                  className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-navy-500 text-sm"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">
                  <Key className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showKioskPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleKioskLogin()}
                    placeholder="Enter kiosk password"
                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-xl px-4 py-3 pr-11 focus:outline-none focus:ring-2 focus:ring-navy-500 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKioskPassword(!showKioskPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showKioskPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={handleKioskLogin}
                disabled={loginLoading}
                className="w-full bg-navy-500 hover:bg-navy-400 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {loginLoading ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <Lock className="w-5 h-5" />
                )}
                {loginLoading ? 'Signing in...' : 'Sign In to Kiosk'}
              </button>
            </div>
            <p className="text-center text-slate-500 text-xs mt-6">
              This terminal uses its own kiosk credentials.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-white relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-navy-600/20 rounded-full blur-[120px]" />
        <div className="absolute top-[60%] -right-[10%] w-[40%] h-[40%] bg-emerald-600/10 rounded-full blur-[100px]" />
      </div>

      <header className="z-10 p-6 flex justify-between items-center border-b border-slate-800 bg-slate-900/50 backdrop-blur-md">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">RRH-CRMS</h1>
          <p className="text-navy-400 font-medium text-sm tracking-widest uppercase mt-1">
            Smart Attendance Kiosk
          </p>
        </div>
        <div className="flex items-center gap-3">
          {branchName && (
            <span className="text-xs bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700 text-slate-300">
              <Clock className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
              {branchName}
            </span>
          )}
          <button
            onClick={handleLogout}
            className="text-slate-400 hover:text-white transition-colors text-xs flex items-center gap-1.5 bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-700"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
        <div className="flex items-center gap-4 text-lg font-mono text-slate-300 bg-slate-800/80 px-4 py-2 rounded-xl border border-slate-700 shadow-inner">
          <Clock className="w-5 h-5 text-gold-500" />
          <span>{timeIST}</span>
          <span className="text-xs text-slate-500 ml-1">IST</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center z-10 p-6">
        {mode === 'IDLE' && (
          <div className="text-center max-w-2xl w-full animate-fade-in-up">
            {credentialLabel && (
              <p className="text-xs text-slate-500 mb-2">Operating as: {credentialLabel}</p>
            )}

            <h2 className="text-4xl font-bold mb-4 text-slate-100">Show your QR Code</h2>
            <p className="text-slate-400 text-lg mb-8">
              Place your employee QR code in front of the camera to log in or log out.
            </p>

            <div
              className={`mb-8 relative rounded-3xl overflow-hidden border-2 border-navy-500/50 shadow-2xl mx-auto w-[90vw] max-w-[500px] aspect-square bg-black flex items-center justify-center ${!cameraActive ? 'hidden' : ''}`}
            >
              <video ref={videoRef} className="w-full h-full object-cover" />
              <canvas ref={canvasRef} className="hidden" />
              <div className="absolute inset-0 border-[8px] border-navy-400/30 rounded-3xl pointer-events-none" />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-64 h-64 border-2 border-dashed border-emerald-400/70 rounded-xl" />
              </div>
            </div>

            {!cameraActive && (
              <div className="w-[90vw] max-w-[500px] aspect-square mx-auto mb-8 bg-slate-800 rounded-3xl flex flex-col items-center justify-center border-2 border-navy-500/30 shadow-[0_0_50px_rgba(20,184,166,0.1)] relative">
                <div className="absolute inset-0 border border-navy-400/50 rounded-3xl animate-ping opacity-20" />
                <Camera className="w-16 h-16 text-navy-400 mb-4" />
                <button
                  onClick={startCamera}
                  className="px-6 py-3 bg-navy-600 hover:bg-navy-500 text-white rounded-xl text-base font-medium transition-colors flex items-center gap-2 shadow-lg"
                >
                  <Camera className="w-5 h-5" />
                  Enable Camera
                </button>
                <p className="text-xs text-slate-500 mt-4 max-w-xs text-center">
                  Camera permission is required to scan QR codes.
                </p>
              </div>
            )}
          </div>
        )}

        {mode === 'PROCESSING' && (
          <div className="text-center animate-fade-in-up">
            <RefreshCw className="w-24 h-24 mx-auto mb-6 text-navy-500 animate-spin" />
            <h2 className="text-3xl font-bold text-slate-100">Verifying Identity...</h2>
            <p className="text-slate-400 mt-2 text-lg">Please wait a moment.</p>
          </div>
        )}

        {mode === 'SUCCESS' && scanResult && (
          <div className="text-center max-w-md w-full bg-slate-800/80 backdrop-blur-xl rounded-3xl p-8 border border-slate-700 shadow-2xl animate-scale-up">
            <div
              className={`w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center ${scanResult.type === 'LOG_IN' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-navy-500/20 text-navy-400'}`}
            >
              {scanResult.type === 'LOG_IN' ? (
                <CheckCircle2 className="w-12 h-12" />
              ) : (
                <LogOut className="w-12 h-12" />
              )}
            </div>

            <h2 className="text-3xl font-bold text-white mb-1">
              {getTimeBasedGreeting()}, {scanResult.name}
            </h2>
            <p className="text-slate-400 font-medium mb-6">
              {scanResult.type === 'LOG_IN'
                ? 'You have logged in successfully.'
                : 'You have logged out successfully.'}
            </p>

            <div className="mt-6 space-y-4">
              <div className="bg-slate-900 rounded-xl p-4 flex justify-between items-center border border-slate-700">
                <span className="text-slate-400">Time</span>
                <span className="text-white font-bold font-mono text-lg">{scanResult.time}</span>
              </div>

              {scanResult.type === 'LOG_IN' && (
                <div className="bg-slate-900 rounded-xl p-4 flex justify-between items-center border border-slate-700">
                  <span className="text-slate-400">Status</span>
                  <span
                    className={`font-bold px-3 py-1 rounded-full text-sm ${
                      scanResult.status === 'PRESENT'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : scanResult.status === 'LATE'
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-slate-500/20 text-slate-400'
                    }`}
                  >
                    {scanResult.status}
                  </span>
                </div>
              )}

              {scanResult.type === 'LOG_OUT' && scanResult.duration !== undefined && (
                <div className="bg-slate-900 rounded-xl p-4 flex justify-between items-center border border-slate-700">
                  <span className="text-slate-400">Working Duration</span>
                  <span className="text-navy-400 font-bold">
                    {Math.floor(scanResult.duration / 60)}h {scanResult.duration % 60}m
                  </span>
                </div>
              )}
            </div>

            <p className="text-slate-500 mt-8 font-medium">Returning in {countdown}...</p>
          </div>
        )}

        {mode === 'ERROR' && (
          <div className="text-center max-w-md w-full bg-slate-800/80 backdrop-blur-xl rounded-3xl p-8 border border-red-900/50 shadow-2xl animate-shake">
            <div className="w-24 h-24 mx-auto mb-6 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center">
              <XCircle className="w-12 h-12" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">Scan Failed</h2>
            <p className="text-red-400 mt-2 text-lg">{errorMessage}</p>
            <p className="text-slate-500 mt-8 font-medium">Returning in {countdown}...</p>
          </div>
        )}
      </main>

      <footer className="z-10 p-4 text-center text-slate-500 text-xs border-t border-slate-800 bg-slate-900/50">
        Secured by RRH-CRMS Identity Engine — Kiosk Auth
      </footer>
    </div>
  );
};
