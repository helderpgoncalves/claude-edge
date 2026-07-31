/**
 * app.ts — assembles the Fastify instance.
 *
 * Kept separate from index.ts so tests can build an app without binding a port
 * or installing signal handlers.
 *
 * PLUGIN ORDER IS A SECURITY PROPERTY
 * -----------------------------------
 * Authentication is registered before rate limiting and before any route. That
 * ordering is deliberate: it means an unauthenticated request is rejected
 * before it can consume a rate-limit bucket belonging to a legitimate token,
 * and before any body is parsed. The gate must be the first thing a request
 * meets, not one check among several.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { createHash } from 'node:crypto';

import type { Config } from './config.ts';
import { registerAuth, scopeForPath } from './middleware/auth.ts';
import { registerSessionRoutes } from './routes/session.ts';
import { registerActionRoutes } from './routes/action.ts';
import { registerMetaRoutes } from './routes/meta.ts';

/**
 * Largest request body accepted. The device sends tiny JSON objects; the PWA's
 * free-text route is capped at 2 KB of text. Anything larger is a mistake or an
 * attack, and rejecting it early avoids buffering it.
 */
const BODY_LIMIT_BYTES = 16 * 1024;

export interface BuildAppOptions {
  config: Config;
  /** Pino options or a logger instance; false disables logging in tests. */
  logger?: boolean | object;
}

export async function buildApp({ config, logger }: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: logger ?? {
      level: config.LOG_LEVEL,
      // Never log Authorization headers, even at trace level.
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie'],
        remove: true,
      },
    },
    bodyLimit: BODY_LIMIT_BYTES,
    // Trust the reverse proxy for client IPs, which rate limiting keys on.
    trustProxy: true,

    // Suppress the per-request access log in production. The device polls every
    // few seconds around the clock, so two lines per request is a great deal of
    // noise for no signal; the entries that matter — failed authentication and
    // every executed write — are logged explicitly where they happen.
    //
    // Fastify 5 deprecates this in favour of `logController`, but that option
    // requires supplying the entire controller interface (ten members) to change
    // one boolean, and re-implementing Fastify's request logging to turn part of
    // it off is a poor trade. Revisit when Fastify 6 removes this.
    disableRequestLogging: config.NODE_ENV === 'production',
  });

  // ---- Security headers. The API serves JSON to a device and a PWA; a strict
  // CSP costs nothing here and blocks a class of mistakes if a future route
  // ever returns HTML.
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    // The Edge reaches the server through the phone; HSTS is set by the
    // TLS-terminating proxy that actually owns the certificate.
    hsts: false,
  });

  // ---- Authentication, before rate limiting and before routes.
  registerAuth(app, config);

  // ---- Rate limiting, keyed by token rather than IP.
  //
  // Every request from an Edge arrives via the phone and then whatever network
  // the phone is on, so the source IP changes constantly and shares NAT with
  // strangers. Keying on the presented credential is both more accurate and
  // more useful: it bounds what one leaked token can do.
  await app.register(rateLimit, {
    global: true,
    max: (request) => {
      const path = request.url.split('?')[0] ?? '';
      return scopeForPath(path) === 'write'
        ? config.RATE_WRITE_PER_MIN
        : config.RATE_READ_PER_MIN;
    },
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      const auth = request.headers.authorization;
      if (typeof auth === 'string' && auth.length > 0) {
        // Hash so the bucket key never contains the secret itself.
        return createHash('sha256').update(auth).digest('hex').slice(0, 32);
      }
      return request.ip;
    },
    // `statusCode` must be present in the returned object. Without it the
    // custom error is handed to the generic error handler and surfaces as a
    // 500 — which would tell a polling device that the *server* is broken
    // rather than that it should back off, and it would keep hammering.
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      ok: false,
      code: 'RATE_LIMITED',
      m: `Too many requests. Retry in ${Math.ceil(context.ttl / 1000)}s.`,
    }),
  });

  // ---- Routes.
  registerMetaRoutes(app, config);
  registerSessionRoutes(app, config);
  registerActionRoutes(app, config);

  // ---- Uniform error and 404 shapes, so the device only ever parses one
  // error format regardless of where the failure came from.
  app.setNotFoundHandler(async (_request, reply) =>
    reply.code(404).send({ ok: false, code: 'NOT_FOUND', m: 'No such endpoint.' }),
  );

  app.setErrorHandler(async (error: unknown, request, reply) => {
    const err = error as { statusCode?: number; message?: string; code?: string };
    const status = err.statusCode ?? 500;

    if (status >= 500) {
      request.log.error({ err: error }, 'unhandled error');
    }

    // Errors that already carry a machine-readable code — chiefly the rate
    // limiter's — keep it. Flattening everything to BAD_REQUEST here would tell
    // a throttled device its request was malformed, so it would fix nothing and
    // keep retrying at the same rate.
    if (status === 429) {
      return reply.code(429).send({
        ok: false,
        code: 'RATE_LIMITED',
        m: (err.message || 'Too many requests.').slice(0, 80),
      });
    }

    // Internal messages can carry paths and stack detail; only echo the message
    // for client errors, where it is actionable and safe.
    return reply.code(status).send({
      ok: false,
      code: status >= 500 ? 'INTERNAL' : 'BAD_REQUEST',
      m: status >= 500 ? 'Server error.' : (err.message || 'Bad request.').slice(0, 80),
    });
  });

  return app;
}
