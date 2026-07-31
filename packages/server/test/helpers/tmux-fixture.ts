/**
 * A disposable tmux server for a test file.
 *
 * WHY EACH FILE GETS ITS OWN SOCKET
 * ---------------------------------
 * Node's test runner executes files in parallel by default. Two files sharing a
 * tmux socket name will interleave: one file's `kill-server` in its teardown
 * arrives while another is mid-capture, and the second file fails with an error
 * that looks like a bug in the code under test rather than a bug in the tests.
 *
 * That produced exactly one confusing intermittent failure during development,
 * which is one more than is worth tolerating — a flaky suite trains you to
 * re-run rather than read, and the next real failure gets re-run too.
 *
 * So each fixture derives a unique socket name and cleans up only its own.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';

const execFileAsync = promisify(execFile);

export interface TmuxFixture {
  /** Socket name to pass as `socket` in TmuxOptions. */
  socket: string;
  /** Session name created on that socket. */
  session: string;
  /** True when tmux is installed and answering; tests skip when false. */
  available: boolean;
  /** Run a raw tmux command against this fixture's socket. */
  run(args: string[]): Promise<string>;
  /** Capture the pane, joined and plain. */
  capture(): Promise<string>;
  /** Tear down the server this fixture created. */
  cleanup(): Promise<void>;
}

/**
 * Create a tmux server and one session, both private to the caller.
 *
 * @param label Short identifier included in the socket name, so a leaked
 *   socket can be traced back to the test file that created it.
 */
export async function createTmuxFixture(
  label: string,
  { width = 80, height = 24 }: { width?: number; height?: number } = {},
): Promise<TmuxFixture> {
  // Random suffix rather than a counter: parallel test *processes* would each
  // start their counter at zero and collide.
  const suffix = randomBytes(4).toString('hex');
  const socket = `ce-${label}-${suffix}`;
  const session = 'fixture';

  const run = async (args: string[]): Promise<string> => {
    const { stdout } = await execFileAsync('tmux', ['-L', socket, ...args], {
      encoding: 'utf8',
    });
    return stdout;
  };

  let available = false;
  try {
    await execFileAsync('tmux', ['-V']);
    available = true;
  } catch {
    available = false;
  }

  if (available) {
    await run(['new-session', '-d', '-s', session, '-x', String(width), '-y', String(height)]);

    // new-session returns once the server accepts it, which is before the
    // pane's shell has drawn anything. Poll until the session is listed rather
    // than sleeping a guessed interval.
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        const out = await run(['list-sessions', '-F', '#{session_name}']);
        if (out.includes(session)) break;
      } catch {
        // Server not up yet.
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  return {
    socket,
    session,
    available,
    run,
    async capture() {
      return run(['capture-pane', '-p', '-J', '-t', session]);
    },
    async cleanup() {
      if (!available) return;
      // Only this fixture's server is killed; other files are untouched.
      await run(['kill-server']).catch(() => undefined);
    },
  };
}

/**
 * Wait until the pane's content stops changing.
 *
 * A shell that has just been written to keeps repainting for a moment — prompt
 * redraw, cursor placement — so a test that captures immediately after sending
 * input can see a half-drawn screen. Polling for two identical reads is both
 * faster and more reliable than sleeping long enough to be safe.
 *
 * @returns The stable content, or the last read if it never settled.
 */
export async function waitForStablePane(
  fixture: TmuxFixture,
  { attempts = 20, intervalMs = 60 }: { attempts?: number; intervalMs?: number } = {},
): Promise<string> {
  let previous = await fixture.capture();

  for (let i = 0; i < attempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    const current = await fixture.capture();
    if (current === previous) return current;
    previous = current;
  }
  return previous;
}
