# Talking to a session

How speaking into your phone becomes text in an open terminal session, what
happens to what you said, and what to do when it goes wrong.

This is the user-facing document. The engineering counterpart — model choice,
per-minute costs, the arithmetic behind the plan — is in
[saas/voice.md](saas/voice.md) and is not written for customers.

## Why it exists

The Edge answers a question well and enters text badly. Seven buttons and a
text picker are fine for correcting a word and hopeless for a sentence, and
[the roadmap](roadmap.md) is explicit that free text on the device is a
non-goal: any scheme for it would be slow enough to be dangerous while riding.

So the sentence goes in through the phone, and it goes in by voice, because
that is the only input method that works while moving.

## The flow

```
  press and hold the headphone button
              │
         speak, release
              │
      voice recognition
              │
    the text comes back to you
              │
     you read it and confirm
              │
   it arrives in the open session
```

Six steps, and the fifth is the one that matters.

### You confirm before anything is sent

**The review step is not optional and will not become optional.**

What is on the other end is a session that edits files and runs commands. Voice
recognition makes mistakes, and it makes the most mistakes in precisely the
conditions this product is used in: wind noise, breathing hard, technical
vocabulary, a mix of languages in one sentence.

"Delete the cache" and "delete the case" differ by one phoneme.

So the text comes back to your screen, you look at it, and you decide. This
costs a tap and it is the difference between a useful tool and an unpredictable
one.

## What is kept

Nothing.

| | |
|---|---|
| The audio | Not written to disk. Passed straight through and discarded |
| The transcript | Not stored |
| A hash of either | Not stored — a hash would let someone confirm a guess |
| That a request happened, and how long | Kept, to enforce plan limits |

The last row is the honest exception. Duration is counted because a plan has a
fair-use ceiling and enforcing it requires knowing when the ceiling is reached.
What was said is not part of that.

## Language

Portuguese, English and Spanish all work, and the language is detected — you do
not choose it in a menu, and you can switch mid-sentence.

One expectation worth setting: **technical vocabulary recognises better in
English.** "Git rebase interactive" is reliable. The same instruction in
Portuguese with English tool names embedded in it is less so, because that is a
harder problem for any recogniser.

This is not a defect you should work around by speaking English. It is a reason
the review step exists.

## When it goes wrong

| | What happens |
|---|---|
| Microphone permission refused | Explained, and typing stays available |
| Recording under half a second | Discarded silently — it was a mis-tap |
| Recognition fails | The error is shown, the audio is kept, retry is offered |
| No signal | The recording is queued and processed when you reconnect |
| Plan limit reached | Voice pauses until your plan renews, with the date |

**Typing always works.** Voice sits on top of the product and its failure never
blocks the thing underneath. If voice is unavailable for any reason, the
session, the approvals and the keyboard are all still there.

### About the limit

When a plan's fair-use ceiling is reached, voice stops until renewal and you
are told the date. You are not shown a meter, a percentage or a countdown while
below it.

That is a deliberate choice and worth being straight about: the ceiling is
stated in the terms before you subscribe, so you know it in advance, and no
running total is displayed. It works the way a mobile data allowance works.

## If you would rather we were not involved

You can supply your own recognition credentials, in which case your phone talks
to that service directly and we are not in the path at all. We never receive
the audio, and we charge nothing for it.

Available on the free plan, since it costs us nothing to offer.

This is a first-class option rather than a lesser one. For a tool aimed at
people who read terminals for a living, it may well be the more popular choice,
and it is the right answer for anyone who will not accept audio reaching a
third party.

## Recording, practically

- **Press and hold**, rather than tap-to-start and tap-to-stop. A toggle left
  running by accident records a conversation; a hold cannot.
- **Sixty seconds maximum.** A command is not a monologue.
- Works on iOS and Android in the browser, and in the app.

Press-and-hold also satisfies iOS's requirement that recording begin from a
deliberate gesture, so the constraint and the safer design happen to agree.

## What this is not

**Not a dictation tool for prose.** It is built for instructions to a session —
short, imperative, technical. Dictating a paragraph works and is not what the
sixty-second cap is sized for.

**Not a voice assistant.** It does not answer you. It puts your words where you
could otherwise only type them. The mode that talks back is
[Coach](saas/coach.md), and it is a different feature that is not built yet.

**Not available on the Edge itself.** Connect IQ has no microphone API, so the
phone has to start the recording. Whether a button on the Edge could wake the
phone's recorder is an open question in [saas/voice.md](saas/voice.md).
