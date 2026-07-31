# Connectivity

How our servers reach a tmux session on a machine we do not control, behind a
router we cannot configure.

This is the first decision because everything else depends on it: the privacy
claim, the cost per user, the support burden, and the threat model.

## The problem

The user's Claude Code session runs at home or on their own VPS. A home machine
sits behind NAT with no inbound ports. We cannot connect *to* it.

Three ways out.

### A. The user exposes an endpoint

Tailscale Funnel, Cloudflare Tunnel, or a port forward. Nothing of theirs
touches our infrastructure.

Genuinely the most private option, and it is what the self-hosted version
already does. But as the default for a paid product it fails: every customer
must install and configure a second tool before anything works, and the support
load for "my tunnel stopped" would exceed the product.

### B. Their machine dials out to our relay

A small agent on the user's machine opens a persistent outbound connection to
us. Outbound works from behind any NAT without configuration — the same
mechanism ngrok, Tailscale's own coordination server, and every VPN client use.

Zero configuration. The cost is that their terminal traffic transits our
servers.

### C. Both

Relay by default; self-hosting documented and unrestricted.

## Decision

**B, with C as the documented alternative, and end-to-end encryption so that B
does not require trusting us.**

The relay makes the product usable. The encryption makes it honest.

## How a relay stays private

The objection to a relay is the right one: "your terminal content passes
through their servers." The answer is that it passes through as ciphertext we
cannot read.

```
user's machine                    our relay                    user's phone
──────────────                    ─────────                    ────────────
capture pane
     │
encrypt with Ks  ─────────────►  store/forward  ─────────────►  decrypt with Ks
                                  (opaque bytes)                     │
                                                                  render
```

`Ks` is a session key derived from a passphrase the user sets when pairing a
device. It is derived independently on the machine and on the phone; it is
never transmitted, and we never hold it.

What we can see:

| | Visible to us |
|---|---|
| Terminal content | **No** — ciphertext |
| Prompt text and options | **No** |
| What was approved | **No** |
| Which account, and when | Yes |
| Byte counts and timing | Yes |
| Whether a session is connected | Yes |

That is metadata, and it is unavoidable for any relay. It should be stated
plainly in the privacy policy rather than glossed.

### The Edge complication

The Edge cannot do this. Connect IQ has no cryptographic primitives worth the
name, 1 MB of memory, and no way to hold a derived key securely.

So the Edge is a **degraded-privacy client by necessity**, and the honest
options are:

1. **Phone as decryption proxy.** The phone holds `Ks`, decrypts, and re-serves
   plaintext to the Edge over the local BLE link. End-to-end preserved; the
   Edge only ever sees what the phone already decrypted. Requires the PWA to be
   running, which it must be anyway for the Edge to have network at all.
2. **Server-side decryption for Edge sessions only,** with the user told
   explicitly that enabling Edge access means we can read that session.

**Option 1 is the design.** It is more work and it is the only one that keeps
the claim true. Garmin Connect Mobile is already in the path, so requiring the
PWA alongside it is not a new constraint.

## Transport

Server-Sent Events for the downstream, ordinary HTTPS POSTs for the upstream.

Not WebSockets, despite being the obvious choice, for three reasons:

- The Edge cannot use them regardless — Connect IQ has no WebSocket API — so
  the polling path has to exist anyway.
- SSE reconnects on its own, and a home connection drops routinely.
- SSE is a plain HTTP response, so it passes proxies and corporate networks
  that mangle upgrade requests.

The agent holds one SSE stream for commands and POSTs pane updates. The phone
does the same in reverse.

## The agent

A single binary on the user's machine, doing exactly what the current bridge
does plus the relay connection:

```bash
curl -fsSL https://claude-edge.dev/install.sh | sh
claude-edge login          # device-code flow, no password typed into a terminal
claude-edge run --session claude
```

It must be small, auditable, and identical to the open-source code — people are
being asked to run it next to a terminal that has their credentials in it. It
is the same source as the self-hosted bridge, with a relay transport added.

## What this costs us

Bandwidth is the only variable cost, and it is small: a session update is under
1 KB, an idle session sends almost nothing thanks to the existing hash
short-circuit, and the busiest realistic user generates a few MB a day.

Relay capacity is dominated by held connections rather than throughput. SSE
connections are cheap; a single modest instance holds thousands.

## Failure modes

| | Behaviour |
|---|---|
| Agent offline | Phone and Edge show last-known state with its age |
| Relay down | Same; the agent retries with backoff |
| Phone out of BLE range | Edge shows last-known state — already handled today |
| Two agents claiming one session | Last writer wins, earlier one is told to stop |

None of these should lose data, because the pane is the source of truth and is
re-read on every reconnect.

## Open questions

- **Key rotation.** Changing the passphrase must re-key both ends without a
  window where one can read and the other cannot.
- **Multiple sessions per account.** One relay connection multiplexed, or one
  per session?
- **Agent auto-update.** Necessary for security fixes, and a supply-chain risk
  in itself. Signed releases, and probably opt-in.
