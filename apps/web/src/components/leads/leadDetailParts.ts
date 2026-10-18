import type { LeadActivity } from '../../types';

/** Lead stages in plain words, for people rather than database codes. */
export const LEAD_STATUS_WORDS: Record<string, string> = {
  NEW: 'New',
  ASSIGNED: 'Assigned',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  DEMO_SCHEDULED: 'Demo booked',
  DEMO_COMPLETED: 'Demo done',
  SITE_VISIT_SCHEDULED: 'Site visit booked',
  SITE_VISIT_COMPLETED: 'Site visit done',
  NEGOTIATION: 'Negotiation',
  BOOKING_INITIATED: 'Booking started',
  BOOKED: 'Booked',
  DROPPED: 'Dropped',
  RECOVERED_TO_POOL: 'Back in the pool',
};

/** What a stage-change button should say. */
export const TRANSITION_WORDS: Record<string, string> = {
  CONTACTED: 'Mark as contacted',
  QUALIFIED: 'Qualify lead',
  DEMO_SCHEDULED: 'Schedule a demo',
  DEMO_COMPLETED: 'Mark demo done',
  SITE_VISIT_SCHEDULED: 'Mark site visit booked',
  SITE_VISIT_COMPLETED: 'Mark site visit done',
  NEGOTIATION: 'Move to negotiation',
  BOOKING_INITIATED: 'Start booking',
  BOOKED: 'Mark as booked',
  DROPPED: 'Drop this lead',
  ASSIGNED: 'Put back to assigned',
};

/** Calls logged on the lead: how many, and the newest one's result and time. */
export function callSummary(activities: LeadActivity[] | undefined) {
  const calls = (activities || []).filter((a) => a.activity_type === 'CALL_LOGGED');
  if (calls.length === 0) return null;
  const latest = calls.reduce((a, b) => (new Date(a.created_at) > new Date(b.created_at) ? a : b));
  // Call notes start with "[<outcome label>]" (see the API's logCall).
  const result = /^\[([^\]]+)\]/.exec(latest.notes || '')?.[1] || null;
  return { count: calls.length, result, at: latest.created_at };
}

export function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function rupeesLakh(n: number | null | undefined) {
  if (!n) return null;
  return n >= 10000000 ? `₹${(n / 10000000).toFixed(2)} Cr` : `₹${(n / 100000).toFixed(1)} L`;
}
