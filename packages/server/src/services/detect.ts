/**
 * detect.ts — infer what Claude Code is doing from the contents of its pane.
 *
 * WHY THIS IS SCREEN-SCRAPING, AND WHY THAT IS ACCEPTABLE
 * ------------------------------------------------------
 * Claude Code exposes a hooks system that can push structured events
 * (`Notification:permission_prompt`, `Stop`, `PermissionRequest`) to an HTTP
 * endpoint, and the bridge accepts those on /api/v1/hook. Hooks are the better
 * signal: they carry the tool name and arguments, and they arrive without
 * polling.
 *
 * They are not, however, sufficient on their own:
 *
 *   - Hooks tell you a prompt *exists*. They do not tell you what is currently
 *     rendered, which is what the rider needs to read before deciding.
 *   - Hook delivery has known reliability gaps, and a dropped event leaves the
 *     device stuck showing a stale state forever.
 *   - If the bridge restarts, it has no event history. Re-deriving state from
 *     the pane is self-healing; replaying missed hooks is not.
 *
 * So the pane is the authority and hooks are an accelerant. Everything in this
 * file must therefore degrade gracefully: an unrecognised screen becomes
 * `unknown`, never a wrong answer, because a wrong answer here means the rider
 * approves something they did not read.
 *
 * MATCH ON STRUCTURE, NOT ON WORDING
 * ----------------------------------
 * Claude Code's prompt copy changes between releases. Any detector keyed to
 * exact sentences is a maintenance treadmill that fails silently on upgrade.
 * The stable, structural invariants are:
 *
 *   - the selection cursor glyph that Ink's SelectInput renders (`❯` / `›`)
 *   - a keyboard-hint footer ("Esc to cancel", "Enter to select", ...)
 *   - the box-drawing frame Claude Code draws around its prompt
 *
 * We key on those, and use wording only to *enrich* a match that structure has
 * already established.
 */

import {
  type SessionState,
  type PendingPrompt,
  type PromptOption,
} from '@claude-edge/shared';

/** Selection cursor glyphs used by Claude Code's prompt UI. */
const CURSOR_GLYPHS = ['❯', '›'] as const; // ❯ ›

/**
 * Spinner glyphs Claude Code animates while it is thinking or running a tool.
 * Includes the Braille range used by many spinner libraries.
 */
const SPINNER_GLYPHS = new Set([
  '·', // ·
  '✻', // ✻
  '✽', // ✽
  '✶', // ✶
  '✳', // ✳
  '✢', // ✢
  '✱', // ✱
]);

function isSpinnerChar(ch: string): boolean {
  if (SPINNER_GLYPHS.has(ch)) return true;
  const cp = ch.codePointAt(0) ?? 0;
  return cp >= 0x2800 && cp <= 0x28ff; // Braille patterns
}

/**
 * Footer hints that indicate an interactive prompt is focused and waiting.
 * Matched case-insensitively and as substrings, so minor rewording survives.
 */
const FOOTER_HINTS = [
  'esc to cancel',
  'esc to interrupt',
  'enter to select',
  'enter to confirm',
  'to edit in',
  'to toggle',
  'space to select',
  'tab to',
] as const;

/**
 * Wording that, when combined with a structural match, identifies the prompt as
 * a *permission* request rather than a plan review or a settings menu.
 */
const PERMISSION_PHRASES = [
  'do you want to',
  'do you want me to',
  'requires approval',
  'wants to',
  'allow ',
  'permission',
  'outside of sandbox',
  'grant access',
] as const;

/**
 * Option labels that grant lasting or wide-reaching capability. A prompt
 * offering one of these is flagged destructive, and the device requires a
 * second confirmation before it can be chosen.
 */
const DESTRUCTIVE_LABELS = [
  "don't ask again",
  'dont ask again',
  'yes to all',
  'yes all',
  'always allow',
  'accept edits',
  'bypass',
] as const;

/** Tool names Claude Code commonly names in a permission prompt. */
const TOOL_NAMES = [
  'Bash',
  'Edit',
  'Write',
  'Read',
  'NotebookEdit',
  'WebFetch',
  'WebSearch',
  'Task',
  'Glob',
  'Grep',
] as const;

/** How many lines above the cursor line we search for the question text. */
const QUESTION_LOOKBACK = 12;

/**
 * Normalise text before matching it against a phrase list.
 *
 * Claude Code renders typographic punctuation — curly apostrophes in "don't",
 * en dashes in separators — and which one appears varies with terminal font and
 * locale. Matching the raw string would mean `don't` and `don’t` are different
 * phrases, and a missed match on the destructive-label list is a real safety
 * bug: the device would offer a permanent permission grant as if it were an
 * ordinary choice. So fold the variants to their ASCII equivalents first.
 */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ′]/g, "'") // curly and prime apostrophes
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, '-') // hyphens, en/em dashes
    .replace(/\s+/g, ' ');
}

function containsAny(haystack: string, needles: readonly string[]): boolean {
  const normalised = normalise(haystack);
  return needles.some((n) => normalised.includes(n));
}

/**
 * Find the last line that begins with a selection cursor.
 * Returns -1 when the pane holds no active selection UI.
 */
function findCursorLine(lines: readonly string[]): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = (lines[i] ?? '').trimStart();
    if (CURSOR_GLYPHS.some((g) => trimmed.startsWith(g))) return i;
  }
  return -1;
}

/** True when any of the last few lines carries a keyboard-hint footer. */
function hasFooterHint(lines: readonly string[]): boolean {
  const tail = lines.slice(-8).join('\n');
  return containsAny(tail, FOOTER_HINTS);
}

/**
 * Extract selectable options from the prompt region.
 *
 * Claude Code renders options in two shapes, and both occur in the wild:
 *
 *   horizontal:  `❯ Yes    Yes, and don't ask again    No`
 *   vertical:    `❯ 1. Yes`
 *                `  2. No`
 *
 * We detect the layout rather than assuming one. Getting this wrong is not
 * cosmetic: the option index determines which key we send, so a mis-parse
 * approves the wrong thing.
 */
function extractOptions(
  lines: readonly string[],
  cursorLine: number,
): { options: PromptOption[]; vertical: boolean } {
  const cursorText = lines[cursorLine] ?? '';
  const stripped = cursorText.trimStart().slice(1).trim(); // drop the cursor glyph

  // --- vertical layout: the cursor line holds exactly one option, and sibling
  // lines below hold the rest. Recognised by two-or-more spaces being absent
  // from the cursor line while following lines look like peers.
  const verticalCandidates: string[] = [];
  if (!/\s{2,}/.test(stripped) && stripped.length > 0) {
    verticalCandidates.push(stripped);
    for (let i = cursorLine + 1; i < lines.length && verticalCandidates.length < 9; i++) {
      const raw = lines[i] ?? '';
      const text = raw.trim();
      if (text === '') break;
      if (containsAny(text, FOOTER_HINTS)) break;
      // A peer option is indented similarly and is not prose. Numbered peers
      // ("2. No") are the strongest signal.
      if (/^\d+[.)]\s+/.test(text) || /^[-*]\s+/.test(text)) {
        verticalCandidates.push(text);
      } else if (verticalCandidates.length > 1) {
        break;
      } else {
        break;
      }
    }
  }

  const vertical = verticalCandidates.length > 1;

  const rawOptions = vertical
    ? verticalCandidates
    : // --- horizontal layout: options separated by runs of two or more spaces.
      stripped.split(/\s{2,}/).filter((s) => s.trim() !== '');

  const options = rawOptions.slice(0, 9).map((label, index) => {
    // Strip any leading enumeration so the device renders a clean label; the
    // wire position (n) is what actually selects it.
    const clean = label.replace(/^\d+[.)]\s*/, '').replace(/^[-*]\s*/, '').trim();
    return {
      n: index + 1,
      l: clean.slice(0, 64),
    } satisfies PromptOption;
  });

  return { options, vertical };
}

/**
 * Walk back from the cursor to find the question the options answer.
 * Skips blank lines and box-drawing rules.
 */
function extractQuestion(lines: readonly string[], cursorLine: number): string {
  const start = Math.max(0, cursorLine - QUESTION_LOOKBACK);
  const candidates: string[] = [];

  for (let i = cursorLine - 1; i >= start; i--) {
    const raw = (lines[i] ?? '').trim();
    if (raw === '') {
      // A blank line ends the question block once we have something.
      if (candidates.length > 0) break;
      continue;
    }
    // Skip pure box-drawing rules but keep framed text.
    const withoutBox = raw.replace(/[─-╿]/g, '').trim();
    if (withoutBox === '') continue;

    candidates.unshift(withoutBox);

    // A line ending in '?' is almost certainly the whole question.
    if (withoutBox.endsWith('?')) break;
  }

  return candidates.join(' ').slice(0, 200);
}

/** Identify the tool named in the prompt, when one is named. */
function extractTool(question: string, context: string): string | undefined {
  const haystack = `${question}\n${context}`;
  for (const tool of TOOL_NAMES) {
    // Word-boundary match so "Read" does not fire on "already".
    if (new RegExp(`\\b${tool}\\b`).test(haystack)) return tool;
  }
  return undefined;
}

/**
 * Does the pane show a spinner in its last few lines?
 * Claude Code animates one while generating or running a tool.
 */
function hasActiveSpinner(lines: readonly string[]): boolean {
  for (const line of lines.slice(-6)) {
    const trimmed = (line ?? '').trim();
    if (trimmed === '') continue;
    // A spinner sits at the start of the status line, usually followed by a
    // verb and a token/time counter.
    const first = [...trimmed][0] ?? '';
    if (isSpinnerChar(first)) return true;
    // "(esc to interrupt)" is Claude Code's running-task affordance.
    if (trimmed.toLowerCase().includes('esc to interrupt')) return true;
  }
  return false;
}

/**
 * True when the pane's foreground command indicates Claude Code is not running
 * at all — for example the user quit and is back at a shell prompt.
 */
function looksLikeShell(currentCommand: string): boolean {
  const shells = ['bash', 'zsh', 'sh', 'fish', 'ksh', 'dash'];
  return shells.includes(currentCommand.trim().toLowerCase());
}

export interface DetectInput {
  /** ANSI-stripped pane lines, oldest first. */
  lines: readonly string[];
  /** `pane_current_command` from tmux, used to spot a dead session. */
  currentCommand?: string;
  /** `pane_in_mode` from tmux: copy mode swallows keys, so writes must be refused. */
  inMode?: boolean;
}

export interface DetectResult {
  state: SessionState;
  prompt?: PendingPrompt;
  /**
   * True when the pane is in a mode (copy/scroll) where sent keys would be
   * consumed by tmux rather than delivered to Claude Code. The action route
   * refuses writes while this holds.
   */
  writeBlocked: boolean;
  /**
   * True when the prompt's options were rendered as a vertical list rather than
   * a horizontal row.
   *
   * This determines which arrow key moves the selection cursor, so answering an
   * option correctly depends on it. It is reported alongside the prompt rather
   * than inferred later, because only the parser knows which layout it matched.
   */
  verticalOptions: boolean;
}

/**
 * Infer session state from a captured pane.
 *
 * The order of checks is deliberate: the most specific and most consequential
 * conclusion (a prompt is blocking) is tested before the vaguer ones, and the
 * function falls through to `unknown` rather than guessing.
 */
export function detectState({
  lines,
  currentCommand = '',
  inMode = false,
}: DetectInput): DetectResult {
  const writeBlocked = inMode;

  if (lines.length === 0) {
    return {
      state: looksLikeShell(currentCommand) ? 'no_session' : 'unknown',
      writeBlocked,
      verticalOptions: false,
    };
  }

  const cursorLine = findCursorLine(lines);
  const footer = hasFooterHint(lines);

  // ---- Blocking prompt: a selection cursor plus a keyboard hint. Both must be
  // present. The cursor alone appears in ordinary output (shell prompts, git
  // logs); the footer alone appears in transient banners.
  if (cursorLine >= 0 && footer) {
    const question = extractQuestion(lines, cursorLine);
    const { options, vertical } = extractOptions(lines, cursorLine);
    const context = lines.slice(Math.max(0, cursorLine - QUESTION_LOOKBACK)).join('\n');

    const isPermission =
      containsAny(question, PERMISSION_PHRASES) || containsAny(context, PERMISSION_PHRASES);

    const destructive = options.some((o) => containsAny(o.l, DESTRUCTIVE_LABELS));
    const tool = extractTool(question, context);

    const prompt: PendingPrompt = {
      q: question || 'Claude is waiting for a choice',
      o: options,
      ...(tool ? { t: tool } : {}),
      ...(destructive ? { d: true } : {}),
    };

    return {
      state: isPermission ? 'awaiting_permission' : 'awaiting_input',
      prompt,
      writeBlocked,
      verticalOptions: vertical,
    };
  }

  // ---- Working: a spinner is animating.
  if (hasActiveSpinner(lines)) {
    return { state: 'working', writeBlocked, verticalOptions: false };
  }

  // ---- No session: the pane dropped back to a shell.
  if (looksLikeShell(currentCommand)) {
    return { state: 'no_session', writeBlocked, verticalOptions: false };
  }

  // ---- Idle: Claude Code is running and drew its input box, but nothing is
  // spinning and nothing is selected. Its input affordance is a framed prompt.
  const tail = lines.slice(-6).join('\n');
  if (/[╭╰│>]/.test(tail) || tail.includes('for shortcuts')) {
    return { state: 'idle', writeBlocked, verticalOptions: false };
  }

  return { state: 'unknown', writeBlocked, verticalOptions: false };
}
