# Licence

Requested: "the best licence". There is no single best one — the right choice
depends on what you want to prevent. This sets out the reasoning.

## What we are trying to achieve

1. **Stay genuinely open source.** The audience for this tool is developers who
   read the code before running it next to a terminal holding their
   credentials. Source-available-but-not-open would cost real trust.
2. **Self-hosting stays free and complete.** Not a crippled community edition.
3. **Nobody takes it closed and hosts it against us.** Someone forking the
   relay, adding their own billing, and never contributing back is the specific
   outcome to prevent.

## The options

| | Open source? | Prevents a closed hosted fork? | Cost |
|---|---|---|---|
| MIT (current) | yes | no | none |
| Apache-2.0 | yes | no | none — adds a patent grant |
| **AGPL-3.0** | **yes** | **yes** | some companies ban it internally |
| Elastic 2.0 / BSL | **no** | yes | loses open-source standing |

### MIT — where the project is today

Anyone may do anything, including host a commercial competitor built on this
code with no obligation to contribute anything back. Fine for a personal
project; a poor fit once there is a business.

### Apache-2.0

MIT plus an explicit patent grant, which is a genuine improvement in corporate
settings. Same weakness: no protection against a closed hosted fork.

### AGPL-3.0 — the recommendation

Copyleft that extends across the network boundary. Section 13 requires that
anyone who *offers the software as a network service* must make their modified
source available to users of that service.

Why it fits:

- **Genuinely open source.** OSI-approved and FSF-endorsed, so the project
  keeps that standing and the trust that comes with it.
- **Self-hosting is unaffected.** Running it for yourself, modifying it,
  sharing it — all fine, no obligations triggered.
- **A closed hosted fork is not possible.** A competitor may host it, but must
  publish their changes. That removes the incentive without preventing use.
- **We can still sell hosting.** Holding the copyright, we are not bound by our
  own copyleft, and the hosted service can include closed components.

Precedent: Grafana, Mastodon, Nextcloud, MongoDB (before SSPL), Element. All
chose it for this exact reason.

The real cost: **some companies forbid AGPL software outright**, usually from a
blanket policy rather than analysis. That limits corporate self-hosting. Given
the audience is largely individual developers, the trade is worth it.

### Elastic 2.0 or BSL

The strongest protection — hosting it as a service is simply prohibited — but
neither is an open source licence, and saying otherwise would be dishonest.
Elastic's own relicensing showed how much goodwill that costs.

Not worth it here. AGPL prevents the outcome we care about while keeping the
standing.

## Decision

**AGPL-3.0** for the whole repository.

### Structure

```
claude-edge/                 AGPL-3.0
├── packages/shared/         AGPL-3.0  — the wire contract
├── packages/server/         AGPL-3.0  — the bridge, and the self-hosted server
├── packages/web/            AGPL-3.0  — the PWA
├── edge-app/                AGPL-3.0  — the Connect IQ app
└── (hosted-only components) not published
```

Everything needed to run the whole thing yourself is AGPL and published.
Billing integration, relay operations and infrastructure are hosted-only and
simply not in the repository — not a restricted licence, just not published,
which is entirely compatible with AGPL.

### Contributor licensing

**No CLA.** Contributions are accepted under AGPL-3.0, the inbound licence
matching the outbound one.

A CLA assigning copyright to us would allow relicensing later, which is exactly
why many contributors refuse to sign one. For a project asking people to trust
it near their terminal, the signal matters more than the flexibility.

The consequence: relicensing later would require every contributor's agreement.
That is a real constraint, accepted deliberately.

### Connect IQ store

Publishing to Garmin's store means agreeing to their distribution terms. Those
apply to distribution, not to the source, so an AGPL app can be published there
— the source stays available in the repository either way.

Worth re-reading Garmin's agreement before submitting, since store terms change.

## What changes in practice

- `LICENSE` becomes AGPL-3.0
- Each source file gets a short header
- `README.md` states the licence and what it means for self-hosting
- `CONTRIBUTING.md` states that contributions are under AGPL-3.0, no CLA

## Open questions

- **Should the Connect IQ app be more permissive?** It runs on the user's own
  device and is not a network service, so AGPL's network clause never triggers.
  Apache-2.0 there would let others build Garmin apps against the protocol
  freely. Worth considering — it would grow the ecosystem at no cost to us.
- **Trademark.** The licence covers the code, not the name. If "claude-edge"
  becomes a product name it needs a separate trademark policy, and "Claude" is
  Anthropic's — a rename may be necessary before commercialising.
