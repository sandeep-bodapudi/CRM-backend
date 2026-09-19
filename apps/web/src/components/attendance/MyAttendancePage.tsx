import React, { useState, useEffect } from 'react';
import { MonthlyAttendanceCalendar } from '../hr/MonthlyAttendanceCalendar';
import {
  CalendarCheck,
  AlertTriangle,
  FileText,
  X,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { LateLeaveProposals } from './LateLeaveProposals';
import { EmergencyLogoutModal } from '../profile/EmergencyLogoutModal';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';

const MyLeaveRequestsWidget: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const [proposals, setProposals] = useState<any[]>([]);

  useEffect(() => {
    fetchWithAuth(`${API_BASE_URL}/attendance/proposals/my`)
      .then((res) => res.json())
      .then((data) => {
        if (data.proposals) setProposals(data.proposals);
      })
      .catch(console.error);
  }, []);

  if (proposals.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
        My Recent Requests
      </h3>
      <div className="divide-y divide-slate-100">
        {proposals.map((p) => (
          <div key={p.id} className="py-3 flex items-center justify-between">
            <div>
              <div className="font-bold text-slate-800 text-sm">{p.type}</div>
              <div className="text-slate-500 text-xs mt-0.5">
                {new Date(p.target_date).toLocaleDateString('en-IN')} &middot; {p.reason}
              </div>
            </div>
            <div>
              {p.status === 'PENDING' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                  <Clock className="w-3.5 h-3.5" /> Pending
                </span>
              )}
              {p.status === 'APPROVED' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                </span>
              )}
              {p.status === 'REJECTED' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                  <XCircle className="w-3.5 h-3.5" /> Rejected
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const MyAttendancePage: React.FC = () => {
  const [isLateLeaveModalOpen, setIsLateLeaveModalOpen] = useState(false);
  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState(false);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-navy-100 text-navy-700 flex items-center justify-center shrink-0">
          <CalendarCheck className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Attendance</h1>
          <p className="text-sm text-slate-500">Track your daily attendance records and history</p>
        </div>
      </div>

      {/* Calendar Component (no employeeId passed so it fetches current user) */}
      <MonthlyAttendanceCalendar />

      {/* Legend & Actions Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
        {/* Legend */}
        <div>
          <h3 className="text-sm font-bold text-slate-800 mb-3 uppercase tracking-wider">Legend</h3>
          <div className="flex flex-wrap gap-4 text-xs font-semibold">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-emerald-100 border border-emerald-300 block"></span>
              <span className="text-slate-600">Present</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-amber-100 border border-amber-300 block"></span>
              <span className="text-slate-600">Late</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-purple-100 border border-purple-300 block"></span>
              <span className="text-slate-600">Half Day</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-orange-100 border border-orange-300 block"></span>
              <span className="text-slate-600">Leave</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-slate-200 border border-slate-300 block"></span>
              <span className="text-slate-600">Holiday / Sunday</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-red-100 border border-red-300 block"></span>
              <span className="text-slate-600">Absent</span>
            </div>
          </div>
        </div>

        <hr className="border-slate-100" />

        {/* Quick Actions (One Nav Bar) */}
        <div>
          <h3 className="text-sm font-bold text-slate-800 mb-3 uppercase tracking-wider">
            Quick Actions
          </h3>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setIsLateLeaveModalOpen(true)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-navy-50 hover:bg-navy-100 text-navy-700 font-bold rounded-xl transition-colors border border-navy-100"
            >
              <FileText className="w-4 h-4" />
              Leave / Late Request
            </button>
            <button
              onClick={() => setIsEmergencyModalOpen(true)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold rounded-xl transition-colors border border-rose-100"
            >
              <AlertTriangle className="w-4 h-4" />
              Emergency Early Logout
            </button>
          </div>
        </div>
      </div>

      <MyLeaveRequestsWidget />

      {/* Modals */}
      {isLateLeaveModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-scale-up relative bg-slate-50 rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsLateLeaveModalOpen(false)}
              className="absolute top-4 right-4 p-2 bg-white rounded-full shadow-sm hover:bg-slate-100 z-10"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
            <div className="p-2 pt-12">
              <LateLeaveProposals />
            </div>
          </div>
        </div>
      )}

      {isEmergencyModalOpen && (
        <EmergencyLogoutModal onClose={() => setIsEmergencyModalOpen(false)} />
      )}
    </div>
  );
};
