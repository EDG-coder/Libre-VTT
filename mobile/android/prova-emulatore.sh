#!/bin/bash
# Prova dell'APK nell'emulatore (la usa il workflow «App» con «prova» spuntato):
# installa, apre, fa delle foto dello schermo e salva il registro in prova/.
set -x
OUT=prova; mkdir -p "$OUT"
foto() { adb exec-out screencap -p > "$OUT/$1.png"; }
albero() { adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb shell cat /sdcard/ui.xml > "$OUT/$1.xml"; }
# tocca il primo elemento della pagina che contiene quel testo
tocca() {
  albero tmp
  local b; b=$(python3 - "$1" "$OUT/tmp.xml" <<'PY'
import re, sys
t, f = sys.argv[1], sys.argv[2]
x = open(f, encoding='utf-8', errors='ignore').read()
for m in re.finditer(r'<node [^>]*>', x):
    n = m.group(0)
    txt = (re.search(r' text="([^"]*)"', n) or [None, ''])[1] + ' ' + (re.search(r'content-desc="([^"]*)"', n) or [None, ''])[1]
    if t.lower() in txt.lower():
        a = list(map(int, re.findall(r'\d+', re.search(r'bounds="([^"]*)"', n).group(1))))
        print((a[0] + a[2]) // 2, (a[1] + a[3]) // 2); break
PY
)
  [ -n "$b" ] && adb shell input tap $b && echo "toccato «$1» in $b" || echo "non trovo «$1»"
}
adb shell settings put global window_animation_scale 0
adb install -r app-android/LIBRE-VTT-Android.apk || exit 1
adb logcat -c
adb shell am start -W -n app.librevtt/.MainActivity
sleep 20; foto 1-avvio
sleep 25; foto 2-pronto; albero 2-pronto
tocca "Gioco da solo"; sleep 6; foto 3-campagne; albero 3-campagne
tocca "Nuova campagna"; sleep 3
tocca "Nome della campagna"; sleep 1; adb shell input text "Prova"; sleep 1
tocca "Crea"; sleep 25; foto 4-tavolo; albero 4-tavolo
adb shell input swipe 500 900 300 700 400; sleep 2; foto 5-trascinato
adb shell dumpsys meminfo app.librevtt | head -40 > "$OUT/memoria.txt"
adb logcat -d > "$OUT/logcat.txt"
adb logcat -d -s "LIBRE VTT" chromium AndroidRuntime DEBUG > "$OUT/logcat-app.txt"
ls -la "$OUT"
