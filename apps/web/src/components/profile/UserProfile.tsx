import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  User,
  Phone,
  MapPin,
  Building,
  Briefcase,
  Mail,
  Edit3,
  Camera,
  QrCode,
  Maximize2,
  X,
  AlertTriangle,
  FileText,
  CreditCard,
} from 'lucide-react';

import { ChangePasswordModal } from '../auth/ChangePasswordModal';
import { ProfileEditModal } from './ProfileEditModal';
import { useLiveAttendanceQr } from '../../hooks/useLiveAttendanceQr';
import { QRCodeVisual } from '../common/QRCodeVisual';
import { API_BASE_URL } from '../../config';
import { mediaUrl } from '../../utils/imageUtils';
import { EmergencyLogoutModal } from './EmergencyLogoutModal';

import { Roles } from '../../shared';

const roleCopy: Record<string, string> = {
  [Roles.ADMIN]: 'Full system access, configuration, and oversight.',
  [Roles.TELECALLER]: 'Manage outbound calls, qualify leads, and schedule site visits.',
  [Roles.PROJECT_MANAGER]: 'Oversee site visits, manage inventory, and handle approvals.',
  [Roles.SALES_MANAGER]: 'Drive sales performance, review metrics, and approve discounts.',
  [Roles.AGENT]: 'Conduct site visits, follow up with clients, and close deals.',
  [Roles.MD]: 'Executive oversight, strategic approvals, and company-wide visibility.',
  [Roles.HR_MANAGER]: 'Manage employee lifecycle, attendance, payroll, and company policies.',
  [Roles.MARKETING_DIRECTOR]:
    'Oversee marketing campaigns, manage budgets, and analyze lead generation.',
  [Roles.FINANCE]: 'Process payments, generate receipts, and reconcile collections.',
  [Roles.CHANNEL_PARTNER_MANAGER]:
    'Manage channel partners, track their leads, and process commissions.',
  [Roles.DIGITAL_MARKETING_HEAD]: 'Lead digital marketing strategy and campaigns.',
  [Roles.DIGITAL_MARKETING_EXECUTIVE]: 'Execute digital marketing campaigns and SEO/SEM.',
  [Roles.DIGITAL_LEAD_OPERATOR]: 'Operate and distribute leads from digital channels.',
  [Roles.STAFF]: 'Standard employee access.',
};

export const UserProfile: React.FC = () => {
  const { user, fetchWithAuth, updateUser } = useAuth();
  const [isPasswordModalOpen, setIsPasswordModalOpen] = React.useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = React.useState(false);
  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState(false);
  const [isQRFullscreen, setIsQRFullscreen] = useState(false);
  const {
    token: qrToken,
    secondsLeft: qrSecondsLeft,
    failed: qrFailed,
  } = useLiveAttendanceQr('/attendance/my-qr');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // The `user` object in AuthContext is only refreshed on login and on the
  // background token-refresh cycle (see AuthContext.tsx's initAuth) — not on
  // every visit to this page. So if an admin fills in an employee's phone/
  // email/address/bank details after that employee's session started, the
  // employee's own Profile page kept showing a stale "Not provided" for data
  // that genuinely exists in the DB (confirmed via the admin's own employee-
  // detail view showing it correctly) until their access token happened to
  // expire and silently refresh. Fetch fresh on mount instead of waiting for
  // that.
  useEffect(() => {
    fetchWithAuth(`${API_BASE_URL}/auth/me`)
      .then((res) => res.json())
      .then((data) => {
        if (data.user) updateUser(data.user);
      })
      .catch(() => console.error('Failed to refresh profile'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsQRFullscreen(false);
    };
    if (isQRFullscreen) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isQRFullscreen]);

  if (!user) return null;

  const maskString = (str?: string | null, visibleCount = 4) => {
    if (!str) return '';
    if (str.length <= visibleCount) return '••••';
    return '•'.repeat(str.length - visibleCount) + str.slice(-visibleCount);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('profile_image', file);

    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/employees/me/photo`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      updateUser({ profileImageUrl: data.profile_image_url });
    } catch (err) {
      console.error('Failed to upload photo', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header Cover */}
        <div className="h-32 bg-gradient-to-r from-navy-700 to-slate-800"></div>

        {/* Profile Info */}
        <div className="px-6 pb-6 relative">
          <div className="flex flex-col sm:flex-row items-center sm:items-end -mt-12 sm:-mt-16 gap-4 sm:gap-6 mb-6">
            <div className="relative group shrink-0">
              <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl bg-white p-1.5 shadow-xl border border-slate-100 relative overflow-hidden">
                <div className="w-full h-full bg-slate-100 rounded-xl flex items-center justify-center text-navy-800 overflow-hidden">
                  {user.profileImageUrl ? (
                    <img
                      src={mediaUrl(user.profileImageUrl)}
                      alt={user.fullName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-10 h-10 sm:w-12 sm:h-12" />
                  )}
                </div>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="absolute bottom-2 right-2 p-2 bg-navy-600 text-white rounded-lg shadow-lg hover:bg-navy-700 transition-colors z-10 disabled:opacity-50"
              >
                <Camera className="w-4 h-4" />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handlePhotoUpload}
              />
            </div>
            <div className="flex-1 text-center sm:text-left pt-2 sm:pt-0">
              <h1 className="text-2xl font-bold text-slate-900">{user.fullName || 'Employee'}</h1>
              <p className="text-slate-500 font-medium">{user.roles?.join(', ')}</p>
            </div>
            <div className="shrink-0 flex gap-2 w-full sm:w-auto">
              <button
                onClick={() => setIsEditModalOpen(true)}
                className="flex-1 sm:flex-none px-4 py-2 bg-navy-600 text-white font-semibold rounded-xl hover:bg-navy-700 transition-colors text-sm shadow-sm flex items-center justify-center gap-2"
              >
                <Edit3 className="w-4 h-4" />
                <span>Edit Profile</span>
              </button>
              <button
                onClick={() => setIsPasswordModalOpen(true)}
                className="flex-1 sm:flex-none px-4 py-2 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-colors text-sm border border-slate-200"
              >
                Change Password
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Roles & Responsibilities */}
            <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100 md:col-span-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Roles & Responsibilities
              </h3>
              <div className="flex flex-col gap-2">
                {user.roles?.map((role) => (
                  <div key={role} className="flex items-start gap-2">
                    <span className="text-[10px] font-bold text-navy-700 bg-navy-100 px-2 py-0.5 rounded shrink-0 mt-0.5">
                      {role}
                    </span>
                    <span className="text-sm text-slate-600">
                      {roleCopy[role] || 'Standard employee access.'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Employment Details */}
            <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Employment Details
              </h3>
              <div className="flex items-center gap-3 text-sm text-slate-700">
                <div className="w-8 h-8 rounded-lg bg-navy-100 text-navy-700 flex items-center justify-center shrink-0">
                  <Briefcase className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-semibold">Employee ID</p>
                  <p className="font-mono font-bold text-slate-800">{user.employeeCode}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-700">
                <div className="w-8 h-8 rounded-lg bg-navy-100 text-navy-700 flex items-center justify-center shrink-0">
                  <Building className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-semibold">Department & Branch</p>
                  <p className="font-semibold text-slate-800">{user.branch || 'Not Assigned'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-700">
                <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-semibold">Company</p>
                  <p className="font-semibold text-slate-800">{user.company || 'RRH'}</p>
                </div>
              </div>
            </div>

            {/* Contact Info */}
            <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Contact Info
              </h3>
              <div className="flex items-center gap-3 text-sm text-slate-700">
                <div className="w-8 h-8 rounded-lg bg-navy-100 text-navy-700 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-semibold">Phone / WhatsApp</p>
                  <p className="font-semibold text-slate-800 text-xs">
                    {user.phone || 'Not provided'}
                    {user.whatsappNumber && ` / ${user.whatsappNumber}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-700">
                <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-semibold">Email Address</p>
                  <p className="font-semibold text-slate-800 text-xs">
                    {user.email || 'Not provided'}
                  </p>
                </div>
              </div>
            </div>

            {/* Address & KYC Details */}
            <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Address & KYC
              </h3>
              <div className="flex items-center gap-3 text-sm text-slate-700">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-semibold">Current Address</p>
                  <p className="font-semibold text-slate-800 text-xs">
                    {user.currentAddress || 'Not provided'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-700">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-semibold">PAN / Aadhaar</p>
                  <p className="font-semibold text-slate-800 text-xs">
                    {user.panNumber ? maskString(user.panNumber) : 'No PAN'} /{' '}
                    {user.aadhaarNumber ? maskString(user.aadhaarNumber) : 'No Aadhaar'}
                  </p>
                </div>
              </div>
            </div>

            {/* Bank Details */}
            <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Bank Details
              </h3>
              <div className="flex items-center gap-3 text-sm text-slate-700">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                  <Building className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-semibold">Account Info</p>
                  <p className="font-semibold text-slate-800 text-xs">
                    {user.bankName
                      ? `${user.bankName} - ${maskString(user.bankAccountNumber)}`
                      : 'Not provided'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-700">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-semibold">IFSC / Branch</p>
                  <p className="font-semibold text-slate-800 text-xs">
                    {user.bankIfsc ? `${user.bankIfsc} (${user.bankBranch})` : 'Not provided'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* QR Code Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-lg font-bold text-slate-800">Attendance QR</h2>
          {qrToken && (
            <button
              onClick={() => setIsQRFullscreen(true)}
              className="flex items-center gap-1.5 text-xs font-bold text-navy-600 hover:text-navy-800 transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Full screen</span>
            </button>
          )}
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center min-h-[300px]">
          {qrToken ? (
            <>
              <QRCodeVisual value={qrToken} size={180} label={user.employeeCode} />
              <p className="text-xs text-slate-500 mt-4 text-center">
                Scan this code at the Kiosk terminal to mark your daily attendance. It is a live
                code: it changes in {qrSecondsLeft}s, and screenshots stop working after 2 minutes.
              </p>
              {qrFailed && (
                <p className="text-xs font-bold text-red-600 mt-2 text-center">
                  Couldn't refresh the code. Check your internet connection; an old code will be
                  rejected at the kiosk.
                </p>
              )}
              <div className="mt-4 pt-4 border-t border-slate-100 w-full text-center">
                <button
                  onClick={() => setIsEmergencyModalOpen(true)}
                  className="text-xs font-bold text-rose-500 hover:text-rose-600 flex items-center justify-center gap-1.5 mx-auto transition-colors px-3 py-2 rounded-lg hover:bg-rose-50"
                >
                  <AlertTriangle className="w-4 h-4" />
                  Emergency Early Logout
                </button>
              </div>
            </>
          ) : (
            <div className="text-center text-slate-400">
              <QrCode className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">QR Code not available</p>
            </div>
          )}
        </div>
      </div>

      {isEditModalOpen && (
        <ProfileEditModal
          onClose={() => setIsEditModalOpen(false)}
          onSuccess={() => setIsEditModalOpen(false)}
        />
      )}

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

      {isEmergencyModalOpen && (
        <EmergencyLogoutModal onClose={() => setIsEmergencyModalOpen(false)} />
      )}

      {/* Fullscreen QR Modal */}
      {isQRFullscreen && qrToken && (
        <div
          className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 animate-in fade-in duration-200"
          onClick={() => setIsQRFullscreen(false)}
        >
          <button
            onClick={() => setIsQRFullscreen(false)}
            className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>

          <div
            className="bg-white p-8 sm:p-12 rounded-[2rem] shadow-2xl flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* The QR is deliberately large to ensure it can be scanned easily from a distance */}
            <QRCodeVisual value={qrToken} size={300} />
            <p className="mt-3 text-xs font-bold text-slate-500">
              Live code - refreshes in {qrSecondsLeft}s
            </p>
            <div className="mt-8 text-center">
              <h2 className="text-2xl font-bold text-navy-900 mb-2">{user.fullName}</h2>
              <div className="inline-block bg-slate-100 px-4 py-1.5 rounded-full font-mono text-sm font-bold text-slate-600">
                {user.employeeCode}
              </div>
            </div>
          </div>

          <p className="text-white/60 mt-8 text-sm text-center max-w-sm">
            Hold this QR code up to the camera on the Kiosk terminal.
          </p>
        </div>
      )}
    </div>
  );
};
