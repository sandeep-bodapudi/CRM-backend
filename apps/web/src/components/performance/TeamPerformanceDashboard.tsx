import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Award,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronUp,
  Star,
  ShieldAlert,
  Activity,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';

interface EmployeeScore {
  id: number;
  employeeCode: string;
  fullName: string;
  branch: string;
  roles: string[];
  score: number;
  zone: 'EXCELLENT' | 'SAFE' | 'SATISFACTORY' | 'DANGER';
  breakdown: {
    tasksDone: number;
    tasksOverdue: number;
    reportsDone: number;
    belowTargetCount: number;
    presentCount: number;
    lateCount: number;
    halfDayCount: number;
    uninformedAbsent: number;
    propertyBookingContributions: number;
    targetExceededEvents?: number;
    midnightAutoCheckoutEvents?: number;
    missingDailyReportEvents?: number;
    manualAdjustmentsTotal?: number;
    manualAdjustmentsCount?: number;
  };
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

const ZONE_CONFIG = {
  EXCELLENT: {
    label: 'Excellent',
    bg: 'bg-purple-50',
    text: 'text-purple-800',
    border: 'border-purple-200',
    badge: 'bg-purple-100 text-purple-700 border-purple-300',
    bar: 'from-purple-500 to-navy-600',
    icon: Star,
  },
  SAFE: {
    label: 'Safe Zone',
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    bar: 'from-emerald-500 to-navy-600',
    icon: CheckCircle,
  },
  SATISFACTORY: {
    label: 'Satisfactory',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
    badge: 'bg-amber-100 text-amber-700 border-amber-300',
    bar: 'from-amber-400 to-orange-500',
    icon: Activity,
  },
  DANGER: {
    label: 'Danger Zone',
    bg: 'bg-red-50',
    text: 'text-red-800',
    border: 'border-red-200',
    badge: 'bg-red-100 text-red-700 border-red-300',
    bar: 'from-red-500 to-rose-600',
    icon: AlertTriangle,
  },
};

export const TeamPerformanceDashboard: React.FC = () => {
  const { fetchWithAuth, user } = useAuth();
  const [team, setTeam] = useState<EmployeeScore[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState<string>('ALL');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'score' | 'name' | 'zone'>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showMatrix, setShowMatrix] = useState(false);

  const currentDate = new Date();
  const [year, setYear] = useState(currentDate.getFullYear());
  const [month, setMonth] = useState(currentDate.getMonth() + 1);

  const fetchTeam = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(
        `${API_BASE_URL}/performance/team?year=${year}&month=${month}`,
      );
      const data = await res.json();
      if (res.ok) {
        setTeam(data.team || []);
      } else {
        setError(data.error || 'Failed to load team performance');
      }
    } catch {
      setError('Network error — check API connection');
    } finally {
      setIsLoading(false);
    }
  }, [fetchWithAuth]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam, month, year]);

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

  const filtered = team
    .filter((e) => {
      const matchSearch =
        e.fullName.toLowerCase().includes(search.toLowerCase()) ||
        e.employeeCode.toLowerCase().includes(search.toLowerCase()) ||
        e.roles.some((r) => r.toLowerCase().includes(search.toLowerCase()));
      const matchZone = zoneFilter === 'ALL' || e.zone === zoneFilter;
      return matchSearch && matchZone;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'score') cmp = a.score - b.score;
      else if (sortBy === 'name') cmp = a.fullName.localeCompare(b.fullName);
      else if (sortBy === 'zone') {
        const order = { EXCELLENT: 0, SAFE: 1, SATISFACTORY: 2, DANGER: 3 };
        cmp = order[a.zone] - order[b.zone];
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

  const counts = {
    EXCELLENT: team.filter((e) => e.zone === 'EXCELLENT').length,
    SAFE: team.filter((e) => e.zone === 'SAFE').length,
    SATISFACTORY: team.filter((e) => e.zone === 'SATISFACTORY').length,
    DANGER: team.filter((e) => e.zone === 'DANGER').length,
  };

  const avgScore =
    team.length > 0
      ? Math.round((team.reduce((s, e) => s + e.score, 0) / team.length) * 10) / 10
      : 0;

  const toggleSort = (field: 'score' | 'name' | 'zone') => {
    if (sortBy === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(field);
      setSortDir('desc');
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-3 animate-pulse">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 bg-slate-100 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
        <p className="text-sm text-red-700 font-medium">{error}</p>
        <button
          onClick={fetchTeam}
          className="mt-3 px-4 py-2 bg-navy-700 text-white text-xs rounded-xl font-semibold hover:bg-navy-800"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-navy-600" /> Team Performance Index
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Monthly performance scores for {team.length} team member{team.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
            <button
              onClick={handlePrevMonth}
              className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 font-bold text-slate-700 min-w-[100px] justify-center text-sm">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span>
                {MONTHS[month - 1]} {year}
              </span>
            </div>
            <button
              onClick={handleNextMonth}
              className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={fetchTeam}
            className="p-2 h-10 w-10 flex items-center justify-center text-slate-500 hover:text-navy-700 hover:bg-navy-50 rounded-xl border border-slate-200 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="sm:col-span-1 bg-gradient-to-br from-slate-800 to-slate-900 text-white rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">
            Team Avg Score
          </span>
          <span className="text-3xl font-extrabold font-mono mt-1">{avgScore}</span>
          <span className="text-[10px] text-slate-400">/ 100+ pts</span>
        </div>
        {(['EXCELLENT', 'SAFE', 'SATISFACTORY', 'DANGER'] as const).map((zone) => {
          const cfg = ZONE_CONFIG[zone];
          const Icon = cfg.icon;
          return (
            <button
              key={zone}
              onClick={() => setZoneFilter(zoneFilter === zone ? 'ALL' : zone)}
              className={`rounded-2xl p-3 border text-left transition-all ${cfg.bg} ${cfg.border} ${zoneFilter === zone ? 'ring-2 ring-offset-1 ring-navy-500' : ''}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[10px] font-bold uppercase tracking-wide ${cfg.text}`}>
                  {cfg.label}
                </span>
                <Icon className={`w-3.5 h-3.5 ${cfg.text}`} />
              </div>
              <span className={`text-2xl font-extrabold font-mono ${cfg.text}`}>
                {counts[zone]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search & Filter Bar */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, code or role..."
            className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-navy-500"
          />
        </div>
        <select
          value={zoneFilter}
          onChange={(e) => setZoneFilter(e.target.value)}
          className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-navy-500"
        >
          <option value="ALL">All Zones</option>
          <option value="EXCELLENT">Excellent</option>
          <option value="SAFE">Safe Zone</option>
          <option value="SATISFACTORY">Satisfactory</option>
          <option value="DANGER">Danger Zone</option>
        </select>
      </div>

      {/* Sort Header */}
      <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <div className="col-span-4">
          <button
            onClick={() => toggleSort('name')}
            className="flex items-center gap-1 hover:text-navy-700"
          >
            Employee{' '}
            {sortBy === 'name' ? (
              sortDir === 'desc' ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronUp className="w-3 h-3" />
              )
            ) : null}
          </button>
        </div>
        <div className="col-span-2">
          <button
            onClick={() => toggleSort('zone')}
            className="flex items-center gap-1 hover:text-navy-700"
          >
            Zone{' '}
            {sortBy === 'zone' ? (
              sortDir === 'desc' ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronUp className="w-3 h-3" />
              )
            ) : null}
          </button>
        </div>
        <div className="col-span-4">Score Bar</div>
        <div className="col-span-2 text-right">
          <button
            onClick={() => toggleSort('score')}
            className="flex items-center gap-1 hover:text-navy-700 ml-auto"
          >
            Score{' '}
            {sortBy === 'score' ? (
              sortDir === 'desc' ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronUp className="w-3 h-3" />
              )
            ) : null}
          </button>
        </div>
      </div>

      {/* Employee Cards */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-400 text-sm">
            No employees match the filter.
          </div>
        )}
        {filtered.map((emp, idx) => {
          const cfg = ZONE_CONFIG[emp.zone];
          const Icon = cfg.icon;
          const isExpanded = expandedId === emp.id;
          const pct = Math.min(100, (emp.score / 100) * 100);

          return (
            <div
              key={emp.id}
              className={`border rounded-2xl overflow-hidden transition-all ${cfg.border} bg-white`}
            >
              {/* Main Row */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : emp.id)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50 transition-colors"
              >
                {/* Rank */}
                <span className="text-[10px] font-mono font-bold text-slate-400 w-5 shrink-0">
                  #{idx + 1}
                </span>

                {/* Avatar */}
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${cfg.bg} ${cfg.text}`}
                >
                  {emp.fullName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .substring(0, 2)
                    .toUpperCase()}
                </div>

                {/* Name & Role */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-bold text-slate-800 truncate">
                      {emp.fullName}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">{emp.employeeCode}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 truncate">
                    {emp.roles[0] || '—'} · {emp.branch}
                  </p>
                </div>

                {/* Zone Badge */}
                <span
                  className={`hidden sm:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${cfg.badge}`}
                >
                  <Icon className="w-2.5 h-2.5" />
                  {cfg.label}
                </span>

                {/* Score Bar + Number */}
                <div className="hidden sm:flex items-center gap-2 w-32 shrink-0">
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-r ${cfg.bar} rounded-full transition-all duration-700`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                <div className="text-right shrink-0 w-16">
                  <span className={`text-lg font-extrabold font-mono ${cfg.text}`}>
                    {emp.score}
                  </span>
                  <span className="text-[10px] text-slate-400 block">pts</span>
                </div>

                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </button>

              {/* Expanded Breakdown */}
              {isExpanded && (
                <div className={`border-t ${cfg.border} px-4 py-4 ${cfg.bg}`}>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">
                    Performance Breakdown
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      {
                        label: 'Tasks Done',
                        value: `+${emp.breakdown.tasksDone}`,
                        color: 'text-emerald-700',
                        hint: '+2.0 each',
                      },
                      {
                        label: 'Reports Filed',
                        value: `+${emp.breakdown.reportsDone}`,
                        color: 'text-emerald-700',
                        hint: '+0.5 each',
                      },
                      {
                        label: 'Exceeded Target',
                        value: `+${emp.breakdown.targetExceededEvents || 0}`,
                        color: 'text-emerald-700',
                        hint: '+0.5 each',
                      },
                      {
                        label: 'On-Time Days',
                        value: `+${emp.breakdown.presentCount}`,
                        color: 'text-navy-700',
                        hint: 'up to +1.0 each',
                      },
                      {
                        label: 'Property Booked',
                        value: `+${emp.breakdown.propertyBookingContributions}`,
                        color: 'text-indigo-700',
                        hint: '+10.0 each',
                      },
                      {
                        label: 'Late Check-ins',
                        value: `-${emp.breakdown.lateCount}`,
                        color: 'text-amber-700',
                        hint: '-1.0 each',
                      },
                      {
                        label: 'Overdue Tasks',
                        value: `-${emp.breakdown.tasksOverdue}`,
                        color: 'text-orange-700',
                        hint: '-1.0 each',
                      },
                      {
                        label: 'Sub-Target Logs',
                        value: `-${emp.breakdown.belowTargetCount}`,
                        color: 'text-red-700',
                        hint: '-1.0 each',
                      },
                      {
                        label: 'Half Days',
                        value: `-${emp.breakdown.halfDayCount}`,
                        color: 'text-red-600',
                        hint: '-1.0 each',
                      },
                      {
                        label: 'Unplanned Absences',
                        value: `-${emp.breakdown.uninformedAbsent}`,
                        color: 'text-red-800',
                        hint: '-2.0 each',
                      },
                      {
                        label: 'Midnight Checkouts',
                        value: `-${emp.breakdown.midnightAutoCheckoutEvents || 0}`,
                        color: 'text-red-900',
                        hint: '-1.0 each',
                      },
                      {
                        label: 'Missing Daily Reports',
                        value: `-${emp.breakdown.missingDailyReportEvents || 0}`,
                        color: 'text-rose-900',
                        hint: '-1.0 each',
                      },
                      {
                        label: 'HR/MD Adjustments',
                        value: `${(emp.breakdown.manualAdjustmentsTotal || 0) >= 0 ? '+' : ''}${emp.breakdown.manualAdjustmentsTotal || 0}`,
                        color:
                          (emp.breakdown.manualAdjustmentsTotal || 0) >= 0
                            ? 'text-emerald-700'
                            : 'text-red-700',
                        hint: `${emp.breakdown.manualAdjustmentsCount || 0} times`,
                      },
                    ].map((item, i) => (
                      <div
                        key={i}
                        className="bg-white rounded-xl p-2.5 border border-white/60 shadow-sm"
                      >
                        <span className="text-[10px] text-slate-500 block">{item.label}</span>
                        <span className={`text-sm font-extrabold font-mono ${item.color}`}>
                          {item.value}
                        </span>
                        <span className="text-[10px] text-slate-400 block">{item.hint}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">Base Score: +50.0</span>
                    <span className={`text-sm font-extrabold font-mono ${cfg.text}`}>
                      Final: {emp.score}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
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
                    <span>Daily Check-in (Present)</span>
                    <span className="font-bold text-emerald-600">+0.5</span>
                  </li>
                  <li className="flex justify-between items-center bg-emerald-50/50 p-2 rounded-lg border border-emerald-100/50">
                    <span>Property Booked (All Contributors)</span>
                    <span className="font-bold text-emerald-600">+10.0</span>
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
                </ul>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-500">
                <strong>Note:</strong> Employees' base scores are reset to <strong>50.0</strong> at
                the start of every month. The maximum possible score is uncapped, but negative
                scores will flag a Danger Zone rating.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
