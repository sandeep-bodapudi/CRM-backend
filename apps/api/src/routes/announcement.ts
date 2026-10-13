import { logger } from '../utils/logger';
import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { Roles } from '../shared';

const router = Router();

const p = prisma;

// GET /api/v1/announcement
// Publicly fetch the active announcement for the company
router.get('/', async (req, res: Response) => {
  try {
    const company = await p.company.findUnique({
      where: { code: 'RRH' },
      select: {
        announcement_image_url: true,
        announcement_active: true,
      },
    });

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    return res.json({
      imageUrl: company.announcement_image_url,
      active: company.announcement_active,
    });
  } catch (error) {
    logger.error('Error fetching announcement:', error);
    return res.status(500).json({ error: 'Failed to fetch announcement' });
  }
});

// POST /api/v1/announcement
// MD and Admin can update the announcement banner
router.post('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userRoles = req.user!.roles;
    if (!userRoles.includes(Roles.MD) && !userRoles.includes(Roles.ADMIN)) {
      return res.status(403).json({ error: 'Only MD and Admin can update announcements' });
    }

    const { imageUrl, active } = req.body;
    // The image is shown to everyone on the login/dashboard: it must be a web
    // address (or empty to clear it), and the switch must be a real boolean.
    if (
      imageUrl !== undefined &&
      imageUrl !== null &&
      imageUrl !== '' &&
      (typeof imageUrl !== 'string' ||
        imageUrl.length > 2000 ||
        !/^https?:\/\/\S+$/i.test(imageUrl))
    ) {
      return res.status(400).json({ error: 'Image link must start with http:// or https://' });
    }
    if (active !== undefined && typeof active !== 'boolean') {
      return res.status(400).json({ error: 'active must be true or false' });
    }

    const updatedCompany = await p.company.update({
      where: { id: req.user!.companyId },
      data: {
        announcement_image_url: imageUrl,
        announcement_active: active,
      },
    });

    return res.json({
      message: 'Announcement banner updated successfully',
      imageUrl: updatedCompany.announcement_image_url,
      active: updatedCompany.announcement_active,
    });
  } catch (error) {
    logger.error('Error updating announcement:', error);
    return res.status(500).json({ error: 'Failed to update announcement' });
  }
});

export default router;
