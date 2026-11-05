# Sicurezza

## Versioni seguite

Si correggono i problemi di sicurezza solo nell'**ultima versione** pubblicata nella pagina
[Releases](https://github.com/EDG-coder/Libre-VTT/releases). Se usi una versione precedente,
aggiorna prima di segnalare.

## Come segnalare un problema

**Non aprire una segnalazione pubblica** per un problema di sicurezza.

Usa invece la segnalazione privata di GitHub:
[Security › Report a vulnerability](https://github.com/EDG-coder/Libre-VTT/security/advisories/new).

Scrivi:
- la versione di LIBRE VTT e il sistema (Windows, macOS, Linux, Android, iPhone);
- come si gioca quando succede (da solo, «Conduco io», «Mi unisco», server dedicato);
- i passi per riprodurlo e cosa può fare chi lo sfrutta.

Rispondo appena posso, di solito entro una settimana. Quando la correzione è pubblicata
la segnalazione diventa pubblica, con il tuo nome se lo vuoi.

## Che cosa conta come problema di sicurezza

Per esempio:
- un giocatore che vede ciò che il master ha nascosto (nebbia, livello «Nascosto», schede private)
  o diventa master senza la chiave;
- qualcuno da fuori che raggiunge le porte locali (3000, 4000, 4100) e cambia o legge i dati;
- un plugin in modalità protetta (sandbox) che esce dalla protezione;
- un file (immagine, SVG, pacchetto, mappa .uvtt, campagna .zip) che esegue codice o scrive fuori
  dalla sua cartella;
- un download (Node.js, collegamento a distanza, Rust/Zig) accettato senza controllarne l'impronta.

Non sono problemi di sicurezza i plugin ad **accesso completo**: fanno quello che vogliono per
scelta di chi li installa, dopo i due avvisi.
