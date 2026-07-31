# ADR-0002: Bind every approval to a screen hash

**Status:** Accepted
**Date:** 2026-07-31

## Context

The rider reads a permission prompt on the Edge and presses a button. That
press travels over Bluetooth LE to the phone, over the internet to the bridge,
and into tmux. The round trip takes seconds, and on a poor Bluetooth link it
can take longer or be retried.

Claude Code does not wait. By the time the approval arrives, the pane may show
a different prompt entirely — the previous one having timed out, been answered
at the keyboard, or been superseded.

The naive implementation sends "press Enter". That lands on whatever is focused
at the moment it arrives:

```
t+0s   "Run `rm -rf build/`?"                  rider reads it
t+2s   rider presses Yes                        request departs
t+3s   Claude moves on, now asks something      screen has changed
       with different consequences
t+4s   the approval arrives                     answers the new prompt
```

This is not a rare interleaving. Multi-second latency against a UI that changes
on its own timescale makes it likely — and the failure is silent. The rider
believes they approved a build; something else was approved.

## Decision

Every session response carries `h`, a hash of the **visible** screen. When the
device acts, it sends that hash back as `expect`. The server re-captures the
pane, recomputes the hash, and refuses the write with `409 STALE_VIEW` if they
differ.

Three details make it work:

1. **The hash covers the visible screen only, never scrollback.** A shell
   `clear` scrolls rather than erases, so scrollback keeps changing for reasons
   the rider cannot see. Hashing it would invalidate approvals arbitrarily.

2. **`currentHash()` and `readSession()` must hash identically.** If they
   diverge, every approval fails as stale and the device cannot answer
   anything. They share a code path for this reason.

3. **A refused write releases its nonce.** The rider's second, correct attempt
   must not be deduplicated into replaying the failure.

The same hash doubles as an ETag, so unchanged content returns `304` with an
empty body — but that is a side benefit. The safety property is the point.

## Consequences

**Cost.** Every write needs an extra pane capture, so approvals are marginally
slower. Worth it.

**A visible failure mode.** A prompt that repaints between reading and pressing
— a spinner, a token counter — will reject the approval. The rider sees "the
screen changed, look again" and presses again. Annoying, but the alternative is
approving the wrong thing silently, and a rejected approval is recoverable in a
way a wrong one is not.

**`expect` is optional in the protocol.** Navigation actions that are safe to
land anywhere (scroll, refresh) omit it. Anything consequential must send it,
and the device always does for `select:N`.

**It does not defend against a compromised bridge.** The bridge computes both
hashes. This protects against races, not against an attacker who already
controls the server.

## Alternatives considered

**Sequence numbers instead of a hash.** Requires server-side per-prompt state
and does not detect a screen that changed and changed back. The hash needs no
state.

**A short server-side lock on the prompt.** Would block the keyboard user,
which is worse: the person at the machine should always win.

**Cryptographic hash.** This is a change detector, not a security boundary.
FNV-1a is cheap enough to run on every poll, and a collision costs one stale
frame corrected on the next tick.

## Revisit when

- Connect IQ gains a push mechanism that makes round trips sub-second, at which
  point the race narrows enough to reconsider.
- Claude Code exposes prompt identifiers, which would be a better binding than
  a screen hash.
