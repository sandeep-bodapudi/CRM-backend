import React, { useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  X,
  PhoneCall,
  User,
  Building2,
  MapPin,
  Clock,
  ListChecks,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';
import { handleApiError, toUserFacingError } from '../../utils/userFacingError';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface Demo {
  id: number;
  lead_code: string;
  customer_name: string;
  phone: string;
  scheduled_at: string;
  accepted_at: string | null;
  lead: { status: string; preferred_location?: string };
  handler?: { id: number; full_name: string };
  interested_properties?: { property?: { title: string; location?: string } }[];
}

export const DemoManagement: React.FC = () => {
  const { fetchWithAuth, user } = useAuth();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'ACCEPTED' | 'COMPLETED'>('ACCEPTED');
  const [selectedDemo, setSelectedDemo] = useState<Demo | null>(null);
  const [notes, setNotes] = useState('');
  const [actionType, setActionType] = useState<'COMPLETE' | 'CANCEL' | null>(null);

  const fetchDemos = async () => {
    const statusParam = activeTab;
    const url = `${API_BASE_URL}/demos?status=${statusParam}`;
    const res = await fetchWithAuth(url);
    if (!res.ok) throw new Error('Failed to fetch demos');
    const data = await res.json();
    return data.demos as Demo[];
  };

  const { data: demos = [], isLoading } = useQuery({
    queryKey: ['demos', activeTab],
    queryFn: fetchDemos,
    refetchInterval: 30000,
  });

  const completeMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: number; notes: string }) => {
      const res = await fetchWithAuth(`${API_BASE_URL}/demos/${id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      const data = await res.json();
      if (!res.ok) await handleApiError(res, showError, data);
      return data;
    },
    onSuccess: () => {
      showToast('Demo completed successfully', 'success');
      queryClient.invalidateQueries({ queryKey: ['demos'] });
      setSelectedDemo(null);
    },
    onError: (err) => {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: number; notes: string }) => {
      const res = await fetchWithAuth(`${API_BASE_URL}/demos/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      const data = await res.json();
      if (!res.ok) await handleApiError(res, showError, data);
      return data;
    },
    onSuccess: () => {
      showToast('Demo cancelled successfully', 'success');
      queryClient.invalidateQueries({ queryKey: ['demos'] });
      setSelectedDemo(null);
    },
    onError: (err) => {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDemo || !actionType) return;

    if (actionType === 'COMPLETE') {
      completeMutation.mutate({ id: selectedDemo.id, notes });
    } else {
      cancelMutation.mutate({ id: selectedDemo.id, notes });
    }
  };

  const { data: upcomingCount } = useQuery({
    queryKey: ['demos', 'ACCEPTED', 'count'],
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE_URL}/demos?status=ACCEPTED`);
      if (!res.ok) return 0;
      const data = await res.json();
      return (data.demos as Demo[]).length;
    },
    refetchInterval: 30000,
  });

  const { data: completedCount } = useQuery({
    queryKey: ['demos', 'COMPLETED', 'count'],
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE_URL}/demos?status=COMPLETED`);
      if (!res.ok) return 0;
      const data = await res.json();
      return (data.demos as Demo[]).length;
    },
    refetchInterval: 30000,
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-navy-900 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-navy-600" />
            My Demos
          </h2>
          <p className="text-slate-500 mt-1">Manage your accepted demos.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Upcoming</p>
            <p className="text-xl font-bold text-navy-900">{upcomingCount ?? '—'}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center shrink-0">
            <ListChecks className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Completed
            </p>
            <p className="text-xl font-bold text-navy-900">{completedCount ?? '—'}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200">
          {(['ACCEPTED', 'COMPLETED'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-4 text-sm font-bold border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-navy-600 text-navy-600 bg-navy-50/50'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              {tab === 'ACCEPTED' ? 'Upcoming Demos' : 'Completed Demos'}
            </button>
          ))}
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="text-center py-12 text-slate-500">Loading demos...</div>
          ) : demos.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-slate-500">No {activeTab.toLowerCase()} demos found.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {demos.map((demo) => (
                <div
                  key={demo.id}
                  className="bg-slate-50 rounded-xl p-5 border border-slate-100 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between hover:border-slate-200 transition-colors"
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-navy-600 bg-navy-50 px-2 py-1 rounded">
                        {demo.lead_code}
                      </span>
                      <h4 className="font-bold text-navy-900">{demo.customer_name}</h4>
                    </div>

                    {(demo.interested_properties?.[0]?.property ||
                      demo.lead?.preferred_location) && (
                      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
                        {demo.interested_properties?.[0]?.property && (
                          <span className="flex items-center gap-1.5">
                            <Building2 className="w-4 h-4 text-slate-400" />
                            {demo.interested_properties[0].property.title}
                          </span>
                        )}
                        {(demo.interested_properties?.[0]?.property?.location ||
                          demo.lead?.preferred_location) && (
                          <span className="flex items-center gap-1.5">
                            <MapPin className="w-4 h-4 text-slate-400" />
                            {demo.interested_properties?.[0]?.property?.location ||
                              demo.lead?.preferred_location}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
                      <span className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        {new Date(demo.scheduled_at).toLocaleString('en-IN')}
                      </span>
                      <span className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                        <PhoneCall className="w-4 h-4 text-slate-400" />
                        {demo.phone}
                      </span>
                      {demo.handler && (
                        <span className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                          <User className="w-4 h-4 text-slate-400" />
                          {demo.handler.full_name}
                        </span>
                      )}
                    </div>
                  </div>

                  {activeTab === 'ACCEPTED' && (
                    <div className="flex items-center gap-2 w-full md:w-auto">
                      <button
                        onClick={() => {
                          setSelectedDemo(demo);
                          setActionType('COMPLETE');
                          setNotes('');
                        }}
                        className="flex-1 md:flex-none px-4 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Complete
                      </button>
                      <button
                        onClick={() => {
                          setSelectedDemo(demo);
                          setActionType('CANCEL');
                          setNotes('');
                        }}
                        className="flex-1 md:flex-none px-4 py-2 bg-red-50 text-red-700 hover:bg-red-100 font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <X className="w-4 h-4" />
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action Modal */}
      {selectedDemo && actionType && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-navy-900">
                {actionType === 'COMPLETE' ? 'Complete Demo' : 'Cancel Demo'}
              </h3>
              <button
                onClick={() => setSelectedDemo(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  Notes / Feedback
                </label>
                <textarea
                  required={actionType === 'CANCEL'}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={
                    actionType === 'COMPLETE'
                      ? 'Optional notes about the demo...'
                      : 'Reason for cancellation...'
                  }
                  rows={3}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedDemo(null)}
                  className="flex-1 bg-white text-slate-700 font-bold py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={completeMutation.isPending || cancelMutation.isPending}
                  className={`flex-1 text-white font-bold py-2.5 rounded-xl transition-colors ${
                    actionType === 'COMPLETE'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {completeMutation.isPending || cancelMutation.isPending ? 'Saving...' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
