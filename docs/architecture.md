# Architecture

How the pieces fit together, and why they are arranged this way rather than
some other way.

## The constraint everything follows from

A Garmin Edge is not a small computer that happens to be on your handlebars. It
is a device with a specific and unusually restrictive networking model, and
almost every design decision here follows from it:

- **No internet of its own.** The Edge 540 has no WiFi. Every network request
  is proxied over Bluetooth LE by the Garmin Connect Mobile app on your phone.
- **HTTPS with a publicly trusted certificate, or nothing.** Plain HTTP and
  self-signed certificates fail with `SECURE_CONNECTION_REQUIRED (-1001)`
  before the request leaves the phone.
- **No sockets, no streaming.** `Communications.makeWebRequest` performs one
  request and hands back a parsed response. There is no WebSocket, no
  server-sent events, no long-lived connection.
- **Small, slow, and intermittent.** Responses that are too large fail with
  `NETWORK_RESPONSE_TOO_LARGE (-402)`. Round trips take seconds. The phone
  goes out of range regularly, and that is the normal case, not an error.
- **1 MB of memory** for the whole app, and a 246×322 screen with no monospace
  font.

So the shape of the system is fixed before any code is written: **the device
polls a server over HTTPS for small JSON snapshots.** Not a terminal emulator,
not a live stream. Everything below is a consequence of making that shape feel
immediate despite being neither.

## Components

```
packages/shared      the wire contract: Zod schemas, types, text helpers
packages/server      the bridge: reads tmux, detects state, serves JSON
edge-app             the Connect IQ app: renders, polls, sends actions
```

### packages/shared

The protocol definition, imported by both the server and (eventually) the PWA.

The Monkey C app cannot import TypeScript, so it re-implements parsing by hand
against [docs/api.md](api.md). That asymmetry is why the protocol is versioned
and why the response shapes are conservative: a change here is a change to
software already installed on someone's handlebars.

It also holds the text helpers — ANSI stripping, width-aware wrapping, content
hashing — because the server and the PWA must produce byte-identical output.
If they disagreed about how a line wraps, the two views would disagree about
line numbering, and a hash computed on one would not match the other.

### packages/server

Four layers, each with one job:

```
routes/      HTTP: validate, authorise, shape responses
services/    the actual work: tmux, detection, key mapping, replay protection
middleware/  the authentication gate
config.ts    validated settings; refuses to start on a bad configuration
```

The interesting part is `services/`:

- **`tmux.ts`** — every tmux invocation, and nothing else in the codebase
  shells out. Uses `execFile` with an argv array, never a shell string;
  validates targets against an allowlist regex; sends text with `-l --`.
- **`detect.ts`** — turns a captured pane into a state. Screen-scraping, with
  all the fragility that implies, which is why it matches on *structure*
  (selection cursor, footer hint, box frame) rather than on wording that
  changes between Claude Code releases.
- **`keymap.ts`** — the allowlist of everything a client may cause to be typed.
- **`session.ts`** — captures, detects, and shapes the device payload.
- **`nonce.ts`** — remembers recent writes so a Bluetooth retry does not act
  twice.

### edge-app

```
ClaudeEdgeApp.mc     entry point; reacts to settings changes
Config.mc            reads and validates user settings
BridgeClient.mc      HTTP, and translating Connect IQ error codes to sentences
TerminalView.mc      layout, rendering, polling
TerminalDelegate.mc  input, menus, sending actions
```

Layout is computed from `dc.getWidth()`/`getHeight()` and measured font metrics
rather than hardcoded, so one binary lays out correctly across a 3× range of
screen sizes. Input is written against Connect IQ *behaviours* rather than key
codes, so the same binary works on a 540 (seven buttons, no touch) and a 1040
(two buttons, touch).

## The two mechanisms that make it feel immediate

Polling a server for snapshots over a slow, intermittent link should feel
sluggish. Two things stop it.

### Adaptive polling

Every response carries `n`: how many seconds until the device should ask again.
The server chooses it from the current state — about 2 seconds when a prompt is
blocking, 3 while Claude is working, 15 when idle, 30 when there is no session.

Putting this decision on the server rather than in the device app means battery
policy can be retuned without anyone reflashing a device, and the server is the
side that actually knows whether anything is happening. The device clamps the
value it is given, so a buggy or hostile server cannot set an arbitrary polling
rate on hardware it does not own.

### Conditional responses

Each payload carries `h`, a hash of the visible screen. The device sends it
back as `?etag=`; if nothing changed, the reply is `304` with an empty body.

On an idle session — most of the time — a poll costs a few dozen bytes instead
of several kilobytes. Over BLE that is the single largest saving available.

## The hash is also a safety mechanism

The same `h` does a second job, and this one is not an optimisation.

When you approve something, the device sends the hash of the screen you were
looking at. The server re-reads the pane and refuses the write if it no longer
matches.

Without that, this sequence is not merely possible but likely:

```
t+0s   Claude asks: "Run `rm -rf build/`?"          you read it
t+2s   you press Yes                                 request starts over BLE
t+3s   Claude times out, moves on, asks something    different prompt now shown
       else entirely
t+4s   your approval arrives                         lands on the new prompt
```

A multi-second round trip means the screen you decided about and the screen
your decision arrives at are not reliably the same screen. The hash binding
turns that from a silent wrong approval into a `409 STALE_VIEW` and a "look
again" message. It is the single most important correctness property in the
system — see [ADR-0002](adr/0002-hash-bound-approvals.md).

## Detection: two captures, not one

State detection reads **only the visible screen**. Scrollback is captured
separately, for display.

This is not tidiness. A shell `clear` does not erase tmux's history buffer — it
scrolls the screen. An answered prompt therefore stays in the scrollback
indefinitely, and a detector fed that history keeps finding its cursor and
reporting a prompt that Claude Code moved past minutes ago. The device would go
on offering to answer it.

That bug existed, was caught by an integration test against real tmux, and is
now covered by a regression test. Mocked tmux would not have found it.

## Why screen-scraping at all

Claude Code has a hooks system that can POST structured events
(`Notification:permission_prompt`, `Stop`, `PermissionRequest`) to an HTTP
endpoint. Those events are richer than anything scraped from a screen: they
carry the tool name and its arguments.

They are not sufficient on their own:

- Hooks tell you a prompt *exists*. They do not tell you what is on screen,
  which is what you need to read before deciding.
- A dropped event leaves the device stuck on a stale state forever.
- If the bridge restarts it has no event history. Re-deriving state from the
  pane is self-healing; replaying missed hooks is not.

So the pane is the authority and hooks are an accelerant. Everything in
`detect.ts` degrades to `unknown` rather than guessing, because a wrong answer
means someone approves something they did not read.

## Request flow

A poll:

```
GET /api/v1/session?lines=14&width=40&etag=e56ee3eb
  │
  ├─ auth gate           unconditional, before body parsing
  ├─ rate limit          per token, not per IP (BLE means the IP is the phone's)
  ├─ session allowlist   unlisted names are indistinguishable from missing ones
  ├─ capture ×2          scrollback for display, visible screen for detection
  ├─ detect              structure first, wording only to enrich
  ├─ wrap + window       to the device's real character grid
  └─ 304 or 200          depending on the hash the device sent
```

An approval:

```
POST /api/v1/action  {action: "select:1", nonce: "...", expect: "e56ee3eb"}
  │
  ├─ auth gate           write scope required
  ├─ nonce               a repeat replays the original outcome, does not re-act
  ├─ pane state          refuse if dead, or in copy mode where keys are swallowed
  ├─ expectation         refuse if the screen has changed
  ├─ resolve             re-read the prompt; the client said *which option*,
  │                      the server decides which keys reach it
  └─ send                argv array, arrow keys chosen for the actual layout
```

The client never says "send Right, Right, Enter". It says "I mean the second
option", and the server works out what that takes given the layout currently on
screen. A client that guessed wrong about the layout would otherwise select a
different answer, silently.

## What is deliberately absent

- **No database.** State lives in tmux. The bridge is stateless apart from a
  bounded in-memory nonce store, so a restart loses nothing that matters.
- **No terminal emulator on the device.** No ANSI interpretation, no colour, no
  cursor addressing. There is not enough memory, screen, or bandwidth, and the
  useful information survives being reduced to text.
- **No WebSocket.** Connect IQ has no such API.
- **No user accounts.** One developer, one machine, one bearer token. Anything
  more would be scaffolding for a product this is not.

## Further reading

- [API reference](api.md) — the wire protocol in full
- [Security](security.md) — threat model and controls
- [Decision records](adr/) — why specific choices were made
