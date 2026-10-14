import { Prisma } from '@prisma/client';

/**
 * Keeps only the company ids that actually exist (and aren't soft-deleted).
 *
 * Both the create and update employee routes used to pass
 * `accessible_company_ids` straight into a nested `company_access.create`
 * with no check at all -- unlike every other picker on the same form
 * (branches, reporting manager), which is filtered against what's really in
 * the database. A removed/never-seeded company id (the "Accessible
 * Companies" checkboxes are a fixed two-option list in the UI, not fetched
 * from the server) hit the database's foreign key and surfaced as a bare
 * 500 "Failed to create/update employee" with no indication of what was
 * actually wrong. Mirrors additional_branch_ids' existing silent-filter
 * behaviour in create.ts, rather than hard-failing the whole save over one
 * stale checkbox.
 */
export async function filterToExistingCompanyIds(
  tx: Prisma.TransactionClient,
  ids: (string | number)[] | undefined,
): Promise<{ valid: number[]; dropped: number[] }> {
  if (!ids || ids.length === 0) return { valid: [], dropped: [] };
  const parsed = [...new Set(ids.map((id) => (typeof id === 'string' ? parseInt(id, 10) : id)))];
  const existing = await tx.company.findMany({
    where: { id: { in: parsed }, deleted_at: null },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((c) => c.id));
  return {
    valid: parsed.filter((id) => existingIds.has(id)),
    dropped: parsed.filter((id) => !existingIds.has(id)),
  };
}
