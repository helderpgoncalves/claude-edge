# Phased plan

What to build, in what order, and — more usefully — what to defer and why.

The ordering principle: **each phase should be independently useful and should
resolve the largest remaining unknown.** Nothing here builds infrastructure for
a phase that might not happen.

## Where things stand

Working, tested, published:

- Bridge server, 130 tests including integration against real tmux
- Connect IQ app, 12 Edge models, 115–122 KB of a 1 MB budget
- Verified end to end against a live Claude Code session
- Docker, CI, documentation

Not built: everything in these SaaS documents.

## Phase 0 — finish what exists

Before any product work. These make the open-source project complete and are
worth doing whether or not the hosted product happens.

- **Expand to 18 Edge models.** Currently 12. Adding 520 Plus, 820, Explore,
  1000, 1030 Bontrager needs `minApiLevel` lowered to 2.4 and testing that
  nothing used is newer. The 520 has 256 KB rather than 1 MB, so it needs a
  size check. **130 and 130 Plus are impossible** — no device app support in
  hardware.
- **Relicense to AGPL-3.0.** See [licence.md](licence.md). Cheap now, hard
  later once there are outside contributors.
- **A bitmap monospace font.** The largest legibility improvement available.
  Connect IQ has no monospace font and `getVectorFont()` exists on no Edge, so
  terminal output currently renders proportionally and diffs do not align.

Independently valuable. Nothing here is wasted if the product is abandoned.

## Phase 1 — the relay

The largest technical unknown, so it goes first. If this does not work well,
nothing after it matters.

- Relay service: SSE downstream, HTTPS POST upstream
- Agent mode in the existing binary, dialling out
- Device-code login (RFC 8628)
- End-to-end encryption: passphrase → Argon2id → XChaCha20-Poly1305
- Minimal accounts: email, password, TOTP

**Success is measured by:** a session on a machine behind home NAT, readable
from a phone on mobile data, with the relay operator unable to read it. Prove
that last part by inspecting what the relay actually stores.

Defer: billing, voice, the marketing site, the admin panel.

## Phase 2 — the PWA

Now the relay carries something worth reading.

- Session view with client-side decryption
- Typing, with the existing hash-bound approval flow
- Device pairing. The Edge displays a QR code that the phone scans —
  **already verified working** on an Edge 540 using the native
  `Toybox.ScanCode` API, with the rendered output decoded by CoreImage. See
  [pairing.md](pairing.md).
- Installable, offline shell, Web Push when a session blocks

At the end of this, the product is **useful and free**. Worth releasing here
and finding out whether anyone wants it, before building billing for a product
nobody uses.

## Phase 3 — voice

The feature that justifies payment.

- `MediaRecorder` press-and-hold on the phone
- `gpt-transcribe` relay, streamed, never written to disk
- Review-and-confirm before anything is sent
- Bring-your-own-key as a first-class alternative

**Measure the billing rounding first.** Whether OpenAI charges per second or
rounds to the minute is undocumented and changes the fair-use number by up to
12×. One 10-second clip and a look at the dashboard settles it.

## Phase 4 — billing

Only once voice exists and people are using it.

- Stripe Checkout and Customer Portal
- Free and Pro plans, fair-use enforcement that degrades rather than bills
- VAT via Stripe Tax
- **Legal review before charging anyone.** The "never disclose usage" constraint
  interacts with EU consumer law, and the flat-subscription design resolves it
  — but that should be confirmed by a lawyer, not by me. See
  [billing.md](billing.md).

## Phase 5 — administration

- Superadmin panel: per-user cost, usage, devices
- Support role with no impersonation
- Append-only audit log, visible to the user
- WebAuthn required for superadmin

Deliberately after billing: there is nothing to administer until there are
paying customers, and the panel's shape depends on what support questions
actually arrive.

## Phase 6 — marketing site

- Static Next.js, docs rendered from the repository
- Device compatibility page covering all 20 Edge models
- Technical writing rather than marketing copy
- Plausible or Umami, self-hosted

Last, deliberately. A site marketing a product that does not exist is wasted
work, and the honest technical content that will actually rank can only be
written once the thing is real.

## Deliberately out of scope

**A native mobile app.** The PWA does everything needed, and it must exist
anyway because the phone holds the decryption key for the Edge.

**Self-hosted Whisper.** Saves cents per user per month while costing accuracy
and VPS capacity. Revisit only if users demand that audio never leave our
infrastructure — and bring-your-own-key already serves them better.

**Team accounts.** One account per person was the stated model. Teams mean
shared sessions, which means shared keys, which is a materially harder
cryptographic problem.

**Impersonation for support.** Discussed in [admin.md](admin.md). Never.

**`gpt-live-transcribe`.** 3.8× the cost for a realtime capability this
workload does not use.

## The risks worth naming

**The relay's privacy claim is the whole product.** If it turns out we can read
sessions, the differentiator is gone and so is the trust. It needs an
independent audit before charging money.

**Detection is heuristic.** Claude Code's prompt UI changes between releases,
and it has already broken once during development. A paying customer whose
approvals stop working is a refund. Needs monitoring and fast releases.

**Anthropic's trademark.** "Claude" is theirs. A rename is likely necessary
before commercialising, and it invalidates the domain and the SEO work — which
is the strongest argument for doing the marketing site last.

**One person.** Every phase above assumes a single developer. Phases 4 and 5
introduce obligations — payments, support, uptime — that do not pause.

## What to decide next

Before Phase 1 starts:

1. **The name and domain**, given the trademark question. It gets more
   expensive to change with every phase.
2. **The fair-use number**, which depends on measuring the billing rounding.
3. **Whether to do this at all.** Phases 0–2 produce an excellent free tool.
   Phases 3–6 produce a business, with the ongoing obligations that implies.
   Those are different commitments and the second one is much larger.
