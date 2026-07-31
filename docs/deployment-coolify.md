# Deploying to the VPS

How `edge.heldergoncalves.io` is deployed on the Coolify server, and how to
update it.

## Registered in Coolify

Project **Claude Edge** → application **claude-edge-web**, visible in the
dashboard with its environment variables managed there.

One caveat worth knowing. The containers were started over SSH before the
application was registered, so Coolify adopted a deployment it did not create.
Everything works and appears in the UI, but the first deploy triggered *from*
Coolify will rebuild from the repository — expect a short restart the first
time you press Deploy.

Registration was done through Coolify's own Eloquent models rather than raw
SQL, so its UUID format and relationships stayed its concern. Two schema
surprises found along the way, in case a future version moves them again:
tokens are scoped to a team, and environment variables are polymorphic
(`resourceable_type` / `resourceable_id`, not `application_id`).

## What is running

| | |
|---|---|
| Host | `91.98.22.239`, Coolify with a Traefik proxy |
| Path | `/data/claude-edge/` |
| Domain | `edge.heldergoncalves.io`, TLS through Cloudflare |
| Services | `claude-edge-web-web-1`, `claude-edge-web-postgres-1` |

```
/data/claude-edge/
  .env                          secrets, 0600, generated on the server
  repo/                         a clone of the GitHub repository
    docker-compose.override.yaml  Traefik labels, written on the host
```

## Secrets

Generated **on the server** with `openssl rand` and never printed:

```bash
POSTGRES_PASSWORD    40 chars
AUTH_SECRET          32 bytes, base64
```

They are not in the repository and never pass through a terminal on any other
machine. `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are empty until Google
sign-in is configured; the button stays hidden while they are.

## Updating

```bash
ssh root@91.98.22.239
cd /data/claude-edge/repo
git fetch origin main && git reset --hard origin/main
cp ../.env .env
docker compose -f compose.web.yaml -f docker-compose.override.yaml \
  --env-file .env up -d --build
```

## The override file

Coolify's proxy reads Traefik labels from the container. The compose file in the
repository has none, because someone self-hosting will not be running Coolify —
they belong to this deployment, not to the project.

`docker-compose.override.yaml` lives on the host and adds them, following the
same pattern as the other applications on this server.

## Checks

```bash
curl -sI https://edge.heldergoncalves.io | head -1     # HTTP/2 200
curl -s  https://edge.heldergoncalves.io/api/health    # {"ok":true}
docker compose -f compose.web.yaml ps           # both healthy
```

The health check deliberately does not touch Postgres. A database blip should
not restart a web app that is otherwise fine.

## Still to do

- **Database migrations.** The schema exists in code; nothing has been applied.
  Needs `drizzle-kit push` or a generated migration on first deploy.
- **Google OAuth.** Create credentials in Google Cloud Console, add the
  redirect URI `https://edge.heldergoncalves.io/api/auth/callback/google`, and
  put the values in `/data/claude-edge/.env`.
- **Backups.** The Postgres volume is not backed up. Nothing irreplaceable is
  in it yet, and that stops being true the moment someone signs up.
