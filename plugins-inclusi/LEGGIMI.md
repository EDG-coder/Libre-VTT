# Plugin inclusi nelle app per telefoni e tablet

Le app per Android, iPhone e iPad non importano plugin: gli store non accettano codice scaricato o
aggiunto dopo la revisione. Usano solo i plugin messi in questa cartella, che finiscono dentro l'app
a ogni compilazione. Ognuno resta spento finché chi usa l'app non lo accende da ⚙ › Plugin.

Per ora la cartella è vuota. Un plugin si aggiunge come cartella con il suo `plugin.json`
(vedi `docs/plugins.md`), e arriva agli utenti con l'aggiornamento successivo dell'app.

Sul computer questa cartella non si usa: lì i plugin si importano da ⚙ › Plugin.
