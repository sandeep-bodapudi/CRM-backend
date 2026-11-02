import { prisma } from '../lib/prisma';
import { TokenPayload } from '../utils/jwt';
import { buildPropertyScope, buildProjectScope } from '../authz/dataScope';

const p = prisma;

/**
 * "Every project is a property" (QA report 2026-09-14): pickers, matching,
 * and booking only ever queried `Property`, so a lead interested in a
 * project's units — the actual inventory a project's Units tab manages —
 * never showed up anywhere outside that project's own page. The schema
 * already supports booking/interest/etc. against either a `Property` or a
 * `ProjectUnit` (see Booking.property_id / project_unit_id); only the read
 * side needed a place that returns both, shaped the same way.
 *
 * A `Property` can also independently carry a `project_id` (an older,
 * pre-`ProjectUnit` way of representing a unit inside a project — see
 * ProjectUnit.migrated_from_property_id) — those rows are included as-is
 * alongside standalone properties, both under `kind: 'PROPERTY'`.
 */

export type InventoryKind = 'PROPERTY' | 'UNIT';

export interface InventoryItem {
  kind: InventoryKind;
  id: number;
  code: string;
  title: string;
  category: string;
  location: string;
  city: string | null;
  price: number;
  area_sqft: number | null;
  bedrooms: number | null;
  facing: string | null;
  image_url: string | null;
  sales_status: string;
  // Present (non-null) only for kind: 'UNIT', and for a project-linked
  // kind: 'PROPERTY' row.
  project_id: number | null;
  project_name: string | null;
  unit_number: string | null;
  tower: string | null;
  floor: number | null;
  created_at: Date;
}

export interface InventoryFilters {
  q?: string;
  location?: string;
  min_price?: number;
  max_price?: number;
  /** Property.category value OR ProjectUnit.unit_type value — matched against whichever applies. */
  type?: string;
  /**
   * 'AVAILABLE' (default): what a booking/matching picker should offer —
   * live properties + available units in verified (or, per role scope,
   * visible) projects. 'ALL': lift the sales_status/project-verification
   * gate but keep the same permission scope — for admin/reporting views
   * that want to see everything a role is allowed to see.
   */
  status?: 'AVAILABLE' | 'ALL';
}

const applyCommonFilters = (item: InventoryItem, filters: InventoryFilters): boolean => {
  if (filters.min_price != null && item.price < filters.min_price) return false;
  if (filters.max_price != null && item.price > filters.max_price) return false;
  if (filters.location) {
    const needle = filters.location.toLowerCase();
    if (
      !item.location.toLowerCase().includes(needle) &&
      !item.city?.toLowerCase().includes(needle)
    ) {
      return false;
    }
  }
  if (filters.q) {
    const needle = filters.q.toLowerCase();
    const haystack = [item.title, item.code, item.location, item.project_name, item.unit_number]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
};

export class InventoryService {
  /**
   * Merges LIVE Property rows and AVAILABLE ProjectUnit rows (in projects
   * the caller can see) into one list, newest first. Two queries rather than
   * a raw SQL UNION — simplest correct option at the scale this CRM runs at
   * (hundreds, not millions, of live listings); revisit with a UNION query
   * if that stops being true.
   */
  static async listInventory(
    user: TokenPayload,
    filters: InventoryFilters = {},
    take = 50,
    skip = 0,
  ): Promise<{ items: InventoryItem[]; total: number }> {
    const wantAvailableOnly = filters.status !== 'ALL';

    const propertyScope = await buildPropertyScope(user);
    const propertyWhere: any = { ...propertyScope };
    if (wantAvailableOnly) propertyWhere.status = 'LIVE';
    if (filters.type) propertyWhere.category = filters.type;

    const projectScope = await buildProjectScope(user);
    const unitWhere: any = {
      project: projectScope,
    };
    if (wantAvailableOnly) {
      unitWhere.sales_status = 'AVAILABLE';
      // Only units of MD-approved, live projects can be offered for a booking
      // or a site visit — the scope alone let MD/Admin/PMs pick units of
      // drafts and rejected projects.
      unitWhere.project = {
        ...projectScope,
        verification_status: 'VERIFIED',
        status: { notIn: ['CANCELLED', 'ON_HOLD'] },
      };
    }
    if (filters.type) unitWhere.unit_type = filters.type;

    // Overfetch a page's worth from each source so a merge-and-slice still
    // fills a full page even when one source dominates the results.
    const fetchSize = skip + take;

    const [properties, units] = await Promise.all([
      p.property.findMany({
        where: propertyWhere,
        take: fetchSize,
        orderBy: { created_at: 'desc' },
        include: { images: { where: { is_primary: true }, take: 1 } },
      }),
      p.projectUnit.findMany({
        where: unitWhere,
        take: fetchSize,
        orderBy: { created_at: 'desc' },
        include: {
          images: { where: { is_primary: true }, take: 1 },
          project: { select: { id: true, name: true, location: true, city: true } },
        },
      }),
    ]);

    const propertyItems: InventoryItem[] = properties.map((prop) => ({
      kind: 'PROPERTY',
      id: prop.id,
      code: prop.property_code,
      title: prop.title,
      category: prop.category,
      location: prop.location,
      city: null,
      price: prop.final_price,
      area_sqft: prop.area_sqft,
      bedrooms: prop.bedrooms,
      facing: prop.facing,
      image_url: prop.images[0]?.image_url ?? null,
      sales_status: prop.sales_status,
      project_id: prop.project_id,
      project_name: null,
      unit_number: null,
      tower: null,
      floor: null,
      created_at: prop.created_at,
    }));

    const unitItems: InventoryItem[] = units.map((unit) => {
      const label = unit.flat_number || unit.villa_number || unit.plot_number || unit.unit_number;
      return {
        kind: 'UNIT',
        id: unit.id,
        code: unit.unit_code,
        title: `${unit.project.name} — Unit ${label}`,
        category: unit.unit_type,
        location: unit.project.location || unit.project.city || unit.project.name,
        city: unit.project.city,
        price: unit.final_price,
        area_sqft: unit.area_sqft,
        bedrooms: unit.bedrooms,
        facing: unit.facing,
        image_url: unit.images[0]?.image_url ?? null,
        sales_status: unit.sales_status,
        project_id: unit.project_id,
        project_name: unit.project.name,
        unit_number: label,
        tower: unit.tower,
        floor: unit.floor,
        created_at: unit.created_at,
      };
    });

    const merged = [...propertyItems, ...unitItems]
      .filter((item) => applyCommonFilters(item, filters))
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

    return { items: merged.slice(skip, skip + take), total: merged.length };
  }
}
