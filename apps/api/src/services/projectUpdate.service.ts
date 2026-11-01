import { prisma } from '../lib/prisma';
import { TokenPayload } from '../utils/jwt';
import { Permissions } from '../shared';
import { can } from '../authz/authorization';
import { buildProjectScope } from '../authz/dataScope';
import { getStorageService, processImageBuffer } from './storage.service';
import { AppError } from './lead/errors';

// My Property: construction progress and announcements staff post for a
// project. Buyers see them in the portal and get a notification for each one.

export const PROJECT_UPDATE_KINDS = ['PROGRESS', 'ANNOUNCEMENT'] as const;
export const MAX_UPDATE_PHOTOS = 6;

/** Bookings that make someone a buyer of the project (what the portal shows). */
const buyerBookings = (projectId: number, companyId: number) => ({
  company_id: companyId,
  status: { notIn: ['DRAFT', 'CANCELLED'] },
  OR: [{ project_unit: { project_id: projectId } }, { property: { project_id: projectId } }],
});

/** The notification a post sends; also how a removed post's notifications are found. */
const noticeTitle = (projectName: string, title: string) =>
  `${projectName}: ${title}`.slice(0, 190);

async function projectInScope(user: TokenPayload, projectId: number) {
  const scope = await buildProjectScope(user);
  const project = await prisma.project.findFirst({ where: { id: projectId, ...scope } });
  if (!project) throw new AppError(404, 'Project not found');
  return project;
}

export class ProjectUpdateService {
  static async list(user: TokenPayload, projectId: number) {
    await projectInScope(user, projectId);
    const [updates, buyers] = await Promise.all([
      prisma.projectUpdate.findMany({
        where: { project_id: projectId },
        orderBy: { created_at: 'desc' },
        take: 100,
        include: { posted_by: { select: { id: true, full_name: true } } },
      }),
      ProjectUpdateService.buyerIds(projectId, user.companyId),
    ]);
    return { updates, buyerCount: buyers.length };
  }

  static async post(
    user: TokenPayload,
    projectId: number,
    dto: { kind: string; title: string; message: string },
    files: { buffer: Buffer }[],
  ) {
    const project = await projectInScope(user, projectId);
    if (!can(user, Permissions.PROJECTS_UPDATE, project)) {
      throw new AppError(403, 'You cannot post updates for this project');
    }
    if (files.length > MAX_UPDATE_PHOTOS) {
      throw new AppError(400, `Add at most ${MAX_UPDATE_PHOTOS} photos`);
    }

    const storage = getStorageService('projects-media'); // already served at /uploads/projects-media
    const photos: string[] = [];
    for (const [i, f] of files.entries()) {
      const processed = await processImageBuffer(f.buffer).catch(() => null);
      if (!processed) {
        throw new AppError(400, `Photo ${i + 1} could not be read. Use a JPG or PNG photo.`);
      }
      photos.push(
        await storage.upload(processed.processedBuffer, processed.filename, 'image/webp'),
      );
    }

    const buyers = await prisma.booking.findMany({
      where: buyerBookings(projectId, project.company_id),
      select: { id: true, customer_id: true },
      orderBy: { id: 'desc' },
    });
    const bookingOf = new Map<number, number>();
    for (const b of buyers) if (!bookingOf.has(b.customer_id)) bookingOf.set(b.customer_id, b.id);

    const title = dto.title.trim();
    const message = dto.message.trim();
    return prisma.$transaction(async (tx) => {
      const update = await tx.projectUpdate.create({
        data: {
          company_id: project.company_id,
          project_id: projectId,
          kind: dto.kind,
          title,
          message,
          photos: photos.length ? photos : undefined,
          notified_count: bookingOf.size,
          posted_by_id: user.employeeId,
        },
      });
      if (bookingOf.size) {
        await tx.customerNotification.createMany({
          data: [...bookingOf].map(([customerId, bookingId]) => ({
            company_id: project.company_id,
            customer_id: customerId,
            booking_id: bookingId,
            type: 'PROJECT_UPDATE',
            title: noticeTitle(project.name, title),
            message: message.length > 500 ? `${message.slice(0, 497)}...` : message,
          })),
        });
      }
      await tx.auditEvent.create({
        data: {
          actor_id: user.employeeId,
          action: 'PROJECT_UPDATE_POSTED',
          entity_type: 'PROJECT',
          entity_id: projectId,
          new_value: JSON.stringify({ id: update.id, kind: dto.kind, notified: bookingOf.size }),
        },
      });
      return { update };
    });
  }

  /** Takes the post off the portal and hides the notifications it sent. */
  static async remove(user: TokenPayload, projectId: number, updateId: number) {
    const project = await projectInScope(user, projectId);
    if (!can(user, Permissions.PROJECTS_UPDATE, project)) {
      throw new AppError(403, 'You cannot remove updates for this project');
    }
    const found = await prisma.projectUpdate.findFirst({
      where: { id: updateId, project_id: projectId },
    });
    if (!found) throw new AppError(404, 'Update not found');
    const at = found.created_at.getTime();
    await prisma.$transaction([
      prisma.projectUpdate.delete({ where: { id: updateId } }),
      // Sent in the same transaction as the post, so within moments of it.
      prisma.customerNotification.updateMany({
        where: {
          company_id: found.company_id,
          type: 'PROJECT_UPDATE',
          title: noticeTitle(project.name, found.title),
          created_at: { gte: new Date(at - 5_000), lte: new Date(at + 60_000) },
        },
        data: { is_dismissed: true, dismissed_at: new Date() },
      }),
    ]);
    await prisma.auditEvent.create({
      data: {
        actor_id: user.employeeId,
        action: 'PROJECT_UPDATE_REMOVED',
        entity_type: 'PROJECT',
        entity_id: projectId,
        old_value: JSON.stringify({ id: found.id, title: found.title }),
      },
    });
    return { ok: true };
  }

  static async buyerIds(projectId: number, companyId: number) {
    const rows = await prisma.booking.findMany({
      where: buyerBookings(projectId, companyId),
      select: { customer_id: true },
      distinct: ['customer_id'],
    });
    return rows.map((r) => r.customer_id);
  }

  /** For the portal: updates for every project the customer has bought in. */
  static async forCustomer(customer: { id: number; company_id: number }) {
    const bookings = await prisma.booking.findMany({
      where: {
        customer_id: customer.id,
        company_id: customer.company_id,
        status: { notIn: ['DRAFT', 'CANCELLED'] },
      },
      select: {
        project_unit: { select: { project_id: true } },
        property: { select: { project_id: true } },
      },
    });
    const projectIds = [
      ...new Set(
        bookings
          .map((b) => b.project_unit?.project_id ?? b.property?.project_id)
          .filter((id): id is number => !!id),
      ),
    ];
    if (!projectIds.length) return { updates: [] };
    const rows = await prisma.projectUpdate.findMany({
      where: { project_id: { in: projectIds }, company_id: customer.company_id },
      orderBy: { created_at: 'desc' },
      take: 50,
      select: {
        id: true,
        kind: true,
        title: true,
        message: true,
        photos: true,
        created_at: true,
        project: { select: { id: true, name: true } },
      },
    });
    return {
      updates: rows.map((r) => ({
        ...r,
        photos: Array.isArray(r.photos) ? (r.photos as string[]) : [],
      })),
    };
  }
}
