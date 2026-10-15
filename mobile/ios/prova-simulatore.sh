#!/bin/bash
# Prova dell'app nel simulatore dell'iPhone (la usa il workflow «App» con «prova» spuntato):
# compila per il simulatore, installa, apre, fa delle foto e salva il registro in prova/.
set -x
OUT=prova; mkdir -p "$OUT"
xcodebuild -project LibreVTT.xcodeproj -scheme LibreVTT -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath build/sim CODE_SIGNING_ALLOWED=NO build \
  > "$OUT/build-sim.log" 2>&1 || { tail -60 "$OUT/build-sim.log"; exit 1; }
APP=$(find build/sim/Build/Products -name LibreVTT.app -maxdepth 3 | head -1)
DEV=$(xcrun simctl list devices available -j | python3 -c "
import json,sys
d=json.load(sys.stdin)['devices']
for rt,l in d.items():
  if 'iOS' in rt:
    for x in l:
      if x['name'].startswith('iPhone'): print(x['udid']); sys.exit()")
IPAD=$(xcrun simctl list devices available -j | python3 -c "
import json,sys
d=json.load(sys.stdin)['devices']
for rt,l in d.items():
  if 'iOS' in rt:
    for x in l:
      if x['name'].startswith('iPad'): print(x['udid']); sys.exit()")
prova() {   # prova <udid> <nome>
  local U=$1 N=$2
  xcrun simctl boot "$U"; xcrun simctl bootstatus "$U" -b
  xcrun simctl install "$U" "$APP" || return 1
  local BID; BID=$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$APP/Info.plist")
  sleep 15   # appena acceso il simulatore a volte rifiuta il lancio («server died»)
  for i in 1 2 3; do
    xcrun simctl launch "$U" "$BID" > "$OUT/$N-console.txt" 2>&1 && break
    sleep 15
  done
  sleep 40; xcrun simctl io "$U" screenshot "$OUT/$N-1-avvio.png"
  sleep 20; xcrun simctl io "$U" screenshot "$OUT/$N-2-dopo.png"
  xcrun simctl spawn "$U" log show --last 3m --style compact --predicate 'process == "LibreVTT"' > "$OUT/$N-log.txt" 2>&1
  xcrun simctl shutdown "$U"
}
prova "$DEV" iphone
[ -n "$IPAD" ] && prova "$IPAD" ipad
ls -la "$OUT"
