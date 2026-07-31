# Security model

The single-user bridge protects one developer's machine from a leaked token. A
hosted relay carrying many people's terminal traffic is a different problem, and
this is a different threat model rather than an extension of the old one.

The design goal is stated as a property rather than a promise:

> **We route terminal content. We cannot read it.** Not by policy, not by access
> control — because the key never reaches us.

Everything below follows from making that true.

## What is at stake

Each user's terminal is running Claude Code with tool access: it edits files,
runs shell commands, reaches the network. A session's scrollback routinely
contains API keys, source code, customer names, and internal hostnames.

If a relay could read that, a single breach would expose the working
environments of every customer at once. That is the outcome the encryption
exists to make impossible.

## Trust boundaries

```
┌─────────────────────────────┐   ┌──────────────────┐   ┌───────────────────┐
│  user's machine             │   │  our relay       │   │  user's phone     │
│                             │   │                  │   │                   │
│  tmux, Claude Code          │   │  routes bytes    │   │  PWA              │
│  agent                      │   │  cannot decrypt  │   │                   │
│  Ks  (derived locally)      │   │  no Ks           │   │  Ks (derived)     │
└──────────────┬──────────────┘   └────────┬─────────┘   └─────────┬─────────┘
               │      ciphertext           │    ciphertext         │
               └───────────────────────────┴───────────────────────┘
                                                                   │ BLE
                                                        ┌──────────┴────────┐
                                                        │  Garmin Edge      │
                                                        │  plaintext, local │
                                                        └───────────────────┘
```

Trusted: the user's own machine and phone. Untrusted by design: our relay.

## Key handling

`Ks` is derived on the user's devices from a passphrase they set:

```
Ks = Argon2id(passphrase, salt = account_id, m = 64 MiB, t = 3, p = 4)
```

- Derived independently on the machine and the phone. Never transmitted.
- Content is sealed with XChaCha20-Poly1305 — a random 192-bit nonce per
  message, so nonce reuse is not a practical concern even across reconnects.
- The relay stores and forwards opaque bytes.

**Consequence: a forgotten passphrase is unrecoverable.** We cannot reset it.
The user sets a new one and previous session content becomes unreadable. This
must be said plainly at the moment they choose it, not in a help page.

### Why not per-message keys or a ratchet

A Double Ratchet would give forward secrecy, and it was considered. Rejected
for now because the threat it defends against — an attacker who compromises a
device *later* decrypting traffic captured *earlier* — matters less here than
the operational cost: ratchets need ordered delivery and careful state
recovery, and the Edge reconnects constantly on a flaky BLE link.

A single derived key with random nonces is simpler, and simple cryptography
that works beats sophisticated cryptography that breaks on reconnect. Worth
revisiting if the product grows.

## The Edge is the weak point, and it is handled honestly

Connect IQ offers no usable cryptography, 1 MB of memory, and no secure storage
for a derived key. The Edge cannot participate in end-to-end encryption.

So it does not. **The phone decrypts and serves plaintext to the Edge over the
local BLE link.**

- End-to-end encryption is preserved between machine and phone.
- The Edge only ever receives what the phone already decrypted, over a link
  that does not leave the user's person.
- The PWA must be running — which it must be anyway, since Garmin Connect
  Mobile is the Edge's only network path.

The alternative would be decrypting on our servers for Edge sessions, which
would quietly void the guarantee for exactly the users who use the product
most. Not acceptable.

## Multi-tenancy

One bug crossing tenants exposes someone's terminal. Defences, in order of how
much they actually help:

**Every query is scoped by account, structurally.** Row-level security in
Postgres, with the account id set per request from the session. A query that
forgets its `WHERE` returns nothing rather than everything.

**Relay connections are keyed by account.** A connection is authenticated
before it is routed, and the routing table is per-account. There is no path
where a message can be delivered to the wrong tenant, because the lookup starts
from the authenticated account rather than from a message field.

**Ciphertext limits the blast radius.** Even a routing bug that delivered a
message to the wrong account would deliver bytes that account cannot decrypt.
This is the reason the encryption matters more than the isolation.

## Authentication

| | |
|---|---|
| Passwords | Argon2id, m=64 MiB, t=3 |
| Second factor | TOTP for users, **WebAuthn required** for superadmin |
| Sessions | httpOnly, Secure, SameSite=Lax cookies, 30-day rolling |
| Machine login | RFC 8628 device code, token in the OS keychain |
| Device pairing | short-lived single-use code — see [pairing.md](pairing.md) |
| Password change | revokes every session and device token |

Rate limits are per-account rather than per-IP, because requests arrive via
phones on carrier NAT where IP is neither stable nor meaningful.

## What the relay can see, stated plainly

Unavoidable metadata, and the privacy policy should list it rather than gloss
over it:

- Which account is connected, and when
- How many bytes flow, and their timing
- Which devices are paired
- Whether a session is active

Traffic analysis on the timing could reveal roughly *when* someone is working
and roughly how much. It cannot reveal what they are doing.

## Voice, and where the audio goes

The one place plaintext user data legitimately reaches us.

- Audio is streamed to the transcription API and **never written to disk**.
- The transcript is returned to the phone, encrypted with `Ks`, and relayed
  onward like any other content.
- Only duration and cost are recorded, for fair-use accounting.

For users who do not accept this, **bring-your-own-key** means the phone calls
OpenAI directly and we never see the audio at all. That is a real alternative,
not a consolation prize, and it should be presented as such.

## Incident response

**A relay compromise** exposes metadata and ciphertext. Terminal content stays
unreadable. The response is rotation of relay credentials and disclosure of
exactly what metadata was exposed.

**A database compromise** exposes emails, password hashes, encrypted OpenAI
keys, and usage records. Not session content, and not any `Ks`.

**A compromised user machine** is outside our control and outside the model.
The agent runs with the user's privileges by necessity.

Disclosure within 72 hours to affected users, per GDPR, with specifics rather
than reassurance.

## What we deliberately do not build

- **Impersonation.** No support tool logs in as a user. It is the single
  feature that most cleanly breaks a privacy promise, and the reasons for
  wanting it are always sympathetic.
- **Session recording.** Not for debugging, not for support.
- **Content search.** Even over ciphertext, since it would require indexing
  something derived from content.
- **A "recovery key" we hold.** It would make forgotten passphrases
  recoverable, and would mean we hold a key to everything.

## Open questions

- **Independent audit.** A privacy claim of this kind is worth much less
  unaudited. Worth budgeting for before charging money.
- **Reproducible agent builds.** Users are asked to run a binary next to their
  credentials. They should be able to verify it matches the published source.
- **Nonce handling across reconnects.** Random 192-bit nonces make collision
  negligible, but the derivation and storage should be reviewed by someone who
  does this professionally.
- **Key rotation.** Changing a passphrase must re-key both ends atomically,
  with no window where one side can read and the other cannot.
