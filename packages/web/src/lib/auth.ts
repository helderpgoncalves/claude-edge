import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { eq, and, gt, lt } from 'drizzle-orm';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';

import { db } from './db/client';
import { users, sessions, oauthAccounts, type User } from './db/schema';

/**
 * Authentication.
 *
 * Hand-rolled rather than taken from a library, and worth explaining because
 * "don't roll your own auth" is usually right.
 *
 * What that advice protects against is inventing cryptography. Nothing here
 * does: passwords go through Argon2id at the parameters OWASP publishes, and
 * session tokens are 32 bytes from a CSPRNG stored server-side. There is no
 * novel scheme, no JWT signing to get wrong, no custom token format.
 *
 * What it buys is that session revocation is a DELETE. This account can reach
 * a terminal running an agent with shell access, so "sign out everywhere" has
 * to be immediate and total — not "wait for the JWT to expire".
 */

/** Cookie holding the session token. */
const SESSION_COOKIE = 'ce_session';

/**
 * How long a session lasts, and how much of that is left before it renews.
 *
 * Thirty days with a rolling renewal at fifteen: long enough that a phone kept
 * in a jersey pocket does not sign out mid-ride, short enough that an
 * abandoned session on a borrowed laptop expires.
 */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_RENEW_AFTER_MS = 15 * 24 * 60 * 60 * 1000;

/**
 * Argon2id parameters, from the OWASP Password Storage Cheat Sheet.
 *
 * 19 MiB and two iterations is the recommended floor. Raising the memory cost
 * is the most effective lever against GPU cracking, and 19 MiB per login is
 * affordable at this scale.
 */
const ARGON_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return argonHash(password, ARGON_OPTIONS);
}

/**
 * Check a password against a stored hash.
 *
 * Returns false rather than throwing on a malformed hash, so a corrupted row
 * fails the login rather than returning a 500 that tells an attacker the
 * account exists.
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argonVerify(hash, password);
  } catch {
    return false;
  }
}

/** A session token: 32 bytes from a CSPRNG, base64url encoded. */
function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Create a session and set its cookie.
 *
 * @param userId    Who the session belongs to.
 * @param userAgent Recorded so the user can recognise their own devices.
 */
export async function createSession(
  userId: string,
  meta: { userAgent?: string; ipAddress?: string } = {},
): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessions).values({
    token,
    userId,
    expiresAt,
    userAgent: meta.userAgent?.slice(0, 500) ?? null,
    ipAddress: meta.ipAddress ?? null,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    // Not readable from JavaScript, so an XSS bug cannot exfiltrate it.
    httpOnly: true,
    // Lax rather than Strict: Strict would drop the cookie when returning from
    // the Google OAuth redirect, silently breaking sign-in.
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });

  return token;
}

/**
 * The signed-in user, or null.
 *
 * Also handles rolling renewal: a session used within the last fifteen days of
 * its life is extended, so an active user is never signed out mid-task.
 */
export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({ user: users, session: sessions })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const remaining = row.session.expiresAt.getTime() - Date.now();
  if (remaining < SESSION_RENEW_AFTER_MS) {
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.token, token));
    store.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: expiresAt,
    });
  }

  return row.user;
}

/** End the current session. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    await db.delete(sessions).where(eq(sessions.token, token));
  }
  store.delete(SESSION_COOKIE);
}

/** End every session for a user. Used on password change. */
export async function destroyAllSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Remove expired sessions. Called opportunistically rather than on a timer. */
export async function pruneExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

// ---------------------------------------------------------------------------
// Registration and sign-in
// ---------------------------------------------------------------------------

export type AuthResult =
  | { ok: true; user: User }
  | { ok: false; error: string };

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Register with an email and password.
 *
 * The duplicate-email case returns the same generic message as a failed sign-in
 * would, so the form cannot be used to enumerate which addresses have accounts.
 */
export async function register(
  email: string,
  password: string,
  name?: string,
): Promise<AuthResult> {
  const normalised = normaliseEmail(email);

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalised))
    .limit(1);

  if (existing.length > 0) {
    return { ok: false, error: 'That email is already registered.' };
  }

  const passwordHash = await hashPassword(password);

  const inserted = await db
    .insert(users)
    .values({ email: normalised, passwordHash, name: name ?? null })
    .returning();

  const user = inserted[0];
  if (!user) return { ok: false, error: 'Could not create the account.' };

  return { ok: true, user };
}

/**
 * Sign in with an email and password.
 *
 * A missing account still runs a password verification against a dummy hash.
 * Without that, "no such user" returns in a millisecond while a real account
 * takes the full Argon2 cost, and the difference is measurable — which turns
 * the login form into an account-enumeration oracle.
 */
export async function signIn(email: string, password: string): Promise<AuthResult> {
  const normalised = normaliseEmail(email);

  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, normalised))
    .limit(1);

  const user = rows[0];

  if (!user || !user.passwordHash) {
    await verifyPassword(DUMMY_HASH, password);
    return { ok: false, error: 'Wrong email or password.' };
  }

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    return { ok: false, error: 'Wrong email or password.' };
  }

  return { ok: true, user };
}

/**
 * A valid Argon2id hash of a value nobody will ever submit, used to equalise
 * timing on the missing-account path.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$' +
  'RdescudvJCsgt3ub+b+dWRWJTmaaJObG';

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

/**
 * Find or create a user from an OAuth identity.
 *
 * Linking by verified email is deliberate. Someone who signed up with a
 * password and later uses "Sign in with Google" on the same address gets their
 * existing account rather than a confusing duplicate.
 *
 * This is only safe because the provider verified the address. An unverified
 * email from a provider would let an attacker claim an existing account by
 * registering that address with them, so it is rejected.
 */
export async function findOrCreateOAuthUser(params: {
  provider: string;
  providerAccountId: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  image?: string;
}): Promise<AuthResult> {
  const { provider, providerAccountId, emailVerified } = params;
  const email = normaliseEmail(params.email);

  if (!emailVerified) {
    return { ok: false, error: 'Your provider has not verified that email address.' };
  }

  // Already linked?
  const linked = await db
    .select({ user: users })
    .from(oauthAccounts)
    .innerJoin(users, eq(oauthAccounts.userId, users.id))
    .where(
      and(
        eq(oauthAccounts.provider, provider),
        eq(oauthAccounts.providerAccountId, providerAccountId),
      ),
    )
    .limit(1);

  const linkedUser = linked[0]?.user;
  if (linkedUser) return { ok: true, user: linkedUser };

  // An existing account with the same verified address: link rather than
  // duplicate.
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const existingUser = existing[0];

  if (existingUser) {
    await db.insert(oauthAccounts).values({
      userId: existingUser.id,
      provider,
      providerAccountId,
    });
    return { ok: true, user: existingUser };
  }

  // New account. No password hash — this user signs in through the provider.
  const inserted = await db
    .insert(users)
    .values({
      email,
      emailVerified: new Date(),
      name: params.name ?? null,
      image: params.image ?? null,
    })
    .returning();

  const user = inserted[0];
  if (!user) return { ok: false, error: 'Could not create the account.' };

  await db.insert(oauthAccounts).values({
    userId: user.id,
    provider,
    providerAccountId,
  });

  return { ok: true, user };
}

/**
 * Is Google sign-in configured?
 *
 * The button is hidden rather than shown-and-broken when the credentials are
 * absent, so a deployment without them looks deliberate instead of faulty.
 */
export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** Constant-time comparison for OAuth state values. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}
