/**
 * auth.ts — the single, unconditional authentication gate.
 *
 * THE FAILURE THIS IS SHAPED TO AVOID
 * -----------------------------------
 * ttyd <= 1.3.0 shipped a critical unauthenticated RCE (NCC Group, 2017). The
 * root cause was not weak crypto; it was *conditional* authentication. The
 * token was validated only when the request body happened to contain a token
 * field, so omitting the field entirely skipped the check and the client was
 * treated as authenticated.
 *
 * The rule that follows, and that this module enforces:
 *
 *   Authentication runs on every request, before routing and before body
 *   parsing, and a missing credential is a rejection — never a skip.
 *
 * Concretely:
 *   - The hook is registered `onRequest`, the earliest Fastify lifecycle stage,
 *     so it precedes body parsing and cannot be bypassed by a malformed body.
 *   - Public paths are an explicit allowlist checked against the exact routed
 *     path, not a prefix or a pattern.
 *   - Comparison is constant-time over fixed-length digests.
 *   - Reads and writes take different credentials, so a token on a display-only
 *     device cannot type into the session.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import type { Config } from '../config.ts';

/** Access level a route requires. */
export type Scope = 'read' | 'write';

/**
 * Routes reachable without a credential. Exact matches only.
 *
 * `/health` is unauthenticated so an orchestrator can probe liveness without
 * holding a secret. It deliberately reveals nothing about the session: no
 * state, no pane content, no session names.
 */
const PUBLIC_PATHS: ReadonlySet<string> = new Set(['/health']);

/**
 * Per-route scope. Anything not listed requires write access, so a new route
 * added without thought fails closed rather than open.
 */
const READ_PATHS: ReadonlySet<string> = new Set([
  '/api/v1/session',
  '/api/v1/meta',
  '/api/v1/events',
]);

declare module 'fastify' {
  interface FastifyRequest {
    /** Scope granted to this request, set by the auth hook. */
    authScope?: Scope;
  }
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Constant-time digest comparison.
 *
 * Both operands are SHA-256 outputs, so lengths always match and
 * timingSafeEqual cannot throw. Hashing first also means a token of any length
 * is compared in constant time relative to the secret.
 */
function digestsMatch(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Extract a bearer token from the Authorization header.
 *
 * Only the header is accepted. Query parameters are rejected outright because
 * they land in proxy logs, browser history, and Referer headers — and the Edge
 * has no reason to use them.
 */
function extractBearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (typeof header !== 'string') return null;

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;

  const token = match[1]?.trim();
  return token && token.length > 0 ? token : null;
}

/** Which scope does this path require? */
export function scopeForPath(path: string): Scope {
  return READ_PATHS.has(path) ? 'read' : 'write';
}

/**
 * Register the authentication gate.
 *
 * @param app    Fastify instance.
 * @param config Validated configuration holding the token digests.
 */
export function registerAuth(app: FastifyInstance, config: Config): void {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Compare against the routed path without its query string. `routeOptions`
    // is unavailable this early for unmatched routes, so derive it from the URL
    // and treat anything unrecognised as write-scoped (fail closed).
    const path = request.url.split('?')[0] ?? '';

    if (PUBLIC_PATHS.has(path)) return;

    const token = extractBearer(request);

    // A missing credential is a rejection. This is the ttyd lesson: there is no
    // branch here that lets an absent token proceed.
    if (token === null) {
      await reply.code(401).header('WWW-Authenticate', 'Bearer').send({
        ok: false,
        code: 'UNAUTHENTICATED',
        m: 'Missing bearer token.',
      });
      return;
    }

    const presented = sha256(token);
    const required = scopeForPath(path);

    // A write token also grants read, so a single-token deployment works and a
    // device holding the write credential need not carry two.
    const isWrite = digestsMatch(presented, config.writeTokenHash);
    const isRead = digestsMatch(presented, config.readTokenHash);

    if (!isWrite && !isRead) {
      request.log.warn({ path, ip: request.ip }, 'authentication failed');
      await reply.code(401).send({
        ok: false,
        code: 'UNAUTHENTICATED',
        m: 'Invalid token.',
      });
      return;
    }

    if (required === 'write' && !isWrite) {
      request.log.warn({ path, ip: request.ip }, 'read token used on a write route');
      await reply.code(403).send({
        ok: false,
        code: 'FORBIDDEN',
        m: 'This token cannot write.',
      });
      return;
    }

    request.authScope = isWrite ? 'write' : 'read';
  });
}
