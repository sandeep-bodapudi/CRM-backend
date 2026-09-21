import { logger } from '../../utils/logger';
import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth';
import { requireAuthz } from '../../middleware/authz';
import {
  ProjectCreateSchema,
  ProjectUpdateSchema,
  ProjectReassignSchema,
  ProjectLayoutRegionsSchema,
  ProjectDMPolishSchema,
  ProjectDMVerifyAsIsSchema,
  ProjectMDApprovalSchema,
  Permissions,
} from '../../shared';
import { validateRequestBody } from '../../middleware/validate';
import { ProjectService } from '../../services/project.service';
import { memoryUpload } from '../../services/storage.service';
import { prisma } from '../../lib/prisma';
import { buildProjectScope } from '../../authz/dataScope';

const router = Router();

const p = prisma;

// PROJECTS_UPDATE has no "!resource => true" fallback in the can() engine
// (see authz/authorization.ts) — it requires a resource to evaluate
// ProjectPolicy.canUpdate's company/PM-assignment checks, so every
// PROJECTS_UPDATE-gated route below must pass this as requireAuthz's second
// argument or every non-Admin caller is denied regardless of permissions.
const projectInScope = () => async (req: AuthenticatedRequest) => {
  const projectId = parseInt(req.params.id, 10);
  const scope = await buildProjectScope(req.user!);
  return p.project.findFirst({ where: { id: projectId, ...scope } });
};

// GET /api/v1/projects - List projects
router.get(
  '/',
  authenticateToken,
  requireAuthz(Permissions.PROJECTS_READ),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { status, verification_status, unassigned, dm_executive_id } = req.query;
      const filters = {
        status: typeof status === 'string' ? status : undefined,
        // Separate from `status` (the PLANNING/UNDER_CONSTRUCTION/... operational
        // lifecycle) -- this filters Project.verification_status (the
        // DRAFT/PENDING_DM_POLISH/PENDING_MD_APPROVAL/VERIFIED/REJECTED
        // approval-gate field, item 1.7), needed for an MD "pending my
        // approval" queue that has no other way to list itself.
        verification_status:
          typeof verification_status === 'string' ? verification_status : undefined,
        unassigned: unassigned === 'true',
        dm_executive_id:
          typeof dm_executive_id === 'string' ? parseInt(dm_executive_id, 10) : undefined,
      };

      // A plain DM Executive automatically sees only their own assigned-to-
      // polish projects — mirrors properties/crud.ts's isDMExecutiveOnly.
      const userRoles: string[] = req.user!.roles || [];
      const isDMExecutiveOnly =
        userRoles.includes('digital marketing executive') &&
        !userRoles.some((r: string) =>
          ['Digital Marketing head(manager)', 'Marketing Director', 'md', 'admin'].includes(r),
        );
      if (isDMExecutiveOnly && !filters.dm_executive_id) {
        filters.dm_executive_id = req.user!.employeeId;
      }

      // Default was 50 with a 100 max and no `total` in the response, and
      // the frontend's own list fetches never pass a limit override — same
      // bug class as leads/properties/customers, fixed the same way.
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 2000, 1), 100000);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

      const { projects, total } = await ProjectService.listProjects(
        req.user!,
        filters,
        limit,
        offset,
      );
      return res.status(200).json({ projects, total, pagination: { limit, offset, total } });
    } catch (error: any) {
      logger.error('Fetch projects error:', error);
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to fetch projects' });
    }
  },
);

// GET /api/v1/projects/:id - Get single project
router.get(
  '/:id',
  authenticateToken,
  requireAuthz(Permissions.PROJECTS_READ, async (req) => {
    const projectId = parseInt(req.params.id, 10);
    return await p.project.findFirst({ where: { id: projectId } });
  }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.id, 10);
      const project = await ProjectService.getProject(req.user!, projectId);
      return res.status(200).json({ project });
    } catch (error: any) {
      logger.error('Fetch project error:', error);
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to fetch project' });
    }
  },
);

// POST /api/v1/projects - Create Project
router.post(
  '/',
  authenticateToken,
  requireAuthz(Permissions.PROJECTS_CREATE),
  validateRequestBody(ProjectCreateSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const project = await ProjectService.createProject(req.user!, req.body);
      return res.status(201).json({
        message: 'Project created successfully',
        project,
      });
    } catch (error: any) {
      logger.error('Create project error:', error);
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to create project' });
    }
  },
);

// PUT /api/v1/projects/:id - Update Project
router.put(
  '/:id',
  authenticateToken,
  requireAuthz(Permissions.PROJECTS_UPDATE, async (req: AuthenticatedRequest) => {
    const projectId = parseInt(req.params.id, 10);
    // Use scoped query so out-of-scope projects return 404 (not 403), consistent with GET
    const scope = await buildProjectScope(req.user!);
    try {
      return await p.project.findFirst({ where: { id: projectId, ...scope } });
    } catch (e: any) {
      logger.error('Prisma validation error payload:', e.message);
      throw e;
    }
  }),
  validateRequestBody(ProjectUpdateSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.id, 10);
      const project = await ProjectService.updateProject(req.user!, projectId, req.body);
      return res.status(200).json({
        message: 'Project updated successfully',
        project,
      });
    } catch (error: any) {
      logger.error('Update project error:', error);
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to update project' });
    }
  },
);

// DELETE /api/v1/projects/:id - Delete Project (Status transition)
router.delete(
  '/:id',
  authenticateToken,
  requireAuthz(Permissions.PROJECTS_DELETE, async (req: AuthenticatedRequest) => {
    const projectId = parseInt(req.params.id, 10);
    // Use scoped query so out-of-scope projects return 404 (not 403), consistent with GET
    const scope = await buildProjectScope(req.user!);
    try {
      return await p.project.findFirst({ where: { id: projectId, ...scope } });
    } catch (e: any) {
      logger.error('Prisma validation error payload DELETE:', e.message);
      throw e;
    }
  }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.id, 10);
      const project = await ProjectService.deleteProject(req.user!, projectId);
      return res.status(200).json({
        message: 'Project deleted successfully',
        project,
      });
    } catch (error: any) {
      logger.error('Delete project error:', error);
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to delete project' });
    }
  },
);

// POST /api/v1/projects/:id/reassign - Reassign a project's PM, as a distinct
// reasoned action (mandatory reason, dedicated REASSIGNMENT audit entry) —
// separate from the general edit form, which already lets assigned_pm_id
// change freely with no reason/audit trail (Phase 2.7).
router.post(
  '/:id/reassign',
  authenticateToken,
  requireAuthz(Permissions.PROJECTS_UPDATE, async (req: AuthenticatedRequest) => {
    const projectId = parseInt(req.params.id, 10);
    const scope = await buildProjectScope(req.user!);
    return await p.project.findFirst({ where: { id: projectId, ...scope } });
  }),
  validateRequestBody(ProjectReassignSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.id, 10);
      const { new_pm_id, reason } = req.body;
      const project = await ProjectService.reassignProject(req.user!, projectId, new_pm_id, reason);
      return res.status(200).json({
        message: 'Project reassigned successfully',
        project,
      });
    } catch (error: any) {
      logger.error('Reassign project error:', error);
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to reassign project' });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// Project Verification Workflow
// ─────────────────────────────────────────────────────────────

// POST /api/v1/projects/:id/submit-for-review
// PM submits their project for DM review (DRAFT|REJECTED → PENDING_DM_POLISH).
// Writes `verification_status` — the separate approval-gate field that
// dataScope.ts actually checks for visibility — never the operational
// `status` field (PLANNING/UNDER_CONSTRUCTION/...), which is unrelated.
// Item 1.7 (2026-09-15): this used to go straight to PENDING_VERIFICATION
// (MD-only review) — now routes through a DM polish step first, mirroring
// Property's PM -> DM -> MD chain, since a Project's verification is the
// only gate its units sit behind (no separate per-unit verification).
router.post(
  '/:id/submit-for-review',
  authenticateToken,
  requireAuthz(Permissions.PROJECTS_SUBMIT_VERIFY, projectInScope()),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.id, 10);
      if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid ID' });
      const project = await p.project.findFirst({ where: { id: projectId } });
      if (!project) return res.status(404).json({ error: 'Project not found' });
      if (!['DRAFT', 'REJECTED'].includes(project.verification_status)) {
        return res
          .status(400)
          .json({ error: `Cannot submit: project is already ${project.verification_status}` });
      }
      const updated = await p.project.update({
        where: { id: projectId },
        data: {
          verification_status: 'PENDING_DM_POLISH',
          verified_by_id: null,
          verified_at: null,
          verification_notes: null,
        },
      });
      logger.info(`Project ${projectId} submitted for review by employee ${req.user!.employeeId}`);
      return res
        .status(200)
        .json({ message: 'Project submitted for Marketing review.', project: updated });
    } catch (error: any) {
      logger.error('Submit project for review error:', error);
      return res.status(500).json({ error: 'Failed to submit project for review' });
    }
  },
);

// POST /api/v1/projects/:id/dm-polish - Digital Marketing Polish & SEO Step
// Mirrors properties/workflow.ts's /:id/dm-polish exactly.
router.post(
  '/:id/dm-polish',
  authenticateToken,
  requireAuthz(Permissions.PROJECTS_DM_POLISH, projectInScope()),
  validateRequestBody(ProjectDMPolishSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.id, 10);
      if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid ID' });
      const project = await p.project.findFirst({ where: { id: projectId } });
      if (!project) return res.status(404).json({ error: 'Project not found' });
      if (project.verification_status !== 'PENDING_DM_POLISH') {
        return res.status(400).json({
          error: `Project is not pending DM polish (current: ${project.verification_status})`,
        });
      }
      const { digital_marketing_executive_id, seo_title, seo_keywords, notes } = req.body;
      const updated = await p.project.update({
        where: { id: projectId },
        data: {
          verification_status: 'PENDING_MD_APPROVAL',
          digital_marketing_executive_id,
          seo_title: seo_title || project.seo_title,
          seo_keywords: seo_keywords || project.seo_keywords,
          verification_notes: notes || null,
        },
      });
      logger.info(`Project ${projectId} DM-polished by employee ${req.user!.employeeId}`);
      return res.status(200).json({
        message: `Project "${updated.name}" polished by DM team and submitted for MD Approval`,
        project: updated,
      });
    } catch (error: any) {
      logger.error('DM Polish project error:', error);
      return res.status(500).json({ error: 'Failed to execute DM polish step' });
    }
  },
);

// POST /api/v1/projects/:id/dm-verify-as-is - Digital Marketing Head bypass
// Skips polish assignment and advances directly to PENDING_MD_APPROVAL.
// Uses the same PROJECTS_DM_POLISH permission gate as the standard polish
// path (mirrors properties/workflow.ts's /:id/dm-verify-as-is exactly).
router.post(
  '/:id/dm-verify-as-is',
  authenticateToken,
  requireAuthz(Permissions.PROJECTS_DM_POLISH, projectInScope()),
  validateRequestBody(ProjectDMVerifyAsIsSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.id, 10);
      if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid ID' });
      const project = await p.project.findFirst({ where: { id: projectId } });
      if (!project) return res.status(404).json({ error: 'Project not found' });
      if (project.verification_status !== 'PENDING_DM_POLISH') {
        return res.status(400).json({
          error: `Project is not pending DM polish (current: ${project.verification_status})`,
        });
      }
      const { notes } = req.body;
      const updated = await p.project.update({
        where: { id: projectId },
        data: {
          verification_status: 'PENDING_MD_APPROVAL',
          verification_notes: notes || null,
        },
      });
      logger.info(`Project ${projectId} DM-verified-as-is by employee ${req.user!.employeeId}`);
      return res.status(200).json({
        message: `Project "${updated.name}" verified as-is by DM Head and submitted for MD Approval`,
        project: updated,
      });
    } catch (error: any) {
      logger.error('DM Verify-as-is project error:', error);
      return res.status(500).json({ error: 'Failed to execute DM verify-as-is step' });
    }
  },
);

// POST /api/v1/projects/:id/md-approve
// MD final approval: body { approved: boolean, notes?: string }
router.post(
  '/:id/md-approve',
  authenticateToken,
  requireAuthz(Permissions.PROJECTS_VERIFY),
  validateRequestBody(ProjectMDApprovalSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.id, 10);
      if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid ID' });
      const { approved, notes } = req.body;
      const project = await p.project.findFirst({ where: { id: projectId } });
      if (!project) return res.status(404).json({ error: 'Project not found' });
      if (project.verification_status !== 'PENDING_MD_APPROVAL') {
        return res.status(400).json({
          error: `Project is not pending MD approval (current: ${project.verification_status})`,
        });
      }
      const newStatus = approved ? 'VERIFIED' : 'REJECTED';
      const updated = await p.project.update({
        where: { id: projectId },
        data: {
          verification_status: newStatus,
          verified_by_id: req.user!.employeeId,
          verified_at: new Date(),
          verification_notes: notes || null,
        },
      });
      logger.info(`Project ${projectId} ${newStatus} by MD employee ${req.user!.employeeId}`);

      // "Every project is a property": approving a project makes its already-
      // AVAILABLE units visible for the first time (matching/booking gate on
      // Project.verification_status = VERIFIED) — give dropped
      // "no matching inventory" leads the same automatic-recovery chance a
      // newly-LIVE property gives them. Fire-and-forget, same pattern as
      // property.service.ts's LIVE transition.
      if (newStatus === 'VERIFIED') {
        p.projectUnit
          .findMany({
            where: { project_id: projectId, sales_status: 'AVAILABLE' },
            select: { id: true },
          })
          .then((units) => {
            import('../../services/lead.service').then(({ LeadService }) => {
              for (const unit of units) {
                LeadService.triggerLeadRecoveryForUnit(unit.id).catch((err) =>
                  logger.error(`Error triggering lead recovery for unit ${unit.id}:`, err),
                );
              }
            });
          })
          .catch((err) =>
            logger.error(`Error listing units for project ${projectId} recovery:`, err),
          );
      }

      const msg = approved
        ? `Project "${project.name}" approved and is now visible to all staff.`
        : `Project "${project.name}" rejected. The PM has been informed.`;
      return res.status(200).json({ message: msg, project: updated });
    } catch (error: any) {
      logger.error('MD Approve project error:', error);
      return res.status(500).json({ error: 'Failed to execute MD approval step' });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// Phase 2.23: Layout images & unit-position regions
// ─────────────────────────────────────────────────────────────

// POST /api/v1/projects/:id/layout-images - Upload a layout/site-plan image
router.post(
  '/:id/layout-images',
  authenticateToken,
  requireAuthz(Permissions.PROJECTS_UPDATE, projectInScope()),
  memoryUpload.single('image') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.id, 10);
      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
      }
      const image = await ProjectService.uploadLayoutImage(
        req.user!,
        projectId,
        req.file,
        req.body?.title,
      );
      return res.status(201).json({ message: 'Layout image uploaded successfully', image });
    } catch (error: any) {
      logger.error('Upload layout image error:', error);
      if (error.status) return res.status(error.status).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to upload layout image' });
    }
  },
);

// GET /api/v1/projects/:id/layout-images - List layout images with pins + unit summaries
router.get(
  '/:id/layout-images',
  authenticateToken,
  requireAuthz(Permissions.PROJECTS_READ),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.id, 10);
      const images = await ProjectService.listLayoutImages(req.user!, projectId);
      return res.status(200).json({ images });
    } catch (error: any) {
      logger.error('List layout images error:', error);
      if (error.status) return res.status(error.status).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to fetch layout images' });
    }
  },
);

// DELETE /api/v1/projects/:id/layout-images/:imageId
router.delete(
  '/:id/layout-images/:imageId',
  authenticateToken,
  requireAuthz(Permissions.PROJECTS_UPDATE, projectInScope()),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.id, 10);
      const imageId = parseInt(req.params.imageId, 10);
      const result = await ProjectService.deleteLayoutImage(req.user!, projectId, imageId);
      return res.status(200).json(result);
    } catch (error: any) {
      logger.error('Delete layout image error:', error);
      if (error.status) return res.status(error.status).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to delete layout image' });
    }
  },
);

// PUT /api/v1/projects/:id/layout-images/:imageId/regions - Bulk save pin positions
router.put(
  '/:id/layout-images/:imageId/regions',
  authenticateToken,
  requireAuthz(Permissions.PROJECTS_UPDATE, projectInScope()),
  validateRequestBody(ProjectLayoutRegionsSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.id, 10);
      const imageId = parseInt(req.params.imageId, 10);
      const result = await ProjectService.upsertLayoutRegions(
        req.user!,
        projectId,
        imageId,
        req.body.regions,
      );
      return res.status(200).json({
        message: `${result.saved} of ${result.total} region(s) saved successfully`,
        ...result,
      });
    } catch (error: any) {
      logger.error('Save layout regions error:', error);
      if (error.status) return res.status(error.status).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to save layout regions' });
    }
  },
);

// DELETE /api/v1/projects/layout-regions/:regionId - Remove a single pin
// (no :id param on this route — resolve the owning project via the region's layout image)
const projectOfRegionInScope = () => async (req: AuthenticatedRequest) => {
  const regionId = parseInt(req.params.regionId, 10);
  const region = await p.propertyLayoutRegion.findUnique({
    where: { id: regionId },
    include: { layout_image: { select: { project_id: true } } },
  });
  if (!region) return null;
  const scope = await buildProjectScope(req.user!);
  return p.project.findFirst({ where: { id: region.layout_image.project_id, ...scope } });
};

router.delete(
  '/layout-regions/:regionId',
  authenticateToken,
  requireAuthz(Permissions.PROJECTS_UPDATE, projectOfRegionInScope()),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const regionId = parseInt(req.params.regionId, 10);
      const result = await ProjectService.deleteLayoutRegion(req.user!, regionId);
      return res.status(200).json(result);
    } catch (error: any) {
      logger.error('Delete layout region error:', error);
      if (error.status) return res.status(error.status).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to delete layout region' });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// Media, Documents, Activity
// ─────────────────────────────────────────────────────────────

// POST /api/v1/projects/:id/media - Upload a media file (cover/gallery/video/brochure/plans)
router.post(
  '/:id/media',
  authenticateToken,
  requireAuthz(Permissions.PROJECTS_UPDATE, projectInScope()),
  memoryUpload.single('file') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.id, 10);
      if (!req.file) return res.status(400).json({ error: 'No file provided' });
      const kind = req.body?.kind || 'GALLERY';
      const media = await ProjectService.uploadMedia(
        req.user!,
        projectId,
        req.file,
        kind,
        req.body?.title,
      );
      return res.status(201).json({ message: 'Media uploaded successfully', media });
    } catch (error: any) {
      logger.error('Upload project media error:', error);
      if (error.status) return res.status(error.status).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to upload media' });
    }
  },
);

// GET /api/v1/projects/:id/media
router.get(
  '/:id/media',
  authenticateToken,
  requireAuthz(Permissions.PROJECTS_READ),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.id, 10);
      const media = await ProjectService.listMedia(req.user!, projectId);
      return res.status(200).json({ media });
    } catch (error: any) {
      logger.error('List project media error:', error);
      if (error.status) return res.status(error.status).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to fetch media' });
    }
  },
);

// DELETE /api/v1/projects/:id/media/:mediaId
router.delete(
  '/:id/media/:mediaId',
  authenticateToken,
  requireAuthz(Permissions.PROJECTS_UPDATE, projectInScope()),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.id, 10);
      const mediaId = parseInt(req.params.mediaId, 10);
      const result = await ProjectService.deleteMedia(req.user!, projectId, mediaId);
      return res.status(200).json(result);
    } catch (error: any) {
      logger.error('Delete project media error:', error);
      if (error.status) return res.status(error.status).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to delete media' });
    }
  },
);

// POST /api/v1/projects/:id/documents - Upload a document (RERA/approval/legal/other)
router.post(
  '/:id/documents',
  authenticateToken,
  requireAuthz(Permissions.PROJECTS_UPDATE, projectInScope()),
  memoryUpload.single('file') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.id, 10);
      if (!req.file) return res.status(400).json({ error: 'No file provided' });
      const kind = req.body?.kind || 'OTHER';
      const doc = await ProjectService.uploadDocument(
        req.user!,
        projectId,
        req.file,
        kind,
        req.body?.title,
      );
      return res.status(201).json({ message: 'Document uploaded successfully', document: doc });
    } catch (error: any) {
      logger.error('Upload project document error:', error);
      if (error.status) return res.status(error.status).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to upload document' });
    }
  },
);

// GET /api/v1/projects/:id/documents
router.get(
  '/:id/documents',
  authenticateToken,
  requireAuthz(Permissions.PROJECTS_READ),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.id, 10);
      const documents = await ProjectService.listDocuments(req.user!, projectId);
      return res.status(200).json({ documents });
    } catch (error: any) {
      logger.error('List project documents error:', error);
      if (error.status) return res.status(error.status).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to fetch documents' });
    }
  },
);

// DELETE /api/v1/projects/:id/documents/:documentId
router.delete(
  '/:id/documents/:documentId',
  authenticateToken,
  requireAuthz(Permissions.PROJECTS_UPDATE, projectInScope()),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.id, 10);
      const documentId = parseInt(req.params.documentId, 10);
      const result = await ProjectService.deleteDocument(req.user!, projectId, documentId);
      return res.status(200).json(result);
    } catch (error: any) {
      logger.error('Delete project document error:', error);
      if (error.status) return res.status(error.status).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to delete document' });
    }
  },
);

// GET /api/v1/projects/:id/activity
router.get(
  '/:id/activity',
  authenticateToken,
  requireAuthz(Permissions.PROJECTS_READ),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.id, 10);
      const events = await ProjectService.listActivity(req.user!, projectId);
      return res.status(200).json({ events });
    } catch (error: any) {
      logger.error('List project activity error:', error);
      if (error.status) return res.status(error.status).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to fetch activity' });
    }
  },
);

export default router;
