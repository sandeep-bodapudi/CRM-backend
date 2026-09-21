import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building, CalendarCheck, MapPin, ClipboardList } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import { PropertyListItem } from '../../types';
import { PropertyManagement } from '../properties/PropertyManagement';
import { StatCard, ListWidget, ListItem } from '../ui';

import { ActiveSiteVisitsBanner } from '../siteVisits/ActiveSiteVisitsBanner';

export const PMDashboard: React.FC = () => {
  const { user, fetchWithAuth } = useAuth();
  const navigate = useNavigate();
  const [properties, setProperties] = useState<PropertyListItem[]>([]);
  const [metrics, setMetrics] = useState({
    assignedDemos: 0,
    siteVisitsPending: 0,
    activeProjects: 0,
  });
  const [pendingResponses, setPendingResponses] = useState<ListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPMData = async () => {
    setIsLoading(true);
    try {
      const [propsRes, projectsRes, visitsRes] = await Promise.all([
        fetchWithAuth(`${API_BASE_URL}/properties?status=PENDING_VERIFICATION`),
        // Explicit high limit: the backend default (previously 50, now 2000)
        // silently truncated this PM's project list once it passed that.
        fetchWithAuth(`${API_BASE_URL}/projects?limit=100000`),
        fetchWithAuth(`${API_BASE_URL}/site-visits`),
      ]);

      if (propsRes.ok) {
        const data = await propsRes.json();
        setProperties(data.properties || []);
      }

      let activeProjects = 0;
      if (projectsRes.ok) {
        const data = await projectsRes.json();
        activeProjects = (data.projects || []).filter((p: any) => p.status === 'ACTIVE').length;
      }

      let assignedDemos = 0;
      let visitsPendingCount = 0;
      const responses: ListItem[] = [];

      if (visitsRes.ok) {
        const data = await visitsRes.json();
        const visits = data.visits || [];

        assignedDemos = visits.filter(
          (v: any) =>
            v.assigned_agent_id === user?.id &&
            !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(v.status),
        ).length;

        const pendingVisits = visits.filter((v: any) => v.status === 'PENDING');
        visitsPendingCount = pendingVisits.length;

        pendingVisits.forEach((v: any) => {
          responses.push({
            id: v.id.toString(),
            title: `Visit for ${v.customer?.customer_name || 'Customer'}`,
            subtitle: `Requested for ${new Date(v.scheduled_date).toLocaleDateString('en-IN')}`,
            icon: MapPin,
            link: '/site-visits',
          });
        });
      }

      setMetrics({
        assignedDemos,
        siteVisitsPending: visitsPendingCount,
        activeProjects,
      });
      setPendingResponses(responses);
    } catch (e) {
      console.error('Fetch PM properties error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPMData();
  }, []);

  // Compute KPIs
  const pendingPropertyAudits = properties.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 tracking-tight">
            Project Manager Dashboard
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Welcome back, {user?.employeeCode}. Here are your pending actions and verifications.
          </p>
        </div>
      </div>

      <ActiveSiteVisitsBanner />

      {/* Primary KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Assigned Demos"
          value={isLoading ? '...' : metrics.assignedDemos}
          icon={CalendarCheck}
          link="/site-visits"
        />
        <StatCard
          label="Visits Pending Acceptance"
          value={isLoading ? '...' : metrics.siteVisitsPending}
          icon={MapPin}
          link="/pm/site-visits/approvals"
        />
        <StatCard
          label="Active Projects"
          value={isLoading ? '...' : metrics.activeProjects}
          icon={Building}
          link="/projects"
        />
        <StatCard
          label="Pending Property Verification"
          value={isLoading ? '...' : pendingPropertyAudits}
          icon={ClipboardList}
          link="/properties"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Property Verification Pipeline */}
        <div className="lg:col-span-2 space-y-6">
          <PropertyManagement />
        </div>

        {/* Right Column: Distinctive Widget */}
        <div className="space-y-6">
          <ListWidget
            title="Pending My Response"
            items={pendingResponses}
            emptyStateMessage="No visit requests pending acceptance."
            viewAllLink="/pm/site-visits/approvals"
          />
        </div>
      </div>
    </div>
  );
};
