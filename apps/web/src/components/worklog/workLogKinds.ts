// Keep in sync with WORK_LOG_KINDS in apps/api/src/routes/workLog.ts.
export const WORK_LOG_KINDS = [
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

const LABELS: Record<string, string> = {
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

/** What to call a logged entry: the typed name for "Other", else the kind. */
export const workLogEntryLabel = (w: { kind: string; title?: string | null }) =>
  w.kind === 'OTHER' && w.title ? w.title : w.kind === 'OTHER' ? 'Other' : workLogKindLabel(w.kind);
