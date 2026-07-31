# Coach mode

The second of the two modes. Dev keeps you productive while you train; Coach
watches the training itself and talks to you about it.

**Nothing here is built.** This is a design document, and the landing page says
"waitlist" rather than "available" for exactly that reason.

## What it is

A riding companion that has your history, can see the route ahead, and speaks
into your headphones when it has something worth saying.

Concretely, four things:

| | |
|---|---|
| **Effort** | Reading what you are spending against what is still ahead |
| **Terrain** | The climb before you reach it, while there is still time to shift |
| **Fuelling** | Eat now, timed to effort actually spent rather than a fixed clock |
| **Motivation** | The thing you need to hear at hour three, informed by what you have done before |

The unifying idea is that all four are things a good training partner does, and
none of them are things a screen does well. You cannot read a graph at 30 km/h
into a headwind. You can hear a sentence.

## Why audio, and why that is the hard part

The Edge is an excellent screen for a **question with two options** — that is
what Dev mode proved. It is a poor screen for a paragraph of coaching, and a
worse one when you are at threshold.

Audio is the right channel, and choosing it creates the central technical
problem of this entire feature:

> **The coach must speak without being asked.**

That is what separates it from every voice feature in Dev mode. In Dev, the
rider presses a button and then talks — a user gesture initiates everything. The
coach has to say "climb in 400 metres" when the rider has not touched anything
for twenty minutes and the phone is locked in a jersey pocket.

Browsers do not allow that. See [ADR-0007](../adr/0007-native-app-for-audio.md)
for the verification and the decision it forced; the short version is that
unprompted audio is why this feature needs a native app and Dev mode does not.

## What the device can already tell us

Verified against the existing implementation — `edge-app/source/OverlayView.mc`
already calls `Activity.getActivityInfo()` and reads all of these:

| Field | Used for |
|---|---|
| `currentSpeed` | Pace, and detecting a stop |
| `currentHeartRate` | Effort, drift, recovery between efforts |
| `currentPower` | Effort, when a meter is present. The best signal by far |
| `currentCadence` | Distinguishing "grinding" from "spinning" at the same power |
| `altitude` | Climbing, and cross-checking the route |
| `elapsedDistance` | Progress against the route |
| `timerTime` | Fuelling intervals, and total load |

This matters for scoping: **the data side is largely solved.** The device app
already reads these to draw its metric row. What does not exist is anywhere to
send them, anything to reason about them, and any way to speak back.

### What is missing and must come from elsewhere

- **The route.** `Activity.Info` does not include the loaded course profile.
  Warning about a climb requires the route, which means either reading the
  loaded course from the device or having the rider select it in the app.
  Unresolved — see the open questions.
- **History.** "You are ahead of where you were last time" needs previous
  rides, which live in Garmin Connect rather than on the device. That is an
  API integration and an OAuth scope, not a device read.

## The shape of it

```
   Edge                     phone (native app)              our infrastructure
┌──────────┐              ┌────────────────────┐          ┌──────────────────┐
│ Activity │──── BLE ────►│ collects metrics   │─ HTTPS ─►│ coaching logic   │
│ .Info    │              │ holds the route    │          │ (needs history)  │
└──────────┘              │                    │◄─────────│                  │
                          │ speaks  ◄──────────│  text    └──────────────────┘
                          │ (background audio) │
                          └─────────┬──────────┘
                                    │ BT audio
                                    ▼
                              headphones
```

Two things about this diagram are load-bearing:

**The phone is the coach, not the Edge.** Connect IQ has no audio output to
headphones and no speech synthesis. The Edge is a sensor and a screen; the
phone does the talking.

**Speech is synthesised on the phone.** Sending generated audio over the network
would cost bandwidth and latency on exactly the connection least likely to be
good — a mobile signal in the hills. The server sends a sentence; the phone's
own text-to-speech says it. This also means a lost signal degrades to silence
rather than to a half-downloaded audio file.

## What it should say, and how often

The failure mode for this feature is not saying the wrong thing. It is **saying
too much**. A coach that talks every two minutes gets muted in week one, and a
muted coach is a cancelled subscription.

Working rules:

- **Silence is the default.** It speaks when it has something the rider does not
  already know. "You are going uphill" is not that; the rider can feel it.
- **Never twice for the same thing.** One warning per climb, one reminder per
  fuelling window.
- **A hard floor between utterances**, except for safety-relevant terrain.
- **Nothing at all above a configurable effort threshold**, unless it is a
  warning. At threshold the rider cannot act on nuance and does not want
  conversation.

That last one is the sort of rule that only comes from riding with it, which is
why this needs to be tested on real rides before it is sold.

### Tone

The rider chooses, and the choice matters more than it sounds — the same
sentence lands completely differently depending on who you are:

| | Example |
|---|---|
| **Quiet** | "Climb in 400 metres. Four minutes." |
| **Companion** | "Alright, four hundred to the climb. Settle in, it's about four minutes." |
| **Hard** | "Climb coming. You've got more than you're giving." |

Default to Companion. Quiet is what people switch to after a week, and that is
fine — it means they are still using it.

## Fuelling, specifically

The one piece of coaching where being wrong has a physical cost, and where a
fixed timer is genuinely worse than nothing.

The rule of thumb is 60–90 g of carbohydrate per hour above a certain intensity,
but the useful version is against **work done**, not time elapsed. Ninety
minutes of easy spinning and ninety minutes of climbing are not the same
demand, and a clock cannot tell them apart. Power can, and heart rate is a
usable proxy where power is absent.

Two constraints on saying it:

- **Say it early enough to act on.** "Eat now" while descending at 60 km/h is
  useless. The window should open somewhere the rider can reach a pocket.
- **This is not medical advice, and must not read as though it is.** It is a
  reminder, on the rider's own configured schedule. That distinction needs to
  survive into the copy and into the terms — see the open questions.

## What this is not

**Not a training plan.** It does not decide what today's ride should be. That is
TrainingPeaks, Intervals.icu and a coach, and competing with them is a
different product with a different price.

**Not a post-ride analysis tool.** Garmin Connect, Strava and Intervals.icu all
do this well and for free. The value here is entirely in the moment — a thing
said while it can still change the ride.

**Not a safety system.** It does not warn about traffic, and it must never be
positioned as though it might. A rider who believes the device is watching for
hazards is in more danger than one who knows it is not.

**Not medical.** No heart-rate anomaly detection, no "you may be ill" inference.
The liability is real and the false-positive rate on consumer sensors is high.

## Interaction with Dev mode

They share a device and a rider, and mostly they should not run at once. A
permission prompt is a decision that needs the rider's attention; a coaching
cue during it is noise.

Proposed: **Dev takes priority.** When a session is waiting, the coach goes
quiet until it has been answered. This also gives the rider a reason to answer
promptly, which is the entire point of Dev mode.

Whether anyone actually wants both at once is an open question and probably
answered by usage rather than by argument.

## Open questions

Each of these has to be settled before this is built, and none of them are
settled now.

**1. Where does the route come from?**
The climb warning is the most compelling thing in this document and it depends
entirely on knowing what is ahead. Reading the loaded course from Connect IQ
may be possible; if not, the rider selects a route in the app and the two must
be kept in sync. Worth prototyping first, because if this cannot be solved
cleanly the feature is materially weaker.

**2. Whose history, and at what cost?**
"Ahead of last time" needs previous rides. Garmin Connect has an API with an
approval process and terms; Strava has one with a rate limit and a history of
changing what partners may do. Both are dependencies on a company that is not
us, for a feature we would be charging for.

**3. Does the coach reason server-side, and what does that cost?**
Generating a sentence per cue with a language model is the obvious
implementation and it is not free. Unlike transcription — where
[billing.md](billing.md) concludes the API cost is a rounding error — a coach
that speaks 40 times over a four-hour ride, for every rider, is a real per-ride
cost that scales with engagement. **This needs its own arithmetic before any
price is set**, and it may well argue for templated sentences with generated
variation rather than a call per cue.

**4. Battery.**
A phone doing background audio, holding a BLE connection and talking to a
server for four hours is a meaningful drain, on the device the rider also needs
for navigation and for calling someone if they crash. This has to be measured
on real hardware, not estimated.

**5. Where does the liability line sit?**
Fuelling advice and effort management shade towards health guidance. Probably
resolved by framing everything as the rider's own configured reminders rather
than as recommendations — but that is a lawyer's call and it should be made
before launch rather than after the first complaint.

**6. Is this the same product?**
The honest one. Dev mode sells to developers who cycle. Coach sells to cyclists.
Those are different audiences, different marketing, and arguably different
products sharing a device app. Bundling them at €5 is convenient for us and may
be confusing for both.

## Why it is worth building anyway

The overlap is not the audience — it is the **insight**. Both modes exist
because the Edge is already on the handlebars, already paired, already glanced
at, and almost nothing is built for it beyond navigation and metrics. Dev mode
proved that a device app plus a phone plus a server can put something genuinely
useful on that screen.

Coach is the same architecture pointed at the thing the rider was doing anyway.
