## Novità della 3.8.1

**Server dedicato: la partita sempre aperta su una macchina senza schermo**
- **Una versione di LIBRE VTT che collega e basta:** su una schedina sempre accesa (ARM o RISC-V), un vecchio portatile o un server gira solo la parte che tiene la campagna e collega i dispositivi. Nessuno gioca da lì: tutti, master compreso, entrano dal proprio LIBRE VTT con «Mi unisco» e il codice della partita.
- **Si installa con** `bash Installa-LIBRE-VTT-Linux.sh --server`: niente finestre né menu, parte da solo all'accensione e scrive il codice della partita e la **chiave del master**. Dalla cartella del progetto: `npm run server`.
- **Il master lo autorizza il server:** chi conduce, la prima volta, scrive la chiave del master sotto il codice in «Mi unisco» (*Conduco io su un server dedicato*). Dopo il server lo riconosce da solo. Senza la chiave, o con quella sbagliata, si entra da giocatore; chi si siede alla macchina del server non diventa master.
- **Più master:** dal pannello della sessione il master può dare il ruolo di master anche ad altri; il server tiene sempre almeno un master. Ruoli e chiave si gestiscono anche dalla riga di comando del server (`giocatori`, `master <nome>`, `nuova-chiave`).
- **Il pannello della sessione funziona anche da fuori:** il master entrato da un altro computer apre il pannello dal suo tavolo e regola permessi, provvedimenti, ruoli e codice della partita sul server.
- **La campagna resta sul server:** il master che entra da fuori prende scene, schede, note e turni dal server e li modifica da lì. Una campagna già giocata si porta sul server copiandone la cartella.

**Sistemato**
- L'installatore per Linux si fermava con un errore su RISC-V, e anche su PC e ARM quando doveva scaricare Node.
- `npm start` cercava un file che non c'è più: ora avvia il tavolo (`npm run app` la finestra di avvio).
- I nomi rimasti di quando il programma si chiamava «MY VTT»: le variabili d'ambiente ora sono `LIBRE_*` (quelle vecchie valgono ancora), e i file di avvio per Mac e l'installatore per Windows hanno il nome nuovo.
- Su Linux, la voce nel menu creata dalla cartella del progetto ora apre davvero LIBRE VTT.
