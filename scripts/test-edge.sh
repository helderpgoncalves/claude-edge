#!/usr/bin/env bash
# Run the Connect IQ unit tests in the simulator.
#
#   ./scripts/test-edge.sh              # Edge 540
#   ./scripts/test-edge.sh edge1050
#
# Compiles with --unit-test, which includes the (:test) functions that ordinary
# builds exclude, then runs them through the simulator and reports the result.
#
# These cover pure logic on the device side — URL validation, interval
# clamping, text handling. Rendering and input are not covered here; they are
# exercised by hand in the simulator, and by the server-side test suite for
# everything that crosses the wire.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$REPO_ROOT/edge-app"
OUT_DIR="$REPO_ROOT/build"
DEVICE="${1:-edge540}"

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

KEY="${CIQ_DEVELOPER_KEY:-$HOME/.garmin_keys/developer_key.der}"
if [[ ! -f "$KEY" ]]; then
  echo "No developer key. Run: ./scripts/setup-dev-key.sh" >&2
  exit 1
fi

if [[ -z "${JAVA_HOME:-}" ]] && [[ -d /opt/homebrew/opt/openjdk@21 ]]; then
  export JAVA_HOME=/opt/homebrew/opt/openjdk@21
fi
[[ -n "${JAVA_HOME:-}" ]] && export PATH="$JAVA_HOME/bin:$PATH"

mkdir -p "$OUT_DIR"
PRG="$OUT_DIR/$DEVICE-test.prg"

echo "Building unit tests for $DEVICE"
"$SDK/bin/monkeyc" \
  --jungles "$APP_DIR/monkey.jungle" \
  --device "$DEVICE" \
  --output "$PRG" \
  --private-key "$KEY" \
  --unit-test \
  --warn

# The simulator must be running before monkeydo can attach.
if ! pgrep -f 'ConnectIQ.app/Contents/MacOS/simulator' >/dev/null 2>&1; then
  echo "Starting the simulator"
  open -a "$SDK/bin/ConnectIQ.app"
  for _ in $(seq 1 40); do
    pgrep -f 'ConnectIQ.app/Contents/MacOS/simulator' >/dev/null 2>&1 && break
    sleep 0.5
  done
  sleep 3
fi

echo "Running tests"
echo

LOG="$(mktemp -t ciq-test)"
trap 'rm -f "$LOG"' EXIT

# -t runs the test suite and exits, rather than launching the app. The runner
# prints a RESULTS section; monkeydo's own exit status does not reflect test
# failures, so the summary line is what we judge on.
"$SDK/bin/monkeydo" "$PRG" "$DEVICE" -t 2>&1 | tee "$LOG" || true

echo

if grep -qE '^RESULTS' "$LOG"; then
  # The runner prints e.g. "Ran 12 tests. Passed: 12, Failed: 0"
  summary="$(grep -E 'Ran [0-9]+ tests' "$LOG" | tail -1)"
  echo "${summary:-No summary line found}"

  if grep -qE 'FAIL' "$LOG"; then
    echo
    echo "Failures:"
    grep -E 'FAIL' "$LOG" | sed 's/^/  /'
    exit 1
  fi
  exit 0
fi

echo "The test runner produced no RESULTS section." >&2
echo "The simulator may not have attached; try running it again." >&2
exit 1
