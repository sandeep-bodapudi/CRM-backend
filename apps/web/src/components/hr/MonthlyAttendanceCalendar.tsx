import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Loader2,
  AlertCircle,
  User,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { API_BASE_URL } from '../../config';
import { useAuth } from '../../context/AuthContext';

interface CalendarProps {
  employeeId?: number; // Optional. If passed, views that employee's calendar. Otherwise views logged-in user's.
}

export const MonthlyAttendanceCalendar: React.FC<CalendarProps> = ({ employeeId }) => {
  const { fetchWithAuth } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentDate, setCurrentDate] = useState(new Date());

  const [calendarData, setCalendarData] = useState<any>(null);

  const fetchCalendar = async (year: number, month: number) => {
    setLoading(true);
    setError(null);
    try {
      let url = `${API_BASE_URL}/attendance/calendar?year=${year}&month=${month}`;
      if (employeeId) {
        url += `&employeeId=${employeeId}`;
      }
      const res = await fetchWithAuth(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch calendar');
      setCalendarData(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalendar(currentDate.getFullYear(), currentDate.getMonth() + 1);
  }, [currentDate, employeeId]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month, 0).getDate();
  };

  const generateCalendarGrid = () => {
    if (!calendarData) return [];

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month + 1);

    // Day 0 is Sunday, 1 is Monday...
    const firstDay = new Date(year, month, 1).getDay();
    const grid = [];

    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
    const currentDay = today.getDate();

    // Pad empty cells before the 1st
    for (let i = 0; i < firstDay; i++) {
      grid.push(
        <div
          key={`empty-${i}`}
          className="h-24 bg-slate-50 border border-slate-100 rounded-lg"
        ></div>,
      );
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(year, month, day);
      const isSunday = dateObj.getDay() === 0;
      const isFuture = (isCurrentMonth && day > currentDay) || dateObj > today;

      const dayStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      const dayData = calendarData.calendar ? calendarData.calendar[dayStr] : null;

      let isBeforeCreation = false;
      if (calendarData.employeeCreatedAt) {
        const creationDate = new Date(calendarData.employeeCreatedAt);
        creationDate.setHours(0, 0, 0, 0);
        if (dateObj < creationDate) {
          isBeforeCreation = true;
        }
      }

      let statusColor = 'bg-white';
      let statusText = '';

      if (isBeforeCreation) {
        statusColor = 'bg-slate-50 border-slate-100 opacity-50';
        statusText = '';
      } else if (dayData) {
        const status = dayData.status;
        if (status === 'PRESENT') {
          statusColor = 'bg-emerald-100 border-emerald-300';
          statusText = 'Present';
        } else if (status === 'LATE') {
          statusColor = 'bg-amber-100 border-amber-300';
          statusText = 'Late';
        } else if (status === 'HALF_DAY') {
          statusColor = 'bg-purple-100 border-purple-300';
          statusText = dayData.leaveType
            ? `Half Day (Leave - ${dayData.leaveType === 'FIRST_HALF' ? '1st Half' : '2nd Half'})`
            : 'Half Day';
        } else if (status === 'HOLIDAY') {
          statusColor = 'bg-slate-200 border-slate-300';
          statusText = dayData.holidayName || 'Holiday';
        } else if (status === 'LEAVE') {
          statusColor = 'bg-orange-100 border-orange-300';
          statusText = 'Paid Leave';
        } else if (status === 'ABSENT' && !isFuture) {
          statusColor = 'bg-red-100 border-red-300';
          statusText = 'Absent';
        }
      } else if (!isFuture && isSunday) {
        statusColor = 'bg-slate-200 border-slate-300';
        statusText = 'Sunday';
      } else if (!isFuture) {
        statusColor = 'bg-red-100 border-red-300';
        statusText = 'Absent';
      }

      grid.push(
        <div key={day} className={`h-24 border rounded-lg p-2 flex flex-col ${statusColor}`}>
          <span
            className={`text-sm font-semibold ${isBeforeCreation ? 'text-slate-400' : 'text-slate-700'}`}
          >
            {day}
          </span>
          <div className="flex-1 flex items-center justify-center">
            {statusText && (
              <span
                className={`text-xs font-medium text-center px-1 py-0.5 rounded ${
                  statusText === 'Absent'
                    ? 'text-red-700'
                    : statusText === 'Present'
                      ? 'text-emerald-700'
                      : statusText === 'Late'
                        ? 'text-amber-700'
                        : statusText.startsWith('Half Day')
                          ? 'text-purple-700'
                          : statusText === 'Paid Leave'
                            ? 'text-orange-700'
                            : 'text-slate-600'
                }`}
              >
                {statusText}
              </span>
            )}
          </div>
        </div>,
      );
    }

    return grid;
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-navy-600" />
            Monthly Calendar
          </h2>
          <p className="text-slate-500 mt-1 text-sm">View attendance punches and penalties.</p>
        </div>

        <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-lg border border-slate-200">
          <button
            onClick={handlePrevMonth}
            className="p-1 hover:bg-white rounded border border-transparent hover:border-slate-300 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </button>
          <span className="font-semibold text-slate-700 min-w-[120px] text-center">
            {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
          <button
            onClick={handleNextMonth}
            className="p-1 hover:bg-white rounded border border-transparent hover:border-slate-300 transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-slate-600" />
          </button>
        </div>
      </div>

      <div className="p-6">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 text-navy-500 animate-spin" />
          </div>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-7 gap-2 text-center text-xs font-semibold text-slate-500 uppercase">
              <div>Sun</div>
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
              <div>Fri</div>
              <div>Sat</div>
            </div>

            <div className="grid grid-cols-7 gap-2">{generateCalendarGrid()}</div>
          </>
        )}
      </div>
    </div>
  );
};
