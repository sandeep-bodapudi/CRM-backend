import { logger } from '../utils/logger';
import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    // Attempt to run a simple query to verify DB connection
    await prisma.$queryRaw`SELECT 1`;
    // Render sets RENDER_GIT_COMMIT to the commit this deploy was built from, so a
    // release can be confirmed live by reading it here (7 characters is enough).
    res.status(200).json({
      status: 'OK',
      database: 'connected',
      version: (process.env.RENDER_GIT_COMMIT || '').slice(0, 7) || undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Database connection failed:', error);
    res
      .status(503)
      .json({ status: 'ERROR', database: 'disconnected', timestamp: new Date().toISOString() });
  }
});

export default router;
