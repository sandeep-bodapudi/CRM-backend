import { LEAD_UPLOAD_SOURCES } from '../../shared';

/** Plain-language names, used in activity notes. */
export const LEAD_SOURCE_NAMES: Record<string, string> = {
  MANUAL_ENTRY: 'manual entry',
  BULK_UPLOAD: 'a bulk upload',
  WEBSITE: 'the website',
  FACEBOOK_ADS: 'Facebook ads',
  GOOGLE_ADS: 'Google ads',
  WALK_IN: 'a walk-in',
  REFERRAL: 'a referral',
  HOUSING_COM: 'Housing.com',
  ASSOCIATE: 'an associate',
  OTHER: 'another source',
};

const KNOWN_CODES = new Set<string>([
  ...LEAD_UPLOAD_SOURCES,
  'MANUAL_ENTRY',
  'BULK_UPLOAD',
  'ASSOCIATE',
]);

// Free text found in uploaded files ("housing", "Housing.com", "fb", ...).
const ALIASES: [RegExp, string][] = [
  [/housing/i, 'HOUSING_COM'],
  [/(facebook|^fb$|\bmeta\b|instagram)/i, 'FACEBOOK_ADS'],
  [/google/i, 'GOOGLE_ADS'],
  [/(web\s?site|^web$)/i, 'WEBSITE'],
  [/walk[\s_-]?in/i, 'WALK_IN'],
  [/(referral|reference|referred)/i, 'REFERRAL'],
];

/**
 * Turns whatever a file's "source" column holds into one stable code, so
 * reports and the Leads-page filter do not split "Housing", "housing.com" and
 * "HOUSING_COM" into three sources. Anything unrecognised becomes OTHER with
 * the original wording kept in `detail`.
 */
export function normaliseLeadSource(text?: string | null): {
  source: string;
  detail: string | null;
} {
  const raw = (text || '').trim();
  if (!raw) return { source: 'BULK_UPLOAD', detail: null };
  const code = raw.toUpperCase().replace(/[\s-]+/g, '_');
  if (KNOWN_CODES.has(code)) return { source: code, detail: null };
  for (const [pattern, mapped] of ALIASES) {
    if (pattern.test(raw)) return { source: mapped, detail: null };
  }
  return { source: 'OTHER', detail: raw.slice(0, 80) };
}
