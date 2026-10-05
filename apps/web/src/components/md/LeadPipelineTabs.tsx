import React, { useEffect, useState } from 'react';
import {
  Users,
  UserCheck,
  PhoneCall,
  BadgeCheck,
  Calendar,
  CheckCircle2,
  MapPin,
  ArrowRightLeft,
  FileSignature,
  Award,
  LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import { StatCard } from '../ui';

interface StageCount {
  status: string;
  count: number;
}

const STAGE_LABELS: Record<string, string> = {
  NEW: 'New',
  ASSIGNED: 'Assigned',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  DEMO_SCHEDULED: 'Demo Scheduled',
  DEMO_COMPLETED: 'Demo Completed',
  SITE_VISIT_SCHEDULED: 'Site Visit Scheduled',
  SITE_VISIT_COMPLETED: 'Site Visit Completed',
  NEGOTIATION: 'Negotiation',
  BOOKING_INITIATED: 'Booking Initiated',
  BOOKED: 'Booked',
};

const STAGE_ICONS: Record<string, LucideIcon> = {
  NEW: Users,
  ASSIGNED: UserCheck,
  CONTACTED: PhoneCall,
  QUALIFIED: BadgeCheck,
  DEMO_SCHEDULED: Calendar,
  DEMO_COMPLETED: CheckCircle2,
  SITE_VISIT_SCHEDULED: MapPin,
  SITE_VISIT_COMPLETED: CheckCircle2,
  NEGOTIATION: ArrowRightLeft,
  BOOKING_INITIATED: FileSignature,
  BOOKED: Award,
};

const STAGE_ORDER = Object.keys(STAGE_LABELS);

// Where each stage's tile opens: demos and site visits have their own pages,
// booked stages the bookings page; the rest are lead stages (Leads page,
// filtered to that stage).
const STAGE_LINKS: Record<string, string> = {
  DEMO_SCHEDULED: '/demos',
  DEMO_COMPLETED: '/demos',
  SITE_VISIT_SCHEDULED: '/site-visits',
  SITE_VISIT_COMPLETED: '/site-visits',
  BOOKING_INITIATED: '/bookings',
  BOOKED: '/bookings',
};

// Polled rather than fetched once, so the counts on the MD/Admin dashboard
// stay current as leads move through the pipeline without a manual refresh.
const POLL_INTERVAL_MS = 20000;

export const LeadPipelineTabs: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const [stages, setStages] = useState<StageCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchCounts = async () => {
      try {
        const res = await fetchWithAuth(`${API_BASE_URL}/md/lead-pipeline-counts`);
        const data = await res.json();
        if (res.ok && !cancelled) {
          setStages(data.stages || []);
        }
      } catch (e) {
        console.error('Fetch lead pipeline counts error:', e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchCounts();
    const timer = setInterval(fetchCounts, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [fetchWithAuth]);

  const countByStatus = new Map(stages.map((s) => [s.status, s.count]));

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-bold text-navy-900">Lead Pipeline</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {STAGE_ORDER.map((status) => (
          <StatCard
            key={status}
            label={STAGE_LABELS[status]}
            value={isLoading ? '...' : countByStatus.get(status) || 0}
            icon={STAGE_ICONS[status]}
            link={STAGE_LINKS[status] || `/leads?status=${status}`}
          />
        ))}
      </div>
    </div>
  );
};
