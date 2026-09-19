import React, { useEffect, useState } from 'react';
import { DailyReportModal } from './DailyReportModal';
import { useAuth } from '../../context/AuthContext';
import { useLogoutGate } from '../../hooks/useLogoutGate';
import { API_BASE_URL } from '../../config';
import { CheckCircle2, FileText, Clock, History, Calendar } from 'lucide-react';
import { EmergencyLogoutModal } from '../profile/EmergencyLogoutModal';

export const DailyReportingPage: React.FC = () => {
  const { logout, fetchWithAuth } = useAuth();
  const { canLogoutNow } = useLogoutGate();
  const [showEmergencyLogout, setShowEmergencyLogout] = useState(false);

  const handleLogoutClick = async () => {
    if (await canLogoutNow()) {
      logout();
    } else {
      setShowEmergencyLogout(true);
    }
  };

  const [activeTab, setActiveTab] = useState<'today' | 'history'>('today');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [historyReports, setHistoryReports] = useState<any[]>([]);
  const [historyDays, setHistoryDays] = useState(7);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/reports/today-status`);
      const data = await res.json();
      if (data.submitted && data.reportId) {
        setHasSubmitted(true);
        // Fetch report details
        const reportRes = await fetchWithAuth(`${API_BASE_URL}/reports/${data.reportId}`);
        const reportData = await reportRes.json();
        if (reportData.report) {
          setReportData(reportData.report);
        }
      }
    } catch (err) {
      console.error('Failed to check report status', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/reports/my-history?days=${historyDays}`);
      const data = await res.json();
      if (data.reports) {
        setHistoryReports(data.reports);
      }
    } catch (err) {
      console.error('Failed to fetch history', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab, historyDays]);

  if (isLoading) {
    return (
      <div className="h-full bg-slate-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-navy-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-50 relative overflow-hidden flex flex-col">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Daily Reporting</h1>
          <p className="text-sm text-slate-500 mt-1">
            Submit your end of day report metrics and checklist.
          </p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('today')}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${
              activeTab === 'today'
                ? 'bg-white text-navy-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Today's Report
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors flex items-center gap-2 ${
              activeTab === 'history'
                ? 'bg-white text-navy-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <History className="w-4 h-4" />
            History
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto relative p-6 flex flex-col items-center">
        {activeTab === 'history' ? (
          <div className="w-full max-w-4xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-800">Your Submitted Reports</h2>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                <select
                  value={historyDays}
                  onChange={(e) => setHistoryDays(parseInt(e.target.value, 10))}
                  className="bg-white border border-slate-200 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-navy-500"
                >
                  <option value={7}>Last 7 Days</option>
                  <option value={15}>Last 15 Days</option>
                  <option value={30}>Last 30 Days</option>
                </select>
              </div>
            </div>

            {isLoadingHistory ? (
              <div className="flex justify-center p-12">
                <div className="w-8 h-8 border-4 border-navy-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : historyReports.length === 0 ? (
              <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center">
                <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No reports found for the selected time period.</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {historyReports.map((report) => (
                  <div
                    key={report.id}
                    className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-start md:items-center hover:border-navy-200 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-slate-800 text-base">
                          {new Date(report.submitted_at).toLocaleDateString('en-IN', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                        <span className="text-xs text-slate-400 px-2 py-0.5 bg-slate-100 rounded-md">
                          {new Date(report.submitted_at).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 line-clamp-1">{report.summary}</p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 overflow-x-auto max-w-[50%]">
                      {report.metrics_json && Object.keys(report.metrics_json).length > 0 ? (
                        <div className="flex items-center gap-3">
                          {Object.entries(report.metrics_json)
                            .slice(0, 3)
                            .map(([key, value], index) => (
                              <div
                                key={key}
                                className={`text-center px-3 ${index < 2 && index < Object.keys(report.metrics_json).length - 1 ? 'border-r border-slate-100' : ''}`}
                              >
                                <p
                                  className="text-[10px] uppercase font-bold text-slate-400 mb-0.5 truncate max-w-[80px]"
                                  title={key}
                                >
                                  {key}
                                </p>
                                <p
                                  className="font-bold text-slate-700 truncate max-w-[80px]"
                                  title={String(value)}
                                >
                                  {typeof value === 'boolean'
                                    ? value
                                      ? 'Yes'
                                      : 'No'
                                    : String(value)}
                                </p>
                              </div>
                            ))}
                        </div>
                      ) : (
                        <div className="text-center px-3">
                          <p className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">
                            Metrics
                          </p>
                          <p className="text-sm font-bold text-slate-500 italic">None</p>
                        </div>
                      )}

                      <div className="ml-2 border-l border-slate-100 pl-3">
                        {report.target_met ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-100 whitespace-nowrap">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Target Met
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-semibold border border-rose-100 whitespace-nowrap">
                            Missed Target
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : hasSubmitted ? (
          <div className="w-full max-w-2xl bg-white rounded-3xl p-8 shadow-sm border border-slate-200 text-center animate-scaleUp">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">
              Report Submitted Successfully
            </h2>
            <p className="text-slate-500 mb-8 max-w-md mx-auto">
              Your daily work log has been recorded. You can logout after 6:00 PM, or submit an
              emergency early-logout request if you need to leave sooner.
            </p>

            {reportData && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-left mb-8">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4 pb-3 border-b border-slate-200">
                  <FileText className="w-5 h-5 text-navy-600" />
                  Your Submitted Summary
                </h3>

                {reportData.metrics_json && Object.keys(reportData.metrics_json).length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-6">
                    {Object.entries(reportData.metrics_json).map(([key, value]) => (
                      <div
                        key={key}
                        className="bg-white p-4 rounded-xl border border-slate-100 text-center"
                      >
                        <p
                          className="text-[10px] uppercase font-bold text-slate-400 mb-1 truncate"
                          title={key}
                        >
                          {key}
                        </p>
                        <p
                          className="text-lg font-black text-navy-700 truncate"
                          title={String(value)}
                        >
                          {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white p-4 rounded-xl border border-slate-100 text-center mb-6">
                    <p className="text-sm text-slate-500 italic">No dynamic metrics recorded.</p>
                  </div>
                )}

                {reportData.summary && (
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-2">
                      Summary Notes
                    </p>
                    <p className="text-sm text-slate-700 bg-white p-4 rounded-xl border border-slate-100">
                      {reportData.summary}
                    </p>
                  </div>
                )}

                {reportData.below_target_reason && (
                  <div className="mt-4">
                    <p className="text-[10px] uppercase font-bold text-rose-500 mb-2">
                      Target Miss Reason
                    </p>
                    <p className="text-sm text-rose-700 bg-rose-50 p-4 rounded-xl border border-rose-100">
                      {reportData.below_target_reason}
                    </p>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleLogoutClick}
              className="px-8 py-3 bg-navy-600 hover:bg-navy-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 mx-auto"
            >
              <Clock className="w-5 h-5" />
              <span>Logout Now</span>
            </button>
            {showEmergencyLogout && (
              <EmergencyLogoutModal onClose={() => setShowEmergencyLogout(false)} />
            )}
          </div>
        ) : (
          <div className="w-full max-w-3xl">
            <DailyReportModal mode="inline" onSuccess={() => checkStatus()} />
          </div>
        )}
      </div>
    </div>
  );
};
