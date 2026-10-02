/**
 * NotificationToast.tsx
 *
 * A native-app-style floating toast that appears in the bottom-right corner
 * when a new notification arrives. Disappears automatically after 5 seconds.
 * Clicking it navigates to the relevant page (if a link is provided).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { NotificationItem } from '../../types';

interface NotificationToastProps {
  notification: NotificationItem | null;
  onDismiss: () => void;
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'LEAVE_APPROVED':
    case 'LEAVE_REJECTED':
      return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
    case 'SYSTEM':
      return <AlertCircle className="w-5 h-5 text-amber-500" />;
    default:
      return <Bell className="w-5 h-5 text-navy-600" />;
  }
}

function getTypeGradient(type: string) {
  switch (type) {
    case 'LEAVE_APPROVED':
      return 'from-emerald-500 to-teal-500';
    case 'LEAVE_REJECTED':
      return 'from-red-500 to-rose-500';
    case 'SYSTEM':
      return 'from-amber-500 to-orange-500';
    default:
      return 'from-navy-600 to-blue-600';
  }
}

export const NotificationToast: React.FC<NotificationToastProps> = ({
  notification,
  onDismiss,
}) => {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(100);

  const dismiss = useCallback(() => {
    setVisible(false);
    setTimeout(onDismiss, 350); // wait for exit animation
  }, [onDismiss]);

  useEffect(() => {
    if (!notification) return;
    setProgress(100);
    setVisible(true);

    // Start progress bar countdown
    const startTime = Date.now();
    const duration = 5000;
    const tick = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (remaining === 0) {
        clearInterval(tick);
        dismiss();
      }
    }, 50);

    return () => clearInterval(tick);
  }, [notification, dismiss]);

  if (!notification) return null;

  const handleClick = () => {
    if (notification.link) {
      if (notification.link.startsWith('/')) navigate(notification.link);
      else window.location.href = notification.link;
    }
    dismiss();
  };

  return (
    <div
      className={`fixed bottom-20 right-4 z-[9999] w-80 transition-all duration-350 ease-out
        ${visible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-4 opacity-0 scale-95'}
      `}
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden cursor-pointer"
        onClick={handleClick}
      >
        {/* Color accent bar on top */}
        <div className={`h-1 bg-gradient-to-r ${getTypeGradient(notification.type || '')}`} />

        {/* Main content */}
        <div className="p-4 flex items-start gap-3">
          <div className="shrink-0 w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
            {getTypeIcon(notification.type || '')}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold text-slate-900 text-sm truncate">{notification.title}</p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  dismiss();
                }}
                className="shrink-0 p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-slate-600 text-xs mt-0.5 line-clamp-2">{notification.message}</p>
            <p className="text-[10px] text-slate-400 mt-1.5 font-medium">
              RRH CRMS &bull; just now
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-0.5 bg-slate-100">
          <div
            className={`h-full bg-gradient-to-r ${getTypeGradient(notification.type || '')} transition-none`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
};
