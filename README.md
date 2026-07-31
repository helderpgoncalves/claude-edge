# claude-edge

Watch and steer a [Claude Code](https://claude.com/claude-code) session from a
Garmin Edge cycling computer.

Claude Code runs on your machine inside tmux. A small bridge server reads the
pane, works out what the session is doing, and serves it over HTTPS. The Edge
polls that, shows you the terminal, and lets you answer permission prompts
without stopping — three button presses on the handlebars instead of stopping,
unlocking a phone, and finding a terminal app.

```
┌──────────────┐         ┌──────────────────┐        ┌─────────────────────┐
│  Garmin Edge │  BLE    │ Garmin Connect   │ HTTPS  │   bridge server     │
│    540       │◄───────►│ Mobile (phone)   │◄──────►│  (this repo)        │
└──────────────┘         └──────────────────┘        └──────────┬──────────┘
   shows the pane           the phone is the                    │ tmux
   answers prompts          network, nothing                    ▼
                            to install                ┌─────────────────────┐
                                                      │ tmux: claude code   │
                                                      └─────────────────────┘
```

The Edge has no WiFi and no internet of its own. Connect IQ proxies every
request through the Garmin Connect Mobile app you already have installed, over
Bluetooth — so there is no companion app to build, install, or pay for.

## Status

Working and tested end to end. Not yet published to the Connect IQ store; the
app is installed by sideloading (see [docs/installation.md](docs/installation.md)).

| Piece | State |
|---|---|
| Bridge server | Working — 127 tests, including integration against real tmux |
| Connect IQ app | Builds clean for 12 Edge models, 115–122 KB of a 1 MB budget |
| Docker deployment | Working — dev stack with hot reload, production stack with automatic TLS |
| Phone PWA | Planned — see [the roadmap](docs/roadmap.md) |

## What it looks like

On an Edge 540 (246×322, no touchscreen):

```
┌────────────────────────────────────────┐
│ Needs you                       claude │  ← header: state + session
├────────────────────────────────────────┤
│   I have reviewed the config and found │
│   one issue.                           │
│                                        │
│ Do you want to make this edit to       │
│ app.ts?                                │
│                                        │
│   ~/project/src/app.ts                 │
│     12  -  const timeout = 5000        │
│     12  +  const timeout = 30000       │
├────────────────────────────────────────┤
│ Do you want to make this edit?         │  ← the prompt, parsed out
│ 1 Yes                                  │
│ 2 Yes, and don't ask again             │
│ 3 No                                   │
└────────────────────────────────────────┘
```

The header turns amber the moment Claude needs you, and the device vibrates
once. Up and down scroll the history, enter opens the options, esc goes back.

## Quick start

Requires Node 22+, tmux, and (for the device app) the
[Connect IQ SDK](https://developer.garmin.com/connect-iq/sdk/).

```bash
git clone https://github.com/helderpgoncalves/claude-edge.git
cd claude-edge
pnpm install

# Start a tmux session on a dedicated socket and run Claude Code in it.
tmux -L claude-edge new-session -s claude
# (inside that session)
claude

# In another terminal: start the bridge.
cp .env.example .env
pnpm dev
```

The bridge prints a generated read token on first run. Then either:

- **Try it in the simulator** — `./scripts/run-simulator.sh edge540`
- **Put it on your Edge** — [docs/installation.md](docs/installation.md)
- **Run the whole thing in Docker** — `docker compose -f docker/compose.dev.yaml up`

For a real device you need the bridge reachable over HTTPS with a publicly
trusted certificate; Connect IQ rejects plain HTTP and self-signed certificates
outright. [docs/deployment.md](docs/deployment.md) covers a VPS with a domain,
and a tunnel for trying it without one.

## Documentation

| | |
|---|---|
| [Installation](docs/installation.md) | Toolchain, SDK, devices, sideloading onto an Edge |
| [Architecture](docs/architecture.md) | How the pieces fit, and why they are arranged this way |
| [API reference](docs/api.md) | The wire protocol between bridge and device |
| [Deployment](docs/deployment.md) | VPS, domain, TLS, Docker, systemd |
| [Security](docs/security.md) | Threat model and the reasoning behind each control |
| [Development](docs/development.md) | Repository layout, testing, adding an action |
| [Roadmap](docs/roadmap.md) | What is planned, and what was deliberately left out |
| [Decisions](docs/adr/) | Architecture decision records |
| [Troubleshooting](docs/troubleshooting.md) | Error codes and what they mean |

## Supported devices

Every Edge running Connect IQ 3.2 or later. Built and size-checked for all of
them on each change:

| | Screen | Input |
|---|---|---|
| **Edge 540**, 530, MTB | 246×322 | Buttons |
| Edge 550 | 420×600 | Buttons |
| Edge 840, 830 | 246×322 | Touch + buttons |
| Edge 850 | 420×600 | Touch + buttons |
| Edge 1040, 1030, 1030 Plus | 282×470 | Touch, two buttons |
| Edge 1050 | 480×800 | Touch, two buttons |
| Edge Explore 2 | 240×400 | Touch, two buttons |

The Edge 540 is the primary target and the one this is tested on. Devices with
only two physical buttons work through the same code path because input is
written against Connect IQ *behaviours* rather than raw keys — see
[ADR-0004](docs/adr/0004-behaviour-based-input.md).

## Security in one paragraph

This bridge types into a terminal running an agent that can edit files and run
shell commands, so it is built to be boring about it: the wire protocol carries
action *names* resolved against a server-side allowlist, never keystrokes;
every approval is bound to a hash of the exact screen you were looking at, so a
decision made seconds ago over a slow Bluetooth link cannot land on a different
prompt; authentication is a single unconditional gate before any parsing; and
options that grant lasting permission ("don't ask again") are refused unless you
explicitly enable them. [docs/security.md](docs/security.md) explains each
control and the failure it exists to prevent.

## Contributing

Bug reports and pull requests are welcome. `pnpm check` runs the same gate CI
does — typecheck, lint, and the full test suite. See
[docs/development.md](docs/development.md).

## Licence

MIT. See [LICENSE](LICENSE).

## Acknowledgements

Not affiliated with or endorsed by Garmin or Anthropic. Garmin, Edge, and
Connect IQ are trademarks of Garmin Ltd. Claude and Claude Code are products of
Anthropic.
