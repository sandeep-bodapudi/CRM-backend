import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../config';
import { useAuth } from '../../context/AuthContext';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, User } from 'lucide-react';

interface EmployeeAttendanceSummaryProps {
  employeeId: number;
  employeeName: string;
  onClose: () => void;
}

export const EmployeeAttendanceSummary: React.FC<EmployeeAttendanceSummaryProps> = ({
  employeeId,
  employeeName,
  onClose,
}) => {
  const { fetchWithAuth } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [data, setData] = useState<any>(null);

  const fetchCalendar = async (year: number, month: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(
        `${API_BASE_URL}/attendance/calendar?year=${year}&month=${month}&employeeId=${employeeId}`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch calendar');
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalendar(currentDate.getFullYear(), currentDate.getMonth() + 1);
  }, [currentDate, employeeId]);

  const handlePrevMonth = () =>
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () =>
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const calculateStats = () => {
    if (!data || !data.calendar) return null;

    let totalWorkingDays = 0;
    let totalPresent = 0;
    let totalLeaves = 0;
    let lateMarks = 0;
    let halfDays = 0;
    let totalHolidays = 0;
    let totalAbsent = 0;

    const today = new Date();
    today.setHours(23, 59, 59, 999);

    Object.keys(data.calendar).forEach((dayStr) => {
      const dayData = data.calendar[dayStr];
      const dayDate = new Date(dayStr);

      // Only count days in the past or today, up to the end of the month
      if (dayDate > today) return;

      let isBeforeCreation = false;
      if (data.employeeCreatedAt) {
        const creationDate = new Date(data.employeeCreatedAt);
        creationDate.setHours(0, 0, 0, 0);
        if (dayDate < creationDate) {
          isBeforeCreation = true;
        }
      }

      if (isBeforeCreation) return;

      const status = dayData.status;

      // The server marks each person's own weekly off (and holidays, swaps,
      // comp-offs) as HOLIDAY; a duty day worked on it counts as a working day.
      if (status === 'HOLIDAY') {
        totalHolidays++;
        return; // Don't count as working day
      }

      totalWorkingDays++;

      if (status === 'PRESENT') {
        totalPresent++;
      } else if (status === 'LATE') {
        totalPresent++;
        lateMarks++;
      } else if (status === 'HALF_DAY') {
        totalPresent += 0.5;
        halfDays++;
      } else if (status === 'LEAVE') {
        totalLeaves++;
      } else if (status === 'ABSENT') {
        totalAbsent++;
      }
    });

    const penaltyAbsents =
      data.penaltyAbsents || Math.floor(lateMarks / 3) + Math.floor(halfDays / 2);
    const finalAbsents = totalAbsent + penaltyAbsents;

    return {
      totalWorkingDays,
      totalPresent,
      totalLeaves,
      lateMarks,
      halfDays,
      totalAbsent,
      penaltyAbsents,
      finalAbsents,
      totalHolidays,
    };
  };

  const stats = calculateStats();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden relative z-10 animate-in fade-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-navy-100 text-navy-700 rounded-xl">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-lg">{employeeName}</h2>
              <p className="text-xs text-slate-500 font-medium">Monthly Attendance Summary</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-xl transition-colors text-slate-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-slate-800 text-xl">
              {currentDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
            </h3>
            <div className="flex gap-2">
              <button
                onClick={handlePrevMonth}
                className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={handleNextMonth}
                className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-navy-500 border-t-transparent rounded-full"></div>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">
              {error}
            </div>
          ) : stats ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 mb-1">Working Days</p>
                  <p className="text-2xl font-black text-slate-800">{stats.totalWorkingDays}</p>
                  <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider">
                    Excludes Sun/Holidays
                  </p>
                </div>

                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <p className="text-xs font-semibold text-emerald-600 mb-1">Present</p>
                  <p className="text-2xl font-black text-emerald-700">{stats.totalPresent}</p>
                </div>

                <div className="p-4 bg-navy-50 rounded-2xl border border-navy-100">
                  <p className="text-xs font-semibold text-navy-600 mb-1">Approved Leaves</p>
                  <p className="text-2xl font-black text-navy-700">{stats.totalLeaves}</p>
                </div>

                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                  <p className="text-xs font-semibold text-amber-600 mb-1">Late Marks</p>
                  <p className="text-2xl font-black text-amber-700">{stats.lateMarks}</p>
                </div>
              </div>

              <div className="mt-8 p-5 bg-gradient-to-br from-red-50 to-orange-50 rounded-2xl border border-red-100">
                <h4 className="font-bold text-red-800 mb-4 flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4" /> Final Deductions Calculation
                </h4>

                <div className="space-y-3 text-sm text-red-700/80">
                  <div className="flex justify-between items-center border-b border-red-200/50 pb-2">
                    <span>Base Absents (Unapproved)</span>
                    <span className="font-bold">{stats.totalAbsent} days</span>
                  </div>

                  <div className="flex justify-between items-center border-b border-red-200/50 pb-2">
                    <span>Penalty: Late Marks ({stats.lateMarks} marks ÷ 3)</span>
                    <span className="font-bold">+{Math.floor(stats.lateMarks / 3)} days</span>
                  </div>

                  <div className="flex justify-between items-center border-b border-red-200/50 pb-2">
                    <span>Penalty: Half Days ({stats.halfDays} marks ÷ 2)</span>
                    <span className="font-bold">+{Math.floor(stats.halfDays / 2)} days</span>
                  </div>

                  <div className="flex justify-between items-center pt-2 text-base text-red-900">
                    <span className="font-black">Final Absent Days</span>
                    <span className="font-black bg-white px-3 py-1 rounded-lg shadow-sm border border-red-200">
                      {stats.finalAbsents} days
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-center text-slate-500 py-8">No data available for this month.</p>
          )}
        </div>
      </div>
    </div>
  );
};
