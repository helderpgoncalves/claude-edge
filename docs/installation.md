# Installation

Two halves: the bridge server on the machine running Claude Code, and the app
on the Edge. The bridge is the easy half.

## Prerequisites

| | Why | Check |
|---|---|---|
| Node 22+ | Runs the bridge | `node --version` |
| pnpm 10+ | Workspace manager | `corepack enable && pnpm --version` |
| tmux 3.0+ | The session being mirrored | `tmux -V` |
| Connect IQ SDK 7+ | Only to build the device app | see below |
| JDK 17+ | The SDK compiler needs it | `java -version` |

macOS:

```bash
brew install node tmux
brew install openjdk@21
corepack enable
```

Java 8 is still the default on many Macs, and the Connect IQ 9 compiler fails
against it with an unhelpful class-version error. Point `JAVA_HOME` at 21:

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
export PATH="$JAVA_HOME/bin:$PATH"
```

## The bridge

```bash
git clone https://github.com/helderpgoncalves/claude-edge.git
cd claude-edge
pnpm install

cp .env.example .env
```

Generate two tokens and put them in `.env`:

```bash
openssl rand -base64 32 | tr -d '\n' | tr '+/' '-_'
```

Start Claude Code on a dedicated tmux socket — this is what stops the bridge
being able to reach your other sessions:

```bash
tmux -L claude-edge new-session -s claude
# inside that session:
claude
```

Then, in another terminal:

```bash
pnpm dev
```

Check it:

```bash
curl -s localhost:8787/health
# {"ok":true,"version":"0.1.0"}

curl -s -H "Authorization: Bearer $READ_TOKEN" \
  "localhost:8787/api/v1/session?lines=10&width=40" | jq .
```

### Or with Docker

Brings up the bridge plus a demo tmux session holding a realistic Claude Code
screen, so you can see it working before wiring up a real session:

```bash
docker compose -f docker/compose.dev.yaml up
```

## The Connect IQ SDK

Needed only to build the device app.

1. Download the [SDK Manager](https://developer.garmin.com/connect-iq/sdk/).
2. **SDK** tab: install the latest SDK.
3. **Devices** tab: this is where people get stuck. Devices are grouped by
   **API level**, not listed alphabetically — scroll up to **API level 6.0** to
   find Edge 540 and its contemporaries. Download at least your own model.

### Developer key

Connect IQ signs every binary. The key identifies you, not the app, and is
generated once:

```bash
./scripts/setup-dev-key.sh
```

Keep it. Losing it means store submissions cannot be updated under the same
identity.

### Building

```bash
./scripts/build-edge.sh              # Edge 540
./scripts/build-edge.sh edge1050     # a specific model
./scripts/build-edge.sh --all        # every supported model
```

Each build reports its size against that device's 1 MB limit.

## The simulator

Fastest way to see it working, and it has no HTTPS requirement — so it talks to
a local bridge directly:

```bash
./scripts/run-simulator.sh edge540
```

Set the server URL and token in the simulator under
**File → Edit Persistent Storage → Edit Application.Properties data**.

Paint a realistic screen to mirror:

```bash
./scripts/demo-session.sh prompt     # a permission prompt
./scripts/demo-session.sh working    # Claude thinking
./scripts/demo-session.sh idle       # waiting for input
```

## Onto a real Edge

### 1. The bridge needs a public HTTPS address

Not optional. Connect IQ rejects plain HTTP and self-signed certificates with
`SECURE_CONNECTION_REQUIRED (-1001)`.

Options, best first:

- **Tailscale Funnel** — free, no domain needed, and the bridge keeps no public
  listener.
- **Cloudflare Tunnel** — free, needs a domain.
- **A VPS with a domain** — see [deployment.md](deployment.md).

### 2. Copy the app across

```bash
./scripts/build-edge.sh edge540
```

Connect the Edge by USB. It mounts as a drive. Copy the binary:

```bash
cp build/edge540.prg /Volumes/GARMIN/GARMIN/APPS/
```

Eject and disconnect. The device verifies the app and moves it into internal
storage, so **the file disappearing from the mount is expected** — not a
failure.

### 3. Configure it

On the phone: **Garmin Connect → your device → Connect IQ Apps → Claude Edge →
Settings**.

| Setting | Value |
|---|---|
| Server URL | `https://your-domain.example` (no trailing slash) |
| Access token | your `READ_TOKEN`, or `WRITE_TOKEN` to approve prompts |
| tmux session | leave empty for the server default |
| Refresh rate | Adaptive |
| Text size | Smallest fits the most |

Sideloaded apps sometimes do not expose settings in the Connect IQ mobile app,
because settings are normally fetched from the store listing. If the panel is
missing, use Garmin Express on a desktop.

### 4. Run it

On the Edge: **Menu → Activities & Apps → Claude Edge**.

The phone must have Garmin Connect Mobile running — it is the network path.

## Verifying

| | Expected |
|---|---|
| `curl localhost:8787/health` | `{"ok":true,...}` |
| `./scripts/build-edge.sh --all` | 12 devices, no warnings |
| `pnpm check` | typecheck, lint, 127 tests |
| Simulator | header shows a state, not an error |
| Device | terminal text within a few seconds |

If something is wrong, [troubleshooting.md](troubleshooting.md) lists the error
codes and what each actually means.
