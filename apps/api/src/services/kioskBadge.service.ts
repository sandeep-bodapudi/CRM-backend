import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { notifyEmployee } from '../utils/notifyEmployee';
import { Roles } from '../shared';

const p = prisma;

export const MAX_PIN_TRIES = 5;
const LOCK_MINUTES = 15;
/** The same badge seen at two different kiosks within this window is suspicious. */
const TWO_KIOSK_WINDOW_MS = 30 * 60 * 1000;

/** A random 4-digit PIN. HR shows it once; only its hash is stored. */
export const generatePin = () => String(crypto.randomInt(0, 10000)).padStart(4, '0');

type EmployeeForBadge = {
  id: number;
  company_id: number;
  full_name: string | null;
  employee_code: string;
  static_badge_enabled: boolean;
  badge_version: number;
  badge_pin_hash: string | null;
  badge_pin_failures: number;
  badge_locked_until: Date | null;
};

export type BadgeAccess =
  | { ok: true }
  | { ok: false; status: number; body: { error: string; code?: string; triesLeft?: number } };

/** Tell the MD and HR (people who can act on it), in the employee's company. */
async function alertManagement(companyId: number, title: string, message: string) {
  try {
    const people = await p.employee.findMany({
      where: {
        company_id: companyId,
        status: 'ACTIVE',
        roles: { some: { role: { name: { in: [Roles.MD, Roles.HR_MANAGER] } } } },
      },
      select: { id: true },
    });
    if (people.length > 0) {
      await notifyEmployee(
        people.map((x) => x.id),
        { type: 'SYSTEM_ALERT', title, message },
      );
    }
  } catch (err) {
    logger.error('[kiosk-badge] could not alert management:', err);
  }
}

/**
 * Everything a printed badge must pass at the kiosk, after its signature checked
 * out: HR has switched it on for this person, it is the current badge (not a
 * cancelled one), the person is not locked out, and the PIN is right. Every
 * attempt is recorded; the same badge showing up at a second kiosk within half
 * an hour alerts management (a photographed badge is the likely cause).
 */
export async function checkBadgeAccess(
  employee: EmployeeForBadge,
  payloadBadgeVersion: number,
  pin: unknown,
  kioskCredentialId: number,
): Promise<BadgeAccess> {
  if (!employee.static_badge_enabled || payloadBadgeVersion !== employee.badge_version) {
    return {
      ok: false,
      status: 403,
      body: { error: 'This badge is not active. Please see HR.' },
    };
  }

  const now = new Date();

  // Seen at another kiosk lately? Compare before recording this attempt.
  const recent = await p.auditEvent.findMany({
    where: {
      action: 'BADGE_SCAN',
      entity_id: employee.id,
      created_at: { gte: new Date(now.getTime() - TWO_KIOSK_WINDOW_MS) },
    },
    select: { new_value: true },
  });
  const otherKiosk = recent.some((e) => {
    try {
      const k = JSON.parse(e.new_value || '{}').kiosk;
      return typeof k === 'number' && k !== kioskCredentialId;
    } catch {
      return false;
    }
  });
  await p.auditEvent.create({
    data: {
      actor_id: employee.id,
      action: 'BADGE_SCAN',
      entity_type: 'EMPLOYEE',
      entity_id: employee.id,
      new_value: JSON.stringify({ kiosk: kioskCredentialId }),
    },
  });
  if (otherKiosk) {
    const already = await p.auditEvent.count({
      where: {
        action: 'BADGE_TWO_KIOSKS',
        entity_id: employee.id,
        created_at: { gte: new Date(now.getTime() - TWO_KIOSK_WINDOW_MS) },
      },
    });
    if (already === 0) {
      await p.auditEvent.create({
        data: {
          actor_id: employee.id,
          action: 'BADGE_TWO_KIOSKS',
          entity_type: 'EMPLOYEE',
          entity_id: employee.id,
          new_value: JSON.stringify({ kiosk: kioskCredentialId }),
        },
      });
      await alertManagement(
        employee.company_id,
        'One badge seen at two kiosks',
        `${employee.full_name || employee.employee_code}'s printed badge was used at two different kiosks within 30 minutes. Check that the badge has not been copied.`,
      );
    }
  }

  if (employee.badge_locked_until && employee.badge_locked_until > now) {
    return {
      ok: false,
      status: 403,
      body: { error: 'Too many wrong PINs. Try again in a few minutes, or see HR.' },
    };
  }

  const pinText = typeof pin === 'string' ? pin.trim() : '';
  if (!pinText) {
    return { ok: false, status: 422, body: { error: 'Enter your PIN', code: 'PIN_REQUIRED' } };
  }

  const good =
    !!employee.badge_pin_hash && (await bcrypt.compare(pinText, employee.badge_pin_hash));
  if (good) {
    if (employee.badge_pin_failures > 0 || employee.badge_locked_until) {
      await p.employee.update({
        where: { id: employee.id },
        data: { badge_pin_failures: 0, badge_locked_until: null },
      });
    }
    return { ok: true };
  }

  const failures = employee.badge_pin_failures + 1;
  const lock = failures >= MAX_PIN_TRIES;
  await p.employee.update({
    where: { id: employee.id },
    data: {
      badge_pin_failures: lock ? 0 : failures,
      badge_locked_until: lock ? new Date(now.getTime() + LOCK_MINUTES * 60000) : null,
    },
  });
  if (lock) {
    await alertManagement(
      employee.company_id,
      'A badge PIN was locked',
      `${employee.full_name || employee.employee_code}'s badge was locked for ${LOCK_MINUTES} minutes after ${MAX_PIN_TRIES} wrong PINs.`,
    );
    return {
      ok: false,
      status: 403,
      body: { error: `Wrong PIN. The badge is locked for ${LOCK_MINUTES} minutes.` },
    };
  }
  return {
    ok: false,
    status: 403,
    body: {
      error: `Wrong PIN. ${MAX_PIN_TRIES - failures} ${MAX_PIN_TRIES - failures === 1 ? 'try' : 'tries'} left.`,
      code: 'WRONG_PIN',
      triesLeft: MAX_PIN_TRIES - failures,
    },
  };
}
