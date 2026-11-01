import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { TokenPayload } from '../utils/jwt';
import { CustomerService, AppError } from './customer.service';
import { generateWhatsAppLink } from '../utils/whatsapp';
import { buildCustomerScope } from '../authz/dataScope';

/**
 * §6 — Customer conversion & portal handoff (stub).
 *
 * On BOOKING_INITIATED → BOOKED the system must:
 *   1. Create a Customer record from the Lead (reused convert-to-customer logic).
 *   2. Generate default customer ID + password.
 *   3. Call the customer-portal provisioning endpoint.
 *   4. Send credentials + portal link to the customer (WhatsApp deep-link, §5).
 *
 * The customer portal is a SEPARATE application currently in development. Its
 * real API contract is TBD (spec §8 item #3). To keep the booking flow stable
 * we hide the outbound call behind `CustomerPortalProvisioner` and ship a no-op
 * stub now. Swapping in the real contract later means writing one new class —
 * nothing else in the booking flow changes.
 */
export interface CustomerPortalProvisioner {
  provision(input: CustomerPortalProvisionInput): Promise<CustomerPortalProvisionResult>;
}

export interface CustomerPortalProvisionInput {
  actorId: number;
  companyId: number;
  leadId: number;
  customerId: number;
  customerCode: string;
}

export interface CustomerPortalProvisionResult {
  provisioned: boolean;
  external_account_id?: string;
  provisioner: string;
}

/**
 * Stub provisioner — does NOT make a network call. It records intent in the
 * audit log and returns a synthetic result so the booking flow can complete
 * end-to-end in dev/test until the real portal contract is finalized.
 */
class StubCustomerPortalProvisioner implements CustomerPortalProvisioner {
  async provision(input: CustomerPortalProvisionInput): Promise<CustomerPortalProvisionResult> {
    await prisma.auditEvent.create({
      data: {
        actor_id: input.actorId,
        action: 'CUSTOMER_PORTAL_PROVISION_STUB',
        entity_type: 'CUSTOMER',
        entity_id: input.customerId,
        old_value: JSON.stringify({ status: 'PENDING_EXTERNAL_PROVISION' }),
        new_value: JSON.stringify({
          provisioner: 'stub',
          company_id: input.companyId,
          lead_id: input.leadId,
          customer_code: input.customerCode,
          note: 'Customer portal contract TBD (spec §8 item #3) — stub only. Credentials masked.',
        }),
      },
    });
    return { provisioned: false, provisioner: 'stub' };
  }
}

// Single switch-point for the real implementation later.
const provisioner: CustomerPortalProvisioner = new StubCustomerPortalProvisioner();

/** Where customers log in (the My Property portal). */
export const MY_PROPERTY_URL =
  process.env.MY_PROPERTY_URL || 'https://myproperty.sonthilluconstructions.com';
const TEMP_PASSWORD_HOURS = 24;

/** Gives the customer a new temporary password; they must change it on first login. */
async function setTemporaryPassword(tx: Prisma.TransactionClient, customerId: number) {
  const tempPassword = crypto.randomBytes(5).toString('hex'); // 10 chars
  await tx.customer.update({
    where: { id: customerId },
    data: {
      password_hash: await bcrypt.hash(tempPassword, 12),
      temp_password_expiry: new Date(Date.now() + TEMP_PASSWORD_HOURS * 60 * 60 * 1000),
      force_password_reset: true,
    },
  });
  return tempPassword;
}

const companyName = async (tx: Prisma.TransactionClient, companyId: number) =>
  (await tx.company.findUnique({ where: { id: companyId }, select: { name: true } }))?.name || 'us';

export class CustomerPortalService {
  /**
   * Convert the lead to a customer (reusing CustomerService) and attempt portal
   * provisioning. Runs inside the caller's transaction so a failure rolls back
   * the BOOKED status write too.
   */
  static async provisionStub(
    tx: Prisma.TransactionClient,
    lead: { id: number; company_id: number; customer_name: string; phone: string },
    user: TokenPayload,
  ): Promise<CustomerPortalProvisionResult> {
    // 1. Reuse existing convert-to-customer logic (handles idempotency via
    //    Customer.origin_lead_id unique constraint).
    const customer = await CustomerService.upsertFromLead(user, lead.id, tx);

    // 2-3. Temporary password (24 h), changed on first login
    const tempPassword = await setTemporaryPassword(tx, customer.id);

    // 4. Provision via the (stub) portal provisioner.
    const result = await provisioner.provision({
      actorId: user.employeeId,
      companyId: lead.company_id,
      leadId: lead.id,
      customerId: customer.id,
      customerCode: customer.customer_code,
    });

    // 5. Generate WhatsApp credential-delivery message for the PM to send manually
    const whatsappLink = generateWhatsAppLink(lead.phone, 'CREDENTIAL_DELIVERY', {
      customer_name: lead.customer_name,
      company_name: await companyName(tx, lead.company_id),
      portal_url: MY_PROPERTY_URL,
      phone: lead.phone,
      password: tempPassword,
    });

    await tx.leadActivity.create({
      data: {
        lead_id: lead.id,
        actor_id: user.employeeId,
        activity_type: 'CREDENTIALS_GENERATED',
        notes: `Customer portal credentials generated. PM must send this message manually: ${whatsappLink}`,
      },
    });

    return result;
  }

  /**
   * §6 — external trigger variant of {@link provisionStub}. Used by the HTTP
   * route POST /integrations/customer-portal/provision. Looks up the lead and
   * runs inside a fresh transaction (unlike the internal BOOKED hook which joins
   * the caller's transaction).
   */
  static async provisionStubForLead(user: TokenPayload, leadId: number) {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, company_id: user.companyId },
    });
    if (!lead) {
      throw new Error('Lead not found');
    }
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      return await CustomerPortalService.provisionStub(tx, lead, user);
    });
  }

  /**
   * "Give portal access" in the CRM: a fresh temporary password for an existing
   * customer, plus the WhatsApp message staff send them. Also used when a
   * customer forgets their password. Logs them out of every device.
   */
  static async issueAccess(user: TokenPayload, customerId: number) {
    const scope = await buildCustomerScope(user);
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, ...scope },
      select: {
        id: true,
        company_id: true,
        first_name: true,
        last_name: true,
        phone: true,
        status: true,
      },
    });
    if (!customer) throw new AppError(404, 'Customer not found');
    if (customer.status !== 'ACTIVE') {
      throw new AppError(400, 'This customer is not active, so they cannot get portal access');
    }
    return prisma.$transaction(async (tx) => {
      const password = await setTemporaryPassword(tx, customer.id);
      await tx.auditEvent.create({
        data: {
          actor_id: user.employeeId,
          action: 'CUSTOMER_PORTAL_ACCESS_ISSUED',
          entity_type: 'CUSTOMER',
          entity_id: customer.id,
          new_value: JSON.stringify({ expires_in_hours: TEMP_PASSWORD_HOURS }),
        },
      });
      const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ');
      return {
        password,
        expiresAt: new Date(Date.now() + TEMP_PASSWORD_HOURS * 60 * 60 * 1000),
        portalUrl: MY_PROPERTY_URL,
        whatsappLink: generateWhatsAppLink(customer.phone, 'CREDENTIAL_DELIVERY', {
          customer_name: customer.first_name || name,
          company_name: await companyName(tx, customer.company_id),
          portal_url: MY_PROPERTY_URL,
          phone: customer.phone,
          password,
        }),
      };
    });
  }
}
