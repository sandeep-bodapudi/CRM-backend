import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { requireAuthz } from '../middleware/authz';
import { Permissions } from '../shared';
import { PaymentService } from '../services/payment.service';

const router = Router();

// Zod schemas for validation
const RecordPaymentSchema = z.object({
  booking_id: z.number().int().positive(),
  installment_id: z.number().int().positive().optional(),
  amount: z.number().positive(),
  payment_method: z.enum(['CASH', 'CHEQUE', 'BANK_TRANSFER', 'ONLINE']),
  reference_number: z.string().optional().nullable(),
  notes: z.string().optional(),
});

const VerifyPaymentSchema = z.object({
  status: z.enum(['SUCCESS', 'FAILED', 'REFUNDED']),
  reference_number: z.string().trim().max(100).optional(),
  note: z.string().trim().max(500).optional(),
});
const PAYMENT_STATUSES = ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED', 'REFUND_DUE'];

// Routes
router.use(authenticateToken);

router.get('/', requireAuthz(Permissions.PAYMENTS_READ as any), async (req: any, res, next) => {
  try {
    const bookingId = req.query.booking_id
      ? parseInt(req.query.booking_id as string, 10)
      : undefined;
    // ?status=PENDING or ?status=PENDING,REFUND_DUE -- the Finance work queues.
    const statuses = String(req.query.status || '')
      .split(',')
      .map((x) => x.trim().toUpperCase())
      .filter((x) => PAYMENT_STATUSES.includes(x));
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const payments = await PaymentService.getPayments(req.user, bookingId, { statuses, limit });
    res.json(payments);
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/payments/queue-counts -- to verify / to refund, for Finance badges
router.get(
  '/queue-counts',
  // Company-wide totals: only for people who verify payments (Finance, MD).
  requireAuthz(Permissions.PAYMENTS_UPDATE as any),
  async (req: any, res, next) => {
    try {
      res.json(await PaymentService.getQueueCounts(req.user));
    } catch (error) {
      next(error);
    }
  },
);

router.post('/', requireAuthz(Permissions.PAYMENTS_CREATE as any), async (req: any, res, next) => {
  try {
    const dto = RecordPaymentSchema.parse(req.body);
    const payment = await PaymentService.recordPayment(req.user, dto);
    res.status(201).json(payment);
  } catch (error) {
    next(error);
  }
});

router.put(
  '/:id/status',
  requireAuthz(Permissions.PAYMENTS_UPDATE as any),
  async (req: any, res, next) => {
    try {
      const { status, reference_number, note } = VerifyPaymentSchema.parse(req.body);
      const payment = await PaymentService.verifyPayment(
        req.user,
        parseInt(req.params.id, 10),
        status,
        {
          reference_number,
          note,
        },
      );
      res.json(payment);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
