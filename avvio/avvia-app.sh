#!/bin/bash
# Avvia l'avviatore con la finestra da app (Linux, e in generale ovunque).
cd "$(dirname "$0")/.." || exit 1
CARTELLA="$(pwd)"

# Mette l'icona nel tema delle icone dell'utente, così "LIBRE VTT.desktop" la trova con il nome
# "libre-vtt-icona" invece che con un percorso fisso (che non potremmo conoscere in anticipo,
# visto che non sappiamo dove scompatterai la cartella). Economico, si rifà ogni volta.
ICODIR="$HOME/.local/share/icons/hicolor/256x256/apps"
APPS="$HOME/.local/share/applications"
if [ -f "$CARTELLA/web/icona.png" ]; then
  mkdir -p "$ICODIR" 2>/dev/null
  cp -f "$CARTELLA/web/icona.png" "$ICODIR/libre-vtt-icona.png" 2>/dev/null
  rm -f "$ICODIR/myvtt-icona.png" 2>/dev/null                 # il nome di quando si chiamava «MY VTT»
  command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -f "$HOME/.local/share/icons/hicolor" >/dev/null 2>&1
fi
# Mette LIBRE VTT nel menu delle applicazioni dell'utente, con il percorso di questa cartella (la voce
# copiata così com'è non troverebbe avvia-app.sh: cercherebbe accanto a sé, nel menu). Si rifà ogni volta,
# così vale anche se la cartella è stata spostata.
if [ -f "$CARTELLA/avvio/LIBRE VTT.desktop" ]; then
  mkdir -p "$APPS" 2>/dev/null
  rm -f "$APPS/myvtt.desktop" 2>/dev/null
  sed "s|^Exec=.*|Exec=\"$CARTELLA/avvio/avvia-app.sh\"|" "$CARTELLA/avvio/LIBRE VTT.desktop" > "$APPS/libre-vtt-cartella.desktop" 2>/dev/null
  command -v update-desktop-database >/dev/null && update-desktop-database "$APPS" >/dev/null 2>&1
fi

if ! command -v node >/dev/null; then
  echo "Serve Node: installalo (su Debian/Ubuntu: sudo apt install -y nodejs) e riprova."
  read -r -p "Premi Invio per chiudere." _
  exit 1
fi
exec node server/launcher.js
