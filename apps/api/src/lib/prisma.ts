import { PrismaClient } from '@prisma/client';

/**
 * Singleton Prisma Client instance for the API.
 * Prevents multiple instances from exhausting the connection pool,
 * especially during sequential test runs.
 */
const dbUrl = process.env.DATABASE_URL || '';

// Prisma's default pool is (CPU cores x 2 + 1) connections -- 3 on a 1-core
// host. A page load fires ~8 API calls at once and the approvals inbox alone
// runs 14 queries in parallel, so requests queued for a connection, each
// wait costing a full round trip to the remote database. Set an explicit
// pool unless the URL already chooses one (DB_CONNECTION_LIMIT overrides;
// keep it under the MySQL user's max_user_connections).
const withPoolSize = (url: string, size: number) =>
  !url || url.includes('connection_limit=')
    ? url
    : `${url}${url.includes('?') ? '&' : '?'}connection_limit=${size}`;

const poolSize = Number(process.env.DB_CONNECTION_LIMIT) || 10;
const mainDbUrl = withPoolSize(dbUrl, poolSize);

export const prisma = new PrismaClient(
  mainDbUrl ? { datasources: { db: { url: mainDbUrl } } } : undefined,
);

const publicDbUrl = dbUrl.includes('connection_limit=')
  ? dbUrl.replace(/connection_limit=\d+/, 'connection_limit=3')
  : dbUrl.includes('?')
    ? `${dbUrl}&connection_limit=3`
    : `${dbUrl}?connection_limit=3`;

export const publicPrisma = new PrismaClient({
  datasources: {
    db: {
      url: publicDbUrl,
    },
  },
});

export default prisma;
