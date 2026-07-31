# ADR-0007: A native app, because the coach has to speak unprompted

**Status:** Accepted
**Date:** 2026-07-31

## Context

[web-app.md](../saas/web-app.md) and [plan.md](../saas/plan.md) both concluded
that a PWA was sufficient and that native apps were out of scope. That
reasoning was sound for the product as it stood:

> "The PWA does everything needed, and it must exist anyway because the phone
> holds the decryption key for the Edge."

[Coach mode](../saas/coach.md) breaks that conclusion, and it breaks it on one
specific requirement.

### The requirement

Dev mode's voice input is **user-initiated**: the rider presses a button, talks,
and the transcript comes back. Every part of that chain begins with a tap.

The coach is the opposite. It has to say "climb in 400 metres" when the rider
has not touched the phone for twenty minutes, the screen is off, and the phone
is in a jersey pocket. **Unprompted audio, from a backgrounded application.**

### What the web platform actually permits

Verified against MDN's autoplay guide rather than assumed:

> "Playback of any media that includes audio is generally blocked if the
> playback is programmatically initiated in a tab which has not yet had any
> user interaction."

Audio plays only if one of these holds: it is muted, the user has interacted
with the page, the site is allowlisted, or a Permissions Policy grants it.

The vendor documentation that prompted this investigation
([Progressier's PWA audio page](https://progressier.com/pwa-capabilities/audio-player-pwa))
states that a PWA can combine `<audio>` with the Media Session API to keep
playing with the screen locked and to be controlled from the lock screen. That
is true, and it is a **different claim** from the one this feature needs. It
describes *continuing* playback the user already started. It does not address
*starting* playback with no interaction, and the page discusses no autoplay
restrictions at all.

### The workaround, and why it is not enough

The known technique is an audio keepalive: start a silent looping element from
the tap that begins the ride, keep it alive for the duration, and swap the
source whenever there is something to say. Since playback was user-initiated,
it is permitted to continue.

It does work. It is also fragile in exactly the conditions this feature runs in:

- **iOS reclaims audio focus.** A phone call, a navigation prompt, or the rider
  starting music can interrupt the element, and recovering silently is not
  reliable.
- **Backgrounded pages get evicted.** Under memory pressure iOS discards
  background web content; a four-hour ride is a long time to survive.
- **It cannot be tested into confidence.** Each iOS release can change the
  behaviour, and the failure is silent — the coach simply stops talking, and the
  rider only discovers it after the ride they paid for.

A flagship feature resting on undocumented behaviour that fails quietly is a
bad trade, and "your coach went silent on the Etape" is a refund.

## Decision

**Build a native app for the phone. Keep the PWA.**

They are not alternatives; they do different jobs:

| | PWA | Native app |
|---|---|---|
| Dev mode: session view, typing, approvals | yes | yes |
| Dev mode: press-and-hold voice | yes | yes |
| **Coach: unprompted audio** | **no** | **yes** |
| Reliable background execution for hours | no | yes |
| Install friction | none | app store |

The PWA remains the way to use Dev mode, and it stays a first-class client:
zero install cost is a real advantage for a developer trying the product, and
[web-app.md](../saas/web-app.md)'s reasoning about it is unchanged.

The native app is required for Coach and is the better client for long rides.

### The server does not change

Worth stating plainly, because it was raised and the intuition is
understandable: **a native app is not a reason to rewrite the backend.**

Native clients speak HTTP and JSON. A Swift or Kotlin client is exactly as
happy talking to the existing TypeScript server as to any other, and the wire
protocol in `@claude-edge/shared` is the contract — the language it is
implemented in is invisible from the other side.

Rewriting it would discard 130 server tests including real-tmux integration,
and would replace a shared type definition that the web app and server both
import — which is what stops them drifting — with hand-maintained models that
mirror it by convention. That is a cost with no corresponding benefit to the
app.

## Consequences

### What this buys

- Coach mode becomes possible, reliably, which it is not otherwise.
- Real background execution, an audio session category, and local
  notifications.
- Direct BLE to the Edge becomes available later, if that is ever wanted.

### What it costs

- **An app store presence.** Two review processes, two developer programmes,
  and a release cadence that is no longer "push to main".
- **A third client to keep in step** with the wire protocol, alongside the PWA
  and the device app.
- **Apple's cut** on any subscription sold through the app, which interacts
  with the €5 price in [billing.md](billing.md) and needs its own arithmetic.
- **More surface for one person to maintain**, which
  [plan.md](../saas/plan.md) already names as the standing risk.

### Approach

**React Native (Expo)**, not two native codebases.

The deciding factor is the same one that runs through the rest of these
documents: this is one developer. Two codebases means every feature written
twice and every bug fixed twice, and the parts that genuinely need platform
depth — the audio session — are reachable from Expo through its audio module or
a small native module where necessary.

It also shares TypeScript with the monorepo, so `@claude-edge/shared` is
imported directly rather than reimplemented, and the wire contract stays a
compile error away from drifting.

Revisit if the audio behaviour turns out to need more platform control than a
thin native module can give.

### Sequencing

The app is **not** the next thing built. It depends on the relay, which does
not exist, and on Coach mode's open questions — the route source and the
per-ride cost — which are unanswered.

Order: relay → PWA → voice → *then* the app alongside Coach.

Building the app first would mean a native client for a product that still
cannot connect to anything.

## Revisit if

- The web platform gains a real background-audio capability with a permission
  prompt. This would remove the entire basis for the decision.
- Coach mode is abandoned. Without it there is no requirement here that the PWA
  does not already meet, and the app should then be dropped rather than
  maintained out of momentum.
