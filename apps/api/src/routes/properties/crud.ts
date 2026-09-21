import { logger } from '../../utils/logger';
import { Response, NextFunction, Router } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth';
import { requireAuthz } from '../../middleware/authz';
import {
  PropertyCreateSchema,
  PropertyDraftSchema,
  PropertyUpdateSchema,
  PropertyReassignSchema,
  Permissions,
} from '../../shared';
import { validateRequestBody } from '../../middleware/validate';
import { PropertyService } from '../../services/property.service';
import { prisma } from '../../lib/prisma';
import { buildPropertyScope } from '../../authz/dataScope';

const router = Router();

// GET /api/v1/properties - List properties with brand and status filtering
router.get(
  '/',
  authenticateToken,
  requireAuthz(Permissions.PROPERTIES_READ),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { brand, category, status, sales_status, project_id, unassigned, dm_executive_id } =
        req.query;
      const filters: {
        brand?: string;
        category?: string;
        status?: string;
        sales_status?: string;
        project_id?: number;
        unassigned?: boolean;
        dm_executive_id?: number;
      } = {
        brand: typeof brand === 'string' ? brand : undefined,
        category: typeof category === 'string' ? category : undefined,
        status: typeof status === 'string' ? status : undefined,
        sales_status: typeof sales_status === 'string' ? sales_status : undefined,
        project_id: typeof project_id === 'string' ? parseInt(project_id, 10) : undefined,
        unassigned: unassigned === 'true',
        dm_executive_id:
          typeof dm_executive_id === 'string' ? parseInt(dm_executive_id, 10) : undefined,
      };

      // DM Executives automatically see only their own assigned-to-polish properties
      const userRoles: string[] = (req.user as any)?.roles || [];
      const isDMExecutiveOnly =
        userRoles.includes('digital marketing executive') &&
        !userRoles.some((r: string) =>
          ['Digital Marketing head(manager)', 'Marketing Director', 'md', 'admin'].includes(r),
        );
      if (isDMExecutiveOnly && !filters.dm_executive_id) {
        filters.dm_executive_id = req.user!.employeeId;
      }

      // Default was 20 with a 100 max and no `total` in the response — the
      // frontend's own list fetch (PropertyManagement.tsx) never passes a
      // limit override, and its "All Inventory (N)" header just used the
      // fetched array's own length, so a company with more than 20-100
      // properties (individual plots/units routinely exceed that) had the
      // rest silently invisible while the header looked complete instead of
      // flagging a cutoff. Same bug class as leads, fixed the same way.
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 2000, 1), 100000);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

      const { properties, total } = await PropertyService.listProperties(
        req.user!,
        filters,
        limit,
        offset,
      );
      return res.status(200).json({ properties, total, pagination: { limit, offset, total } });
    } catch (error: any) {
      logger.error('Fetch properties error:', error);
      if (error.status) {
        return next(error);
      }
      return res.status(500).json({ error: 'Failed to fetch properties' });
    }
  },
);

// GET /api/v1/properties/:id - Fetch a single property (was missing entirely;
// the frontend worked around it by hitting the list endpoint with ?project_id=).
router.get(
  '/:id',
  authenticateToken,
  requireAuthz(Permissions.PROPERTIES_READ),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const propertyId = parseInt(req.params.id, 10);
      if (isNaN(propertyId)) {
        return next({ name: 'AppError', statusCode: 400, message: 'Invalid ID format' });
      }
      const property = await PropertyService.getProperty(req.user!, propertyId);
      return res.status(200).json({ property });
    } catch (error: any) {
      logger.error('Fetch property error:', error);
      if (error.status) {
        return next(error);
      }
      return res.status(500).json({ error: 'Failed to fetch property' });
    }
  },
);

// POST /api/v1/properties - Create Property Listing
router.post(
  '/',
  authenticateToken,
  requireAuthz(Permissions.PROPERTIES_CREATE),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (req.body.status === 'DRAFT') {
      return validateRequestBody(PropertyDraftSchema)(req, res, next);
    }
    return validateRequestBody(PropertyCreateSchema)(req, res, next);
  },
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const property = await PropertyService.createProperty(req.user!, req.body);
      return res.status(201).json({
        message:
          req.body.status === 'DRAFT'
            ? 'Draft saved successfully'
            : 'Property listing created and submitted for PM On-Site Verification',
        property,
      });
    } catch (error: any) {
      logger.error('Create property error:', error);
      if (error.status) {
        return next(error);
      }
      return res.status(500).json({ error: 'Failed to create property listing' });
    }
  },
);

// PUT /api/v1/properties/:id - Update Property Listing
router.put(
  '/:id',
  authenticateToken,
  requireAuthz(Permissions.PROPERTIES_UPDATE),
  validateRequestBody(PropertyUpdateSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const propertyId = parseInt(req.params.id, 10);
      if (isNaN(propertyId)) {
        return next({ name: 'AppError', statusCode: 400, message: 'Invalid ID format' });
      }
      const property = await PropertyService.updateProperty(req.user!, propertyId, req.body);
      return res.status(200).json({
        message: 'Property listing updated successfully',
        property,
      });
    } catch (error: any) {
      logger.error('Update property error:', error);
      if (error.status) {
        return next(error);
      }
      return res.status(500).json({ error: 'Failed to update property listing' });
    }
  },
);

// DELETE /api/v1/properties/:id - Archive (soft-delete) a property listing.
// Mirrors DELETE /api/v1/projects/:id's soft CANCELLED transition rather than
// a hard row delete, since Property is referenced by Lead/Booking/SiteVisit/etc.
router.delete(
  '/:id',
  authenticateToken,
  requireAuthz(Permissions.PROPERTIES_DELETE, async (req: AuthenticatedRequest) => {
    const propertyId = parseInt(req.params.id, 10);
    const scope = await buildPropertyScope(req.user!);
    return await prisma.property.findFirst({ where: { id: propertyId, ...scope } });
  }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const propertyId = parseInt(req.params.id, 10);
      if (isNaN(propertyId)) {
        return next({ name: 'AppError', statusCode: 400, message: 'Invalid ID format' });
      }
      const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
      const property = await PropertyService.archiveProperty(req.user!, propertyId, reason);
      return res.status(200).json({ message: 'Property archived successfully', property });
    } catch (error: any) {
      logger.error('Archive property error:', error);
      if (error.status) {
        return next(error);
      }
      return res.status(500).json({ error: 'Failed to archive property' });
    }
  },
);

// POST /api/v1/properties/:id/reassign - Reassign a property's PM, as a distinct
// reasoned action (mandatory reason, dedicated REASSIGNMENT audit entry) —
// mirrors POST /api/v1/projects/:id/reassign. PropertyService.reassignProperty
// already existed but had no route calling it.
router.post(
  '/:id/reassign',
  authenticateToken,
  requireAuthz(Permissions.PROPERTIES_UPDATE, async (req: AuthenticatedRequest) => {
    const propertyId = parseInt(req.params.id, 10);
    const scope = await buildPropertyScope(req.user!);
    return await prisma.property.findFirst({ where: { id: propertyId, ...scope } });
  }),
  validateRequestBody(PropertyReassignSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const propertyId = parseInt(req.params.id, 10);
      const { new_pm_id, reason } = req.body;
      const property = await PropertyService.reassignProperty(
        req.user!,
        propertyId,
        new_pm_id,
        reason,
      );
      return res.status(200).json({ message: 'Property reassigned successfully', property });
    } catch (error: any) {
      logger.error('Reassign property error:', error);
      if (error.status) {
        return next(error);
      }
      return res.status(500).json({ error: 'Failed to reassign property' });
    }
  },
);

export default router;
