# ADR-0004: Connect IQ behaviours rather than key codes

**Status:** Accepted
**Date:** 2026-07-31

## Context

Edge devices disagree fundamentally about input, and the disagreement is not a
detail:

| Device | Physical buttons | Touch |
|---|---|---|
| Edge 540, 550, 530, MTB | lap, start, up, down, enter, menu, esc | No |
| Edge 840, 850, 830 | same seven | Yes |
| Edge 1040, 1050, Explore 2 | **start, lap only** | Yes |

An app written against `KEY_UP` and `KEY_DOWN` works on a 540 and is unusable
on a 1040, where those buttons do not exist. Handling both with device
detection means two input paths, and the one you do not own hardware for is the
one that breaks.

## Decision

Input is written against `WatchUi.BehaviorDelegate`, which abstracts the
difference at the platform level:

| Behaviour | Edge 540 | Edge 1040 |
|---|---|---|
| `onPreviousPage()` | up button | swipe down |
| `onNextPage()` | down button | swipe up |
| `onSelect()` | enter button | tap |
| `onBack()` | esc button | swipe right |
| `onMenu()` | menu button | long press |

`onKey()` is overridden underneath for the two buttons with no behaviour
mapping — lap and start — and every such use is guarded with a `has` check
because they are not present everywhere:

```monkeyc
if ((WatchUi has :KEY_LAP) && key == WatchUi.KEY_LAP) {
    _view.jumpToLive();
    return true;
}
```

Returning `true` marks the input consumed. Returning `false` from `onBack()`
exits the app, which is why the back handler unwinds state — cancel a pending
confirmation, then leave scrollback — and only returns `false` once there is
nothing left to undo.

## Consequences

**One binary works everywhere.** Twelve device targets, one input path, no
per-device branching.

**Some affordances are unavailable on some devices.** The lap-button shortcut
for jumping to the live tail does not exist on a 1040. The same action is
reachable from the menu, so nothing is lost, only slower.

**Behaviours are coarser than raw keys.** A long press cannot be distinguished
from a short one at this layer. Nothing here needs to.

**Gesture semantics are the platform's, not ours.** Swipe direction on the
touch Edges follows Garmin's convention rather than anything chosen here, which
is the correct outcome: it matches every other app on the device.

## Alternatives considered

**Raw `onKey()` with device detection.** Two code paths, and the untested one
rots.

**Touch-only, dropping the 540.** The 540 is the primary target and the most
common Edge with buttons. Backwards.

**Separate builds per input class.** Two binaries to build, test, sideload, and
keep in step, for a difference the platform already abstracts.

## Revisit when

- A future Edge introduces an input model behaviours do not cover.
- Something genuinely needs press-duration, which would require dropping to
  `onKeyPressed`/`onKeyReleased` for that one interaction.
