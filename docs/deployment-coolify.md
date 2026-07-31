# Deploying to the VPS

How `edge.heldergoncalves.io` is deployed on the Coolify server, and how to
update it.

## Managed by Coolify

Project **Claude Edge** → application **claude-edge-web**, deployed by Coolify
itself. Press Deploy in the dashboard and it rebuilds from `main`.

| | |
|---|---|
| Compose | `/compose.web.yaml` |
| Domain | `https://edge.heldergoncalves.io` |
| Health check | `/api/health` |
| Containers | `web-hvr3b4f-*`, `postgres-hvr3b4f-*` |
| Status | `running:healthy` |

### The build context, which is what made the first deploy fail

Coolify copies **the compose file's own directory** as the build context. With
the file under `docker/`, `context: ..` climbed above what was copied and the
build died with a bare `lstat /artifacts/docker: no such file or directory`.

Hence `compose.web.yaml` at the repository root: the context is then the
repository, which is what the Dockerfile and a local `docker compose` both
already assumed. Do not move it back.

### Schema notes

Registration was done through Coolify's Eloquent models rather than raw SQL, so
its UUID format and relationships stayed its concern. Two things in this
version surprised the first attempt and are worth recording in case a future
release moves them again:

- API tokens are scoped to a team; `createToken` alone leaves `team_id` null
  and the insert fails.
- Environment variables are polymorphic — `resourceable_type` and
  `resourceable_id`, not `application_id`.

Also: repeated imports create duplicate variables rather than updating them.
Deduplicate by key, keeping the newest.

## Secrets## Secrets

Generated **on the server** with `openssl rand` and never printed:

```bash
POSTGRES_PASSWORD    40 chars
AUTH_SECRET          32 bytes, base64
```

They are not in the repository and never pass through a terminal on any other
machine. `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are empty until Google
sign-in is configured; the button stays hidden while they are.

## Updating

Press **Deploy** in the Coolify dashboard, or push to `main` if a webhook is
configured. Nothing needs doing over SSH.

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
