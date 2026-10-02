// Keep in sync with WORK_LOG_KINDS in apps/api/src/routes/workLog.ts.
export const ASSOCIATE_KINDS = [
  'ASSOCIATE_CALL',
  'ASSOCIATE_NEW_CALL',
  'ASSOCIATE_OFFICE_VISIT',
  'ASSOCIATE_ENROLLMENT',
  'ASSOCIATE_SITE_VISIT',
  'ASSOCIATE_PROSPECT',
  'ASSOCIATE_BOOKING',
] as const;

export const WORK_LOG_KINDS = [
  ...ASSOCIATE_KINDS,
  'INSTAGRAM_POST',
  'INSTAGRAM_REEL',
  'INSTAGRAM_STORY',
  'FACEBOOK_POST',
  'YOUTUBE_VIDEO',
  'AD_CAMPAIGN',
  'WHATSAPP_BROADCAST',
  'CONTENT_DESIGN',
  'CLIENT_MEETING',
  'SITE_VISIT',
  'PROPERTY_INSPECTION',
  'PARTNER_MEETING',
  'OTHER',
] as const;

/** Groups for the work-log picker. */
export const WORK_LOG_GROUPS: { label: string; kinds: readonly string[] }[] = [
  { label: 'Associates (channel partners)', kinds: ASSOCIATE_KINDS },
  {
    label: 'Digital & content',
    kinds: [
      'INSTAGRAM_POST',
      'INSTAGRAM_REEL',
      'INSTAGRAM_STORY',
      'FACEBOOK_POST',
      'YOUTUBE_VIDEO',
      'AD_CAMPAIGN',
      'WHATSAPP_BROADCAST',
      'CONTENT_DESIGN',
    ],
  },
  {
    label: 'Field & meetings',
    kinds: ['CLIENT_MEETING', 'SITE_VISIT', 'PROPERTY_INSPECTION', 'PARTNER_MEETING'],
  },
  { label: 'Other', kinds: ['OTHER'] },
];

const LABELS: Record<string, string> = {
  ASSOCIATE_CALL: 'Call with an associate (follow-up)',
  ASSOCIATE_NEW_CALL: 'Call to a new associate (prospecting)',
  ASSOCIATE_OFFICE_VISIT: "Visit to an associate's office",
  ASSOCIATE_ENROLLMENT: 'New associate enrolled',
  ASSOCIATE_SITE_VISIT: 'Customer site visit via an associate',
  ASSOCIATE_PROSPECT: 'New prospect from an associate',
  ASSOCIATE_BOOKING: 'Booking via an associate',
  INSTAGRAM_POST: 'Instagram post',
  INSTAGRAM_REEL: 'Instagram reel',
  INSTAGRAM_STORY: 'Instagram story',
  FACEBOOK_POST: 'Facebook post',
  YOUTUBE_VIDEO: 'YouTube video',
  AD_CAMPAIGN: 'Ad campaign (Meta / Google)',
  WHATSAPP_BROADCAST: 'WhatsApp broadcast',
  CONTENT_DESIGN: 'Content / creative design',
  CLIENT_MEETING: 'Client meeting',
  SITE_VISIT: 'Site visit (outside CRM booking)',
  PROPERTY_INSPECTION: 'Property / project inspection',
  PARTNER_MEETING: 'Channel partner meeting',
  OTHER: 'Other — type what you did',
};

export const workLogKindLabel = (kind: string) => LABELS[kind] || kind;

export const isAssociateKind = (kind: string) => kind.startsWith('ASSOCIATE_');

/** What to call a logged entry: the typed name for "Other", else the kind. */
export const workLogEntryLabel = (w: { kind: string; title?: string | null }) =>
  w.kind === 'OTHER' && w.title ? w.title : w.kind === 'OTHER' ? 'Other' : workLogKindLabel(w.kind);

/** Short labels for counts on dashboards. */
export const ASSOCIATE_STAT_LABELS: Record<string, string> = {
  ASSOCIATE_CALL: 'Associate calls',
  ASSOCIATE_NEW_CALL: 'New associate calls',
  ASSOCIATE_OFFICE_VISIT: 'Office visits',
  ASSOCIATE_ENROLLMENT: 'Enrollments',
  ASSOCIATE_SITE_VISIT: 'Site visits',
  ASSOCIATE_PROSPECT: 'New prospects',
  ASSOCIATE_BOOKING: 'Bookings',
};

export interface AssociateRef {
  associate_id: string | null;
  name: string;
  phone: string | null;
  company: string | null;
  last_contact: string;
}
