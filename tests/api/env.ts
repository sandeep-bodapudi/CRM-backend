import dotenv from 'dotenv';
import path from 'path';

// Runs before any test file (jest "setupFiles"), so before the Prisma client
// is created. The suite rewrites data (setup.ts resets every employee's
// status and token_version), so it may only ever touch a database on this
// machine: anything else is refused before a single query runs.
dotenv.config({ path: path.resolve(process.cwd(), '.env.test'), override: true });

const url = process.env.DATABASE_URL_TEST || '';
let host = '';
try {
  host = new URL(url).hostname;
} catch {
  host = '';
}
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
  // eslint-disable-next-line no-console
  console.error(
    'ABORT: DATABASE_URL_TEST must be a local database (127.0.0.1 / localhost). ' +
      'Create one with: npm run db:push:test-local',
  );
  process.exit(1);
}
process.env.DATABASE_URL = url;
process.env.NODE_ENV = 'test';
// Test users sign in with a password only (2-step login has its own tests).
process.env.TWO_STEP_DISABLED = 'true';
