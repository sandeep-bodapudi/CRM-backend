import React, { useState, useEffect } from 'react';
import { FileText, Calendar, Filter, Eye, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';

export const DailyReportsView: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const [reports, setReports] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);

  useEffect(() => {
    fetchReports();
  }, [dateFilter]);

  const fetchReports = async () => {
    setIsLoading(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/reports/all?date=${dateFilter}`);
      const data = await res.json();
      if (res.ok && data.reports) {
        setReports(data.reports);
      }
    } catch (err) {
      console.error('Failed to load daily reports:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full bg-slate-50 relative flex flex-col p-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-navy-50 text-navy-700 rounded-xl flex items-center justify-center shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Employee Daily Reports</h1>
            <p className="text-sm text-slate-500">
              View end-of-day submissions and target metrics.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <div className="w-8 h-8 border-4 border-navy-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          </div>
        ) : reports.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center shadow-sm">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No reports submitted for this date.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {reports.map((report) => (
              <div
                key={report.id}
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-navy-200 transition-all flex flex-col"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-slate-800 text-lg">
                      {report.employee?.full_name || 'Unknown'}
                    </h3>
                    <p className="text-xs text-slate-500 font-mono">
                      {report.employee?.employee_code}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                      {new Date(report.submitted_at).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      })}
                    </span>
                  </div>
                </div>

                <div className="mb-4">
                  {report.target_met ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-100">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Target Met
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-bold border border-rose-100">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Missed Target
                    </span>
                  )}
                </div>

                <div className="flex-1">
                  {report.metrics_json && Object.keys(report.metrics_json).length > 0 ? (
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {Object.entries(report.metrics_json)
                        .slice(0, 4)
                        .map(([key, value]) => (
                          <div
                            key={key}
                            className="bg-slate-50 p-2.5 rounded-xl border border-slate-100"
                          >
                            <p
                              className="text-[10px] uppercase font-bold text-slate-400 truncate"
                              title={key}
                            >
                              {key}
                            </p>
                            <p
                              className="text-sm font-black text-slate-700 truncate"
                              title={String(value)}
                            >
                              {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                            </p>
                          </div>
                        ))}
                      {Object.keys(report.metrics_json).length > 4 && (
                        <div className="col-span-2 text-xs text-center text-slate-400 mt-1 italic">
                          +{Object.keys(report.metrics_json).length - 4} more metrics
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 italic mb-4">
                      No dynamic metrics available.
                    </p>
                  )}
                </div>

                <button
                  onClick={() => setSelectedReport(report)}
                  className="w-full py-2 bg-navy-50 text-navy-600 hover:bg-navy-100 hover:text-navy-700 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors border border-transparent hover:border-navy-200"
                >
                  <Eye className="w-4 h-4" />
                  View Full Report
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedReport && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-scaleUp">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Report Details</h2>
                <p className="text-sm text-slate-500">
                  {selectedReport.employee?.full_name} •{' '}
                  {new Date(selectedReport.submitted_at).toLocaleDateString('en-IN')}
                </p>
              </div>
              <button
                onClick={() => setSelectedReport(null)}
                className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              {!selectedReport.target_met && selectedReport.below_target_reason && (
                <div className="bg-rose-50 border border-rose-100 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-rose-800 flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4" />
                    Reason for Missing Target
                  </h3>
                  <p className="text-sm text-rose-700">{selectedReport.below_target_reason}</p>
                </div>
              )}

              <div>
                <h3 className="text-sm font-bold text-slate-700 mb-2">End of Day Summary</h3>
                <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 whitespace-pre-wrap border border-slate-100">
                  {selectedReport.summary || 'No summary provided.'}
                </div>
              </div>

              {selectedReport.metrics_json &&
                Object.keys(selectedReport.metrics_json).length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-slate-700 mb-2">Dynamic Metrics</h3>
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 grid grid-cols-2 gap-4">
                      {Object.entries(selectedReport.metrics_json).map(([key, value]) => (
                        <div key={key}>
                          <div className="text-xs text-slate-500 truncate" title={key}>
                            {key}
                          </div>
                          <div className="text-sm font-bold text-slate-800">
                            {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setSelectedReport(null)}
                className="px-6 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-bold shadow-sm hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
