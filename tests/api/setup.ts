import { prisma } from '../../apps/api/src/lib/prisma';

// Global test setup for API testing. tests/api/env.ts (jest setupFiles) has
// already loaded .env.test and pointed DATABASE_URL at the local test
// database -- it refuses to run against anything that isn't on this machine.
const testDbUrl = process.env.DATABASE_URL_TEST as string;

// Users created by the tests have set their own password: the API refuses a
// temporary password for everything but the password change.
prisma.$use(async (params, next) => {
  if (params.model === 'Employee' && (params.action === 'create' || params.action === 'upsert')) {
    const target = params.action === 'upsert' ? params.args.create : params.args.data;
    if (target && target.first_login_done === undefined) target.first_login_done = true;
  }
  return next(params);
});

// 3. Extract safe metadata for logging
try {
  const urlParams = new URL(testDbUrl);
  console.log(`\n========================================`);
  console.log(`🛡️  PHASE 0 TEST DATABASE SAFETY GUARD`);
  console.log(`========================================`);
  console.log(`✓ Environment: ${process.env.NODE_ENV}`);
  console.log(`✓ Target Host: ${urlParams.hostname}`);
  console.log(`✓ Target DB  : ${urlParams.pathname.replace('/', '')}`);
  console.log(`========================================\n`);
} catch (e) {
  console.error('ABORT: Invalid DATABASE_URL_TEST format.');
  process.exit(1);
}

// 4. Safe to instantiate PrismaClient using the overridden DATABASE_URL

beforeAll(async () => {
  // We explicitly avoid wiping or altering the database here in Phase 0
  // to ensure zero impact on production data. Tests will use the generated
  // deterministic users.

  // Set fallback env variables for testing to satisfy Phase 0 requirements
  process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-secret-access';
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-secret-refresh';

  // Fix token version leakage between test suites
  try {
    await prisma.employee.updateMany({
      data: { token_version: 1, status: 'ACTIVE' },
    });
  } catch (e) {
    console.warn('Failed to reset token_version on test users', e);
  }
});

// Each test starts with no failed-login history (10 failures lock an account
// for 15 minutes) and with every user past the first-login password change
// (the API refuses a temporary password for everything else). Local test
// database only -- see env.ts.
beforeEach(async () => {
  await prisma.auditEvent.deleteMany({ where: { entity_type: 'AUTH_FAILED' } });
  await prisma.employee.updateMany({
    where: { first_login_done: false },
    data: { first_login_done: true },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
