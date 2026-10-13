import React, { useState, useEffect } from 'react';
import { PerformanceScoreResponse } from '../../types';
import { Award, TrendingUp, ShieldAlert, CheckCircle, Clock, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';

export const PerformanceScoreWidget: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const [scoreData, setScoreData] = useState<PerformanceScoreResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchScore = () => {
    fetchWithAuth(`${API_BASE_URL}/performance/my-score`)
      .then((res) => res.json())
      .then((data) => {
        console.log('[Performance Score Payload Received]:', data);
        setScoreData(data);
      })
      .catch((err) => console.error('Failed to load performance score:', err))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchScore();
    // Auto-poll live score every 10 seconds to update dynamically
    const interval = setInterval(fetchScore, 10000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading && !scoreData) {
    return (
      <div className="p-6 bg-white rounded-2xl border border-slate-200 text-xs text-slate-400">
        Calculating performance index...
      </div>
    );
  }

  const breakdown = scoreData?.breakdown || {};

  // Trust the backend's authoritative score — it's the only place that
  // applies every boost/penalty category plus the tier multiplier
  // consistently; recomputing a subset of the formula here previously drifted
  // from the real score whenever a category (e.g. tier bonus, property
  // booking, midnight auto-checkout) wasn't included in this local copy.
  const baseScore = breakdown.baseScore !== undefined ? breakdown.baseScore : 50.0;
  const taskBoost = breakdown.taskBoost || 0;
  const reportBoost = breakdown.reportBoost || 0;
  const presentBoost = breakdown.presentBoost || 0;
  const latePenalty = breakdown.latePenalty || 0;
  const halfDayPenalty = breakdown.halfDayPenalty || 0;
  const belowTargetPenalty = breakdown.belowTargetPenalty || 0;
  const overduePenalty = breakdown.overduePenalty || 0;
  const uninformedAbsentPenalty = breakdown.uninformedAbsentPenalty || 0;
  const tier = breakdown.tier;
  const tierBoostBonus = breakdown.tierBoostBonus || 0;
  const tierPenaltyExtra = breakdown.tierPenaltyExtra || 0;
  const manualAdjustmentsTotal = breakdown.manualAdjustmentsTotal || 0;

  const displayScore = scoreData?.score !== undefined ? scoreData.score : 50.0;

  // Calculate Credit-Card Gauge Position (0-100%)
  const percentage = Math.min(100, Math.max(0, (displayScore / 100) * 100));

  // Determine Status Zone based on computed display score
  let statusZone = {
    label: 'SAFE ZONE',
    color: 'text-emerald-700 bg-emerald-100 border-emerald-300',
    barColor: 'from-emerald-500 to-navy-600',
    description: 'Great performance! You are on track.',
  };

  if (displayScore <= 40) {
    statusZone = {
      label: 'DANGER ZONE',
      color: 'text-red-700 bg-red-100 border-red-300',
      barColor: 'from-red-500 to-rose-600',
      description: 'High penalty alert! Missed targets or late check-ins detected.',
    };
  } else if (displayScore <= 65) {
    statusZone = {
      label: 'SATISFACTORY / BASE ZONE',
      color: 'text-amber-800 bg-amber-100 border-amber-300',
      barColor: 'from-amber-500 to-orange-500',
      description: 'Starting Base Index (50.0). Complete assigned tasks to reach Safe Zone.',
    };
  } else if (displayScore >= 86) {
    statusZone = {
      label: 'EXCELLENT / TOP PERFORMER',
      color: 'text-purple-800 bg-purple-100 border-purple-300',
      barColor: 'from-purple-600 to-navy-600',
      description: 'Outstanding execution! Eligible for priority lead allocation.',
    };
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Award className="w-5 h-5 text-amber-500" />
          <h3 className="text-base font-bold text-slate-800">Performance Credit Score</h3>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${statusZone.color}`}
          >
            {statusZone.label}
          </span>
        </div>
      </div>

      {/* Main Score & Credit-Card Style Gauge */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-6 shadow-md relative overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider block">
              Live Aggregate Index (Base 50)
            </span>
            <div className="text-4xl font-extrabold tracking-tight mt-0.5 font-mono">
              {displayScore} <span className="text-sm font-normal text-slate-400">/ 100+ pts</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-amber-300">
            <Sparkles className="w-6 h-6" />
          </div>
        </div>

        {/* 4-Zone Credit Card Gauge Bar */}
        <div className="space-y-1.5 pt-2">
          <div className="flex justify-between text-[10px] text-slate-400 font-mono">
            <span>0 (Danger)</span>
            <span>40</span>
            <span>65 (Safe)</span>
            <span>85</span>
            <span>100+ (Excellent)</span>
          </div>

          <div className="relative w-full h-3.5 bg-slate-700/80 rounded-full overflow-hidden flex shadow-inner">
            <div
              className="w-[40%] bg-red-500/80 h-full border-r border-slate-900"
              title="Danger Zone (0-40)"
            />
            <div
              className="w-[25%] bg-amber-500/80 h-full border-r border-slate-900"
              title="Satisfactory Zone (41-65)"
            />
            <div
              className="w-[20%] bg-emerald-500/80 h-full border-r border-slate-900"
              title="Safe Zone (66-85)"
            />
            <div className="w-[15%] bg-purple-500/80 h-full" title="Excellent Zone (86-100+)" />

            {/* Dynamic Needle Position Indicator */}
            <div
              className="absolute top-0 bottom-0 w-2.5 bg-white shadow-lg border border-slate-900 rounded-sm transform -translate-x-1/2 transition-all duration-700 ease-out"
              style={{ left: `${percentage}%` }}
            />
          </div>
        </div>

        <p className="text-[11px] text-slate-300 mt-3">{statusZone.description}</p>
      </div>

      {/* Points Breakdown */}
      <div className="space-y-2">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          Calibrated Points Breakdown
        </h4>
        <div className="grid grid-cols-2 gap-2 text-xs font-medium">
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200/60 flex items-center justify-between">
            <div className="flex flex-col">
              <span>Starting Base Score</span>
              <span className="text-[9px] text-emerald-700/70">Base metric: out of 100</span>
            </div>
            <span className="font-mono font-bold text-emerald-700">+{baseScore.toFixed(1)}</span>
          </div>

          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200/60 flex items-center justify-between">
            <span>Tasks Completed (+2.0)</span>
            <span className="font-mono font-bold text-emerald-700">+{taskBoost}</span>
          </div>

          <div className="p-2.5 rounded-xl bg-amber-50 text-amber-900 border border-amber-200/60 flex items-center justify-between">
            <span>Late Check-Ins (-1.0)</span>
            <span className="font-mono font-bold text-amber-700">-{latePenalty}</span>
          </div>

          <div className="p-2.5 rounded-xl bg-red-50 text-red-900 border border-red-200/60 flex items-center justify-between">
            <span>Sub-Target Logs (-1.0)</span>
            <span className="font-mono font-bold text-red-700">-{belowTargetPenalty}</span>
          </div>

          {manualAdjustmentsTotal !== 0 && (
            <div
              className={`p-2.5 rounded-xl border flex items-center justify-between ${
                manualAdjustmentsTotal > 0
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-200/60'
                  : 'bg-red-50 text-red-900 border-red-200/60'
              }`}
            >
              <span>HR/MD Adjustments</span>
              <span
                className={`font-mono font-bold ${manualAdjustmentsTotal > 0 ? 'text-emerald-700' : 'text-red-700'}`}
              >
                {manualAdjustmentsTotal > 0 ? '+' : ''}
                {manualAdjustmentsTotal}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Tier — last month's zone escalates this month's points: Excellent
          earns boosts at a 10% premium, Danger takes penalties at 25% extra,
          Safe/Satisfactory are the neutral baseline. */}
      {tier && (tierBoostBonus > 0 || tierPenaltyExtra > 0) && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
            tier === 'EXCELLENT'
              ? 'bg-purple-50 border-purple-200 text-purple-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <span className="font-semibold">
            {tier === 'EXCELLENT'
              ? 'Excellent tier bonus (+10% on boosts, from last month)'
              : 'Danger tier penalty (+25% on penalties, from last month)'}
          </span>
          <span className="font-mono font-bold">
            {tierBoostBonus > 0
              ? `+${tierBoostBonus.toFixed(1)}`
              : `-${tierPenaltyExtra.toFixed(1)}`}
          </span>
        </div>
      )}
    </div>
  );
};
