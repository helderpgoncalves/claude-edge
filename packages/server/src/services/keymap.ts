/**
 * keymap.ts — the allowlist of everything a client may type into the session.
 *
 * WHY AN ALLOWLIST, NOT A KEY PASSTHROUGH
 * ---------------------------------------
 * This bridge injects keystrokes into a terminal running an AI agent that holds
 * tool permissions: it can edit files, run shell commands, and reach the
 * network. If the wire protocol carried raw keys, anyone holding the bearer
 * token would have an interactive session on the developer's machine. The
 * published remote-terminal tools that got this wrong (ttyd <= 1.3.0, CVE'd for
 * unauthenticated RCE) failed precisely because request *content* could steer
 * what got executed.
 *
 * So the protocol carries an action *id*. The server maps it to a fixed key
 * sequence defined in this file. The reachable state space is finite, auditable
 * in a diff, and cannot be widened by a request parameter.
 *
 * SELECTION IS POSITIONAL, NOT NUMERIC
 * ------------------------------------
 * Claude Code renders permission prompts using Ink's SelectInput, which is a
 * *cursor* over a list — usually horizontal:
 *
 *     ❯ Yes    Yes, and don't ask again    No
 *
 * Typing "1" does not choose the first option; it types the character "1" into
 * the prompt. Answering therefore means moving the cursor with arrow keys and
 * pressing Enter. Because the cursor always starts on the first option, the
 * number of moves is (target index - 0). The detector reports the parsed option
 * list, and `buildSelectSequence` turns a chosen index into the moves.
 *
 * This is why there is no `approve_once` constant with a hardcoded "1": the
 * correct keys depend on where the target sits in a list that varies per
 * prompt.
 */

import type { ActionInfo, PendingPrompt } from '@claude-edge/shared';

import { DESTRUCTIVE_LABELS, containsAny } from './detect.ts';

export type ActionCategory = 'navigation' | 'response' | 'control' | 'prompt';

export interface KeyAction {
  readonly id: string;
  readonly label: string;
  /** tmux key names, sent in order. */
  readonly keys: readonly string[];
  /** Send as literal UTF-8 text rather than key-name lookup. */
  readonly literal?: boolean;
  readonly category: ActionCategory;
  /**
   * Requires an explicit second confirmation on the device, and is refused
   * entirely unless the deployment opts in via config.
   */
  readonly destructive?: boolean;
  readonly description: string;
}

/**
 * Fixed actions. Prompt *answers* are not here — they are computed per-prompt
 * by `buildSelectSequence`, because option positions vary.
 */
export const ACTIONS: Readonly<Record<string, KeyAction>> = Object.freeze({
  // -------------------------------------------------------------- navigation
  up: {
    id: 'up',
    label: 'Up',
    keys: ['Up'],
    category: 'navigation',
    description: 'Move the selection cursor up, or scroll up in a list.',
  },
  down: {
    id: 'down',
    label: 'Down',
    keys: ['Down'],
    category: 'navigation',
    description: 'Move the selection cursor down.',
  },
  left: {
    id: 'left',
    label: 'Left',
    keys: ['Left'],
    category: 'navigation',
    description: 'Move the selection cursor left in a horizontal option row.',
  },
  right: {
    id: 'right',
    label: 'Right',
    keys: ['Right'],
    category: 'navigation',
    description: 'Move the selection cursor right in a horizontal option row.',
  },
  enter: {
    id: 'enter',
    label: 'Enter',
    keys: ['Enter'],
    category: 'navigation',
    description: 'Confirm the currently highlighted option.',
  },
  escape: {
    id: 'escape',
    label: 'Esc',
    keys: ['Escape'],
    category: 'navigation',
    description: 'Dismiss the prompt. In Claude Code this cancels rather than denies.',
  },

  // ----------------------------------------------------------------- control
  interrupt: {
    id: 'interrupt',
    label: 'Stop',
    keys: ['Escape'],
    category: 'control',
    description: 'Interrupt the task Claude is running. Escape is its documented interrupt.',
  },
  clear_input: {
    id: 'clear_input',
    label: 'Clear',
    keys: ['C-u'],
    category: 'control',
    description: 'Erase the current input line.',
  },
  sigint: {
    id: 'sigint',
    label: 'Ctrl-C',
    keys: ['C-c'],
    category: 'control',
    destructive: true,
    description:
      'Send SIGINT to the foreground process. Destructive: can terminate Claude Code itself.',
  },

  // ------------------------------------------------------------------ prompt
  // Canned prompts. The device sends the id; the text lives here, server-side,
  // so a compromised client cannot choose what gets typed.
  continue: {
    id: 'continue',
    label: 'Continue',
    keys: ['continue'],
    literal: true,
    category: 'prompt',
    description: 'Type "continue" to resume an interrupted task.',
  },
  run_tests: {
    id: 'run_tests',
    label: 'Run tests',
    keys: ['run the tests'],
    literal: true,
    category: 'prompt',
    description: 'Ask Claude to run the project test suite.',
  },
  explain: {
    id: 'explain',
    label: 'Explain',
    keys: ['explain what you just did'],
    literal: true,
    category: 'prompt',
    description: 'Ask for a summary of the last action.',
  },
} satisfies Record<string, KeyAction>);

export class ActionError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, code: string, statusCode = 400) {
    super(message);
    this.name = 'ActionError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Resolve a wire action id against the allowlist.
 *
 * @param id                Action id from the request.
 * @param allowDestructive  Whether this deployment permits destructive actions.
 */
export function resolveAction(id: string, allowDestructive: boolean): KeyAction {
  if (!Object.hasOwn(ACTIONS, id)) {
    throw new ActionError(`Unknown action "${id}".`, 'UNKNOWN_ACTION', 400);
  }
  const action = ACTIONS[id] as KeyAction;

  if (action.destructive && !allowDestructive) {
    throw new ActionError(
      `Action "${id}" is disabled on this server.`,
      'ACTION_DISABLED',
      403,
    );
  }
  return action;
}

/**
 * Build the key sequence that selects option `index` in the given prompt.
 *
 * The cursor always begins on the first option, so selecting index N means N
 * moves in the layout's direction followed by Enter.
 *
 * Layout is inferred from the parsed prompt: a prompt whose options were split
 * on wide horizontal gaps needs Left/Right; a vertical list needs Up/Down. We
 * send Right for horizontal and Down for vertical, which matches how Ink's
 * SelectInput binds its keys in each orientation.
 *
 * @param prompt   The prompt as parsed by the detector.
 * @param index    Zero-based index of the option to choose.
 * @param vertical True when the options were rendered as a vertical list.
 */
export function buildSelectSequence(
  prompt: PendingPrompt,
  index: number,
  vertical: boolean,
): string[] {
  if (!Number.isInteger(index) || index < 0 || index >= prompt.o.length) {
    throw new ActionError(
      `Option ${index + 1} is out of range for this prompt.`,
      'OPTION_OUT_OF_RANGE',
      400,
    );
  }

  const move = vertical ? 'Down' : 'Right';
  return [...Array.from({ length: index }, () => move), 'Enter'];
}

/**
 * Is the option at `index` one that grants a lasting or destructive capability?
 * Used to require a second confirmation, independent of the prompt-level flag.
 */
export function isDestructiveOption(prompt: PendingPrompt, index: number): boolean {
  const option = prompt.o[index];
  if (!option) return false;
  // Same list and same normalisation the detector uses, so an option cannot be
  // flagged dangerous on screen and accepted as ordinary by the write path.
  return containsAny(option.l, DESTRUCTIVE_LABELS);
}

/** The action catalogue in the compact shape the device consumes. */
export function actionCatalogue(allowDestructive: boolean): ActionInfo[] {
  return Object.values(ACTIONS)
    .filter((a) => allowDestructive || !a.destructive)
    .map((a) => ({
      id: a.id,
      label: a.label,
      cat: a.category,
      ...(a.destructive ? { danger: 1 as const } : {}),
    }));
}

// ---------------------------------------------------------------------------
// Free text
// ---------------------------------------------------------------------------

/** Hard ceiling on a single free-text submission. */
export const MAX_FREE_TEXT_LENGTH = 2000;

/**
 * Control characters are stripped from free text so a prompt typed in the PWA
 * cannot smuggle in an escape sequence, a newline that submits early, or a CSI
 * sequence that reprograms the terminal.
 *
 * Note this is defence in depth, not the primary control: the text is delivered
 * with `tmux send-keys -l --`, which disables key-name lookup entirely, so the
 * string "Enter" arrives as five characters rather than a keypress.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1f\x7f-\x9f]/g;

/**
 * Sanitise a free-text prompt for literal delivery into the pane.
 *
 * @throws {ActionError} when the text is empty or oversized after cleaning.
 */
export function sanitiseFreeText(text: string): string {
  const cleaned = text.replace(CONTROL_CHARS, '').trim();

  if (cleaned.length === 0) {
    throw new ActionError('Text is empty after sanitisation.', 'EMPTY_TEXT', 400);
  }
  if (cleaned.length > MAX_FREE_TEXT_LENGTH) {
    throw new ActionError(
      `Text exceeds ${MAX_FREE_TEXT_LENGTH} characters.`,
      'TEXT_TOO_LONG',
      413,
    );
  }
  return cleaned;
}
