import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { validateRequestBody } from '../middleware/validate';
import { z } from 'zod';
import { PMRoutingService, AppError } from '../services/pm-routing.service';
import { Roles } from '../shared';

const router = Router();

router.use(authenticateToken);

// Middleware to ensure user is MD or Admin
const requireAdminOrMD = (req: any, res: any, next: any) => {
  const roles = req.user?.roles || [];
  if (!roles.includes(Roles.MD) && !roles.includes(Roles.ADMIN)) {
    return next(new AppError(403, 'Forbidden: Only MD or Admin can manage PM locations'));
  }
  next();
};

router.use(requireAdminOrMD);

router.get('/', async (req: any, res: any, next: any) => {
  try {
    const assignments = await PMRoutingService.getAssignments(req.user.companyId || 1);
    res.json(assignments);
  } catch (error) {
    next(error);
  }
});

const PmRoutingSchema = z.object({
  pm_id: z.number().int().positive(),
  location: z.string().trim().min(2).max(100),
  level: z.string().trim().max(30).optional(),
});

router.post('/', validateRequestBody(PmRoutingSchema), async (req: any, res: any, next: any) => {
  try {
    const { pm_id, location, level } = req.body;
    if (!pm_id || !location) {
      throw new AppError(400, 'pm_id and location are required');
    }
    const assignment = await PMRoutingService.assignLocation(
      req.user.companyId || 1,
      pm_id,
      location,
      level,
    );
    res.status(201).json(assignment);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: any, res: any, next: any) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new AppError(400, 'Invalid ID');

    const result = await PMRoutingService.removeAssignment(req.user.companyId || 1, id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
