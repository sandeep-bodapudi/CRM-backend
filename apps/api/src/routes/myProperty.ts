// My Property portal — customer (buyer) API. Mounted at /api/v1/customer.
// Customers log in with their mobile number and the password the CRM issues
// at booking (temporary, must be changed on first login).
import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { validateRequestBody } from '../middleware/validate';
import { requireCustomer } from '../middleware/customerAuth';
import { clientIp } from '../middleware/rateLimiter';
import { MyPropertyService } from '../services/myProperty.service';
import { logger } from '../utils/logger';

const router = Router();

// 10 tries per 15 minutes per address + mobile number, so one office IP
// doesn't lock every customer out and one number can't be brute-forced.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req: any) =>
    `${clientIp(req)}:${String(req.body?.phone || '')
      .replace(/\D/g, '')
      .slice(-10)}`,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const LoginSchema = z.object({
  phone: z.string().min(10, 'Enter your mobile number'),
  password: z.string().min(1, 'Enter your password'),
  company_id: z.number().int().positive().optional(),
});
const ChangePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8, 'Use at least 8 characters'),
});
const ProfileSchema = z.object({
  email: z.string().email('Enter a valid email').max(120).optional().or(z.literal('')).nullable(),
});
const MarkReadSchema = z.object({
  ids: z.union([z.array(z.number().int().positive()).max(200), z.literal('all')]),
});
const RequestSchema = z.object({
  title: z.string().trim().min(3, 'Describe your request in a few words').max(150),
  description: z.string().trim().max(2000).optional(),
  category: z
    .enum(['PAYMENT', 'DOCUMENTS', 'CONSTRUCTION', 'REGISTRATION', 'MAINTENANCE', 'OTHER'])
    .optional(),
  booking_id: z.number().int().positive().optional(),
});

const handle = (fn: (req: any) => Promise<unknown>) => async (req: any, res: Response) => {
  try {
    res.json(await fn(req));
  } catch (error: any) {
    if (error?.statusCode) return res.status(error.statusCode).json({ error: error.message });
    logger.error(`My Property ${req.method} ${req.path} error:`, error);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};

router.post(
  '/auth/login',
  loginLimiter,
  validateRequestBody(LoginSchema),
  handle((req) => MyPropertyService.login(req.body.phone, req.body.password, req.body.company_id)),
);

router.post(
  '/auth/change-password',
  loginLimiter,
  requireCustomer({ allowTemporary: true }),
  validateRequestBody(ChangePasswordSchema),
  handle((req) =>
    MyPropertyService.changePassword(
      req.customer,
      req.body.current_password,
      req.body.new_password,
    ),
  ),
);

router.get(
  '/me',
  requireCustomer({ allowTemporary: true }),
  handle((req) => MyPropertyService.me(req.customer)),
);
router.patch(
  '/me',
  requireCustomer(),
  validateRequestBody(ProfileSchema),
  handle((req) => MyPropertyService.updateProfile(req.customer, req.body)),
);

router.get(
  '/bookings',
  requireCustomer(),
  handle((req) => MyPropertyService.bookings(req.customer)),
);
router.get(
  '/bookings/:id',
  requireCustomer(),
  handle((req) => MyPropertyService.booking(req.customer, Number(req.params.id) || 0)),
);

router.get(
  '/notifications',
  requireCustomer(),
  handle((req) => MyPropertyService.notifications(req.customer)),
);
router.post(
  '/notifications/read',
  requireCustomer(),
  validateRequestBody(MarkReadSchema),
  handle((req) => MyPropertyService.markRead(req.customer, req.body.ids)),
);

router.get(
  '/requests',
  requireCustomer(),
  handle((req) => MyPropertyService.requests(req.customer)),
);
router.post(
  '/requests',
  requireCustomer(),
  validateRequestBody(RequestSchema),
  handle((req) => MyPropertyService.createRequest(req.customer, req.body)),
);

export default router;
