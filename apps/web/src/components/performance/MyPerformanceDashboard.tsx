import React, { useState, useEffect, useCallback } from 'react';
import {
  Target,
  Award,
  CheckCircle,
  Clock,
  Calendar,
  AlertTriangle,
  Building2,
  User,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';

interface PerformanceBreakdown {
  baseScore: number;
  taskEvents: number;
  taskBoost: number;
  reportEvents: number;
  reportBoost: number;
  presentCount: number;
  presentBoost: number;
  propertyBookingContributions: number;
  propertyBookingBoost: number;
  targetExceededBoost: number;
  lateCount: number;
  latePenalty: number;
  halfDayCount: number;
  halfDayPenalty: number;
  belowTargetEvents: number;
  belowTargetPenalty: number;
  overdueTasksCount: number;
  overduePenalty: number;
  uninformedAbsentEvents: number;
  uninformedAbsentPenalty: number;
  midnightAutoCheckoutEvents: number;
  midnightAutoCheckoutPenalty: number;
  missingDailyReportEvents: number;
  missingDailyReportPenalty: number;
  completedAllWorkEvents: number;
  completedAllWorkBoost: number;
  manualAdjustmentsTotal: number;
  manualAdjustmentsCount: number;
}

interface MyScore {
  employeeId: number;
  score: number;
  breakdown: PerformanceBreakdown;
}

interface PerformanceEvent {
  id: string;
  action: string;
  title: string;
  points: number;
  // § Phase 4: NEUTRAL covers approved-late/approved-half-day and the
  // 10:15-10:30 grace tier — points earned/lost is 0, distinct from a real
  // penalty so it doesn't read as one.
  type: 'BOOST' | 'PENALTY' | 'NEUTRAL';
  description: string;
  timestamp: string;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const MyPerformanceDashboard: React.FC = () => {
  const { fetchWithAuth } = useAuth();

  const currentDate = new Date();
  const [year, setYear] = useState(currentDate.getFullYear());
  const [month, setMonth] = useState(currentDate.getMonth() + 1);

  const [scoreData, setScoreData] = useState<MyScore | null>(null);
  const [events, setEvents] = useState<PerformanceEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMatrix, setShowMatrix] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [scoreRes, historyRes] = await Promise.all([
        fetchWithAuth(`${API_BASE_URL}/performance/my-score?year=${year}&month=${month}`),
        fetchWithAuth(`${API_BASE_URL}/performance/history?year=${year}&month=${month}`),
      ]);

      const scoreJson = await scoreRes.json();
      const historyJson = await historyRes.json();

      if (scoreRes.ok && historyRes.ok) {
        setScoreData(scoreJson);
        setEvents(historyJson.events || []);
      } else {
        setError(scoreJson.error || historyJson.error || 'Failed to load performance data');
      }
    } catch {
      setError('Network error — check API connection');
    } finally {
      setIsLoading(false);
    }
  }, [fetchWithAuth, month, year]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePrevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 animate-pulse max-w-5xl mx-auto">
        <div className="h-10 w-48 bg-slate-100 rounded-xl mb-6" />
        <div className="h-32 bg-slate-100 rounded-2xl" />
        <div className="h-64 bg-slate-100 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center max-w-5xl mx-auto">
        <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
        <p className="text-sm text-red-700 font-medium">{error}</p>
        <button
          onClick={fetchData}
          className="mt-3 px-4 py-2 bg-navy-700 text-white text-xs rounded-xl hover:bg-navy-800"
        >
          Retry
        </button>
      </div>
    );
  }

  const breakdown = scoreData?.breakdown;

  // Determine Zone purely for visual display
  const score = scoreData?.score || 50;
  let zoneLabel = 'DANGER';
  let zoneColor = 'text-red-700 bg-red-100 border-red-200';

  if (score >= 86) {
    zoneLabel = 'EXCELLENT';
    zoneColor = 'text-purple-700 bg-purple-100 border-purple-200';
  } else if (score >= 66) {
    zoneLabel = 'SAFE';
    zoneColor = 'text-emerald-700 bg-emerald-100 border-emerald-200';
  } else if (score >= 41) {
    zoneLabel = 'SATISFACTORY';
    zoneColor = 'text-amber-700 bg-amber-100 border-amber-200';
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header and Month Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Target className="w-6 h-6 text-navy-600" /> My Performance
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Track your monthly contribution score and event history.
          </p>
        </div>

        <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
          <button
            onClick={handlePrevMonth}
            className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 font-bold text-slate-700 min-w-[120px] justify-center">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span>
              {MONTHS[month - 1]} {year}
            </span>
          </div>
          <button
            onClick={handleNextMonth}
            className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Score Card */}
        <div className="md:col-span-1 bg-gradient-to-br from-navy-800 to-slate-900 rounded-2xl p-6 text-white shadow-md relative overflow-hidden flex flex-col justify-center">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Award className="w-24 h-24" />
          </div>
          <span className="text-xs text-slate-300 font-semibold tracking-wider uppercase mb-2">
            Total Score
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-extrabold font-mono">{scoreData?.score.toFixed(1)}</span>
            <span className="text-lg text-slate-400">/ 100</span>
          </div>
          <div className="mt-4">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${zoneColor}`}
            >
              {zoneLabel} ZONE
            </span>
          </div>
        </div>

        {/* Breakdown Summary */}
        <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-wide">
            Monthly Breakdown
          </h3>
          {breakdown && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="block text-xs text-slate-500 mb-1">Base Score</span>
                <span className="block text-lg font-bold text-slate-800">
                  {breakdown.baseScore}
                </span>
                <span className="block text-[10px] text-slate-400 mt-1">
                  Base metric: out of 100
                </span>
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                <span className="block text-xs text-emerald-700 mb-1">Total Boosts</span>
                <span className="block text-lg font-bold text-emerald-600">
                  +
                  {(
                    breakdown.taskBoost +
                    breakdown.reportBoost +
                    breakdown.presentBoost +
                    breakdown.propertyBookingBoost +
                    (breakdown.targetExceededBoost || 0) +
                    (breakdown.completedAllWorkBoost || 0) +
                    (breakdown.manualAdjustmentsTotal > 0 ? breakdown.manualAdjustmentsTotal : 0)
                  ).toFixed(1)}
                </span>
              </div>
              <div className="p-3 bg-rose-50 rounded-xl border border-rose-100">
                <span className="block text-xs text-rose-700 mb-1">Total Penalties</span>
                <span className="block text-lg font-bold text-rose-600">
                  -
                  {(
                    breakdown.latePenalty +
                    breakdown.halfDayPenalty +
                    breakdown.belowTargetPenalty +
                    breakdown.overduePenalty +
                    breakdown.uninformedAbsentPenalty +
                    (breakdown.midnightAutoCheckoutPenalty || 0) +
                    (breakdown.missingDailyReportPenalty || 0) +
                    (breakdown.manualAdjustmentsTotal < 0
                      ? Math.abs(breakdown.manualAdjustmentsTotal)
                      : 0)
                  ).toFixed(1)}
                </span>
              </div>
              <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                <span className="block text-xs text-indigo-700 mb-1">Property Boost</span>
                <span className="block text-lg font-bold text-indigo-600">
                  +{breakdown.propertyBookingBoost.toFixed(1)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Performance Matrix Guide */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowMatrix(!showMatrix)}
          className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors focus:outline-none"
        >
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
            <Award className="w-4 h-4 text-navy-600" /> Scoring Guide & Matrix
          </h3>
          {showMatrix ? (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          )}
        </button>

        {showMatrix && (
          <div className="p-6 pt-0 border-t border-slate-100">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
              {/* Boosts */}
              <div>
                <h4 className="text-xs font-bold text-emerald-700 mb-3 uppercase flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" /> Boosts (Points Earned)
                </h4>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li className="flex justify-between items-center bg-emerald-50/50 p-2 rounded-lg border border-emerald-100/50">
                    <span>Task Completed</span>
                    <span className="font-bold text-emerald-600">+2.0</span>
                  </li>
                  <li className="flex justify-between items-center bg-emerald-50/50 p-2 rounded-lg border border-emerald-100/50">
                    <span>Daily EOD Report Submitted</span>
                    <span className="font-bold text-emerald-600">+0.5</span>
                  </li>
                  <li className="flex justify-between items-center bg-emerald-50/50 p-2 rounded-lg border border-emerald-100/50">
                    <span>Exceeded Daily Target</span>
                    <span className="font-bold text-emerald-600">+0.5</span>
                  </li>
                  <li className="flex justify-between items-center bg-emerald-50/50 p-2 rounded-lg border border-emerald-100/50">
                    <span className="flex flex-col">
                      <span>Daily Check-in (Time-based gradient)</span>
                      <span className="text-[10px] text-emerald-600/70">
                        Early = max points, later = fewer points
                      </span>
                    </span>
                    <span className="font-bold text-emerald-600">up to +1.0</span>
                  </li>
                  <li className="flex justify-between items-center bg-emerald-50/50 p-2 rounded-lg border border-emerald-100/50">
                    <span>Property Booked (All Contributors)</span>
                    <span className="font-bold text-emerald-600">+10.0</span>
                  </li>
                  <li className="flex justify-between items-center bg-emerald-50/50 p-2 rounded-lg border border-emerald-100/50">
                    <span>Cleared Desk (report submitted, no open tasks)</span>
                    <span className="font-bold text-emerald-600">+1.0</span>
                  </li>
                </ul>
              </div>

              {/* Penalties */}
              <div>
                <h4 className="text-xs font-bold text-rose-700 mb-3 uppercase flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> Penalties (Points Deducted)
                </h4>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li className="flex justify-between items-center bg-rose-50/50 p-2 rounded-lg border border-rose-100/50">
                    <span>Late Check-in</span>
                    <span className="font-bold text-rose-600">-1.0</span>
                  </li>
                  <li className="flex justify-between items-center bg-rose-50/50 p-2 rounded-lg border border-rose-100/50">
                    <span>Half Day</span>
                    <span className="font-bold text-rose-600">-1.0</span>
                  </li>
                  <li className="flex justify-between items-center bg-rose-50/50 p-2 rounded-lg border border-rose-100/50">
                    <span>Sub-Target Activity Log</span>
                    <span className="font-bold text-rose-600">-1.0</span>
                  </li>
                  <li className="flex justify-between items-center bg-rose-50/50 p-2 rounded-lg border border-rose-100/50">
                    <span>Task Overdue</span>
                    <span className="font-bold text-rose-600">-1.0</span>
                  </li>
                  <li className="flex justify-between items-center bg-rose-50/50 p-2 rounded-lg border border-rose-100/50">
                    <span>Uninformed Absence</span>
                    <span className="font-bold text-rose-600">-2.0</span>
                  </li>
                  <li className="flex justify-between items-center bg-rose-50/50 p-2 rounded-lg border border-rose-100/50">
                    <span>Forgot to Log Out (auto-closed at midnight)</span>
                    <span className="font-bold text-rose-600">-1.0</span>
                  </li>
                  <li className="flex justify-between items-center bg-rose-50/50 p-2 rounded-lg border border-rose-100/50">
                    <span>Daily Report Not Submitted</span>
                    <span className="font-bold text-rose-600">-1.0</span>
                  </li>
                </ul>
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100 bg-slate-50/50 -mx-6 px-6 pb-2 rounded-b-2xl">
              <p className="text-xs text-slate-600 mb-2">
                <strong>Base Score & Outcome Multipliers:</strong> Your base score is reset to{' '}
                <strong>50.0</strong> at the start of every month. The maximum possible score is
                uncapped. Multipliers apply based on your tier:
              </p>
              <ul className="text-xs text-slate-500 list-disc list-inside space-y-1">
                <li>
                  <strong className="text-emerald-700">EXCELLENT (85+):</strong> Boosts earn 1.1x
                  points.
                </li>
                <li>
                  <strong className="text-navy-700">SAFE (65-85) & SATISFACTORY (40-65):</strong>{' '}
                  Standard 1.0x baseline.
                </li>
                <li>
                  <strong className="text-rose-700">DANGER (≤40):</strong> Penalties deduct 1.25x
                  points.
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Detailed Timeline */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
            Event Timeline
          </h3>
        </div>

        <div className="divide-y divide-slate-100">
          {events.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              No events recorded for this month.
            </div>
          ) : (
            events.map((evt) => (
              <div
                key={evt.id}
                className="p-4 sm:p-6 hover:bg-slate-50 transition-colors flex items-start gap-4"
              >
                {/* Points Badge */}
                <div
                  className={`w-14 sm:w-16 shrink-0 py-1.5 rounded-lg text-center border font-mono font-bold text-xs sm:text-sm ${
                    evt.type === 'BOOST'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : evt.type === 'NEUTRAL'
                        ? 'bg-slate-50 text-slate-500 border-slate-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}
                >
                  {evt.points > 0 ? '+' : ''}
                  {evt.points}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1">
                    <span className="font-bold text-slate-800 truncate">{evt.title}</span>
                    <span className="text-xs text-slate-400 whitespace-nowrap">
                      {new Date(evt.timestamp).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">{evt.description}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
