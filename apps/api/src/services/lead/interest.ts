import { prisma } from '../../lib/prisma';
import { TokenPayload } from '../../utils/jwt';
import { can } from '../../authz/authorization';
import { Permissions } from '../../shared';
import { MessageTemplateService } from '../messageTemplate.service';
import { AppError } from './errors';
import { normalizeIndianPhone } from '../../utils/phone';

const p = prisma;

/** Loads either a Property or a ProjectUnit, scoped to the lead's company, and
 * returns a common shape the WhatsApp text and activity notes can read from
 * either — so the two call sites below don't need parallel if/else blocks. */
async function loadInterestTarget(
  companyId: number,
  target: { propertyId?: number; projectUnitId?: number },
) {
  if (target.propertyId) {
    const property = await p.property.findFirst({
      where: { id: target.propertyId, company_id: companyId },
    });
    if (!property) throw new AppError(404, 'Property not found');
    return {
      kind: 'PROPERTY' as const,
      code: property.property_code,
      title: property.title,
      location: property.location,
      price: property.final_price,
      pmId: property.assigned_pm_id,
      property,
    };
  }

  const unit = await p.projectUnit.findFirst({
    where: { id: target.projectUnitId, company_id: companyId },
    include: {
      project: { select: { id: true, name: true, location: true, assigned_pm_id: true } },
    },
  });
  if (!unit) throw new AppError(404, 'Project unit not found');
  const label = unit.flat_number || unit.villa_number || unit.plot_number || unit.unit_number;
  return {
    kind: 'UNIT' as const,
    code: unit.unit_code,
    title: `${unit.project.name} — Unit ${label}`,
    location: unit.project.location,
    price: unit.final_price,
    pmId: unit.project.assigned_pm_id,
    unit,
  };
}

export async function sendWhatsAppProposal(
  user: TokenPayload,
  leadId: number,
  target: { propertyId?: number; projectUnitId?: number },
) {
  const lead = await p.lead.findFirst({
    where: { id: leadId },
    include: { assigned_to: true },
  });
  if (!lead) throw new AppError(404, 'Lead not found');

  if (!can(user, Permissions.LEADS_UPDATE, lead)) {
    throw new AppError(
      403,
      'Forbidden: You do not have permission to propose properties to this lead',
    );
  }

  const item = await loadInterestTarget(lead.company_id, target);
  const company = await p.company.findFirst({ where: { id: user.companyId } });

  // §5: resolve WhatsApp body from the MessageTemplate table (template_key
  // LEAD_PROPERTY_PROPOSAL), never from a hardcoded inline string. Falls back to
  // a safe situation-specific text containing the variables when no active template is configured.
  const templateKey = 'LEAD_PROPERTY_PROPOSAL';

  const formattedPrice = item.price ? `${(item.price / 100000).toFixed(1)} Lakhs` : 'On Request';

  const resolved = await MessageTemplateService.resolveWithFallback(templateKey, {
    customer_name: lead.customer_name ?? '',
    customer_phone: lead.phone ?? '',
    property_name: item.title ?? '',
    property_location: item.location ?? '',
    property_price: formattedPrice,
    property_code: item.code ?? '',
    pm_name: item.pmId
      ? ((await p.employee.findFirst({ where: { id: item.pmId } }))?.full_name ??
        'Property Manager')
      : 'Property Manager',
    agent_name: lead.assigned_to?.full_name ?? lead.assigned_to?.employee_code ?? 'Advisory Desk',
    visit_date: new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    lead_code: lead.lead_code ?? '',
    company_name: company?.name ?? 'Our Company',
  });

  const text = resolved.body_text;

  const whatsAppUrl = `https://wa.me/${normalizeIndianPhone(lead.phone)}?text=${encodeURIComponent(text)}`;

  // §3: emit WHATSAPP_SENT with the template key embedded in notes
  // (the spec §3 registry item: "WHATSAPP_SENT (with which template key)").
  const activityNotes = `WhatsApp proposal sent using template ${templateKey} for ${item.kind === 'PROPERTY' ? 'Property' : 'Unit'} ${item.code} (${item.title})`;

  await p.leadActivity.create({
    data: {
      lead_id: leadId,
      actor_id: user.employeeId || 1,
      activity_type: 'WHATSAPP_SENT',
      notes: activityNotes,
    },
  });

  return { whatsAppUrl, whatsAppText: text, templateKey };
}

export async function addPropertyInterest(
  user: TokenPayload,
  leadId: number,
  target: { propertyId?: number; projectUnitId?: number },
) {
  const lead = await p.lead.findFirst({ where: { id: leadId } });
  if (!lead) throw new AppError(404, 'Lead not found');

  if (!can(user, Permissions.LEADS_UPDATE, lead)) {
    throw new AppError(403, 'Forbidden: You do not have permission to modify this lead');
  }

  const item = await loadInterestTarget(lead.company_id, target);

  return await p.$transaction(async (tx: import('@prisma/client').Prisma.TransactionClient) => {
    const interest = target.propertyId
      ? await tx.leadPropertyInterest.upsert({
          where: { lead_id_property_id: { lead_id: leadId, property_id: target.propertyId } },
          update: { is_active: true },
          create: {
            lead_id: leadId,
            property_id: target.propertyId,
            created_by: user.employeeId || 1,
          },
        })
      : await tx.leadPropertyInterest.upsert({
          where: {
            lead_id_project_unit_id: { lead_id: leadId, project_unit_id: target.projectUnitId! },
          },
          update: { is_active: true },
          create: {
            lead_id: leadId,
            project_unit_id: target.projectUnitId,
            created_by: user.employeeId || 1,
          },
        });

    await tx.leadActivity.create({
      data: {
        lead_id: leadId,
        actor_id: user.employeeId || 1,
        activity_type: 'PROPERTY_INTEREST_ADDED',
        notes: `Added interest in ${item.kind === 'PROPERTY' ? 'Property' : 'Unit'} ${item.code} (${item.title})`,
      },
    });

    return interest;
  });
}

export async function removePropertyInterest(
  user: TokenPayload,
  leadId: number,
  target: { propertyId?: number; projectUnitId?: number },
) {
  const lead = await p.lead.findFirst({ where: { id: leadId } });
  if (!lead) throw new AppError(404, 'Lead not found');

  if (!can(user, Permissions.LEADS_UPDATE, lead)) {
    throw new AppError(403, 'Forbidden: You do not have permission to modify this lead');
  }

  const interest = target.propertyId
    ? await p.leadPropertyInterest.findUnique({
        where: { lead_id_property_id: { lead_id: leadId, property_id: target.propertyId } },
        include: { property: true },
      })
    : await p.leadPropertyInterest.findUnique({
        where: {
          lead_id_project_unit_id: { lead_id: leadId, project_unit_id: target.projectUnitId! },
        },
        include: { project_unit: true },
      });

  if (!interest) {
    throw new AppError(404, 'Property interest not found');
  }

  return await p.$transaction(async (tx: import('@prisma/client').Prisma.TransactionClient) => {
    await tx.leadPropertyInterest.update({
      where: { id: interest.id },
      data: { is_active: false },
    });

    await tx.leadActivity.create({
      data: {
        lead_id: leadId,
        actor_id: user.employeeId || 1,
        activity_type: 'PROPERTY_INTEREST_REMOVED',
        // An interest row points at either a standalone Property or a project
        // unit — only one of the two queries above ever ran, so only one of
        // these fields exists on `interest` at all (the ternary's branches
        // narrow to disjoint types, hence the `in` checks below).
        notes:
          'property' in interest && interest.property
            ? `Removed interest in Property ${interest.property.property_code} (${interest.property.title})`
            : `Removed interest in unit #${target.projectUnitId ?? 'unknown'}`,
      },
    });

    return { success: true, message: 'Property interest removed successfully' };
  });
}
