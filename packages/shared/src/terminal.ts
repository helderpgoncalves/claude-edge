/**
 * terminal.ts — pure text helpers shared by the server and the PWA.
 *
 * These live in `shared` rather than `server` because the PWA re-wraps text
 * client-side when the viewport changes, and it must produce byte-identical
 * output to the server or the two views would disagree about line numbering.
 *
 * Everything here is pure and synchronous so it can be property-tested.
 */

/**
 * Matches ANSI escape sequences: CSI (colours, cursor moves), OSC (window
 * titles, hyperlinks), and the two-character escapes.
 *
 * Terminal output from Claude Code is dense with colour, and the Edge cannot
 * render any of it, so we strip rather than translate. The OSC branch must be
 * terminated by BEL or ST, and we bound it so a truncated sequence at a capture
 * boundary cannot swallow the rest of the screen.
 */
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN =
  /(?:\x1b\[[0-?]*[ -\/]*[@-~]|\x1b\][^]{0,512}?(?:\x07|\x1b\\)|\x1b[@-Z\\-_])/g;

/** Zero-width and bidi control characters that would corrupt column maths. */
// eslint-disable-next-line no-misleading-character-class
const ZERO_WIDTH = /[​-‏‪-‮⁠﻿]/g;

/**
 * Remaining C0/C1 control characters left behind by malformed or truncated
 * sequences. Tab and newline are handled by the caller and excluded here.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;

/**
 * Strip ANSI escapes and other non-printing noise from a captured pane.
 *
 * @param input Raw text, possibly containing escape sequences.
 * @returns Plain text safe to measure and wrap.
 */
export function stripAnsi(input: string): string {
  return input
    .replace(ANSI_PATTERN, '')
    .replace(CONTROL_CHARS, '')
    .replace(ZERO_WIDTH, '');
}

/**
 * Approximate display width of a character in terminal columns.
 *
 * Full implementations consult the Unicode East Asian Width tables; we only
 * need enough fidelity to stop CJK text and emoji from overflowing a 40-column
 * Edge screen, so we test the well-known wide ranges directly.
 */
function charWidth(codePoint: number): 0 | 1 | 2 {
  // Combining marks occupy no column of their own.
  if (
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f)
  ) {
    return 0;
  }

  if (
    (codePoint >= 0x1100 && codePoint <= 0x115f) || // Hangul Jamo
    (codePoint >= 0x2e80 && codePoint <= 0x303e) || // CJK radicals, Kangxi
    (codePoint >= 0x3041 && codePoint <= 0x33ff) || // Hiragana .. CJK compat
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) || // CJK Ext A
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) || // CJK Unified
    (codePoint >= 0xa000 && codePoint <= 0xa4cf) || // Yi
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) || // Hangul syllables
    (codePoint >= 0xf900 && codePoint <= 0xfaff) || // CJK compat ideographs
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) || // CJK compat forms
    (codePoint >= 0xff00 && codePoint <= 0xff60) || // Fullwidth forms
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1f9ff) || // Emoji, pictographs, transport
    (codePoint >= 0x1fa70 && codePoint <= 0x1faff) || // Symbols extended-A
    (codePoint >= 0x2648 && codePoint <= 0x2653) || // Zodiac
    codePoint === 0x231a ||
    codePoint === 0x231b ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd) // CJK Ext B+
  ) {
    return 2;
  }

  return 1;
}

/**
 * Display width of a string in terminal columns.
 */
export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    width += charWidth(ch.codePointAt(0) ?? 0);
  }
  return width;
}

/**
 * Hard-wrap a single logical line to a column budget.
 *
 * Terminal output is not prose: indentation carries meaning (diffs, tree views,
 * stack traces), and breaking mid-token is less confusing than reflowing. So
 * this wraps on width alone, preserving leading whitespace on continuation
 * lines so nested structures stay visually nested on a narrow screen.
 *
 * @param line  A single logical line, already ANSI-stripped.
 * @param width Column budget, >= 8.
 * @returns One or more physical lines.
 */
export function wrapLine(line: string, width: number): string[] {
  if (width < 8) throw new RangeError('width must be at least 8');
  if (line === '') return [''];
  if (displayWidth(line) <= width) return [line];

  // Preserve the original indentation on wrapped continuations, but never let
  // indentation eat more than half the screen or deeply-nested output would
  // wrap to one character per line.
  const indentMatch = /^[ \t]*/.exec(line);
  const rawIndent = indentMatch ? indentMatch[0] : '';
  const indent = rawIndent.length > width / 2 ? '' : rawIndent;

  const out: string[] = [];
  let current = '';
  let currentWidth = 0;
  let isFirst = true;

  for (const ch of line) {
    const budget = isFirst ? width : width - indent.length;
    const w = charWidth(ch.codePointAt(0) ?? 0);

    if (currentWidth + w > budget) {
      out.push(isFirst ? current : indent + current);
      isFirst = false;
      current = '';
      currentWidth = 0;
    }

    current += ch;
    currentWidth += w;
  }

  if (current !== '' || out.length === 0) {
    out.push(isFirst ? current : indent + current);
  }

  return out;
}

/**
 * Wrap a captured pane to a column budget.
 *
 * @param lines ANSI-stripped logical lines, oldest first.
 * @param width Column budget.
 * @returns Physical lines, oldest first.
 */
export function wrapLines(lines: readonly string[], width: number): string[] {
  const out: string[] = [];
  for (const line of lines) {
    out.push(...wrapLine(line, width));
  }
  return out;
}

/**
 * Take a window of lines counting back from the end.
 *
 * `offset` 0 means the live tail. Larger offsets page backwards into history,
 * which is how the Edge's scroll-up gesture is expressed on the wire.
 *
 * @returns The slice plus the absolute index of its first line.
 */
export function tailWindow(
  lines: readonly string[],
  count: number,
  offset = 0,
): { slice: string[]; start: number } {
  const end = Math.max(0, lines.length - offset);
  const start = Math.max(0, end - count);
  return { slice: lines.slice(start, end), start };
}

/**
 * Stable, short content hash used as an ETag.
 *
 * FNV-1a is chosen deliberately over a cryptographic hash: this value is a
 * change-detector, not a security boundary, and it must be cheap enough to
 * compute on every poll. Collisions cost one stale frame, corrected on the
 * next tick.
 *
 * Returned as 8 lowercase hex characters to keep the device payload small.
 */
export function contentHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply, kept in integer range via Math.imul.
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
