## Novità della 3.6.1

- **Progetto riordinato in cartelle**, al posto di tanti file tutti insieme:
  - `avvio/`: gli avviatori;
  - `server/`: i programmi che girano con Node;
  - `condiviso/`: il codice usato sia dal server sia dal browser;
  - `web/`: le pagine, con `css/`, `lib/` e `js/` diviso in `base`, `mappa`, `strumenti`, `schede` e `regole`;
  - `sistemi/`: i sistemi di gioco;
  - `pacchetti/`: installatori, Mac, app per telefono e collegamento a distanza;
  - `sviluppo/`: gli strumenti per chi sviluppa.

  Per chi gioca non cambia niente: installatori, app e aggiornamenti funzionano come prima. Chi usa la cartella del progetto trova gli avviatori in `avvio/`.
- L'installatore per Windows (setup.exe) ora toglie i file del programma della versione di prima prima di mettere quelli nuovi.
