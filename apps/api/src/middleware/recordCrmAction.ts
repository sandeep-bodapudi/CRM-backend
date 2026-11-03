import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

// Everything a person does in the CRM, for the daily work page (Team Today
// and the person's own daily report). Before 2026-11-02 that page only
// counted calls, visits and a few uploads, so HR approving leave, Finance
// recording a payment or Admin changing a setting left no trace of their day.
// Mounted once in front of the API: every change that succeeds (2xx) by a
// signed-in person becomes one AuditEvent row, action CRM_ACTION, with a
// plain-words label such as "Logged a call on lead #123".
export const CRM_ACTION = 'CRM_ACTION';

// Not someone's work: signing in, reading notifications, searches, previews,
// and the work log, which records itself as WORK_LOG.
const SKIP =
  /^\/(auth|push|notifications|search|ai|analytics|health|kiosk-auth|kiosk-credentials|work-log|public|customer|integration|feedback)(\/|$)|\/(preview|preview-price|search|read|parse|refresh|logout|unlock-options|unlock-verify|register-options|register-verify)(\/|$)/;

// What the record is, by the API path word (singular, lower case).
const NOUNS: Record<string, string> = {
  leads: 'lead',
  'site-visits': 'site visit',
  tasks: 'task',
  customers: 'customer',
  properties: 'property',
  projects: 'project',
  units: 'unit',
  'pricing-rules': 'pricing rule',
  pricing: 'pricing',
  bookings: 'booking',
  payments: 'payment',
  installments: 'instalment',
  employees: 'employee',
  attendance: 'attendance',
  reports: 'daily report',
  complaints: 'complaint',
  demos: 'demo',
  opportunities: 'opportunity',
  'expense-refunds': 'expense claim',
  offers: 'offer',
  announcement: 'announcement',
  targets: 'target',
  'message-templates': 'message template',
  'pm-routing': 'PM routing',
  amenities: 'amenity',
  roles: 'role',
  permissions: 'permissions',
  'permission-overrides': 'permission override',
  companies: 'company',
  branches: 'branch',
  holidays: 'holiday',
  media: 'project file',
  documents: 'document',
  images: 'photo',
  'layout-images': 'layout image',
  layout: 'layout',
  inventory: 'inventory',
  whatsapp: 'WhatsApp message',
  'performance-adjustments': 'performance adjustment',
  performance: 'performance score',
  proposals: 'attendance request',
  wfh: 'work-from-home day',
  'weekly-offs': 'weekly off',
  'duty-days': 'duty day',
  badge: 'attendance badge',
  'two-step': '2-step login',
  md: 'MD setting',
  admin: 'setting',
};

// What was done, by the last action word in the path.
const VERBS: Record<string, string> = {
  assign: 'Assigned',
  'assign-agent': 'Assigned an agent to',
  reassign: 'Reassigned',
  transfer: 'Transferred',
  approve: 'Approved',
  'md-approve': 'Approved (MD)',
  'md-review': 'Reviewed (MD)',
  'md-reject': 'Rejected (MD)',
  reject: 'Rejected',
  'reject-cancel': 'Refused the cancellation of',
  review: 'Reviewed',
  'accountant-review': 'Reviewed (accounts)',
  'submit-for-review': 'Submitted for review',
  resubmit: 'Resubmitted',
  'dm-verify-as-is': 'Verified as-is',
  'dm-polish': 'Polished the listing of',
  verify: 'Verified',
  cancel: 'Cancelled',
  'initiate-cancel': 'Started cancelling',
  'confirm-cancel': 'Confirmed the cancellation of',
  complete: 'Completed',
  finish: 'Finished',
  start: 'Started',
  confirm: 'Confirmed',
  'confirm-location': 'Confirmed the location of',
  status: 'Changed the status of',
  reschedule: 'Rescheduled',
  'direct-reschedule': 'Rescheduled',
  'direct-outcome': 'Recorded the outcome of',
  outcome: 'Recorded the outcome of',
  calls: 'Logged a call on',
  callback: 'Set a call-back on',
  activity: 'Added an activity to',
  updates: 'Posted an update on',
  notes: 'Added a note to',
  chat: 'Messaged on',
  'whatsapp-proposal': 'Sent a WhatsApp proposal for',
  resign: 'Recorded the resignation of',
  resignation: 'Changed the resignation of',
  handover: 'Handed over the work of',
  'reset-password': 'Reset the password of',
  promote: 'Promoted',
  'convert-employment-type': 'Changed the employment type of',
  deactivate: 'Deactivated',
  reactivate: 'Reactivated',
  'attendance-requirement': 'Changed the attendance rule for',
  'override-price': 'Set the price of',
  recalculate: 'Recalculated prices of',
  generate: 'Generated',
  'bulk-upload': 'Bulk-uploaded',
  'upload-image': 'Uploaded a photo to',
  photo: 'Uploaded a photo to',
  'proof-photo': 'Uploaded a proof photo to',
  hold: 'Put on hold',
  'move-batch': 'Moved',
  publications: 'Published',
  accept: 'Accepted',
  decline: 'Declined',
  resolve: 'Resolved',
  close: 'Closed',
  escalate: 'Escalated',
  dismiss: 'Dismissed',
  'mark-refunded': 'Marked refunded',
  'convert-to-booking': 'Converted to a booking',
  'check-in': 'Checked in',
  'check-out': 'Checked out',
  'selfie-check-in': 'Checked in (selfie)',
  checkout: 'Checked out',
  scan: 'Scanned the attendance QR',
  'leave-proposal': 'Asked for leave',
  'late-proposal': 'Asked to come late',
  'early-logout-proposal': 'Asked to leave early',
  'field-work-proposal': 'Asked for field work',
  'wfh-proposal': 'Asked to work from home',
  'comp-off-request': 'Asked for a comp-off',
  'swap-request': 'Asked to swap a day off',
  'duty-request': 'Asked for a duty day',
  'claim-request': 'Made a claim',
  decide: 'Decided',
  undo: 'Undid',
  redo: 'Redid',
  reset: 'Reset',
  lockdown: 'Triggered the emergency lockdown',
  'sign-out-others': 'Signed out other devices',
  'change-password': 'Changed own password',
  enable: 'Turned on',
  disable: 'Turned off',
  setup: 'Set up',
  'reporting-suggestions': 'Applied reporting managers',
  apply: 'Applied',
  'portal-access': 'Changed portal access for',
  'customer-portal': 'Changed portal access for',
  kyc: 'Started KYC for',
  'pm-reconfirm': 'Reconfirmed (PM)',
  'reconfirm-customer': 'Reconfirmed the customer for',
  'walk-in': 'Recorded a walk-in for',
  'make-direct': 'Made direct',
  clear: 'Cleared',
  'reset-score-history': 'Reset the score history of',
};

const FALLBACK_VERB: Record<string, string> = {
  POST: 'Added',
  PUT: 'Updated',
  PATCH: 'Updated',
  DELETE: 'Removed',
};

// Whole paths with their own wording.
const SPECIAL: Record<string, string> = {
  'POST /reports': 'Sent the daily report',
  'PUT /reports': 'Edited the daily report',
};

// Actions that read as a whole sentence without naming the record.
const NO_OBJECT =
  /^(Checked (in|out)|Scanned|Asked |Made a claim|Triggered|Signed out|Changed own|Applied reporting)/;

const isId = (s: string) => /^\d+$/.test(s);

/** "POST /leads/123/calls" -> { label: "Logged a call on lead #123", ... } */
export function describeCrmAction(method: string, path: string) {
  const parts = path.split('?')[0].split('/').filter(Boolean);
  let noun = '';
  let nounKey = '';
  let id = 0;
  let verb = '';
  let parent = '';
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (isId(part)) {
      if (noun) id = Number(part);
      continue;
    }
    // A record type starts (or, after an id, nests: "project #5 / unit");
    // a word that is both, at the end after an id, is the action.
    if (NOUNS[part] && !(VERBS[part] && i > 0 && isId(parts[i - 1]) && i === parts.length - 1)) {
      parent = noun && id ? `${noun} #${id}` : '';
      noun = NOUNS[part];
      nounKey = part;
      id = 0;
      continue;
    }
    if (VERBS[part]) verb = VERBS[part];
  }
  if (!noun) {
    noun = (parts[0] || 'record').replace(/-/g, ' ');
    nounKey = parts[0] || 'record';
  }
  const what = id ? `${noun} #${id}` : noun;
  const label = SPECIAL[`${method} /${parts.join('/')}`]
    ? SPECIAL[`${method} /${parts.join('/')}`]
    : !verb
      ? `${FALLBACK_VERB[method] || 'Changed'} ${id ? what : `a ${noun}${parent ? ` to ${parent}` : ''}`}`
      : NO_OBJECT.test(verb)
        ? verb
        : `${verb} ${what}`;
  return {
    label: label.charAt(0).toUpperCase() + label.slice(1),
    entityType: nounKey.toUpperCase().replace(/-/g, '_').slice(0, 60),
    entityId: id,
  };
}

export const recordCrmAction = (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  // Path under /api/v1, e.g. "/leads/123/calls".
  const path = req.originalUrl.split('?')[0].replace(/^\/api\/v1/, '');
  if (SKIP.test(path)) return next();

  res.on('finish', () => {
    const user = (req as any).user;
    if (!user?.employeeId || res.statusCode >= 400) return;
    const { label, entityType, entityId } = describeCrmAction(req.method, path);
    prisma.auditEvent
      .create({
        data: {
          actor_id: user.employeeId,
          action: CRM_ACTION,
          entity_type: entityType || 'RECORD',
          entity_id: entityId,
          new_value: JSON.stringify({
            label,
            method: req.method,
            path: path.replace(/\/\d+(?=\/|$)/g, '/:id'),
            // With the ids, so a feed can link to the record.
            url: path.slice(0, 190),
          }),
          company_id: user.companyId ?? null,
        },
      })
      .catch((err) => logger.error({ err }, '[crm-action] could not record'));
  });
  next();
};

/** A CRM_ACTION row's API path with ids ("/projects/5/units/9"), when recorded. */
export const crmActionUrl = (newValue: string | null): string | null => {
  try {
    return JSON.parse(newValue || '{}').url || null;
  } catch {
    return null;
  }
};

/** A CRM_ACTION row's label, for display. */
export const crmActionLabel = (newValue: string | null): string => {
  try {
    return JSON.parse(newValue || '{}').label || 'Did something in the CRM';
  } catch {
    return 'Did something in the CRM';
  }
};
