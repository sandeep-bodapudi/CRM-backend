import React, { useState } from 'react';
import { KeyRound, Loader2, MessageCircle, Copy } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';

export type PortalState = {
  status: 'NOT_INVITED' | 'INVITED' | 'EXPIRED' | 'ACTIVE';
  expiresAt: string | null;
};

const LABEL: Record<PortalState['status'], { text: string; tone: string }> = {
  NOT_INVITED: { text: 'Not invited', tone: 'bg-slate-100 text-slate-600' },
  INVITED: { text: 'Invited', tone: 'bg-amber-100 text-amber-800' },
  EXPIRED: { text: 'Invite expired', tone: 'bg-rose-100 text-rose-700' },
  ACTIVE: { text: 'Using the portal', tone: 'bg-emerald-100 text-emerald-800' },
};

export const PortalBadge: React.FC<{ portal?: PortalState }> = ({ portal }) => {
  const l = LABEL[portal?.status || 'NOT_INVITED'];
  return (
    <span className={`inline-flex px-2 py-1 rounded text-[10px] font-bold ${l.tone}`}>
      {l.text}
    </span>
  );
};

type Issued = { password: string; expiresAt: string; whatsappLink: string; portalUrl: string };

/** "Give portal access": a temporary My Property password to send on WhatsApp. */
export const PortalAccessPanel: React.FC<{
  customerId: number;
  portal?: PortalState;
  canIssue: boolean;
  onIssued: () => void;
}> = ({ customerId, portal, canIssue, onIssued }) => {
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);
  const status = portal?.status || 'NOT_INVITED';

  const issue = async () => {
    if (
      status === 'ACTIVE' &&
      !window.confirm(
        'This customer already uses My Property. A new temporary password replaces theirs and logs them out. Continue?',
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/customers/${customerId}/portal-access`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not create the password');
      setIssued(data);
      onIssued();
    } catch (err: any) {
      showError({ message: err?.message || 'Could not create the password' });
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.password);
      showToast({ message: 'Password copied', type: 'success' });
    } catch {
      showError({ message: 'Could not copy. Select the password and copy it.' });
    }
  };

  const expiry = (iso: string) =>
    new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 text-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">My Property portal</span>
            <PortalBadge portal={portal} />
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {status === 'NOT_INVITED' &&
              'The customer has no password yet. Give access to send them one on WhatsApp.'}
            {status === 'INVITED' &&
              portal?.expiresAt &&
              `Temporary password sent. It works until ${expiry(portal.expiresAt)}.`}
            {status === 'EXPIRED' &&
              'The temporary password ran out before they logged in. Send a new one.'}
            {status === 'ACTIVE' &&
              'They have set their own password. If they forgot it, send a new temporary one.'}
          </p>
        </div>
        {canIssue && !issued && (
          <button
            onClick={issue}
            disabled={busy}
            className="flex items-center gap-2 bg-navy-600 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-navy-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            {status === 'NOT_INVITED' ? 'Give portal access' : 'Send a new password'}
          </button>
        )}
      </div>

      {issued && (
        <div
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2"
          role="status"
        >
          <p className="text-xs text-emerald-900">
            Temporary password, shown only now. It works until {expiry(issued.expiresAt)}.
          </p>
          <div className="flex items-center gap-2">
            <code className="font-mono text-base font-bold tracking-wider text-slate-900 bg-white px-2 py-1 rounded border border-emerald-200 select-all">
              {issued.password}
            </code>
            <button
              onClick={copy}
              aria-label="Copy password"
              className="p-1.5 text-slate-500 hover:text-slate-800"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <a
            href={issued.whatsappLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 bg-emerald-600 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-emerald-700"
          >
            <MessageCircle className="w-4 h-4" /> Send on WhatsApp
          </a>
          <p className="text-[11px] text-slate-500">
            The message has the portal link ({issued.portalUrl}), their mobile number and this
            password.
          </p>
        </div>
      )}
    </div>
  );
};
