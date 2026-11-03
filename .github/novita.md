## Novità della 3.7.9

**Aggiornamento di sicurezza, consigliato a tutti**
- **Corretti diversi problemi di sicurezza:** in certe condizioni un sito aperto nel browser, un file condiviso (un pacchetto del compendio, una campagna, una scena) o un partecipante malintenzionato potevano interferire con una partita in rete o con il computer di chi gioca. Aggiorna sia il master sia i giocatori.
- **Il codice nuovo si accetta a mano:** quando il master cambia il codice della campagna, chi gioca vede un avviso e passa al codice nuovo solo premendo «Sì, passa al nuovo».
- **Aggiornamenti controllati:** prima di aprire l'installatore di un aggiornamento, l'app controlla che sia identico a quello pubblicato (con il file `SHA256SUMS.txt` della release).
- **Limiti contro gli abusi:** un giocatore non può più mandare richieste o messaggi a raffica, né file enormi, rallentando la partita per tutti. Il master non ha limiti.

**Nuove piattaforme**
- **Windows su ARM, nativo:** sui PC con processore ARM (per esempio Snapdragon) `LIBRE-VTT-Setup.exe` e `Installa-LIBRE-VTT-Windows.cmd` installano Node e il collegamento a distanza per ARM, senza emulazione.
- **Linux su RISC-V:** `Installa-LIBRE-VTT-Linux.sh` funziona anche sui computer RISC-V a 64 bit, con Node e il collegamento a distanza già dentro.
