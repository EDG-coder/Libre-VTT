# LIBRE VTT — stato del lavoro "ultimi punti" (rilascio unico finale, 3.5.0)

Copia di lavoro: /home/claude/uffa ; repo: /home/claude/libre-vtt (copiare i file cambiati, commit, push, dispatch rilascio.yml via gh api REST con inputs[versione]).

FATTO (non ancora rilasciato):
- Note più larghe/opache, slot in alto; turni --tw 260.
- Scheda Standard: «＋» in fondo agli attacchi (5 righe + ＋), dadi ◎◆ dentro il riquadro, scrollbar nascosta.
- Blocco 3: scene-mini.js (miniature data/miniature/<id>.webp via server.js /api/miniatura, anteprima, pillola «📌 Mostra ai giocatori», griglia scene riordino/duplica). Test: scratchpad/minitest.js
- Blocco 4: sistemi/ (dnd5e-2014, dnd5e-2024, vuoto) con sistema.json+formule.json; launcher sceglie sistema (nuova campagna / campagna vecchia / file .libresistema); server.js serve /sistema/*, /api/sistema (PUT, personalizza, esporta); sistema.js (client, editor, sfinimento 2014/2024, etichetta Specie, modelli scheda), sheet-gen.js (scheda generica); net/game-server passano world.sistema. Test: scratchpad/sistest.js. Packaging aggiornato per sistemi/.

IN CORSO — Blocco 5 compendio:
- Dati SRD: /home/claude/5e-bits/5e-database/src/{2014,2024}/en (MIT, contenuti CC-BY-4.0).
- Nomi italiani in /home/claude/uffa/strumenti/srd/it/: vocab.json, incantesimi.json, mostri.json FATTI; mancano equip, magic items, trait, feature (lista in scratchpad/nomi-en.json).
- Poi: convertitore strumenti/srd/converti.js -> sistemi/<id>/compendio/srd-5.x/{pacchetto.json, voci/*.json}; compendio.js (pannello ricerca/filtri, finestre voce, trascina mostro->segnalino+scheda, oggetto/incantesimo->scheda, @nome in chat, Nuova voce, import/export .librepack zip, visibilità master/tutti, invio ai giocatori come asset json).

DA FARE: Blocco 6 (Open5e, 5etools JSON, CSV, creazione guidata + Sali di livello), traduzioni EN, test completi, verifica indipendente, rilascio 3.5.0, riepilogo in italiano per punti.
iPhone (blocco 3) solo insieme all'utente via Device Hub.
