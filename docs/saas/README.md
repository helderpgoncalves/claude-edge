# The hosted product

Design documents for turning the single-user bridge into a hosted service.
**Nothing here is built.** These exist to be read, argued with, and revised
before any code is written.

Read in this order:

| | | |
|---|---|---|
| 1 | [Product brief](../product-brief.md) | What was asked for, and the open questions |
| 2 | [Connectivity](connectivity.md) | How our servers reach a machine behind NAT — the decision everything else rests on |
| 3 | [Security model](security-model.md) | Multi-tenant threat model; how end-to-end encryption is actually achieved |
| 4 | [Voice input](voice.md) | Transcription options, real costs, and what €5/month can buy |
| 5 | [Accounts and billing](billing.md) | Plans, the pricing constraint, and the legal problem with it |
| 6 | [Web app](web-app.md) | Marketing site, SEO, authentication, credential management |
| 7 | [Licence](licence.md) | Why AGPL-3.0 rather than MIT |
| 8 | [Phased plan](plan.md) | What to build, in what order, and what to defer |

## The shape of it

```
   phone (PWA)                  our infrastructure              user's machine
┌──────────────┐            ┌────────────────────────┐      ┌─────────────────┐
│ voice, text  │──HTTPS────►│  web app + relay       │◄─────│ claude-edge     │
│ session view │            │  accounts, billing     │ dial │ agent           │
└──────┬───────┘            │  transcription         │ out  │                 │
       │ BLE                └────────────────────────┘      │ tmux            │
       ▼                                                    │ Claude Code     │
┌──────────────┐                                            └─────────────────┘
│ Garmin Edge  │
└──────────────┘
```

Three parties, and only one of them is ours. The user's machine dials out to
our relay, which sidesteps NAT entirely; the phone and the Edge connect to the
relay from the other side. Terminal content is encrypted end to end between the
user's own devices, so it passes through us without being readable by us.

The Edge reaches the internet through Garmin Connect Mobile on the phone. That
part already works.

## The three decisions that shaped this

**A relay, not per-user tunnels.** Asking every paying customer to configure
Tailscale is a barrier that would sink the product. The cost is that traffic
transits our servers, which is only acceptable because of the next decision.

**End-to-end encryption, so "private" is a property rather than a promise.**
Terminal content is encrypted with a key derived on the user's own devices and
never sent to us. We route ciphertext. This is what makes a relay defensible.

**A flat subscription, not metered billing.** The stated requirement was never
to disclose usage or margin. Metered billing without visible usage is legally
awkward in the EU, and a flat plan achieves the same goal — the customer sees a
price, not our costs. See [billing.md](billing.md).

## What stays free

Self-hosting remains complete and unrestricted. The AGPL licence and the docs
in the parent directory cover running the whole thing yourself, with no account
and no relay. The hosted product sells convenience, not capability.
