#!/bin/bash
# Gioco da solo su questo computer: serve solo Node.
cd "$(dirname "$0")/.."

apri() { command -v open >/dev/null && open "$1" || (command -v xdg-open >/dev/null && xdg-open "$1"); }

if ! command -v node >/dev/null; then
  echo "Node non risulta installato. Scaricalo da https://nodejs.org e riprova."
  read -r -p "Premi Invio per chiudere." _
  exit 1
fi

node server/server.js &
PID=$!
trap 'kill $PID 2>/dev/null' EXIT INT TERM

sleep 1
apri http://localhost:3000

echo
echo "  Il tavolo è su http://localhost:3000 — Ctrl+C (o chiudi la finestra) per fermarlo."
wait
