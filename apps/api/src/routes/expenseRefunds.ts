import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest, requirePermission } from '../middleware/auth';
import { requireAuthz } from '../middleware/authz';
import { validateRequestBody } from '../middleware/validate';
import {
  ExpenseRefundCreateSchema,
  ExpenseRefundAccountantReviewSchema,
  ExpenseRefundMDReviewSchema,
  ExpenseRefundMarkRefundedSchema,
} from '../shared';
import { Permissions } from '../shared';
import { ExpenseRefundService } from '../services/expenseRefund.service';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

import { memoryUpload, getStorageService } from '../services/storage.service';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.pdf', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only images (JPG, PNG, WebP) and PDFs are allowed.'));
  },
});

router.get(
  '/my',
  authenticateToken,
  requirePermission([Permissions.EXPENSES_READ_OWN]),
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      // Previously had no limit at all — every refund request this employee
      // ever created was fetched every load. Same bug class as leads/
      // properties/customers/projects, fixed the same way.
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 2000, 1), 100000);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

      const { refunds, total } = await ExpenseRefundService.listMyRefunds(req.user!, limit, offset);
      return res.status(200).json({ refunds, total, pagination: { limit, offset, total } });
    } catch (error: any) {
      next(error);
    }
  },
);

router.get(
  '/queue',
  authenticateToken,
  requirePermission([Permissions.EXPENSES_REVIEW, Permissions.EXPENSES_MD_APPROVE]),
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      // Previously had no limit at all, and AccountantRefundQueue.tsx
      // renders every row as an unvirtualized card — the exact unbounded-
      // fetch + unvirtualized-render freeze risk already fixed for
      // bookings/tasks/site-visits, missed here since this page doesn't use
      // the shared DataTable component.
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 2000, 1), 100000);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

      const { refunds, total } = await ExpenseRefundService.listQueue(req.user!, limit, offset);
      return res.status(200).json({ refunds, total, pagination: { limit, offset, total } });
    } catch (error: any) {
      next(error);
    }
  },
);

router.post(
  '/',
  authenticateToken,
  requirePermission([Permissions.EXPENSES_CREATE]),
  upload.single('proof_image') as any,
  validateRequestBody(ExpenseRefundCreateSchema),
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const { purpose, amount } = req.body;
      let proofImageUrl: string | null = null;
      if (req.file) {
        const storageService = getStorageService('expense-proofs');
        proofImageUrl = await storageService.upload(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype,
        );
      }
      const refund = await ExpenseRefundService.createRefund(
        req.user!,
        { purpose, amount },
        proofImageUrl,
      );
      return res.status(201).json({ message: 'Refund request submitted.', refund });
    } catch (error: any) {
      next(error);
    }
  },
);

router.patch(
  '/:id/accountant-review',
  authenticateToken,
  requireAuthz(Permissions.EXPENSES_REVIEW),
  validateRequestBody(ExpenseRefundAccountantReviewSchema),
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { decision, note } = req.body;
      const updated = await ExpenseRefundService.accountantReview(req.user!, id, decision, note);
      return res.status(200).json({ message: 'Review recorded.', refund: updated });
    } catch (error: any) {
      next(error);
    }
  },
);

router.patch(
  '/:id/md-review',
  authenticateToken,
  requireAuthz(Permissions.EXPENSES_MD_APPROVE),
  validateRequestBody(ExpenseRefundMDReviewSchema),
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { decision, note } = req.body;
      const updated = await ExpenseRefundService.mdReview(req.user!, id, decision, note);
      return res.status(200).json({ message: 'MD review recorded.', refund: updated });
    } catch (error: any) {
      next(error);
    }
  },
);

router.patch(
  '/:id/mark-refunded',
  authenticateToken,
  requireAuthz(Permissions.EXPENSES_MARK_REFUNDED),
  validateRequestBody(ExpenseRefundMarkRefundedSchema),
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const updated = await ExpenseRefundService.markRefunded(req.user!, id);
      return res.status(200).json({ message: 'Marked as refunded.', refund: updated });
    } catch (error: any) {
      next(error);
    }
  },
);

router.get(
  '/:id/proof',
  authenticateToken,
  requireAuthz(Permissions.EXPENSES_READ_OWN),
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const proofUrl = await ExpenseRefundService.getProof(req.user!, id);
      const filePath = path.join(process.cwd(), proofUrl);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Proof image file not found on server.' });
      }
      return res.sendFile(filePath);
    } catch (error: any) {
      next(error);
    }
  },
);

export default router;
