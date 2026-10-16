import React, { useEffect, useRef, useState } from 'react';
import { BadgeCheck, Printer, RefreshCw, ShieldOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';
import { handleApiError } from '../../utils/userFacingError';
import { QRCodeVisual } from '../common/QRCodeVisual';

/**
 * Printed badge + PIN, for the few people who cannot show a live code (no phone,
 * no data). HR switches it on per person; it only works at a kiosk, with a PIN,
 * and a lost badge is cancelled by re-issuing. The PIN is shown once here and
 * never again.
 */
export const KioskBadgePanel: React.FC<{
  employee: { id: number; fullName: string; employeeCode: string };
}> = ({ employee }) => {
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [qrData, setQrData] = useState<string | null>(null);
  const [pin, setPin] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setPin(null);
    fetchWithAuth(`${API_BASE_URL}/attendance/badge/${employee.id}`)
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => {
        setEnabled(!!d.enabled);
        setQrData(d.badge?.qrData || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id]);

  const act = async (what: 'enable' | 'disable') => {
    if (
      what === 'disable' &&
      !window.confirm('Switch this badge off? The printed badge will stop working.')
    ) {
      return;
    }
    if (
      what === 'enable' &&
      enabled &&
      !window.confirm('Re-issue the badge? The old badge and PIN stop working at once.')
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/attendance/badge/${employee.id}/${what}`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return handleApiError(res, showError, data);
      showToast(data.message, 'success');
      if (what === 'enable') {
        setEnabled(true);
        setQrData(data.badge?.qrData || null);
        setPin(data.pin || null);
      } else {
        setEnabled(false);
        setQrData(null);
        setPin(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const print = () => {
    const canvas = box.current?.querySelector('canvas');
    if (!canvas) return;
    const w = window.open('', '_blank', 'width=420,height=560');
    if (!w) return;
    // The PIN is deliberately not on the badge: it is told to the person separately.
    w.document.write(
      `<html><head><title>Attendance badge</title></head><body style="font-family:sans-serif;text-align:center;padding:24px">` +
        `<h2 style="margin:0">${employee.fullName}</h2><p style="margin:4px 0 16px;color:#555">${employee.employeeCode}</p>` +
        `<img src="${canvas.toDataURL('image/png')}" style="width:300px;height:300px"/>` +
        `<p style="color:#555;font-size:13px">Show this badge at the office kiosk, then type your PIN.</p>` +
        `<script>window.onload=function(){window.print()}</script></body></html>`,
    );
    w.document.close();
  };

  if (loading) return null;

  return (
    <div className="mt-4 pt-4 border-t border-slate-100 text-left space-y-3">
      <div className="flex items-center gap-2">
        <BadgeCheck className="w-4 h-4 text-navy-700" />
        <span className="text-xs font-extrabold text-slate-800">
          Printed badge + PIN (no phone needed)
        </span>
      </div>
      {!enabled ? (
        <>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            For staff who have no phone or data. They show a printed badge at the office kiosk and
            type a 4-digit PIN. Off for everyone unless you switch it on here.
          </p>
          <button
            onClick={() => act('enable')}
            disabled={busy}
            className="w-full py-2 rounded-xl bg-navy-900 text-white text-xs font-bold disabled:opacity-50"
          >
            Switch on for {employee.fullName.split(' ')[0] || employee.employeeCode}
          </button>
        </>
      ) : (
        <>
          {pin && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
              <p className="text-[10px] font-bold text-amber-800 uppercase">
                PIN (shown once: tell them, do not print it)
              </p>
              <p className="text-3xl font-black tracking-[0.4em] text-amber-900">{pin}</p>
            </div>
          )}
          {qrData ? (
            <div ref={box} className="flex justify-center">
              <QRCodeVisual value={qrData} size={160} label={employee.employeeCode} />
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">Badge switched on.</p>
          )}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={print}
              disabled={!qrData}
              className="py-2 rounded-xl border border-slate-300 text-[11px] font-bold flex items-center justify-center gap-1 disabled:opacity-40"
            >
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            <button
              onClick={() => act('enable')}
              disabled={busy}
              className="py-2 rounded-xl border border-slate-300 text-[11px] font-bold flex items-center justify-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Re-issue
            </button>
            <button
              onClick={() => act('disable')}
              disabled={busy}
              className="py-2 rounded-xl border border-rose-300 text-rose-700 text-[11px] font-bold flex items-center justify-center gap-1"
            >
              <ShieldOff className="w-3.5 h-3.5" /> Switch off
            </button>
          </div>
          <p className="text-[10px] text-slate-400">
            Works only at a kiosk, with the PIN. Lost it? Re-issue: the old badge stops working. You
            are alerted if one badge appears at two kiosks.
          </p>
        </>
      )}
    </div>
  );
};
