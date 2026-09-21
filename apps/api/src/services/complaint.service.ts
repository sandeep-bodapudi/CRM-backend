// Complaint Management Service (Phase 14 - Packet 14-1)
// Authorized scope: Complaint Management only (backend).
// Reuses existing repository architecture: AppError, PrismaClient, AuditEvent,
// centralized lifecycle transition map, company isolation on every query.
import { prisma } from '../lib/prisma';
import { TokenPayload } from '../utils/jwt';
import { AppError } from './lead.service';
import { notifyEmployee } from '../utils/notifyEmployee';
import crypto from 'crypto';

const p = prisma;

// ---- Authorized constants (Packet 14-1) ----
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
const CLOSURE_REASONS = [
  'RESOLVED',
  'CUSTOMER_UNSATISFIED',
  'NOT_APPLICABLE',
  'CUSTOMER_WITHDRAWN',
] as const;

// ---- Single centralized lifecycle transition map (no SLA / no auto-transitions) ----
const TRANSITIONS: Record<string, string[]> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED'],
  IN_PROGRESS: ['RESOLVED'],
  RESOLVED: ['CLOSED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['IN_PROGRESS', 'RESOLVED'],
};

export class ComplaintService {
  /**
   * Repository-safe identifier generation: RRH-CMP-<YYYY>-<seq>-<4hex>
   * - sequence is company-scoped count (padded)
   * - 4-char random hex removes reliance on timestamps
   * - P2002 unique-constraint collisions are retried by create()
   */
  private static async generateComplaintCode(tx: any, companyId: number): Promise<string> {
    const year = new Date().getFullYear();
    const count = await tx.complaint.count({ where: { company_id: companyId } });
    const hex = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `RRH-CMP-${year}-${String(count + 1).padStart(4, '0')}-${hex}`;
  }

  private static async audit(
    tx: any,
    user: TokenPayload,
    action: string,
    entityId: number,
    oldValue: string | null,
    newValue: string | null,
  ) {
    await tx.auditEvent.create({
      data: {
        actor_id: user.employeeId,
        action,
        entity_type: 'Complaint',
        entity_id: entityId,
        old_value: oldValue,
        new_value: newValue,
        created_at: new Date(),
      },
    });
  }

  /** Company-scoped fetch; rejects cross-company access with 404 to avoid information disclosure. */
  private static async scopedGet(user: TokenPayload, id: number) {
    const c = await prisma.complaint.findFirst({
      where: { id, company_id: user.companyId },
      include: { customer: true, booking: true, property: true, assigned_employee: true },
    });
    if (!c) {
      throw new AppError(404, 'Complaint not found');
    }
    return c;
  }

  // ------------------------------------------------------------------ create
  static async create(
    user: TokenPayload,
    data: {
      customer_id: number;
      title: string;
      category?: string | null;
      description?: string | null;
      priority?: string | null;
      booking_id?: number | null;
      property_id?: number | null;
      assigned_employee_id?: number | null;
    },
  ) {
    // Company ownership validation for every linked entity
    const customer = await prisma.customer.findFirst({
      where: { id: data.customer_id, company_id: user.companyId },
    });
    if (!customer) {
      throw new AppError(403, 'Customer not found or cross-company access');
    }
    if (data.booking_id) {
      const b = await prisma.booking.findFirst({
        where: { id: data.booking_id, company_id: user.companyId },
      });
      if (!b) {
        throw new AppError(403, 'Booking not found or cross-company access');
      }
    }
    if (data.property_id) {
      const prop = await prisma.property.findFirst({
        where: { id: data.property_id, company_id: user.companyId },
      });
      if (!prop) {
        throw new AppError(403, 'Property not found or cross-company access');
      }
    }
    if (data.assigned_employee_id) {
      const emp = await prisma.employee.findFirst({
        where: { id: data.assigned_employee_id, company_id: user.companyId },
      });
      if (!emp) {
        throw new AppError(403, 'Employee not found or cross-company assignment');
      }
    }
    const priority = data.priority || 'MEDIUM';
    if (!(PRIORITIES as readonly string[]).includes(priority)) {
      throw new AppError(400, 'Invalid priority');
    }

    // Bounded P2002 retry for complaint_code uniqueness
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await prisma.$transaction(async (tx) => {
          const code = await ComplaintService.generateComplaintCode(tx, user.companyId);
          const complaint = await tx.complaint.create({
            data: {
              complaint_code: code,
              company_id: user.companyId,
              customer_id: data.customer_id,
              title: data.title,
              category: data.category ?? null,
              description: data.description ?? null,
              priority,
              status: 'OPEN',
              booking_id: data.booking_id ?? null,
              property_id: data.property_id ?? null,
              assigned_employee_id: data.assigned_employee_id ?? null,
            },
          });
          await ComplaintService.audit(
            tx,
            user,
            'created',
            complaint.id,
            null,
            complaint.complaint_code,
          );
          return complaint;
        });
      } catch (err: any) {
        if (err?.code === 'P2002') continue; // retry with a fresh code
        throw err;
      }
    }
    throw new AppError(409, 'Could not generate a unique complaint code');
  }

  // ------------------------------------------------------------------- list
  static async list(
    user: TokenPayload,
    options?: { status?: string; priority?: string; category?: string; customer_id?: number },
    take: number = 2000,
    skip: number = 0,
  ) {
    // Hard company scope on every list query
    const where: any = { company_id: user.companyId };
    if (options?.status) where.status = options.status;
    if (options?.priority) where.priority = options.priority;
    if (options?.category) where.category = options.category;
    if (options?.customer_id) {
      const c = await prisma.customer.findFirst({
        where: { id: options.customer_id, company_id: user.companyId },
      });
      if (!c) {
        throw new AppError(403, 'Cross-company customer filter');
      }
      where.customer_id = options.customer_id;
    }
    // `total` (of the full scoped/filtered set, not just this page) lets the
    // frontend know whether it got everything — see routes/leads.ts's GET /
    // for the same lesson learned there. Previously had no take/limit at
    // all, so every complaint ever filed for this company was fetched every
    // page load — ComplaintManagement.tsx renders via the shared DataTable,
    // which is already render-capped, but the fetch itself grew unbounded.
    const [complaints, total] = await Promise.all([
      prisma.complaint.findMany({
        where,
        take,
        skip,
        include: { customer: true, booking: true, property: true, assigned_employee: true },
        orderBy: { created_at: 'desc' },
      }),
      prisma.complaint.count({ where }),
    ]);
    return { complaints, total };
  }

  // ---------------------------------------------------------------- getById
  static async getById(user: TokenPayload, id: number) {
    return ComplaintService.scopedGet(user, id);
  }

  // ----------------------------------------------------------------- update
  static async update(
    user: TokenPayload,
    id: number,
    data: {
      title?: string;
      description?: string | null;
      category?: string | null;
      priority?: string | null;
    },
  ) {
    await ComplaintService.scopedGet(user, id);
    const next: any = {};
    if (data.title !== undefined) next.title = data.title;
    if (data.description !== undefined) next.description = data.description ?? null;
    if (data.category !== undefined) next.category = data.category ?? null;
    if (data.priority !== undefined) {
      if (data.priority !== null && !(PRIORITIES as readonly string[]).includes(data.priority)) {
        throw new AppError(400, 'Invalid priority');
      }
      next.priority = data.priority;
    }
    return prisma.complaint.update({ where: { id }, data: next });
  }

  // ----------------------------------------------------------------- assign
  static async assign(user: TokenPayload, id: number, employeeId: number) {
    const c = await ComplaintService.scopedGet(user, id);
    const emp = await prisma.employee.findFirst({
      where: { id: employeeId, company_id: user.companyId },
    });
    if (!emp) {
      throw new AppError(403, 'Employee not found or cross-company assignment');
    }
    if (!['OPEN', 'IN_PROGRESS', 'REOPENED'].includes(c.status)) {
      throw new AppError(400, `Cannot assign complaint in ${c.status} status`);
    }
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.complaint.update({
        where: { id },
        data: { assigned_employee_id: employeeId },
      });
      await ComplaintService.audit(
        tx,
        user,
        'assigned',
        id,
        c.assigned_employee_id?.toString() ?? null,
        String(employeeId),
      );
      return result;
    });

    // Was previously a silent DB write — the assignee had no way to know a
    // complaint had landed on them short of manually checking the list.
    if (employeeId !== c.assigned_employee_id) {
      await notifyEmployee(employeeId, {
        type: 'COMPLAINT_ASSIGNED',
        title: '📮 Complaint Assigned to You',
        message: `${c.complaint_code}: ${c.title}`,
        link: '/complaints',
      });
    }

    return updated;
  }

  // ------------------------------------------------------------ changeStatus
  static async changeStatus(user: TokenPayload, id: number, status: string) {
    const c = await ComplaintService.scopedGet(user, id);
    const allowed = TRANSITIONS[c.status] || [];
    if (!(allowed as string[]).includes(status)) {
      throw new AppError(400, `Invalid transition from ${c.status} to ${status}`);
    }
    const action = c.status === 'CLOSED' && status === 'REOPENED' ? 'reopened' : 'status_changed';
    return prisma.$transaction(async (tx) => {
      const updated = await tx.complaint.update({ where: { id }, data: { status } });
      await ComplaintService.audit(tx, user, action, id, c.status, status);
      return updated;
    });
  }

  // ---------------------------------------------------------------- resolve
  static async resolve(user: TokenPayload, id: number, resolutionDescription: string) {
    const c = await ComplaintService.scopedGet(user, id);
    if (!['OPEN', 'IN_PROGRESS', 'REOPENED'].includes(c.status)) {
      throw new AppError(400, `Cannot resolve complaint in ${c.status} status`);
    }
    // resolved_by is the acting authenticated employee (inherently same company)
    return prisma.$transaction(async (tx) => {
      const updated = await tx.complaint.update({
        where: { id },
        data: {
          status: 'RESOLVED',
          resolution_description: resolutionDescription,
          resolved_by: user.employeeId,
          resolved_at: new Date(),
        },
      });
      await ComplaintService.audit(tx, user, 'resolved', id, c.status, 'RESOLVED');
      return updated;
    });
  }

  // ------------------------------------------------------------------ close
  static async close(user: TokenPayload, id: number, closureReason?: string) {
    const c = await ComplaintService.scopedGet(user, id);
    if (c.status !== 'RESOLVED') {
      throw new AppError(400, 'Cannot close complaint that is not RESOLVED');
    }
    if (closureReason && !(CLOSURE_REASONS as readonly string[]).includes(closureReason)) {
      throw new AppError(400, 'Invalid closure_reason');
    }
    const reason = closureReason || 'RESOLVED';
    return prisma.$transaction(async (tx) => {
      const updated = await tx.complaint.update({
        where: { id },
        data: { status: 'CLOSED', closed_at: new Date(), closure_reason: reason },
      });
      await ComplaintService.audit(tx, user, 'closed', id, c.status, 'CLOSED');
      return updated;
    });
  }
}

export default ComplaintService;
