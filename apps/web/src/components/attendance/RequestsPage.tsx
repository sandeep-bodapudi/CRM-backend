import React, { useState } from 'react';
import { AlertTriangle, FileText } from 'lucide-react';
import { LateLeaveProposals } from './LateLeaveProposals';
import { MyLeaveRequestsWidget } from './MyAttendancePage';
import { EmergencyLogoutModal } from '../profile/EmergencyLogoutModal';

/**
 * Requests -- leave, late arrival, field work, work from home and
 * emergency early logout in one place. These used to sit behind
 * My Attendance -> "Leave / Late Request", which staff rarely found.
 */
export const RequestsPage: React.FC = () => {
  const [isEmergencyOpen, setIsEmergencyOpen] = useState(false);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-navy-100 text-navy-700 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Requests</h1>
            <p className="text-sm text-slate-500">
              Leave, late arrival, field work and work from home — sent to the MD for approval.
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsEmergencyOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-sm rounded-xl border border-rose-100"
        >
          <AlertTriangle className="w-4 h-4" />
          Emergency Early Logout
        </button>
      </div>

      <LateLeaveProposals />

      <MyLeaveRequestsWidget />

      {isEmergencyOpen && <EmergencyLogoutModal onClose={() => setIsEmergencyOpen(false)} />}
    </div>
  );
};
