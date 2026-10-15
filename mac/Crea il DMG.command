#!/bin/bash
# Doppio clic: crea «LIBRE VTT.dmg» con dentro tutto (serve un Mac e la connessione a internet).
cd "$(dirname "$0")" || exit 1
bash ./crea-dmg.sh
echo
read -r -p "Premi Invio per chiudere questa finestra." _
