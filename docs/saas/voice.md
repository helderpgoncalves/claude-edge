# Voice input

Speaking a command into the phone and having it appear in the terminal.

This is the feature that justifies a paid plan, because it solves the problem
the Edge cannot: text entry. Seven buttons and a `TextPicker` work for a short
correction and are hopeless for a sentence.

## The flow

```
phone: hold to talk  →  record  →  release
                                     │
                          POST audio to relay
                                     │
                           transcription API
                                     │
                          transcript back to phone
                                     │
                     user reviews, edits, confirms
                                     │
                      encrypted with Ks, relayed
                                     │
                          agent types it into tmux
```

**The review step is not optional.** Transcription mistakes are routine, and
the destination is an agent that edits files and runs commands. "Delete the
cache" and "delete the case" differ by one phoneme. The user sees the text and
confirms before anything is sent.

## Model choice

Verified against OpenAI's pricing on 2026-07-31:

| Model | $/min | Use |
|---|---|---|
| **gpt-transcribe** | **0.0045** | **Chosen.** OpenAI's recommended transcription model |
| gpt-4o-mini-transcribe | 0.003 | Cheaper, billed by token; per-minute is an estimate |
| whisper-1 | 0.006 | The previous default |
| gpt-4o-transcribe | 0.006 | |
| gpt-live-transcribe | 0.017 | Realtime captioning — not this |

### Why not the "live" model

It was the initial preference, and it is the wrong tool. `gpt-live-transcribe`
costs **3.8×** more and is built for continuous captioning, where audio arrives
indefinitely and partial text must appear as someone speaks.

Here the user finishes speaking before anything is sent. There is a complete
file. Paying a realtime premium for a batch workload buys nothing — and
`gpt-transcribe` supports `stream=true` over ordinary HTTP if early partials
are ever wanted, at the same price.

### Cost in practice

A spoken command is 10–15 seconds, so roughly **$0.001 each**. A user sending
100 commands a month costs about **€0.08**.

Against €3.67 retained from a €5 subscription, transcription is not a
meaningful cost. The pricing can be set by what the product is worth.

**One unverified assumption:** whether OpenAI rounds each request up to a whole
minute is not documented. At 10-second clips that would be a 4–12× multiplier —
survivable, but it should be measured empirically before the fair-use number is
written into the terms.

## Recording on the phone

`MediaRecorder`, which is well supported including on iOS Safari — unlike the
Web Speech API.

- **Opus in WebM** where supported; iOS produces MP4/AAC, and both are accepted
  by the API.
- 16 kHz mono is enough for speech and keeps uploads small.
- Hard cap at 60 seconds. A command is not a monologue, and the cap bounds
  cost.
- **Press and hold to talk**, rather than a toggle. A toggle left running by
  accident records a conversation; a hold cannot.

Recording requires a user gesture on iOS, which press-and-hold satisfies
naturally.

## Why not the Web Speech API

It is free and needs no key, which makes it the obvious candidate for the free
tier. Rejected, for three reasons:

- **iOS is unreliable.** Apple documents support from 14.5, but developers
  report throttling and inconsistent interim results, and MDN marks the API
  "limited availability". Every iOS browser is WebKit, so there is no
  alternative engine to fall back on.
- **Audio still leaves the device** — to Google on Chrome, Apple on Safari — so
  it is no better for privacy than the paid path.
- Wind noise and technical vocabulary are precisely where it degrades.

It may be worth offering on Android as a best-effort fallback. It cannot be the
baseline.

## Privacy

Audio is the one place plaintext user data legitimately reaches our servers.
Handled as follows:

- **Streamed straight through.** Never written to disk, never buffered beyond
  the request.
- The transcript is encrypted with `Ks` on the phone before being relayed
  onward, like any other content.
- Only duration and cost are recorded. Not the audio, not the transcript, not a
  hash of either — a hash would allow confirming a guess.

### Bring your own key

For users who will not accept audio reaching us at all: they supply their own
OpenAI key, the phone calls the API directly, and we are not in the path.

- We never see the audio, and we never bill for it.
- The key is stored encrypted client-side and never sent to us in the clear.
- Available on the free plan, since it costs us nothing.

This is a first-class option, not a downgrade. For a tool aimed at developers
it may well be the more popular one.

## Language

The transcription models handle Portuguese and English without configuration,
and detect the language automatically.

One caveat worth setting expectations about: technical vocabulary transcribes
noticeably better in English. "git rebase interactive" is reliable; the same
instruction in Portuguese with English tool names mixed in is less so. The
review step absorbs this, which is another reason it is not optional.

## Failure handling

| | Behaviour |
|---|---|
| No microphone permission | Explain and fall back to typing |
| Recording too short (<0.5s) | Discard silently; it was a mis-tap |
| Transcription fails | Show the error, keep the audio, offer retry |
| Fair-use limit reached | "Voice is unavailable until your plan renews on 3 March." No number. |
| Offline | Queue the audio, transcribe on reconnect |

Typing always remains available. Voice is a convenience on top, and its failure
must never block the core product.

## Open questions

- **Push-to-talk from the Edge?** Connect IQ has no microphone API, so the
  phone must initiate. A button on the Edge that wakes the PWA's recorder would
  be excellent and may not be possible.
- **Custom vocabulary.** The API accepts a prompt to bias recognition. Seeding
  it with the user's recent commands and project names would help materially
  with technical words — but it means sending context we otherwise never see,
  which needs thought.
- **Rounding.** Measure it before setting the fair-use ceiling.
