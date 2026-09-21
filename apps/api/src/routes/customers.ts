import { logger } from '../utils/logger';
import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { requireAuthz } from '../middleware/authz';
import {
  Roles,
  Permissions,
  CustomerCreateSchema,
  CustomerUpdateSchema,
  CustomerKycWriteSchema,
} from '../shared';
import { validateRequestBody } from '../middleware/validate';
import { CustomerService, AppError } from '../services/customer.service';
import { KycService } from '../services/kyc.service';
import { prisma } from '../lib/prisma';

const router = Router();

const handleServiceError = (error: any, res: Response) => {
  if (error instanceof AppError) {
    return res.status(error.statusCode || 400).json({ error: error.message });
  }
  logger.error('Unhandled route error:', error);
  return res.status(500).json({ error: 'Internal Server Error' });
};

// GET /api/v1/customers - Fetch customers list
router.get(
  '/',
  authenticateToken,
  requireAuthz(Permissions.CUSTOMERS_READ),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Default was 50 with a 100 max and no `total` in the response, and the
      // frontend's own list fetch (CustomerManagement.tsx) never passes a
      // limit override — every booking creates a customer record, so this
      // silently caps at 50-100 with zero indication of truncation. Same bug
      // class as leads, fixed the same way.
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 2000, 1), 100000);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

      const { customers, total } = await CustomerService.getCustomers(req.user!, limit, offset);
      return res.status(200).json({ customers, total, pagination: { limit, offset, total } });
    } catch (error: any) {
      return handleServiceError(error, res);
    }
  },
);

// GET /api/v1/customers/:id - Fetch customer details
router.get(
  '/:id',
  authenticateToken,
  requireAuthz(Permissions.CUSTOMERS_READ),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const customer = await CustomerService.getCustomerById(req.user!, parseInt(req.params.id));
      return res.status(200).json({ customer });
    } catch (error: any) {
      return handleServiceError(error, res);
    }
  },
);

// POST /api/v1/customers - Create new customer
router.post(
  '/',
  authenticateToken,
  requireAuthz(Permissions.CUSTOMERS_CREATE),
  validateRequestBody(CustomerCreateSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await CustomerService.createCustomer(req.user!, req.body);
      return res.status(201).json({
        message: 'Customer created successfully',
        ...result,
      });
    } catch (error: any) {
      return handleServiceError(error, res);
    }
  },
);

// PATCH /api/v1/customers/:id - Update existing customer
router.patch(
  '/:id',
  authenticateToken,
  requireAuthz(Permissions.CUSTOMERS_UPDATE),
  validateRequestBody(CustomerUpdateSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await CustomerService.updateCustomer(
        req.user!,
        parseInt(req.params.id),
        req.body,
      );
      return res.status(200).json({
        message: 'Customer updated successfully',
        ...result,
      });
    } catch (error: any) {
      return handleServiceError(error, res);
    }
  },
);

// PUT /api/v1/customers/:id/kyc - Write/update customer KYC (Phase 11 Packet 3C)
// CRM-internal write path. PAN/Aadhaar are encrypted at rest and NEVER leave CRMS.
router.put(
  '/:id/kyc',
  authenticateToken,
  requireAuthz(Permissions.CUSTOMERS_KYC_WRITE, async (req) => {
    return await prisma.customer.findFirst({
      where: { id: parseInt(req.params.id, 10), company_id: req.user!.companyId },
    });
  }),
  validateRequestBody(CustomerKycWriteSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await KycService.writeCustomerKyc(
        req.user!,
        parseInt(req.params.id),
        req.body,
      );
      return res.status(200).json({
        message: 'Customer KYC updated successfully',
        customer: result,
      });
    } catch (error: any) {
      return handleServiceError(error, res);
    }
  },
);

export default router;
