# ADR-0003: Action names on the wire, never keystrokes

**Status:** Accepted
**Date:** 2026-07-31

## Context

The bridge types into a terminal running Claude Code — an agent that can edit
files, run shell commands, and reach the network. Whatever the wire protocol
allows a client to send, it allows anyone holding the bearer token to send.

The obvious design is a passthrough:

```json
POST /api/v1/send-keys  {"keys": "C-c"}
```

It is simple, flexible, and needs no changes as Claude Code's UI evolves. It is
also an interactive shell for anyone who obtains the token — shoulder-surfed
off a handlebar, pulled from a phone backup, leaked in a proxy log.

The prior art is unambiguous. `ttyd` ≤ 1.3.0 carried a critical unauthenticated
RCE (NCC Group, 2017) because request *content* could steer what got executed.
Every serious tmux-over-HTTP project in this space carries a "do not expose
this" warning.

## Decision

The wire protocol carries an **action name**. The server maps it to a fixed key
sequence defined in `packages/server/src/services/keymap.ts`. There is no
endpoint that accepts a keystroke.

```json
POST /api/v1/action  {"action": "select:1", "nonce": "...", "expect": "e56ee3eb"}
```

Two kinds of action exist:

**Fixed actions** — `up`, `down`, `enter`, `escape`, `interrupt`, `continue`,
and so on. Each maps to a constant key sequence in a frozen table.

**Positional selections** — `select:N` answers the prompt currently on screen
by option index. The client says *which option it means*; the server re-reads
the prompt and works out which keys reach it.

That second form matters more than it looks. Claude Code renders options either
horizontally (`❯ Yes  Yes All  No`) or as a vertical list, and the arrow key
that moves the cursor differs. A client that guessed the layout wrong would
select a different option — silently, with no error. Resolving position on the
server, against the pane as it exists at the moment of the write, removes that
class of bug entirely.

Free text exists as a separate route, disabled by default, delivered with
`send-keys -l --` so tmux performs no key-name lookup.

## Consequences

**The reachable state space is finite and auditable.** Everything a client can
cause to be typed is visible in one file and reviewable in a diff. Adding a
capability is a code change, not a request parameter.

**Adding an action requires a release.** Deliberate. The friction is the
feature.

**The allowlist must track Claude Code's UI.** If a future version adds a
prompt shape the detector does not recognise, the device shows the raw screen
and the rider can still send navigation keys — degraded, not broken.

**Destructive actions are gated twice.** `sigint`, and any option matching
"don't ask again" / "yes to all", are refused unless `ALLOW_DESTRUCTIVE=true`.
The device also asks for a second press. Permanently widening an agent's
permissions is not a decision to make one-handed at speed.

**Read and write take different tokens.** A device that only displays state can
hold a credential that cannot type.

## Alternatives considered

**Passthrough with a denylist.** Denylists fail open. Every character not
thought of is permitted, and terminals have many ways to express the same
thing.

**Passthrough behind a second confirmation.** Moves the decision to a 246-pixel
screen at 30 km/h. The wrong place for it.

**Client-side option resolution** — the device computes the arrow keys and
sends them. Requires the client to know the layout, which it can only infer
from a snapshot that may already be stale.

## Revisit when

- Claude Code exposes a supported programmatic approval API, making key
  injection unnecessary.
- The action table grows large enough to need structure, at which point group
  it by capability rather than relaxing the model.
