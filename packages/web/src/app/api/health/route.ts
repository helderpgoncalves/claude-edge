import { NextResponse } from 'next/server';

/**
 * Liveness probe.
 *
 * Deliberately does not touch the database. A health check that fails when
 * Postgres is briefly unavailable causes the orchestrator to restart a web app
 * that is working fine — turning a recoverable database blip into an outage.
 * Database problems surface on the routes that need it, with a message the
 * user can act on.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ ok: true });
}
