#!/bin/bash
# Prepara il progetto Android. Poi:  cd mobile/android && ./gradlew assembleRelease
#   1. scarica Node.js per Android (nodejs-mobile) in app/libnode/
#   2. compila il collegamento a distanza (uffa-link, Rust) in app/src/main/jniLibs/
# Serve: rustup, l'Android NDK (variabile ANDROID_NDK_HOME), curl, unzip.
# Variabili facoltative: LIBRE_ABI (arm64-v8a,armeabi-v7a,x86_64), NODEJS_MOBILE_VERSIONE (18.20.4)
set -euo pipefail
QUI=$(cd "$(dirname "$0")" && pwd)
RADICE=$(cd "$QUI/../.." && pwd)
NODE_VER=${NODEJS_MOBILE_VERSIONE:-18.20.4}
ABI=${LIBRE_ABI:-arm64-v8a,armeabi-v7a,x86_64}
API=24
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

NDK=${ANDROID_NDK_HOME:-${ANDROID_NDK_LATEST_HOME:-${ANDROID_NDK_ROOT:-}}}
[ -n "$NDK" ] && [ -d "$NDK" ] || muori "Non trovo l'Android NDK: imposta ANDROID_NDK_HOME"
case "$(uname -s)" in
  Linux) HOST=linux-x86_64 ;;
  Darwin) HOST=darwin-x86_64 ;;
  *) muori "Sistema non supportato: $(uname -s)" ;;
esac
TC="$NDK/toolchains/llvm/prebuilt/$HOST/bin"
[ -d "$TC" ] || muori "NDK incompleto: manca $TC"

# ---------- 1. Node.js per Android ----------
LIBNODE="$QUI/app/libnode"
if [ ! -f "$LIBNODE/include/node/node.h" ]; then
  echo "→ Scarico nodejs-mobile $NODE_VER per Android"
  TMP=$(mktemp -d)
  if command -v gh >/dev/null && [ -n "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]; then
    gh release download "v$NODE_VER" --repo nodejs-mobile/nodejs-mobile --pattern '*android*' --dir "$TMP"
  else
    URL=$(curl -fsSL "https://api.github.com/repos/nodejs-mobile/nodejs-mobile/releases/tags/v$NODE_VER" \
      | grep -o '"browser_download_url": *"[^"]*android[^"]*"' | head -1 | sed 's/.*"\(http[^"]*\)"/\1/')
    [ -n "$URL" ] || muori "Non trovo nodejs-mobile $NODE_VER per Android"
    curl -fL --retry 3 -o "$TMP/node-android.zip" "$URL"
  fi
  for z in "$TMP"/*.zip; do unzip -q "$z" -d "$TMP/x"; done
  SO=$(find "$TMP/x" -path '*arm64-v8a*' -name libnode.so | head -1)
  H=$(find "$TMP/x" -name node.h -path '*include*' | head -1)
  [ -n "$SO" ] && [ -n "$H" ] || muori "Il pacchetto di nodejs-mobile non è come me lo aspetto"
  BIN=$(dirname "$(dirname "$SO")")
  rm -rf "$LIBNODE"; mkdir -p "$LIBNODE/bin" "$LIBNODE/include"
  cp -R "$BIN"/. "$LIBNODE/bin/"
  cp -R "$(dirname "$H")" "$LIBNODE/include/node"
  rm -rf "$TMP"
fi
for abi in ${ABI//,/ }; do
  [ -f "$LIBNODE/bin/$abi/libnode.so" ] || muori "nodejs-mobile non c'è per $abi"
done

# ---------- 2. il collegamento (Rust) ----------
for abi in ${ABI//,/ }; do
  case "$abi" in
    arm64-v8a)   T=aarch64-linux-android;   CL=aarch64-linux-android ;;
    armeabi-v7a) T=armv7-linux-androideabi; CL=armv7a-linux-androideabi ;;
    x86_64)      T=x86_64-linux-android;    CL=x86_64-linux-android ;;
    x86)         T=i686-linux-android;      CL=i686-linux-android ;;
    *) muori "Architettura sconosciuta: $abi" ;;
  esac
  echo "→ Compilo il collegamento per $abi ($T)"
  rustup target add "$T" >/dev/null
  CC_BIN="$TC/${CL}${API}-clang"
  [ -x "$CC_BIN" ] || muori "Manca $CC_BIN"
  T_ENV=$(echo "$T" | tr 'a-z-' 'A-Z_')
  (
    cd "$RADICE/uffa-link"
    export "CARGO_TARGET_${T_ENV}_LINKER=$CC_BIN"
    export "CARGO_TARGET_${T_ENV}_RUSTFLAGS=-C link-arg=-Wl,-z,max-page-size=16384"
    export "CC_${T//-/_}=$CC_BIN"
    export "AR_${T//-/_}=$TC/llvm-ar"
    segnala cargo rustc --release --lib --crate-type cdylib --target "$T"
  )
  mkdir -p "$QUI/app/src/main/jniLibs/$abi"
  cp "$RADICE/uffa-link/target/$T/release/libuffa_link.so" "$QUI/app/src/main/jniLibs/$abi/"
  "$TC/llvm-strip" --strip-unneeded "$QUI/app/src/main/jniLibs/$abi/libuffa_link.so" || true
done
echo "✓ Pronto. Ora: cd \"$QUI\" && ./gradlew assembleRelease"
