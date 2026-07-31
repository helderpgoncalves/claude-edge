#!/usr/bin/env bash
# Paint a realistic Claude Code screen into a tmux pane, for development and for
# trying the device app without a live Claude Code session.
#
# The pane then runs `cat`, which parks it on a live process and echoes anything
# the bridge types. That makes it easy to see exactly what an approval delivered.
#
# Implementation note: the screen text is written into the pane's own heredoc
# rather than to a temp file on the host. A temp file would have to outlive the
# pane's read of it, and cleaning it up on exit races against the shell inside
# tmux ever getting round to opening it.
set -euo pipefail

SOCKET="${TMUX_SOCKET:-claude-edge}"
SESSION="${TMUX_SESSION:-claude}"
SCREEN="${1:-prompt}"

tmux -L "$SOCKET" has-session -t "$SESSION" 2>/dev/null ||
  tmux -L "$SOCKET" new-session -d -s "$SESSION" -x 100 -y 30

screen_text() {
  case "$1" in
    prompt)
      cat <<'SCREEN'
  I have reviewed the config and found one issue.

╭────────────────────────────────────────────────╮
│ Do you want to make this edit to app.ts?       │
╰────────────────────────────────────────────────╯

  ~/project/src/app.ts
    12  -  const timeout = 5000
    12  +  const timeout = 30000

❯ Yes    Yes, and don't ask again    No

  Esc to cancel
SCREEN
      ;;
    bash)
      cat <<'SCREEN'
  Bash command

    npm run build

│ Do you want to run this command?

❯ Yes    No

  Esc to cancel
SCREEN
      ;;
    vertical)
      cat <<'SCREEN'
  Claude has written up a plan. Would you like to proceed?

❯ 1. Yes, and auto-accept edits
  2. Yes, and manually approve edits
  3. No, keep planning

  Enter to select · Esc to cancel
SCREEN
      ;;
    working)
      cat <<'SCREEN'
  Reading src/services/tmux.ts
  Reading src/routes/action.ts

✻ Thinking… (24s · 3.1k tokens · esc to interrupt)
SCREEN
      ;;
    idle)
      cat <<'SCREEN'
  Done. I updated the timeout and added a regression test.

╭────────────────────────────────────────────────╮
│ >                                              │
╰────────────────────────────────────────────────╯
  ? for shortcuts
SCREEN
      ;;
    *)
      echo "Unknown screen: $1" >&2
      echo "Use one of: prompt, bash, vertical, working, idle" >&2
      exit 1
      ;;
  esac
}

text="$(screen_text "$SCREEN")"

# Stop whatever is running in the pane first.
tmux -L "$SOCKET" send-keys -t "$SESSION" C-c
sleep 0.3

# Deliver the multi-line screen through a tmux paste buffer rather than
# send-keys.
#
# `send-keys -l` sends its argument as literal characters but does *not* send a
# newline for each embedded line break — a multi-line heredoc typed that way
# arrives as one unterminated line and the shell simply waits. load-buffer takes
# the text on stdin, newlines and all, and paste-buffer delivers it as typed
# input; -d discards the buffer afterwards so repeated runs do not accumulate.
tmux -L "$SOCKET" send-keys -t "$SESSION" -l -- 'clear'
tmux -L "$SOCKET" send-keys -t "$SESSION" Enter
sleep 0.2

# Write the screen to a file the pane reads, then park the pane on `cat`.
#
# The file is deliberately persistent rather than a mktemp cleaned up on exit:
# the pane's shell opens it asynchronously, so deleting it when this script
# returns races against that read and usually wins, leaving a blank screen.
# A fixed path under the state directory is rewritten on each run instead.
state_dir="${XDG_STATE_HOME:-$HOME/.local/state}/claude-edge"
mkdir -p "$state_dir"
screen_file="$state_dir/demo-screen.txt"
printf '%s\n' "$text" > "$screen_file"

tmux -L "$SOCKET" send-keys -t "$SESSION" -l -- "clear; cat '$screen_file'; cat"
tmux -L "$SOCKET" send-keys -t "$SESSION" Enter

sleep 0.8

echo "Painted '$SCREEN' into $SOCKET:$SESSION"
echo "---"
tmux -L "$SOCKET" capture-pane -p -J -t "$SESSION" | tail -16
