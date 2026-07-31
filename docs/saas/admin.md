# Roles and administration

## The tension, stated first

Two requirements that pull against each other:

1. *"custo de cada utilizador, usagem, etc"* — the operator needs to see cost
   and usage per user, or the business cannot be run.
2. *"sem sacrificar a privacidade de cada user"* — without weakening anyone's
   privacy.

These are compatible, but only if the line is drawn precisely and enforced by
the architecture rather than by policy. The distinction is between **metadata
about a session** and **the content of a session**.

| | Superadmin can see |
|---|---|
| Account email, plan, signup date | yes |
| Minutes transcribed, requests made, cost incurred | yes |
| Which devices are paired, when last seen | yes |
| Relay bytes transferred, connection times | yes |
| **Terminal content** | **no** |
| **What was spoken** | **no** |
| **What was approved** | **no** |
| **Session passphrase or derived key** | **no** |

The bottom four are not withheld by permission checks. They are unavailable
because the data does not exist in a readable form: terminal content transits
the relay encrypted with a key derived on the user's own devices, and audio is
streamed to the transcription API without being written to disk.

**A superadmin cannot read a session even by editing the database.** That is
the property worth having, and it is what makes the privacy claim survive
having an admin panel at all.

## Roles

Deliberately few. Every additional role is a new set of interactions to reason
about.

| Role | For | Can |
|---|---|---|
| `user` | everyone | their own account, sessions, devices, billing |
| `support` | future staff | read account metadata, trigger a password reset, see billing status — **no** destructive actions, **no** impersonation |
| `superadmin` | the operator | everything support can, plus plan changes, refunds, suspensions, aggregate metrics |

There is no `admin` between support and superadmin until there is a reason for
one.

### What no role can do

- Read terminal content, audio, or transcripts — cryptographically prevented.
- Log in as a user. **There is no impersonation.** It is the feature support
  teams always ask for and the one that most cleanly breaks a privacy promise.
  Support can see metadata and reset a password; they cannot become someone.
- Change another user's session passphrase. It never leaves their devices.

## The admin panel

### Overview

```
Users            1,284      (+37 this week)
Paying              312      24.3% conversion
MRR              €1,560
Churn              2.1%      monthly

Transcription this month
  Minutes         8,420
  Cost            $37.89
  Cost per paying user  $0.12
  Margin                97.5%
```

Aggregate, and honest about what it is: cost, not content.

### Per-user

```
maria@example.com                         Pro · since 12 Jan 2026

  Billing
    Stripe             cus_R4x...          [open in Stripe]
    Next renewal       3 Mar 2026
    Lifetime value     €45.00

  Usage this cycle
    Voice minutes      42 of 600
    Transcription cost $0.19
    Relay traffic      124 MB

  Devices
    macbook-pro        last seen 2 min ago
    iPhone (PWA)       last seen 1 min ago
    Edge 540           last seen 4 min ago

  Sessions
    2 active                               (content not accessible)

  Actions
    [change plan]  [issue refund]  [suspend]  [delete account]
```

Note the last line under Sessions. The panel states plainly that content is not
accessible, rather than leaving an operator to wonder whether there is a hidden
way in. There is not.

### The user never sees their own usage

This is the constraint from [billing.md](billing.md): usage and margin are not
disclosed. The figures above exist **only** in the admin panel.

The user's own account page shows a plan, a price, and a renewal date. If they
reach the fair-use limit, voice stops with a plain message and no number.

This asymmetry is deliberate, and it is the reason the fair-use ceiling must be
stated in the terms before purchase — the customer needs to know the limit even
though they cannot watch themselves approach it.

## Audit log

Every administrative action is recorded, immutably:

```
2026-03-01 14:22  superadmin@…  plan_changed    user=maria@…  free → pro
2026-03-01 14:25  support@…     password_reset  user=joao@…
2026-03-02 09:14  superadmin@…  account_deleted user=old@…
```

Two properties matter:

- **Append-only.** No update or delete on this table, enforced at the database
  level rather than in application code.
- **Visible to the user.** Anyone can see administrative actions taken against
  their own account. An admin panel nobody can audit is one nobody should
  trust, and this is cheap to provide.

## Cost attribution

To answer "what does each user cost", per-request records are needed. To keep
the privacy claim, those records must contain no content:

```sql
CREATE TABLE transcription_usage (
  id             uuid PRIMARY KEY,
  account_id     uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  duration_ms    integer NOT NULL,      -- how long the audio was
  model          text NOT NULL,         -- which model, for cost attribution
  cost_micros    bigint NOT NULL,       -- our cost, in millionths
  -- deliberately absent: the audio, the transcript, any hash of either
  CHECK (duration_ms > 0 AND duration_ms < 600000)
);
```

Duration and cost. Not what was said, and not a hash of what was said — a hash
would allow confirming a guess.

Relay traffic is accounted the same way: bytes and timestamps, never payloads.

## Suspension and deletion

**Suspension** stops the relay accepting connections and returns a clear
message to the user's devices. It does not delete anything and is reversible.
Used for payment failure or abuse.

**Deletion** removes the account, devices, encrypted credentials, usage
records, and the Stripe customer. Terminal content needs no deletion because
none was ever stored.

Both are logged in the audit trail and visible to the user.

## Superadmin security

This account can change plans, issue refunds, and delete accounts. It warrants
more than a password:

- **Hardware key required.** WebAuthn, not TOTP, for superadmin specifically.
- **Separate account.** The operator's ordinary user account is distinct from
  their superadmin account; no privilege escalation on one login.
- **IP allowlist**, if practical for a one-person operation.
- **Every action logged**, including reads of per-user pages.

## Support access

Support does not exist yet — there is one person. But designing the role now
prevents the usual outcome, where the first hire is handed superadmin because
no smaller role exists.

Support can: view metadata, trigger a password reset, see billing status,
answer "is my agent connected".

Support cannot: impersonate, refund, delete, change plans, or see anything
about content.

## Open questions

- **Aggregate analytics.** Knowing which devices are common, or how often voice
  is used, would guide the roadmap — but aggregates can deanonymise at low user
  counts. Needs a minimum-cohort rule before any of it is collected.
- **Data retention.** How long to keep usage records after an account closes?
  Tax law requires some billing records; the privacy policy should state a
  concrete period rather than "as long as necessary".
- **Legal requests.** What can actually be produced in response to a court
  order? Metadata, yes. Content, genuinely not — and that should be documented
  publicly, before it is ever asked for.
