# Accounts and billing

## The requirement, and the problem with it

Stated plainly:

> "nunca mas nunca podemos divulgar o uso nem a comissão"
> (never disclose usage or the margin)

The intent is clear and reasonable: our costs and our margin are our business,
not the customer's. Nobody publishes their supplier invoices.

The problem is the mechanism, not the intent. **Metered billing against a
figure the customer cannot see is a legal problem in the EU.**

- The Consumer Rights Directive (2011/83/EU, Art. 6(1)(e)) requires the total
  price — or, where it cannot be calculated in advance, the manner in which it
  is calculated — to be given **before** the customer is bound.
- The Unfair Contract Terms Directive (93/13/EEC) treats terms that let a
  trader determine the price after the fact, without the consumer being able to
  verify it, as presumptively unfair.

Charging per minute while refusing to show minutes fails both. It is also the
kind of thing that generates chargebacks, which cost more than the margin.

## The resolution

A **flat subscription with fair-use limits**.

The customer sees a price and a plan. They never see our cost per minute, our
margin, or a running meter. The intent is fully satisfied — and it is legal,
because the price is fixed and known in advance.

| | Free | Pro |
|---|---|---|
| Price | €0 | **€5/month** |
| Watch a session from the Edge | yes | yes |
| Approve prompts | yes | yes |
| Type on the phone | yes | yes |
| **Voice input** | — | yes, fair use |
| Sessions | 1 | 5 |
| Self-hosting | unrestricted | unrestricted |

"Fair use" is a stated number of hours per month in the terms — a limit, not a
meter. The customer knows the ceiling before subscribing, which is what the law
requires, and nothing about our costs is revealed by it.

## Does €5 work?

Comfortably — and by a much wider margin than a first look suggests.

Prices below were verified against OpenAI's pricing page on 2026-07-31.

```
€5.00 gross
  − VAT (23%, PT)          → €4.07 net
  − Stripe (2.9% + €0.25)  → €3.67 retained
```

| Model | Price/min | Notes |
|---|---|---|
| **gpt-transcribe** | **$0.0045** | OpenAI's recommended transcription model. Supports streaming over plain HTTP. |
| gpt-4o-mini-transcribe | $0.003 | Cheapest, billed by token; the per-minute figure is an estimate |
| whisper-1 | $0.006 | The old default |
| gpt-4o-transcribe | $0.006 | |
| gpt-live-transcribe | $0.017 | Realtime captioning. **Not what this needs** — see below |

### Why not `gpt-live-transcribe`

It was the stated preference, and the arithmetic and the use case both argue
against it. It costs **3.8× more** than `gpt-transcribe` and buys nothing here:
it is built for live captioning, where audio arrives continuously and partial
results must appear as someone speaks.

A cyclist speaks a complete instruction — ten seconds — and then it is sent.
There is a finished file. `gpt-transcribe` handles that at $0.0045/min, and
supports `stream=true` over ordinary HTTP if early partial text is ever wanted,
at the same price.

### The actual cost per user

A spoken command is 10–15 seconds. At $0.0045/min:

| Commands per month | Audio | Cost to us |
|---|---|---|
| 10 | 2 min | **€0.008** |
| 30 | 6 min | **€0.025** |
| 100 | 20 min | **€0.083** |

Against €3.67 retained, transcription is a rounding error. Even reserving only
20% of revenue for it affords ~800 commands a month, which nobody will reach.

**The conclusion that matters: API cost is not the constraint on this
business.** Pricing can be set by what the product is worth rather than by what
inference costs.

### The one real risk

Whether OpenAI rounds each request up to a whole minute is **not documented**,
and could not be verified. It matters because these clips are short:

| Commands | Billed if rounded to the minute | Share of retained revenue |
|---|---|---|
| 10 | 10 min → $0.045 | 1% |
| 30 | 30 min → $0.135 | 4% |
| 100 | 100 min → $0.45 | 12% |

Even the worst case is survivable, but it is a 4–12× multiplier on the
assumption. **Measure it empirically before setting the fair-use number** —
send a 10-second clip and read the billing dashboard.

### Self-hosted Whisper

Considered, and rejected on the economics:

- whisper.cpp on Apple Silicon reaches ~10× realtime; a small model on a modest
  VPS manages ~6×, so a 15-second command takes ~2.5s.
- Accuracy: small ≈ 3.4% WER, base ≈ 5.1%, tiny ≈ 7.6%. Small is the floor for
  technical vocabulary, and Portuguese is worse than English at every size.
- It would save cents per user per month while costing accuracy and VPS
  capacity.

The case for self-hosted transcription is privacy or offline operation, not
cost. Worth revisiting if users ask for audio never to leave our infrastructure
— but bring-your-own-key already serves the privacy-conscious better.

### Browser speech recognition as a free tier

The Web Speech API is free and needs no key, which makes it tempting for the
free plan. Rejected:

- **iOS is unreliable.** Apple documents support from 14.5, but developers
  report throttling and inconsistent interim results, and MDN marks the API
  "limited availability". Every iOS browser is WebKit, so there is no
  workaround.
- **Audio still leaves the device** — to Google on Chrome, Apple on Safari — so
  it is no better for privacy than the paid path.
- Wind noise and technical vocabulary are exactly where it degrades.

It can be a best-effort fallback on Android. It cannot be the baseline.

## Fair use, handled honestly

At the limit, the service degrades rather than bills:

1. **Below the cap** — nothing is shown. No meter, no percentage, no nudge.
2. **At the cap** — voice stops working for the rest of the cycle, with a plain
   message: *"Voice input is unavailable until your plan renews on 3 March."*
3. Typing and approvals keep working. The core product does not stop.

No usage figure is ever displayed. The customer learns they hit a limit only by
hitting it, which is exactly how mobile data allowances work and is
well-understood.

## Bring your own key

An alternative worth offering, and it resolves the privacy tension cleanly:

The user supplies their own OpenAI key. They are billed by OpenAI directly, we
never see the audio, and we charge nothing for transcription.

- Honest for privacy-conscious users, who are likely a large share of the
  audience for a tool like this.
- Removes our cost entirely, so it can be offered on the free plan.
- The key is held **encrypted client-side** and sent per request; we hold the
  ciphertext but not the key that opens it.

This is not a lesser tier. For some users it is the only acceptable one.

## Payments

**Stripe**, via Checkout and the Customer Portal.

- Handles EU VAT (MOSS) automatically, which is otherwise a genuine burden for
  a one-person business selling across the EU.
- Strong Customer Authentication is handled.
- Cancellations and payment-method updates go through Stripe's portal, so we do
  not build or maintain that.

We store a Stripe customer id and a subscription status. Never a card number,
never a full billing address beyond what Stripe needs for VAT.

## Accounts

One account per person. Email plus password, with TOTP two-factor available and
strongly encouraged — this account can reach a terminal.

- Argon2id for password hashing.
- Sessions as httpOnly, Secure, SameSite=Lax cookies.
- Device pairing by short-lived code, so a token is never typed into a phone.
- Email verification before the relay accepts a connection.

Deleting an account deletes everything: relay records, encrypted credentials,
Stripe customer. Stated in the privacy policy with a deadline, not left vague.

## What we store, and what we deliberately do not

| | Stored |
|---|---|
| Email, password hash, TOTP secret | yes |
| Stripe customer id, plan, renewal date | yes |
| Encrypted OpenAI key (opaque to us) | yes |
| Relay connection metadata: when, how much | yes |
| **Terminal content** | **no** — ciphertext in transit only, never at rest |
| **Audio** | **no** — relayed to the transcription API, never written to disk |
| **Transcripts** | **no** |
| Per-user usage totals for fair use | yes, aggregate minutes only |

The last row is worth being precise about: we count minutes to enforce the cap.
We do not show that number, and we do not retain what was said.

## Open questions

- **Annual plan?** Lower churn and better cash flow, but it is a bigger
  commitment for a €5 product.
- **What is the fair-use number?** Ten hours is derived from the arithmetic
  above. It should be validated against real usage before being written into
  the terms.
- **Chargeback exposure.** A €5 subscription costs more to dispute than it
  earns. Stripe Radar helps; clear billing descriptors help more.
- **VAT for non-EU customers.** Stripe Tax handles most of it, but the
  registration thresholds need checking per jurisdiction.
