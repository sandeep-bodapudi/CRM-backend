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
