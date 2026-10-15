#!/bin/bash
# Avvia l'avviatore con la finestra da app (Linux, e in generale ovunque).
cd "$(dirname "$0")" || exit 1
CARTELLA="$(pwd)"

# Mette l'icona nel tema delle icone dell'utente, così "LIBRE VTT.desktop" la trova con il nome
# "myvtt-icona" invece che con un percorso fisso (che non potremmo conoscere in anticipo,
# visto che non sappiamo dove scompatterai la cartella). Economico, si rifà ogni volta.
if [ -f "$CARTELLA/icona.png" ]; then
  ICODIR="$HOME/.local/share/icons/hicolor/256x256/apps"
  mkdir -p "$ICODIR" 2>/dev/null
  cp -f "$CARTELLA/icona.png" "$ICODIR/myvtt-icona.png" 2>/dev/null
  command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -f "$HOME/.local/share/icons/hicolor" >/dev/null 2>&1
fi
# Copia anche il file .desktop nel menu applicazioni dell'utente, se non c'è già, così LIBRE VTT
# compare nel launcher di sistema con l'icona giusta (non solo facendo doppio clic nella cartella).
if [ -f "$CARTELLA/LIBRE VTT.desktop" ] && [ ! -f "$HOME/.local/share/applications/myvtt.desktop" ]; then
  mkdir -p "$HOME/.local/share/applications" 2>/dev/null
  cp -f "$CARTELLA/LIBRE VTT.desktop" "$HOME/.local/share/applications/myvtt.desktop" 2>/dev/null
  command -v update-desktop-database >/dev/null && update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1
fi

if ! command -v node >/dev/null; then
  echo "Serve Node: installalo (su Debian/Ubuntu: sudo apt install -y nodejs) e riprova."
  read -r -p "Premi Invio per chiudere." _
  exit 1
fi
exec node launcher.js
