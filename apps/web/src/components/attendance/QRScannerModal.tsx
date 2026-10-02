import React, { useState, useEffect } from 'react';
import {
  QrCode,
  CheckCircle2,
  Clock,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  Sun,
  Coffee,
  Camera,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import { Roles } from '../../shared';
import { useLiveAttendanceQr } from '../../hooks/useLiveAttendanceQr';
import { QRCodeVisual } from '../common/QRCodeVisual';
import { CameraQRScanner } from '../common/CameraQRScanner';
import { ScanResult } from '../../types';

export const QRScannerModal: React.FC = () => {
  const { user, fetchWithAuth, setAttendanceStamped, activeRole } = useAuth();
  const [stampResult, setStampResult] = useState<ScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Time & Purpose States
  const [isBeforeHours, setIsBeforeHours] = useState(false);
  const [isAfterHours, setIsAfterHours] = useState(false);
  const [forceScan, setForceScan] = useState(false);
  const [scanMode, setScanMode] = useState<'CAMERA' | 'MY_QR'>('CAMERA');

  useEffect(() => {
    // Attendance Exemption Guard (MD, HR Manager, Admin, Marketing Director or attendanceRequired = false)
    const isManagementRole = (
      [Roles.MD, Roles.HR_MANAGER, Roles.ADMIN, Roles.MARKETING_DIRECTOR] as string[]
    ).includes(activeRole);
    if (user?.attendanceRequired === false || isManagementRole) {
      setAttendanceStamped(true);
      return;
    }

    // Check current time in IST (Asia/Kolkata)
    const now = new Date();
    const istOptions: Intl.DateTimeFormatOptions = {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    };
    const istTimeStr = new Intl.DateTimeFormat('en-US', istOptions).format(now);
    const [hourStr] = istTimeStr.split(':');
    const currentHour = parseInt(hourStr, 10);

    // Before 9 AM IST
    if (currentHour < 9) {
      setIsBeforeHours(true);
    }
    // After 3 PM IST (>= 15)
    else if (currentHour >= 15) {
      setIsAfterHours(true);
    }
  }, [user]);
  // Live code, refreshed every 30 s; fetched only while 'My QR' is open.
  const {
    token: activeToken,
    isLoading,
    secondsLeft,
  } = useLiveAttendanceQr(scanMode === 'MY_QR' ? '/attendance/my-qr' : null);

  const handleScanAndVerify = async () => {
    setIsScanning(true);
    setErrorMessage(null);

    try {
      if (!activeToken) {
        throw new Error('No valid QR token available');
      }

      const res = await fetchWithAuth(`${API_BASE_URL}/attendance/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qr_token: activeToken }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to verify attendance');
      }

      setStampResult(data.log);
      setTimeout(() => {
        setAttendanceStamped(true);
      }, 2000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorMessage(message);
    } finally {
      setIsScanning(false);
    }
  };

  // 1. Pre-Office Hours Modal (< 9:00 AM IST) - Prompt Purpose
  if (isBeforeHours && !forceScan && !stampResult) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl border border-slate-100 text-center animate-scaleUp">
          <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-200">
            <Clock className="w-8 h-8" />
          </div>

          <h2 className="text-xl font-bold text-slate-800">Early Login Purpose</h2>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            Official office check-in window opens at <strong>9:00 AM IST</strong>. Please select
            your purpose for logging in now:
          </p>

          <div className="mt-6 space-y-3">
            <button
              onClick={() => setAttendanceStamped(true)}
              className="w-full py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-all border border-slate-300 flex items-center justify-center gap-2"
            >
              <Coffee className="w-4 h-4 text-slate-600" />
              <span>Casual Checking / View Purpose Only</span>
            </button>

            <button
              onClick={() => setForceScan(true)}
              className="w-full py-3.5 bg-navy-700 hover:bg-navy-800 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center gap-2"
            >
              <QrCode className="w-4 h-4" />
              <span>Mark Early Attendance (Force QR Scan)</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Post-Office Hours View (> 3:00 PM IST)
  if (isAfterHours && !forceScan && !stampResult) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl border border-slate-100 text-center animate-scaleUp">
          <div className="w-16 h-16 bg-slate-100 text-slate-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-200">
            <Sun className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">After-Hours Access</h2>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            Official office check-in window was <strong>9:00 AM – 3:00 PM IST</strong>. You are
            logging in after official hours.
          </p>

          <button
            onClick={() => setAttendanceStamped(true)}
            className="mt-6 w-full py-3.5 bg-navy-700 hover:bg-navy-800 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center gap-2"
          >
            <span>Proceed to Dashboard</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // 3. Attendance Stamped Success View
  if (stampResult) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl border border-slate-100 text-center animate-scaleUp">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-200">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">Attendance Stamped!</h2>
          <p className="text-xs text-slate-500 mt-1">Recorded check-in for today</p>

          <div className="my-6 p-4 bg-slate-50 rounded-2xl border border-slate-100 text-left space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Recorded Time:</span>
              <span className="font-mono font-bold text-slate-800">
                {stampResult.check_in_at
                  ? new Date(stampResult.check_in_at).toLocaleTimeString()
                  : 'N/A'}{' '}
                IST
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Status:</span>
              <span
                className={`font-bold px-2.5 py-0.5 rounded-full ${
                  stampResult.status === 'PRESENT'
                    ? 'bg-emerald-100 text-emerald-800'
                    : stampResult.status === 'LATE'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-purple-100 text-purple-800'
                }`}
              >
                {stampResult.status}
              </span>
            </div>
          </div>

          <div className="text-xs text-slate-400 font-mono">Redirecting to Dashboard...</div>
        </div>
      </div>
    );
  }

  // 4. Official Office Hours QR Attendance Modal
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl border border-slate-100 text-center animate-scaleUp">
        <div className="w-12 h-12 bg-navy-50 text-navy-700 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <QrCode className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800">Verify Attendance</h2>
        <p className="text-xs text-slate-500 mt-1 mb-4">
          Scan using Device Camera or Display Personal QR Badge
        </p>

        {/* Mode Selector Tabs (Camera Scan vs My QR Badge) */}
        <div className="flex bg-slate-100 p-1 rounded-xl mb-5 text-xs font-bold">
          <button
            onClick={() => setScanMode('CAMERA')}
            className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              scanMode === 'CAMERA' ? 'bg-white text-navy-800 shadow-sm' : 'text-slate-500'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Camera Scanner</span>
          </button>

          <button
            onClick={() => setScanMode('MY_QR')}
            className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              scanMode === 'MY_QR' ? 'bg-white text-navy-800 shadow-sm' : 'text-slate-500'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>My QR Badge</span>
          </button>
        </div>

        {scanMode === 'CAMERA' ? (
          <CameraQRScanner
            onScanSuccess={handleScanAndVerify}
            isScanning={isScanning}
            errorMessage={errorMessage}
          />
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
              {isLoading ? (
                <div className="w-8 h-8 border-2 border-navy-600 border-t-transparent rounded-full animate-spin mx-auto py-8" />
              ) : activeToken ? (
                <>
                  <QRCodeVisual value={activeToken} size={190} label={user?.employeeCode} />
                  <p className="mt-2 text-center text-[11px] font-bold text-slate-500">
                    Live code - refreshes in {secondsLeft}s
                  </p>
                </>
              ) : (
                <span className="text-xs text-slate-400">Failed to load QR code</span>
              )}
            </div>

            <button
              onClick={handleScanAndVerify}
              disabled={isLoading || isScanning}
              className="w-full py-3.5 bg-navy-700 hover:bg-navy-800 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center gap-2"
            >
              <span>Verify QR Badge Attendance</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Instant Bypass Button */}
        <button
          onClick={() => setAttendanceStamped(true)}
          className="w-full mt-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 flex items-center justify-center gap-1.5 transition-all"
        >
          <ShieldCheck className="w-4 h-4 text-navy-700" />
          <span>Bypass & Enter System Directly</span>
        </button>
      </div>
    </div>
  );
};
