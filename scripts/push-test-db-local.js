// Create / refresh the local test database (rrh_test) from the Prisma schema.
// Local only: refuses any DATABASE_URL_TEST that is not on this machine.
const { execSync } = require('child_process');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.test'), override: true });

const url = process.env.DATABASE_URL_TEST || '';
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
})();
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
  console.error('Refusing: DATABASE_URL_TEST must point at a local database.');
  process.exit(1);
}
execSync(
  'npx prisma db push --schema=apps/api/prisma/schema.prisma --skip-generate --accept-data-loss',
  { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } },
);
