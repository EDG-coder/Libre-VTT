# Contribuire a LIBRE VTT

Grazie dell'interesse! Ogni aiuto conta: segnalazioni, idee, traduzioni, codice, plugin.

## Segnalare un problema o proporre un'idea

Apri una [segnalazione](https://github.com/EDG-coder/Libre-VTT/issues/new/choose) e scegli il modulo
giusto. Per un bug servono versione, sistema e passi per farlo succedere di nuovo: con questi si
corregge molto prima. Per i problemi di sicurezza segui invece [SECURITY.md](SECURITY.md).

## Avviare il programma dal codice

Serve solo [Node.js](https://nodejs.org) 22 o più recente: niente `npm install`, il progetto non ha
dipendenze.

    npm start          # http://localhost:3000, nel browser
    npm run app        # come l'app installata (home con «Gioco da solo», «Conduco io», «Mi unisco»)
    npm run server     # server dedicato, senza finestre

Le cartelle del progetto sono descritte nel [README](README.md#le-cartelle-del-progetto).

## Le regole del progetto

- **Niente testo dei manuali ufficiali di D&D** nel repository: né incantesimi, né mostri, né
  descrizioni copiate. Va bene il materiale dell'SRD (con la sua attribuzione) e vanno bene gli
  strumenti che leggono sul computer di chi li usa i PDF che possiede.
- **Lingue**: il codice e i commenti nuovi in inglese o in italiano; i testi dell'interfaccia passano
  da `tr('Frase in italiano')` e la traduzione inglese va in `web/js/base/lingua-en.js`.
- **Niente dipendenze nuove** senza parlarne prima: il programma deve continuare a funzionare con
  il solo Node.js, anche senza internet.
- Una pull request per un argomento, con una descrizione di cosa cambia e come l'hai provata
  (sistema, browser, da solo o in rete).

## Plugin

Per estendere il programma senza toccarlo, leggi la guida [docs/plugins.md](docs/plugins.md) e
parti da uno dei modelli in `examples/plugins/`.

## Licenza

Contribuendo accetti che il tuo lavoro sia distribuito con la stessa licenza del progetto,
[AGPL-3.0](LICENSE). Chi partecipa segue il [codice di condotta](CODE_OF_CONDUCT.md).
