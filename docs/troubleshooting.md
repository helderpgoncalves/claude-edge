# Troubleshooting

Symptoms first, since that is what you have when something is wrong.

## On the device

### "Set the server URL in the Connect IQ app settings"

No URL or no token configured.

Phone: **Garmin Connect → your device → Connect IQ Apps → Claude Edge →
Settings**.

Sideloaded apps sometimes do not expose a settings panel there, because
settings are normally fetched from the store listing. Use Garmin Express on a
desktop instead, or build with `./scripts/build-edge.sh --dev` for the
simulator, which compiles in a local URL and token.

### "Server must use HTTPS"

Connect IQ refuses plain HTTP and self-signed certificates on a real device —
`SECURE_CONNECTION_REQUIRED (-1001)`. There is no flag to disable this.

You need a publicly trusted certificate. In order of least effort:

| | Cost | Domain needed |
|---|---|---|
| Tailscale Funnel | free | no |
| Cloudflare Tunnel | free | yes |
| VPS with Caddy | VPS | yes |

`http://127.0.0.1` and `http://localhost` are accepted, but only reach a bridge
running on the device itself — so in practice only the simulator.

### "No phone connection"

`BLE_CONNECTION_UNAVAILABLE (-104)`. Expected mid-ride and not a fault.

- Garmin Connect Mobile must be **running** on the phone, not merely installed.
- The phone must be within Bluetooth range.
- On iOS, check Garmin Connect has background refresh enabled.

The app keeps showing the last state it received, with its age in the header.

### "Token rejected"

The token does not match, or a read token was used for an action.

- Check for a trailing space or newline — pasting from a phone keyboard adds
  them routinely. The app trims, but check the value in settings.
- Approving prompts needs `WRITE_TOKEN`; `READ_TOKEN` only displays.
- Confirm the bridge is using the token you think: it prints a generated one on
  first run only if `READ_TOKEN` was unset.

### "Response too large. Reduce text size."

`NETWORK_RESPONSE_TOO_LARGE (-402)` or `-403`. The payload exceeded what
Connect IQ can parse.

Increase **Text size** in settings — a larger font means fewer rows, which
means a smaller response.

### "The screen changed. Look again."

Working as designed. The pane moved between the moment you read it and the
moment your approval arrived, so the server refused rather than answering a
prompt you had not seen. Look at the current screen and press again.

If it happens constantly, something is repainting the pane continuously — a
progress bar or a token counter. Check what is actually running in the session.

### "Pane is in scroll mode"

tmux is in copy mode, where it consumes keys itself and nothing reaches Claude
Code. At the keyboard, press `q` or Escape in that pane.

### Nothing happens, no error

- Is the app actually running? It is under **Activities & Apps**, not the
  widget loop.
- Is the bridge up? `curl https://your-domain/health`.
- Check the bridge log for `authentication failed`.

### The app crashes on launch

Almost always a `.prg` built for a different device. Rebuild for yours:

```bash
./scripts/build-edge.sh edge540
```

## On the bridge

### "tmux is not installed or not on PATH"

The bridge shells out to tmux and exits at startup without it.

```bash
brew install tmux         # macOS
apt install tmux          # Debian/Ubuntu
```

In Docker, check the container has it: `docker compose exec bridge tmux -V`.

### "No tmux server is running"

Start a session on the socket the bridge is configured with:

```bash
tmux -L claude-edge new-session -s claude
```

The socket name must match `TMUX_SOCKET` exactly. `tmux ls` does not show
sessions on a named socket — use `tmux -L claude-edge ls`.

### "Unknown session"

The requested session is not in the allowlist. Either it is not
`TMUX_SESSION`, or it is missing from `ALLOWED_SESSIONS`.

Names are validated as `^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`. A name containing
`:` or `.` is rejected, because tmux gives those characters meaning inside a
target.

### The bridge will not start

It refuses to boot on an invalid configuration rather than starting in a state
you would wrongly believe was working. The error names the field.

Common causes: a token shorter than 32 characters, a session name with an
invalid character, a port already in use.

### State is always "unknown"

The detector did not recognise the screen. See what it sees:

```bash
tmux -L claude-edge capture-pane -p -J -t claude | tail -20
```

Expect a cursor glyph (`❯`) and a footer hint ("Esc to cancel"). Both must be
present — a cursor alone appears in shell prompts and git logs.

If Claude Code has changed its prompt UI, that is a detector bug. Please open
an issue with the pane contents.

### A permission prompt is not detected

Same check as above, plus: is the prompt actually on the **visible** screen?
Detection deliberately ignores scrollback, because a shell `clear` scrolls
rather than erases and an answered prompt would otherwise be reported forever.

### Everything works, then stops after a change

Restart the bridge. A running process holds the old code, and a stale server
produces convincing false positives.

## In the simulator

### The app does not appear

`monkeydo` needs the simulator already running:

```bash
./scripts/run-simulator.sh edge540
```

### Settings will not stick

**File → Reset All App Data**, then reload. Or use `--dev`, which compiles the
values in.

### It cannot reach a local bridge

The simulator allows plain HTTP to loopback. Check:

- the bridge is on `127.0.0.1:8787`, not `0.0.0.0`
- **Settings → Use Device HTTPS Requirements** is off

## Building

### "monkeyc not found"

Install the SDK via the SDK Manager, or set `CIQ_SDK_PATH`.

### "Cannot find device"

Devices are not bundled with the SDK. In the SDK Manager's **Devices** tab they
are grouped by **API level**, not listed alphabetically — scroll to **API level
6.0** for the Edge 540 generation.

### An unhelpful Java error

The Connect IQ 9 compiler needs JDK 17+. macOS often still defaults to Java 8:

```bash
brew install openjdk@21
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
```

### "The launcher icon isn't compatible"

Each device declares an exact launcher size. Add a `resources-iconNN` layer and
point the product at it in `monkey.jungle`.

## Docker

### Port already in use

Something else is on 8787:

```bash
lsof -ti:8787 | xargs kill
```

### The container cannot see tmux

The socket directory must be bind-mounted and the names must match:

```bash
echo ${TMUX_TMPDIR:-/tmp}/tmux-$(id -u)   # set TMUX_SOCKET_DIR to this
```

### Hot reload does nothing

Confirm the source is mounted:

```bash
docker compose -f docker/compose.dev.yaml exec bridge ls -la /app/packages/server/src
```

## Still stuck

Open an issue with:

- what you expected and what happened
- `tmux -L <socket> capture-pane -p -J -t <session> | tail -20`
- the bridge log around the failure
- device model and app version
