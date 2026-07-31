/**
 * routes/meta.ts — capability discovery and liveness.
 *
 * The device fetches /meta once at startup and caches it. Everything the app
 * needs in order to render its own UI comes from here — the action catalogue,
 * the session list, whether free text is permitted — so the same binary adapts
 * to a server with different policy without being rebuilt.
 */

import type { FastifyInstance } from 'fastify';
import { PROTOCOL_VERSION, type MetaResponse } from '@claude-edge/shared';

import type { Config } from '../config.ts';
import { actionCatalogue } from '../services/keymap.ts';
import { health, listSessions } from '../services/tmux.ts';

/** Server version, surfaced for bug reports and the device's about screen. */
export const SERVER_VERSION = '0.1.0';

export function registerMetaRoutes(app: FastifyInstance, config: Config): void {
  const tmuxOpts = config.TMUX_SOCKET ? { socket: config.TMUX_SOCKET } : {};

  app.get('/api/v1/meta', async (_request, reply) => {
    // Only sessions the operator allowed are ever named, so the response
    // cannot enumerate the rest of the machine's tmux state.
    const live = await listSessions(tmuxOpts).catch(() => []);
    const liveByName = new Map(live.map((s) => [s.name, s]));

    const sessions = config.allowedSessions.map((name) => ({
      name,
      attached: liveByName.get(name)?.attached ?? false,
    }));

    const payload: MetaResponse = {
      v: PROTOCOL_VERSION,
      server: SERVER_VERSION,
      actions: actionCatalogue(config.ALLOW_DESTRUCTIVE),
      sessions,
      freeText: config.ALLOW_FREE_TEXT,
      poll: {
        working: config.POLL_WORKING_S,
        idle: config.POLL_IDLE_S,
        blocked: config.POLL_BLOCKED_S,
      },
    };

    return reply.code(200).header('Cache-Control', 'no-store').send(payload);
  });

  /**
   * Liveness probe. Deliberately unauthenticated and deliberately uninformative:
   * an orchestrator can tell the process is up without holding a credential,
   * and an unauthenticated caller learns nothing about the session, its
   * contents, or which sessions exist.
   */
  app.get('/health', async (_request, reply) => {
    const tmuxHealth = await health(tmuxOpts);
    return reply.code(tmuxHealth.ok ? 200 : 503).send({
      ok: tmuxHealth.ok,
      version: SERVER_VERSION,
    });
  });
}
