# Product brief

Captured 2026-07-31, as the project shifted from a personal tool to a hosted
product. This records the decisions and the open questions; it is not yet a
plan. Nothing here is built.

## What changed

The working system is a single-user bridge: one developer, one tmux session,
one bearer token, self-hosted. That still exists and still works.

The new intent is a **hosted product**:

- unlimited users, one account each
- a web app for managing accounts and credentials
- voice input from the phone, transcribed by Whisper
- billing on transcription (OpenAI's cost plus a margin)
- self-hosting stays free and unrestricted

## Requirements as stated

### Users and accounts

- Unlimited signups, one account per person.
- Users connect their **own** machine — a home computer, a VPS, wherever their
  tmux session lives. We never run their Claude Code.
- Users may already reach their session through something like Termius. Ours
  must coexist with that, not replace it.

### Voice input

- Speak into the phone, transcribe, send the text to the tmux session.
- Two tiers:
  - **Free**: no transcription. Type on the phone, or use the Edge's buttons or
    touchscreen.
  - **Paid**: OpenAI Whisper, billed as their cost plus our margin.

### Billing — an explicit constraint

> "nunca mas nunca podemos divulgar o uso nem a comissão"
> (never disclose usage or the margin)

Users must not be shown minutes consumed, per-request cost, or anything from
which the margin is derivable. This is a hard product constraint and it shapes
the billing design — see the open question below, because it also collides with
consumer-protection law in the EU.

### Credentials

- Each user supplies their own OpenAI key.
- Stated preference: it lives on the user's phone, not readable by us.
- Also stated: unresolved, to be worked through.

### Devices

Support **every** Garmin Edge that can run a device app.

Audited against the SDK, twenty Edge models exist:

| | Models | Status |
|---|---|---|
| Currently supported | 540, 550, 530, MTB, 840, 850, 830, 1040, 1050, 1030, 1030 Plus, Explore 2 | 12 |
| Can be added | 520 Plus, 820, Explore, 1000, 1030 Bontrager | 5 |
| Constrained | 520 — 256 KB rather than 1 MB | 1 |
| **Cannot** be supported | 130, 130 Plus — `watchApp` memory is 0; the hardware runs data fields only | 2 |

So "every Edge" is **18 of 20**. The two exceptions are a hardware limit, not a
decision.

### Also requested

- Marketing site with strong SEO
- Login
- "The best licence"

## Architecture as understood

```
   user's phone                     our infrastructure          user's machine
┌────────────────┐              ┌──────────────────────┐    ┌──────────────────┐
│  PWA           │──── HTTPS ──►│  web app             │    │  tmux            │
│  voice, typing │              │  accounts, billing   │    │  Claude Code     │
└───────┬────────┘              │  Whisper relay       │    │  bridge agent    │
        │ BLE                   └──────────┬───────────┘    └────────┬─────────┘
        ▼                                  │                         │
┌────────────────┐                         └────── ??? ──────────────┘
│  Garmin Edge   │                              unresolved
└────────────────┘
```

The Edge reaches the internet through Garmin Connect Mobile on the phone. That
part is solved and working.

**What is not solved: how our servers reach the user's machine.**

## Open questions

These are genuinely open. Each has to be answered before anything is built.

### 1. Connectivity — the hard one

The user's tmux session is on a home machine or VPS, behind NAT, with no
inbound access. Options:

- **We host a relay; the user's machine dials out.** An agent on their machine
  opens a persistent outbound connection to us. Works behind any NAT, but means
  **their terminal traffic passes through our servers** — which is in direct
  tension with "100% private".
- **The user exposes their own endpoint** (Tailscale Funnel, Cloudflare Tunnel).
  Nothing of theirs touches us. But every user has to set that up, which is a
  real barrier for a paid product.
- **Both**, with the relay as the default and self-hosting documented.

This choice determines the trust model, the privacy claim, and the cost per
user. It is the first thing to settle.

### 2. Where the OpenAI key lives

Stated preference is the phone only. But:

- If the key never reaches our servers, the phone must call OpenAI directly —
  and then **we cannot bill for it**, because we never see the request.
- If we relay, we hold the key (encrypted) and can bill — but we can read it.

These are mutually exclusive. Billing on transcription requires being in the
path.

### 3. Not disclosing usage — a legal problem

"Never disclose usage or the margin" needs care in the EU. The Consumer Rights
Directive requires the total price, or how it is calculated, to be given before
purchase. A subscription with an undisclosed usage cap may be an unfair term.

The workable shape is probably a **flat subscription with fair-use limits** —
the user sees a price and a plan, not minutes and not our cost. That satisfies
the intent (margin stays private) without the legal exposure of billing against
a figure the customer cannot see.

Worth confirming with a lawyer before launch, not after.

### 4. Multi-tenant security

A relay carrying many users' terminal traffic is a materially different threat
model from a single-user bridge. One bug crossing tenants exposes another
person's terminal — with their credentials in it. This needs its own design
pass, not an extension of the current one.

## Licence

Requested: "the best licence".

There is no single best; it depends on intent. Given a hosted product plus a
free self-hosted version:

| | Effect | Fit |
|---|---|---|
| **MIT** (current) | Anyone may do anything, including host a competitor | Maximum adoption, no protection |
| **AGPL-3.0** | Anyone hosting a modified version must publish their changes | Open source, but a competitor cannot take it closed |
| **Elastic 2.0 / BSL** | Source available; hosting it as a service is prohibited | Strongest protection, **not** open source |

**AGPL-3.0 is the recommendation.** It is genuinely open source — OSI-approved,
so the project keeps that standing — while removing the incentive for someone
to host a closed fork. It is what Grafana, MongoDB (before SSPL) and Mastodon
use for the same reason.

The one caveat: some companies forbid AGPL software internally, which would
limit corporate self-hosting.

## Scope

None of the above is built. What exists is the single-user bridge: 130 server
tests, 11 device tests, 12 Edge models building clean, working end to end
against a live Claude Code session.

The product described here is a significantly larger undertaking than what
exists — multi-tenancy, billing, a relay, a marketing site, accounts, and a
mobile client. It should be planned as such, in phases, starting with the
connectivity question.
