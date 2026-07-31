import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Database schema.
 *
 * WHAT IS DELIBERATELY ABSENT
 * ---------------------------
 * There is no table for terminal content, prompts, or anything captured from a
 * session — and there never should be. Each user's bridge runs on their own
 * machine, and their browser talks to it directly. We store the address of
 * that bridge and nothing that passes through it.
 *
 * That is not a policy applied on top of the schema; it is the schema. A
 * database dump reveals who has an account and where their bridge lives. It
 * cannot reveal what they were working on, because that data never arrives.
 */

/**
 * A person.
 *
 * `emailVerified` gates nothing yet, but exists from the start: adding a
 * verification requirement later to a table full of unverified addresses is a
 * migration nobody enjoys.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Stored lowercased by the application. A citext column would enforce it
    // in the database, but requires an extension the managed Postgres may not
    // have, so normalisation happens at the one place that writes.
    email: text('email').notNull(),
    emailVerified: timestamp('email_verified', { withTimezone: true }),

    // Null for accounts created through an OAuth provider, which have no
    // password to hash.
    passwordHash: text('password_hash'),

    name: text('name'),
    image: text('image'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('users_email_idx').on(table.email)],
);

/**
 * An OAuth account linked to a user.
 *
 * Separate from `users` so one person can sign in with Google and with a
 * password, and so adding a second provider later is a row rather than a
 * column.
 */
export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One account per provider identity. Without this, two sign-ins from the
    // same Google account could create two rows and diverge.
    uniqueIndex('oauth_provider_account_idx').on(table.provider, table.providerAccountId),
    index('oauth_user_idx').on(table.userId),
  ],
);

/**
 * A browser session.
 *
 * Sessions live in the database rather than in a signed cookie so that
 * "sign out everywhere" is a delete rather than a key rotation. This account
 * can reach a terminal; revocation has to be immediate and complete.
 */
export const sessions = pgTable(
  'sessions',
  {
    // The token itself is the primary key. It is generated with a CSPRNG and
    // never derived from anything guessable.
    token: text('token').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    // Recorded so a user can recognise their own sessions in a device list and
    // spot one they do not know.
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('sessions_user_idx').on(table.userId)],
);

/**
 * A bridge a user has registered — the address of *their* server.
 *
 * The token is stored because the browser needs it to talk to the bridge, and
 * a user should not have to paste it on every visit. That is a real trade:
 * a database compromise would expose these tokens, and each one grants access
 * to that user's own bridge.
 *
 * Two things make it defensible. The token only ever reaches the user's own
 * machine — we never call their bridge from our servers. And a read-scoped
 * token, which is what most people will store, cannot type into a session.
 *
 * Encrypting it at rest is a stated open question rather than a decision; it
 * would need a key we hold, which moves the problem rather than solving it.
 */
export const bridges = pgTable(
  'bridges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // What the user calls it: "home server", "work laptop".
    label: text('label').notNull(),

    // Their bridge, e.g. https://bridge.example.com. Validated as HTTPS by the
    // application, because Connect IQ rejects anything else anyway.
    url: text('url').notNull(),

    token: text('token').notNull(),

    // tmux session name. Empty means the bridge's own default.
    sessionName: text('session_name').notNull().default(''),

    // Only one bridge is opened automatically when the app loads.
    isDefault: boolean('is_default').notNull().default(false),

    // Set by the browser after a successful poll, so the list can show which
    // bridges are reachable. Never written by our servers, which never connect.
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('bridges_user_idx').on(table.userId)],
);

/**
 * A single-use code for pairing a device.
 *
 * The Edge displays a QR containing one of these; the phone scans it and the
 * code is exchanged for a device token. Short-lived and single-use, because
 * for its lifetime it is a bearer credential.
 */
export const pairingCodes = pgTable(
  'pairing_codes',
  {
    // Eight characters from an unambiguous alphabet — no 0/O, no 1/I/l.
    code: text('code').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    bridgeId: uuid('bridge_id')
      .notNull()
      .references(() => bridges.id, { onDelete: 'cascade' }),

    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    // Set on redemption rather than deleting the row, so a second attempt can
    // be told the code was already used instead of "not found" — which is what
    // an attacker probing random codes should see.
    usedAt: timestamp('used_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('pairing_user_idx').on(table.userId)],
);

/**
 * Per-user display preferences for the device.
 *
 * Kept server-side so a replaced Edge picks up the same layout without being
 * reconfigured. None of it is sensitive.
 */
export const preferences = pgTable('preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),

  // 0 split, 1 metrics panel over the terminal, 2 terminal only.
  layout: text('layout').notNull().default('split'),

  // Comma-separated metric ids, in display order: "speed,distance,elapsedTime".
  metrics: text('metrics').notNull().default('speed,distance,elapsedTime'),

  // 0 smallest, 2 largest.
  fontSize: text('font_size').notNull().default('0'),

  alertOnPrompt: boolean('alert_on_prompt').notNull().default(true),

  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Bridge = typeof bridges.$inferSelect;
export type NewBridge = typeof bridges.$inferInsert;
export type Preferences = typeof preferences.$inferSelect;
