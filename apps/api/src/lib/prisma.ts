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

// Prisma's default interactive-transaction limit is 5 s. With the database in
// another region every query is a full network round trip, so ordinary
// multi-step writes (reassigning a lead, moving it to Negotiation, completing
// a visit) ran past it and failed with "Transaction already closed" -- seen
// at 5.1 s, 5.2 s and 7.1 s on staging. 88 transactions rely on the default,
// so raise it once here instead of per call. maxWait is how long a
// transaction may queue for a free connection.
export const TRANSACTION_OPTIONS = { maxWait: 10000, timeout: 30000 };

export const prisma = new PrismaClient({
  ...(mainDbUrl ? { datasources: { db: { url: mainDbUrl } } } : {}),
  transactionOptions: TRANSACTION_OPTIONS,
});

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
  transactionOptions: TRANSACTION_OPTIONS,
});

export default prisma;
