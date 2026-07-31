# ADR-0001: Poll for snapshots rather than stream

**Status:** Accepted
**Date:** 2026-07-31

## Context

The obvious way to mirror a terminal is to stream it: `tmux pipe-pane` into a
WebSocket, render cell updates as they arrive. That is what `ttyd`, `gotty`,
and `wetty` do, and it is why they feel like a terminal.

None of it is available on a Garmin Edge.

Connect IQ offers `Communications.makeWebRequest`: one request, one parsed
response, no persistent connection. There is no WebSocket API, no server-sent
events, no raw socket. On an Edge 540 every request is also proxied over
Bluetooth LE by the phone, so round trips take seconds and oversized responses
fail outright with `NETWORK_RESPONSE_TOO_LARGE (-402)`.

## Decision

The device polls for **semantic snapshots**: a small JSON object carrying the
visible lines, the detected state, and any pending prompt — not a byte stream,
and not cell-level updates.

Two mechanisms keep it from feeling like polling:

**Server-chosen cadence.** Every response carries `n`, the seconds to wait
before asking again: ~2 while a prompt blocks, 3 while Claude works, 15 idle,
30 with no session. The server knows whether anything is happening; the device
does not. Putting the choice server-side also means battery policy can be
retuned without reflashing anyone's device. The device clamps what it is given,
so a buggy server cannot drain hardware it does not own.

**Conditional responses.** Each payload carries a hash of the visible screen.
The device sends it back as `?etag=`; unchanged content returns `304` with an
empty body. An idle session costs a few dozen bytes per poll instead of several
kilobytes — the largest single saving available over BLE.

## Consequences

**Latency is bounded by the poll interval,** roughly 2 seconds when it matters.
For "Claude is waiting on you" that is imperceptible. For watching text scroll
by it is not, and this app does not try to be good at that.

**Payloads stay small** because the server truncates to the device's actual
grid. A typical response is under 1 KB.

**The device is stateless between polls.** No reconnection logic, no missed-
message handling, no resynchronisation. Losing a poll costs one frame.

**Intermittent connectivity is the normal case, not an error.** The phone goes
out of Bluetooth range routinely mid-ride. A polling client resumes on the next
tick; a streaming client would need reconnection and gap-filling.

**The device cannot show a live spinner.** State is a label and a colour, not
animation.

## Alternatives considered

**Long-polling.** Would cut latency, but Connect IQ's request timeout is not
documented and is shorter than a useful hold. Holding a BLE request open also
occupies a slot in a queue that is platform-capped, risking
`BLE_QUEUE_FULL (-101)`.

**Background service polling.** Connect IQ's `registerForTemporalEvent` allows
at most one wake every five minutes, in 32 KB of memory. Fine for a "you have a
prompt" notification, useless for a live view. Listed on the roadmap for
exactly that narrow use.

**Streaming to the phone, phone pushes to the Edge.** Requires a native
companion app on both platforms, and Connect IQ still needs Garmin Connect
Mobile in the path. Large cost for capability that already exists.

## Revisit when

- Connect IQ gains a push or streaming API.
- An Edge with WiFi becomes the primary target, removing the BLE bottleneck —
  though the absence of a streaming API would still bind.
