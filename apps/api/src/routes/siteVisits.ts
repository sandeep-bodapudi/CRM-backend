import { logger } from '../utils/logger';
import { Router, Response, NextFunction } from 'express';
import { authenticateToken, AuthenticatedRequest, requirePermission } from '../middleware/auth';
import { z } from 'zod';
import multer from 'multer';
import { Permissions } from '../shared';
import { can } from '../authz/authorization';
import { SiteVisitPolicy } from '../policies/siteVisit.policy';
import { processImageBuffer, getStorageService } from '../services/storage.service';
import {
  SiteVisitCreateSchema,
  SiteVisitAcceptSchema,
  SiteVisitReassignSchema,
  SiteVisitAssignAgentSchema,
  SiteVisitEscalateSchema,
  SiteVisitRescheduleSchema,
  SiteVisitReconfirmSchema,
  SiteVisitCompleteSchema,
  SiteVisitCancelConfirmSchema,
  EmptyBodySchema,
} from '../shared';
import { validateRequestBody } from '../middleware/validate';
import { SiteVisitService } from '../services/siteVisit.service';
import { LeadService } from '../services/lead.service';
import { prisma } from '../lib/prisma';

const router = Router();

// GET /api/v1/site-visits - List site visits (role and company-aware)
router.get(
  '/',
  authenticateToken,
  requirePermission([Permissions.SITE_VISITS_READ]),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { status, leadId, escalated } = req.query;
      const filters = {
        status: status as string,
        leadId: leadId as string,
        escalated: escalated === 'true',
      };

      const visits = await SiteVisitService.listVisits(req.user!, filters);
      return res.status(200).json({ visits });
    } catch (error: any) {
      logger.error('Fetch site visits error:', error);
      next(error);
    }
  },
);

// GET /api/v1/site-visits/:id/history - Get reassignment/routing history
router.get(
  '/:id/history',
  authenticateToken,
  requirePermission([Permissions.SITE_VISITS_READ]),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const visitId = parseInt(req.params.id, 10);
      if (isNaN(visitId))
        return next({ name: 'AppError', statusCode: 400, message: 'Invalid ID format' });

      // First check if user can access the visit
      const filters = { leadId: '' }; // Just to pass valid type
      // Check access implicitly by fetching from db directly but constrained to company
      const visit = await prisma.siteVisitBooking.findFirst({
        where: { id: visitId, lead: { company_id: req.user!.companyId } },
      });
      if (!visit) throw { status: 404, message: 'Site visit not found' };

      const history = await prisma.siteVisitReassignment.findMany({
        where: { visit_id: visitId },
        include: {
          from_employee: { select: { id: true, full_name: true, employee_code: true } },
          to_employee: { select: { id: true, full_name: true, employee_code: true } },
        },
        orderBy: { created_at: 'asc' },
      });

      return res.status(200).json({ history });
    } catch (error: any) {
      logger.error('Fetch site visit history error:', error);
      next(error);
    }
  },
);

// POST /api/v1/site-visits - Telecaller books site visit (→ REQUESTED → PENDING_ACCEPTANCE)
router.post(
  '/',
  authenticateToken,
  requirePermission([Permissions.SITE_VISITS_CREATE]),
  validateRequestBody(SiteVisitCreateSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const booking = await SiteVisitService.bookVisit(req.user!, req.body);
      return res.status(201).json({
        message: `Site visit ${booking.booking_code} booked! Awaiting project PM acceptance.`,
        booking,
      });
    } catch (error: any) {
      logger.error('Book site visit error:', error);
      next(error);
    }
  },
);

// POST /api/v1/site-visits/walk-in - record a visit the customer made on their own
// (already completed): { lead_id | customer_name + phone, project_id, visit_date, rating, feedback_notes }
const WalkInSchema = z
  .object({
    lead_id: z.number().int().positive().optional(),
    customer_name: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(20).optional(),
    project_id: z.number().int().positive(),
    visit_date: z.string().min(1),
    rating: z.string().min(1),
    feedback_notes: z.string().trim().max(1000),
  })
  .refine((v) => v.lead_id || (v.customer_name && v.phone), {
    message: 'Pick a lead, or enter the customer name and phone',
  });

router.post(
  '/walk-in',
  authenticateToken,
  requirePermission([Permissions.SITE_VISITS_CREATE]),
  validateRequestBody(WalkInSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await SiteVisitService.recordWalkIn(req.user!, req.body);
      return res.status(201).json({
        message: `Walk-in ${result.visit.booking_code} recorded.`,
        ...result,
      });
    } catch (error: any) {
      logger.error('Record walk-in error:', error);
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// Visit proof photo (F-5). Uploaded from the phone while the visit is running,
// re-encoded (which also drops the location data in the photo's metadata),
// stored outside the publicly served folders and shown only to people who can
// see the visit.
// ---------------------------------------------------------------------------
const PROOF_PREFIX = '/uploads/visit-proofs/';
const proofUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error('Upload a JPG, PNG or WebP photo.'), { statusCode: 400 }));
  },
});

// POST /api/v1/site-visits/:id/proof-photo - multipart field "photo"
router.post(
  '/:id/proof-photo',
  authenticateToken,
  requirePermission([Permissions.SITE_VISITS_COMPLETE]),
  proofUpload.single('photo'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const visitId = parseInt(req.params.id, 10);
      if (isNaN(visitId)) return res.status(400).json({ error: 'Invalid ID format' });
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'Choose a photo to upload.' });

      const visit = await prisma.siteVisitBooking.findFirst({
        where: { id: visitId, lead: { company_id: req.user!.companyId } },
        include: { lead: true },
      });
      if (!visit) return res.status(404).json({ error: 'Site visit booking not found' });
      if (!can(req.user!, Permissions.SITE_VISITS_COMPLETE, visit)) {
        return res
          .status(403)
          .json({ error: 'Only the person running this visit can add its photo.' });
      }
      if (!['ACTIVE', 'COMPLETED'].includes(visit.status)) {
        return res.status(409).json({ error: 'Start the visit before adding its photo.' });
      }

      let processed;
      try {
        processed = await processImageBuffer(file.buffer);
      } catch {
        return res.status(400).json({ error: 'That file is not a valid photo.' });
      }
      const storage = getStorageService('visit-proofs');
      const url = await storage.upload(processed.processedBuffer, processed.filename, 'image/webp');
      await prisma.siteVisitBooking.update({
        where: { id: visitId },
        data: { proof_photo_url: url },
      });
      if (visit.proof_photo_url && visit.proof_photo_url.startsWith(PROOF_PREFIX)) {
        await storage
          .delete(visit.proof_photo_url)
          .catch((e: unknown) => logger.warn('Could not delete the replaced visit photo:', e));
      }
      return res.status(201).json({ message: 'Photo saved', proof_photo_url: url });
    } catch (error: any) {
      logger.error('Upload visit photo error:', error);
      next(error);
    }
  },
);

// GET /api/v1/site-visits/:id/proof-photo - the photo, for people who can see this visit
router.get(
  '/:id/proof-photo',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const visitId = parseInt(req.params.id, 10);
      if (isNaN(visitId)) return res.status(400).json({ error: 'Invalid ID format' });
      const visit = await prisma.siteVisitBooking.findFirst({
        where: { id: visitId, ...SiteVisitPolicy.canList(req.user!) },
        select: { proof_photo_url: true },
      });
      if (!visit || !visit.proof_photo_url || !visit.proof_photo_url.startsWith(PROOF_PREFIX)) {
        return res.status(404).json({ error: 'No photo for this visit.' });
      }
      const bytes = await getStorageService('visit-proofs').download(visit.proof_photo_url);
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.status(200).send(bytes);
    } catch (error) {
      logger.error('Fetch visit photo error:', error);
      return res.status(404).json({ error: 'The photo could not be loaded.' });
    }
  },
);

// POST /api/v1/site-visits/:id/accept - PM/Agent accepts the routed visit
router.post(
  '/:id/accept',
  authenticateToken,
  requirePermission([Permissions.SITE_VISITS_ACCEPT]),
  validateRequestBody(SiteVisitAcceptSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const visitId = parseInt(req.params.id, 10);
      if (isNaN(visitId))
        return next({ name: 'AppError', statusCode: 400, message: 'Invalid ID format' });
      const { notes } = req.body;
      const visit = await SiteVisitService.acceptVisit(req.user!, visitId, notes);
      return res.status(200).json({
        message: `Site visit ${visit.booking_code} accepted!`,
        visit,
      });
    } catch (error: any) {
      logger.error('Accept site visit error:', error);
      next(error);
    }
  },
);

// POST /api/v1/site-visits/:id/reassign - Open reassignment chain (logged, §2)
router.post(
  '/:id/reassign',
  authenticateToken,
  requirePermission([Permissions.SITE_VISITS_ASSIGN_AGENT]),
  validateRequestBody(SiteVisitReassignSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const visitId = parseInt(req.params.id, 10);
      if (isNaN(visitId))
        return next({ name: 'AppError', statusCode: 400, message: 'Invalid ID format' });
      const { to_employee_id, reason } = req.body;
      const visit = await SiteVisitService.reassignVisit(
        req.user!,
        visitId,
        to_employee_id,
        reason,
      );
      return res.status(200).json({
        message: `Site visit ${visit.booking_code} reassigned.`,
        visit,
      });
    } catch (error: any) {
      logger.error('Reassign site visit error:', error);
      next(error);
    }
  },
);

// POST /api/v1/site-visits/:id/assign-agent - the PM names who runs an accepted visit
// ({ agent_id } for a colleague, { self: true } for "I'll do this visit myself")
router.post(
  '/:id/assign-agent',
  authenticateToken,
  requirePermission([Permissions.SITE_VISITS_ASSIGN_AGENT]),
  validateRequestBody(SiteVisitAssignAgentSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const visitId = parseInt(req.params.id, 10);
      if (isNaN(visitId))
        return next({ name: 'AppError', statusCode: 400, message: 'Invalid ID format' });
      const visit = await SiteVisitService.assignAgent(req.user!, visitId, req.body);
      return res.status(200).json({
        message: `Site visit ${visit.booking_code} agent assigned.`,
        visit,
      });
    } catch (error: any) {
      logger.error('Assign agent error:', error);
      next(error);
    }
  },
);

// POST /api/v1/site-visits/:id/escalate - No PM/Agent left → Marketing Director
router.post(
  '/:id/escalate',
  authenticateToken,
  requirePermission([Permissions.SITE_VISITS_ASSIGN_AGENT]),
  validateRequestBody(SiteVisitEscalateSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const visitId = parseInt(req.params.id, 10);
      if (isNaN(visitId))
        return next({ name: 'AppError', statusCode: 400, message: 'Invalid ID format' });
      const { reason } = req.body;
      const visit = await SiteVisitService.escalateVisit(req.user!, visitId, reason);
      return res.status(200).json({
        message: `Site visit ${visit.booking_code} escalated to Marketing Director.`,
        visit,
      });
    } catch (error: any) {
      logger.error('Escalate site visit error:', error);
      next(error);
    }
  },
);

// POST /api/v1/site-visits/:id/reconfirm-customer - Day-before reconfirmation call
router.post(
  '/:id/reconfirm-customer',
  authenticateToken,
  requirePermission([Permissions.SITE_VISITS_VERIFY]),
  validateRequestBody(EmptyBodySchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const visitId = parseInt(req.params.id, 10);
      if (isNaN(visitId))
        return next({ name: 'AppError', statusCode: 400, message: 'Invalid ID format' });
      const visit = await SiteVisitService.reconfirmCustomer(req.user!, visitId);
      return res.status(200).json({
        message: `Reconfirmation call initiated for ${visit.booking_code}.`,
        visit,
      });
    } catch (error: any) {
      logger.error('Reconfirm-customer error:', error);
      next(error);
    }
  },
);

// POST /api/v1/site-visits/:id/reschedule - Customer requested reschedule (date/property)
router.post(
  '/:id/reschedule',
  authenticateToken,
  requirePermission([Permissions.SITE_VISITS_VERIFY]),
  validateRequestBody(SiteVisitRescheduleSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const visitId = parseInt(req.params.id, 10);
      if (isNaN(visitId))
        return next({ name: 'AppError', statusCode: 400, message: 'Invalid ID format' });
      const visit = await SiteVisitService.rescheduleVisit(req.user!, visitId, req.body);
      return res.status(200).json({
        message: `Reschedule requested for ${visit.booking_code}. Awaiting PM reconfirmation.`,
        visit,
      });
    } catch (error: any) {
      logger.error('Reschedule error:', error);
      next(error);
    }
  },
);

// POST /api/v1/site-visits/:id/pm-reconfirm - PM confirms or releases after reschedule
router.post(
  '/:id/pm-reconfirm',
  authenticateToken,
  requirePermission([Permissions.SITE_VISITS_ASSIGN_AGENT]),
  validateRequestBody(SiteVisitReconfirmSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const visitId = parseInt(req.params.id, 10);
      if (isNaN(visitId))
        return next({ name: 'AppError', statusCode: 400, message: 'Invalid ID format' });
      const { release } = req.body;
      const visit = await SiteVisitService.pmReconfirm(req.user!, visitId, !!release);
      return res.status(200).json({
        message: release
          ? `Site visit ${visit.booking_code} released back to project PM for acceptance.`
          : `Site visit ${visit.booking_code} reconfirmed by PM.`,
        visit,
      });
    } catch (error: any) {
      logger.error('PM reconfirm error:', error);
      next(error);
    }
  },
);

// POST /api/v1/site-visits/:id/confirm - PENDING_CUSTOMER_RECONFIRMATION / RESCHEDULE_REQUESTED → CONFIRMED
router.post(
  '/:id/confirm',
  authenticateToken,
  requirePermission([Permissions.SITE_VISITS_VERIFY]),
  validateRequestBody(EmptyBodySchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const visitId = parseInt(req.params.id, 10);
      if (isNaN(visitId))
        return next({ name: 'AppError', statusCode: 400, message: 'Invalid ID format' });
      const visit = await SiteVisitService.confirmVisit(req.user!, visitId);
      return res.status(200).json({
        message: `Site visit ${visit.booking_code} confirmed.`,
        visit,
      });
    } catch (error: any) {
      logger.error('Confirm visit error:', error);
      next(error);
    }
  },
);

// POST /api/v1/site-visits/:id/start - CONFIRMED → ACTIVE (day-of)
router.post(
  '/:id/start',
  authenticateToken,
  requirePermission([Permissions.SITE_VISITS_COMPLETE]),
  validateRequestBody(EmptyBodySchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const visitId = parseInt(req.params.id, 10);
      if (isNaN(visitId))
        return next({ name: 'AppError', statusCode: 400, message: 'Invalid ID format' });
      const visit = await SiteVisitService.startVisit(req.user!, visitId);
      return res.status(200).json({
        message: `Site visit ${visit.booking_code} is now ACTIVE.`,
        visit,
      });
    } catch (error: any) {
      logger.error('Start visit error:', error);
      next(error);
    }
  },
);

// POST /api/v1/site-visits/:id/complete - ACTIVE → COMPLETED with per-property outcomes (§2)
router.post(
  '/:id/complete',
  authenticateToken,
  requirePermission([Permissions.SITE_VISITS_COMPLETE]),
  validateRequestBody(SiteVisitCompleteSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const visitId = parseInt(req.params.id, 10);
      if (isNaN(visitId))
        return next({ name: 'AppError', statusCode: 400, message: 'Invalid ID format' });
      const { outcomes, feedback_notes, proof_photo_url, rating } = req.body;
      // The photo is uploaded separately (POST /:id/proof-photo); a URL typed into
      // the request is ignored.
      void proof_photo_url;
      const visit = await SiteVisitService.completeVisit(
        req.user!,
        visitId,
        outcomes,
        feedback_notes,
        undefined,
        rating,
      );

      // §1: SITE_VISIT_COMPLETED → NEGOTIATION (any INTERESTED) or DROPPED
      // (all NOT_INTERESTED). completeVisit() computes the branch but never
      // advanced Lead.status itself — its own comment says "the caller (route)
      // will advance the Lead accordingly", but nothing here ever did, so
      // every lead going through Site Visits (as opposed to Demo, which does
      // this correctly via its own PATCH /leads/:id/status call) was
      // permanently stuck at SITE_VISIT_SCHEDULED, unable to ever reach
      // Negotiation/Booking/Booked. Mirrors that DEMO_COMPLETED path here.
      //
      // Whoever has site_visits.complete (typically Agent) usually lacks
      // leads.update, and is usually not the lead's own assignee either —
      // this is a system-triggered consequence of an already-authorized
      // action (completing the visit), not a new independent lead edit
      // initiated on the actor's own authority, so the permission check is
      // explicitly skipped for just this call (see updateLeadStatus's opts
      // doc comment).
      const outcomeBranch = (visit as any)._outcomeBranch as 'NEGOTIATE' | 'DROP' | undefined;
      // Surfaced to the caller when the auto-advance can't complete (e.g. no
      // property outcome was recorded, so there's nothing to base an
      // Opportunity's expected_value on) — this used to be silently
      // swallowed, so a telecaller had no idea the lead was still stuck at
      // SITE_VISIT_COMPLETED after seeing a plain "completed" success toast.
      let cascadeNote: string | undefined;
      if (outcomeBranch) {
        try {
          await LeadService.updateLeadStatus(
            req.user!,
            visit.lead_id,
            'SITE_VISIT_COMPLETED',
            undefined,
            undefined,
            { skipPermissionCheck: true },
          );
          await LeadService.updateLeadStatus(
            req.user!,
            visit.lead_id,
            outcomeBranch === 'DROP' ? 'DROPPED' : 'NEGOTIATION',
            outcomeBranch === 'DROP'
              ? 'Auto-dropped: every property outcome from the completed site visit was Not Interested.'
              : 'Auto-advanced to Negotiation: the completed site visit had at least one Interested property outcome.',
            // Any -> DROPPED requires a non-empty exit_reason (lead.workflow.ts
            // §1 row 10) — NO_MATCHING_INVENTORY is the closest fit for "visited,
            // but nothing shown matched what they wanted."
            outcomeBranch === 'DROP' ? { exit_reason: 'NO_MATCHING_INVENTORY' } : undefined,
            { skipPermissionCheck: true },
          );
        } catch (cascadeError: any) {
          logger.error(
            `[site-visits/complete] Lead ${visit.lead_id} cascade failed after visit ${visit.booking_code} completed:`,
            cascadeError,
          );
          cascadeNote =
            outcomeBranch === 'DROP'
              ? 'Visit recorded, but the lead could not be auto-dropped — you can move it manually from the lead detail page.'
              : "Visit recorded, but couldn't auto-advance to Negotiation (usually because no property was marked Interested). Attach a property outcome, or move the lead forward manually.";
        }
      }

      return res.status(200).json({
        message: `Site visit ${visit.booking_code} completed! Outcomes recorded.`,
        visit,
        cascadeNote,
      });
    } catch (error: any) {
      logger.error('Complete site visit error:', error);
      next(error);
    }
  },
);

// POST /api/v1/site-visits/:id/cancel - any active state → CANCELLED
router.post(
  '/:id/cancel',
  authenticateToken,
  requirePermission([Permissions.SITE_VISITS_COMPLETE]),
  validateRequestBody(EmptyBodySchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const visitId = parseInt(req.params.id, 10);
      if (isNaN(visitId))
        return next({ name: 'AppError', statusCode: 400, message: 'Invalid ID format' });
      const { reason } = req.body || {};
      const visit = await SiteVisitService.cancelVisit(req.user!, visitId, reason);
      return res.status(200).json({
        message: `Site visit ${visit.booking_code} cancelled.`,
        visit,
      });
    } catch (error: any) {
      logger.error('Cancel site visit error:', error);
      next(error);
    }
  },
);

// ==========================================
// Phase D: Hold/Cancel Flow Endpoints
// ==========================================

// POST /api/v1/site-visits/:id/hold - Reconfirmation fails → ON_HOLD
router.post(
  '/:id/hold',
  authenticateToken,
  requirePermission([Permissions.SITE_VISITS_VERIFY]),
  validateRequestBody(EmptyBodySchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const visitId = parseInt(req.params.id, 10);
      if (isNaN(visitId))
        return next({ name: 'AppError', statusCode: 400, message: 'Invalid ID format' });
      const visit = await SiteVisitService.holdVisit(req.user!, visitId);
      return res.status(200).json({
        message: `Site visit ${visit.booking_code} placed on hold.`,
        visit,
      });
    } catch (error: any) {
      logger.error('Hold site visit error:', error);
      next(error);
    }
  },
);

// POST /api/v1/site-visits/:id/initiate-cancel - Telecaller requests PM cross-check
router.post(
  '/:id/initiate-cancel',
  authenticateToken,
  requirePermission([Permissions.SITE_VISITS_VERIFY]),
  validateRequestBody(EmptyBodySchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const visitId = parseInt(req.params.id, 10);
      if (isNaN(visitId))
        return next({ name: 'AppError', statusCode: 400, message: 'Invalid ID format' });
      const visit = await SiteVisitService.initiateCancellation(req.user!, visitId);
      return res.status(200).json({
        message: `Cancellation cross-check initiated for ${visit.booking_code}.`,
        visit,
      });
    } catch (error: any) {
      logger.error('Initiate cancel site visit error:', error);
      next(error);
    }
  },
);

// POST /api/v1/site-visits/:id/reject-cancel - PM indicates customer responded
router.post(
  '/:id/reject-cancel',
  authenticateToken,
  requirePermission([Permissions.SITE_VISITS_ASSIGN_AGENT]),
  validateRequestBody(EmptyBodySchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const visitId = parseInt(req.params.id, 10);
      if (isNaN(visitId))
        return next({ name: 'AppError', statusCode: 400, message: 'Invalid ID format' });
      const visit = await SiteVisitService.rejectCancellation(req.user!, visitId);
      return res.status(200).json({
        message: `Cancellation rejected for ${visit.booking_code}. Reverted to active reconfirmation.`,
        visit,
      });
    } catch (error: any) {
      logger.error('Reject cancel site visit error:', error);
      next(error);
    }
  },
);

// POST /api/v1/site-visits/:id/confirm-cancel - PM explicitly confirms cancellation
router.post(
  '/:id/confirm-cancel',
  authenticateToken,
  requirePermission([Permissions.SITE_VISITS_ASSIGN_AGENT]),
  validateRequestBody(SiteVisitCancelConfirmSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const visitId = parseInt(req.params.id, 10);
      if (isNaN(visitId))
        return next({ name: 'AppError', statusCode: 400, message: 'Invalid ID format' });
      const { reason } = req.body;
      const visit = await SiteVisitService.confirmCancellation(req.user!, visitId, reason);
      return res.status(200).json({
        message: `Site visit ${visit.booking_code} cancellation confirmed.`,
        visit,
      });
    } catch (error: any) {
      logger.error('Confirm cancel site visit error:', error);
      next(error);
    }
  },
);

export default router;
