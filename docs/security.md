# Security

## What this thing actually is

Strip away the cycling computer and the bridge is this: **a network service
that types into a terminal running an AI agent with file and shell access.**

Anyone who can send it an accepted request can influence what an agent with
your permissions does on your machine. Treat the bearer token as equivalent to
shell access, because in the worst case that is what it is.

Everything below exists because of that sentence.

## Threat model

### In scope

| Threat | Control |
|---|---|
| Token leaks (shoulder-surfed, phone backup, proxy log) | Action allowlist bounds what a token can do; read/write separation; rate limits |
| Approval lands on the wrong prompt | Hash-bound approvals ([ADR-0002](adr/0002-hash-bound-approvals.md)) |
| Retry over flaky Bluetooth acts twice | Nonce replay protection |
| Command injection through session names | argv-only invocation, allowlist regex on every target |
| Key-name injection through free text | `send-keys -l --` disables key lookup |
| Reaching tmux sessions other than the intended one | Dedicated tmux socket; session allowlist |
| Authentication bypass | Single unconditional gate before body parsing |
| Permission escalation via "don't ask again" | Refused unless explicitly enabled |

### Out of scope

- **A compromised bridge host.** If someone has code execution on the machine
  running the bridge, they already have what the bridge could give them.
- **A compromised phone.** The phone is in the network path by construction.
- **Claude Code's own permission model.** This bridge is a convenience layer
  over it, not a replacement. Configure `permissions.deny` so that even a fully
  compromised bridge cannot authorise the worst outcomes.
- **Multi-tenancy.** One developer, one machine. Not built for shared use.

## The controls, and what each prevents

### 1. Authentication is one unconditional gate

Registered as an `onRequest` hook — the earliest Fastify lifecycle stage —
before routing and before body parsing.

```
request → auth gate → rate limit → route → handler
```

A missing credential is a **rejection**, never a skip. There is no branch that
lets an absent token proceed.

This shape is not arbitrary. `ttyd` ≤ 1.3.0 shipped a critical unauthenticated
RCE (NCC Group, 2017) because its token check ran only when the request body
contained a token field — omit the field and the client was treated as
authenticated. The lesson generalises: **authentication must never be
conditional on request content.**

Also:

- Tokens are compared as SHA-256 digests with `timingSafeEqual`.
- Only the `Authorization` header is accepted. Query parameters are rejected
  even when correct, because they land in proxy logs and browser history.
- Unknown routes require authentication too, so a 404 cannot be used to
  enumerate endpoints.

### 2. Read and write are separate credentials

`READ_TOKEN` reads state. `WRITE_TOKEN` sends actions. A write token also
grants read; a read token on a write route gets `403`.

If you carry a token on a device you might lose, carry the read token.

### 3. The wire protocol carries names, not keystrokes

There is no endpoint that accepts a key sequence. Clients send an action id
resolved against a table in `services/keymap.ts`. See
[ADR-0003](adr/0003-action-allowlist.md).

Consequences worth stating plainly:

- Everything a client can cause to be typed is visible in one file.
- Adding a capability is a code change, reviewable in a diff.
- A leaked token grants exactly the actions in that table, no more.

### 4. Approvals are bound to the screen you saw

Every response carries a hash of the visible pane. Acting sends it back; the
server refuses with `409 STALE_VIEW` if the screen has changed.

Without this, a multi-second Bluetooth round trip means the prompt you read and
the prompt your answer reaches are not reliably the same one. See
[ADR-0002](adr/0002-hash-bound-approvals.md).

### 5. Destructive actions are off by default

Refused unless `ALLOW_DESTRUCTIVE=true`:

- `sigint` (Ctrl-C) — can terminate the session
- any option matching "don't ask again", "yes to all", "always allow"

The second category is the important one. Accepting it widens the agent's
permissions for the **rest of the session** — every subsequent tool call of
that kind proceeds without asking. That is a consequential decision, and a
246-pixel screen at 30 km/h is the wrong place to make it.

The device asks for a second press as well, but the server is the boundary that
holds.

### 6. Free text is off by default

`POST /api/v1/text` returns `403` unless `ALLOW_FREE_TEXT=true`.

Free text into a running agent is, by construction, arbitrary instruction to a
system with file and shell access. When enabled:

- Control characters are stripped, so no escape sequences.
- Delivered with `send-keys -l --`, so tmux performs no key-name lookup and the
  string `Enter` arrives as five characters rather than a keypress.
- Capped at 2000 characters.
- Typing and submitting are separate calls, so a half-delivered prompt never
  fires on its own.

### 7. No shell, ever

Every tmux invocation uses `execFile` with an argv array. No code path builds a
command string, so no input can be interpreted as shell syntax.

Targets are additionally validated against `^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`:

- `:` and `.` are excluded because **tmux** gives them meaning inside a target,
  so a name harmless to the shell could still redirect a write to another pane.
- A leading `-` is excluded because it could be read as a flag in any argv
  position preceding `--`.

### 8. Containment through a dedicated tmux socket

Run Claude Code on its own socket:

```bash
tmux -L claude-edge new-session -s claude
```

Set `TMUX_SOCKET=claude-edge`. The bridge is then **structurally unable** to
reach your other tmux sessions, whatever the code does. This is a boundary, not
a convention — the strongest control in this document, and the cheapest.

`ALLOWED_SESSIONS` narrows it further. A session outside the list is
indistinguishable from one that does not exist, so the response leaks nothing.

### 9. Rate limiting per token

Keyed on the presented credential rather than the IP, because every request
arrives via the phone and shares NAT with strangers. Bounds what one leaked
token can do.

Defaults: 60 reads/min, 20 writes/min. A rider needs a handful of taps;
anything more is a bug or an attack.

### 10. Every write is logged

```json
{"action":"select:1","session":"claude","expect":"e56ee3eb","resultHash":"a1b2c3d4"}
```

What was sent, against which screen, and what the screen became. If something
is approved that should not have been, this is the record that makes it
reconstructable. Authorization headers are redacted at the logger.

## Deployment guidance

### Do

- **Put it on a private network.** Tailscale or WireGuard, so the bridge has no
  public listener at all. Tailscale Funnel or a `*.ts.net` certificate
  satisfies Connect IQ's public-CA requirement while keeping it off the open
  internet. This is the single best thing you can do.
- **Use a dedicated tmux socket.**
- **Set both tokens**, distinct, at least 32 characters from a CSPRNG.
- **Configure Claude Code's own `permissions.deny`** so the worst outcomes are
  unreachable regardless of what the bridge allows.
- **Bind to loopback** and terminate TLS in front. This is the default.

### Do not

- Expose it on `0.0.0.0` without a proxy and a firewall.
- Reuse one token for read and write.
- Enable `ALLOW_DESTRUCTIVE` or `ALLOW_FREE_TEXT` without deciding you want
  them.
- Run the bridge as root. The container runs as uid 10001.
- Put the token in a query string, a shell history, or a commit.

## If a token leaks

1. Rotate `READ_TOKEN` and `WRITE_TOKEN` in `.env`; restart the bridge. All
   existing tokens become invalid immediately.
2. Read the write log — every action taken is there with its timestamp.
3. Check the session for anything approved that you did not approve.
4. Update the token in the Garmin Connect Mobile app settings.

## Reporting a vulnerability

Open a GitHub security advisory rather than a public issue.

## Known limitations

- **Detection is heuristic.** A prompt shape the parser does not recognise
  renders as `unknown` with the raw screen shown. Degraded, not dangerous — but
  it means the parsed options are not a guarantee.
- **The pane is partly attacker-influenced.** Claude Code renders file contents
  and tool output; a malicious repository could in principle render text that
  looks like a prompt. The hash binding limits the damage — an approval only
  ever reaches the screen it was made against — but it is a real consideration.
- **No audit trail of what Claude did**, only of what the bridge sent. Claude
  Code's own transcript is the record for the former.
