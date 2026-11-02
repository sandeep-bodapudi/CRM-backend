// Composer for /api/v1/projects — split into single-responsibility route
// modules under ./projects/, mirroring routes/properties.ts's Phase 4.4 split.
// Every URL, method, and registration order is preserved so server.ts's
// `app.use('/api/v1/projects', projectRoutes)` needed no change.
import { Router, Request, Response, NextFunction } from 'express';
import coreRouter from './projects/core';
import unitsRouter from './projects/units';
import pricingRouter from './projects/pricing';
import amenitiesRouter from './projects/amenities';
import { invalidateProjectListCache } from '../services/project.service';

const router = Router();

// The project list is cached per user for 5 minutes (ProjectService.listProjects).
// Any successful write here — create, edit, submit, review, approve, reject,
// cancel, units — clears it before the response goes out, so the next list
// (the creator's, the MD's pending queue) already shows the change.
router.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'GET') return next();
  const json = res.json.bind(res);
  res.json = (body: any) => {
    if (res.statusCode < 400) invalidateProjectListCache();
    return json(body);
  };
  next();
});

router.use('/', coreRouter);
router.use('/', unitsRouter);
router.use('/', pricingRouter);
router.use('/', amenitiesRouter);

export default router;
