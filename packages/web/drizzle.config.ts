import type { Config } from 'drizzle-kit';

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/claude_edge',
  },
  // Fail rather than silently dropping a column when a migration is ambiguous.
  strict: true,
  verbose: true,
} satisfies Config;
