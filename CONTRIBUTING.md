# Contributing

Bug reports and pull requests are welcome.

## Before you start

For anything larger than a fix, open an issue describing **the problem** before
the solution. [docs/roadmap.md](docs/roadmap.md) lists what is planned and, more
usefully, what was considered and deliberately rejected — the reasoning there
explains most of the shape of this codebase.

## Setting up

```bash
git clone https://github.com/helderpgoncalves/claude-edge.git
cd claude-edge
pnpm install
cp .env.example .env
```

Working on the device app also needs the Connect IQ SDK and a developer key —
see [docs/installation.md](docs/installation.md).

## The bar

Every pull request:

```bash
pnpm check                        # typecheck, lint, 130 tests
./scripts/build-edge.sh --all     # 12 devices, zero warnings
```

Changes to the device app also need:

```bash
./scripts/test-edge.sh            # Monkey C unit tests in the simulator
```

New behaviour needs a test. A bug fix needs a test that fails before it.

## Testing against a live session

**Required for anything touching detection or the write path.** Say in the pull
request that you did it.

```bash
tmux -L claude-edge new-session -d -s claude -c /tmp/scratch
tmux -L claude-edge send-keys -t claude 'command claude' Enter
```

`command claude` bypasses a common shell alias carrying
`--dangerously-skip-permissions`, which suppresses the very prompts you need.

This matters because invented fixtures are reassuring and wrong. The
"Yes, allow all edits during this session" option — which grants a capability
for the rest of the session — was not being flagged as destructive, and every
fixture passed. Only a real prompt showed it.

## Style

- **Comments explain why, not what.** The reasoning behind a non-obvious choice
  is worth keeping; a restatement of the code is not.
- TypeScript runs strict. Prettier and ESLint are configured in-repo.
- Monkey C: 4-space indent, guard optional symbols with `has`.

## Areas where help is most useful

**A bitmap monospace font.** The largest legibility improvement available.
Connect IQ ships no monospace font and `getVectorFont()` does not exist on any
Edge, so terminal output currently renders proportionally and columns do not
line up. Needs a BMFont at each device's exact size, 1-bit and glyph-filtered.

**Testing on Edge models other than the 540.** The code builds and is size-
checked for all twelve, but only the 540 has been used on an actual ride. The
1040/1050 in particular take a different input path — two buttons and a
touchscreen rather than seven buttons.

**Detection against Claude Code updates.** The prompt UI changes between
releases. If you see a prompt the app renders as `unknown`, open an issue with
the pane contents.

## Changing the wire protocol

The device app implements the protocol by hand — Monkey C cannot import the
TypeScript schemas — so a change is a change to software already on someone's
handlebars.

- Adding an optional field is safe.
- Removing or renaming one is breaking: bump `PROTOCOL_VERSION`, serve the old
  shape for one release, update [docs/api.md](docs/api.md).

## Security

Do not open a public issue for a vulnerability. Use a GitHub security advisory.

[docs/security.md](docs/security.md) sets out the threat model. The two
properties to preserve above all:

1. **The wire protocol carries action names, never keystrokes.** A leaked token
   must grant exactly the actions in the allowlist and nothing more.
2. **Approvals are bound to a hash of the screen the rider saw.** Without it, a
   multi-second Bluetooth round trip lands an approval on whatever prompt
   happens to be showing when it arrives.

## Licence

Contributions are accepted under the MIT licence.
