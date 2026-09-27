/**
 * A "saleable item" is either a standalone Property or a ProjectUnit. Every
 * downstream record — booking, opportunity, site visit, lead interest, complaint
 * — points at exactly one of the two.
 *
 * This module is the one place that knows the difference, so the sales pipeline
 * does not sprout a parallel code path per table.
 *
 * Deliberate asymmetry, worth understanding before changing it:
 *   - Property keeps its existing `status` column driving the booking lock
 *     (LIVE -> LOCKED -> BOOKED). That path handles real money today and is read
 *     in half a dozen places; it is not re-plumbed here.
 *   - ProjectUnit uses `sales_status` (AVAILABLE -> RESERVED -> BOOKED -> SOLD),
 *     the model the spec asks for.
 * Callers see one normalised shape either way.
 */

import { Prisma } from '@prisma/client';
import { AppError } from '../lead/errors';

export type InventoryKind = 'PROPERTY' | 'UNIT';

export interface InventoryRef {
  kind: InventoryKind;
  id: number;
}

/** Normalised view of whichever row was locked, so callers branch once, here. */
export interface LockedInventory {
  ref: InventoryRef;
  id: number;
  company_id: number;
  /** Raw lifecycle value: Property.status or ProjectUnit.sales_status. */
  state: string;
  locked_until: Date | null;
  label: string;
  /** Parent Project.status, when this item belongs to one — null for a
   *  standalone Property with no project_id. Used to block new bookings
   *  against a held project (#15) without touching bookings already in
   *  flight, which this check never sees since it only runs on claim. */
  project_status: string | null;
}

/**
 * Resolves the single inventory reference from a payload, rejecting both-or-neither.
 * The XOR is enforced here rather than trusted from the caller because a booking
 * pointing at two items (or none) is unrecoverable once money is attached.
 */
export function resolveInventoryRef(input: {
  property_id?: number | null;
  project_unit_id?: number | null;
}): InventoryRef {
  const hasProperty = input.property_id != null;
  const hasUnit = input.project_unit_id != null;

  if (hasProperty && hasUnit) {
    throw new AppError(400, 'Provide either property_id or project_unit_id, not both.');
  }
  if (!hasProperty && !hasUnit) {
    throw new AppError(400, 'Either property_id or project_unit_id is required.');
  }

  return hasProperty
    ? { kind: 'PROPERTY', id: input.property_id as number }
    : { kind: 'UNIT', id: input.project_unit_id as number };
}

/** Prisma connect payload for the correct relation. */
export function inventoryConnect(ref: InventoryRef) {
  return ref.kind === 'PROPERTY'
    ? { property: { connect: { id: ref.id } } }
    : { project_unit: { connect: { id: ref.id } } };
}

/** Plain FK fields, for creates that set scalars rather than relations. */
export function inventoryFk(ref: InventoryRef): {
  property_id: number | null;
  project_unit_id: number | null;
} {
  return ref.kind === 'PROPERTY'
    ? { property_id: ref.id, project_unit_id: null }
    : { property_id: null, project_unit_id: ref.id };
}

/** Reads whichever row the ref points at back out of a record. */
export function refFromRecord(record: {
  property_id?: number | null;
  project_unit_id?: number | null;
}): InventoryRef | null {
  if (record.property_id != null) return { kind: 'PROPERTY', id: record.property_id };
  if (record.project_unit_id != null) return { kind: 'UNIT', id: record.project_unit_id };
  return null;
}

/**
 * Locking read (SELECT ... FOR UPDATE) on the right table.
 *
 * A locking read always returns the latest committed row, so a concurrent claim
 * decision is never stale behind a REPEATABLE READ snapshot. The table name is a
 * literal on both branches — it cannot be parameterised — which is precisely why
 * introducing a second inventory table required touching this function.
 */
export async function lockInventoryRow(
  client: Prisma.TransactionClient,
  ref: InventoryRef,
): Promise<LockedInventory> {
  if (ref.kind === 'PROPERTY') {
    const rows = (await client.$queryRaw`
      SELECT p.id, p.status, p.locked_until, p.company_id, proj.status AS project_status
      FROM Property p
      LEFT JOIN Project proj ON proj.id = p.project_id
      WHERE p.id = ${ref.id} FOR UPDATE
    `) as any[];
    if (!rows || rows.length === 0) throw new AppError(404, 'Property not found');
    const row = rows[0];
    return {
      ref,
      id: row.id,
      company_id: row.company_id,
      state: row.status,
      locked_until: row.locked_until ? new Date(row.locked_until) : null,
      label: 'Property',
      project_status: row.project_status ?? null,
    };
  }

  const rows = (await client.$queryRaw`
    SELECT u.id, u.sales_status, u.locked_until, u.company_id, proj.status AS project_status
    FROM ProjectUnit u
    LEFT JOIN Project proj ON proj.id = u.project_id
    WHERE u.id = ${ref.id} FOR UPDATE
  `) as any[];
  if (!rows || rows.length === 0) throw new AppError(404, 'Unit not found');
  const row = rows[0];
  return {
    ref,
    id: row.id,
    company_id: row.company_id,
    state: row.sales_status,
    locked_until: row.locked_until ? new Date(row.locked_until) : null,
    label: 'Unit',
    project_status: row.project_status ?? null,
  };
}

/**
 * Whether the item can be claimed for a new booking, given its current state.
 * An expired lock is reclaimable — the codebase treats a stale `locked_until` as
 * available in search too, and the two must agree or search and booking diverge.
 */
export function assertClaimable(locked: LockedInventory, now: Date): void {
  const { state, locked_until, label, project_status } = locked;
  const lockActive = locked_until != null && locked_until >= now;

  // A held project blocks NEW bookings against its inventory — existing
  // locks/bookings are untouched since this only runs on claim (#15).
  if (project_status === 'ON_HOLD') {
    throw new AppError(409, `${label}'s project is currently on hold — new bookings are paused`);
  }

  // Property: LIVE is the sellable state. ProjectUnit: AVAILABLE.
  const sellableState = locked.ref.kind === 'PROPERTY' ? 'LIVE' : 'AVAILABLE';
  const lockedState = locked.ref.kind === 'PROPERTY' ? 'LOCKED' : 'RESERVED';

  if (state === lockedState) {
    if (lockActive) throw new AppError(409, `${label} is currently locked`);
    return; // expired lock, reclaimable
  }
  if (state === 'BOOKED' || state === 'SOLD') {
    throw new AppError(409, `${label} has already been booked or sold`);
  }
  if (state !== sellableState) {
    throw new AppError(409, `${label} is not available for booking`);
  }
}

/** Claims the lock for a booking. */
export async function claimInventoryLock(
  client: Prisma.TransactionClient,
  ref: InventoryRef,
  bookingId: number,
  lockedUntil: Date,
): Promise<void> {
  if (ref.kind === 'PROPERTY') {
    await client.property.update({
      where: { id: ref.id },
      data: { status: 'LOCKED', locked_until: lockedUntil, locked_by_booking_id: bookingId },
    });
    return;
  }
  await client.projectUnit.update({
    where: { id: ref.id },
    data: { sales_status: 'RESERVED', locked_until: lockedUntil, locked_by_booking_id: bookingId },
  });
}

/**
 * Moves the item to BOOKED on booking confirmation.
 *
 * Refuses (409) when the item is held by a DIFFERENT booking -- e.g. this
 * booking's lock expired and someone else has since locked or booked the
 * same item. Previously it overwrote the status unconditionally, so
 * confirming the stale booking silently "double-sold" the item.
 */
export async function markInventoryBooked(
  client: Prisma.TransactionClient,
  ref: InventoryRef,
  expectedCompanyId: number,
  bookingId: number,
): Promise<void> {
  if (ref.kind === 'PROPERTY') {
    const row = await client.property.findUnique({ where: { id: ref.id } });
    if (!row || row.company_id !== expectedCompanyId) return;
    if (row.locked_by_booking_id != null && row.locked_by_booking_id !== bookingId) {
      throw new AppError(409, 'This property is now held by another booking');
    }
    if (row.status === 'BOOKED' && row.locked_by_booking_id !== bookingId) {
      throw new AppError(409, 'This property has already been booked');
    }
    await client.property.update({
      where: { id: ref.id },
      data: { status: 'BOOKED', locked_by_booking_id: bookingId },
    });
    return;
  }
  const row = await client.projectUnit.findUnique({ where: { id: ref.id } });
  if (!row || row.company_id !== expectedCompanyId) return;
  if (row.locked_by_booking_id != null && row.locked_by_booking_id !== bookingId) {
    throw new AppError(409, 'This unit is now held by another booking');
  }
  if (
    (row.sales_status === 'BOOKED' || row.sales_status === 'SOLD') &&
    row.locked_by_booking_id !== bookingId
  ) {
    throw new AppError(409, 'This unit has already been booked');
  }
  await client.projectUnit.update({
    where: { id: ref.id },
    data: { sales_status: 'BOOKED', locked_by_booking_id: bookingId },
  });
}

/**
 * Human-readable name for whichever item the ref points at. Used for outbound
 * payloads and notifications that just need to say what was booked.
 */
export async function getInventoryTitle(
  client: Prisma.TransactionClient,
  ref: InventoryRef,
): Promise<string | null> {
  if (ref.kind === 'PROPERTY') {
    const row = await client.property.findUnique({
      where: { id: ref.id },
      select: { title: true },
    });
    return row?.title ?? null;
  }
  const row = await client.projectUnit.findUnique({
    where: { id: ref.id },
    select: { unit_number: true, project: { select: { name: true } } },
  });
  if (!row) return null;
  return row.project?.name ? `${row.project.name} — ${row.unit_number}` : row.unit_number;
}

/** Full property/project/company detail for a saleable item — used to enrich
 * the CRM -> Portal BOOKING_PORTAL_HANDOFF payload (consolidation plan,
 * Decision 1) with the fields the customer portal's UI actually reads
 * (location, propertyNumber, type, area, price, project name/code, company
 * name), instead of the single `title` string getInventoryTitle() gives. */
export interface InventoryPortalDetail {
  property: {
    id: number;
    property_code: string;
    title: string;
    category: string;
    price: number;
    area_sqft: number | null;
    location: string;
    address: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
    bedrooms: number | null;
    bathrooms: number | null;
    facing: string | null;
  } | null;
  projectUnit: {
    id: number;
    unit_code: string;
    unit_number: string;
    unit_type: string | null;
    final_price: number | null;
    calculated_price: number | null;
    plot_area_sqyd: number | null;
    facing: string | null;
  } | null;
  project: {
    id: number;
    project_code: string;
    name: string;
    location: string;
    city: string | null;
    state: string | null;
  } | null;
  company: {
    id: number;
    name: string;
  } | null;
}

export async function getInventoryPortalDetail(
  client: Prisma.TransactionClient,
  ref: InventoryRef,
): Promise<InventoryPortalDetail> {
  if (ref.kind === 'PROPERTY') {
    const row = await client.property.findUnique({
      where: { id: ref.id },
      select: {
        // § Phase 3: Property.price removed — final_price is authoritative;
        // the InventoryPortalDetail.property.price output key is unchanged.
        id: true,
        property_code: true,
        title: true,
        category: true,
        final_price: true,
        area_sqft: true,
        location: true,
        address: true,
        city: true,
        state: true,
        pincode: true,
        bedrooms: true,
        bathrooms: true,
        facing: true,
        project: {
          select: {
            id: true,
            project_code: true,
            name: true,
            location: true,
            city: true,
            state: true,
            company: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!row) return { property: null, projectUnit: null, project: null, company: null };
    return {
      property: {
        id: row.id,
        property_code: row.property_code,
        title: row.title,
        category: row.category,
        price: row.final_price,
        area_sqft: row.area_sqft,
        location: row.location,
        address: row.address,
        city: row.city,
        state: row.state,
        pincode: row.pincode,
        bedrooms: row.bedrooms,
        bathrooms: row.bathrooms,
        facing: row.facing,
      },
      projectUnit: null,
      project: row.project
        ? {
            id: row.project.id,
            project_code: row.project.project_code,
            name: row.project.name,
            location: row.project.location,
            city: row.project.city,
            state: row.project.state,
          }
        : null,
      company: row.project?.company
        ? { id: row.project.company.id, name: row.project.company.name }
        : null,
    };
  }

  const row = await client.projectUnit.findUnique({
    where: { id: ref.id },
    select: {
      id: true,
      unit_code: true,
      unit_number: true,
      unit_type: true,
      final_price: true,
      calculated_price: true,
      plot_area_sqyd: true,
      facing: true,
      project: {
        select: {
          id: true,
          project_code: true,
          name: true,
          location: true,
          city: true,
          state: true,
          company: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!row) return { property: null, projectUnit: null, project: null, company: null };
  return {
    property: null,
    projectUnit: {
      id: row.id,
      unit_code: row.unit_code,
      unit_number: row.unit_number,
      unit_type: row.unit_type,
      final_price: row.final_price,
      calculated_price: row.calculated_price,
      plot_area_sqyd: row.plot_area_sqyd,
      facing: row.facing,
    },
    project: row.project
      ? {
          id: row.project.id,
          project_code: row.project.project_code,
          name: row.project.name,
          location: row.project.location,
          city: row.project.city,
          state: row.project.state,
        }
      : null,
    company: row.project?.company
      ? { id: row.project.company.id, name: row.project.company.name }
      : null,
  };
}

/**
 * Releases the lock when a booking is cancelled.
 *
 * Only releases an item this booking actually holds. The guard used to be
 * `!heldByThisBooking && !isHeldState`, which let the release through for ANY
 * held item -- so cancelling a stale booking whose lock had expired freed an
 * item another booking had since locked or even confirmed, putting a sold
 * unit back on sale.
 *
 * Legacy rows (booked before locked_by_booking_id existed) have a held
 * status but no owner recorded; those are released only when no other live
 * booking points at the same item.
 */
export async function releaseInventoryLock(
  client: Prisma.TransactionClient,
  ref: InventoryRef,
  bookingId: number,
): Promise<void> {
  const row =
    ref.kind === 'PROPERTY'
      ? await client.property.findUnique({ where: { id: ref.id } })
      : await client.projectUnit.findUnique({ where: { id: ref.id } });
  if (!row) return;

  const state = ref.kind === 'PROPERTY' ? (row as any).status : (row as any).sales_status;
  const heldStates = ref.kind === 'PROPERTY' ? ['LOCKED', 'BOOKED'] : ['RESERVED', 'BOOKED'];
  if (!heldStates.includes(state)) return;

  if (row.locked_by_booking_id != null) {
    if (row.locked_by_booking_id !== bookingId) return; // someone else's hold
  } else {
    const otherLiveBooking = await client.booking.findFirst({
      where: {
        id: { not: bookingId },
        status: { notIn: ['CANCELLED'] },
        ...(ref.kind === 'PROPERTY' ? { property_id: ref.id } : { project_unit_id: ref.id }),
      },
      select: { id: true },
    });
    if (otherLiveBooking) return;
  }

  if (ref.kind === 'PROPERTY') {
    await client.property.update({
      where: { id: ref.id },
      data: { status: 'LIVE', locked_until: null, locked_by_booking_id: null },
    });
    return;
  }
  await client.projectUnit.update({
    where: { id: ref.id },
    data: { sales_status: 'AVAILABLE', locked_until: null, locked_by_booking_id: null },
  });
}
