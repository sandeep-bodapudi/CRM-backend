import { logger } from '../utils/logger';
import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { Roles } from '../shared';
import { memoryUpload, getStorageService } from '../services/storage.service';

const router = Router();

router.use(authenticateToken);

const isManager = (roles: string[]) => roles.includes(Roles.MD) || roles.includes(Roles.ADMIN);

// POST /api/v1/offers/upload-image — MD/Admin only. Uploads an image file to
// storage and returns its public URL, for the "Add New Offer" form to then
// POST /offers with — kept as a separate step (rather than accepting the
// file directly on offer creation) so the same endpoint also covers
// re-uploading an image for an existing offer from the admin UI.
router.post('/upload-image', async (req: AuthenticatedRequest, res: Response) => {
  if (!isManager(req.user!.roles)) {
    return res.status(403).json({ error: 'Only MD and Admin can manage offers' });
  }
  (memoryUpload.single('image') as any)(req, res, async (err: any) => {
    if (err) {
      logger.error('Multer error (offer image upload):', err);
      return res.status(400).json({ error: err.message || 'File upload failed' });
    }
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'No image file provided.' });
      }
      const storageService = getStorageService('offers');
      const imageUrl = await storageService.upload(file.buffer, file.originalname, file.mimetype);
      return res.status(201).json({ image_url: imageUrl });
    } catch (error) {
      logger.error('Error uploading offer image:', error);
      return res.status(500).json({ error: 'Failed to upload image' });
    }
  });
});

// GET /api/v1/offers
// Active offers targeted at the caller's audience, for the dashboard carousel.
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const isChannelPartner = req.user!.roles.includes(Roles.CHANNEL_PARTNER_MANAGER);
    const audiences = isChannelPartner ? ['ALL', 'CHANNEL_PARTNERS'] : ['ALL', 'EMPLOYEES'];

    const offers = await prisma.offer.findMany({
      where: {
        company_id: req.user!.companyId,
        active: true,
        audience: { in: audiences as any },
      },
      orderBy: { sort_order: 'asc' },
      select: { id: true, image_url: true },
    });

    return res.json({ offers });
  } catch (error) {
    logger.error('Error fetching offers:', error);
    return res.status(500).json({ error: 'Failed to fetch offers' });
  }
});

// GET /api/v1/offers/admin — full list (incl. inactive), MD/Admin only, for the management UI.
router.get('/admin', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isManager(req.user!.roles)) {
      return res.status(403).json({ error: 'Only MD and Admin can manage offers' });
    }
    const offers = await prisma.offer.findMany({
      where: { company_id: req.user!.companyId },
      orderBy: { sort_order: 'asc' },
    });
    return res.json({ offers });
  } catch (error) {
    logger.error('Error fetching offers (admin):', error);
    return res.status(500).json({ error: 'Failed to fetch offers' });
  }
});

// POST /api/v1/offers
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isManager(req.user!.roles)) {
      return res.status(403).json({ error: 'Only MD and Admin can manage offers' });
    }
    const { image_url, audience, active, sort_order } = req.body;
    if (!image_url) {
      return res.status(400).json({ error: 'image_url is required' });
    }
    const validAudiences = ['ALL', 'EMPLOYEES', 'CHANNEL_PARTNERS'];
    if (audience && !validAudiences.includes(audience)) {
      return res.status(400).json({ error: 'Invalid audience' });
    }

    const offer = await prisma.offer.create({
      data: {
        company_id: req.user!.companyId,
        image_url,
        audience: audience || 'ALL',
        active: active !== undefined ? Boolean(active) : true,
        sort_order: sort_order !== undefined ? parseInt(sort_order, 10) : 0,
      },
    });
    return res.status(201).json({ offer });
  } catch (error) {
    logger.error('Error creating offer:', error);
    return res.status(500).json({ error: 'Failed to create offer' });
  }
});

// PATCH /api/v1/offers/:id
router.patch('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isManager(req.user!.roles)) {
      return res.status(403).json({ error: 'Only MD and Admin can manage offers' });
    }
    const id = parseInt(req.params.id, 10);
    const existing = await prisma.offer.findFirst({
      where: { id, company_id: req.user!.companyId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    const { image_url, audience, active, sort_order } = req.body;
    const validAudiences = ['ALL', 'EMPLOYEES', 'CHANNEL_PARTNERS'];
    if (audience && !validAudiences.includes(audience)) {
      return res.status(400).json({ error: 'Invalid audience' });
    }

    const offer = await prisma.offer.update({
      where: { id },
      data: {
        ...(image_url !== undefined ? { image_url } : {}),
        ...(audience !== undefined ? { audience } : {}),
        ...(active !== undefined ? { active: Boolean(active) } : {}),
        ...(sort_order !== undefined ? { sort_order: parseInt(sort_order, 10) } : {}),
      },
    });
    return res.json({ offer });
  } catch (error) {
    logger.error('Error updating offer:', error);
    return res.status(500).json({ error: 'Failed to update offer' });
  }
});

// DELETE /api/v1/offers/:id
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isManager(req.user!.roles)) {
      return res.status(403).json({ error: 'Only MD and Admin can manage offers' });
    }
    const id = parseInt(req.params.id, 10);
    const existing = await prisma.offer.findFirst({
      where: { id, company_id: req.user!.companyId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Offer not found' });
    }
    await prisma.offer.delete({ where: { id } });
    return res.json({ message: 'Offer deleted' });
  } catch (error) {
    logger.error('Error deleting offer:', error);
    return res.status(500).json({ error: 'Failed to delete offer' });
  }
});

export default router;
