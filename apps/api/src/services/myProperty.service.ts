import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { AppError } from './lead/errors';
import { generateCustomerToken, passwordFingerprint } from '../utils/customerJwt';
import { notifyEmployee } from '../utils/notifyEmployee';
import { logger } from '../utils/logger';

// My Property portal: what a customer (buyer) can do and see. Every read is
// scoped to the logged-in customer's own records.

/** The 10 digits of an Indian mobile however it was typed or stored. */
const tenDigits = (raw: string) => {
  const d = (raw || '').replace(/\D/g, '');
  return d.length > 10 ? d.slice(-10) : d;
};

const brandOf = (company: { name: string; code: string }) =>
  /sonthillu/i.test(company.name) || /^SON/i.test(company.code) ? 'sonthillu' : 'rrh';

const LEGAL_CONTACT_FIELDS = ['support_email', 'support_phone', 'legal_name'] as const;

function companyView(company: { id: number; name: string; code: string; legal_info?: any }) {
  const legal = (company.legal_info as Record<string, unknown> | null) || {};
  const contact: Record<string, string> = {};
  for (const k of LEGAL_CONTACT_FIELDS) {
    if (typeof legal[k] === 'string' && legal[k]) contact[k] = legal[k] as string;
  }
  return { id: company.id, name: company.name, brand: brandOf(company), ...contact };
}

function issue(customer: {
  id: number;
  company_id: number;
  password_hash: string | null;
  force_password_reset: boolean;
}) {
  return generateCustomerToken({
    customerId: customer.id,
    companyId: customer.company_id,
    pwf: passwordFingerprint(customer.password_hash || ''),
    mustChange: customer.force_password_reset,
  });
}

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/;

export class MyPropertyService {
  static async login(phone: string, password: string, companyId?: number) {
    const digits = tenDigits(phone);
    if (digits.length !== 10) throw new AppError(400, 'Enter your 10-digit mobile number');

    const candidates = await prisma.customer.findMany({
      where: {
        status: 'ACTIVE',
        password_hash: { not: null },
        phone: { in: [digits, `91${digits}`, `+91${digits}`, `0${digits}`, `+91 ${digits}`] },
        ...(companyId ? { company_id: companyId } : {}),
      },
      include: { company: { select: { id: true, name: true, code: true, legal_info: true } } },
    });

    const matches = [];
    for (const c of candidates) {
      if (await bcrypt.compare(password, c.password_hash!)) matches.push(c);
    }
    // Same message for "no such number" and "wrong password".
    if (matches.length === 0) throw new AppError(401, 'Mobile number or password is incorrect');
    if (matches.length > 1) {
      // A buyer with both companies using the same password picks which one.
      return {
        chooseCompany: matches.map((m) => ({ id: m.company_id, name: m.company.name })),
      };
    }

    const customer = matches[0];
    if (
      customer.force_password_reset &&
      customer.temp_password_expiry &&
      customer.temp_password_expiry < new Date()
    ) {
      throw new AppError(
        401,
        'Your temporary password has expired. Please ask your relationship manager for a new one.',
      );
    }
    return {
      token: issue(customer),
      mustChangePassword: customer.force_password_reset,
      customer: MyPropertyService.profile(customer),
      company: companyView(customer.company),
    };
  }

  static async changePassword(customer: any, current: string, next: string) {
    if (!(await bcrypt.compare(current, customer.password_hash))) {
      throw new AppError(400, 'Current password is incorrect');
    }
    if (!PASSWORD_RULE.test(next)) {
      throw new AppError(400, 'Use at least 8 characters with letters and numbers');
    }
    if (current === next)
      throw new AppError(400, 'Choose a password different from the current one');
    const updated = await prisma.customer.update({
      where: { id: customer.id },
      data: {
        password_hash: await bcrypt.hash(next, 12),
        force_password_reset: false,
        temp_password_expiry: null,
      },
    });
    if (customer.force_password_reset) {
      // First real login: let the staff see the portal is in use.
      await prisma.customerNotification.create({
        data: {
          company_id: customer.company_id,
          customer_id: customer.id,
          type: 'PORTAL_ACTIVATED',
          title: 'Welcome to My Property',
          message:
            'Your account is ready. You can follow your property, payments and updates here.',
        },
      });
    }
    return { token: issue(updated) };
  }

  static profile(c: any) {
    return {
      id: c.id,
      code: c.customer_code,
      name: [c.first_name, c.last_name].filter(Boolean).join(' '),
      phone: c.phone,
      email: c.email,
      kycStatus: c.kyc_status,
      mustChangePassword: c.force_password_reset,
    };
  }

  static async me(customer: any) {
    const company = await prisma.company.findUnique({
      where: { id: customer.company_id },
      select: { id: true, name: true, code: true, legal_info: true },
    });
    const unread = await prisma.customerNotification.count({
      where: { customer_id: customer.id, is_read: false, is_dismissed: false },
    });
    return {
      customer: MyPropertyService.profile(customer),
      company: company ? companyView(company) : null,
      unreadNotifications: unread,
    };
  }

  static async updateProfile(customer: any, data: { email?: string | null }) {
    const updated = await prisma.customer.update({
      where: { id: customer.id },
      data: { email: data.email?.trim() || null },
    });
    return { customer: MyPropertyService.profile(updated) };
  }

  // ─── Bookings ────────────────────────────────────────────────────────────

  private static bookingInclude = {
    property: {
      select: {
        id: true,
        property_code: true,
        title: true,
        location: true,
        category: true,
        area_sqft: true,
        area_sqyd: true,
        facing: true,
        images: {
          where: { status: { not: 'REJECTED' } },
          orderBy: [{ is_primary: 'desc' as const }, { sort_order: 'asc' as const }],
          take: 6,
          select: { image_url: true },
        },
        project: { select: { id: true, name: true, location: true, cover_image_url: true } },
      },
    },
    project_unit: {
      select: {
        id: true,
        unit_code: true,
        unit_number: true,
        unit_type: true,
        bhk: true,
        facing: true,
        area_sqft: true,
        area_sqyd: true,
        plot_area_sqyd: true,
        project: {
          select: {
            id: true,
            name: true,
            location: true,
            cover_image_url: true,
            rera_number: true,
            status: true,
            completion_date: true,
          },
        },
      },
    },
    assigned_employee: { select: { full_name: true, phone: true } },
    installments: { orderBy: { installment_number: 'asc' as const } },
    payments: {
      where: { status: { in: ['SUCCESS', 'PENDING'] } },
      orderBy: { payment_date: 'desc' as const },
      select: {
        id: true,
        payment_code: true,
        amount: true,
        payment_method: true,
        reference_number: true,
        payment_date: true,
        status: true,
        installment_id: true,
      },
    },
  };

  private static summarise(b: any) {
    const project = b.project_unit?.project || b.property?.project || null;
    const paid = b.payments
      .filter((p: any) => p.status === 'SUCCESS')
      .reduce((s: number, p: any) => s + p.amount, 0);
    const total = b.total_cost || b.agreed_price;
    const cancelled = b.status === 'CANCELLED';
    const next = cancelled
      ? null
      : b.installments.find((i: any) =>
          ['PENDING', 'PARTIALLY_RECEIVED', 'OVERDUE'].includes(i.status),
        );
    const today = new Date();
    return {
      id: b.id,
      code: b.booking_code,
      status: b.status,
      bookedOn: b.legacy_booking_date || b.booking_date,
      title:
        b.property?.title ||
        (b.project_unit
          ? `${project?.name || 'Unit'} · ${b.project_unit.unit_number}`
          : 'Property'),
      unit: b.project_unit
        ? {
            number: b.project_unit.unit_number,
            type: b.project_unit.unit_type,
            bhk: b.project_unit.bhk,
            facing: b.project_unit.facing,
            areaSqyd: b.project_unit.plot_area_sqyd || b.project_unit.area_sqyd,
            areaSqft: b.project_unit.area_sqft,
          }
        : null,
      plotNo: b.plot_no,
      location: project?.location || b.property?.location || null,
      project: project
        ? {
            id: project.id,
            name: project.name,
            reraNumber: project.rera_number || null,
            status: project.status || null,
            completionDate: project.completion_date || null,
          }
        : null,
      image: b.property?.images?.[0]?.image_url || project?.cover_image_url || null,
      totals: {
        total,
        paid,
        due: cancelled ? 0 : Math.max(0, total - paid),
        bookingAmount: b.booking_amount,
      },
      nextInstallment: next
        ? {
            number: next.installment_number,
            dueDate: next.due_date,
            amount: next.expected_amount - next.received_amount,
            overdue: next.status === 'OVERDUE' || new Date(next.due_date) < today,
          }
        : null,
      relationshipManager: b.assigned_employee
        ? { name: b.assigned_employee.full_name, phone: b.assigned_employee.phone }
        : null,
    };
  }

  static async bookings(customer: any) {
    const rows = await prisma.booking.findMany({
      where: {
        customer_id: customer.id,
        company_id: customer.company_id,
        status: { not: 'DRAFT' },
      },
      include: MyPropertyService.bookingInclude,
      orderBy: { booking_date: 'desc' },
    });
    return { bookings: rows.map(MyPropertyService.summarise) };
  }

  static async booking(customer: any, id: number) {
    const b = await prisma.booking.findFirst({
      where: {
        id,
        customer_id: customer.id,
        company_id: customer.company_id,
        status: { not: 'DRAFT' },
      },
      include: MyPropertyService.bookingInclude,
    });
    if (!b) throw new AppError(404, 'Booking not found');

    const projectId = b.project_unit?.project?.id || b.property?.project?.id;
    const [documents, media] = projectId
      ? await Promise.all([
          prisma.projectDocument.findMany({
            where: { project_id: projectId },
            orderBy: { created_at: 'desc' },
            select: { id: true, kind: true, title: true, url: true, created_at: true },
          }),
          prisma.projectMedia.findMany({
            where: { project_id: projectId, kind: { not: 'VIDEO' } },
            orderBy: [{ kind: 'asc' }, { sort_order: 'asc' }],
            select: { id: true, kind: true, title: true, url: true },
          }),
        ])
      : [[], []];

    return {
      booking: {
        ...MyPropertyService.summarise(b),
        pricing: {
          agreedPrice: b.agreed_price,
          totalCost: b.total_cost,
          bookingAmount: b.booking_amount,
          pricePerSqyd: b.sale_price_per_sqyd,
          emiMonths: b.emi_months,
          emiAmount: b.emi_charges,
        },
        installments: b.installments.map((i: any) => ({
          id: i.id,
          number: i.installment_number,
          dueDate: i.due_date,
          amount: i.expected_amount,
          received: i.received_amount,
          receivedOn: i.received_date,
          status: i.status,
        })),
        payments: b.payments.map((p: any) => ({
          id: p.id,
          code: p.payment_code,
          amount: p.amount,
          method: p.payment_method,
          reference: p.reference_number,
          date: p.payment_date,
          status: p.status,
          installmentId: p.installment_id,
        })),
        documents,
        media,
        images: b.property?.images?.map((i: any) => i.image_url) || [],
      },
    };
  }

  // ─── Notifications ───────────────────────────────────────────────────────

  static async notifications(customer: any) {
    const rows = await prisma.customerNotification.findMany({
      where: { customer_id: customer.id, is_dismissed: false },
      orderBy: { created_at: 'desc' },
      take: 100,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        is_read: true,
        booking_id: true,
        created_at: true,
      },
    });
    return { notifications: rows };
  }

  static async markRead(customer: any, ids: number[] | 'all') {
    await prisma.customerNotification.updateMany({
      where: { customer_id: customer.id, ...(ids === 'all' ? {} : { id: { in: ids } }) },
      data: { is_read: true },
    });
    return { ok: true };
  }

  // ─── Requests (complaints) ───────────────────────────────────────────────

  static async requests(customer: any) {
    const rows = await prisma.complaint.findMany({
      where: { customer_id: customer.id, company_id: customer.company_id },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        complaint_code: true,
        title: true,
        description: true,
        category: true,
        status: true,
        resolution_description: true,
        booking_id: true,
        created_at: true,
        resolved_at: true,
      },
    });
    return { requests: rows };
  }

  static async createRequest(
    customer: any,
    data: { title: string; description?: string; category?: string; booking_id?: number },
  ) {
    let booking: { id: number; property_id: number | null; project_unit_id: number | null } | null =
      null;
    if (data.booking_id) {
      booking = await prisma.booking.findFirst({
        where: { id: data.booking_id, customer_id: customer.id },
        select: { id: true, property_id: true, project_unit_id: true, assigned_employee_id: true },
      });
      if (!booking) throw new AppError(404, 'Booking not found');
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const year = new Date().getFullYear();
        const count = await prisma.complaint.count({ where: { company_id: customer.company_id } });
        const hex = crypto.randomBytes(2).toString('hex').toUpperCase();
        const complaint = await prisma.complaint.create({
          data: {
            complaint_code: `RRH-CMP-${year}-${String(count + 1).padStart(4, '0')}-${hex}`,
            company_id: customer.company_id,
            customer_id: customer.id,
            title: data.title.trim(),
            description: data.description?.trim() || null,
            category: data.category || null,
            priority: 'MEDIUM',
            status: 'OPEN',
            booking_id: booking?.id ?? null,
            property_id: booking?.property_id ?? null,
            project_unit_id: booking?.project_unit_id ?? null,
            assigned_employee_id: (booking as any)?.assigned_employee_id ?? null,
          },
        });
        // Someone on the team has to see it: the booking's employee, else
        // whoever looks after the customer.
        const staffId = complaint.assigned_employee_id ?? customer.assigned_to_id ?? null;
        if (staffId) {
          notifyEmployee(staffId, {
            type: 'CUSTOMER_REQUEST',
            title: 'New request from a customer',
            message: `${customer.first_name}: ${complaint.title} (${complaint.complaint_code})`,
            link: '/complaints',
          }).catch((err) => logger.warn('Customer request notify failed', err));
        }
        return {
          request: { id: complaint.id, code: complaint.complaint_code, status: complaint.status },
        };
      } catch (err: any) {
        if (err?.code === 'P2002') continue;
        throw err;
      }
    }
    throw new AppError(500, 'Could not save your request, please try again');
  }
}
