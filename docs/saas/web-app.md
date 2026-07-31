# Web app and marketing site

Two things sharing a domain and a codebase, with different jobs:

| | |
|---|---|
| `claude-edge.dev` | Marketing site. Static, fast, indexed. |
| `claude-edge.dev/app` | The PWA. Authenticated, dynamic, not indexed. |

## Stack

**Next.js (App Router)** on Vercel or a container.

Chosen over the alternatives for one reason that actually matters here: the
marketing site needs to be statically generated and heavily indexed, while the
PWA needs to be an authenticated client-side app with offline capability.
Next.js does both in one project without a second build pipeline, and it shares
the `@claude-edge/shared` wire contract with the server so the two cannot
drift.

```
packages/web/
  app/
    (marketing)/          static, indexed
      page.tsx            landing
      pricing/
      docs/               rendered from the repo's markdown
      blog/
    (app)/                authenticated, noindex
      dashboard/
      session/[id]/
      devices/
      billing/
    admin/                superadmin only
  components/
  lib/
```

## Marketing site and SEO

The audience is developers searching for something quite specific. That shapes
everything.

### Technical foundations

- **Static generation.** Every marketing page is HTML at build time. No
  client-side rendering for anything a crawler needs.
- **Core Web Vitals.** LCP under 2.5s, CLS under 0.1, INP under 200ms. These
  are a ranking factor and, more usefully, they are what a developer notices.
- **Real HTML.** One `<h1>`, semantic sectioning, descriptive link text.
- **`next/image`** for automatic AVIF/WebP and correct dimensions, so nothing
  shifts as it loads.
- **Self-hosted fonts** via `next/font`, subset. No third-party font request on
  the critical path.
- Sitemap, `robots.txt`, canonical URLs, RSS for the blog.

### Structured data

`SoftwareApplication` and `FAQPage` JSON-LD. The FAQ markup is what wins the
expandable results for questions like "can you use Claude Code on a Garmin".

### What actually ranks

Not the landing page. The queries this can realistically win are long-tail and
technical:

- "claude code garmin edge"
- "approve claude code prompts remotely"
- "monitor tmux session from phone"
- "garmin connect iq terminal app"
- "claude code notifications while cycling"

Which means the content strategy is **documentation and honest technical
writing**, not marketing copy:

- The full docs, rendered from the repository so they cannot go stale
- Build logs: "Why the Edge has no monospace font and what to do about it",
  "Making a Connect IQ app work across twelve devices"
- A device compatibility page listing all 20 Edge models — this is exactly what
  someone searches before buying

Each of those is a page that answers a real question, which is the only durable
SEO there is.

### Honesty as positioning

The landing page should say what the product does **and what it cannot do**:

- The Edge has no keyboard; long prompts belong on the phone
- Terminal text does not align in columns yet, because Connect IQ has no
  monospace font
- Two Edge models cannot run it at all — 130 and 130 Plus lack device app
  support entirely

Stating this converts better with developers than hiding it, and it prevents
the refund requests that follow a discovery after purchase.

## The PWA

Installable, offline-capable, and it must feel immediate.

| | |
|---|---|
| Session view | Live terminal, decrypted client-side |
| Voice | Press and hold, review the transcript, confirm |
| Typing | A real keyboard, which is the whole point of the phone |
| Approvals | Same hash-bound flow as the Edge |
| Devices | Pair, name, revoke |
| Billing | Plan and renewal date. **No usage figures.** |

### Why a PWA rather than native apps

- One codebase, no App Store review, no developer programme fees.
- **It is required by the architecture anyway.** The phone holds `Ks` and
  decrypts for the Edge, so the PWA must be running for the Edge to work at
  all.
- Everything needed is available: `MediaRecorder` for voice, Web Crypto for
  `Ks`, service workers for offline, Web Push for notifications on both
  platforms now.

The one real cost is iOS install friction — Add to Home Screen is not
discoverable. Worth a short onboarding page that shows it.

### Offline

The service worker caches the shell and the last session state. Offline, the
user sees the last screen with its age and can queue a voice recording for when
connectivity returns. Actions are not queued: an approval must be bound to a
current screen hash, and a stale one would be refused anyway.

## Authentication

Email and password, Argon2id, TOTP available and strongly encouraged.

Magic links were considered and rejected: email is slower than a password
manager, and it makes the account only as secure as the mailbox — for an
account that can reach a terminal, that is the wrong trade.

Sessions are httpOnly, Secure, SameSite=Lax cookies with a 30-day rolling
expiry. Changing the password revokes everything.

## Credential management

```
Settings → Credentials

  Session passphrase
    Set on this device. Never sent to our servers.
    Terminal content is encrypted with a key derived from it.
    If you forget it, we cannot recover it.       [change]

  OpenAI key (optional)
    Only needed for bring-your-own-key transcription.
    Stored encrypted on this device.              [add]
```

Both are explicit about where the secret lives and what happens if it is lost.
That is the kind of thing users only read once, so it has to be on the screen
where they act rather than in a help page.

## Design

Dense, fast, and legible. The audience reads terminals for a living.

- Light and dark, following the system, with an override.
- A real monospace stack for terminal content: `ui-monospace, SFMono-Regular,
  Menlo, monospace`.
- Contrast at WCAG AA minimum. Terminal colours need care here — the
  conventional palette fails contrast on white.
- Keyboard navigable throughout, since half the audience will not touch the
  mouse.

## Analytics

Privacy-respecting only. A product built on not reading your data cannot ship
Google Analytics without looking ridiculous.

**Plausible** or **Umami**, self-hosted: no cookies, no personal data, no
consent banner required. Page views and referrers are enough to know whether
the SEO is working.

## Open questions

- **Domain.** `claude-edge.dev` uses Anthropic's trademark. A rename is likely
  necessary before commercialising — worth deciding early, since it affects
  every URL and all the SEO work.
- **Docs rendering.** Pulling markdown from the repo at build time keeps one
  source of truth, but couples deploys to repo changes.
- **i18n.** Portuguese and English are the obvious pair, and it roughly doubles
  the SEO surface. Worth it, but not first.
- **Status page.** Necessary once people pay. Uptime and relay health, hosted
  separately so it survives an outage.
