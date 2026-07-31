/**
 * config.ts — deployment configuration, validated at startup.
 *
 * The server refuses to start on an invalid or insecure configuration rather
 * than warning and continuing. A bridge that boots with authentication
 * accidentally disabled is worse than one that does not boot: the operator
 * believes it is protected.
 */

import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';

/** Minimum acceptable token entropy, in characters of hex/base64url. */
const MIN_TOKEN_LENGTH = 32;

/**
 * Parse a boolean from an environment variable.
 *
 * Takes the default as a parameter rather than relying on `.default()` after
 * the transform: the schema's input type is string, so a boolean default would
 * not typecheck, and coercing one to `'true'` would make the intent harder to
 * read than stating it once here.
 */
function booleanFromEnv(defaultValue: boolean) {
  return z
    .string()
    .optional()
    .transform((v) =>
      v === undefined || v === '' ? defaultValue : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()),
    );
}

const ConfigSchema = z.object({
  /** Port to listen on. */
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),

  /**
   * Interface to bind. Defaults to loopback: the intended deployment puts a
   * TLS-terminating reverse proxy in front, or a private-network overlay
   * around, this process. Binding 0.0.0.0 must be a deliberate act.
   */
  HOST: z.string().default('127.0.0.1'),

  /**
   * Bearer token for read access (GET /session, /meta).
   * Generated and printed on first run if absent.
   */
  READ_TOKEN: z.string().min(MIN_TOKEN_LENGTH).optional(),

  /**
   * Bearer token for write access (POST /action, /text).
   *
   * Separate from READ_TOKEN so the token stored on a device that only
   * displays state cannot be used to type into the session. If unset, it
   * defaults to READ_TOKEN and the server logs that reads and writes share
   * one credential.
   */
  WRITE_TOKEN: z.string().min(MIN_TOKEN_LENGTH).optional(),

  /** Default tmux session to mirror. */
  TMUX_SESSION: z
    .string()
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/,
      'TMUX_SESSION must start with a letter or digit and contain only letters, digits, _ or -',
    )
    .default('claude'),

  /**
   * Restrict the bridge to this exact set of tmux sessions. Empty means "only
   * TMUX_SESSION". A client can never address a session outside this list, so
   * a bug in target handling cannot reach the operator's other work.
   */
  ALLOWED_SESSIONS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),

  /**
   * Whether POST /text (arbitrary prompt text) is enabled.
   *
   * Off by default. Free text into a running agent is, by construction,
   * arbitrary instruction to a system with file and shell access; it should be
   * a deliberate choice, and it is the PWA's feature rather than the Edge's.
   */
  ALLOW_FREE_TEXT: booleanFromEnv(false),

  /**
   * Whether destructive actions (SIGINT, and "don't ask again" style options)
   * may be invoked at all.
   *
   * Off by default. Granting a permanent permission widening is not a decision
   * to make one-handed on a bicycle, and SIGINT can kill the session outright.
   */
  ALLOW_DESTRUCTIVE: booleanFromEnv(false),

  /**
   * tmux socket name. Running Claude Code under a dedicated socket
   * (`tmux -L claude-edge`) means this process is structurally unable to reach
   * the operator's ordinary tmux sessions, whatever the code does.
   */
  TMUX_SOCKET: z
    .string()
    .regex(/^[A-Za-z0-9_-]{0,64}$/)
    .default(''),

  // ---- Adaptive polling. The device asks the server how soon to come back,
  // so battery policy can be retuned without reflashing the device.

  /** Poll interval while Claude is actively working. */
  POLL_WORKING_S: z.coerce.number().int().min(1).max(300).default(3),
  /** Poll interval while a prompt is blocking. Fast: the rider is waiting. */
  POLL_BLOCKED_S: z.coerce.number().int().min(1).max(300).default(2),
  /** Poll interval while idle. Slow: nothing is happening. */
  POLL_IDLE_S: z.coerce.number().int().min(1).max(300).default(15),
  /** Poll interval when no session is present. Slowest. */
  POLL_DEAD_S: z.coerce.number().int().min(1).max(300).default(30),

  /** Rate limit: read requests per minute per token. */
  RATE_READ_PER_MIN: z.coerce.number().int().min(1).default(60),
  /** Rate limit: write requests per minute per token. */
  RATE_WRITE_PER_MIN: z.coerce.number().int().min(1).default(20),

  /** Log level. */
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type RawConfig = z.infer<typeof ConfigSchema>;

export interface Config extends Omit<RawConfig, 'READ_TOKEN' | 'WRITE_TOKEN'> {
  /** SHA-256 of the read token. The plaintext is not retained. */
  readTokenHash: Buffer;
  /** SHA-256 of the write token. */
  writeTokenHash: Buffer;
  /** True when reads and writes share one credential. */
  sharedToken: boolean;
  /** Sessions this deployment will address, always non-empty. */
  allowedSessions: readonly string[];
  /** Tokens generated at startup, to be shown to the operator once. */
  generated: { read?: string; write?: string };
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Load and validate configuration from the environment.
 *
 * @param env Defaults to process.env; injectable for tests.
 * @throws {Error} with a readable summary when validation fails.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = ConfigSchema.safeParse(env);

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${detail}`);
  }

  const raw = parsed.data;
  const generated: { read?: string; write?: string } = {};

  // A missing token is generated rather than defaulted to something guessable,
  // and surfaced to the operator exactly once.
  let readToken = raw.READ_TOKEN;
  if (!readToken) {
    readToken = randomBytes(32).toString('base64url');
    generated.read = readToken;
  }

  let writeToken = raw.WRITE_TOKEN;
  const sharedToken = !writeToken;
  if (!writeToken) {
    writeToken = readToken;
  }

  const allowedSessions =
    raw.ALLOWED_SESSIONS.length > 0
      ? Array.from(new Set([...raw.ALLOWED_SESSIONS, raw.TMUX_SESSION]))
      : [raw.TMUX_SESSION];

  // Reject a session name that would not survive tmux target validation, so
  // the failure surfaces at boot rather than on the first request.
  for (const name of allowedSessions) {
    // Same rule as assertSafeSession in tmux.ts: a leading '-' could be read
    // as a flag by tmux, so it is rejected at boot rather than per request.
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(name)) {
      throw new Error(`Invalid session name in ALLOWED_SESSIONS: "${name}"`);
    }
  }

  const { READ_TOKEN: _r, WRITE_TOKEN: _w, ...rest } = raw;

  return {
    ...rest,
    readTokenHash: sha256(readToken),
    writeTokenHash: sha256(writeToken),
    sharedToken,
    allowedSessions,
    generated,
  };
}

/**
 * Poll interval the device should use next, given the current state.
 * Centralised here so the device never has to encode battery policy.
 */
export function pollIntervalFor(
  state: string,
  config: Pick<Config, 'POLL_WORKING_S' | 'POLL_BLOCKED_S' | 'POLL_IDLE_S' | 'POLL_DEAD_S'>,
): number {
  switch (state) {
    case 'working':
      return config.POLL_WORKING_S;
    case 'awaiting_permission':
    case 'awaiting_input':
      return config.POLL_BLOCKED_S;
    case 'idle':
      return config.POLL_IDLE_S;
    case 'no_session':
      return config.POLL_DEAD_S;
    default:
      return config.POLL_IDLE_S;
  }
}
