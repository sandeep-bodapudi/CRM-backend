import { prisma } from '../lib/prisma';
import { MessageTemplateService } from '../services/messageTemplate.service';

const p = prisma;

// Public marketing site a WhatsApp property-share link should point to.
// Two apex domains resolve to the same site in production (see server.ts's
// allowedPublicApexDomains comment) — radharealhomeproperties.com is the
// confirmed one to use for outbound links (2026-09-23 product decision).
const PUBLIC_SITE_BASE_URL = process.env.PUBLIC_SITE_URL || 'https://radharealhomeproperties.com';
const buildPropertyUrl = (propertyId: number) => `${PUBLIC_SITE_BASE_URL}/properties/${propertyId}`;
const buildProjectUrl = (projectId: number) => `${PUBLIC_SITE_BASE_URL}/projects/${projectId}`;

/**
 * A lead may now have multiple preferred locations (§ Phase 2). Prefers the
 * full list when present; falls back to the legacy single scalar for leads
 * created before this feature (or that never used the multi-location UI).
 */
function getLeadLocationCandidates(lead: {
  preferred_location: string | null;
  preferred_locations?: { location: string }[];
}): string[] {
  if (lead.preferred_locations && lead.preferred_locations.length > 0) {
    return lead.preferred_locations.map((l) => l.location);
  }
  return lead.preferred_location ? [lead.preferred_location] : [];
}

/** Same word/substring rule used for both directions of the location match. */
function scoreLocation(locationCandidates: string[], itemLocation: string | null): number {
  if (locationCandidates.length === 0 || !itemLocation) return 0;
  const itemLoc = itemLocation.toLowerCase();
  let best = 0;
  for (const candidate of locationCandidates) {
    const prefLoc = candidate.toLowerCase();
    if (prefLoc.includes(itemLoc) || itemLoc.includes(prefLoc)) {
      best = Math.max(best, 40);
    } else {
      const prefWords = prefLoc.split(/[\s,/]+/);
      const hasWordMatch = prefWords.some((w: string) => w.length > 3 && itemLoc.includes(w));
      if (hasWordMatch) best = Math.max(best, 25);
    }
  }
  return best;
}

/** Shared 40 (location) / 40 (budget) / 20 (category) scoring — used for both
 * standalone Properties and ProjectUnits so the two never drift apart. */
function scoreItem(
  lead: {
    preferred_location: string | null;
    preferred_locations?: { location: string }[];
    budget_max: number | null;
    property_type_preference: string | null;
  },
  item: { location: string | null; price: number; category: string; brand?: string },
): { score: number; locationMatch: boolean; budgetMatch: boolean; categoryMatch: boolean } {
  let score = 0;

  // 1. Location Match (Weight: 40)
  const locationCandidates = getLeadLocationCandidates(lead);
  let locationMatch = false;
  if (locationCandidates.length > 0 && item.location) {
    const locScore = scoreLocation(locationCandidates, item.location);
    score += locScore;
    locationMatch = locScore > 0;
  } else {
    score += 20; // neutral fallback
  }

  // 2. Budget Fit (Weight: 40)
  let budgetMatch = false;
  if (lead.budget_max && lead.budget_max > 0) {
    if (item.price <= lead.budget_max) {
      score += 40;
      budgetMatch = true;
    } else if (item.price <= lead.budget_max * 1.15) {
      score += 20; // 15% budget flex match
      budgetMatch = true;
    }
  } else {
    score += 20; // fallback if no budget max set
  }

  // 3. Category & BHK Fit (Weight: 20)
  let categoryMatch = false;
  if (lead.property_type_preference) {
    const prefType = lead.property_type_preference.toLowerCase();
    const itemCat = item.category.toLowerCase();
    const itemBrand = item.brand?.toLowerCase();

    if (
      prefType.includes(itemCat) ||
      itemCat.includes(prefType) ||
      (itemBrand && prefType.includes(itemBrand))
    ) {
      score += 20;
      categoryMatch = true;
    }
  } else {
    score += 10;
  }

  return { score, locationMatch, budgetMatch, categoryMatch };
}

export interface PropertyMatchResult {
  /** kind: 'UNIT' — this is a ProjectUnit id, not a Property id. */
  kind: 'PROPERTY' | 'UNIT';
  propertyId: number;
  propertyCode: string;
  title: string;
  brandType: string;
  category: string;
  price: number;
  areaSqft: number | null;
  location: string;
  bedrooms?: number;
  facing?: string;
  /** Only set for kind: 'UNIT'. */
  projectId?: number;
  projectName?: string;
  unitNumber?: string;
  matchScore: number; // 0 to 100
  matchBreakdown: {
    locationMatch: boolean;
    budgetMatch: boolean;
    categoryMatch: boolean;
  };
  whatsAppUrl?: string;
  whatsAppText?: string;
}

export const findMatchingPropertiesForLead = async (
  leadId: number,
): Promise<PropertyMatchResult[]> => {
  const lead = await p.lead.findUnique({
    where: { id: leadId },
    include: { assigned_to: true, preferred_locations: true },
  });

  if (!lead) return [];

  // Fetch all LIVE properties for lead's company
  const liveProperties = await p.property.findMany({
    where: {
      company_id: lead.company_id,
      status: 'LIVE',
    },
  });

  // "Every project is a property" (QA 2026-09-14): AVAILABLE units in a
  // VERIFIED project are exactly as matchable as a standalone LIVE property —
  // same scoring, same WhatsApp proposal flow. A project's own `location` is
  // used the way `Property.location` is (units don't carry their own address).
  const availableUnits = await p.projectUnit.findMany({
    where: {
      company_id: lead.company_id,
      sales_status: 'AVAILABLE',
      project: { verification_status: 'VERIFIED' },
    },
    include: { project: { select: { id: true, name: true, location: true } } },
  });

  const results: PropertyMatchResult[] = [];

  for (const prop of liveProperties) {
    const { score, locationMatch, budgetMatch, categoryMatch } = scoreItem(lead, {
      location: prop.location,
      price: prop.final_price,
      category: prop.category,
      brand: prop.brand_type,
    });

    // §5: Resolve WhatsApp body from MessageTemplate table via template_key,
    // never hardcoded strings. Falls back to a safe inline text when no active
    // template is configured (admin must populate LEAD_QUALIFIED_PROPERTIES).
    const whatsAppText = await resolveWhatsAppTextForItem(lead, {
      title: prop.title,
      location: prop.location,
      areaSqft: prop.area_sqft,
      bedrooms: prop.bedrooms,
      category: prop.category,
      facing: prop.facing,
      price: prop.final_price,
      description: prop.description,
      brandType: prop.brand_type,
      url: buildPropertyUrl(prop.id),
    });
    const whatsAppUrl = buildWhatsAppUrl(lead.phone, whatsAppText);

    results.push({
      kind: 'PROPERTY',
      propertyId: prop.id,
      propertyCode: prop.property_code,
      title: prop.title,
      brandType: prop.brand_type,
      category: prop.category,
      price: prop.final_price,
      areaSqft: prop.area_sqft,
      location: prop.location,
      bedrooms: prop.bedrooms ?? undefined,
      facing: prop.facing ?? undefined,
      matchScore: Math.min(100, score),
      matchBreakdown: { locationMatch, budgetMatch, categoryMatch },
      whatsAppText,
      whatsAppUrl,
    });
  }

  for (const unit of availableUnits) {
    const { score, locationMatch, budgetMatch, categoryMatch } = scoreItem(lead, {
      location: unit.project.location,
      price: unit.final_price,
      category: unit.unit_type,
    });

    const label = unit.flat_number || unit.villa_number || unit.plot_number || unit.unit_number;
    const title = `${unit.project.name} — Unit ${label}`;

    const whatsAppText = await resolveWhatsAppTextForItem(lead, {
      title,
      location: unit.project.location,
      areaSqft: unit.area_sqft,
      bedrooms: unit.bedrooms,
      category: unit.unit_type,
      facing: unit.facing,
      price: unit.final_price,
      description: unit.notes,
      brandType: undefined,
      // Units don't have their own public page — link to the parent project's.
      url: buildProjectUrl(unit.project_id),
    });
    const whatsAppUrl = buildWhatsAppUrl(lead.phone, whatsAppText);

    results.push({
      kind: 'UNIT',
      propertyId: unit.id,
      propertyCode: unit.unit_code,
      title,
      brandType: 'RADHA_REAL_HOMES',
      category: unit.unit_type,
      price: unit.final_price,
      areaSqft: unit.area_sqft,
      location: unit.project.location,
      bedrooms: unit.bedrooms ?? undefined,
      facing: unit.facing ?? undefined,
      projectId: unit.project_id,
      projectName: unit.project.name,
      unitNumber: label,
      matchScore: Math.min(100, score),
      matchBreakdown: { locationMatch, budgetMatch, categoryMatch },
      whatsAppText,
      whatsAppUrl,
    });
  }

  // Sort by match score descending
  return results.sort((a, b) => b.matchScore - a.matchScore);
};

function buildWhatsAppUrl(leadPhone: string, text: string): string {
  const cleanPhone = leadPhone.replace(/[^0-9]/g, '');
  return `https://wa.me/${cleanPhone.startsWith('91') ? cleanPhone : '91' + cleanPhone}?text=${encodeURIComponent(text)}`;
}

/**
 * §5 — Resolve the WhatsApp body text for a property/unit proposal from the
 * `MessageTemplate` table via `MessageTemplateService.resolve()`.
 *
 * Uses the canonical template_key `LEAD_QUALIFIED_PROPERTIES` (spec §5 table
 * row 1: "Lead qualified, properties matched — Share matched property list +
 * invite to discuss"). The template body supports the placeholders
 * {customer_name}, {property_name}, {pm_name}, {visit_date}.
 *
 * Returns a safe inline fallback text when no ACTIVE template is configured,
 * so the matching engine can never break because an admin hasn't populated the
 * template table yet. Admin screen (routes/messageTemplates.ts) is the single
 * place to edit templates.
 */
async function resolveWhatsAppTextForItem(
  lead: any,
  item: {
    title: string;
    location: string | null;
    areaSqft: number | null;
    bedrooms: number | null;
    category: string;
    facing: string | null;
    price: number;
    description: string | null;
    brandType: string | undefined;
    url: string;
  },
): Promise<string> {
  const templateKey = 'LEAD_QUALIFIED_PROPERTIES';
  const pm = lead.assigned_to;

  const resolved = await MessageTemplateService.resolve(templateKey, {
    customer_name: lead.customer_name ?? '',
    property_name: item.title ?? '',
    property_location: item.location ?? '',
    property_price: `₹${(item.price / 100000).toFixed(1)} Lakhs`,
    property_url: item.url,
    pm_name: pm?.full_name ?? pm?.employee_code ?? 'Radha Real Homes Advisory Desk',
    pm_phone: pm?.phone ?? '',
    visit_date: new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  });

  if (resolved && resolved.body_text) {
    return resolved.body_text;
  }

  // Safe fallback when admin hasn't populated the template yet.
  // Do NOT hardcode the production template here — this is only a
  // no-broken-experience stopgap. The real content lives in the
  // MessageTemplate table row for LEAD_QUALIFIED_PROPERTIES.
  const brandName = item.brandType === 'SONTHILLU' ? 'SONTHILLU RESIDENTIAL' : 'RADHA REAL HOMES';

  return `🏡 *EXCLUSIVE PROPERTY PROPOSAL FROM ${brandName}*

Dear *${lead.customer_name}*,

We found a premium property matching your exact requirements!

📌 *Title*: ${item.title}
📍 *Location*: ${item.location}
📐 *Area*: ${item.areaSqft} sq.ft (${item.bedrooms ? item.bedrooms + ' BHK' : item.category})
🧭 *Facing*: ${item.facing || 'East'}
💰 *Asking Price*: ₹${(item.price / 100000).toFixed(1)} Lakhs
🔗 *View Details*: ${item.url}

📝 *Highlights*: ${
    item.description || 'Prime location with high growth potential and immediate registration.'
  }

📞 *Your Dedicated Relationship Manager*:
${
  lead.assigned_to?.full_name || lead.assigned_to?.employee_code || 'Radha Real Homes Advisory Desk'
} (${lead.assigned_to?.phone || '+91 99000 11222'})

Reply to this message or call us directly to schedule an exclusive site visit!`;
}

/**
 * § Phase E: Mechanism 1 - Automatic Inventory Matching
 * Finds all dropped leads (due to NO_MATCHING_INVENTORY) that match a given property.
 * Criteria: Strict Location match AND Budget range overlap.
 */
export const matchDroppedLeadsToProperty = async (propertyId: number): Promise<number[]> => {
  const prop = await p.property.findUnique({
    where: { id: propertyId },
  });

  if (!prop || prop.status !== 'LIVE') return [];

  return matchDroppedLeadsByLocationBudget(prop.company_id, prop.location, prop.final_price);
};

/**
 * Unit twin of matchDroppedLeadsToProperty: when a unit becomes AVAILABLE (or
 * its project becomes VERIFIED, making already-AVAILABLE units visible for
 * the first time), previously "no matching inventory" dropped leads should
 * get the same automatic-recovery chance a newly-LIVE property gives them.
 */
export const matchDroppedLeadsToUnit = async (unitId: number): Promise<number[]> => {
  const unit = await p.projectUnit.findUnique({
    where: { id: unitId },
    include: { project: { select: { verification_status: true, location: true } } },
  });

  if (
    !unit ||
    unit.sales_status !== 'AVAILABLE' ||
    unit.project.verification_status !== 'VERIFIED'
  ) {
    return [];
  }

  return matchDroppedLeadsByLocationBudget(
    unit.company_id,
    unit.project.location,
    unit.final_price,
  );
};

async function matchDroppedLeadsByLocationBudget(
  companyId: number,
  itemLocation: string | null,
  price: number,
): Promise<number[]> {
  const candidateLeads = await p.lead.findMany({
    where: {
      company_id: companyId,
      status: 'DROPPED',
      exit_reason: 'NO_MATCHING_INVENTORY',
    },
    include: { preferred_locations: true },
  });

  const matchedLeadIds: number[] = [];

  for (const lead of candidateLeads) {
    // 1. Location Match — any of the lead's preferred locations (§ Phase 2)
    const dropLocationCandidates = getLeadLocationCandidates(lead);
    const locationMatch = scoreLocation(dropLocationCandidates, itemLocation) > 0;

    // 2. Budget Overlap (allow 15% flex)
    const budgetMatch = !!(
      lead.budget_max &&
      lead.budget_max > 0 &&
      price <= lead.budget_max * 1.15
    );

    // Require both
    if (locationMatch && budgetMatch) {
      matchedLeadIds.push(lead.id);
    }
  }

  return matchedLeadIds;
}
