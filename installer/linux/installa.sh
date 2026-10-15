#!/bin/bash
# LIBRE VTT — installazione per Linux, in un solo file.
#
#   Doppio clic → «Esegui» (o tasto destro → Esegui come programma), oppure: bash LIBRE-VTT-Linux.sh
#   bash LIBRE-VTT-Linux.sh --si     installa senza fare domande
#
# Tutto finisce in UNA cartella privata, ~/.local/share/libre-vtt:
#   app/       il programma
#   runtime/   il suo Node.js (scaricato da nodejs.org e controllato, o già dentro questo file)
#   utente/    impostazioni, collegamento a distanza, eventuali strumenti per costruirlo
# Non serve la password di amministratore, non si installa niente nel sistema, non si usa né si
# tocca nessun Node, Rust o altro già presente. Le campagne vanno in Documenti › LIBRE VTT.
set -u
NOME="LIBRE VTT"
SELF="$(readlink -f "$0")"
DEST="${MYVTT_DEST:-${XDG_DATA_HOME:-$HOME/.local/share}/libre-vtt}"
DIST="${MYVTT_NODE_DIST:-https://nodejs.org/dist/latest-v22.x}"
SI=0; for a in "$@"; do [ "$a" = "--si" ] && SI=1; done
unset NODE_OPTIONS NODE_PATH

# ---------------------------------------------------------------- come parlare con chi installa
UI=testo
if [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  if command -v zenity >/dev/null 2>&1; then UI=zenity; elif command -v kdialog >/dev/null 2>&1; then UI=kdialog; fi
fi
[ -n "${MYVTT_UI:-}" ] && UI="$MYVTT_UI"
# lanciato con un doppio clic, senza finestre per parlare: si apre un terminale
if [ "$UI" = testo ] && [ ! -t 0 ] && [ "$SI" = 0 ] && [ -z "${MYVTT_IN_TERMINALE:-}" ] && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  for t in x-terminal-emulator gnome-terminal konsole xfce4-terminal mate-terminal lxterminal xterm; do
    command -v "$t" >/dev/null 2>&1 || continue
    if [ "$t" = gnome-terminal ]; then exec gnome-terminal -- env MYVTT_IN_TERMINALE=1 bash "$SELF" "$@"; fi
    exec "$t" -e env MYVTT_IN_TERMINALE=1 bash "$SELF" "$@"
  done
fi

LOG="$(mktemp -t myvtt-installa.XXXXXX.log)"
log() { echo "$(date '+%H:%M:%S') $*" >> "$LOG"; }
esc() { printf '%s' "$1" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g'; }   # per zenity (testo con markup)

chiedi() {   # $1 domanda, $2 «sì», $3 «no» → 0 se sì
  [ "$SI" = 1 ] && return 0
  case "$UI" in
    zenity)  zenity --question --title="$NOME" --width=460 --text="$(esc "$1")" --ok-label="${2:-Sì}" --cancel-label="${3:-No}" 2>/dev/null ;;
    kdialog) kdialog --title "$NOME" --yes-label "${2:-Sì}" --no-label "${3:-No}" --yesno "$1" 2>/dev/null ;;
    *) printf '\n%s\n' "$1"; read -r -p "  ${2:-Sì} [s] / ${3:-No} [n]: " r; case "$r" in s|S|si|SI|sì|Sì|y|Y) return 0 ;; *) return 1 ;; esac ;;
  esac
}
avvisa() {
  [ "$SI" = 1 ] && { echo "$1"; return; }
  case "$UI" in
    zenity)  zenity --info --title="$NOME" --width=460 --text="$(esc "$1")" 2>/dev/null ;;
    kdialog) kdialog --title "$NOME" --msgbox "$1" 2>/dev/null ;;
    *) printf '\n%s\n' "$1" ;;
  esac
}
chiudi_progresso() { if [ -n "${ZPID:-}" ]; then echo 100 >&3 2>/dev/null; exec 3>&-; wait "$ZPID" 2>/dev/null; ZPID=; fi; }
errore() {
  log "ERRORE: $1"
  chiudi_progresso
  case "$UI" in
    zenity)  [ "$SI" = 1 ] || zenity --error --title="$NOME" --width=460 --text="$(esc "$1")

$(esc "Dettagli in: $LOG")" 2>/dev/null ;;
    kdialog) [ "$SI" = 1 ] || kdialog --title "$NOME" --error "$1

Dettagli in: $LOG" 2>/dev/null ;;
  esac
  printf '\n✘ %s\n  (dettagli in %s)\n' "$1" "$LOG" >&2
  exit 1
}
apri_progresso() {
  [ "$UI" = zenity ] && [ "$SI" = 0 ] || return 0
  local f; f="$(mktemp -u)"; mkfifo "$f"
  zenity --progress --title="$NOME" --width=460 --auto-close --no-cancel --text="Comincio…" < "$f" 2>/dev/null &
  ZPID=$!
  exec 3>"$f"; rm -f "$f"
}
passo() {   # $1 percentuale, $2 testo
  log "$2"
  if [ -n "${ZPID:-}" ]; then printf '%s\n# %s\n' "$1" "$2" >&3 2>/dev/null
  elif [ "$UI" = kdialog ] && [ "$SI" = 0 ]; then kdialog --title "$NOME" --passivepopup "$2" 4 2>/dev/null &
  else printf '  • %s\n' "$2"; fi
}
scarica() {   # url destinazione: con quello che c'è (curl, wget, o python)
  log "scarico $1"
  if command -v curl >/dev/null 2>&1; then curl -fsSL --retry 2 --connect-timeout 20 "$1" -o "$2" 2>>"$LOG"
  elif command -v wget >/dev/null 2>&1; then wget -q -O "$2" "$1" 2>>"$LOG"
  elif command -v python3 >/dev/null 2>&1; then python3 -c 'import sys,urllib.request; urllib.request.urlretrieve(sys.argv[1], sys.argv[2])' "$1" "$2" 2>>"$LOG"
  else log "né curl né wget né python3"; return 9; fi
}
node_ok() { [ -x "$1" ] && v="$("$1" -v 2>/dev/null)" && [ "$(echo "${v#v}" | cut -d. -f1)" -ge 18 ] 2>/dev/null; }

# ---------------------------------------------------------------- che computer è
case "$(uname -m)" in
  x86_64|amd64) ARCH=x64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) errore "Questo computer ($(uname -m)) non è tra quelli su cui gira LIBRE VTT (serve un PC a 64 bit Intel/AMD o ARM)." ;;
esac
RIGA=$(awk '/^__ARCHIVIO_QUI_SOTTO__$/ { print NR + 1; exit }' "$SELF")
[ -n "$RIGA" ] || errore "Questo file di installazione è incompleto: scaricalo di nuovo."
INCLUSO_NODE=0; tail -n +"$RIGA" "$SELF" | tar -tzf - 2>/dev/null | grep -q "^node-linux-$ARCH/bin/node$" && INCLUSO_NODE=1

VECCHIA="$(dirname "$DEST")/my-vtt"     # prima il programma si chiamava «MY VTT»
if [ ! -e "$DEST" ] && [ -x "$VECCHIA/avvia" ]; then
  DOMANDA="Qui c'è MY VTT, che adesso si chiama LIBRE VTT: lo aggiorno a questa versione con il nuovo nome?

Le campagne e le impostazioni restano come sono."
elif [ -x "$DEST/avvia" ]; then
  DOMANDA="LIBRE VTT è già installato: lo aggiorno a questa versione?

Le campagne e le impostazioni restano come sono."
else
  DOMANDA="Installo LIBRE VTT per questo utente, in:
$DEST

Non serve la password e non si tocca niente del sistema né quello che hai già installato."
  if [ "$INCLUSO_NODE" = 0 ] && ! node_ok "$DEST/runtime/node/bin/node"; then
    DOMANDA="$DOMANDA

Scarico anche Node.js dal sito ufficiale (circa 30 MB), solo per LIBRE VTT."
  fi
fi
chiedi "$DOMANDA" "Installa" "Annulla" || { echo "Annullato."; exit 0; }

apri_progresso
if [ ! -e "$DEST" ] && [ -x "$VECCHIA/avvia" ]; then
  # la vecchia cartella (con Node, impostazioni e strumenti) diventa quella nuova; via le vecchie voci
  mv "$VECCHIA" "$DEST" 2>>"$LOG" || errore "Non riesco a spostare $VECCHIA in $DEST."
  D_DATI="${XDG_DATA_HOME:-$HOME/.local/share}"
  rm -f "$D_DATI/applications/my-vtt.desktop" "$D_DATI/icons/hicolor/256x256/apps/my-vtt.png" \
        "$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")/my-vtt.desktop"
fi
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
passo 5 "Estraggo il programma…"
tail -n +"$RIGA" "$SELF" | tar -xzf - -C "$TMP" 2>>"$LOG" || errore "Il file di installazione è rovinato: scaricalo di nuovo."
[ -f "$TMP/app/launcher.js" ] || errore "Il file di installazione è incompleto: scaricalo di nuovo."

# ---------------------------------------------------------------- Node, solo per LIBRE VTT
NUOVO_NODE=""
if [ -x "$TMP/node-linux-$ARCH/bin/node" ]; then
  NUOVO_NODE="$TMP/node-linux-$ARCH"; passo 25 "Node.js è già dentro l'installazione."
elif node_ok "$DEST/runtime/node/bin/node"; then
  passo 25 "Node.js c'è già (quello di LIBRE VTT): lo tengo."
else
  passo 15 "Scarico Node.js da nodejs.org…"
  scarica "$DIST/SHASUMS256.txt" "$TMP/SHASUMS256.txt" || errore "Non riesco a raggiungere nodejs.org. Controlla la connessione a internet e riprova."
  F="$(grep -oE "node-v[0-9]+\.[0-9]+\.[0-9]+-linux-$ARCH\.tar\.gz" "$TMP/SHASUMS256.txt" | head -1)"
  [ -n "$F" ] || errore "Sul sito di Node non trovo la versione per questo computer."
  scarica "$DIST/$F" "$TMP/$F" || errore "Lo scaricamento di Node.js si è interrotto. Riprova."
  passo 35 "Controllo che Node.js sia integro…"
  ATTESO="$(grep "  $F\$" "$TMP/SHASUMS256.txt" | awk '{print $1}')"
  VERO="$(sha256sum "$TMP/$F" | awk '{print $1}')"
  [ -n "$ATTESO" ] && [ "$ATTESO" = "$VERO" ] || errore "Il file di Node.js arrivato non è integro: per sicurezza non lo uso. Riprova."
  tar -xzf "$TMP/$F" -C "$TMP" 2>>"$LOG" || errore "Non riesco a estrarre Node.js."
  NUOVO_NODE="$TMP/${F%.tar.gz}"
fi
if [ -n "$NUOVO_NODE" ]; then
  "$NUOVO_NODE/bin/node" -v >/dev/null 2>>"$LOG" || errore "Node.js non parte su questo sistema: probabilmente è troppo vecchio (serve una distribuzione del 2019 o più recente)."
fi

# ---------------------------------------------------------------- al suo posto
passo 55 "Copio il programma…"
mkdir -p "$DEST/runtime" "$DEST/utente/bin" || errore "Non riesco a scrivere in $DEST."
rm -rf "$DEST/app.nuova"
mv "$TMP/app" "$DEST/app.nuova" && rm -rf "$DEST/app" && mv "$DEST/app.nuova" "$DEST/app" || errore "Non riesco a copiare il programma in $DEST."
if [ -n "$NUOVO_NODE" ]; then
  rm -rf "$DEST/runtime/node.vecchio"; [ -d "$DEST/runtime/node" ] && mv "$DEST/runtime/node" "$DEST/runtime/node.vecchio"
  mv "$NUOVO_NODE" "$DEST/runtime/node" || errore "Non riesco a copiare Node.js."
  rm -rf "$DEST/runtime/node.vecchio"
fi
if [ -f "$TMP/bin/uffa-link-linux-$ARCH" ]; then
  passo 65 "Il collegamento a distanza è già pronto dentro l'installazione."
  cp "$TMP/bin/uffa-link-linux-$ARCH" "$DEST/utente/bin/uffa-link" && chmod 755 "$DEST/utente/bin/uffa-link"
fi
cp "$DEST/app/icona.png" "$DEST/icona.png" 2>/dev/null

passo 75 "Preparo l'avvio e la disinstallazione…"
cat > "$DEST/avvia" <<'AVVIA'
#!/bin/bash
# Avvia LIBRE VTT con il suo Node e la sua cartella, ignorando quello che c'è nel sistema.
D="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
unset NODE_OPTIONS NODE_PATH
export MYVTT_USERDIR="$D/utente"
mkdir -p "$D/utente"
LOG="$D/utente/avvio.log"
"$D/runtime/node/bin/node" "$D/app/launcher.js" > "$LOG" 2>&1 &
P=$!
sleep 4
if ! kill -0 "$P" 2>/dev/null; then
  wait "$P"; C=$?
  [ "$C" = 0 ] && exit 0                     # era già aperto: ha solo mostrato la finestra
  MSG="LIBRE VTT si è chiuso subito dopo l'avvio. Il registro è in $LOG"
  if command -v zenity >/dev/null 2>&1; then zenity --error --title="LIBRE VTT" --width=480 --text="$(printf '%s\n\n%s' "$MSG" "$(tail -n 15 "$LOG")" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g')" 2>/dev/null
  elif command -v kdialog >/dev/null 2>&1; then kdialog --title "LIBRE VTT" --error "$MSG" 2>/dev/null
  elif command -v notify-send >/dev/null 2>&1; then notify-send "LIBRE VTT" "$MSG"
  else echo "$MSG" >&2; fi
  exit 1
fi
wait "$P"
AVVIA
cat > "$DEST/disinstalla" <<'DISINSTALLA'
#!/bin/bash
# Toglie LIBRE VTT: la sua cartella, la voce nel menu e l'icona. Le campagne in Documenti restano.
D="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
TESTO="Tolgo LIBRE VTT da questo computer?

Le tue campagne (in Documenti › LIBRE VTT) restano dove sono."
SI=0; [ "${1:-}" = "--si" ] && SI=1
if [ "$SI" = 0 ]; then
  if command -v zenity >/dev/null 2>&1 && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then zenity --question --title="LIBRE VTT" --width=420 --text="$TESTO" --ok-label="Disinstalla" --cancel-label="Annulla" 2>/dev/null || exit 0
  elif command -v kdialog >/dev/null 2>&1 && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then kdialog --title "LIBRE VTT" --yesno "$TESTO" 2>/dev/null || exit 0
  else printf '%s\n' "$TESTO"; read -r -p "[s/N] " r; case "$r" in s|S|si|y|Y) ;; *) exit 0 ;; esac; fi
fi
pkill -f "$D/app/" 2>/dev/null
APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
rm -f "$APPS/libre-vtt.desktop" "${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/256x256/apps/libre-vtt.png"
SCRIV="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
rm -f "$SCRIV/libre-vtt.desktop"
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS" >/dev/null 2>&1
rm -rf "$D"
if [ "$SI" = 0 ]; then
  if command -v zenity >/dev/null 2>&1 && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then zenity --info --title="LIBRE VTT" --text="LIBRE VTT è stato tolto." 2>/dev/null
  else echo "LIBRE VTT è stato tolto."; fi
fi
DISINSTALLA
chmod 755 "$DEST/avvia" "$DEST/disinstalla"

passo 85 "Aggiungo LIBRE VTT al menu delle applicazioni…"
APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICONE="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/256x256/apps"
mkdir -p "$APPS" "$ICONE"
cp "$DEST/icona.png" "$ICONE/libre-vtt.png" 2>/dev/null
VOCE="[Desktop Entry]
Type=Application
Name=LIBRE VTT
GenericName=Tavolo da gioco virtuale
Comment=Tavolo virtuale per D&D 5e
Exec=\"$DEST/avvia\"
Icon=$DEST/icona.png
Terminal=false
Categories=Game;RolePlaying;
StartupNotify=true
Actions=Disinstalla;

[Desktop Action Disinstalla]
Name=Disinstalla LIBRE VTT
Exec=\"$DEST/disinstalla\""
printf '%s\n' "$VOCE" > "$APPS/libre-vtt.desktop"
chmod 755 "$APPS/libre-vtt.desktop"
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS" >/dev/null 2>&1
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -f -t "${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor" >/dev/null 2>&1
# l'icona anche sulla Scrivania, se c'è (e «fidata», così GNOME la apre col doppio clic)
SCRIV="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
if [ -d "$SCRIV" ] && [ "$SCRIV" != "$HOME" ]; then
  printf '%s\n' "$VOCE" > "$SCRIV/libre-vtt.desktop"; chmod 755 "$SCRIV/libre-vtt.desktop"
  command -v gio >/dev/null 2>&1 && gio set "$SCRIV/libre-vtt.desktop" metadata::trusted true >/dev/null 2>&1
fi

passo 100 "Fatto."
chiudi_progresso
log "installato in $DEST"
if chiedi "LIBRE VTT è installato. Lo trovi nel menu delle applicazioni (e sulla Scrivania).

Lo apro adesso?" "Apri LIBRE VTT" "Più tardi"; then
  [ "$SI" = 1 ] && [ -n "${MYVTT_NON_APRIRE:-}" ] || (setsid "$DEST/avvia" >/dev/null 2>&1 &)
fi
exit 0
__ARCHIVIO_QUI_SOTTO__
