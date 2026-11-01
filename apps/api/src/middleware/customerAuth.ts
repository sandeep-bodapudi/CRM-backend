import { Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { passwordFingerprint, verifyCustomerToken } from '../utils/customerJwt';

/** Attaches req.customer for a valid My Property token. The token stops
 * working when the password changes or the customer is deactivated. While
 * the temporary password is still in use only the routes marked
 * `allowTemporary` are reachable (change password, who am I). */
export const requireCustomer =
  (opts: { allowTemporary?: boolean } = {}) =>
  async (req: any, res: Response, next: NextFunction) => {
    const header = req.header('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return res.status(401).json({ error: 'Please log in' });

    let payload;
    try {
      payload = verifyCustomerToken(token);
    } catch {
      return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
    }

    try {
      const customer = await prisma.customer.findUnique({ where: { id: payload.customerId } });
      if (
        !customer ||
        customer.company_id !== payload.companyId ||
        customer.status !== 'ACTIVE' ||
        !customer.password_hash ||
        passwordFingerprint(customer.password_hash) !== payload.pwf
      ) {
        return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
      }
      if (customer.force_password_reset && !opts.allowTemporary) {
        return res
          .status(403)
          .json({ error: 'Please set your own password first.', code: 'PASSWORD_CHANGE_REQUIRED' });
      }
      req.customer = customer;
      next();
    } catch (err) {
      next(err);
    }
  };
