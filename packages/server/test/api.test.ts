import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { health } from '../src/services/tmux.ts';

const execFileAsync = promisify(execFile);

/**
 * End-to-end tests against a real tmux session on a dedicated socket.
 *
 * The security properties being verified here — that authentication cannot be
 * skipped, that a stale approval is refused, that a retry does not act twice —
 * are exactly the ones a mocked tmux would happily confirm while the real
 * system failed. So these drive an actual pane.
 */
const SOCKET = 'claude-edge-api-test';
const SESSION = 'apitest';

const READ_TOKEN = randomBytes(32).toString('base64url');
const WRITE_TOKEN = randomBytes(32).toString('base64url');

let app: FastifyInstance;
let tmuxAvailable = false;

async function tmuxRaw(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('tmux', ['-L', SOCKET, ...args], { encoding: 'utf8' });
  return stdout;
}

/** Write text into the pane without executing it, to stage a screen. */
async function paint(text: string): Promise<void> {
  await tmuxRaw(['send-keys', '-t', SESSION, '-l', '--', `clear; printf '%s\\n' ${JSON.stringify(text)}`]);
  await tmuxRaw(['send-keys', '-t', SESSION, 'Enter']);
  await new Promise((r) => setTimeout(r, 250));
}

before(async () => {
  tmuxAvailable = (await health({ socket: SOCKET })).ok;
  if (!tmuxAvailable) return;

  await tmuxRaw(['kill-session', '-t', SESSION]).catch(() => undefined);
  await tmuxRaw(['new-session', '-d', '-s', SESSION, '-x', '80', '-y', '24']);
  await new Promise((r) => setTimeout(r, 300));

  app = await buildApp({
    logger: false,
    config: loadConfig({
      READ_TOKEN,
      WRITE_TOKEN,
      TMUX_SESSION: SESSION,
      TMUX_SOCKET: SOCKET,
      ALLOW_FREE_TEXT: 'true',
      NODE_ENV: 'test',
      // Raise the ceiling so rate limiting does not interfere with the tests
      // that are about something else; it has its own test below.
      RATE_READ_PER_MIN: '10000',
      RATE_WRITE_PER_MIN: '10000',
    } as NodeJS.ProcessEnv),
  });
});

after(async () => {
  if (app) await app.close();
  if (!tmuxAvailable) return;
  await tmuxRaw(['kill-session', '-t', SESSION]).catch(() => undefined);
  await tmuxRaw(['kill-server']).catch(() => undefined);
});

const readAuth = { authorization: `Bearer ${READ_TOKEN}` };
const writeAuth = { authorization: `Bearer ${WRITE_TOKEN}` };

function nonce(): string {
  return randomBytes(12).toString('hex');
}

describe('authentication', () => {
  it('rejects a request with no Authorization header', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    const res = await app.inject({ method: 'GET', url: '/api/v1/session' });
    assert.equal(res.statusCode, 401);
    assert.equal(res.json().code, 'UNAUTHENTICATED');
  });

  it('rejects an empty bearer token', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/session',
      headers: { authorization: 'Bearer ' },
    });
    assert.equal(res.statusCode, 401);
  });

  it('rejects a wrong token', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/session',
      headers: { authorization: `Bearer ${randomBytes(32).toString('base64url')}` },
    });
    assert.equal(res.statusCode, 401);
  });

  it('rejects a token supplied as a query parameter', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    // Query strings land in proxy logs and browser history, so they are not an
    // accepted credential channel even when the value itself is correct.
    const res = await app.inject({ method: 'GET', url: `/api/v1/session?token=${READ_TOKEN}` });
    assert.equal(res.statusCode, 401);
  });

  it('does not let a malformed body bypass the gate', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    // The ttyd CVE: auth ran only when the body had a certain shape. Auth here
    // is an onRequest hook, so it precedes body parsing entirely.
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/action',
      headers: { 'content-type': 'application/json' },
      payload: '{ this is not json',
    });
    assert.equal(res.statusCode, 401);
  });

  it('rejects an unknown route without a token, not with a 404', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    // A 404 would confirm which paths exist to an unauthenticated caller.
    const res = await app.inject({ method: 'GET', url: '/api/v1/nope' });
    assert.equal(res.statusCode, 401);
  });

  it('allows /health without a token', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    const res = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(res.statusCode, 200);
  });

  it('reveals nothing about the session on /health', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    const body = (await app.inject({ method: 'GET', url: '/health' })).json();
    assert.deepEqual(Object.keys(body).sort(), ['ok', 'version']);
  });

  it('refuses a read token on a write route', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/action',
      headers: readAuth,
      payload: { action: 'enter', nonce: nonce() },
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().code, 'FORBIDDEN');
  });

  it('accepts a write token on a read route', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    const res = await app.inject({ method: 'GET', url: '/api/v1/meta', headers: writeAuth });
    assert.equal(res.statusCode, 200);
  });
});

describe('GET /api/v1/session', () => {
  it('returns a payload matching the protocol shape', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    const res = await app.inject({ method: 'GET', url: '/api/v1/session', headers: readAuth });
    assert.equal(res.statusCode, 200);

    const body = res.json();
    assert.equal(body.v, 1);
    assert.ok(typeof body.s === 'string');
    assert.ok(Array.isArray(body.L));
    assert.match(body.h, /^[0-9a-f]{8}$/);
    assert.ok(Number.isInteger(body.n) && body.n >= 1);
  });

  it('honours the requested line count', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/session?lines=3',
      headers: readAuth,
    });
    assert.ok(res.json().L.length <= 3);
  });

  it('wraps to the requested width', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    await paint('x'.repeat(200));
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/session?width=30&lines=40',
      headers: readAuth,
    });
    for (const line of res.json().L) {
      assert.ok(line.length <= 30, `line of ${line.length} exceeded width 30`);
    }
  });

  it('returns 304 when the pane is unchanged', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');

    // Let the pane settle first. A shell that has just been written to keeps
    // repainting for a moment (prompt redraw, cursor position), so two reads
    // taken across that window legitimately differ. Polling for a stable hash
    // tests the caching behaviour rather than the shell's startup animation.
    let hash = '';
    for (let attempt = 0; attempt < 20; attempt++) {
      const a = (await app.inject({ method: 'GET', url: '/api/v1/session', headers: readAuth }))
        .json().h;
      await new Promise((r) => setTimeout(r, 120));
      const b = (await app.inject({ method: 'GET', url: '/api/v1/session', headers: readAuth }))
        .json().h;
      if (a === b) {
        hash = b;
        break;
      }
    }
    assert.notEqual(hash, '', 'pane never reached a stable hash');

    const second = await app.inject({
      method: 'GET',
      url: `/api/v1/session?etag=${hash}`,
      headers: readAuth,
    });
    assert.equal(second.statusCode, 304);
    assert.equal(second.body, '');
  });

  it('returns 200 with a new hash after the pane changes', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    const before = (await app.inject({ method: 'GET', url: '/api/v1/session', headers: readAuth }))
      .json().h;

    await paint('SOMETHING NEW');

    const after = await app.inject({
      method: 'GET',
      url: `/api/v1/session?etag=${before}`,
      headers: readAuth,
    });
    assert.equal(after.statusCode, 200);
    assert.notEqual(after.json().h, before);
  });

  it('refuses a session outside the allowlist', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/session?session=other',
      headers: readAuth,
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.json().code, 'NO_SUCH_SESSION');
  });

  it('rejects a session name containing tmux target syntax', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/session?session=apitest%3A0.1',
      headers: readAuth,
    });
    assert.ok(res.statusCode === 400 || res.statusCode === 404);
  });

  it('rejects an out-of-range line count', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/session?lines=99999',
      headers: readAuth,
    });
    assert.equal(res.statusCode, 400);
  });
});

describe('POST /api/v1/action', () => {
  beforeEach(async () => {
    if (!tmuxAvailable) return;
    // Leave the pane at a clean shell prompt between tests.
    await tmuxRaw(['send-keys', '-t', SESSION, 'C-u']);
    await paint('ready');
  });

  it('executes an allowlisted action', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/action',
      headers: writeAuth,
      payload: { action: 'clear_input', nonce: nonce() },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().ok, true);
  });

  it('refuses an action outside the allowlist', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/action',
      headers: writeAuth,
      payload: { action: 'rm_rf_slash', nonce: nonce() },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().code, 'UNKNOWN_ACTION');
  });

  it('refuses a destructive action when the server disallows it', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    // ALLOW_DESTRUCTIVE defaults to false in this app's config.
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/action',
      headers: writeAuth,
      payload: { action: 'sigint', nonce: nonce() },
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().code, 'ACTION_DISABLED');
  });

  it('does not advertise a disabled action in the catalogue', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    const meta = (await app.inject({ method: 'GET', url: '/api/v1/meta', headers: readAuth }))
      .json();
    assert.ok(!meta.actions.some((a: { id: string }) => a.id === 'sigint'));
  });

  it('replays a repeated nonce instead of acting twice', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    // A BLE retry must not deliver a second Enter into whatever is on screen by
    // the time it arrives.
    const n = nonce();
    const payload = { action: 'clear_input', nonce: n };

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/action',
      headers: writeAuth,
      payload,
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/action',
      headers: writeAuth,
      payload,
    });

    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    assert.equal(second.json().deduped, true);
    assert.equal(second.json().h, first.json().h);
  });

  it('refuses to act when the screen has changed since the rider looked', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    // The anti-TOCTOU check: with seconds of BLE latency, an approval intended
    // for one prompt must not land on the next one.
    const stale = 'deadbeef';
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/action',
      headers: writeAuth,
      payload: { action: 'clear_input', nonce: nonce(), expect: stale },
    });
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().code, 'STALE_VIEW');
  });

  it('acts when the expectation matches the current screen', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    const current = (
      await app.inject({ method: 'GET', url: '/api/v1/session', headers: readAuth })
    ).json().h;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/action',
      headers: writeAuth,
      payload: { action: 'clear_input', nonce: nonce(), expect: current },
    });
    assert.equal(res.statusCode, 200);
  });

  it('lets a refused request be retried with the same nonce', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    // A request rejected for staleness did nothing, so its nonce must not be
    // burned — otherwise the rider's second, correct attempt would be deduped
    // into replaying a failure.
    const n = nonce();

    const rejected = await app.inject({
      method: 'POST',
      url: '/api/v1/action',
      headers: writeAuth,
      payload: { action: 'clear_input', nonce: n, expect: 'deadbeef' },
    });
    assert.equal(rejected.statusCode, 409);

    const current = (
      await app.inject({ method: 'GET', url: '/api/v1/session', headers: readAuth })
    ).json().h;

    const retried = await app.inject({
      method: 'POST',
      url: '/api/v1/action',
      headers: writeAuth,
      payload: { action: 'clear_input', nonce: n, expect: current },
    });
    assert.equal(retried.statusCode, 200);
    assert.notEqual(retried.json().deduped, true);
  });

  it('refuses to send keys while the pane is in copy mode', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    // tmux binds keys to its own scroll commands in copy mode, so anything sent
    // is swallowed. Failing loudly beats an approval that silently evaporates.
    await tmuxRaw(['copy-mode', '-t', SESSION]);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/action',
        headers: writeAuth,
        payload: { action: 'clear_input', nonce: nonce() },
      });
      assert.equal(res.statusCode, 409);
      assert.equal(res.json().code, 'PANE_IN_COPY_MODE');
    } finally {
      await tmuxRaw(['send-keys', '-t', SESSION, '-X', 'cancel']).catch(() => undefined);
    }
  });

  it('rejects a missing nonce', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/action',
      headers: writeAuth,
      payload: { action: 'enter' },
    });
    assert.equal(res.statusCode, 400);
  });
});

describe('POST /api/v1/text', () => {
  it('delivers text literally rather than as key names', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    // "Enter" and "C-c" are tmux key names. Sent literally they must appear as
    // characters; this is the property that stops typed text executing itself.
    await tmuxRaw(['send-keys', '-t', SESSION, 'C-u']);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/text',
      headers: writeAuth,
      payload: { text: 'echo Enter C-c Escape MARKER', nonce: nonce(), submit: false },
    });
    assert.equal(res.statusCode, 200);

    await new Promise((r) => setTimeout(r, 250));
    const pane = await tmuxRaw(['capture-pane', '-p', '-J', '-t', SESSION]);
    assert.ok(
      pane.includes('Enter C-c Escape MARKER'),
      `text was interpreted rather than typed: ${pane.slice(-200)}`,
    );

    await tmuxRaw(['send-keys', '-t', SESSION, 'C-u']);
  });

  it('strips control characters from submitted text', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    await tmuxRaw(['send-keys', '-t', SESSION, 'C-u']);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/text',
      headers: writeAuth,
      payload: { text: 'safe[31mtexthere', nonce: nonce(), submit: false },
    });
    assert.equal(res.statusCode, 200);

    await new Promise((r) => setTimeout(r, 250));
    const pane = await tmuxRaw(['capture-pane', '-p', '-J', '-t', SESSION]);
    assert.ok(pane.includes('safe[31mtexthere'), `unexpected pane: ${pane.slice(-200)}`);

    await tmuxRaw(['send-keys', '-t', SESSION, 'C-u']);
  });

  it('rejects text that is empty after sanitisation', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/text',
      headers: writeAuth,
      payload: { text: ' ', nonce: nonce() },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().code, 'EMPTY_TEXT');
  });

  it('rejects oversized text', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/text',
      headers: writeAuth,
      payload: { text: 'x'.repeat(5000), nonce: nonce() },
    });
    assert.equal(res.statusCode, 400);
  });
});

describe('GET /api/v1/meta', () => {
  it('describes the server capabilities', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    const body = (await app.inject({ method: 'GET', url: '/api/v1/meta', headers: readAuth }))
      .json();

    assert.equal(body.v, 1);
    assert.ok(Array.isArray(body.actions) && body.actions.length > 0);
    assert.ok(body.poll.working >= 1 && body.poll.idle >= 1);
  });

  it('lists only allowlisted sessions', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');
    const body = (await app.inject({ method: 'GET', url: '/api/v1/meta', headers: readAuth }))
      .json();
    assert.deepEqual(
      body.sessions.map((s: { name: string }) => s.name),
      [SESSION],
    );
  });
});

describe('free text disabled', () => {
  it('returns 403 when the deployment has not enabled it', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');

    const strict = await buildApp({
      logger: false,
      config: loadConfig({
        READ_TOKEN,
        WRITE_TOKEN,
        TMUX_SESSION: SESSION,
        TMUX_SOCKET: SOCKET,
        NODE_ENV: 'test',
      } as NodeJS.ProcessEnv),
    });

    try {
      const res = await strict.inject({
        method: 'POST',
        url: '/api/v1/text',
        headers: writeAuth,
        payload: { text: 'hello', nonce: nonce() },
      });
      assert.equal(res.statusCode, 403);
      assert.equal(res.json().code, 'FREE_TEXT_DISABLED');
    } finally {
      await strict.close();
    }
  });
});

describe('rate limiting', () => {
  it('limits writes and returns the shared error shape', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');

    const limited = await buildApp({
      logger: false,
      config: loadConfig({
        READ_TOKEN,
        WRITE_TOKEN,
        TMUX_SESSION: SESSION,
        TMUX_SOCKET: SOCKET,
        RATE_WRITE_PER_MIN: '3',
        NODE_ENV: 'test',
      } as NodeJS.ProcessEnv),
    });

    try {
      let limitedCount = 0;
      for (let i = 0; i < 6; i++) {
        const res = await limited.inject({
          method: 'POST',
          url: '/api/v1/action',
          headers: writeAuth,
          payload: { action: 'clear_input', nonce: nonce() },
        });
        if (res.statusCode === 429) {
          limitedCount++;
          assert.equal(res.json().code, 'RATE_LIMITED');
        }
      }
      assert.ok(limitedCount > 0, 'rate limit never engaged');
    } finally {
      await limited.close();
    }
  });
});
