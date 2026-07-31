import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { detectState } from '../src/services/detect.ts';

/**
 * Fixtures reproduce the *structure* Claude Code renders, which is what the
 * detector keys on: an Ink SelectInput cursor plus a keyboard-hint footer,
 * inside a box-drawn frame.
 *
 * They are written as line arrays rather than template literals so that
 * trailing whitespace — which tmux strips and the detector must not depend on —
 * cannot creep in invisibly.
 */

const CURSOR = '❯'; // ❯
const SPINNER = '✻'; // ✻

/** Horizontal permission prompt: the common shape for an edit approval. */
const permissionHorizontal = [
  '  Claude wants to edit config.ts',
  '',
  '╭' + '─'.repeat(40) + '╮',
  '│ Do you want to make this edit to config.ts?',
  '╰' + '─'.repeat(40) + '╯',
  '',
  `${CURSOR} Yes    Yes, and don't ask again    No`,
  '',
  '  Esc to cancel',
];

/** Vertical numbered prompt: used by plan review and some tool prompts. */
const permissionVertical = [
  '  Do you want to proceed?',
  '',
  `${CURSOR} 1. Yes`,
  '  2. Yes, and don’t ask again',
  '  3. No, tell Claude what to do differently',
  '',
  '  Enter to select · Esc to cancel',
];

/** A Bash command awaiting approval. */
const bashPermission = [
  '  Bash command',
  '',
  '  npm run build',
  '',
  '│ Do you want to run this command?',
  '',
  `${CURSOR} Yes    No`,
  '',
  '  Esc to cancel',
];

/** Claude actively working: spinner plus interrupt affordance. */
const working = [
  '  Reading files...',
  '',
  `${SPINNER} Thinking... (12s · esc to interrupt)`,
];

/** Idle: the input box is drawn, nothing is spinning. */
const idle = [
  '  Done. I updated the config.',
  '',
  '╭' + '─'.repeat(40) + '╮',
  '│ > ',
  '╰' + '─'.repeat(40) + '╯',
  '  ? for shortcuts',
];

/** A plain shell prompt: Claude Code is not running. */
const shell = ['➜  claude-edge git:(master)'];

describe('detectState — permission prompts', () => {
  it('detects a horizontal permission prompt', () => {
    const r = detectState({ lines: permissionHorizontal });
    assert.equal(r.state, 'awaiting_permission');
    assert.ok(r.prompt);
    assert.match(r.prompt.q, /make this edit/i);
  });

  it('parses horizontal options separated by wide gaps', () => {
    const r = detectState({ lines: permissionHorizontal });
    const labels = r.prompt?.o.map((o) => o.l) ?? [];
    assert.deepEqual(labels, ['Yes', "Yes, and don't ask again", 'No']);
  });

  it('numbers options from 1 in display order', () => {
    const r = detectState({ lines: permissionHorizontal });
    assert.deepEqual(r.prompt?.o.map((o) => o.n), [1, 2, 3]);
  });

  it('detects a vertical numbered prompt', () => {
    const r = detectState({ lines: permissionVertical });
    assert.equal(r.state, 'awaiting_permission');
    const labels = r.prompt?.o.map((o) => o.l) ?? [];
    assert.equal(labels.length, 3);
    assert.equal(labels[0], 'Yes');
    assert.match(String(labels[2]), /^No,/);
  });

  it('strips enumeration from vertical option labels', () => {
    const r = detectState({ lines: permissionVertical });
    for (const opt of r.prompt?.o ?? []) {
      assert.doesNotMatch(opt.l, /^\d+[.)]/, `"${opt.l}" kept its number`);
    }
  });

  it('flags a prompt offering a lasting permission as destructive', () => {
    assert.equal(detectState({ lines: permissionHorizontal }).prompt?.d, true);
    assert.equal(detectState({ lines: permissionVertical }).prompt?.d, true);
  });

  it('does not flag an ordinary yes/no prompt as destructive', () => {
    assert.equal(detectState({ lines: bashPermission }).prompt?.d, undefined);
  });

  it('flags every lasting-permission wording Claude Code 2.x actually uses', () => {
    // Transcribed from a live Claude Code 2.1 session, not invented. The
    // "allow all edits during this session" variant was missed by the original
    // list — it grants a capability for the remainder of the session, which is
    // exactly what this flag exists to catch, and it was being presented to the
    // rider as an ordinary choice.
    //
    // This list is a record of observed wording rather than a prediction of it,
    // so it grows whenever a real session shows something new.
    const lastingGrants = [
      'Yes, allow all edits during this session (shift+tab)',
      "Yes, and don't ask again",
      "Yes, and don't ask again for bash commands in /repo",
      'Yes, allow all',
      'Yes to all',
      'Always allow',
      'Yes, auto-accept edits',
      'Accept edits for the rest of this session',
    ];

    for (const label of lastingGrants) {
      const lines = [
        'Do you want to make this edit to app.ts?',
        `${CURSOR} 1. Yes`,
        `  2. ${label}`,
        '  3. No',
        '  Esc to cancel',
      ];
      assert.equal(
        detectState({ lines }).prompt?.d,
        true,
        `"${label}" was not flagged as granting lasting permission`,
      );
    }
  });

  it('does not flag ordinary affirmatives as lasting grants', () => {
    // The inverse matters just as much: over-flagging would make every prompt
    // require a second confirmation, and riders would stop reading them.
    const ordinary = ['Yes', 'Yes, proceed', 'No', 'No, tell Claude what to do differently'];

    for (const label of ordinary) {
      const lines = [
        'Do you want to proceed?',
        `${CURSOR} 1. ${label}`,
        '  2. Cancel',
        '  Esc to cancel',
      ];
      assert.notEqual(
        detectState({ lines }).prompt?.d,
        true,
        `"${label}" was wrongly flagged as granting lasting permission`,
      );
    }
  });

  it('parses the real folder-trust prompt', () => {
    // Claude Code shows this on first entering a directory. Transcribed from a
    // live session; note it carries no question mark above the cursor, which
    // the question extractor has to cope with.
    const lines = [
      ' Security guide',
      '',
      `${CURSOR} 1. Yes, I trust this folder`,
      '   2. No, exit',
      '',
      ' Enter to confirm · Esc to cancel',
    ];

    const r = detectState({ lines });
    assert.ok(r.state === 'awaiting_input' || r.state === 'awaiting_permission');
    assert.deepEqual(r.prompt?.o.map((o) => o.l), ['Yes, I trust this folder', 'No, exit']);
    assert.equal(r.verticalOptions, true);
  });

  it('flags destructive labels regardless of apostrophe style', () => {
    // Claude Code renders a typographic apostrophe depending on font and
    // locale. Missing the match here would present a permanent permission
    // grant as an ordinary choice, so both forms must be caught.
    for (const apostrophe of ["'", '’', 'ʼ']) {
      const lines = [
        '  Do you want to proceed?',
        `${CURSOR} Yes    Yes, and don${apostrophe}t ask again    No`,
        '  Esc to cancel',
      ];
      assert.equal(
        detectState({ lines }).prompt?.d,
        true,
        `apostrophe ${JSON.stringify(apostrophe)} was not matched`,
      );
    }
  });

  it('identifies the tool being requested', () => {
    assert.equal(detectState({ lines: bashPermission }).prompt?.t, 'Bash');
  });

  it('picks the question, not the diff rendered between it and the options', () => {
    // Regression test. Claude Code puts context — a diff, a command, a path —
    // between the question and the option row. Taking the nearest lines above
    // the cursor therefore captures the diff and presents it as the question,
    // so the rider is asked to approve something whose wording never says what.
    const withDiff = [
      '╭──────────────────────────────────────────╮',
      '│ Do you want to make this edit to app.ts? │',
      '╰──────────────────────────────────────────╯',
      '',
      '  ~/project/src/app.ts',
      '    12  -  const timeout = 5000',
      '    12  +  const timeout = 30000',
      '',
      `${CURSOR} Yes    No`,
      '',
      '  Esc to cancel',
    ];

    const q = detectState({ lines: withDiff }).prompt?.q ?? '';
    assert.equal(q, 'Do you want to make this edit to app.ts?');
    assert.doesNotMatch(q, /timeout/, 'the diff leaked into the question');
  });

  it('picks the question when a command is shown as context', () => {
    const withCommand = [
      '  Bash command',
      '',
      '    npm run build',
      '',
      '│ Do you want to run this command?',
      '',
      `${CURSOR} Yes    No`,
      '',
      '  Esc to cancel',
    ];
    assert.equal(
      detectState({ lines: withCommand }).prompt?.q,
      'Do you want to run this command?',
    );
  });

  it('truncates a long question to the device budget', () => {
    const long = [
      `  Do you want to ${'x'.repeat(500)}?`,
      '',
      `${CURSOR} Yes    No`,
      '  Esc to cancel',
    ];
    const q = detectState({ lines: long }).prompt?.q ?? '';
    assert.ok(q.length <= 200, `question was ${q.length} chars`);
  });

  it('caps options at nine, the most a single digit can address', () => {
    const many = [
      '  Pick one?',
      `${CURSOR} ${Array.from({ length: 20 }, (_, i) => `Opt${i}`).join('    ')}`,
      '  Enter to select',
    ];
    assert.ok((detectState({ lines: many }).prompt?.o.length ?? 0) <= 9);
  });
});

describe('detectState — non-prompt states', () => {
  it('detects working from a spinner', () => {
    assert.equal(detectState({ lines: working }).state, 'working');
  });

  it('detects working from the interrupt affordance alone', () => {
    const r = detectState({ lines: ['  Running tests (esc to interrupt)'] });
    assert.equal(r.state, 'working');
  });

  it('detects idle from the input box', () => {
    assert.equal(detectState({ lines: idle }).state, 'idle');
  });

  it('detects no_session from a shell foreground command', () => {
    const r = detectState({ lines: shell, currentCommand: 'zsh' });
    assert.equal(r.state, 'no_session');
  });

  it('returns unknown for an empty pane with no command hint', () => {
    assert.equal(detectState({ lines: [] }).state, 'unknown');
  });

  it('returns unknown rather than guessing on unrecognised output', () => {
    const r = detectState({ lines: ['some', 'arbitrary', 'log output'] });
    assert.equal(r.state, 'unknown');
  });
});

describe('detectState — false positives', () => {
  it('does not treat a cursor without a footer hint as a prompt', () => {
    // Shell prompts and git logs contain ❯ routinely.
    const r = detectState({
      lines: [`${CURSOR} git log --oneline`, 'abc1234 fix thing'],
      currentCommand: 'zsh',
    });
    assert.notEqual(r.state, 'awaiting_permission');
    assert.notEqual(r.state, 'awaiting_input');
  });

  it('does not treat a footer hint without a cursor as a prompt', () => {
    const r = detectState({ lines: ['Some output', 'Esc to cancel'] });
    assert.notEqual(r.state, 'awaiting_permission');
  });

  it('classifies a non-permission selection as awaiting_input', () => {
    const r = detectState({
      lines: ['  Select a model', '', `${CURSOR} Opus    Sonnet`, '  Enter to select'],
    });
    assert.equal(r.state, 'awaiting_input');
  });
});

describe('detectState — write safety', () => {
  it('reports writeBlocked when the pane is in copy mode', () => {
    // Keys sent while tmux is in copy mode are consumed by tmux, not Claude.
    const r = detectState({ lines: permissionHorizontal, inMode: true });
    assert.equal(r.writeBlocked, true);
    // State detection still works; only writing is unsafe.
    assert.equal(r.state, 'awaiting_permission');
  });

  it('does not block writes in normal mode', () => {
    assert.equal(detectState({ lines: permissionHorizontal }).writeBlocked, false);
  });
});

describe('detectState — robustness', () => {
  it('never throws on adversarial input', () => {
    const nasty: string[][] = [
      [],
      [''],
      [CURSOR],
      [`${CURSOR}`, 'Esc to cancel'],
      [' '],
      [' '.repeat(1000)],
      Array.from({ length: 1000 }, () => 'x'.repeat(200)),
      ['🚀'.repeat(100)],
    ];
    for (const lines of nasty) {
      assert.doesNotThrow(() => detectState({ lines }), `threw on ${JSON.stringify(lines[0])}`);
    }
  });

  it('always returns a state from the known set', () => {
    const valid = new Set([
      'working',
      'idle',
      'awaiting_permission',
      'awaiting_input',
      'no_session',
      'unknown',
    ]);
    for (const lines of [permissionHorizontal, working, idle, shell, [], ['junk']]) {
      assert.ok(valid.has(detectState({ lines }).state));
    }
  });
});
