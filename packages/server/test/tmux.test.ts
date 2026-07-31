import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import {
  assertSafeSession,
  buildTarget,
  capturePane,
  health,
  listSessions,
  paneInfo,
  sendKeys,
  TmuxError,
} from '../src/services/tmux.ts';

const execFileAsync = promisify(execFile);

/**
 * These tests run against a real tmux server on a dedicated socket, because the
 * value of this module is entirely in how it interacts with the actual tmux
 * CLI. A mocked tmux would happily confirm assumptions that the real binary
 * rejects — the argument quoting and target-syntax behaviour is exactly what
 * needs verifying.
 */
// Unique per process: the test runner executes files in parallel, and a
// shared socket means one file's kill-server lands mid-capture in another.
const SOCKET = `ce-tmux-${randomBytes(4).toString('hex')}`;
const SESSION = 'cetest-unit';

async function tmuxRaw(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('tmux', ['-L', SOCKET, ...args], {
    encoding: 'utf8',
  });
  return stdout;
}

/**
 * Waits for text to appear in the pane.
 *
 * WHY THIS EXISTS
 * ---------------
 * These tests type into a real tmux and then assert on what the pane contains.
 * The obvious way to bridge the two is `await sleep(300)`, which is what this
 * file used to do — and it failed roughly one run in six on a loaded machine,
 * because 300ms is a guess about how long a shell takes to echo a line rather
 * than a fact about it.
 *
 * A flaky test is worse than no test: it trains everyone to re-run CI instead
 * of reading it. Polling removes the guess entirely — the fast path returns as
 * soon as the text lands (usually well under the old sleep), and the slow path
 * has a generous ceiling that only matters when the machine is genuinely busy.
 *
 * Returns the captured lines so the caller can assert against them and get a
 * useful message on timeout.
 */
async function waitForPane(
  needle: string,
  { timeoutMs = 5_000, intervalMs = 25 } = {},
): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  let lines: string[] = [];

  for (;;) {
    ({ lines } = await capturePane({ session: SESSION, socket: SOCKET }));
    if (lines.join('\n').includes(needle)) return lines;
    if (Date.now() >= deadline) return lines;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

let tmuxAvailable = false;

before(async () => {
  const h = await health({ socket: SOCKET });
  tmuxAvailable = h.ok;
  if (!tmuxAvailable) return;

  await tmuxRaw(['kill-session', '-t', SESSION]).catch(() => undefined);
  await tmuxRaw(['new-session', '-d', '-s', SESSION, '-x', '80', '-y', '24']);

  // new-session returns as soon as the server accepts it; the pane's shell may
  // not have drawn its prompt yet, and a capture taken before then is empty.
  for (let attempt = 0; attempt < 20; attempt++) {
    const sessions = await listSessions({ socket: SOCKET });
    if (sessions.some((s) => s.name === SESSION)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('test tmux session did not become ready');
});

after(async () => {
  if (!tmuxAvailable) return;
  await tmuxRaw(['kill-session', '-t', SESSION]).catch(() => undefined);
  await tmuxRaw(['kill-server']).catch(() => undefined);

  // kill-server stops the server but leaves its socket file on disk. Left
  // alone these accumulate one per test run, so remove the one we created.
  await rm(join(process.env['TMUX_TMPDIR'] ?? `/tmp/tmux-${process.getuid?.() ?? 0}`, SOCKET), {
    force: true,
  }).catch(() => undefined);
});

describe('assertSafeSession', () => {
  it('accepts ordinary names', () => {
    for (const name of ['claude', 'my-session', 'work_1', 'A1']) {
      assert.equal(assertSafeSession(name), name);
    }
  });

  it('rejects tmux target separators', () => {
    // ':' and '.' are how tmux addresses windows and panes. Allowing them in a
    // session name would let a caller redirect a write to another pane.
    for (const name of ['a:b', 'a.b', 'sess:0.1']) {
      assert.throws(() => assertSafeSession(name), TmuxError, `accepted "${name}"`);
    }
  });

  it('rejects shell metacharacters', () => {
    for (const name of ['a;b', 'a$(id)', 'a`id`', 'a|b', 'a&b', 'a b', "a'b", 'a"b']) {
      assert.throws(() => assertSafeSession(name), TmuxError, `accepted "${name}"`);
    }
  });

  it('rejects path traversal and anything flag-shaped', () => {
    // A name beginning with '-' could be read by tmux as an option in any argv
    // position that precedes '--', which would redirect the command.
    for (const name of ['../etc', '-L', '--socket', '-t', '-']) {
      assert.throws(() => assertSafeSession(name), TmuxError, `accepted "${name}"`);
    }
  });

  it('rejects empty and oversized names', () => {
    assert.throws(() => assertSafeSession(''), TmuxError);
    assert.throws(() => assertSafeSession('x'.repeat(65)), TmuxError);
  });
});

describe('buildTarget', () => {
  it('builds a session-only target', () => {
    assert.equal(buildTarget({ session: 'claude' }), 'claude');
  });

  it('builds session:window', () => {
    assert.equal(buildTarget({ session: 'claude', window: 0 }), 'claude:0');
  });

  it('builds session:window.pane', () => {
    assert.equal(buildTarget({ session: 'claude', window: 1, pane: 2 }), 'claude:1.2');
  });

  it('ignores a pane given without a window', () => {
    // Without a window the pane index is meaningless, and silently building
    // "claude.2" would address something unintended.
    assert.equal(buildTarget({ session: 'claude', pane: 2 }), 'claude');
  });

  it('rejects a non-numeric window', () => {
    assert.throws(() => buildTarget({ session: 'a', window: '0;x' }), TmuxError);
  });

  it('rejects a non-numeric pane', () => {
    assert.throws(() => buildTarget({ session: 'a', window: 0, pane: 'x' }), TmuxError);
  });
});

describe('tmux integration', { skip: !process.env['CI'] && false }, () => {
  it('reports health', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux not available');
    const h = await health({ socket: SOCKET });
    assert.equal(h.ok, true);
    assert.match(String(h.version), /tmux/);
  });

  it('lists the test session', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux not available');
    const sessions = await listSessions({ socket: SOCKET });
    assert.ok(sessions.some((s) => s.name === SESSION));
  });

  it('captures pane content', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux not available');
    await tmuxRaw(['send-keys', '-t', SESSION, '-l', '--', 'echo CAPTURE_MARKER']);
    await tmuxRaw(['send-keys', '-t', SESSION, 'Enter']);

    const lines = await waitForPane('CAPTURE_MARKER');
    assert.ok(
      lines.some((l) => l.includes('CAPTURE_MARKER')),
      `marker not found in: ${JSON.stringify(lines.slice(-5))}`,
    );
  });

  it('strips trailing blank lines from the capture', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux not available');
    const { lines } = await capturePane({ session: SESSION, socket: SOCKET });
    assert.notEqual(lines[lines.length - 1], '');
  });

  it('reads pane metadata', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux not available');
    const info = await paneInfo({ session: SESSION, socket: SOCKET });
    assert.equal(info.width, 80);
    assert.equal(info.height, 24);
    assert.ok(info.pid > 0);
    assert.equal(info.dead, false);
    assert.equal(info.inMode, false);
  });

  it('rejects a missing session with a 404-shaped error', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux not available');
    await assert.rejects(
      () => capturePane({ session: 'definitely-not-here', socket: SOCKET }),
      (err: unknown) => {
        assert.ok(err instanceof TmuxError);
        assert.equal(err.code, 'NO_SUCH_TARGET');
        assert.equal(err.statusCode, 404);
        return true;
      },
    );
  });

  it('sends literal text without interpreting key names', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux not available');

    // "Enter" is a tmux key name. Sent literally it must appear as five
    // characters, not submit the line. This is the property that stops a
    // user-typed prompt from executing itself.
    await tmuxRaw(['send-keys', '-t', SESSION, '-l', '--', 'clear']);
    await tmuxRaw(['send-keys', '-t', SESSION, 'Enter']);
    await new Promise((r) => setTimeout(r, 300));

    await sendKeys({
      session: SESSION,
      keys: ['echo LITERAL Enter Escape C-c DONE'],
      literal: true,
      socket: SOCKET,
    });
    const lines = await waitForPane('LITERAL Enter Escape C-c DONE');
    const text = lines.join('\n');
    assert.ok(
      text.includes('LITERAL Enter Escape C-c DONE'),
      `literal text was interpreted: ${JSON.stringify(lines.slice(-3))}`,
    );

    // Clean up the staged line so it does not execute later.
    await sendKeys({ session: SESSION, keys: ['C-u'], socket: SOCKET });
  });

  it('sends a payload starting with a dash as data, not a flag', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux not available');

    await sendKeys({ session: SESSION, keys: ['C-u'], socket: SOCKET });
    await sendKeys({
      session: SESSION,
      keys: ['-not-a-flag-value'],
      literal: true,
      socket: SOCKET,
    });
    const lines = await waitForPane('-not-a-flag-value');
    assert.ok(
      lines.join('\n').includes('-not-a-flag-value'),
      `dash payload not found in: ${JSON.stringify(lines.slice(-3))}`,
    );
    await sendKeys({ session: SESSION, keys: ['C-u'], socket: SOCKET });
  });

  it('refuses an empty key list', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux not available');
    await assert.rejects(
      () => sendKeys({ session: SESSION, keys: [], socket: SOCKET }),
      TmuxError,
    );
  });

  it('never reaches a session outside its socket', async (t) => {
    if (!tmuxAvailable) return t.skip('tmux not available');
    // The default socket may hold the operator's real sessions. A capture on
    // our named socket must not see them.
    const sessions = await listSessions({ socket: SOCKET });
    assert.ok(sessions.every((s) => s.name === SESSION));
  });
});
