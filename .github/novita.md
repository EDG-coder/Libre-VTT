## Novità della 3.7.7

**Compendio: importare i manuali**
- **Nuovo lettore dei manuali** (Compendio › Pacchetti › «Importa da un manuale che possiedi»): legge anche i PDF scansionati e passati in OCR. Rimette insieme i titoli spaziati («A c id S p l a s h» → «Acid Splash») e le parole spezzate («W hen», «o f», «6 th-level», «can ’t»), e sistema le pagine a due colonne anche quando i margini cambiano da pagina a pagina.
- **Riconosce tutto il manuale da solo:** incantesimi (con le classi), mostri con azioni, oggetti magici, talenti e suppliche, specie con tratti e sottospecie, classi con i privilegi nei 20 livelli, sottoclassi, background con il loro privilegio, condizioni. Sul Manuale del Giocatore 2014 trova circa 530 voci. Restano da controllare a mano alcune specie e classi impaginate in modo particolare.
- **Traduci in italiano all'import:** quando importi un manuale in inglese, o un pacchetto (.librepack, .json di LIBRE VTT o di 5etools, CSV), una casella traduce in italiano nomi e testi con il traduttore del browser, sul tuo computer. Il testo originale resta (lo vedi con il compendio in inglese). Il traduttore c'è in Chrome ed Edge recenti, non in Brave, Safari o Firefox: lì la casella è spenta e lo spiega.
- **Dal terminale:** `sviluppo/strumenti/manuale-a-json/manuale-a-json.mjs` fa la stessa conversione (PDF o testo → JSON da importare).
