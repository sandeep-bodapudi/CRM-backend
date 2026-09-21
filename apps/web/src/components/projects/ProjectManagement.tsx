import React, { useState } from 'react';
import { Building2, Plus, Search, Eye, ImageIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import { Roles, Permissions } from '../../shared';
import { ProjectWizard } from './ProjectWizard';
import { ProjectListItem } from '../../types';
import { getInventorySummary, InventorySummary } from '../../api/projectUnits';
import { resolveImageUrl } from '../../utils/imageUtils';

import { useQuery, useQueryClient } from '@tanstack/react-query';

const STATUS_BADGE: Record<string, string> = {
  PLANNING: 'bg-navy-100 text-navy-800 border-navy-300',
  UNDER_CONSTRUCTION: 'bg-amber-100 text-amber-800 border-amber-300',
  COMPLETED: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  CANCELLED: 'bg-rose-100 text-rose-800 border-rose-300',
};

const PROJECT_TYPE_LABELS: Record<string, string> = {
  PLOTTED: 'Plotted Development',
  APARTMENT: 'Apartments',
  VILLA: 'Villas',
  INDEPENDENT_HOUSE: 'Independent Houses',
  ROW_HOUSE: 'Row Houses',
  AGRICULTURAL_LAND: 'Agricultural / Farm Land',
  FARM_HOUSE: 'Farm Houses',
  COMMERCIAL_SHOP: 'Commercial Shops',
  COMMERCIAL_OFFICE: 'Commercial Office Space',
  MIXED_RESIDENTIAL: 'Mixed Residential',
  MIXED_USE: 'Mixed Use',
  TOWNSHIP: 'Township',
  GATED_COMMUNITY: 'Gated Community',
  // Kept for backward compatibility with existing rows -- see the enum's own
  // comment in schema.prisma (spec item 1.6).
  MIXED: 'Mixed (legacy)',
  COMMERCIAL: 'Commercial (legacy)',
  OTHER: 'Other',
};

/** Small stacked bar of live unit counts by sales status. Fetched per-card —
 * acceptable for a modest number of projects (see Phase 2 implementation plan
 * for the batched-endpoint follow-up if this becomes a real N+1 cost). */
const InventoryBar: React.FC<{ projectId: number }> = ({ projectId }) => {
  const { fetchWithAuth } = useAuth();
  const { data } = useQuery({
    queryKey: ['project', projectId, 'summary'],
    queryFn: () => getInventorySummary(fetchWithAuth, projectId).then((r) => r.summary),
    staleTime: 60_000,
  });

  const summary = data as InventorySummary | undefined;
  if (!summary || summary.total_units === 0) {
    return <p className="text-[10px] text-slate-400 italic">No units added yet</p>;
  }

  const segments = [
    { key: 'AVAILABLE', color: 'bg-emerald-500' },
    { key: 'HOLD', color: 'bg-amber-400' },
    { key: 'RESERVED', color: 'bg-blue-500' },
    { key: 'BOOKED', color: 'bg-indigo-600' },
    { key: 'SOLD', color: 'bg-slate-600' },
    { key: 'BLOCKED', color: 'bg-rose-400' },
  ];

  return (
    <div className="space-y-1.5">
      <div className="flex h-2 rounded-full overflow-hidden bg-slate-100">
        {segments.map((seg) => {
          const count = summary.by_status[seg.key] || 0;
          if (!count) return null;
          const pct = (count / summary.total_units) * 100;
          return (
            <div
              key={seg.key}
              className={seg.color}
              style={{ width: `${pct}%` }}
              title={`${seg.key}: ${count}`}
            />
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="font-bold text-slate-700">{summary.total_units} units</span>
        <span className="text-emerald-700 font-semibold">
          {summary.by_status.AVAILABLE || 0} available
        </span>
      </div>
    </div>
  );
};

export const ProjectManagement: React.FC = () => {
  const { user, fetchWithAuth, activeRole } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [showAddModal, setShowAddModal] = useState(false);

  const canCreate =
    user?.permissions?.includes(Permissions.PROJECTS_CREATE) ||
    ([Roles.MD, Roles.ADMIN] as string[]).includes(activeRole);

  // Server-side status filtering — the backend has always supported ?status=,
  // it just wasn't being used; search and project_type still filter client-side
  // since the backend doesn't yet index/filter on those (fine for the current
  // project volume).
  const { data: projectsData, isLoading } = useQuery({
    queryKey: ['projects', statusFilter],
    queryFn: async () => {
      // Explicit high limit: the backend default (previously 50, now 2000)
      // silently truncated the list for any company with more projects than
      // that — same bug class as leads/properties/customers.
      const qs = statusFilter !== 'ALL' ? `&status=${statusFilter}` : '';
      const res = await fetchWithAuth(`${API_BASE_URL}/projects?limit=100000${qs}`);
      if (!res.ok) throw new Error('Failed to load projects');
      return res.json();
    },
  });

  const projects: ProjectListItem[] = projectsData?.projects || [];

  const filteredProjects = projects.filter((p: any) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.location.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === 'ALL' || p.project_type === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6 relative">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-navy-950 to-slate-900 rounded-3xl p-6 text-white shadow-xl flex flex-wrap items-center justify-between gap-4 border border-navy-700/30">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-5 h-5 text-navy-400" />
            <h2 className="text-xl font-extrabold tracking-tight">Projects & Sites</h2>
          </div>
          <p className="text-xs text-navy-200/80">
            Manage real estate ventures, layouts, and their associated inventory units.
          </p>
        </div>

        {canCreate && (
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-navy-500 hover:bg-navy-400 text-navy-950 font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>New Project</span>
          </button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <span>Total Projects:</span>
          <span className="bg-slate-200 px-2 py-0.5 rounded text-slate-800">
            {filteredProjects.length}
          </span>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-60">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search name or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-600"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="py-1.5 px-3 text-xs bg-white border border-slate-200 rounded-xl font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-navy-600"
          >
            <option value="ALL">All Types</option>
            {Object.entries(PROJECT_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="py-1.5 px-3 text-xs bg-white border border-slate-200 rounded-xl font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-navy-600"
          >
            <option value="ALL">All Statuses</option>
            <option value="PLANNING">Planning</option>
            <option value="UNDER_CONSTRUCTION">Under Construction</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Projects Grid */}
      {isLoading ? (
        <div className="py-12 text-center text-xs text-slate-400 font-bold">
          Loading projects...
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-400">No projects found.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProjects.map((proj: any) => (
            <div
              key={proj.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-card hover:shadow-card-hover transition-all overflow-hidden flex flex-col justify-between"
            >
              <div className="aspect-video bg-slate-100 border-b border-slate-100 overflow-hidden">
                {proj.cover_image_url ? (
                  <img
                    src={resolveImageUrl(proj.cover_image_url)}
                    alt={proj.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-300">
                    <ImageIcon className="w-8 h-8" />
                  </div>
                )}
              </div>
              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-navy-900 text-[10px] bg-navy-50 px-2 py-0.5 rounded border border-navy-200">
                    {proj.project_code}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_BADGE[proj.status] || 'bg-slate-100 text-slate-700 border-slate-300'}`}
                  >
                    {proj.status.replace(/_/g, ' ')}
                  </span>
                </div>

                <div>
                  <h3
                    className="font-extrabold text-slate-900 text-base leading-snug line-clamp-1"
                    title={proj.name}
                  >
                    {proj.name}
                  </h3>
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    {proj.location}
                    {proj.project_type && <span className="text-slate-300 mx-1">•</span>}
                    {proj.project_type && PROJECT_TYPE_LABELS[proj.project_type]}
                  </p>
                </div>

                <div className="pt-2 text-xs text-slate-600 line-clamp-2 leading-relaxed">
                  {proj.description || 'No description provided.'}
                </div>

                <div className="pt-1">
                  <InventoryBar projectId={proj.id} />
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between mt-auto">
                <div className="text-[10px] text-slate-500 font-medium">
                  <span className="block text-slate-400 mb-0.5">Assigned PM</span>
                  <span className="font-bold text-slate-700">
                    {proj.assigned_pm ? proj.assigned_pm.full_name : 'Unassigned'}
                  </span>
                </div>

                <button
                  onClick={() => navigate(`/projects/${proj.id}`)}
                  className="px-3.5 py-1.5 bg-navy-700 hover:bg-navy-800 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center gap-1"
                >
                  <Eye className="w-3.5 h-3.5" /> Details
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <ProjectWizard
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            queryClient.invalidateQueries({ queryKey: ['projects'] });
          }}
        />
      )}
    </div>
  );
};
