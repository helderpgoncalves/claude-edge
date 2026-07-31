#!/usr/bin/env bash
# Rename the whole project.
#
#   ./scripts/rename.sh "RideAI" rideai
#   ./scripts/rename.sh "RideAI" rideai --dry-run
#
# The name is not settled — "Claude" is Anthropic's trademark and has to go
# before this is sold. A rename that means grepping four codebases is one that
# gets deferred and then done badly, so this exists to make it a single command.
#
# Most user-visible text reads from packages/shared/src/brand.ts. This script
# updates that file plus the three places that cannot import it:
#
#   - the Monkey C strings resource (no TypeScript imports)
#   - package.json names and the workspace scope
#   - Docker compose project names and container labels
#
# It deliberately does NOT touch the Connect IQ manifest UUID. That identifier
# is permanent: changing it makes the store treat the app as a new listing and
# orphans every existing install.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  sed -n '2,8p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'
  exit 1
}

[[ $# -ge 2 ]] || usage

NEW_NAME="$1"     # e.g. "RideAI"      — prose form
NEW_SLUG="$2"     # e.g. "rideai"      — package and container form
DRY_RUN="${3:-}"

if [[ ! "$NEW_SLUG" =~ ^[a-z][a-z0-9-]{1,38}$ ]]; then
  echo "The slug must be lowercase letters, digits and hyphens, starting with a letter." >&2
  echo "Got: $NEW_SLUG" >&2
  exit 1
fi

BRAND_FILE="$REPO_ROOT/packages/shared/src/brand.ts"
OLD_NAME="$(grep -oE "NAME: '[^']+'" "$BRAND_FILE" | head -1 | sed "s/NAME: '//; s/'//")"
OLD_SLUG="$(grep -oE "SLUG: '[^']+'" "$BRAND_FILE" | head -1 | sed "s/SLUG: '//; s/'//")"

if [[ -z "$OLD_NAME" || -z "$OLD_SLUG" ]]; then
  echo "Could not read the current name from $BRAND_FILE" >&2
  exit 1
fi

echo "Renaming:"
echo "  name  $OLD_NAME  ->  $NEW_NAME"
echo "  slug  $OLD_SLUG  ->  $NEW_SLUG"
[[ "$DRY_RUN" == "--dry-run" ]] && echo "  (dry run — nothing will be written)"
echo

# Files that legitimately contain the name. Everything else reads from brand.ts,
# and a hit outside this list is a sign something bypassed it.
# Read into an array without mapfile, which bash 3.2 (the macOS default) lacks.
TARGETS=()
while IFS= read -r line; do
  [[ -n "$line" ]] && TARGETS+=("$line")
done < <(
  cd "$REPO_ROOT" && grep -rIl --exclude-dir=.git --exclude-dir=node_modules \
    --exclude-dir=build --exclude-dir=dist \
    -e "$OLD_NAME" -e "$OLD_SLUG" . 2>/dev/null | sort
)

if [[ ${#TARGETS[@]} -eq 0 ]]; then
  echo "Nothing to change."
  exit 0
fi

echo "${#TARGETS[@]} files reference the current name:"
printf '  %s\n' "${TARGETS[@]}"
echo

if [[ "$DRY_RUN" == "--dry-run" ]]; then
  echo "Dry run complete. Re-run without --dry-run to apply."
  exit 0
fi

# Apply. Longest match first so a slug that is a substring of the name cannot
# corrupt it — replacing "rideai" before "RideAI" would leave
# "RideAI" partially rewritten.
for file in "${TARGETS[@]}"; do
  perl -pi -e "s/\Q$OLD_NAME\E/$NEW_NAME/g; s/\Q$OLD_SLUG\E/$NEW_SLUG/g" "$REPO_ROOT/$file"
done

echo "Rewrote ${#TARGETS[@]} files."
echo

# --- Verify -------------------------------------------------------------------
# A rename that silently misses a file is worse than one that fails, because the
# inconsistency surfaces later and somewhere unrelated.
remaining="$(cd "$REPO_ROOT" && grep -rIl --exclude-dir=.git --exclude-dir=node_modules \
  --exclude-dir=build --exclude-dir=dist \
  -e "$OLD_NAME" -e "$OLD_SLUG" . 2>/dev/null | sort || true)"

if [[ -n "$remaining" ]]; then
  echo "WARNING: the old name still appears in:" >&2
  echo "$remaining" | sed 's/^/  /' >&2
  echo >&2
  echo "These need attention by hand." >&2
fi

cat <<NOTES

Done. What is NOT changed, and why:

  manifest.xml UUID     Permanent. Changing it makes the Connect IQ store treat
                        this as a new app and orphans existing installs.

  The domain            brand.ts now says the new name, but DNS, the Coolify
                        application, and the TLS certificate all still point at
                        the old hostname. Update those together or the site
                        stops resolving.

  The GitHub repo       Rename it in the GitHub settings, then update the
                        remote:  git remote set-url origin <new-url>

Next:

  pnpm install                    # workspace names changed
  pnpm check                      # typecheck, lint, tests
  ./scripts/build-edge.sh --all   # the Monkey C string resource changed

NOTES
