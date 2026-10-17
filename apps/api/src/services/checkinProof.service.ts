import sharp from 'sharp';
import { logger } from '../utils/logger';

/** Metres between two points (haversine). */
export function distanceMetres(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

/** How far away still counts as "at the office" / "at the site". */
export const OFFICE_RADIUS_M = 300;
export const SITE_RADIUS_M = 500;

/**
 * Is the area behind the person almost featureless (a plain or white wall)? Looks
 * at the top third of the selfie, where the background usually is, and measures
 * how much detail it has. A plain wall has very low variation and entropy.
 */
export async function plainBackground(selfie: Buffer): Promise<boolean> {
  try {
    const meta = await sharp(selfie).metadata();
    const w = meta.width || 0;
    const h = meta.height || 0;
    if (!w || !h) return false;
    const top = await sharp(selfie)
      .extract({ left: 0, top: 0, width: w, height: Math.max(1, Math.floor(h * 0.33)) })
      .greyscale()
      .stats();
    const stdev = top.channels[0]?.stdev ?? 99;
    const entropy = top.entropy ?? 8;
    return stdev < 14 || entropy < 4.2;
  } catch (err) {
    logger.warn('[checkin] background check failed:', err);
    return false;
  }
}

/**
 * Optional image check with a vision model (only when OPENROUTER_API_KEY is set):
 * does the selfie's background / the surroundings photo show an office (ideally the
 * company logo) or a construction / project site? It only ever adds a flag for the
 * manager; it never refuses a check-in on its own.
 */
export async function aiPlaceCheck(
  selfie: Buffer,
  surroundings: Buffer,
  place: 'OFFICE' | 'FIELD',
  companyName: string,
): Promise<{ flag: string | null; note: string }> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return { flag: null, note: 'Image check not configured.' };
  try {
    const small = async (b: Buffer) =>
      `data:image/jpeg;base64,${(await sharp(b).resize(640, 640, { fit: 'inside' }).jpeg({ quality: 70 }).toBuffer()).toString('base64')}`;
    const [s1, s2] = await Promise.all([small(selfie), small(surroundings)]);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.AI_VISION_MODEL || 'openai/gpt-4o-mini',
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  `Attendance check for an employee of ${companyName} (real estate). Image 1 is a selfie, image 2 the surroundings. ` +
                  'Answer ONLY with JSON: {"selfie_background":"office|site|plain|other","surroundings":"office|site|other","logo_visible":true|false,"reason":"<one short sentence>"}. ' +
                  '"office" = an office interior or reception; "site" = a construction site, plots, villas or a project; "plain" = a blank or white wall.',
              },
              { type: 'image_url', image_url: { url: s1 } },
              { type: 'image_url', image_url: { url: s2 } },
            ],
          },
        ],
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return { flag: null, note: `Image check unavailable (${res.status}).` };
    const data: any = await res.json();
    const text: string = data?.choices?.[0]?.message?.content || '';
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    const want = place === 'OFFICE' ? 'office' : 'site';
    const ok = json.selfie_background === want || json.surroundings === want;
    const note =
      `Image check: selfie background ${json.selfie_background}, surroundings ${json.surroundings}${place === 'OFFICE' ? `, logo ${json.logo_visible ? 'visible' : 'not seen'}` : ''}. ${json.reason || ''}`.trim();
    return {
      flag: ok
        ? null
        : place === 'OFFICE'
          ? 'Photos do not look like the office'
          : 'Photos do not look like a project site',
      note,
    };
  } catch (err: any) {
    return {
      flag: null,
      note: `Image check unavailable (${err?.name === 'AbortError' ? 'timed out' : 'error'}).`,
    };
  }
}
