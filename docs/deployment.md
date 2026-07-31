# Deployment

The bridge must be reachable over HTTPS with a **publicly trusted certificate**.
Connect IQ rejects plain HTTP and self-signed chains with
`SECURE_CONNECTION_REQUIRED (-1001)` before the request leaves the phone. There
is no flag to disable this, so it shapes every option below.

## Choosing an approach

| | Public listener | Domain | Cost | Best for |
|---|---|---|---|---|
| [Tailscale Funnel](#tailscale-funnel) | no | no | free | trying it; the safest option |
| [Cloudflare Tunnel](#cloudflare-tunnel) | no | yes | free | a domain you already own |
| [VPS with Caddy](#vps-with-caddy) | yes | yes | VPS | always-on, full control |

**Tailscale Funnel is the recommendation.** Not because it is easiest, but
because the bridge never gets a public listener: it types into a terminal
running an agent with shell access, and the strongest control available is for
it not to be addressable from the open internet at all.

---

## Tailscale Funnel

The bridge stays on your machine, next to the tmux session it mirrors. Funnel
gives it a `*.ts.net` name with a real certificate.

```bash
# On the machine running Claude Code
brew install tailscale        # or your platform's package
sudo tailscale up

# Start the bridge on loopback
cd claude-edge
cp .env.example .env          # set READ_TOKEN and WRITE_TOKEN
pnpm build && pnpm --filter @claude-edge/server start

# Expose it
tailscale funnel 8787
```

Tailscale prints a URL like `https://your-machine.tailnet-name.ts.net`. Put
that in the device settings.

Turn it off with `tailscale funnel --https=443 off`.

**Caveat:** Funnel makes the port reachable from the internet, so the bearer
token is still the boundary. Serving it inside the tailnet only (`tailscale
serve`) is stronger, but the Edge reaches the network through Garmin Connect
Mobile on the phone, and the phone must therefore also be on the tailnet.

---

## Cloudflare Tunnel

```bash
brew install cloudflared
cloudflared tunnel login
cloudflared tunnel create claude-edge
cloudflared tunnel route dns claude-edge claude.example.com
cloudflared tunnel run --url http://localhost:8787 claude-edge
```

Same shape as Funnel: no inbound ports, Cloudflare terminates TLS.

---

## VPS with Caddy

For an always-on deployment. The compose stack runs the bridge behind Caddy,
which obtains and renews Let's Encrypt certificates on its own.

### 1. DNS

Point an A record at the VPS and let it propagate:

```
claude.example.com.  A  203.0.113.10
```

### 2. Install

```bash
ssh you@your-vps
git clone https://github.com/helderpgoncalves/claude-edge.git
cd claude-edge
cp .env.example .env
```

Generate two tokens:

```bash
openssl rand -base64 32 | tr -d '\n' | tr '+/' '-_'
```

Edit `.env`:

```bash
READ_TOKEN=...
WRITE_TOKEN=...
DOMAIN=claude.example.com
ACME_EMAIL=you@example.com
TMUX_SOCKET=claude-edge
TMUX_SOCKET_DIR=/tmp/tmux-1000     # echo ${TMUX_TMPDIR:-/tmp}/tmux-$(id -u)
```

### 3. Start the session

On a dedicated socket, so the bridge cannot reach anything else:

```bash
tmux -L claude-edge new-session -s claude
claude
# detach with Ctrl-B then D
```

### 4. Bring it up

```bash
docker compose -f docker/compose.yaml up -d
docker compose -f docker/compose.yaml logs -f caddy   # watch the certificate
curl https://claude.example.com/health
```

### 5. Firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp     # ACME needs this for the HTTP challenge
sudo ufw allow 443/tcp
sudo ufw enable
```

Port 8787 is deliberately absent: the bridge has no published port and is
reachable only through Caddy.

---

## Without Docker

```bash
pnpm install --prod
pnpm build
```

`/etc/systemd/system/claude-edge.service`:

```ini
[Unit]
Description=claude-edge bridge
After=network.target

[Service]
Type=simple
User=claude
WorkingDirectory=/opt/claude-edge
EnvironmentFile=/opt/claude-edge/.env
ExecStart=/usr/bin/node packages/server/dist/index.js
Restart=on-failure
RestartSec=5

# The bridge types into a terminal running an agent with shell access. It has
# no reason to be able to do anything else.
NoNewPrivileges=true
PrivateTmp=false            # false: the tmux socket lives in /tmp
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/tmp

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now claude-edge
sudo journalctl -u claude-edge -f
```

Note `PrivateTmp=false`: the tmux socket is in `/tmp`, and a private one would
hide it.

---

## Keeping the session alive

The bridge is stateless; the tmux session is not. If it dies, the bridge
reports `no_session` and there is nothing to mirror.

```bash
# Recreate on boot
@reboot tmux -L claude-edge new-session -d -s claude -c ~/project
```

Or a systemd user unit with `Restart=always`.

---

## Configuring the device

**Garmin Connect → your device → Connect IQ Apps → Claude Edge → Settings**

| | |
|---|---|
| Server URL | `https://claude.example.com` — no trailing slash |
| Access token | `WRITE_TOKEN` to approve, `READ_TOKEN` to only watch |
| Refresh rate | Adaptive |

---

## Operating it

```bash
docker compose -f docker/compose.yaml logs -f bridge
```

Every write is logged with what was sent, against which screen, and what the
screen became:

```json
{"action":"select:0","session":"claude","expect":"e56ee3eb","resultHash":"a1b2c3d4"}
```

If something is approved that should not have been, that is the record.

### Updating

```bash
git pull
docker compose -f docker/compose.yaml up -d --build
```

### Rotating tokens

Edit `.env` and restart. Every existing token becomes invalid immediately, so
update the device settings too.

### Backups

Only two things matter: `.env`, and `~/.garmin_keys/` on your build machine —
the developer key cannot be regenerated, and an app published with it can only
be updated by someone holding it.

---

## Before you expose it

- [ ] `READ_TOKEN` and `WRITE_TOKEN` are different, and 32+ random characters
- [ ] `TMUX_SOCKET` is set to a dedicated socket
- [ ] `ALLOW_DESTRUCTIVE` and `ALLOW_FREE_TEXT` are off unless you want them
- [ ] Claude Code's own `permissions.deny` is configured
- [ ] `curl https://your-domain/health` returns `{"ok":true}`
- [ ] `curl https://your-domain/api/v1/session` without a token returns 401

[docs/security.md](security.md) explains what each of those prevents.
