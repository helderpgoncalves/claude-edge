/**
 * routes/action.ts — the write path.
 *
 * Every request that can type into the session passes through here, and it is
 * the only place in the server that does. The route enforces five checks in a
 * fixed order, each defending a distinct failure:
 *
 *   1. Session allowlist   — a client cannot address a pane the operator did
 *                            not list, so a bug in target handling cannot reach
 *                            the operator's other work.
 *   2. Nonce reservation   — a retry over a flaky BLE link replays the original
 *                            outcome instead of acting twice.
 *   3. Pane-state guard    — tmux in copy mode swallows keys; sending anyway
 *                            would silently lose the approval.
 *   4. Expectation match   — the pane must still hash to what the rider saw.
 *                            This is the anti-TOCTOU check and the reason the
 *                            protocol carries a hash at all.
 *   5. Allowlist resolve   — the action id maps to a fixed key sequence defined
 *                            in code; the request never carries keys.
 *
 * Checks 3 and 4 are the ones that matter most in practice. A BLE round trip is
 * seconds long, and Claude Code moves on: without them, "approve" pressed on
 * prompt A lands on whatever prompt B happens to be showing.
 */

import type { FastifyInstance } from 'fastify';
import {
  ActionRequestSchema,
  TextRequestSchema,
  type ActionResponse,
} from '@claude-edge/shared';

import type { Config } from '../config.ts';
import { currentHash, readSession } from '../services/session.ts';
import { paneInfo, sendKeys, TmuxError } from '../services/tmux.ts';
import {
  ActionError,
  buildSelectSequence,
  isDestructiveOption,
  resolveAction,
  sanitiseFreeText,
} from '../services/keymap.ts';
import { NonceStore } from '../services/nonce.ts';

/** Marker stored while a request is executing, to reject concurrent duplicates. */
const IN_FLIGHT = Symbol('in-flight');
type StoredOutcome = ActionResponse | typeof IN_FLIGHT;

export function registerActionRoutes(app: FastifyInstance, config: Config): void {
  const nonces = new NonceStore<StoredOutcome>();
  const tmuxOpts = config.TMUX_SOCKET ? { socket: config.TMUX_SOCKET } : {};

  /**
   * Shared pre-flight for both write routes.
   * @returns an error response to send, or null when it is safe to proceed.
   */
  async function preflight(
    session: string,
    expect: string | undefined,
  ): Promise<{ code: number; body: unknown } | null> {
    if (!config.allowedSessions.includes(session)) {
      return { code: 404, body: { ok: false, code: 'NO_SUCH_SESSION', m: 'Unknown session.' } };
    }

    const info = await paneInfo({ session, ...tmuxOpts });

    if (info.dead) {
      return {
        code: 409,
        body: { ok: false, code: 'PANE_DEAD', m: 'The pane has exited.' },
      };
    }

    // Copy mode binds keys to tmux's own scroll commands, so anything we send
    // is consumed there and never reaches Claude Code. Failing loudly is far
    // better than an approval that silently evaporates.
    if (info.inMode) {
      return {
        code: 409,
        body: {
          ok: false,
          code: 'PANE_IN_COPY_MODE',
          m: 'Pane is in scroll mode. Exit it to send keys.',
        },
      };
    }

    if (expect !== undefined) {
      const actual = await currentHash(session, tmuxOpts);
      if (actual !== expect) {
        return {
          code: 409,
          body: {
            ok: false,
            code: 'STALE_VIEW',
            m: 'The screen changed. Refresh and look again.',
          },
        };
      }
    }

    return null;
  }

  // -------------------------------------------------------------- /action
  app.post('/api/v1/action', async (request, reply) => {
    const parsed = ActionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        code: 'INVALID_BODY',
        m: parsed.error.issues[0]?.message.slice(0, 80) ?? 'Invalid request.',
      });
    }

    const { action: actionId, nonce, expect } = parsed.data;
    const session = parsed.data.session ?? config.TMUX_SESSION;

    // Replay first: a duplicate must not even reach the pane-state checks,
    // whose results could differ from when the original ran.
    const seen = nonces.get(nonce);
    if (seen !== undefined) {
      if (seen === IN_FLIGHT) {
        return reply.code(409).send({
          ok: false,
          code: 'IN_FLIGHT',
          m: 'That request is already running.',
        });
      }
      return reply.code(200).send({ ...seen, deduped: true });
    }

    // `select:N` is resolved later, against the prompt as it exists at the
    // moment of the write — not against whatever the client believed. Fixed
    // actions resolve now so an unknown id fails before anything is reserved.
    const selectMatch = /^select:(\d)$/.exec(actionId);
    let action = null;

    if (!selectMatch) {
      try {
        action = resolveAction(actionId, config.ALLOW_DESTRUCTIVE);
      } catch (err) {
        if (err instanceof ActionError) {
          return reply.code(err.statusCode).send({
            ok: false,
            code: err.code,
            m: err.message.slice(0, 80),
          });
        }
        throw err;
      }
    }

    if (!nonces.reserve(nonce, IN_FLIGHT)) {
      return reply.code(409).send({
        ok: false,
        code: 'IN_FLIGHT',
        m: 'That request is already running.',
      });
    }

    try {
      const blocked = await preflight(session, expect);
      if (blocked) {
        // Release so the client may retry with the same nonce once the
        // condition clears; a refused request did nothing worth remembering.
        nonces.release(nonce);
        return reply.code(blocked.code).send(blocked.body);
      }

      let keys: readonly string[];
      let literal = false;
      let resolvedId: string;

      if (selectMatch) {
        // Re-read the prompt now rather than trusting the client's view of it.
        // The client says *which option it means*; the server decides which
        // keys reach it. That matters because the required key differs with
        // layout — Right for a horizontal row, Down for a vertical list — and a
        // client that guessed wrong would silently select a different answer.
        const index = Number.parseInt(selectMatch[1] as string, 10);
        const view = await readSession({
          session,
          lines: 1,
          width: 80,
          offset: 0,
          pollFor: () => 1,
          ...tmuxOpts,
        });

        const prompt = view.payload.p;
        if (!prompt || prompt.o.length === 0) {
          nonces.release(nonce);
          return reply.code(409).send({
            ok: false,
            code: 'NO_PROMPT',
            m: 'Nothing is waiting for an answer.',
          });
        }

        if (index >= prompt.o.length) {
          nonces.release(nonce);
          return reply.code(409).send({
            ok: false,
            code: 'OPTION_OUT_OF_RANGE',
            m: 'That option is no longer on screen.',
          });
        }

        // A choice that would grant lasting permission is refused unless the
        // operator opted in. The device also confirms locally, but the server
        // is the boundary that actually holds.
        if (isDestructiveOption(prompt, index) && !config.ALLOW_DESTRUCTIVE) {
          nonces.release(nonce);
          return reply.code(403).send({
            ok: false,
            code: 'ACTION_DISABLED',
            m: 'Lasting permission grants are disabled here.',
          });
        }

        keys = buildSelectSequence(prompt, index, view.verticalOptions);
        resolvedId = actionId;
      } else if (action !== null) {
        keys = action.keys;
        literal = action.literal === true;
        resolvedId = action.id;
      } else {
        // Unreachable: `action` is assigned whenever selectMatch is null, and
        // resolveAction throws rather than returning null. Handled explicitly
        // so the compiler proves it rather than being told to assume it.
        nonces.release(nonce);
        return reply.code(400).send({
          ok: false,
          code: 'UNKNOWN_ACTION',
          m: 'Unrecognised action.',
        });
      }

      await sendKeys({
        session,
        keys,
        ...(literal ? { literal: true } : {}),
        ...tmuxOpts,
      });

      // A literal prompt is typed but not submitted by the same call: splitting
      // them means a half-delivered prompt never fires on its own.
      if (literal) {
        await sendKeys({ session, keys: ['Enter'], ...tmuxOpts });
      }

      const after = await currentHash(session, tmuxOpts);
      const result: ActionResponse = { ok: true, action: resolvedId, h: after };

      nonces.set(nonce, result);

      // Every write is logged with what was sent, against which screen, and
      // what the screen became. If something is approved that should not have
      // been, this is the record that makes it reconstructable.
      request.log.info(
        { action: resolvedId, session, expect, resultHash: after },
        'action executed',
      );

      return reply.code(200).send(result);
    } catch (err) {
      nonces.release(nonce);

      if (err instanceof TmuxError) {
        return reply.code(err.statusCode).send({
          ok: false,
          code: err.code,
          m: err.message.slice(0, 80),
        });
      }
      request.log.error({ err, action: actionId }, 'action failed');
      return reply.code(500).send({
        ok: false,
        code: 'INTERNAL',
        m: 'Could not send the action.',
      });
    }
  });

  // ---------------------------------------------------------------- /text
  // Free text is a separate route, disabled by default, because arbitrary text
  // into a running agent is arbitrary instruction to a system with file and
  // shell access. It exists for the phone, where there is a real keyboard.
  app.post('/api/v1/text', async (request, reply) => {
    if (!config.ALLOW_FREE_TEXT) {
      return reply.code(403).send({
        ok: false,
        code: 'FREE_TEXT_DISABLED',
        m: 'Free text is disabled on this server.',
      });
    }

    const parsed = TextRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        code: 'INVALID_BODY',
        m: parsed.error.issues[0]?.message.slice(0, 80) ?? 'Invalid request.',
      });
    }

    const { nonce, submit } = parsed.data;
    const session = parsed.data.session ?? config.TMUX_SESSION;

    const seen = nonces.get(nonce);
    if (seen !== undefined) {
      if (seen === IN_FLIGHT) {
        return reply.code(409).send({ ok: false, code: 'IN_FLIGHT', m: 'Already running.' });
      }
      return reply.code(200).send({ ...seen, deduped: true });
    }

    let text: string;
    try {
      text = sanitiseFreeText(parsed.data.text);
    } catch (err) {
      if (err instanceof ActionError) {
        return reply.code(err.statusCode).send({
          ok: false,
          code: err.code,
          m: err.message.slice(0, 80),
        });
      }
      throw err;
    }

    if (!nonces.reserve(nonce, IN_FLIGHT)) {
      return reply.code(409).send({ ok: false, code: 'IN_FLIGHT', m: 'Already running.' });
    }

    try {
      const blocked = await preflight(session, undefined);
      if (blocked) {
        nonces.release(nonce);
        return reply.code(blocked.code).send(blocked.body);
      }

      // `literal: true` is what makes this safe to send: it disables tmux's
      // key-name lookup, so text containing "Enter" or "C-c" arrives as those
      // characters rather than as keypresses.
      await sendKeys({ session, keys: [text], literal: true, ...tmuxOpts });

      if (submit) {
        await sendKeys({ session, keys: ['Enter'], ...tmuxOpts });
      }

      const after = await currentHash(session, tmuxOpts);
      const result: ActionResponse = { ok: true, action: 'text', h: after };
      nonces.set(nonce, result);

      request.log.info({ session, length: text.length, submit }, 'text sent');

      return reply.code(200).send(result);
    } catch (err) {
      nonces.release(nonce);

      if (err instanceof TmuxError) {
        return reply.code(err.statusCode).send({
          ok: false,
          code: err.code,
          m: err.message.slice(0, 80),
        });
      }
      request.log.error({ err }, 'text send failed');
      return reply.code(500).send({ ok: false, code: 'INTERNAL', m: 'Could not send text.' });
    }
  });
}
