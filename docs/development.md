# Development

## Layout

```
packages/
  shared/          wire contract: Zod schemas, types, text helpers
  server/          the bridge
    src/
      routes/      HTTP: validate, authorise, shape responses
      services/    tmux, detection, key mapping, replay protection
      middleware/  the authentication gate
    test/          unit and integration tests
edge-app/
  source/          Monkey C
    tests/         Toybox.Test unit tests, excluded from normal builds
  resources/       strings, settings; shared by every device
  resources-icon*/ one launcher icon per exact device size
  resources-dev/   development defaults, dev builds only
docker/            dev and production stacks
scripts/           build, test, simulator, demo
docs/              this
```

## Everyday commands

```bash
pnpm dev            # bridge with hot reload
pnpm test           # server + shared tests
pnpm typecheck      # strict TypeScript
pnpm check          # the gate CI runs

./scripts/build-edge.sh              # Edge 540
./scripts/build-edge.sh --all        # all 12 models, with size against the limit
./scripts/build-edge.sh --dev        # bakes in a local server URL and token
./scripts/test-edge.sh               # Monkey C unit tests in the simulator
./scripts/run-simulator.sh edge540   # build and launch
./scripts/demo-session.sh prompt     # paint a screen to mirror
```

## Testing

Three layers, each covering what the others cannot.

### Server tests — `pnpm test`

Run against a **real tmux server**, not a mock. That is deliberate: the value
of `tmux.ts` is entirely in how it interacts with the actual binary, and a mock
would happily confirm assumptions the real tmux rejects. Two bugs found this
way would have passed against a mock:

- `tmux -F` sanitises `\n` to `_` when the format arrives as a single argv
  element — so a newline-delimited format works when typed by hand and fails
  silently in code.
- A shell `clear` does not erase tmux's scrollback, so an answered prompt stays
  in the history buffer and a detector reading history keeps reporting it.

Each test file gets its own tmux socket, cleaned up afterwards, so files
running in parallel cannot kill each other's server.

### Device tests — `./scripts/test-edge.sh`

`Toybox.Test` functions annotated `(:test)`, compiled only with `--unit-test`
and run in the simulator. They cover the device-side logic that is easy to get
wrong and hard to see: URL validation, interval clamping, text trimming.

```monkeyc
(:test)
function testLoopbackRejectsImpostors(logger as Test.Logger) as Boolean {
    // A prefix match on "127." would accept a hostname that merely begins
    // with it and resolves anywhere at all.
    Test.assert(!Config.isLoopback("http://127.0.0.1.attacker.example"));
    return true;
}
```

### Against a live Claude Code session

The layer that finds the bugs the other two cannot, because it is the only one
using Claude Code's *actual* output:

```bash
tmux -L claude-edge new-session -d -s claude -c /tmp/scratch
tmux -L claude-edge send-keys -t claude 'command claude' Enter
```

`command claude` bypasses a common shell alias carrying
`--dangerously-skip-permissions`, which would suppress the very prompts being
tested.

This is how the missed "Yes, allow all edits during this session" wording was
found — invented fixtures all passed; the real prompt did not.

## Adding an action

1. Add it to `ACTIONS` in `packages/server/src/services/keymap.ts`.
2. If it grants lasting capability, set `destructive: true`.
3. Add a test in `packages/server/test/api.test.ts`.
4. Update the table in `docs/api.md`.

The device needs no change: it builds its menu from `/meta`.

## Changing the wire protocol

The Monkey C app cannot import the TypeScript schemas — it implements the
protocol by hand. So a change here is a change to software already installed on
someone's handlebars.

- **Adding an optional field** is safe. Old devices ignore it.
- **Removing or renaming a field** is breaking. Bump `PROTOCOL_VERSION`, serve
  the old shape for one release, and update `docs/api.md`, which is normative
  for the device implementation.

## Never put fabricated content on the device screen

The Edge is a **mirror of a real tmux pane**. Every line it renders must have
come from `capture-pane` on an actual session.

This sounds obvious and is easy to violate. During development a layout was
tested by hardcoding plausible terminal lines into the view — a diff, a
question, three options — and the resulting screenshot was indistinguishable
from the real thing. It looked correct precisely because it was invented to
look correct.

Why it matters more here than in most UIs: a rider approves a permission prompt
based on what this screen shows. Text that did not come from the session is not
a cosmetic defect — it is the app misrepresenting what an agent is asking to do.

The rules:

- **Terminal lines enter the view through exactly one path**, the bridge
  response handler. There is no other setter, and there should never be one.
- **Absence is rendered as absence.** No data yet shows "Connecting…", not
  filler. An empty pane and an unreachable bridge must look different.
- **Ride metrics are separate and separately sourced.** They come from
  `Activity.getActivityInfo()` and show `--` when a sensor is missing. They are
  never mixed into the terminal text.
- **To test a layout, use a real session.** `./scripts/demo-session.sh` paints
  a realistic screen into a real tmux pane, so the data path is exercised
  end to end rather than bypassed.

## Working on detection

`detect.ts` is screen-scraping, and the rules that keep it honest are:

- **Match on structure, not wording.** Cursor glyph plus footer hint plus box
  frame. Copy changes between releases; structure rarely does.
- **Fail to `unknown`.** Never guess. A wrong state means the rider approves
  something they did not read.
- **Test against real output.** The destructive-label list is a record of
  wording actually observed, not a prediction.

## Working on the device app

- **Compute layout, never hardcode it.** Targets span 246×322 to 480×800.
  Derive positions from `dc.getWidth()`/`getHeight()` and measured font metrics.
- **Use behaviours, not key codes.** An Edge 540 has seven buttons; an Edge 1040
  has two and a touchscreen. `BehaviorDelegate` abstracts that —
  [ADR-0004](adr/0004-behaviour-based-input.md).
- **Guard optional symbols.** `if (WatchUi has :KEY_LAP)`. Calling a missing
  symbol is a crash, not a no-op.
- **`requestUpdate()` only on change.** Repainting on every timer tick is a real
  battery cost over a six-hour ride.
- **Watch memory.** The simulator shows usage live; the app sits around 20 KB of
  1 MB.

## Code style

Comments explain *why*, not *what*. The reasoning behind a non-obvious choice is
worth keeping; a restatement of the code is not.

TypeScript runs strict, with `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes`. Prettier and ESLint are configured in-repo and
run on save in VS Code.

## Debugging

**The device shows an error.** [troubleshooting.md](troubleshooting.md) lists
every Connect IQ error code and what it actually means.

**Detection is wrong.** Dump what the server sees:

```bash
node --experimental-strip-types -e "
import('./packages/server/src/services/session.ts').then(async m => {
  const r = await m.readSession({session:'claude', lines:20, width:40,
    offset:0, pollFor:()=>3, socket:'claude-edge'});
  console.log(r.payload.s, JSON.stringify(r.payload.p, null, 2));
});"
```

**Something changed but did not take effect.** Restart the bridge. A running
process holds the old code, and a stale server produces convincing false
positives — that cost an hour once.

## Contributing

`pnpm check` must pass, `./scripts/build-edge.sh --all` must produce no
warnings, and new behaviour needs a test. For anything touching detection or
the write path, test against a live Claude Code session and say so in the pull
request.
