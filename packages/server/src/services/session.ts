/**
 * session.ts — reads a tmux pane and turns it into the payload the device shows.
 *
 * This is where the three concerns meet: capturing the pane, deciding what
 * state it represents, and shaping the result to fit inside a BLE response.
 *
 * THE PANE HASH IS LOAD-BEARING
 * -----------------------------
 * Every response carries `h`, a hash of the full untruncated pane. It does two
 * jobs, and the second is a safety property rather than an optimisation:
 *
 *   1. Bandwidth. The device sends it back as `?etag=`; unchanged content
 *      returns 304 with an empty body. Over BLE this is the single largest
 *      saving available.
 *
 *   2. Correctness of approvals. The device echoes it in `expect` when it acts.
 *      If the pane changed between the rider reading the screen and the tap
 *      arriving, the hash no longer matches and the write is refused. Without
 *      this, a multi-second BLE round trip means an approval intended for
 *      prompt A can land on prompt B. That is the most likely real-world
 *      failure in the whole system, and it is exactly the kind that would look
 *      like the app "randomly approving things".
 */

import {
  contentHash,
  stripAnsi,
  tailWindow,
  wrapLines,
  type SessionResponse,
  type SessionState,
  PROTOCOL_VERSION,
} from '@claude-edge/shared';

import { capturePane, paneInfo, type PaneInfo, type TmuxOptions } from './tmux.ts';
import { detectState } from './detect.ts';

export interface ReadSessionParams extends TmuxOptions {
  session: string;
  /** Lines the device can draw. */
  lines: number;
  /** Character columns the device can draw. */
  width: number;
  /** Scrollback offset; 0 is the live tail. */
  offset: number;
  /**
   * Scrollback depth to capture. Larger values let the rider page further back
   * but cost tmux time and server memory on every poll.
   */
  history?: number;
  /** Poll interval resolver, so battery policy stays in config. */
  pollFor: (state: SessionState) => number;
}

export interface ReadSessionResult {
  payload: SessionResponse;
  /** Pane metadata, used by write routes for pre-flight checks. */
  info: PaneInfo;
  /**
   * True when tmux would swallow sent keys (copy/scroll mode). Writes must be
   * refused rather than silently lost.
   */
  writeBlocked: boolean;
  /**
   * True when the prompt's options are laid out vertically. Determines whether
   * answering moves the cursor with Down or with Right, so the write path needs
   * it and it must come from the same read that produced the prompt.
   */
  verticalOptions: boolean;
}

/**
 * Capture a pane and build the device payload.
 *
 * Ordering note: the pane is captured *before* its metadata is read, and the
 * hash covers the capture only. Reading metadata first would leave a window in
 * which the pane changes between the two calls, producing a hash that describes
 * content the caller never saw.
 */
export async function readSession({
  session,
  lines,
  width,
  offset,
  history = 200,
  pollFor,
  ...tmuxOpts
}: ReadSessionParams): Promise<ReadSessionResult> {
  // Two captures, deliberately.
  //
  // `scrollback` is what the rider reads and scrolls through. `visible` is the
  // pane as the terminal currently shows it, and is the *only* thing state
  // detection may see.
  //
  // Taking one capture and slicing its tail is not equivalent, and the
  // difference is a real bug rather than a nicety: a shell `clear` does not
  // erase the scrollback, it scrolls the screen. An answered prompt therefore
  // stays in the history buffer indefinitely, and a detector fed that history
  // finds its cursor and reports a prompt that is no longer on screen — leaving
  // the device offering to answer something Claude Code has long moved past.
  const [scrollback, visible, info] = await Promise.all([
    capturePane({ session, history, ...tmuxOpts }),
    capturePane({ session, history: 0, ...tmuxOpts }),
    paneInfo({ session, ...tmuxOpts }),
  ]);

  // The hash covers the visible screen, for the same reason: it is the token
  // the device echoes back when approving, so it must describe what the rider
  // actually saw. Hashing scrollback would make the hash change as history
  // scrolled past, invalidating approvals for no visible reason.
  const hash = contentHash(visible.raw);

  const plain = scrollback.lines.map(stripAnsi);

  const detection = detectState({
    lines: visible.lines.map(stripAnsi),
    currentCommand: info.currentCommand,
    inMode: info.inMode,
  });

  const wrapped = wrapLines(plain, width);
  const { slice, start } = tailWindow(wrapped, lines, offset);

  const payload: SessionResponse = {
    v: PROTOCOL_VERSION,
    s: detection.state,
    L: slice,
    h: hash,
    ts: Math.floor(Date.now() / 1000),
    n: pollFor(detection.state),
    tl: wrapped.length,
    o: start,
    ...(detection.prompt ? { p: detection.prompt } : {}),
    ...(session ? { name: session.slice(0, 32) } : {}),
  };

  return {
    payload,
    info,
    writeBlocked: detection.writeBlocked,
    verticalOptions: detection.verticalOptions,
  };
}

/**
 * Current pane hash, without building a payload.
 * Used by the write routes to verify `expect` before acting.
 *
 * Must hash exactly what readSession hashes — the visible screen, with no
 * scrollback. If the two ever diverge, every approval fails as STALE_VIEW and
 * the device becomes unable to answer anything at all.
 */
export async function currentHash(
  session: string,
  opts: TmuxOptions = {},
): Promise<string> {
  const capture = await capturePane({ session, history: 0, ...opts });
  return contentHash(capture.raw);
}
