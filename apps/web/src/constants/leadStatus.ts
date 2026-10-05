// Single source of truth for how a Lead.status / Lead.source enum value reads
// on screen. Several places (LeadManagement's Lead Pipeline table,
// TelecallerDashboard's card stepper, LeadDetailModal) previously each
// carried their own partial copy of this, so a status could show as a clean
// label in one place and the raw enum string (e.g. "SITE_VISIT_SCHEDULED")
// in another -- the same lead looked like it meant two different things
// depending on which screen you were looking at it from.
export const LEAD_STATUS_LABELS: Record<string, string> = {
  NEW: 'New',
  ASSIGNED: 'Assigned',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  DEMO_SCHEDULED: 'Demo',
  DEMO_COMPLETED: 'Demo Done',
  SITE_VISIT_SCHEDULED: 'Site Visit',
  SITE_VISIT_COMPLETED: 'Visit Done',
  NEGOTIATION: 'Negotiation',
  BOOKING_INITIATED: 'Booking',
  BOOKED: 'Booked',
  DROPPED: 'Dropped',
  RECOVERED_TO_POOL: 'Recovered',
};

export const getLeadStatusLabel = (status?: string | null): string => {
  if (!status) return 'Unknown';
  return LEAD_STATUS_LABELS[status] || status;
};

const LEAD_SOURCE_LABELS: Record<string, string> = {
  MANUAL_ENTRY: 'Manual Entry',
  BULK_UPLOAD: 'Bulk Upload',
  WEBSITE: 'Website',
  FACEBOOK_ADS: 'Facebook Ads',
  GOOGLE_ADS: 'Google Ads',
  WALK_IN: 'Walk-In',
  REFERRAL: 'Referral',
  HOUSING_COM: 'Housing.com',
  ASSOCIATE: 'Associate',
};

export const getLeadSourceLabel = (source?: string | null): string => {
  if (!source) return 'Unknown';
  return LEAD_SOURCE_LABELS[source] || source;
};

// Relative "how long has this been sitting" hint -- e.g. "2d in pipeline" --
// so a reviewer can spot a stale lead without opening it.
export const getRelativeAge = (isoDate?: string | null): string => {
  if (!isoDate) return '';
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return diffMins <= 1 ? 'Just now' : `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
};
