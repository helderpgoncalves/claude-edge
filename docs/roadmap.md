# Roadmap

What exists, what is planned, and what was considered and deliberately left
out. The last section is the useful one — a roadmap that only lists ambitions
tells you nothing about the shape of the thing.

## The idea

Claude Code often works for minutes at a stretch, then stops and waits for a
one-word answer. If you are away from the keyboard, that pause costs you the
whole gap until you next look at a screen. On a two-hour ride, a permission
prompt asked at minute five wastes an hour and fifty-five minutes.

## Two modes

The product has grown a second half. Both come from the same observation — the
Edge is already on the handlebars and almost nothing is built for it — but they
sell to different people and only one of them exists.

| | | |
|---|---|---|
| **Dev** | Train without stopping work | Built, working |
| **Coach** | Real-time effort analysis, spoken into your headphones | [Designed](saas/coach.md), not built |

Dev is everything below. Coach is a separate design document, and the two
things worth knowing about it here are that it needs
[a native app](adr/0007-native-app-for-audio.md) — because a web page cannot
speak without being asked first — and that it is sequenced after the relay
rather than before it.

The Edge is already on the handlebars, already paired to the phone, already
being glanced at every few minutes. It is the right screen for this and the
wrong screen for almost everything else — which is the design constraint, not a
limitation to work around. The app answers two questions well and refuses to
try for a third:

1. **Is it waiting for me?** Header colour, at a glance, plus one vibration.
2. **What is it asking?** The question and its options, parsed and legible.

And it offers exactly one action: answer the thing. Writing prompts, reading
long output, reviewing diffs — those belong on a phone or a laptop, and
[the PWA](#phase-2--the-phone) is where they go.

## Shipped

**Phase 0 — foundations.** Toolchain, wire protocol, and the safety properties
the rest depends on.

- Bridge server: tmux capture, Claude Code state detection, HTTPS API
- Connect IQ app for 12 Edge models, 115–122 KB against a 1 MB budget
- Hash-bound approvals ([ADR-0002](adr/0002-hash-bound-approvals.md)) — the
  property that stops an approval landing on the wrong prompt
- Server-side action allowlist ([ADR-0003](adr/0003-action-allowlist.md)) — the
  wire protocol carries names, never keystrokes
- Adaptive polling, configurable per device
- Docker: dev stack with hot reload, production stack with automatic TLS
- 127 tests, including integration against a real tmux server

## Planned

### Phase 1 — the ride

Making the device side genuinely good at the two questions above.

- **Bitmap monospace font.** Connect IQ ships no monospace font and
  `getVectorFont()` does not exist on any Edge, so terminal output currently
  renders in a proportional font and columns do not line up. A BMFont built at
  each device's exact size, 1-bit and glyph-filtered to keep it small, fixes
  diffs and tree output. This is the single largest legibility improvement
  available.
- **Pane resizing.** Tell tmux the device's real character grid so it wraps the
  output itself, exactly as it would for a terminal of that size. Turns the
  Edge from a reflowed approximation into a faithful mirror. Only safe when no
  human is attached to the same session, so it needs a guard.
- **Glance view.** Session state in the Edge's glance carousel, without opening
  the app.
- **Claude Code hooks.** Accept `Notification:permission_prompt` and `Stop` on
  a `/api/v1/hook` endpoint, to cut the delay between a prompt appearing and
  the device knowing. The pane stays the authority; hooks only make it faster.

### Phase 2 — the phone

The Edge cannot do text entry, and pretending otherwise would make it worse at
what it is good at. The PWA is where the keyboard lives.

- **Installable PWA**, no app store, no cost, sharing the bridge and the wire
  contract with the server so the two cannot drift.
- Full scrollback with search
- Free-text prompts on a real keyboard
- Push notifications when a session blocks

### Phase 3 — more than one session

- Multiple tmux sessions with a switcher on the device
- Per-session tokens, so a token scoped to one project cannot reach another
- Session list in the glance view

### Phase 4 — distribution

- Connect IQ store submission, so installing does not require a USB cable
- Signed release binaries in GitHub releases
- Published container images

## Considered and rejected

The reasoning matters more than the conclusion; if a premise changes, revisit.

**A real terminal emulator on the device.** ANSI parsing, colour, cursor
addressing. Rejected on three independent grounds: no memory budget for a VT
state machine, no monospace font to render it into, and no bandwidth to stream
cell-level updates over BLE. The information that matters survives reduction to
text — and reduction is what makes it readable on a 246-pixel screen at speed.

**WebSocket or SSE streaming.** Connect IQ has no such API. `makeWebRequest` is
one request, one parsed response. Not a trade-off; simply unavailable.

**A companion phone app for Bluetooth.** Would require a native iOS and Android
app, an App Store presence, and a developer account. Unnecessary *for this*:
Connect IQ already proxies HTTP through Garmin Connect Mobile, which every
Garmin owner has installed, so building one adds cost and maintenance for
capability that already exists.

Still true for Dev mode. **No longer true for the product as a whole** — Coach
mode needs to speak without the rider touching anything, which the web platform
does not permit, so a native app is now planned for that reason and only that
reason. The premise that changed is documented in
[ADR-0007](adr/0007-native-app-for-audio.md); this entry is left in place
because the reasoning was correct when written and the distinction between
"unnecessary for Bluetooth" and "necessary for audio" is the useful part.

**Arbitrary key passthrough** (`POST /send-keys {"keys": "..."}`). This is the
decision the whole security model turns on. The bridge types into a terminal
running an agent with file and shell access; a passthrough endpoint would make
a leaked bearer token equivalent to an interactive shell. The published
remote-terminal tools that got this wrong have the CVEs to show for it. The
protocol carries action *names* resolved against a server-side allowlist, and
adding a capability is a code change rather than a request parameter.

**"Yes, and don't ask again" enabled by default.** It permanently widens the
agent's permissions for the rest of the session — genuinely consequential, and
not a decision to make one-handed at 30 km/h on a screen the size of a
matchbox. It is refused unless the operator sets `ALLOW_DESTRUCTIVE=true`,
which is a deliberate act with a documented rationale attached.

**Free text from the Edge.** Seven buttons and no keyboard. Any text-entry
scheme on that hardware would be slow enough to be dangerous while riding, and
free text into a running agent is arbitrary instruction to a system with shell
access. It belongs on the phone.

**Storing session history server-side.** tmux already is the history. A
database would add an operational dependency to a tool whose appeal is being a
single process next to tmux, and would create a durable copy of terminal
contents that may include secrets.

**Multiple users, accounts, roles.** This is one developer watching one
machine. Bearer tokens with read and write scopes cover it. Anything more is
scaffolding for a product this is not.

## Non-goals

- Not a general remote-terminal tool. Use `ttyd`, `mosh`, or Tailscale SSH.
- Not a Claude Code client. It watches a session someone else started.
- Not multi-tenant, and not built to be exposed to the open internet without a
  private network or tunnel in front of it.

## Contributing to the roadmap

Open an issue describing the problem before the solution. The most useful
contributions right now are the bitmap font (Phase 1) and testing on Edge
models other than the 540 — the code builds for all twelve, but only the 540
has been used on an actual ride.
