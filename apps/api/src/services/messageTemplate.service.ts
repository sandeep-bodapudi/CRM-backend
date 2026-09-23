import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { MessageTemplateKeyType, MessageTemplateInput } from '../shared';

const p = prisma;

/**
 * §5 — WhatsApp message template service.
 *
 * Templates live in the `MessageTemplate` table (editable from an admin screen),
 * not hardcoded in components. The backend only ever RESOLVES a template's
 * body_text with contextual placeholders — the actual wa.me deep-link is built
 * on the frontend (spec §0 principle 5: WhatsApp is always a manual deep-link,
 * never sent server-side).
 *
 * Supported placeholders (substituted by resolveTemplate):
 *   {customer_name}, {property_name}, {pm_name}, {visit_date}
 */
export interface TemplateContext {
  customer_name?: string;
  customer_phone?: string;
  property_name?: string;
  property_location?: string;
  property_price?: string;
  property_code?: string;
  property_url?: string;
  pm_name?: string;
  pm_phone?: string;
  agent_name?: string;
  visit_date?: string;
  visit_time?: string;
  lead_code?: string;
  booking_code?: string;
  company_name?: string;
}

function substitute(body: string, ctx: TemplateContext): string {
  return body
    .replace(/\{customer_name\}/g, ctx.customer_name ?? '')
    .replace(/\{customer_phone\}/g, ctx.customer_phone ?? '')
    .replace(/\{property_name\}/g, ctx.property_name ?? '')
    .replace(/\{property_location\}/g, ctx.property_location ?? '')
    .replace(/\{property_price\}/g, ctx.property_price ?? '')
    .replace(/\{property_code\}/g, ctx.property_code ?? '')
    .replace(/\{property_url\}/g, ctx.property_url ?? '')
    .replace(/\{pm_name\}/g, ctx.pm_name ?? '')
    .replace(/\{pm_phone\}/g, ctx.pm_phone ?? '')
    .replace(/\{agent_name\}/g, ctx.agent_name ?? '')
    .replace(/\{visit_date\}/g, ctx.visit_date ?? '')
    .replace(/\{visit_time\}/g, ctx.visit_time ?? '')
    .replace(/\{lead_code\}/g, ctx.lead_code ?? '')
    .replace(/\{booking_code\}/g, ctx.booking_code ?? '')
    .replace(/\{company_name\}/g, ctx.company_name ?? '');
}

/** Placeholders every template supports — shared by the substitute() logic
 * above and the admin editor's cheat-sheet / live preview. */
export const TEMPLATE_PLACEHOLDERS = [
  'customer_name',
  'customer_phone',
  'property_name',
  'property_location',
  'property_price',
  'property_code',
  'property_url',
  'pm_name',
  'pm_phone',
  'agent_name',
  'visit_date',
  'visit_time',
  'lead_code',
  'booking_code',
  'company_name',
] as const;

export class MessageTemplateService {
  /**
   * Resolve a template to its final body_text with placeholders substituted.
   * Returns null if no ACTIVE template exists for the key.
   */
  static async resolve(templateKey: string, ctx: TemplateContext = {}) {
    const tpl = await p.messageTemplate.findFirst({
      where: { template_key: templateKey, is_active: true },
    });
    if (!tpl) return null;
    return {
      template_key: tpl.template_key,
      name: tpl.name,
      body_text: substitute(tpl.body_text, ctx),
    };
  }

  /**
   * Resolve a template or use a situation-specific fallback if none exists.
   */
  static async resolveWithFallback(
    templateKey: string,
    ctx: TemplateContext = {},
  ): Promise<{ templateKey: string; body_text: string; usedFallback: boolean }> {
    const tpl = await this.resolve(templateKey, ctx);
    if (tpl) {
      return { templateKey: tpl.template_key, body_text: tpl.body_text, usedFallback: false };
    }

    let fallbackText = '';

    // Legacy alias support for fallback logic
    const canonicalKey =
      templateKey === 'LEAD_QUALIFIED_PROPERTIES' ? 'LEAD_PROPERTY_PROPOSAL' : templateKey;

    switch (canonicalKey) {
      case 'LEAD_PROPERTY_PROPOSAL':
        fallbackText = `🏡 *EXCLUSIVE PROPERTY PROPOSAL*\n\nDear *{customer_name}*,\n\nWe found a premium property matching your requirements!\n\n📌 *Title*: {property_name} ({property_code})\n📍 *Location*: {property_location}\n💰 *Asking Price*: {property_price}\n🔗 *View Details*: {property_url}\n\nContact {pm_name} / {agent_name} to schedule a site visit.\nRef: {lead_code}`;
        break;
      case 'DEMO_SCHEDULED':
        fallbackText = `Dear {customer_name}, your demo is scheduled for {visit_date} at {visit_time}. Please be available.`;
        break;
      case 'SITE_VISIT_SCHEDULED':
      case 'SITE_VISIT_ACCEPTED':
        fallbackText = `Dear {customer_name}, your site visit for {property_name} is confirmed for {visit_date} at {visit_time}.`;
        break;
      case 'DAY_BEFORE_RECONFIRMATION':
        fallbackText = `Hi {customer_name}, just confirming your site visit tomorrow, {visit_date} at {visit_time}, for {property_name}. Your relationship manager {pm_name} ({pm_phone}) will be in touch. Reply to reschedule if needed.`;
        break;
      case 'RESCHEDULE_CONFIRMED':
        fallbackText = `Hi {customer_name}, your site visit has been rescheduled to {visit_date} at {visit_time}. See you then!`;
        break;
      case 'POST_VISIT_INTERESTED':
        fallbackText = `Hi {customer_name}, thank you for visiting {property_name} with us! Let us know if you'd like to move forward with a booking, or if you have any questions — {pm_name} is here to help.`;
        break;
      case 'BOOKING_CONFIRMED':
        fallbackText = `Congratulations {customer_name}! Your booking {booking_code} for {property_name} is confirmed. Welcome to {company_name}.`;
        break;
      default:
        fallbackText = `Hello {customer_name}, here is an update regarding {property_name}.`;
    }

    return {
      templateKey,
      body_text: substitute(fallbackText, ctx),
      usedFallback: true,
    };
  }

  /**
   * Admin: list all templates (active + inactive) for the editor UI.
   */
  static async list() {
    return await p.messageTemplate.findMany({ orderBy: { template_key: 'asc' } });
  }

  /**
   * Admin: upsert a template by key (create first time, then update body/name).
   */
  static async upsert(dto: MessageTemplateInput) {
    const existing = await p.messageTemplate.findUnique({
      where: { template_key: dto.template_key },
    });
    if (existing) {
      return await p.messageTemplate.update({
        where: { template_key: dto.template_key },
        data: {
          name: dto.name,
          body_text: dto.body_text,
          is_active: dto.is_active ?? true,
        },
      });
    }
    return await p.messageTemplate.create({
      data: {
        template_key: dto.template_key,
        name: dto.name,
        body_text: dto.body_text,
        is_active: dto.is_active ?? true,
      },
    });
  }

  /**
   * Admin: deactivate a template (soft-disable, not delete — keeps history).
   */
  static async setActive(templateKey: string, isActive: boolean) {
    return await p.messageTemplate.update({
      where: { template_key: templateKey },
      data: { is_active: isActive },
    });
  }
}
