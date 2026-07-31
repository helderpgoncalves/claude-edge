import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

/**
 * Database connection.
 *
 * A module-level singleton, cached on globalThis in development. Without the
 * cache, Next's hot reload creates a new pool on every edit and exhausts
 * Postgres's connection limit within a few minutes of working.
 */

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. The web app needs Postgres; see compose.web.yaml.',
  );
}

const globalForDb = globalThis as unknown as {
  __ce_sql?: ReturnType<typeof postgres>;
};

const sql =
  globalForDb.__ce_sql ??
  postgres(connectionString, {
    // Small, because a Next server handles concurrency with async I/O rather
    // than with connections, and Postgres charges memory per backend.
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__ce_sql = sql;
}

export const db = drizzle(sql, { schema });
export { schema };
