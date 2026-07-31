import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { db, schema } from '@/lib/db/client.ts';
import { LOCALES } from '@/i18n/config.ts';

/**
 * Waitlist sign-up.
 *
 * Writes an address and nothing else. The form promises one email when Coach
 * mode ships, and this route is deliberately incapable of collecting more than
 * that — no IP, no user agent, no referrer. A route that cannot gather
 * tracking data is a better guarantee than a privacy policy promising it will
 * not be read.
 */

export const dynamic = 'force-dynamic';

const Body = z.object({
  // Zod's email check is deliberately permissive; the real validation of an
  // address is whether mail to it is delivered, and stricter regexes reject
  // valid addresses far more often than they catch invalid ones.
  email: z.string().trim().toLowerCase().email().max(254),
  interest: z.enum(['coach']).default('coach'),
  locale: z.enum(LOCALES).default('en'),
});

/**
 * A crude in-process rate limit.
 *
 * Enough to stop a script filling the table from one address, and honestly not
 * more than that: it is per-instance and resets on deploy, so a distributed
 * attempt walks straight past it. That is an accepted limit rather than an
 * oversight — the endpoint writes one low-value row, and the real defence is
 * the unique index, which makes repeated submissions idempotent rather than
 * additive. Revisit if this ever gets abused in a way the index does not
 * absorb.
 */
const RATE_LIMIT = { windowMs: 60_000, max: 5 };
const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + RATE_LIMIT.windowMs });

    // Opportunistic sweep. Without it the map grows for the process lifetime,
    // which on a long-running server is a slow leak.
    if (attempts.size > 5_000) {
      for (const [k, v] of attempts) if (now > v.resetAt) attempts.delete(k);
    }
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_LIMIT.max;
}

export async function POST(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? 'unknown';

  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = Body.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }

  const { email, interest, locale } = parsed.data;

  try {
    await db
      .insert(schema.waitlist)
      .values({ email, interest, locale })
      /*
       * Signing up twice updates the locale rather than failing.
       *
       * The alternative — letting the unique index throw and returning an
       * error — tells the submitter whether that address is already on the
       * list, which turns this endpoint into an oracle for checking whether
       * someone signed up. Upserting silently is both friendlier and less
       * disclosive.
       */
      .onConflictDoUpdate({
        target: [schema.waitlist.email, schema.waitlist.interest],
        set: { locale },
      });
  } catch (error) {
    // Logged without the address: this is an error log, not a mailing list,
    // and an address in a log file outlives the row it came from.
    console.error('waitlist insert failed', {
      interest,
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  // 201 either way. See the upsert note above: distinguishing "created" from
  // "already there" would leak membership of the list.
  return NextResponse.json({ ok: true }, { status: 201 });
}
