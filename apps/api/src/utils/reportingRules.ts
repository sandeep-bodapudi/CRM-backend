import { prisma } from '../lib/prisma';
import { Roles } from '../shared';

/**
 * Default reporting lines (MD's rule, 2026-10-02):
 *   - digital team (executives, lead operators) -> Digital Marketing Head,
 *     else Marketing Director, else MD
 *   - Digital Marketing Head -> Marketing Director, else MD
 *   - sales/ops staff (PMs, telecallers, channel partners, sales, staff,
 *     agents, inventory) -> Marketing Director, else MD
 *   - Marketing Director, HR, accountant -> MD
 *   - MD and Admin report to no one.
 * Each employee gets a chain of candidates; the first one that exists in the
 * company wins. A later-joining Marketing Director / Digital Head is picked
 * up by re-running the suggestions (only fallback assignments move).
 */
type Leader = 'DIGITAL_HEAD' | 'MARKETING_DIRECTOR' | 'MD';

const DIGITAL_TEAM: string[] = [Roles.DIGITAL_MARKETING_EXECUTIVE, Roles.DIGITAL_LEAD_OPERATOR];
const TO_MD_ONLY: string[] = [Roles.MARKETING_DIRECTOR, Roles.HR_MANAGER, Roles.FINANCE];
const NO_MANAGER: string[] = [Roles.MD, Roles.ADMIN];

export function reportingChain(roleNames: string[]): Leader[] {
  if (roleNames.some((r) => NO_MANAGER.includes(r))) return [];
  if (roleNames.includes(Roles.DIGITAL_MARKETING_HEAD)) return ['MARKETING_DIRECTOR', 'MD'];
  if (roleNames.some((r) => TO_MD_ONLY.includes(r))) return ['MD'];
  if (roleNames.some((r) => DIGITAL_TEAM.includes(r))) {
    return ['DIGITAL_HEAD', 'MARKETING_DIRECTOR', 'MD'];
  }
  return ['MARKETING_DIRECTOR', 'MD'];
}

export type CompanyLeaders = Partial<Record<Leader, { id: number; name: string }>>;

/** The active MD / Marketing Director / Digital Head of a company (first by id). */
export async function getCompanyLeaders(companyId: number): Promise<CompanyLeaders> {
  const rows = await prisma.employee.findMany({
    where: {
      company_id: companyId,
      status: 'ACTIVE',
      roles: {
        some: {
          role: {
            name: { in: [Roles.MD, Roles.MARKETING_DIRECTOR, Roles.DIGITAL_MARKETING_HEAD] },
          },
        },
      },
    },
    select: {
      id: true,
      full_name: true,
      employee_code: true,
      roles: { select: { role: { select: { name: true } } } },
    },
    orderBy: { id: 'asc' },
  });
  const leaders: CompanyLeaders = {};
  for (const e of rows) {
    const names = e.roles.map((r) => r.role.name);
    const who = { id: e.id, name: e.full_name || e.employee_code };
    if (names.includes(Roles.MD)) leaders.MD ??= who;
    if (names.includes(Roles.MARKETING_DIRECTOR)) leaders.MARKETING_DIRECTOR ??= who;
    if (names.includes(Roles.DIGITAL_MARKETING_HEAD)) leaders.DIGITAL_HEAD ??= who;
  }
  return leaders;
}

/**
 * Suggested manager for one employee, or null if none applies. `currentId`
 * is their current reporting_manager_id: a suggestion is only made when it
 * is empty, or when it points at a leader further down their own chain
 * (e.g. "MD" while a Marketing Director now exists) -- a manager someone
 * chose deliberately is never overridden.
 */
export function suggestManager(
  employeeId: number,
  roleNames: string[],
  currentId: number | null,
  leaders: CompanyLeaders,
): { id: number; name: string } | null {
  const chain = reportingChain(roleNames);
  const pick = chain.map((l) => leaders[l]).find((l) => l && l.id !== employeeId);
  if (!pick || pick.id === currentId) return null;
  if (currentId == null) return pick;
  const pickRank = chain.findIndex((l) => leaders[l]?.id === pick.id);
  const currentRank = chain.findIndex((l) => leaders[l]?.id === currentId);
  return currentRank > pickRank ? pick : null;
}
