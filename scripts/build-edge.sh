#!/usr/bin/env bash
# Build the Connect IQ app.
#
#   ./scripts/build-edge.sh                 # the default device (edge540)
#   ./scripts/build-edge.sh edge1050        # one specific device
#   ./scripts/build-edge.sh --all           # every supported device
#   ./scripts/build-edge.sh --package       # a signed .iq for the store
#
# Reports each binary's size against the device's memory limit, because a build
# that succeeds can still be too large to install.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$REPO_ROOT/edge-app"
OUT_DIR="$REPO_ROOT/build"

DEFAULT_DEVICE="edge540"

# Every device listed in the manifest. Kept in sync by CI, which fails if the
# manifest gains a product this list does not have.
ALL_DEVICES=(
  edge540 edge550 edge530 edgemtb
  edge840 edge850 edge830
  edge1040 edge1050 edge1030 edge1030plus edgeexplore2
)

# --- locate the SDK -----------------------------------------------------------
# The SDK Manager records the active SDK here. Reading it means the script keeps
# working after an SDK upgrade without anyone editing a hardcoded version.
SDK_CFG="$HOME/Library/Application Support/Garmin/ConnectIQ/current-sdk.cfg"
if [[ -n "${CIQ_SDK_PATH:-}" ]]; then
  SDK="$CIQ_SDK_PATH"
elif [[ -f "$SDK_CFG" ]]; then
  SDK="$(tr -d '\n' < "$SDK_CFG")"
else
  echo "Could not find the Connect IQ SDK." >&2
  echo "Install it with the SDK Manager, or set CIQ_SDK_PATH." >&2
  exit 1
fi
SDK="${SDK%/}"

MONKEYC="$SDK/bin/monkeyc"
if [[ ! -x "$MONKEYC" ]]; then
  echo "monkeyc not found at: $MONKEYC" >&2
  exit 1
fi

# --- developer key ------------------------------------------------------------
# Connect IQ signs every binary. The key is generated once and is not shared;
# it identifies the developer, not the app.
KEY="${CIQ_DEVELOPER_KEY:-$HOME/.garmin_keys/developer_key.der}"
if [[ ! -f "$KEY" ]]; then
  echo "No developer key at: $KEY" >&2
  echo "Create one with: ./scripts/setup-dev-key.sh" >&2
  exit 1
fi

# --- Java ---------------------------------------------------------------------
# The 9.x SDK needs a modern JDK; macOS often still has Java 8 as the default,
# which fails with an unhelpful class-version error deep inside the compiler.
if [[ -z "${JAVA_HOME:-}" ]] && [[ -d /opt/homebrew/opt/openjdk@21 ]]; then
  export JAVA_HOME=/opt/homebrew/opt/openjdk@21
fi
if [[ -n "${JAVA_HOME:-}" ]]; then
  export PATH="$JAVA_HOME/bin:$PATH"
fi

# --- helpers ------------------------------------------------------------------

#! Memory limit for a device's watchApp type, read from its own compiler.json
#! rather than assumed, so the check stays correct as Garmin ships new hardware.
device_memory_limit() {
  local device="$1"
  local json="$HOME/Library/Application Support/Garmin/ConnectIQ/Devices/$device/compiler.json"
  [[ -f "$json" ]] || { echo 0; return; }
  python3 - "$json" <<'PY'
import json, sys
try:
    data = json.load(open(sys.argv[1]))
    for entry in data.get("appTypes", []):
        if entry.get("type") == "watchApp":
            print(entry.get("memoryLimit", 0)); break
    else:
        print(0)
except Exception:
    print(0)
PY
}

build_one() {
  local device="$1"
  local out="$OUT_DIR/$device.prg"

  printf '%-14s ' "$device"

  if ! output="$("$MONKEYC" \
        --jungles "$APP_DIR/monkey.jungle" \
        --device "$device" \
        --output "$out" \
        --private-key "$KEY" \
        --warn 2>&1)"; then
    echo "FAILED"
    echo "$output" | sed 's/^/    /'
    return 1
  fi

  local size limit
  size=$(wc -c < "$out" | tr -d ' ')
  limit=$(device_memory_limit "$device")

  if [[ "$limit" -gt 0 ]]; then
    printf 'ok  %6s KB  (%s%% of %s KB)\n' \
      "$((size / 1024))" \
      "$((size * 100 / limit))" \
      "$((limit / 1024))"
  else
    printf 'ok  %6s KB\n' "$((size / 1024))"
  fi

  # Warnings are printed but do not fail the build; the compiler emits some for
  # API-level differences between devices that are expected here.
  if grep -q 'WARNING' <<<"$output"; then
    echo "$output" | grep 'WARNING' | sed 's/^/    /'
  fi
}

# --- main ---------------------------------------------------------------------
mkdir -p "$OUT_DIR"

case "${1:-$DEFAULT_DEVICE}" in
  --all)
    echo "Building for ${#ALL_DEVICES[@]} devices"
    echo
    failed=0
    for device in "${ALL_DEVICES[@]}"; do
      build_one "$device" || failed=$((failed + 1))
    done
    echo
    if [[ $failed -gt 0 ]]; then
      echo "$failed device(s) failed to build"
      exit 1
    fi
    echo "All devices built into $OUT_DIR"
    ;;

  --package)
    # A .iq bundles every product's binary for store submission.
    out="$OUT_DIR/claude-edge.iq"
    echo "Packaging for the Connect IQ store"
    "$MONKEYC" \
      --jungles "$APP_DIR/monkey.jungle" \
      --output "$out" \
      --private-key "$KEY" \
      --package-app \
      --release \
      --warn
    echo "Wrote $out"
    ;;

  --help | -h)
    sed -n '2,9p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'
    ;;

  *)
    build_one "$1"
    ;;
esac
