// Complaint Management API Routes (Phase 14 - Packet 14-1)
// Backend-only, authorized endpoints below. Middleware order: authenticate -> authorize -> validate -> handler.
import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { requireAuthz } from '../middleware/authz';
import { blankAsAbsent } from '../shared/zodHelpers';
import { Permissions } from '../shared';
import { validateRequestBody } from '../middleware/validate';
import { ComplaintService } from '../services/complaint.service';

const router = Router();

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED'] as const;
const CLOSURE_REASONS = [
  'RESOLVED',
  'CUSTOMER_UNSATISFIED',
  'NOT_APPLICABLE',
  'CUSTOMER_WITHDRAWN',
] as const;

const CreateComplaintSchema = z.object({
  customer_id: z.number().int().positive(),
  title: z.string().min(1, 'title is required'),
  category: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  priority: z.enum(PRIORITIES).optional().nullable(),
  booking_id: z.number().int().positive().optional().nullable(),
  property_id: z.number().int().positive().optional().nullable(),
  assigned_employee_id: z.number().int().positive().optional().nullable(),
});

const UpdateComplaintSchema = z.object({
  title: blankAsAbsent(z.string().min(1).optional()),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  priority: z.enum(PRIORITIES).optional().nullable(),
});

const AssignComplaintSchema = z.object({ employee_id: z.number().int().positive() });
const StatusSchema = z.object({ status: z.enum(STATUSES) });
const ResolveSchema = z.object({
  resolution_description: z.string().min(1, 'resolution_description is required'),
});
const CloseSchema = z.object({ closure_reason: z.enum(CLOSURE_REASONS).optional() });

router.use(authenticateToken);

// GET /api/v1/complaints
router.get('/', requireAuthz(Permissions.COMPLAINTS_READ as any), async (req: any, res, next) => {
  try {
    // Previously had no limit at all, so every complaint ever filed for this
    // company was fetched every page load. ComplaintManagement.tsx already
    // handles both a bare array and `{complaints, total}` (`Array.isArray(data)
    // ? data : data.complaints`), so this response shape change is backward
    // compatible with no frontend edit needed.
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 2000, 1), 100000);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const complaints = await ComplaintService.list(
      req.user,
      {
        status: req.query.status as string | undefined,
        priority: req.query.priority as string | undefined,
        category: req.query.category as string | undefined,
        customer_id: req.query.customer_id ? parseInt(req.query.customer_id, 10) : undefined,
      },
      limit,
      offset,
    );
    res.json(complaints);
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/complaints/:id
router.get(
  '/:id',
  requireAuthz(Permissions.COMPLAINTS_READ as any),
  async (req: any, res, next) => {
    try {
      const complaint = await ComplaintService.getById(req.user, parseInt(req.params.id, 10));
      res.json(complaint);
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/v1/complaints
router.post(
  '/',
  requireAuthz(Permissions.COMPLAINTS_CREATE as any),
  validateRequestBody(CreateComplaintSchema),
  async (req: any, res, next) => {
    try {
      const complaint = await ComplaintService.create(req.user, req.body);
      res.status(201).json(complaint);
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /api/v1/complaints/:id
router.patch(
  '/:id',
  requireAuthz(Permissions.COMPLAINTS_UPDATE as any),
  validateRequestBody(UpdateComplaintSchema),
  async (req: any, res, next) => {
    try {
      const complaint = await ComplaintService.update(
        req.user,
        parseInt(req.params.id, 10),
        req.body,
      );
      res.json(complaint);
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /api/v1/complaints/:id/status
router.patch(
  '/:id/status',
  requireAuthz(Permissions.COMPLAINTS_UPDATE as any),
  validateRequestBody(StatusSchema),
  async (req: any, res, next) => {
    try {
      const complaint = await ComplaintService.changeStatus(
        req.user,
        parseInt(req.params.id, 10),
        req.body.status,
      );
      res.json(complaint);
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /api/v1/complaints/:id/assign
router.patch(
  '/:id/assign',
  requireAuthz(Permissions.COMPLAINTS_ASSIGN as any),
  validateRequestBody(AssignComplaintSchema),
  async (req: any, res, next) => {
    try {
      const complaint = await ComplaintService.assign(
        req.user,
        parseInt(req.params.id, 10),
        req.body.employee_id,
      );
      res.json(complaint);
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /api/v1/complaints/:id/resolve
router.patch(
  '/:id/resolve',
  requireAuthz(Permissions.COMPLAINTS_RESOLVE as any),
  validateRequestBody(ResolveSchema),
  async (req: any, res, next) => {
    try {
      const complaint = await ComplaintService.resolve(
        req.user,
        parseInt(req.params.id, 10),
        req.body.resolution_description,
      );
      res.json(complaint);
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /api/v1/complaints/:id/close
router.patch(
  '/:id/close',
  requireAuthz(Permissions.COMPLAINTS_CLOSE as any),
  validateRequestBody(CloseSchema),
  async (req: any, res, next) => {
    try {
      const complaint = await ComplaintService.close(
        req.user,
        parseInt(req.params.id, 10),
        req.body.closure_reason,
      );
      res.json(complaint);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
