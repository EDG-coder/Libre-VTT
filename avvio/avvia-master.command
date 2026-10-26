#!/bin/bash
# Avvia tutto quello che serve a chi conduce: i file del VTT, il server di gioco e il tubo iroh.
cd "$(dirname "$0")/.."

apri() { command -v open >/dev/null && open "$1" || (command -v xdg-open >/dev/null && xdg-open "$1"); }
LINK=./pacchetti/uffa-link/target/release/uffa-link

echo "Avvio il VTT su http://localhost:3000 …"
node server/server.js &
PID_FILES=$!

echo "Avvio il server di gioco su http://localhost:4000 …"
node server/game-server.js host &
PID_GIOCO=$!

sleep 1

if [ -x "$LINK" ]; then
  echo "Apro la sessione su iroh …"
  "$LINK" host &
  PID_LINK=$!
else
  echo
  echo "  ⚠️  uffa-link non è ancora compilato: la sessione resta solo su questo computer."
  echo "     Per farla a distanza:  cd pacchetti/uffa-link && cargo build --release"
  echo
fi

chiudi() { kill $PID_FILES $PID_GIOCO ${PID_LINK:-} 2>/dev/null; rm -f uffa-link.id; }
trap chiudi EXIT INT TERM

sleep 2
apri http://localhost:3000
apri http://localhost:4000

echo
echo "  Tutto acceso. L'ID da dare ai giocatori compare qui sopra e nel pannello."
echo "  Chiudi questa finestra (o Ctrl+C) per terminare la sessione."
wait
