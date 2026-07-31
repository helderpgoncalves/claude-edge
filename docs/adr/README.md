# Architecture decision records

Short notes on decisions that were not obvious, where the reasoning is worth
more than the conclusion. Each records what was decided, what it rules out, and
what would make it worth revisiting.

Decisions with an obvious answer are not recorded here — the code is the
record. These are the ones where a reasonable person could have chosen
differently.

| | Decision | Status |
|---|---|---|
| [0001](0001-poll-not-stream.md) | Poll for snapshots rather than stream | Accepted |
| [0002](0002-hash-bound-approvals.md) | Bind every approval to a screen hash | Accepted |
| [0003](0003-action-allowlist.md) | Action names on the wire, never keystrokes | Accepted |
| [0004](0004-behaviour-based-input.md) | Connect IQ behaviours rather than key codes | Accepted |
| [0005](0005-typescript-monorepo.md) | TypeScript monorepo with a shared contract | Accepted |
| [0006](0006-screen-scraping.md) | Screen-scraping as the authority, hooks as an accelerant | Accepted |
| [0007](0007-native-app-for-audio.md) | A native app, because the coach has to speak unprompted | Accepted |

## Format

Each record answers four questions:

- **Context** — what forced a decision
- **Decision** — what was chosen
- **Consequences** — what this costs and what it rules out
- **Revisit when** — the concrete change that would reopen it
