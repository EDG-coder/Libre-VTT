#!/bin/bash
# Prepara il progetto Xcode (da lanciare su un Mac). Poi si apre LibreVTT.xcodeproj.
#   1. copia il programma (lo stesso del computer) in LibreVTT/nodejs-project
#   2. scarica Node.js per iOS (nodejs-mobile) in Frameworks/NodeMobile.xcframework
#   3. compila il collegamento a distanza (uffa-link, Rust) in Frameworks/UffaLink.xcframework
# Serve: Xcode, rustup, curl.  Facoltativo: NODEJS_MOBILE_VERSIONE (18.20.4)
set -euo pipefail
QUI=$(cd "$(dirname "$0")" && pwd)
RADICE=$(cd "$QUI/../.." && pwd)
NODE_VER=${NODEJS_MOBILE_VERSIONE:-18.20.4}
FW="$QUI/Frameworks"
muori() { echo "ERRORE: $*" >&2; echo "::error::$*"; exit 1; }
# esegue un comando; se fallisce, su GitHub mette gli errori in evidenza (i registri non sempre si leggono)
segnala() {
  local reg; reg=$(mktemp)
  if "$@" > >(tee "$reg") 2>&1; then rm -f "$reg"; return 0; fi
  sleep 1
  local testo
  testo=$(grep -E -A12 '^(error|ERROR|fatal|FAILURE|e: |.*: error:)' "$reg" | head -120 | sed 's/%/%25/g' | awk '{printf "%s%%0A", $0}')
  [ -n "$testo" ] || testo=$(tail -60 "$reg" | sed 's/%/%25/g' | awk '{printf "%s%%0A", $0}')
  echo "::error title=$1 non riuscito::$testo"
  rm -f "$reg"
  return 1
}
[ "$(uname -s)" = Darwin ] || muori "Questo script va lanciato su un Mac"
mkdir -p "$FW"

# ---------- 1. il programma ----------
echo "→ Copio il programma"
P="$QUI/LibreVTT/nodejs-project"
rm -rf "$P"; mkdir -p "$P/assets/Sfondi"
for f in "$RADICE"/*.html "$RADICE"/*.js "$RADICE"/*.css "$RADICE"/favicon.svg "$RADICE"/package.json; do
  cp "$f" "$P/"
done
rm -f "$P/zigwrap.js"
cp "$RADICE/assets/Sfondi/main.webp" "$P/assets/Sfondi/"

# ---------- 2. Node.js per iOS ----------
if [ ! -d "$FW/NodeMobile.xcframework" ]; then
  echo "→ Scarico nodejs-mobile $NODE_VER per iOS"
  TMP=$(mktemp -d)
  if command -v gh >/dev/null && [ -n "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]; then
    gh release download "v$NODE_VER" --repo nodejs-mobile/nodejs-mobile --pattern '*ios*' --dir "$TMP"
  else
    URL=$(curl -fsSL "https://api.github.com/repos/nodejs-mobile/nodejs-mobile/releases/tags/v$NODE_VER" \
      | grep -o '"browser_download_url": *"[^"]*ios[^"]*"' | head -1 | sed 's/.*"\(http[^"]*\)"/\1/')
    [ -n "$URL" ] || muori "Non trovo nodejs-mobile $NODE_VER per iOS"
    curl -fL --retry 3 -o "$TMP/node-ios.zip" "$URL"
  fi
  for z in "$TMP"/*.zip; do ditto -x -k "$z" "$TMP/x"; done
  X=$(find "$TMP/x" -type d -name 'NodeMobile.xcframework' | head -1)
  [ -n "$X" ] || muori "Nel pacchetto di nodejs-mobile non c'è NodeMobile.xcframework"
  ditto "$X" "$FW/NodeMobile.xcframework"
  rm -rf "$TMP"
fi

# ---------- 3. il collegamento (Rust) ----------
export IPHONEOS_DEPLOYMENT_TARGET=15.0
cd "$RADICE/uffa-link"
for T in aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios; do
  echo "→ Compilo il collegamento per $T"
  rustup target add "$T" >/dev/null
  segnala cargo rustc --release --lib --crate-type staticlib --target "$T"
done
# le librerie di sistema che vuole il collegamento (le dice il compilatore)
touch src/lib.rs
LIBS=$(cargo rustc --release --lib --crate-type staticlib --target aarch64-apple-ios -- --print native-static-libs 2>&1 \
  | sed -n 's/.*native-static-libs: //p' | tail -1)
[ -n "$LIBS" ] || LIBS="-framework Security -framework SystemConfiguration -framework CoreFoundation -liconv -lc++"
echo "UFFA_LINK_LDFLAGS = $LIBS" > "$FW/UffaLink.xcconfig"
echo "   librerie di sistema: $LIBS"

TMP=$(mktemp -d)
mkdir -p "$TMP/disp" "$TMP/sim"
cp target/aarch64-apple-ios/release/libuffa_link.a "$TMP/disp/"
lipo -create target/aarch64-apple-ios-sim/release/libuffa_link.a target/x86_64-apple-ios/release/libuffa_link.a \
  -output "$TMP/sim/libuffa_link.a"
rm -rf "$FW/UffaLink.xcframework"
xcodebuild -create-xcframework \
  -library "$TMP/disp/libuffa_link.a" -headers include \
  -library "$TMP/sim/libuffa_link.a" -headers include \
  -output "$FW/UffaLink.xcframework"
rm -rf "$TMP"
echo "✓ Pronto. Apri $QUI/LibreVTT.xcodeproj"
