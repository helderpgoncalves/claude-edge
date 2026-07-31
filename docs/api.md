# API reference

The wire protocol between the bridge and its clients.

This document is **normative for the Monkey C implementation**. The device app
cannot import the TypeScript schemas in `packages/shared`, so it implements
this by hand — meaning any change here is a change to software already
installed on someone's handlebars. Treat it accordingly.

- **Base path:** `/api/v1`
- **Protocol version:** `1` (the `v` field)
- **Content type:** `application/json`
- **Authentication:** `Authorization: Bearer <token>` on every route except
  `/health`

## Conventions

Device-facing payloads use very short field names. This is not stylistic. Every
byte travels Edge → Bluetooth → phone → internet, and oversized responses fail
outright with `NETWORK_RESPONSE_TOO_LARGE (-402)`. A typical session response
is under 1 KB as a result.

Errors share one shape everywhere, so the device parses a single format:

```json
{ "ok": false, "code": "STALE_VIEW", "m": "The screen changed. Refresh and look again." }
```

`m` is capped at 80 characters and written to be shown verbatim on a 246-pixel
screen.

## Authentication

Two scopes:

| Token | Grants |
|---|---|
| `READ_TOKEN` | `GET /session`, `GET /meta` |
| `WRITE_TOKEN` | everything, including `POST /action` and `POST /text` |

A read token on a write route returns `403`. Only the `Authorization` header is
accepted — a token in a query string is rejected even when correct, because
query strings land in proxy logs and browser history.

---

## `GET /api/v1/session`

The device's main poll. Returns the current screen and state.

### Query parameters

| Name | Type | Default | Meaning |
|---|---|---|---|
| `lines` | 1–200 | 20 | Rows to return. The device asks for exactly what it can draw. |
| `width` | 20–240 | 40 | Columns to wrap to. The device reports its own usable width. |
| `offset` | 0–10000 | 0 | Scrollback offset. 0 is the live tail. |
| `session` | name | server default | tmux session. Must be in the server's allowlist. |
| `etag` | hash | — | Last known content hash, for a `304` short-circuit. |

### Response `200`

```json
{
  "v": 1,
  "s": "awaiting_permission",
  "L": ["Do you want to make this edit to app.ts?", "", "❯ Yes    No"],
  "h": "e56ee3eb",
  "ts": 1785496774,
  "n": 2,
  "tl": 23,
  "o": 9,
  "p": {
    "q": "Do you want to make this edit to app.ts?",
    "o": [{ "n": 1, "l": "Yes" }, { "n": 2, "l": "No" }],
    "t": "Edit",
    "d": true
  },
  "name": "claude"
}
```

| Field | Type | Meaning |
|---|---|---|
| `v` | `1` | Protocol version. |
| `s` | string | Session state. See below. |
| `L` | string[] | Terminal lines, oldest first, already wrapped to `width`. |
| `h` | string | Hash of the **visible** screen. Send back as `etag` and as `expect`. |
| `ts` | number | Server time (epoch seconds), so the device can show a real age. |
| `n` | 1–300 | Seconds until the device should poll again. |
| `tl` | number | Total wrapped lines available, for a scroll indicator. |
| `o` | number | Index of the first returned line within the total. |
| `p` | object? | The pending prompt, present when `s` is `awaiting_*`. |
| `name` | string? | Session label for the device header. |

### Session states

| `s` | Meaning | Typical `n` |
|---|---|---|
| `working` | Generating or running a tool. | 3 |
| `idle` | Stopped, waiting for input. | 15 |
| `awaiting_permission` | A permission prompt is blocking. | 2 |
| `awaiting_input` | A non-permission choice is blocking. | 2 |
| `no_session` | Pane exists but Claude Code is not running. | 30 |
| `unknown` | Could not be determined. | 15 |

**Clients must treat an unrecognised value as `unknown`** rather than failing.
That is what lets the server add a state without breaking installed devices.

### The prompt object

| Field | Type | Meaning |
|---|---|---|
| `q` | string | The question, ≤ 200 chars. |
| `o` | array | Options in display order: `n` is the 1-based position, `l` the label (≤ 64 chars). |
| `t` | string? | Tool being requested, when identifiable. |
| `d` | `true`? | The prompt offers an option granting lasting permission. |

### Response `304`

Returned when `etag` matches the current hash. Empty body.

The device keeps what it has and reschedules. Note that `n` cannot ride along
on a `304`, so the device must cache the interval from its last `200`.

### Errors

| Status | `code` | Cause |
|---|---|---|
| 400 | `INVALID_QUERY` | A parameter is out of range or malformed. |
| 401 | `UNAUTHENTICATED` | Missing or invalid token. |
| 404 | `NO_SUCH_SESSION` | Session is not in the allowlist, or does not exist. |
| 429 | `RATE_LIMITED` | Too many requests for this token. |
| 503 | `NO_SERVER` / `TMUX_NOT_FOUND` | tmux is not running or not installed. |

---

## `POST /api/v1/action`

Send an allowlisted action. **Requires the write token.**

```json
{
  "action": "select:1",
  "nonce": "a1b2c3d4e5f6",
  "expect": "e56ee3eb",
  "session": "claude"
}
```

| Field | Required | Meaning |
|---|---|---|
| `action` | yes | An allowlisted id, or `select:N`. |
| `nonce` | yes | Unique per user intent, 8–64 chars. A repeat replays rather than re-acts. |
| `expect` | no | Hash of the screen the user was looking at. **Send this for anything consequential.** |
| `session` | no | Defaults to the server's session. |

### Actions

Fetch the live list from `/meta`; a deployment may disable some.

| Category | Ids |
|---|---|
| Navigation | `up`, `down`, `left`, `right`, `enter`, `escape` |
| Control | `interrupt`, `clear_input`, `sigint`† |
| Prompt | `continue`, `run_tests`, `explain` |
| Selection | `select:0` … `select:8` |

† Disabled unless `ALLOW_DESTRUCTIVE=true`.

### `select:N` — answering a prompt

`N` is the **zero-based** index of an option in the prompt's `o` array.

The client says *which option it means*. The server re-reads the prompt and
works out which keys reach it, because Claude Code renders options either
horizontally (move with Right) or vertically (move with Down), and a client
that guessed wrong would select a different option silently.

An option granting lasting permission is refused with `403 ACTION_DISABLED`
unless the server has `ALLOW_DESTRUCTIVE=true`.

### The nonce

The device retries over an unreliable Bluetooth link. Without deduplication, a
retry delivers a second keypress into whatever is on screen by the time it
arrives.

- Unique per user intent, stable across retries of that intent.
- A repeat returns the original result with `"deduped": true`.
- A request **refused** for staleness or copy mode releases its nonce, so the
  user's corrected attempt is not deduplicated into replaying the failure.

### Response `200`

```json
{ "ok": true, "action": "select:1", "h": "a1b2c3d4", "deduped": false }
```

`h` is the hash after the action, so the client can resync immediately without
waiting for its next scheduled poll.

### Errors

| Status | `code` | Cause |
|---|---|---|
| 400 | `UNKNOWN_ACTION` | Not in the allowlist. |
| 403 | `FORBIDDEN` | Read token on a write route. |
| 403 | `ACTION_DISABLED` | Destructive action, and the server disallows them. |
| 409 | `STALE_VIEW` | The screen changed since `expect` was issued. |
| 409 | `PANE_IN_COPY_MODE` | tmux is in scroll mode and would swallow the keys. |
| 409 | `PANE_DEAD` | The pane has exited. |
| 409 | `NO_PROMPT` | `select:N` with nothing awaiting an answer. |
| 409 | `OPTION_OUT_OF_RANGE` | `N` exceeds the options on screen. |
| 409 | `IN_FLIGHT` | The same nonce is currently executing. |

---

## `POST /api/v1/text`

Free-text prompt. **Requires the write token, and `ALLOW_FREE_TEXT=true`.**

Disabled by default: free text into a running agent is arbitrary instruction to
a system with file and shell access. Intended for the phone, where there is a
real keyboard.

```json
{ "text": "add a test for the timeout case", "nonce": "...", "submit": true }
```

Control characters are stripped, text is capped at 2000 characters, and
delivery uses `send-keys -l --` so tmux performs no key-name lookup — the
string `Enter` arrives as five characters, not a keypress. `submit: false`
types without sending Enter, so a draft can be reviewed at the keyboard.

Errors add `403 FREE_TEXT_DISABLED`, `400 EMPTY_TEXT`, and `413 TEXT_TOO_LONG`.

---

## `GET /api/v1/meta`

Capability discovery. Fetched once at app start and cached; the device builds
its menu from this, so one binary adapts to a server with different policy.

```json
{
  "v": 1,
  "server": "0.1.0",
  "actions": [{ "id": "up", "label": "Up", "cat": "navigation" }],
  "sessions": [{ "name": "claude", "attached": true }],
  "freeText": false,
  "poll": { "working": 3, "idle": 15, "blocked": 2 }
}
```

Only allowlisted sessions are named, and disabled actions are omitted.

---

## `GET /health`

**Unauthenticated**, so an orchestrator can probe liveness without holding a
credential.

```json
{ "ok": true, "version": "0.1.0" }
```

Returns `503` when tmux is unreachable. It deliberately reveals nothing about
the session, its contents, or which sessions exist.

---

## Notes for the device implementation

**One request at a time.** Connect IQ caps concurrent requests platform-wide
and returns `BLE_QUEUE_FULL (-101)` past it. Track an in-flight flag and drop
ticks rather than queueing them: a skipped poll is invisible, a queue-full
error is a broken screen.

**Declare the response type.** Pass
`:responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON`. Relying on
the server's `Content-Type` fails with `UNSUPPORTED_CONTENT_TYPE_IN_RESPONSE`
if anything unexpected arrives.

**Treat these as normal, not as errors:**

| Code | Meaning | Response |
|---|---|---|
| `-104` `BLE_CONNECTION_UNAVAILABLE` | Phone out of range | Show last-known state with its age |
| `-2` `BLE_HOST_TIMEOUT` | Phone slow | Retry next tick |
| `-101` `BLE_QUEUE_FULL` | Too many in flight | Skip this tick |

`-1001 SECURE_CONNECTION_REQUIRED` means the URL is not HTTPS, or the
certificate is not publicly trusted. `-402` / `-403` mean the response was too
large: ask for fewer lines.

**Clamp `n`.** Between 2 and 300 seconds. A server should not be able to set an
arbitrary polling rate on hardware it does not own.
