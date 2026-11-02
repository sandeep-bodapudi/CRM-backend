import { prisma } from '../lib/prisma';
import { PrismaClient, Prisma } from '@prisma/client';
import { TokenPayload } from '../utils/jwt';
import { buildProjectScope } from '../authz/dataScope';
import { ProjectCreateInput, ProjectUpdateInput, Roles, Permissions } from '../shared';
import { can } from '../authz/authorization';
import { slugify, generateUniqueSlug } from '../utils/slugify';
import { fetchWithCache, clearCacheByPrefix } from '../utils/cache';
import { getStorageService, processImageBuffer, PROJECT_MEDIA_LIMITS } from './storage.service';
import { logger } from '../utils/logger';
import { notifyEmployee } from '../utils/notifyEmployee';
import { WorkflowEngine } from '../workflows/workflowEngine';
import { WorkflowDomain } from '../workflows/types';
import { FieldChange, isApproved, projectChanges, recordChanges } from './projectChangeLog';
const p = prisma;

/** Key prefix of ProjectService.listProjects's per-user cache entries. */
const PROJECT_LIST_CACHE_PREFIX = 'projects_';

/** Forgets every cached project list (all users) — called after any project write. */
export function invalidateProjectListCache() {
  clearCacheByPrefix(PROJECT_LIST_CACHE_PREFIX);
}

/**
 * Who hears about a step in the project review chain (owner, 2026-11-02):
 * - SUBMITTED: the Marketing reviewers (DM Head); the MD if there is none.
 * - TO_MD: the MD(s), once Marketing passes it on.
 * - APPROVED / REJECTED: whoever added the project and its assigned PM
 *   (a rejection carries the reason).
 * The person acting is never notified of their own step. Returns how many
 * people were told, so the caller's message can say so truthfully.
 */
export async function notifyProjectReview(
  event: 'SUBMITTED' | 'TO_MD' | 'APPROVED' | 'REJECTED',
  project: {
    id: number;
    name: string;
    project_code: string;
    company_id: number;
    created_by_id: number | null;
    assigned_pm_id: number | null;
  },
  actorId: number,
  reason?: string | null,
): Promise<number> {
  const holdersOf = async (roles: string[]) =>
    (
      await p.employee.findMany({
        where: {
          company_id: project.company_id,
          status: 'ACTIVE',
          roles: { some: { role: { name: { in: roles } } } },
        },
        select: { id: true },
      })
    ).map((e) => e.id);

  let recipients: number[] = [];
  let payload: { type: string; title: string; message: string };
  const label = `"${project.name}" (${project.project_code})`;

  if (event === 'SUBMITTED') {
    recipients = await holdersOf([Roles.DIGITAL_MARKETING_HEAD]);
    if (!recipients.length) recipients = await holdersOf([Roles.MD]);
    payload = {
      type: 'PROJECT_REVIEW_SUBMITTED',
      title: `Project to review: ${project.project_code}`,
      message: `Project ${label} was submitted and is waiting for Marketing review.`,
    };
  } else if (event === 'TO_MD') {
    recipients = await holdersOf([Roles.MD]);
    payload = {
      type: 'PROJECT_REVIEW_MD',
      title: `Project waiting for your approval: ${project.project_code}`,
      message: `Project ${label} passed Marketing review and is waiting for MD approval.`,
    };
  } else {
    recipients = [project.created_by_id, project.assigned_pm_id].filter(
      (id): id is number => id != null,
    );
    payload =
      event === 'APPROVED'
        ? {
            type: 'PROJECT_APPROVED',
            title: `Project approved: ${project.project_code}`,
            message: `Project ${label} was approved by the MD and is now visible to all staff and on the website.`,
          }
        : {
            type: 'PROJECT_REJECTED',
            title: `Project rejected: ${project.project_code}`,
            message: `Project ${label} was rejected by the MD.${reason ? ` Reason: ${reason}` : ''} Fix it and submit it again.`,
          };
  }

  const ids = [...new Set(recipients)].filter((id) => id !== actorId);
  if (!ids.length) return 0;
  try {
    await notifyEmployee(ids, { ...payload, link: `/projects/${project.id}` });
  } catch (err) {
    logger.error(`[ProjectReview] ${event} notification failed for project ${project.id}:`, err);
  }
  return ids.length;
}

// Fields common to ProjectCreateInput/ProjectUpdateInput beyond the original
// (Phase <2.5) set — see ProjectCommonFields in shared/project.ts. Shared by
// createProject/updateProject so both use identical mapping. Only keys
// present in `data` are included (matching the "?? null" style already used
// for the original fields) — safe for both a full create payload (an omitted
// field simply stores NULL, which is the correct default for every one of
// these nullable columns) and a partial update (an omitted field is left
// untouched by not appearing in the returned object at all).
function mapCommonProjectFields(data: Partial<ProjectCreateInput & ProjectUpdateInput>) {
  const out: Record<string, any> = {};
  const passthroughKeys = [
    'project_type',
    'developer_name',
    'state',
    'district',
    'city',
    'mandal',
    'village',
    'locality',
    'address',
    'pincode',
    'latitude',
    'longitude',
    'maps_link',
    'total_area_value',
    'towers_count',
    'blocks_count',
    'floors_count',
    'rera_status',
    'approval_authority',
    'approval_authorities',
    'approval_number',
    'lp_number',
    'default_price_basis',
    'default_area_unit',
    'total_area_unit',
    'cover_image_url',
  ] as const;
  for (const key of passthroughKeys) {
    if (data[key as keyof typeof data] !== undefined) out[key] = data[key as keyof typeof data];
  }
  if (data.completion_date !== undefined) {
    out.completion_date = data.completion_date ? new Date(data.completion_date) : null;
  }
  return out;
}

const ALLOWED_DOCUMENT_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'csv',
  'txt',
  'jpg',
  'jpeg',
  'png',
  'webp',
]);

export class ProjectService {
  /**
   * One past the highest `RRH-PJ-<year>-NNNN` already used this year. It was
   * "count of all projects + 1", which reissues an existing code once any
   * row is gone; `offset` skips ahead on a retry after a clash.
   */
  private static async generateNextProjectCode(offset = 0): Promise<string> {
    const prefix = `RRH-PJ-${new Date().getFullYear()}-`;
    const rows = await p.project.findMany({
      where: { project_code: { startsWith: prefix } },
      select: { project_code: true },
    });
    let max = 0;
    for (const r of rows) {
      const n = parseInt(r.project_code.slice(prefix.length), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return `${prefix}${String(max + 1 + offset).padStart(4, '0')}`;
  }

  /**
   * A project's PM must be an active Project Manager of the project's company
   * — the field used to take any employee id in the company (an Inventory
   * Executive was accepted as "PM").
   */
  private static async assertValidPm(pmId: number, companyId: number) {
    const pm = await p.employee.findFirst({
      where: {
        id: pmId,
        company_id: companyId,
        status: 'ACTIVE',
        roles: { some: { role: { name: Roles.PROJECT_MANAGER } } },
      },
      select: { id: true },
    });
    if (!pm) {
      throw { status: 400, message: 'Choose an active Project Manager of this company as the PM.' };
    }
  }

  static async listProjects(
    user: TokenPayload,
    filters: {
      status?: string;
      verification_status?: string;
      unassigned?: boolean;
      dm_executive_id?: number;
    },
    take: number = 50,
    skip: number = 0,
  ) {
    const whereCondition = await buildProjectScope(user);

    if (filters.status) {
      whereCondition.status = filters.status;
    }
    if (filters.verification_status) {
      whereCondition.verification_status = filters.verification_status;
    }
    // Mirrors Property's own ?unassigned=true (property.service.ts) — a
    // Project has its own independent assigned_pm_id, not shared with its
    // units, so an unassigned Project leaves every unit inside it without a
    // routed PM too (see siteVisit routing, which resolves PM from the
    // Project, not per-unit).
    if (filters.unassigned) {
      whereCondition.assigned_pm_id = null;
    }
    if (filters.dm_executive_id) {
      whereCondition.digital_marketing_executive_id = filters.dm_executive_id;
    }

    // `total` (of the full scoped/filtered set, not just this page) lets the
    // frontend know whether it got everything, instead of a truncated
    // fetch's own array length silently looking complete — see
    // routes/leads.ts's GET / for the same lesson learned there.
    const cacheKey = `projects_${user.employeeId}_${JSON.stringify(filters)}_${take}_${skip}`;
    return await fetchWithCache(cacheKey, async () => {
      const [projects, total] = await Promise.all([
        p.project.findMany({
          where: whereCondition,
          take,
          skip,
          include: {
            assigned_pm: {
              select: { id: true, employee_code: true, full_name: true, phone: true },
            },
          },
          orderBy: { created_at: 'desc' },
        }),
        p.project.count({ where: whereCondition }),
      ]);
      return { projects, total };
    });
  }

  static async getProject(user: TokenPayload, projectId: number) {
    const whereCondition = await buildProjectScope(user);

    const project = await p.project.findFirst({
      where: {
        id: projectId,
        ...whereCondition,
      },
      include: {
        assigned_pm: { select: { id: true, employee_code: true, full_name: true, phone: true } },
        verified_by: { select: { id: true, full_name: true } },
        properties: {
          select: {
            id: true,
            property_code: true,
            title: true,
            status: true,
          },
        },
      },
    });

    if (!project) throw { status: 404, message: 'Project not found or unauthorized' };
    return project;
  }

  static async createProject(user: TokenPayload, data: ProjectCreateInput) {
    const companyId = user.companyId || 1;
    const branchId = user.branchId || null;

    let finalPmId = data.assigned_pm_id || null;

    if (finalPmId) {
      await this.assertValidPm(finalPmId, companyId);
    } else {
      // Auto-assign to the creator if they are a Project Manager
      if (user.roles.includes(Roles.PROJECT_MANAGER)) {
        finalPmId = user.employeeId;
      } else if (
        user.roles.includes(Roles.INVENTORY_EXECUTIVE) ||
        user.roles.includes(Roles.DATA_ENTRY_OPERATOR)
      ) {
        // The Inventory Executive enters data on a PM's behalf; that PM
        // reviews it and submits it for approval. With no PM set, nobody
        // would ever pick the project up.
        throw {
          status: 400,
          message: 'Select the Project Manager who provided this project data.',
        };
      }
    }

    const baseSlug = slugify(`${data.name} ${data.location}`);
    const slug = await generateUniqueSlug(baseSlug, companyId, async (s: string, cId: number) => {
      const existing = await p.project.findFirst({ where: { slug: s, company_id: cId } });
      return !!existing;
    });

    const MAX_RETRIES = 3;
    let retries = 0;

    while (retries < MAX_RETRIES) {
      try {
        const projectCode = await this.generateNextProjectCode(retries);

        const project = await p.project.create({
          data: {
            project_code: projectCode,
            company_id: companyId,
            branch_id: branchId,
            name: data.name,
            description: data.description || null,
            location: data.location,
            total_area: data.total_area || null,
            total_units: data.total_units || null,
            launch_date: data.launch_date ? new Date(data.launch_date) : null,
            project_phase: data.project_phase || null,
            rera_number: data.rera_number || null,
            amenities: data.amenities || null,
            assigned_pm_id: finalPmId,
            created_by_id: user.employeeId,
            status: 'PLANNING',
            // Not public until verified: the MD's final approval publishes it
            // (routes/projects/core.ts md-approve), same as a property going LIVE.
            // Auto-publishing on create put unverified drafts on the websites.
            is_published: false,
            slug,
            ...mapCommonProjectFields(data),
          },
        });

        // Notify the assigned PM if one was set
        if (data.assigned_pm_id) {
          await p.notification.create({
            data: {
              employee_id: data.assigned_pm_id,
              type: 'PROJECT_ASSIGNED',
              title: `New Project Assigned: ${projectCode}`,
              message: `Project "${data.name}" (${projectCode}) has been created and assigned to you.`,
            },
          });
          // Web push to assigned PM (outside transaction)
          notifyEmployee(
            data.assigned_pm_id,
            {
              type: 'PROJECT_ASSIGNED',
              title: `New Project Assigned: ${projectCode}`,
              message: `Project "${data.name}" (${projectCode}) has been created and assigned to you.`,
            },
            { skipDbNotification: true },
          ).catch((err) => logger.error('[WebPush] Create project PM notify:', err));
        }

        return project;
      } catch (error: any) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          // Unique constraint violation (likely project_code collision due to concurrency)
          const target = error.meta?.target as string[];
          if (target && target.includes('project_code')) {
            retries++;
            continue; // Retry with a new code
          }
        }
        // If it's a different error or not a project_code collision, throw it
        throw error;
      }
    }

    throw { status: 500, message: 'Failed to generate unique project code after multiple retries' };
  }

  static async updateProject(user: TokenPayload, projectId: number, data: ProjectUpdateInput) {
    const whereCondition = await buildProjectScope(user);

    const project = await p.project.findFirst({
      where: {
        id: projectId,
        ...whereCondition,
      },
    });

    if (!project) throw { status: 404, message: 'Project not found or unauthorized' };

    // Core fields are locked while the project is in review (Marketing or MD).
    // PM can still update media, documents, and images via separate endpoints.
    // This used to test `status` (the operational field), which never holds a
    // review state, so the lock never applied. Admin/MD may still correct it.
    const CORE_LOCKED_FIELDS = [
      'name',
      'description',
      'location',
      'total_area',
      'total_units',
      'launch_date',
      'project_phase',
      'rera_number',
      'assigned_pm_id',
      'project_type',
      'developer_name',
      'status',
    ];
    const inReview = ['PENDING_DM_POLISH', 'PENDING_MD_APPROVAL', 'PENDING_VERIFICATION'].includes(
      project.verification_status,
    );
    const canOverrideLock = user.roles.includes(Roles.ADMIN) || user.roles.includes(Roles.MD);
    if (inReview && !canOverrideLock) {
      // The wizard re-sends a whole step on every save, so only a value that
      // actually differs counts as an edit.
      const differs = (incoming: any, current: any) => {
        if (incoming === undefined) return false;
        if ((incoming ?? '') === (current ?? '')) return false;
        if (current instanceof Date && incoming != null)
          return new Date(incoming).getTime() !== current.getTime();
        return true;
      };
      const attemptedCoreChange = CORE_LOCKED_FIELDS.some((f) =>
        differs((data as any)[f], (project as any)[f]),
      );
      if (attemptedCoreChange) {
        throw {
          status: 409,
          message:
            'Core project details are locked while the project is in review. Only media and documents may be updated.',
        };
      }
    }

    if (data.assigned_pm_id && data.assigned_pm_id !== project.assigned_pm_id) {
      await this.assertValidPm(data.assigned_pm_id, project.company_id);
    }

    // Explicit safe-fields whitelist — status is handled separately below via
    // the workflow engine (Phase 2.5), mirroring PropertyService.updateProperty's
    // "safe-fields + separate status path" pattern, instead of accepting any
    // status enum value unconditionally.
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.location !== undefined) updateData.location = data.location;
    if (data.total_area !== undefined) updateData.total_area = data.total_area;
    if (data.total_units !== undefined) updateData.total_units = data.total_units;
    if (data.launch_date !== undefined)
      updateData.launch_date = data.launch_date ? new Date(data.launch_date) : null;
    if (data.project_phase !== undefined) updateData.project_phase = data.project_phase;
    if (data.rera_number !== undefined) updateData.rera_number = data.rera_number;
    if (data.amenities !== undefined) updateData.amenities = data.amenities;
    if (data.assigned_pm_id !== undefined) updateData.assigned_pm_id = data.assigned_pm_id;
    Object.assign(updateData, mapCommonProjectFields(data));

    // No UI sends an abstract action verb for Project (unlike Lead/Property) —
    // the existing edit form has always sent the desired target status directly,
    // so the workflow engine's "action" here is literally that target status.
    // A resubmission with the project's current, unchanged status is a no-op,
    // not a transition, and skips the check entirely.
    let statusChange: { from: string; to: string } | null = null;
    if (data.status !== undefined && data.status !== project.status) {
      const transition = WorkflowEngine.canTransition({
        domain: WorkflowDomain.PROJECT,
        currentState: project.status,
        action: data.status,
        actor: user,
        entity: project,
      });
      if (!transition.allowed) {
        throw { status: 409, message: transition.reason || 'Invalid state transition' };
      }
      updateData.status = transition.nextState;
      statusChange = { from: project.status, to: transition.nextState! };
    }

    const pmChanged =
      data.assigned_pm_id !== undefined && data.assigned_pm_id !== project.assigned_pm_id;
    const oldPmId = project.assigned_pm_id;
    const newPmId = pmChanged ? (data.assigned_pm_id ?? null) : null;

    // An approved project can still be edited (owner, 2026-11-02); each field
    // that really changed is kept in its history, before -> after.
    let changes: FieldChange[] = [];
    if (isApproved(project)) {
      const { status: _status, assigned_pm_id: _pm, ...fields } = updateData;
      changes = projectChanges(project, fields);
      if (pmChanged) {
        const pms = await p.employee.findMany({
          where: { id: { in: [oldPmId, newPmId].filter((id): id is number => id != null) } },
          select: { id: true, full_name: true },
        });
        const nameOf = (id: number | null) => pms.find((e) => e.id === id)?.full_name || '—';
        changes.push({ field: 'Project manager', before: nameOf(oldPmId), after: nameOf(newPmId) });
      }
    }

    // Every changed field, the status and the PM go in ONE write. The status
    // and PM paths used to write only their own column and return, silently
    // dropping a name/RERA/etc. change saved in the same request.
    const updated = await p.$transaction(async (tx: Prisma.TransactionClient) => {
      const row = await tx.project.update({ where: { id: projectId }, data: updateData });
      if (statusChange) {
        await tx.auditEvent.create({
          data: {
            actor_id: user.employeeId!,
            action: 'STATUS_CHANGE',
            entity_type: 'PROJECT',
            entity_id: projectId,
            old_value: statusChange.from,
            new_value: statusChange.to,
            reason: data.change_reason || null,
          },
        });
      }
      await recordChanges(tx, {
        projectId,
        actorId: user.employeeId!,
        area: 'DETAILS',
        changes,
        reason: data.change_reason,
      });
      return row;
    });

    if (pmChanged) {
      const tell = (id: number, type: string, title: string, message: string) =>
        notifyEmployee(id, { type, title, message, link: `/projects/${projectId}` }).catch((err) =>
          logger.error(`[Project] PM change notification (${type}) failed:`, err),
        );
      if (newPmId) {
        await tell(
          newPmId,
          'PROJECT_ASSIGNED',
          `Project Assigned to You: ${updated.project_code}`,
          `Project "${updated.name}" (${updated.project_code}) has been assigned to you.`,
        );
      }
      if (oldPmId) {
        await tell(
          oldPmId,
          'PROJECT_REASSIGNED',
          `Project Reassigned: ${updated.project_code}`,
          `Project "${updated.name}" (${updated.project_code}) has been reassigned from you.`,
        );
      }
    }

    return updated;
  }

  static async deleteProject(user: TokenPayload, projectId: number) {
    const whereCondition = await buildProjectScope(user);

    const project = await p.project.findFirst({
      where: {
        id: projectId,
        ...whereCondition,
      },
    });

    if (!project) throw { status: 404, message: 'Project not found or unauthorized' };

    // Deleting an already-cancelled project is a no-op success (DELETE should
    // be idempotent), not a workflow error.
    if (project.status === 'CANCELLED') return project;

    const transition = WorkflowEngine.canTransition({
      domain: WorkflowDomain.PROJECT,
      currentState: project.status,
      action: 'CANCELLED',
      actor: user,
      entity: project,
    });
    if (!transition.allowed) {
      throw { status: 409, message: transition.reason || 'Invalid state transition' };
    }

    // Phase 2.10: hard block cancellation while any unit underneath is still
    // active inventory. Chosen over a "cancel anyway" confirmation step
    // because a customer with a live booking on a "cancelled" project is a
    // real data-integrity problem, not just a UX nicety — resolving or moving
    // those units is a deliberate action a PM/MD should take explicitly
    // first, not something to bypass with a single extra click.
    const activePropertyCount = await p.property.count({
      where: { project_id: projectId, status: { in: ['LIVE', 'LOCKED', 'BOOKED'] } },
    });
    // Same guard, extended to ProjectUnit: any unit that is still sellable or
    // already committed to a customer (AVAILABLE/HOLD/RESERVED/BOOKED/SOLD)
    // blocks cancellation. BLOCKED/UNAVAILABLE units have already been
    // administratively taken off the table and do not block.
    const activeUnitCount = await p.projectUnit.count({
      where: {
        project_id: projectId,
        sales_status: { in: ['AVAILABLE', 'HOLD', 'RESERVED', 'BOOKED', 'SOLD'] },
      },
    });
    if (activePropertyCount > 0 || activeUnitCount > 0) {
      throw {
        status: 409,
        message: `Cannot cancel project: ${activePropertyCount + activeUnitCount} unit(s) underneath are still active inventory. Resolve or reassign them first.`,
      };
    }

    return await p.$transaction(async (tx: import('@prisma/client').Prisma.TransactionClient) => {
      const updated = await tx.project.update({
        where: { id: projectId },
        data: { status: transition.nextState },
      });
      await tx.auditEvent.create({
        data: {
          actor_id: user.employeeId!,
          action: 'STATUS_CHANGE',
          entity_type: 'PROJECT',
          entity_id: projectId,
          old_value: project.status,
          new_value: transition.nextState,
          reason: 'Project cancelled via DELETE /projects/:id',
        },
      });
      return updated;
    });
  }

  /**
   * Phase 2.7: was previously unreachable — no route ever called it, and its
   * own `can(user, PROJECTS_UPDATE)` check (no resource passed) always
   * returned false for everyone except ADMIN (`authorization.ts`'s
   * PROJECTS_UPDATE case fails closed with no resource, unlike some other
   * permissions that "defer to service layer"). Fixed by fetching the project
   * first and passing it to `can()`, and by scoping via `buildProjectScope`
   * (not a flat `company_id: user.companyId` match) so cross-company access
   * granted via Phase 1.2's `EmployeeCompanyAccess` works here too — the same
   * class of bug found and fixed in `bulkCreateUnitsForProject` (2.20).
   */
  static async reassignProject(
    user: TokenPayload,
    projectId: number,
    newPmId: number,
    reason: string,
  ) {
    if (!reason || reason.trim() === '') {
      throw { status: 400, message: 'Reassignment reason is mandatory' };
    }

    const scope = await buildProjectScope(user);
    const project = await p.project.findFirst({ where: { id: projectId, ...scope } });
    if (!project) throw { status: 404, message: 'Project not found or unauthorized' };

    if (!can(user, Permissions.PROJECTS_UPDATE, project)) {
      throw { status: 403, message: 'Forbidden: Missing permission to reassign this project' };
    }

    if (newPmId === project.assigned_pm_id) {
      throw { status: 400, message: 'Project is already assigned to this PM' };
    }

    // The new PM must belong to the PROJECT's own company, not necessarily the
    // acting user's — same reasoning as the 2.20 company-inheritance fix.
    await this.assertValidPm(newPmId, project.company_id);
    const newPm = await p.employee.findUniqueOrThrow({
      where: { id: newPmId },
      select: { full_name: true, employee_code: true },
    });

    const oldPmId = project.assigned_pm_id;

    return await p.$transaction(async (tx: import('@prisma/client').Prisma.TransactionClient) => {
      const updated = await tx.project.update({
        where: { id: projectId },
        data: { assigned_pm_id: newPmId },
      });

      await tx.auditEvent.create({
        data: {
          actor_id: user.employeeId!,
          action: 'REASSIGNMENT',
          entity_type: 'PROJECT',
          entity_id: projectId,
          old_value: oldPmId ? oldPmId.toString() : 'UNASSIGNED',
          new_value: newPmId.toString(),
          reason: reason,
        },
      });

      // Notify the new PM that they've been assigned a project
      await tx.notification.create({
        data: {
          employee_id: newPmId,
          type: 'PROJECT_ASSIGNED',
          title: `Project Assigned to You: ${updated.project_code}`,
          message: `Project "${updated.name}" (${updated.project_code}) has been assigned to you${reason ? `. Reason: ${reason}` : ''}.`,
        },
      });
      // Web push to new PM (outside transaction)
      notifyEmployee(
        newPmId,
        {
          type: 'PROJECT_ASSIGNED',
          title: `Project Assigned to You: ${updated.project_code}`,
          message: `Project "${updated.name}" (${updated.project_code}) has been assigned to you${reason ? `. Reason: ${reason}` : ''}.`,
        },
        { skipDbNotification: true },
      ).catch((err) => logger.error('[WebPush] ReassignProject new PM:', err));

      // Notify the old PM (if exists) that the project was reassigned away
      if (oldPmId && oldPmId !== newPmId) {
        await tx.notification.create({
          data: {
            employee_id: oldPmId,
            type: 'PROJECT_REASSIGNED',
            title: `Project Reassigned: ${updated.project_code}`,
            message: `Project "${updated.name}" (${updated.project_code}) has been reassigned from you to ${newPm.full_name || newPm.employee_code} by ${user.employeeId}.`,
          },
        });
        // Web push to old PM (outside transaction)
        notifyEmployee(
          oldPmId,
          {
            type: 'PROJECT_REASSIGNED',
            title: `Project Reassigned: ${updated.project_code}`,
            message: `Project "${updated.name}" (${updated.project_code}) has been reassigned from you.`,
          },
          { skipDbNotification: true },
        ).catch((err) => logger.error('[WebPush] Project reassign old PM:', err));
      }

      // Web push to new PM (outside transaction)
      notifyEmployee(
        newPmId,
        {
          type: 'PROJECT_ASSIGNED',
          title: `Project Assigned to You: ${updated.project_code}`,
          message: `Project "${updated.name}" (${updated.project_code}) has been assigned to you${reason ? `. Reason: ${reason}` : ''}.`,
        },
        { skipDbNotification: true },
      ).catch((err) => logger.error('[WebPush] Project reassign new PM:', err));

      return updated;
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Phase 2.23: Layout images & unit-position regions
  // ─────────────────────────────────────────────────────────────

  private static async assertProjectInScope(user: TokenPayload, projectId: number) {
    const scope = await buildProjectScope(user);
    const project = await p.project.findFirst({ where: { id: projectId, ...scope } });
    if (!project) throw { status: 404, message: 'Project not found' };
    return project;
  }

  static async uploadLayoutImage(
    user: TokenPayload,
    projectId: number,
    file: { buffer: Buffer; originalname: string; mimetype: string },
    title?: string,
  ) {
    // can() needs the actual project row to evaluate PROJECTS_UPDATE (it's
    // resource-scoped — always false with no resource), so fetch-in-scope
    // must run before the permission check, not after.
    const project = await this.assertProjectInScope(user, projectId);
    if (!can(user, Permissions.PROJECTS_UPDATE, project)) {
      throw { status: 403, message: 'Forbidden: Missing projects.update permission' };
    }

    const { processedBuffer, filename } = await processImageBuffer(file.buffer);
    const imageUrl = await getStorageService('projects-layout').upload(
      processedBuffer,
      filename,
      'image/webp',
    );

    return await p.$transaction(async (tx: import('@prisma/client').Prisma.TransactionClient) => {
      const isFirstImage =
        (await tx.projectLayoutImage.count({ where: { project_id: projectId } })) === 0;
      return await tx.projectLayoutImage.create({
        data: {
          project_id: projectId,
          image_url: imageUrl,
          title: title || null,
          is_primary: isFirstImage, // first upload for a project becomes primary by default
          uploaded_by_id: user.employeeId,
        },
      });
    });
  }

  static async listLayoutImages(user: TokenPayload, projectId: number) {
    await this.assertProjectInScope(user, projectId);

    return await p.projectLayoutImage.findMany({
      where: { project_id: projectId },
      orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
      include: {
        // Pins on ProjectUnit rows; legacy Property pins (pre-rebuild) are left out.
        regions: {
          where: { project_unit_id: { not: null } },
          include: {
            project_unit: {
              select: {
                id: true,
                unit_code: true,
                unit_number: true,
                unit_type: true,
                tower: true,
                block: true,
                facing: true,
                sales_status: true,
                final_price: true,
              },
            },
          },
        },
      },
    });
  }

  static async deleteLayoutImage(user: TokenPayload, projectId: number, imageId: number) {
    const project = await this.assertProjectInScope(user, projectId);
    if (!can(user, Permissions.PROJECTS_UPDATE, project)) {
      throw { status: 403, message: 'Forbidden: Missing projects.update permission' };
    }

    const image = await p.projectLayoutImage.findFirst({
      where: { id: imageId, project_id: projectId },
    });
    if (!image) throw { status: 404, message: 'Layout image not found' };

    await p.projectLayoutImage.delete({ where: { id: imageId } });

    try {
      await getStorageService('projects-layout').delete(image.image_url);
    } catch (err) {
      // Non-fatal: the DB record (and its regions, via cascade) is already gone;
      // an orphaned file on disk is a hygiene issue, not a correctness one.
      logger.warn(`Failed to delete layout image file for image ${imageId}`, err);
    }

    return { deleted: true };
  }

  static async upsertLayoutRegions(
    user: TokenPayload,
    projectId: number,
    imageId: number,
    regions: { project_unit_id: number; x: number; y: number }[],
  ) {
    const project = await this.assertProjectInScope(user, projectId);
    if (!can(user, Permissions.PROJECTS_UPDATE, project)) {
      throw { status: 403, message: 'Forbidden: Missing projects.update permission' };
    }

    const image = await p.projectLayoutImage.findFirst({
      where: { id: imageId, project_id: projectId },
    });
    if (!image) throw { status: 404, message: 'Layout image not found' };

    const failed: { index: number; error: string }[] = [];
    let saved = 0;

    await p.$transaction(async (tx: import('@prisma/client').Prisma.TransactionClient) => {
      for (let i = 0; i < regions.length; i++) {
        const region = regions[i];
        try {
          if (!(region.x >= 0 && region.x <= 1) || !(region.y >= 0 && region.y <= 1)) {
            throw new Error('x and y must be fractional coordinates between 0 and 1');
          }
          // Was tx.property â€” the old unit model â€” so no current unit could be pinned.
          const unit = await tx.projectUnit.findFirst({
            where: { id: region.project_unit_id, project_id: projectId },
          });
          if (!unit)
            throw new Error(`Unit ${region.project_unit_id} is not a unit of this project`);

          await tx.propertyLayoutRegion.upsert({
            where: {
              layout_image_id_project_unit_id: {
                layout_image_id: imageId,
                project_unit_id: region.project_unit_id,
              },
            },
            update: { x: region.x, y: region.y },
            create: {
              layout_image_id: imageId,
              project_unit_id: region.project_unit_id,
              x: region.x,
              y: region.y,
              created_by_id: user.employeeId,
            },
          });
          saved++;
        } catch (err: any) {
          failed.push({ index: i, error: err?.message || 'Unknown error saving this region' });
        }
      }
    });

    return { saved, total: regions.length, failed };
  }

  static async deleteLayoutRegion(user: TokenPayload, regionId: number) {
    const region = await p.propertyLayoutRegion.findUnique({
      where: { id: regionId },
      include: { layout_image: { select: { project_id: true } } },
    });
    if (!region) throw { status: 404, message: 'Region not found' };

    const project = await this.assertProjectInScope(user, region.layout_image.project_id);
    if (!can(user, Permissions.PROJECTS_UPDATE, project)) {
      throw { status: 403, message: 'Forbidden: Missing projects.update permission' };
    }
    await p.propertyLayoutRegion.delete({ where: { id: regionId } });
    return { deleted: true };
  }

  /**
   * Stores one Project Media file by kind. Images are re-encoded to WebP as
   * before; a brochure or plan may also be a PDF and a video an MP4/WebM/MOV
   * (these used to be refused — the route accepted images only). PDF and
   * video bytes are checked for their real signature, not just the name.
   */
  private static async storeMediaFile(
    file: { buffer: Buffer; originalname: string; mimetype: string },
    kind: string,
  ): Promise<string> {
    const bad = (message: string) => ({ status: 400, message });
    const head = file.buffer.subarray(0, 12);
    const isPdf = file.mimetype === 'application/pdf';
    const isVideo = file.mimetype.startsWith('video/');
    const isImage = file.mimetype.startsWith('image/');

    const allowed: Record<string, Array<'image' | 'pdf' | 'video'>> = {
      COVER: ['image'],
      GALLERY: ['image'],
      VIDEO: ['video'],
      BROCHURE: ['pdf', 'image'],
      MASTER_PLAN: ['image', 'pdf'],
      LAYOUT_PLAN: ['image', 'pdf'],
      FLOOR_PLAN: ['image', 'pdf'],
    };
    const ok = allowed[kind] || ['image'];
    const type = isPdf ? 'pdf' : isVideo ? 'video' : isImage ? 'image' : null;
    if (!type || !ok.includes(type)) {
      throw bad(
        kind === 'VIDEO'
          ? 'Upload a video (MP4, WebM or MOV).'
          : ok.includes('pdf')
            ? 'Upload a PDF or an image.'
            : 'Upload an image (JPG, PNG, WebP or GIF).',
      );
    }

    if (type === 'image') {
      if (file.buffer.length > PROJECT_MEDIA_LIMITS.IMAGE) throw bad('Images can be up to 10 MB.');
      const { processedBuffer, filename } = await processImageBuffer(file.buffer);
      return getStorageService('projects-media').upload(processedBuffer, filename, 'image/webp');
    }
    if (type === 'pdf') {
      if (file.buffer.length > PROJECT_MEDIA_LIMITS.PDF) throw bad('PDFs can be up to 20 MB.');
      if (head.subarray(0, 4).toString('latin1') !== '%PDF')
        throw bad('That file is not a valid PDF.');
    } else {
      if (file.buffer.length > PROJECT_MEDIA_LIMITS.VIDEO) throw bad('Videos can be up to 50 MB.');
      const isMp4OrMov = head.subarray(4, 8).toString('latin1') === 'ftyp';
      const isWebm = head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
      if (!isMp4OrMov && !isWebm) throw bad('That file is not a valid MP4, WebM or MOV video.');
    }
    const ext =
      type === 'pdf'
        ? 'pdf'
        : file.mimetype === 'video/webm'
          ? 'webm'
          : file.mimetype === 'video/quicktime'
            ? 'mov'
            : 'mp4';
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    return getStorageService('projects-media').upload(file.buffer, filename, file.mimetype);
  }

  static async uploadMedia(
    user: TokenPayload,
    projectId: number,
    file: { buffer: Buffer; originalname: string; mimetype: string },
    kind: string,
    title?: string,
  ) {
    const project = await this.assertProjectInScope(user, projectId);
    if (!can(user, Permissions.PROJECTS_UPDATE, project)) {
      throw { status: 403, message: 'Forbidden: Missing projects.update permission' };
    }
    const url = await this.storeMediaFile(file, kind);
    const media = await p.projectMedia.create({
      data: {
        project_id: projectId,
        kind: kind as any,
        url,
        title: title || null,
        uploaded_by_id: user.employeeId,
      },
    });
    if (kind === 'COVER') {
      await p.project.update({ where: { id: projectId }, data: { cover_image_url: url } });
    }
    return media;
  }

  static async listMedia(user: TokenPayload, projectId: number) {
    await this.assertProjectInScope(user, projectId);
    return await p.projectMedia.findMany({
      where: { project_id: projectId },
      orderBy: [{ kind: 'asc' }, { sort_order: 'asc' }, { created_at: 'asc' }],
    });
  }

  static async deleteMedia(user: TokenPayload, projectId: number, mediaId: number) {
    const project = await this.assertProjectInScope(user, projectId);
    if (!can(user, Permissions.PROJECTS_UPDATE, project)) {
      throw { status: 403, message: 'Forbidden: Missing projects.update permission' };
    }
    const media = await p.projectMedia.findFirst({ where: { id: mediaId, project_id: projectId } });
    if (!media) throw { status: 404, message: 'Media not found' };
    await p.projectMedia.delete({ where: { id: mediaId } });
    if (project.cover_image_url === media.url) {
      await p.project.update({ where: { id: projectId }, data: { cover_image_url: null } });
    }
    try {
      await getStorageService('projects-media').delete(media.url);
    } catch (err) {
      logger.warn({ err, mediaId }, 'Failed to delete project media file from storage');
    }
    return { deleted: true };
  }

  static async uploadDocument(
    user: TokenPayload,
    projectId: number,
    file: { buffer: Buffer; originalname: string; mimetype: string },
    kind: string,
    title?: string,
  ) {
    const project = await this.assertProjectInScope(user, projectId);
    if (!can(user, Permissions.PROJECTS_UPDATE, project)) {
      throw { status: 403, message: 'Forbidden: Missing projects.update permission' };
    }
    // Any extension used to be accepted and stored as-is, then served from
    // the API's own origin -- an uploaded .html/.svg/.js would run there,
    // next to the refresh-token cookie. Documents are limited to office
    // formats and images.
    const ext = (file.originalname.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_DOCUMENT_EXTENSIONS.has(ext)) {
      throw {
        status: 400,
        message: 'Unsupported file type. Upload a PDF, Word, Excel, PowerPoint or image file.',
      };
    }
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const url = await getStorageService('projects-documents').upload(
      file.buffer,
      filename,
      file.mimetype,
    );
    return await p.projectDocument.create({
      data: {
        project_id: projectId,
        kind: kind as any,
        url,
        title: title || file.originalname,
        uploaded_by_id: user.employeeId,
      },
    });
  }

  static async listDocuments(user: TokenPayload, projectId: number) {
    await this.assertProjectInScope(user, projectId);
    return await p.projectDocument.findMany({
      where: { project_id: projectId },
      orderBy: [{ kind: 'asc' }, { created_at: 'asc' }],
    });
  }

  static async deleteDocument(user: TokenPayload, projectId: number, documentId: number) {
    const project = await this.assertProjectInScope(user, projectId);
    if (!can(user, Permissions.PROJECTS_UPDATE, project)) {
      throw { status: 403, message: 'Forbidden: Missing projects.update permission' };
    }
    const doc = await p.projectDocument.findFirst({
      where: { id: documentId, project_id: projectId },
    });
    if (!doc) throw { status: 404, message: 'Document not found' };
    await p.projectDocument.delete({ where: { id: documentId } });
    try {
      await getStorageService('projects-documents').delete(doc.url);
    } catch (err) {
      logger.warn({ err, documentId }, 'Failed to delete project document file from storage');
    }
    return { deleted: true };
  }

  /**
   * The project's history as plain lines: field changes made after approval
   * (see projectChangeLog.ts), status changes and PM reassignments. The raw
   * request log (auditWrites, action "PUT /api/v1/...") is left out — its
   * entity_id is whatever id ended the URL, so it does not belong to one
   * project.
   */
  static async listActivity(user: TokenPayload, projectId: number) {
    await this.assertProjectInScope(user, projectId);
    const events = await p.auditEvent.findMany({
      where: {
        entity_type: 'PROJECT',
        entity_id: projectId,
        OR: [
          { action: { in: ['STATUS_CHANGE', 'REASSIGNMENT'] } },
          { action: { startsWith: 'DETAILS_CHANGE:' } },
          { action: { startsWith: 'PRICING_CHANGE:' } },
          { action: { startsWith: 'UNITS_CHANGE:' } },
        ],
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: 500,
    });
    const pmIds = events
      .filter((e) => e.action === 'REASSIGNMENT')
      .flatMap((e) => [Number(e.old_value), Number(e.new_value)])
      .filter((n) => Number.isInteger(n) && n > 0);
    const actorIds = [...new Set([...events.map((e) => e.actor_id), ...pmIds])];
    const people = await p.employee.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, full_name: true },
    });
    const nameById = new Map(people.map((a) => [a.id, a.full_name]));
    const nameOf = (v: string | null) => (v && nameById.get(Number(v))) || v || '—';
    return events.map((e) => {
      const [kind, ...rest] = e.action.split(':');
      const field = rest.join(':');
      const area = kind.replace('_CHANGE', '');
      const base = {
        id: e.id,
        created_at: e.created_at,
        actor_id: e.actor_id,
        actor_name: nameById.get(e.actor_id) || null,
        reason: e.reason,
      };
      if (e.action === 'STATUS_CHANGE')
        return {
          ...base,
          area: 'DETAILS',
          field: 'Construction status',
          before: e.old_value,
          after: e.new_value,
        };
      if (e.action === 'REASSIGNMENT')
        return {
          ...base,
          area: 'DETAILS',
          field: 'Project manager',
          before: nameOf(e.old_value),
          after: nameOf(e.new_value),
        };
      return { ...base, area, field, before: e.old_value, after: e.new_value };
    });
  }
}
