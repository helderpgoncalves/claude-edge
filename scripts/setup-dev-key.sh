#!/usr/bin/env bash
# Generate the Connect IQ developer key.
#
# Connect IQ signs every binary. The key identifies the *developer*, not the
# app, and is generated once and kept — losing it means store submissions can
# no longer be updated under the same identity.
#
# It is deliberately written outside the repository. A signing key in a working
# tree is one `git add -A` away from being published.
set -euo pipefail

KEY_DIR="${CIQ_KEY_DIR:-$HOME/.garmin_keys}"
KEY_DER="$KEY_DIR/developer_key.der"
KEY_PEM="$KEY_DIR/developer_key.pem"

if [[ -f "$KEY_DER" ]]; then
  echo "A developer key already exists:"
  echo "  $KEY_DER"
  echo
  echo "Reusing it. Delete it first if you genuinely want a new identity —"
  echo "apps signed with the old key cannot be updated with a new one."
  exit 0
fi

mkdir -p "$KEY_DIR"
chmod 700 "$KEY_DIR"

echo "Generating a 4096-bit RSA developer key..."

# Connect IQ requires PKCS#8 DER. The PEM is kept alongside it because some
# tooling wants that form, and regenerating it later is not possible.
openssl genrsa -out "$KEY_PEM" 4096 2>/dev/null
openssl pkcs8 -topk8 -inform PEM -outform DER \
  -in "$KEY_PEM" -out "$KEY_DER" -nocrypt

chmod 600 "$KEY_PEM" "$KEY_DER"

echo
echo "Written:"
echo "  $KEY_DER   (used by monkeyc)"
echo "  $KEY_PEM"
echo
echo "Back these up. They cannot be regenerated, and an app published with"
echo "this key can only be updated by someone holding it."
