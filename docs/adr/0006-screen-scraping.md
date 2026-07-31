# ADR-0006: Screen-scraping as the authority, hooks as an accelerant

**Status:** Accepted
**Date:** 2026-07-31

## Context

The bridge must know what Claude Code is doing: working, idle, or blocked on a
prompt — and if blocked, what the prompt says and what the options are.

Two sources exist.

**Hooks.** Claude Code can POST structured events to an HTTP endpoint:
`Notification:permission_prompt`, `PermissionRequest`, `Stop`. These carry the
tool name and its arguments — far richer than anything scraped from a screen,
and they arrive without polling.

**The pane.** `tmux capture-pane` returns what is on screen. Parsing it is
screen-scraping, with everything that implies: it breaks when the UI changes,
and it has no schema.

Hooks look strictly better. They are not.

## Decision

**The pane is the authority. Hooks are an accelerant.**

State is always derived from the pane. Hooks (planned, see the roadmap) will
only reduce the delay between something happening and the bridge noticing.

Three reasons the pane has to be authoritative:

1. **Hooks tell you a prompt exists; they do not tell you what is rendered.**
   The rider needs to read the actual question before answering. Only the pane
   has it.

2. **A dropped event is unrecoverable.** Hook delivery has known reliability
   gaps. Miss one and the device shows a stale state indefinitely, with nothing
   to correct it. Polling the pane is self-healing: every poll re-derives the
   truth from scratch.

3. **A restarted bridge has no event history.** Re-reading the pane works
   immediately; replaying missed hooks is not possible.

### Matching on structure, not wording

Claude Code's prompt copy changes between releases. A detector keyed to exact
sentences is a maintenance treadmill that fails *silently* on upgrade — the
worst failure mode available, because the device goes on looking fine.

So detection keys on structural invariants:

- the selection cursor Ink renders (`❯` or `›`)
- a keyboard-hint footer ("Esc to cancel", "Enter to select")
- the box-drawing frame around the prompt

Both a cursor and a footer are required. A cursor alone appears in shell
prompts and git logs; a footer alone appears in transient banners.

Wording is used only to *enrich* a match structure has already established: to
decide whether a prompt is a permission request rather than a plan review, and
to flag options that grant lasting capability.

### Failing to `unknown`

Every path that cannot conclude returns `unknown` and renders the raw screen.
Never a guess. A wrong state means the rider approves something they did not
read, and there is no recovery from that.

## Consequences

**Detection will break eventually.** When Claude Code changes its prompt UI,
the structural signals are the last thing to change — but they can. The failure
mode is `unknown` plus a raw screen: degraded, still usable, obviously wrong
rather than subtly wrong.

**Two captures per poll, not one.** State comes from the visible screen only;
scrollback is captured separately for display. This is not tidiness: a shell
`clear` scrolls rather than erases, so an answered prompt stays in the history
buffer and a detector fed that history keeps reporting it. That bug existed and
is now covered by a regression test.

**Typographic normalisation is required.** Claude Code renders curly
apostrophes. `don't` and `don’t` are different strings, and a missed match on
the destructive-label list means a permanent permission grant is presented as
an ordinary choice. Also a real bug, also caught by a test.

**Testing needs a real tmux.** Fixtures reproduce the structure, and the
integration tests drive an actual pane. A mocked tmux would have confirmed both
bugs above as working.

## Alternatives considered

**Hooks only.** Cannot render the prompt, cannot recover from a dropped event
or a restart.

**Parsing Claude Code's JSONL transcript.** Records what happened, not what is
on screen, and the format is not a public interface.

**Asking Claude Code directly.** No such API for an interactive session.

## Revisit when

- Claude Code exposes a supported way to query the current prompt, which would
  replace the parser outright.
- The hooks system gains delivery guarantees strong enough to be authoritative
  — though the "what is rendered" problem would remain.
