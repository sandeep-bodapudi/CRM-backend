import crypto from 'crypto';

// Authenticator-app codes (RFC 6238: 6 digits, 30-second steps, SHA-1), the
// kind Google Authenticator, Microsoft Authenticator and similar apps make.
// Used for the 2-step login of MD, Admin and Finance (architecture review
// 2026-11-01, #7). Written out here rather than adding a package: it is a
// few lines of HMAC.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const base32Encode = (buf: Buffer) => {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
};

const base32Decode = (text: string) => {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of text.replace(/=+$/, '').toUpperCase()) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
};

/** A new random secret, as the base32 text authenticator apps expect. */
export const newTotpSecret = () => base32Encode(crypto.randomBytes(20));

const codeAt = (secret: string, step: number) => {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const num = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(num).padStart(6, '0');
};

/**
 * Checks a 6-digit code, allowing one step either side for a phone clock
 * that is slightly off. Returns the step that matched (so a code can't be
 * used twice) or null.
 */
export const verifyTotp = (secret: string, code: string, now = Date.now()): number | null => {
  const clean = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const step = Math.floor(now / 30000);
  for (const s of [step, step - 1, step + 1]) {
    const expected = codeAt(secret, s);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return s;
  }
  return null;
};

/** The link an authenticator app reads from the QR code. */
export const totpUri = (secret: string, account: string, issuer = 'RRH CRM') =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;

export { codeAt as _totpCodeAt };
