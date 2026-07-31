/**
 * tmux.ts — a deliberately narrow wrapper around the tmux CLI.
 *
 * SECURITY MODEL
 * --------------
 * Three properties, each defending a distinct failure:
 *
 * 1. No shell, ever. Every invocation uses execFile with an argv array, so no
 *    input can be interpreted as shell syntax. There is no code path in this
 *    file that builds a command string.
 *
 * 2. Targets are validated, not merely escaped. tmux itself gives `:` and `.`
 *    meaning inside a target, so a name that is harmless to the shell can still
 *    redirect a write to another pane. Names are checked against a strict
 *    allowlist regex, and the caller separately restricts which sessions are
 *    addressable at all.
 *
 * 3. Text is sent with `-l --`. Without `-l`, tmux performs *key-name lookup*
 *    on the string: the man page states that if an argument "is not recognised
 *    as a key, it is sent as a series of characters" — meaning a prompt
 *    containing the word `Enter` would be delivered as a keypress rather than
 *    text. `-l` disables that lookup entirely, and `--` stops a leading dash
 *    being read as a flag.
 *
 * A fourth property is enforced by configuration rather than code: running the
 * agent under a dedicated tmux socket (`tmux -L claude-edge`) makes this
 * process structurally incapable of reaching the operator's other sessions.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Max bytes accepted from one tmux invocation (~1 MB of scrollback). */
const MAX_BUFFER = 1024 * 1024;

/** tmux is local; anything slower than this is wedged, not slow. */
const TMUX_TIMEOUT_MS = 5000;

/**
 * Session names we will address.
 *
 * Excludes tmux's own target separators (`:` and `.`), all shell
 * metacharacters, and — via the leading-character class — any name beginning
 * with `-`. The last of these matters even though every call site also passes
 * `--`: a name like `-L` reaching an argv position that precedes `--` would be
 * read by tmux as a flag and could redirect the command to another socket.
 * Requiring an alphanumeric first character removes that class of mistake
 * rather than relying on every future call site placing `--` correctly.
 */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/** Window and pane indexes are plain non-negative integers. */
const SAFE_INDEX = /^\d{1,4}$/;

/**
 * Field separator for tmux `-F` format strings.
 *
 * Three candidates were rejected before settling on this one, each verified
 * against tmux 3.7b rather than assumed:
 *
 *   - `\t` — tmux does not expand escape sequences inside a format string; it
 *     emits the two characters `\` and `t`, so the record parses as one field.
 *   - U+001F (Unit Separator) — tmux sanitises non-printing bytes out of format
 *     output, replacing each with `_`.
 *   - `\n` — survives when the format is typed literally on a command line, but
 *     is sanitised to `_` when passed as a single argv element, which is how we
 *     invoke it. This one is particularly treacherous: it works when tested by
 *     hand and fails in the code.
 *
 * A multi-character printable sequence is used instead. It cannot appear in a
 * session name (SAFE_NAME forbids `@` and `|`), and for the one field that is
 * genuinely free-form — `pane_title`, which any program can set — the field
 * order below places it last and parsing is bounded so a title containing the
 * separator cannot shift the other fields.
 */
const FIELD_SEP = '@@|@@';

export type TmuxErrorCode =
  | 'INVALID_SESSION'
  | 'INVALID_WINDOW'
  | 'INVALID_PANE'
  | 'TMUX_NOT_FOUND'
  | 'TMUX_TIMEOUT'
  | 'NO_SUCH_TARGET'
  | 'NO_SERVER'
  | 'NO_KEYS'
  | 'TMUX_ERROR';

export class TmuxError extends Error {
  readonly code: TmuxErrorCode;
  readonly statusCode: number;

  constructor(message: string, code: TmuxErrorCode = 'TMUX_ERROR', statusCode = 500) {
    super(message);
    this.name = 'TmuxError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface TmuxOptions {
  /** tmux socket name (`-L`). Empty uses the default socket. */
  socket?: string;
  timeoutMs?: number;
}

export interface PaneTarget {
  session: string;
  window?: number | string;
  pane?: number | string;
}

/** Validate a tmux session name. */
export function assertSafeSession(name: string): string {
  if (typeof name !== 'string' || !SAFE_NAME.test(name)) {
    throw new TmuxError(
      'Invalid session name: use letters, digits, underscore or hyphen.',
      'INVALID_SESSION',
      400,
    );
  }
  return name;
}

/** Build a fully-qualified tmux target from individually validated parts. */
export function buildTarget({ session, window, pane }: PaneTarget): string {
  assertSafeSession(session);
  let target = session;

  if (window !== undefined && window !== null && window !== '') {
    const w = String(window);
    if (!SAFE_INDEX.test(w)) {
      throw new TmuxError('Invalid window index.', 'INVALID_WINDOW', 400);
    }
    target += `:${w}`;

    if (pane !== undefined && pane !== null && pane !== '') {
      const p = String(pane);
      if (!SAFE_INDEX.test(p)) {
        throw new TmuxError('Invalid pane index.', 'INVALID_PANE', 400);
      }
      target += `.${p}`;
    }
  }
  return target;
}

interface ExecErrorLike {
  code?: string | number;
  killed?: boolean;
  signal?: string;
  stderr?: string;
  message?: string;
}

/** Run tmux with an argv array. Never invokes a shell. */
async function tmux(args: readonly string[], opts: TmuxOptions = {}): Promise<string> {
  const { socket = '', timeoutMs = TMUX_TIMEOUT_MS } = opts;

  // -L selects a named socket. Prepending it means every command in this file
  // is confined to that socket without each call site remembering to pass it.
  const argv = socket ? ['-L', socket, ...args] : [...args];

  try {
    const { stdout } = await execFileAsync('tmux', argv, {
      timeout: timeoutMs,
      maxBuffer: MAX_BUFFER,
      encoding: 'utf8',
      // Minimal environment. TMUX_TMPDIR is preserved so a socket in a
      // non-default directory remains reachable.
      env: {
        PATH: process.env['PATH'] ?? '/usr/bin:/bin:/usr/local/bin',
        HOME: process.env['HOME'] ?? '',
        ...(process.env['TMUX_TMPDIR'] ? { TMUX_TMPDIR: process.env['TMUX_TMPDIR'] } : {}),
      },
    });
    return stdout;
  } catch (err: unknown) {
    const e = err as ExecErrorLike;

    if (e.code === 'ENOENT') {
      throw new TmuxError('tmux is not installed or not on PATH.', 'TMUX_NOT_FOUND', 503);
    }
    if (e.killed || e.signal === 'SIGTERM') {
      throw new TmuxError('tmux timed out.', 'TMUX_TIMEOUT', 504);
    }

    const stderr = (e.stderr ?? '').trim();
    if (/can't find (session|pane|window)|no such/i.test(stderr)) {
      throw new TmuxError('No such tmux session.', 'NO_SUCH_TARGET', 404);
    }
    if (/no server running/i.test(stderr)) {
      throw new TmuxError('No tmux server is running.', 'NO_SERVER', 503);
    }
    throw new TmuxError(stderr || e.message || 'tmux failed.', 'TMUX_ERROR', 500);
  }
}

export interface TmuxSession {
  name: string;
  windows: number;
  attached: boolean;
  created: number;
}

/** List sessions on the configured socket. */
export async function listSessions(opts: TmuxOptions = {}): Promise<TmuxSession[]> {
  let out: string;
  try {
    out = await tmux(
      [
        'list-sessions',
        '-F',
        ['#{session_name}', '#{session_windows}', '#{session_attached}', '#{session_created}'].join(
          FIELD_SEP,
        ),
      ],
      opts,
    );
  } catch (err) {
    // A machine with no tmux server yet is an empty list, not a failure.
    if (err instanceof TmuxError && err.code === 'NO_SERVER') return [];
    throw err;
  }

  // One session per line; fields within a line are separator-delimited.
  return out
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [name = '', windows = '0', attached = '0', created = '0'] = line.split(FIELD_SEP);
      return {
        name,
        windows: Number.parseInt(windows, 10) || 0,
        attached: attached === '1',
        created: Number.parseInt(created, 10) || 0,
      };
    });
}

export interface CaptureResult {
  /** Lines with trailing whitespace removed, oldest first. */
  lines: string[];
  /** The raw capture, used for hashing so display changes are not missed. */
  raw: string;
}

export interface CaptureParams extends PaneTarget, TmuxOptions {
  /** Lines of scrollback to include above the visible pane. 0 = visible only. */
  history?: number;
  /** Include ANSI escape sequences (-e). Off: the device cannot render them. */
  escapes?: boolean;
}

/**
 * Capture pane contents.
 *
 * `-J` joins wrapped lines, so a long line that the terminal soft-wrapped
 * arrives as one logical line. This matters for correctness, not tidiness: a
 * prompt that wraps mid-sentence would otherwise defeat any detector that
 * anchors on line structure.
 */
export async function capturePane({
  session,
  window,
  pane,
  history = 0,
  escapes = false,
  ...opts
}: CaptureParams): Promise<CaptureResult> {
  const target = buildTarget({ session, ...(window !== undefined ? { window } : {}), ...(pane !== undefined ? { pane } : {}) });

  const args = ['capture-pane', '-p', '-J', '-t', target];
  if (escapes) args.push('-e');
  if (history > 0) args.push('-S', String(-Math.abs(Math.trunc(history))));

  const raw = await tmux(args, opts);

  const lines = raw.split('\n').map((l) => l.replace(/\s+$/, ''));
  // Panes are mostly empty at the bottom; trailing blanks waste device payload.
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  return { lines, raw };
}

export interface PaneInfo {
  width: number;
  height: number;
  currentCommand: string;
  pid: number;
  /** Pane is in copy/scroll mode, where sent keys are consumed by tmux. */
  inMode: boolean;
  dead: boolean;
  title: string;
  historySize: number;
}

/** Query pane metadata used for state detection and write pre-flight checks. */
export async function paneInfo({
  session,
  window,
  pane,
  ...opts
}: PaneTarget & TmuxOptions): Promise<PaneInfo> {
  const target = buildTarget({ session, ...(window !== undefined ? { window } : {}), ...(pane !== undefined ? { pane } : {}) });

  // pane_title is free-form and settable by any program running in the pane,
  // so it goes last: a title containing the separator can then only corrupt
  // itself, never shift a field that a security decision depends on.
  const fields = [
    '#{pane_width}',
    '#{pane_height}',
    '#{pane_current_command}',
    '#{pane_pid}',
    '#{pane_in_mode}',
    '#{pane_dead}',
    '#{history_size}',
    '#{pane_title}',
  ].join(FIELD_SEP);

  const out = await tmux(['display-message', '-p', '-t', target, '-F', fields], opts);
  const parts = out.replace(/\n$/, '').split(FIELD_SEP);
  const [
    width = '0',
    height = '0',
    currentCommand = '',
    pid = '0',
    inMode = '0',
    dead = '0',
    historySize = '0',
  ] = parts;
  // Rejoin any tail: a title containing the separator stays one title.
  const title = parts.slice(7).join(FIELD_SEP);

  return {
    width: Number.parseInt(width, 10) || 0,
    height: Number.parseInt(height, 10) || 0,
    currentCommand,
    pid: Number.parseInt(pid, 10) || 0,
    inMode: inMode !== '0' && inMode !== '',
    dead: dead === '1',
    title,
    historySize: Number.parseInt(historySize, 10) || 0,
  };
}

export interface SendKeysParams extends PaneTarget, TmuxOptions {
  /** tmux key names, or literal text when `literal` is set. */
  keys: readonly string[];
  /**
   * Send as literal UTF-8 rather than looking each argument up as a key name.
   * Required for any text that did not come from the server-side allowlist.
   */
  literal?: boolean;
}

/**
 * Send keys to a pane.
 *
 * Callers must pass either key names drawn from the server-side allowlist, or
 * sanitised text with `literal: true`. This function does not decide which is
 * safe — that judgement belongs to the route, which knows the request's origin.
 */
export async function sendKeys({
  session,
  window,
  pane,
  keys,
  literal = false,
  ...opts
}: SendKeysParams): Promise<void> {
  const target = buildTarget({ session, ...(window !== undefined ? { window } : {}), ...(pane !== undefined ? { pane } : {}) });

  if (keys.length === 0) {
    throw new TmuxError('No keys supplied.', 'NO_KEYS', 400);
  }

  const args = ['send-keys', '-t', target];
  if (literal) args.push('-l');
  // `--` terminates option parsing so a payload starting with `-` is data.
  args.push('--', ...keys);

  await tmux(args, opts);
}

/**
 * Resize a pane's logical dimensions.
 *
 * Setting the pane to the device's actual character grid means tmux wraps the
 * output itself, exactly as it would for a real terminal of that size. That is
 * what makes the Edge a faithful mirror rather than a reflowed approximation:
 * box drawing, aligned columns and the prompt's own layout all survive.
 *
 * Only safe when no human is attached to the same session — tmux sizes a window
 * to its smallest attached client, so resizing a shared session would shrink
 * the operator's own view.
 */
export async function resizeWindow({
  session,
  window,
  width,
  height,
  ...opts
}: PaneTarget & TmuxOptions & { width: number; height: number }): Promise<void> {
  const target = buildTarget({ session, ...(window !== undefined ? { window } : {}) });

  const w = Math.max(20, Math.min(500, Math.trunc(width)));
  const h = Math.max(5, Math.min(200, Math.trunc(height)));

  await tmux(['resize-window', '-t', target, '-x', String(w), '-y', String(h)], opts);
}

export interface TmuxHealth {
  ok: boolean;
  version?: string;
  error?: string;
}

/** Check that tmux is present and answering. */
export async function health(opts: TmuxOptions = {}): Promise<TmuxHealth> {
  try {
    const out = await tmux(['-V'], opts);
    return { ok: true, version: out.trim() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown error' };
  }
}
