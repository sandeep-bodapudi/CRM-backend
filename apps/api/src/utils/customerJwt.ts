import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// My Property portal (customer) tokens. Deliberately a separate secret and
// payload from the employee tokens in utils/jwt.ts, so a customer token can
// never pass an internal route. The secret is derived from
// JWT_ACCESS_SECRET, so no new environment variable is needed.
const BASE = process.env.JWT_ACCESS_SECRET;
if (!BASE) {
  throw new Error('FATAL: JWT_ACCESS_SECRET must be provided.');
}
const CUSTOMER_JWT_SECRET = crypto
  .createHmac('sha256', BASE)
  .update('my-property-customer-v1')
  .digest('hex');

export interface CustomerTokenPayload {
  customerId: number;
  companyId: number;
  /** Fingerprint of the password hash: changing the password signs out
   * every other device, with no extra database column. */
  pwf: string;
  /** Temporary password still in use: only password change is allowed. */
  mustChange: boolean;
}

export const passwordFingerprint = (passwordHash: string): string =>
  crypto.createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);

export const generateCustomerToken = (payload: CustomerTokenPayload): string =>
  jwt.sign(payload, CUSTOMER_JWT_SECRET, { expiresIn: '30d', audience: 'my-property' });

export const verifyCustomerToken = (token: string): CustomerTokenPayload =>
  jwt.verify(token, CUSTOMER_JWT_SECRET, { audience: 'my-property' }) as CustomerTokenPayload;
