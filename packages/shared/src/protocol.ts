/**
 * protocol.ts — the wire contract between the bridge server and its clients.
 *
 * There are three consumers of this contract, and only two of them can import
 * it:
 *
 *   1. `@claude-edge/server` — implements it.
 *   2. `@claude-edge/web`    — the PWA, consumes it.
 *   3. The Garmin device app — written in Monkey C, which cannot import
 *      TypeScript. It re-implements the parsing by hand.
 *
 * Because consumer (3) cannot be type-checked against this file, the shapes
 * here are deliberately conservative and the field names are deliberately
 * short. Every change to a `*Response` shape is a breaking change for a device
 * app already installed on someone's Edge, so responses carry `v` and the
 * server supports the previous version for one release cycle.
 *
 * DESIGN CONSTRAINT: BLE BANDWIDTH
 * --------------------------------
 * Edge cycling computers have no WiFi. Every byte travels
 * Edge <-BLE-> phone <-internet-> server, and Garmin's own docs warn that
 * oversized payloads fail outright with NETWORK_RESPONSE_TOO_LARGE (-402).
 * The device-facing payloads below therefore use two-to-four character keys
 * and omit anything the device can derive locally. This is not premature
 * optimisation — it is the difference between a screen that refreshes in two
 * seconds and one that errors.
 */

import { z } from 'zod';

/**
 * Wire protocol version. Bump on any breaking change to a device-facing shape.
 * The device sends the version it understands; the server may serve an older
 * shape to an older device.
 */
export const PROTOCOL_VERSION = 1;

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

/**
 * What Claude Code appears to be doing, inferred from the terminal.
 *
 * This is a *heuristic* derived from screen-scraping the pane, not a supported
 * Claude Code API. Detection lives in the server and is versioned separately;
 * see `detectState()`. The device treats an unrecognised value as `unknown`
 * rather than failing, so adding a state here is backwards-compatible.
 */
export const SessionStateSchema = z.enum([
  /** Claude is generating or running a tool; the user should wait. */
  'working',
  /** Claude has stopped and is waiting for the user to type something. */
  'idle',
  /** A permission prompt is on screen and is blocking progress. */
  'awaiting_permission',
  /** A non-permission prompt (a plan review, a numbered choice) is blocking. */
  'awaiting_input',
  /** The pane exists but no Claude Code process was found in it. */
  'no_session',
  /** State could not be determined. Render the raw screen and let the human judge. */
  'unknown',
]);
export type SessionState = z.infer<typeof SessionStateSchema>;

/** States in which the human is being actively blocked and should be alerted. */
export const BLOCKING_STATES: readonly SessionState[] = Object.freeze([
  'awaiting_permission',
  'awaiting_input',
]);

// ---------------------------------------------------------------------------
// Permission prompts
// ---------------------------------------------------------------------------

/**
 * A single selectable option parsed out of a Claude Code prompt.
 * Short keys: `n` = number, `l` = label.
 */
export const PromptOptionSchema = z.object({
  /** The digit the user would press, 1-based as rendered by Claude Code. */
  n: z.number().int().min(1).max(9),
  /** Option text, already truncated to something a 246px screen can show. */
  l: z.string().max(64),
});
export type PromptOption = z.infer<typeof PromptOptionSchema>;

/**
 * A parsed prompt awaiting an answer.
 * Short keys: `q` = question, `o` = options, `t` = tool name.
 */
export const PendingPromptSchema = z.object({
  /** The question line, e.g. "Do you want to make this edit to tmux.ts?" */
  q: z.string().max(200),
  /** Selectable options in display order. */
  o: z.array(PromptOptionSchema).max(9),
  /** Tool being requested, when identifiable (e.g. "Bash", "Edit"). */
  t: z.string().max(32).optional(),
  /**
   * True when the prompt looks like it grants a lasting or destructive
   * capability (shell execution, "don't ask again"). The device requires a
   * second confirmation for these.
   */
  d: z.boolean().optional(),
});
export type PendingPrompt = z.infer<typeof PendingPromptSchema>;

// ---------------------------------------------------------------------------
// GET /api/v1/session — the device's main poll
// ---------------------------------------------------------------------------

/**
 * The payload the Edge fetches on every tick. Keys are short by necessity.
 *
 * Budget: this must stay comfortably under ~8 KB serialised. With 40 lines of
 * 80 columns the `L` array alone is ~3 KB, which is why `lines` is a
 * request parameter the device tunes to its own screen height.
 */
export const SessionResponseSchema = z.object({
  /** Protocol version this payload conforms to. */
  v: z.literal(PROTOCOL_VERSION),
  /** Session state. See SessionStateSchema. */
  s: SessionStateSchema,
  /** Terminal lines, oldest first, already wrapped to the requested width. */
  L: z.array(z.string()),
  /**
   * Content hash of the full untruncated pane. The device sends this back as
   * `?etag=`; when nothing has changed the server replies 304 with an empty
   * body, which is the single biggest bandwidth saving available to us.
   */
  h: z.string().max(16),
  /** Server time (epoch seconds) so the device can show a real "last updated". */
  ts: z.number().int(),
  /** Prompt awaiting an answer, when state is awaiting_*. */
  p: PendingPromptSchema.optional(),
  /**
   * Recommended seconds until the next poll. The server computes this from the
   * current state (fast while working or blocked, slow while idle), so battery
   * policy lives on the server and can be tuned without reflashing the device.
   */
  n: z.number().int().min(1).max(300),
  /** Total line count in the pane, so the device can render a scroll position. */
  tl: z.number().int().min(0),
  /** Offset of the first returned line within the pane. */
  o: z.number().int().min(0),
  /** Human-readable session label, shown in the device header. */
  name: z.string().max(32).optional(),
});
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

/** Query parameters for GET /api/v1/session. */
export const SessionQuerySchema = z.object({
  /** tmux session name. Defaults to the server's configured session. */
  session: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid session name')
    .optional(),
  /** Number of lines to return. The device asks for exactly what it can draw. */
  lines: z.coerce.number().int().min(1).max(200).default(20),
  /** Character width to wrap to. The device reports its own usable width. */
  width: z.coerce.number().int().min(20).max(240).default(40),
  /**
   * Scrollback offset: 0 is the live bottom of the pane, higher values page
   * backwards through history.
   */
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
  /** Last known content hash, for 304 short-circuiting. */
  etag: z.string().max(16).optional(),
});
export type SessionQuery = z.infer<typeof SessionQuerySchema>;

// ---------------------------------------------------------------------------
// POST /api/v1/action — the device answers a prompt or sends a canned key
// ---------------------------------------------------------------------------

export const ActionRequestSchema = z.object({
  /**
   * Either an id from the server-side allowlist, or `select:N` to choose the
   * Nth option (zero-based) of the prompt currently on screen.
   *
   * `select:N` is not a keystroke: the server re-reads the prompt, works out
   * where option N sits in the rendered list, and emits the cursor moves plus
   * Enter that land on it. The client therefore expresses *which option it
   * means*, not how to reach it — so a prompt whose options are laid out
   * differently than the client assumed cannot cause the wrong answer.
   */
  action: z.string().min(1).max(32),
  /** Target tmux session; defaults to the configured one. */
  session: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .optional(),
  /**
   * Client-generated unique id. The server records it and ignores a repeat,
   * so a retry over a flaky BLE link cannot approve a permission twice.
   */
  nonce: z.string().min(8).max(64),
  /**
   * Content hash the client had on screen when the user decided. If the pane
   * has changed since, the server rejects the action rather than answering a
   * prompt the user never actually saw.
   */
  expect: z.string().max(16).optional(),
});
export type ActionRequest = z.infer<typeof ActionRequestSchema>;

export const ActionResponseSchema = z.object({
  ok: z.boolean(),
  /** Action id that was executed. */
  action: z.string(),
  /** True when this nonce had already been executed and was not repeated. */
  deduped: z.boolean().optional(),
  /** Pane hash after the action, so the client can resync immediately. */
  h: z.string().optional(),
});
export type ActionResponse = z.infer<typeof ActionResponseSchema>;

// ---------------------------------------------------------------------------
// POST /api/v1/text — free-text prompt (PWA only, gated by config)
// ---------------------------------------------------------------------------

export const TextRequestSchema = z.object({
  text: z.string().min(1).max(2000),
  session: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .optional(),
  nonce: z.string().min(8).max(64),
  /** Press Enter after typing. False lets the user stage text and review it. */
  submit: z.boolean().default(true),
});
export type TextRequest = z.infer<typeof TextRequestSchema>;

// ---------------------------------------------------------------------------
// GET /api/v1/meta — capability discovery, fetched once at app start
// ---------------------------------------------------------------------------

export const ActionInfoSchema = z.object({
  id: z.string(),
  label: z.string(),
  cat: z.enum(['navigation', 'response', 'control', 'prompt']),
  /** 1 when the device must confirm before sending. */
  danger: z.literal(1).optional(),
});
export type ActionInfo = z.infer<typeof ActionInfoSchema>;

export const MetaResponseSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  /** Server version, for the about screen and for bug reports. */
  server: z.string(),
  /** Actions this server will accept. The device builds its menu from this. */
  actions: z.array(ActionInfoSchema),
  /** tmux sessions available to switch between. */
  sessions: z.array(z.object({ name: z.string(), attached: z.boolean() })),
  /** Whether POST /text is enabled on this deployment. */
  freeText: z.boolean(),
  /** Poll intervals in seconds, by state, so the device can self-pace offline. */
  poll: z.object({
    working: z.number().int(),
    idle: z.number().int(),
    blocked: z.number().int(),
  }),
});
export type MetaResponse = z.infer<typeof MetaResponseSchema>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Uniform error body. The device shows `m` verbatim, so it must be short
 * enough for a 246px screen and written for a human on a bicycle.
 */
export const ErrorResponseSchema = z.object({
  ok: z.literal(false),
  /** Machine-readable code, e.g. NO_SUCH_TARGET. */
  code: z.string(),
  /** Short human message, <= 80 chars so it fits the device screen. */
  m: z.string().max(80),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
