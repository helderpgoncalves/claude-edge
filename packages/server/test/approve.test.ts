import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { health } from '../src/services/tmux.ts';

const execFileAsync = promisify(execFile);

/**
 * The approval path, end to end, against a real pane.
 *
 * This is the test that matters most in the whole suite. Answering a permission
 * prompt is the one action with consequences the rider cannot undo from a
 * bicycle, and every part of it — parsing the options, choosing the arrow key
 * for the layout, refusing a stale view — has to be right at the same time.
 *
 * A fake prompt is painted into the pane rather than driving a real Claude Code
 * session, because the test needs to assert on *which keys arrived*. The pane
 * runs `cat -v`, which echoes control characters visibly, so a Right arrow
 * shows up as `^[[C` and can be asserted on directly.
 */
// Unique per process: the test runner executes files in parallel, and a
// shared socket means one file's kill-server lands mid-capture in another.
const SOCKET = `ce-approve-${randomBytes(4).toString('hex')}`;
const SESSION = 'approvetest';

const TOKEN = randomBytes(32).toString('base64url');
const auth = { authorization: `Bearer ${TOKEN}` };

let app: FastifyInstance;
let tmuxAvailable = false;

async function tmuxRaw(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('tmux', ['-L', SOCKET, ...args], { encoding: 'utf8' });
  return stdout;
}

async function capture(): Promise<string> {
  return tmuxRaw(['capture-pane', '-p', '-J', '-t', SESSION]);
}

/**
 * Waits until the pane contains `needle`.
 *
 * These tests drive a real tmux and then assert on what the pane shows. Fixed
 * sleeps between the two are a guess about how fast a shell repaints, and the
 * guess is wrong often enough to matter. Polling replaces the guess: it
 * returns as soon as the text lands — usually far sooner than the sleep it
 * replaced — and only takes the full timeout when something is genuinely
 * wrong.
 *
 * KNOWN ISSUE, NOT FIXED BY THIS
 * ------------------------------
 * The suite is flaky when the three tmux-backed files run in parallel:
 * measured at 4 runs in 8 before this helper existed and roughly the same
 * after, so this is an improvement to the *shape* of the waiting rather than a
 * cure. The residual failures come from test-to-test state inside a file — a
 * previous test's `cat -v` still holding the pane when the next one starts —
 * which needs the pane reset between tests, not a longer wait. Worth doing;
 * out of scope for the change that added this comment.
 */
async function waitForPane(needle: string, timeoutMs = 5_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let text = '';

  for (;;) {
    text = await capture();
    if (text.includes(needle)) return text;
    if (Date.now() >= deadline) return text;
    await new Promise((r) => setTimeout(r, 25));
  }
}

/**
 * Paint a prompt into the pane, then start `cat -v` so subsequent keystrokes
 * are echoed as visible escape sequences rather than being interpreted.
 *
 * Waits for the last painted line to actually appear before returning, so a
 * caller can assert immediately without a sleep of its own. The last line is
 * the right one to wait for: `printf` writes them in order, so seeing it means
 * the whole block has been drawn.
 */
async function paintPrompt(lines: string[]): Promise<void> {
  await tmuxRaw(['send-keys', '-t', SESSION, 'C-c']);

  const script = `clear; printf '%s\\n' ${lines.map((l) => `'${l.replace(/'/g, "'\\''")}'`).join(' ')}; cat -v`;
  await tmuxRaw(['send-keys', '-t', SESSION, '-l', '--', script]);
  await tmuxRaw(['send-keys', '-t', SESSION, 'Enter']);

  // Wait for the last non-empty line, which is the last thing printf emits.
  // An all-empty `lines` would have nothing to wait for, so fall back to the
  // shell having echoed the command itself.
  const marker = [...lines].reverse().find((l) => l.trim() !== '') ?? 'cat -v';
  await waitForPane(marker);
}

const CURSOR = '❯';

before(async () => {
  tmuxAvailable = (await health({ socket: SOCKET })).ok;
  if (!tmuxAvailable) return;

  await tmuxRaw(['kill-session', '-t', SESSION]).catch(() => undefined);
  await tmuxRaw(['new-session', '-d', '-s', SESSION, '-x', '80', '-y', '24']);
  await new Promise((r) => setTimeout(r, 300));

  app = await buildApp({
    logger: false,
    config: loadConfig({
      READ_TOKEN: TOKEN,
      WRITE_TOKEN: TOKEN,
      TMUX_SESSION: SESSION,
      TMUX_SOCKET: SOCKET,
      NODE_ENV: 'test',
      RATE_READ_PER_MIN: '10000',
      RATE_WRITE_PER_MIN: '10000',
    } as NodeJS.ProcessEnv),
  });
});

after(async () => {
  if (app) await app.close();
  if (!tmuxAvailable) return;
  await tmuxRaw(['send-keys', '-t', SESSION, 'C-c']).catch(() => undefined);
  await tmuxRaw(['kill-session', '-t', SESSION]).catch(() => undefined);
  await tmuxRaw(['kill-server']).catch(() => undefined);

  // kill-server stops the server but leaves its socket file on disk. Left
  // alone these accumulate one per test run, so remove the one we created.
  await rm(join(process.env['TMUX_TMPDIR'] ?? `/tmp/tmux-${process.getuid?.() ?? 0}`, SOCKET), {
    force: true,
  }).catch(() => undefined);
});

function nonce(): string {
  return randomBytes(12).toString('hex');
}

async function getSession(): Promise<{ s: string; h: string; p?: { o: { l: string }[]; d?: boolean } }> {
  const res = await app.inject({ method: 'GET', url: '/api/v1/session', headers: auth });
  return res.json();
}

describe('answering a horizontal prompt', () => {
  it('detects the prompt and its options', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');

    await paintPrompt([
      'Do you want to make this edit to config.ts?',
      '',
      `${CURSOR} Yes    No`,
      '',
      'Esc to cancel',
    ]);

    const body = await getSession();
    assert.equal(body.s, 'awaiting_permission');
    assert.deepEqual(body.p?.o.map((o) => o.l), ['Yes', 'No']);
  });

  it('selects the first option with Enter alone', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');

    await paintPrompt([
      'Do you want to make this edit to config.ts?',
      '',
      `${CURSOR} Yes    No`,
      '',
      'Esc to cancel',
    ]);

    const before = await getSession();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/action',
      headers: auth,
      payload: { action: 'select:0', nonce: nonce(), expect: before.h },
    });
    assert.equal(res.statusCode, 200);

    await new Promise((r) => setTimeout(r, 300));
    const pane = await capture();

    // The cursor already sits on option 0, so no arrow key should be sent.
    assert.ok(!pane.includes('^[[C'), `unexpected Right arrow in: ${pane.slice(-120)}`);
  });

  it('reaches the second option with one Right arrow', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');

    await paintPrompt([
      'Do you want to make this edit to config.ts?',
      '',
      `${CURSOR} Yes    No`,
      '',
      'Esc to cancel',
    ]);

    const before = await getSession();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/action',
      headers: auth,
      payload: { action: 'select:1', nonce: nonce(), expect: before.h },
    });
    assert.equal(res.statusCode, 200);

    await new Promise((r) => setTimeout(r, 300));
    const pane = await capture();

    // Horizontal layout must move with Right, never Down.
    assert.ok(pane.includes('^[[C'), `no Right arrow in: ${pane.slice(-120)}`);
    assert.ok(!pane.includes('^[[B'), `unexpected Down arrow in: ${pane.slice(-120)}`);
  });
});

describe('answering a vertical prompt', () => {
  it('moves with Down rather than Right', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');

    // Layout drives the key choice. Sending Right here would move nothing and
    // Enter would then select the wrong option — silently.
    await paintPrompt([
      'Do you want to proceed?',
      '',
      `${CURSOR} 1. Yes`,
      '  2. No',
      '',
      'Enter to select',
    ]);

    const before = await getSession();
    assert.equal(before.s, 'awaiting_permission');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/action',
      headers: auth,
      payload: { action: 'select:1', nonce: nonce(), expect: before.h },
    });
    assert.equal(res.statusCode, 200);

    await new Promise((r) => setTimeout(r, 300));
    const pane = await capture();

    assert.ok(pane.includes('^[[B'), `no Down arrow in: ${pane.slice(-120)}`);
    assert.ok(!pane.includes('^[[C'), `unexpected Right arrow in: ${pane.slice(-120)}`);
  });
});

describe('approval safety', () => {
  it('refuses an option that would grant lasting permission', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');

    // ALLOW_DESTRUCTIVE is false here, which is the default. "Yes, and don't
    // ask again" widens the agent's permissions for the rest of the session,
    // and that is not a decision to take one-handed at speed.
    await paintPrompt([
      'Do you want to make this edit to config.ts?',
      '',
      `${CURSOR} Yes    Yes, and don't ask again    No`,
      '',
      'Esc to cancel',
    ]);

    const before = await getSession();
    assert.equal(before.p?.d, true, 'prompt was not flagged destructive');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/action',
      headers: auth,
      payload: { action: 'select:1', nonce: nonce(), expect: before.h },
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().code, 'ACTION_DISABLED');
  });

  it('still allows the ordinary options on the same prompt', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');

    await paintPrompt([
      'Do you want to make this edit to config.ts?',
      '',
      `${CURSOR} Yes    Yes, and don't ask again    No`,
      '',
      'Esc to cancel',
    ]);

    const before = await getSession();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/action',
      headers: auth,
      payload: { action: 'select:0', nonce: nonce(), expect: before.h },
    });
    assert.equal(res.statusCode, 200);
  });

  it('refuses an answer aimed at a screen that has moved on', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');

    // The core anti-TOCTOU property. Over BLE the rider's decision arrives
    // seconds after they made it; by then Claude Code may be showing something
    // else entirely, and Enter would land on that instead.
    await paintPrompt([
      'Do you want to run this command?',
      '',
      `${CURSOR} Yes    No`,
      '',
      'Esc to cancel',
    ]);

    const seen = await getSession();

    // The screen changes after the rider looked but before their tap lands.
    await paintPrompt([
      'Do you want to delete every file?',
      '',
      `${CURSOR} Yes    No`,
      '',
      'Esc to cancel',
    ]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/action',
      headers: auth,
      payload: { action: 'select:0', nonce: nonce(), expect: seen.h },
    });
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().code, 'STALE_VIEW');
  });

  it('refuses to answer when no prompt is on screen', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');

    await tmuxRaw(['send-keys', '-t', SESSION, 'C-c']);
    await new Promise((r) => setTimeout(r, 200));
    await tmuxRaw(['send-keys', '-t', SESSION, '-l', '--', 'clear']);
    await tmuxRaw(['send-keys', '-t', SESSION, 'Enter']);
    await new Promise((r) => setTimeout(r, 300));

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/action',
      headers: auth,
      payload: { action: 'select:0', nonce: nonce() },
    });
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().code, 'NO_PROMPT');
  });

  it('forgets a prompt that has scrolled off the visible screen', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');

    // Regression test. A shell `clear` scrolls the screen rather than erasing
    // the scrollback, so an answered prompt lives on in the history buffer.
    // Detection that reads history would keep reporting it, and the device
    // would go on offering to answer a prompt Claude Code moved past minutes
    // ago — the worst possible failure for this app.
    await paintPrompt([
      'Do you want to proceed?',
      '',
      `${CURSOR} Yes    No`,
      '',
      'Esc to cancel',
    ]);
    assert.equal((await getSession()).s, 'awaiting_permission');

    await tmuxRaw(['send-keys', '-t', SESSION, 'C-c']);
    await new Promise((r) => setTimeout(r, 200));
    await tmuxRaw(['send-keys', '-t', SESSION, '-l', '--', 'clear']);
    await tmuxRaw(['send-keys', '-t', SESSION, 'Enter']);
    await new Promise((r) => setTimeout(r, 400));

    const after = await getSession();
    assert.notEqual(
      after.s,
      'awaiting_permission',
      'a prompt in the scrollback was reported as still active',
    );
    assert.equal(after.p, undefined);
  });

  it('refuses an option index beyond what is displayed', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');

    await paintPrompt([
      'Do you want to proceed?',
      '',
      `${CURSOR} Yes    No`,
      '',
      'Esc to cancel',
    ]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/action',
      headers: auth,
      payload: { action: 'select:7', nonce: nonce() },
    });
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().code, 'OPTION_OUT_OF_RANGE');
  });

  it('does not act twice when the same approval is retried', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux unavailable');

    await paintPrompt([
      'Do you want to proceed?',
      '',
      `${CURSOR} Yes    No`,
      '',
      'Esc to cancel',
    ]);

    const before = await getSession();
    const n = nonce();
    const payload = { action: 'select:1', nonce: n, expect: before.h };

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/action',
      headers: auth,
      payload,
    });
    assert.equal(first.statusCode, 200);

    await new Promise((r) => setTimeout(r, 300));
    const afterFirst = await capture();
    const arrowsAfterFirst = (afterFirst.match(/\^\[\[C/g) ?? []).length;

    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/action',
      headers: auth,
      payload,
    });
    assert.equal(second.statusCode, 200);
    assert.equal(second.json().deduped, true);

    await new Promise((r) => setTimeout(r, 300));
    const afterSecond = await capture();
    const arrowsAfterSecond = (afterSecond.match(/\^\[\[C/g) ?? []).length;

    assert.equal(
      arrowsAfterSecond,
      arrowsAfterFirst,
      'the retry sent a second keystroke into the pane',
    );
  });
});
