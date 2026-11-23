#!/usr/bin/env bash
# Builds the three Instanton Campus Android apps with Bubblewrap (tools in ~/.bubblewrap, keys in android/keys.local.txt).
#   bash scripts/android-build.sh                 → all three
#   bash scripts/android-build.sh guardian        → one
# ICON_BASE: where to fetch icons/manifests while building. Default: this computer's running site
# (http://localhost:3000); once the site is online, use ICON_BASE=live to fetch them from each app's own address.
set -euo pipefail
cd "$(dirname "$0")/.."
BW=~/.bubblewrap/cli/node_modules/.bin/bubblewrap
ICON_BASE=${ICON_BASE:-http://localhost:3000}
for app in ${@:-student teacher guardian}; do
  dir=android/$app
  pass=$(grep "^$app=" android/keys.local.txt | cut -d= -f2)
  [ -n "$pass" ] || { echo "No key for $app in android/keys.local.txt"; exit 1; }
  echo "=== $app ==="
  cp "$dir/twa-manifest.json" "$dir/.twa-manifest.saved"
  if [ "$ICON_BASE" != live ]; then
    sed -i -E "s#\"https://[a-z]+\\.classbari\\.app/(apps|manifests)/#\"$ICON_BASE/\\1/#" "$dir/twa-manifest.json"
  fi
  ( cd "$dir" && $BW update --skipVersionUpgrade </dev/null >/dev/null &&
    BUBBLEWRAP_KEYSTORE_PASSWORD="$pass" BUBBLEWRAP_KEY_PASSWORD="$pass" $BW build --skipPwaValidation </dev/null >build.log 2>&1 ) \
    || { mv "$dir/.twa-manifest.saved" "$dir/twa-manifest.json"; echo "✗ $app failed — see $dir/build.log"; exit 1; }
  mv "$dir/.twa-manifest.saved" "$dir/twa-manifest.json"
  echo "✓ $dir/app-release-signed.apk (install on a phone)  +  $dir/app-release-bundle.aab (upload to Play)"
done
