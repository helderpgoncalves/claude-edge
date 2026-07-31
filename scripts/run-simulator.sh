#!/usr/bin/env bash
# Build the app and run it in the Connect IQ simulator.
#
#   ./scripts/run-simulator.sh            # Edge 540
#   ./scripts/run-simulator.sh edge1050
#
# The simulator has no HTTPS requirement, so it can talk to a bridge on
# localhost — which is what makes it the fastest way to iterate. A real device
# cannot; see docs/deployment.md.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEVICE="${1:-edge540}"
PRG="$REPO_ROOT/build/$DEVICE.prg"

# --- locate the SDK -----------------------------------------------------------
SDK_CFG="$HOME/Library/Application Support/Garmin/ConnectIQ/current-sdk.cfg"
if [[ -n "${CIQ_SDK_PATH:-}" ]]; then
  SDK="$CIQ_SDK_PATH"
elif [[ -f "$SDK_CFG" ]]; then
  SDK="$(tr -d '\n' < "$SDK_CFG")"
else
  echo "Could not find the Connect IQ SDK. Set CIQ_SDK_PATH." >&2
  exit 1
fi
SDK="${SDK%/}"

if [[ -z "${JAVA_HOME:-}" ]] && [[ -d /opt/homebrew/opt/openjdk@21 ]]; then
  export JAVA_HOME=/opt/homebrew/opt/openjdk@21
fi
[[ -n "${JAVA_HOME:-}" ]] && export PATH="$JAVA_HOME/bin:$PATH"

# --- build --------------------------------------------------------------------
echo "Building for $DEVICE"
"$REPO_ROOT/scripts/build-edge.sh" "$DEVICE"

# --- simulator ----------------------------------------------------------------
# Only start one if none is running; the simulator does not take kindly to a
# second instance, and reusing it keeps whatever settings were entered.
if ! pgrep -f 'ConnectIQ.app/Contents/MacOS/simulator' >/dev/null 2>&1; then
  echo "Starting the simulator"
  open -a "$SDK/bin/ConnectIQ.app"

  # Poll rather than sleeping a guessed interval: cold start is much slower
  # than warm, and monkeydo fails outright if it connects too early.
  for _ in $(seq 1 40); do
    pgrep -f 'ConnectIQ.app/Contents/MacOS/simulator' >/dev/null 2>&1 && break
    sleep 0.5
  done
  sleep 3
else
  echo "Reusing the running simulator"
fi

echo "Loading $DEVICE"
"$SDK/bin/monkeydo" "$PRG" "$DEVICE"

cat <<'NOTES'

Loaded. To point it at a bridge:

  File > Edit Persistent Storage > Edit Application.Properties data

    serverUrl   http://127.0.0.1:8787     (the simulator allows plain HTTP)
    authToken   your READ_TOKEN

To give it something to mirror:

  ./scripts/demo-session.sh prompt

NOTES
