import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import { Search, Plus, Minus, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { EmployeeListItem } from '../../types';
import { Roles } from '../../shared';

export default function PerformanceAdjustmentPage() {
  const { accessToken, activeRole, user } = useAuth();
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [points, setPoints] = useState<string>('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/employees`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setEmployees(data.employees || []);
      }
    } catch (err) {
      console.error('Failed to fetch employees', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredEmployees = employees.filter(
    (emp) =>
      emp.fullName?.toLowerCase().includes(search.toLowerCase()) ||
      emp.employeeCode?.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId || !points || !reason.trim()) {
      setError('Please fill in all required fields.');
      return;
    }

    const numPoints = parseFloat(points);
    if (isNaN(numPoints)) {
      setError('Points must be a valid number.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`${API_BASE_URL}/performance-adjustments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          employeeId: selectedEmployeeId,
          points: numPoints,
          reason,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to apply adjustment');

      setSuccessMessage('Performance score adjusted successfully.');
      setSelectedEmployeeId(null);
      setPoints('');
      setReason('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (![Roles.HR_MANAGER, Roles.MD, Roles.ADMIN].includes(activeRole as any)) {
    return (
      <div className="p-6">
        <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center">
          <AlertCircle className="w-5 h-5 mr-2" />
          You do not have permission to access this page.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Manual Score Adjustments</h1>
        <p className="text-gray-500">
          Add or deduct performance points for employees with a logged reason.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center">
          <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0" />
          {error}
        </div>
      )}

      {successMessage && (
        <div className="bg-green-50 text-green-600 p-4 rounded-lg flex items-center">
          <CheckCircle className="w-5 h-5 mr-2 flex-shrink-0" />
          {successMessage}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Employee
              </label>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search by name or code..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
                {loading ? (
                  <div className="p-4 text-center text-gray-500">Loading employees...</div>
                ) : filteredEmployees.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">No employees found.</div>
                ) : (
                  <ul className="divide-y divide-gray-200">
                    {filteredEmployees.map((emp) => (
                      <li key={emp.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedEmployeeId(emp.id)}
                          className={`w-full text-left px-4 py-3 hover:bg-gray-50 focus:outline-none transition-colors ${selectedEmployeeId === emp.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}
                        >
                          <div className="font-medium text-gray-900">
                            {emp.fullName || 'Unknown'}
                          </div>
                          <div className="text-sm text-gray-500">
                            {emp.employeeCode} • {emp.roles.join(', ')}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Points to Adjust
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    value={points}
                    onChange={(e) => setPoints(e.target.value)}
                    placeholder="e.g. 5 or -3.5"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex space-x-1">
                    <Plus className="w-4 h-4 text-green-500" />
                    <Minus className="w-4 h-4 text-red-500" />
                  </div>
                </div>
                <p className="mt-1 text-sm text-gray-500">Use negative values to deduct points.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for Adjustment
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain why these points are being added or deducted..."
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  minLength={5}
                />
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                disabled={submitting || !selectedEmployeeId}
                className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                ) : (
                  <Save className="w-5 h-5 mr-2" />
                )}
                Apply Adjustment
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
