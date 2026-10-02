import crypto from 'crypto';

const QR_HMAC_SECRET = process.env.QR_HMAC_SECRET;
if (!QR_HMAC_SECRET) {
  throw new Error('QR_HMAC_SECRET is not configured');
}

export interface QrTokenPayload {
  employeeId: number;
  employeeCode: string;
  version: number;
  signedToken: string;
}

export const generateQrHmac = (
  employeeId: number,
  employeeCode: string,
  version: number = 1,
): string => {
  const data = `${employeeId}:${employeeCode}:${version}`;
  return crypto.createHmac('sha256', QR_HMAC_SECRET).update(data).digest('hex');
};

export const verifyQrHmac = (
  employeeId: number,
  employeeCode: string,
  version: number,
  signature: string,
): boolean => {
  // A malformed QR (non-string signature, wrong length) must read as
  // "invalid", not throw -- timingSafeEqual throws on length mismatch, which
  // surfaced at the kiosk as a 500 "Scan failed" instead of "Invalid QR".
  if (typeof signature !== 'string' || !signature) return false;
  const expected = generateQrHmac(employeeId, employeeCode, version);
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
};

// Live attendance QR (version 2). The old badge was the same code forever, so
// a screenshot forwarded on WhatsApp let a colleague check someone in. A live
// code carries the second it was issued and the kiosk rejects it once it is
// older than LIVE_QR_TTL_SECONDS, so only someone holding the employee's
// logged-in phone at the kiosk can present a valid one.
export const LIVE_QR_TTL_SECONDS = 120;

export const generateLiveQrHmac = (employeeId: number, employeeCode: string, issuedAt: number) =>
  crypto
    .createHmac('sha256', QR_HMAC_SECRET)
    .update(`${employeeId}:${employeeCode}:live:${issuedAt}`)
    .digest('hex');

export const buildLiveQrPayload = (employeeId: number, employeeCode: string) => {
  const issuedAt = Math.floor(Date.now() / 1000);
  const signedToken = generateLiveQrHmac(employeeId, employeeCode, issuedAt);
  return {
    employeeId,
    employeeCode,
    version: 2,
    issuedAt,
    expiresInSeconds: LIVE_QR_TTL_SECONDS,
    signedToken,
    qrData: JSON.stringify({ employeeId, employeeCode, version: 2, issuedAt, signedToken }),
  };
};

/** 'ok' | 'expired' | 'invalid' for a version-2 live payload. */
export const verifyLiveQr = (payload: {
  employeeId: number;
  employeeCode: string;
  issuedAt: number;
  signedToken: string;
}): 'ok' | 'expired' | 'invalid' => {
  const { employeeId, employeeCode, issuedAt, signedToken } = payload;
  if (typeof signedToken !== 'string' || !Number.isFinite(issuedAt)) return 'invalid';
  const expected = Buffer.from(generateLiveQrHmac(employeeId, employeeCode, issuedAt));
  const given = Buffer.from(signedToken);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    return 'invalid';
  }
  const age = Math.floor(Date.now() / 1000) - issuedAt;
  // Small allowance for a code issued a moment "in the future" by clock jitter.
  if (age > LIVE_QR_TTL_SECONDS || age < -30) return 'expired';
  return 'ok';
};
