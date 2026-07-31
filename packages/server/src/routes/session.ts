/**
 * routes/session.ts — the device's read path.
 *
 * GET /api/v1/session is polled continuously by the Edge, so it is the one
 * endpoint whose cost matters. Two properties keep it cheap:
 *
 *   - Conditional responses. The device echoes the last hash it holds; if the
 *     pane is unchanged the reply is 304 with no body. An idle session
 *     therefore costs a few dozen bytes per poll rather than several kilobytes.
 *
 *   - Server-chosen cadence. Every response carries `n`, the seconds the device
 *     should wait before asking again. Battery policy lives here, not in the
 *     device app, so it can be retuned without reflashing anyone's Edge.
 */

import type { FastifyInstance } from 'fastify';
import { SessionQuerySchema } from '@claude-edge/shared';

import type { Config } from '../config.ts';
import { pollIntervalFor } from '../config.ts';
import { readSession } from '../services/session.ts';
import { TmuxError } from '../services/tmux.ts';

export function registerSessionRoutes(app: FastifyInstance, config: Config): void {
  app.get('/api/v1/session', async (request, reply) => {
    const parsed = SessionQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        code: 'INVALID_QUERY',
        m: parsed.error.issues[0]?.message.slice(0, 80) ?? 'Invalid query.',
      });
    }

    const query = parsed.data;
    const session = query.session ?? config.TMUX_SESSION;

    // A client may only address sessions the operator listed. This is checked
    // before the name reaches tmux, so an unlisted session is indistinguishable
    // from a missing one and the response leaks nothing about what else exists.
    if (!config.allowedSessions.includes(session)) {
      return reply.code(404).send({
        ok: false,
        code: 'NO_SUCH_SESSION',
        m: 'Unknown session.',
      });
    }

    try {
      const { payload } = await readSession({
        session,
        lines: query.lines,
        width: query.width,
        offset: query.offset,
        pollFor: (state) => pollIntervalFor(state, config),
        ...(config.TMUX_SOCKET ? { socket: config.TMUX_SOCKET } : {}),
      });

      // Unchanged pane: reply 304 with no body. The device keeps what it has
      // and simply reschedules. `n` cannot ride along on a 304, so the device
      // reuses the interval from its last 200 — which is why the device caches
      // that value rather than treating it as per-response.
      if (query.etag !== undefined && query.etag === payload.h) {
        return reply
          .code(304)
          .header('ETag', `"${payload.h}"`)
          .header('Cache-Control', 'no-store')
          .send();
      }

      return reply
        .code(200)
        .header('ETag', `"${payload.h}"`)
        .header('Cache-Control', 'no-store')
        .send(payload);
    } catch (err) {
      if (err instanceof TmuxError) {
        return reply.code(err.statusCode).send({
          ok: false,
          code: err.code,
          m: err.message.slice(0, 80),
        });
      }
      request.log.error({ err }, 'session read failed');
      return reply.code(500).send({
        ok: false,
        code: 'INTERNAL',
        m: 'Could not read the session.',
      });
    }
  });
}
