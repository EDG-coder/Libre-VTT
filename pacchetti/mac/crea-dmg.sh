#!/bin/bash
# Crea «LIBRE VTT.dmg» su un Mac, con gli strumenti di Apple: compresso e con dentro tutto.
#   - il programma
#   - Node.js per Apple Silicon e per Intel: chi apre l'app non deve scaricare niente
#   - il collegamento a distanza (uffa-link) già compilato per entrambi, se su questo Mac c'è
#     Rust con rustup; altrimenti lo compila l'app la prima volta che serve (chiedendolo)
#
#   bash pacchetti/mac/crea-dmg.sh [uscita.dmg]        (oppure doppio clic su «Crea il DMG.command»)
set -u
cd "$(dirname "$0")/../.." || exit 1
PROG="$(pwd)"
OUT="${1:-$PROG/LIBRE VTT.dmg}"
DIST="${MYVTT_NODE_DIST:-https://nodejs.org/dist/latest-v22.x}"
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
STAGE="$W/stage"; APPD="$STAGE/LIBRE VTT.app"; RES="$APPD/Contents/Resources"; DEST="$RES/app"
passo() { printf '\n▸ %s\n' "$*"; }
muori() {
  printf '\n✘ %s\n' "$*"
  [ -n "${GITHUB_ACTIONS:-}" ] && printf '::error::%s\n' "$*"   # su GitHub si legge anche fuori dal registro
  exit 1
}

passo "Preparo l'app"
mkdir -p "$APPD/Contents/MacOS" "$DEST" || muori "non riesco a creare le cartelle"
cp pacchetti/mac/Info.plist "$APPD/Contents/Info.plist" || muori "manca pacchetti/mac/Info.plist"
cp pacchetti/mac/myvtt "$APPD/Contents/MacOS/myvtt" && chmod 755 "$APPD/Contents/MacOS/myvtt" || muori "manca pacchetti/mac/myvtt"
cp pacchetti/mac/AppIcon.icns "$RES/AppIcon.icns" || muori "manca pacchetti/mac/AppIcon.icns"
# i file del programma: la stessa lista degli installatori per Linux e Windows
python3 - "$DEST" <<'PY' || muori "non riesco a copiare il programma"
import importlib.util, os, shutil, sys
s = importlib.util.spec_from_file_location('c', 'pacchetti/installer/crea-installer.py'); c = importlib.util.module_from_spec(s); s.loader.exec_module(c)
for disco, rel in c.file_programma():
    os.makedirs(os.path.dirname(os.path.join(sys.argv[1], rel)), exist_ok=True)
    shutil.copyfile(disco, os.path.join(sys.argv[1], rel))
PY
# su GitHub Actions: l'app saprà da dove scaricare il collegamento già pronto
[ -n "${MYVTT_REPO:-}" ] && printf '{\n  "repo": "%s"\n}\n' "$MYVTT_REPO" > "$DEST/rilascio.json"
echo "  $(ls "$DEST" | wc -l | tr -d ' ') voci nel programma"

passo "Scarico Node.js per Apple Silicon e per Intel (nodejs.org)"
curl -fsSL "$DIST/SHASUMS256.txt" -o "$W/SHASUMS256.txt" || muori "non riesco a raggiungere nodejs.org"
for A in arm64 x64; do
  F="$(grep -oE "node-v[0-9]+\.[0-9]+\.[0-9]+-darwin-$A\.tar\.gz" "$W/SHASUMS256.txt" | head -1)"
  [ -n "$F" ] || muori "non trovo Node per $A"
  curl -fSL --progress-bar "$DIST/$F" -o "$W/$F" || muori "scaricamento di $F interrotto"
  ATTESO="$(grep "  $F\$" "$W/SHASUMS256.txt" | awk '{print $1}')"
  [ "$ATTESO" = "$(shasum -a 256 "$W/$F" | awk '{print $1}')" ] || muori "$F non è integro"
  tar -xzf "$W/$F" -C "$W" || muori "non riesco a estrarre $F"
  mkdir -p "$RES/node/$A/bin"
  cp "$W/${F%.tar.gz}/bin/node" "$RES/node/$A/bin/node"
  cp "$W/${F%.tar.gz}/LICENSE" "$RES/node/$A/LICENSE" 2>/dev/null
  echo "  $F (controllato)"
done

RUSTUP="$(command -v rustup || echo "$HOME/.cargo/bin/rustup")"
CARGO="$(command -v cargo || echo "$HOME/.cargo/bin/cargo")"
if [ -n "${MYVTT_LINK:-}" ] && [ -f "$MYVTT_LINK" ]; then
  passo "Uso il collegamento a distanza già compilato ($MYVTT_LINK)"
  mkdir -p "$DEST/bin" && cp "$MYVTT_LINK" "$DEST/bin/uffa-link" && chmod 755 "$DEST/bin/uffa-link"
elif [ -x "$RUSTUP" ] && [ -x "$CARGO" ]; then
  passo "Compilo il collegamento a distanza per Apple Silicon e per Intel (qualche minuto)"
  if "$RUSTUP" target add aarch64-apple-darwin x86_64-apple-darwin \
     && (cd pacchetti/uffa-link && "$CARGO" build --release --target aarch64-apple-darwin && "$CARGO" build --release --target x86_64-apple-darwin); then
    mkdir -p "$DEST/bin"
    lipo -create -output "$DEST/bin/uffa-link" \
      pacchetti/uffa-link/target/aarch64-apple-darwin/release/uffa-link pacchetti/uffa-link/target/x86_64-apple-darwin/release/uffa-link \
      && chmod 755 "$DEST/bin/uffa-link" && codesign --force --sign - "$DEST/bin/uffa-link" \
      && echo "  pronto: un solo file per entrambi i tipi di Mac" \
      || { rm -rf "$DEST/bin"; echo "  non sono riuscito a unirli: lo compilerà l'app quando serve"; }
  else
    echo "  la compilazione non è andata: lo compilerà l'app quando serve"
  fi
else
  passo "Rust (con rustup) non c'è: il collegamento a distanza lo compilerà l'app la prima volta che serve"
fi

passo "Creo il .dmg"
mkdir -p "$(dirname "$OUT")" || muori "non riesco a creare la cartella per $OUT"
ln -s /Applications "$STAGE/Applicazioni"
rm -f "$OUT"
# hdiutil a volte risponde «risorsa occupata» (succede anche sui Mac di GitHub): si riprova,
# e se proprio non va si crea l'immagine con il nostro programma in Python (non compressa, ma uguale).
FATTO=""
for TENTATIVO in 1 2 3 4 5; do
  if ERR="$(hdiutil create -volname "LIBRE VTT" -srcfolder "$STAGE" -fs HFS+ -format UDZO -imagekey zlib-level=9 -ov "$OUT" 2>&1)"; then FATTO=1; break; fi
  echo "  hdiutil (tentativo $TENTATIVO): $ERR"
  sleep $((TENTATIVO * 4))
done
if [ -z "$FATTO" ]; then
  echo "  hdiutil non va: creo l'immagine con pacchetti/mac/crea-dmg-senza-mac.py"
  rm -f "$STAGE/Applicazioni"
  python3 - "$STAGE" "$OUT" <<'PY' || muori "non sono riuscito a creare il .dmg (hdiutil: $ERR)"
import importlib.util, sys
s = importlib.util.spec_from_file_location('c', 'pacchetti/mac/crea-dmg-senza-mac.py'); c = importlib.util.module_from_spec(s); s.loader.exec_module(c)
import os; os.symlink('/Applications', os.path.join(sys.argv[1], 'Applicazioni'))
c.scrivi_iso(sys.argv[1], sys.argv[2])
PY
fi
printf '\n✔ Fatto: %s (%s)\n' "$OUT" "$(du -h "$OUT" | cut -f1 | tr -d ' ')"
