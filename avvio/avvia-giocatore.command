#!/bin/bash
# Avvia tutto quello che serve a un giocatore: chiede l'ID della sessione e si collega.
cd "$(dirname "$0")/.."

apri() { command -v open >/dev/null && open "$1" || (command -v xdg-open >/dev/null && xdg-open "$1"); }
LINK=./pacchetti/uffa-link/target/release/uffa-link

if [ ! -x "$LINK" ]; then
  echo "uffa-link non è compilato. Fallo una volta sola con:"
  echo "    cd pacchetti/uffa-link && cargo build --release"
  echo
  read -r -p "Premi Invio per chiudere." _
  exit 1
fi

ID="$1"
if [ -z "$ID" ]; then
  echo "Incolla qui l'ID che ti ha dato il master e premi Invio:"
  read -r ID
fi
if [ -z "$ID" ]; then echo "Senza ID non posso collegarmi."; exit 1; fi

echo "Avvio il VTT su http://localhost:3000 …"
node server/server.js &
PID_FILES=$!

echo "Mi collego alla sessione …"
"$LINK" join "$ID" &
PID_LINK=$!

sleep 1
node server/game-server.js join &
PID_GIOCO=$!

chiudi() { kill $PID_FILES $PID_GIOCO $PID_LINK 2>/dev/null; }
trap chiudi EXIT INT TERM

sleep 2
apri http://localhost:3000

echo
echo "  Se vedi la mappa del master sei dentro. Chiudi questa finestra per uscire."
wait
