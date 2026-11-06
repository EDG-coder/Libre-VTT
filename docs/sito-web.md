# La versione sito web

Oltre all'app e al server dedicato, LIBRE VTT ha una versione **sito web**: una pagina di
presentazione e il tavolo che gira tutto nel browser, senza installare niente.

- `/` la pagina di presentazione (cos'è, immagini, «Gioca ora», «Scarica l'app»)
- `/gioca/` il tavolo

## Cosa si può fare sul sito (per ora)

Si gioca **da soli o tutti allo stesso schermo**: mappe, segnalini, schede, dadi, nebbia, luce
dinamica, compendio SRD con i segnalini, musica. Tutto viene salvato **solo in quel browser**
(cancellando i dati del sito si perde).

Non ci sono ancora: le partite in rete dal browser (arriveranno con il relay, nella seconda parte),
la home con le campagne, il pannello del master, l'importazione di pacchetti e manuali nel
compendio, i plugin installati e Open5e. Per quelli serve l'app.

## Come si costruisce

    node sviluppo/sito-web/costruisci.mjs

crea la cartella `_site/` con tutti i file (circa 22 MB, nessun file sopra i 25 MiB). Per provarla:
`cd _site && python3 -m http.server 8000` e apri http://localhost:8000.

I file della pagina di presentazione sono in `sviluppo/sito-web/pagina/`. Il tavolo è lo stesso di
`web/`, con in più `versione-web.js` (il segnale `window.LIBRE_WEB`, che fa rispondere subito «non
c'è» alle richieste al programma).

## Come si pubblica

Lo fa il workflow **Sito web** (`.github/workflows/sito-web.yml`): parte da solo alla fine di ogni
**Rilascio** che pubblica una versione, oppure a mano da *Actions → Sito web → Run workflow*. Dove
pubblicare lo decide la variabile `SITO_WEB`; senza variabile costruisce soltanto.

### Cloudflare Pages (consigliato: gratis, traffico senza limiti)

L'indirizzo sarà `https://libre-vtt.pages.dev`. Una volta sola:

1. Crea un account gratuito su https://dash.cloudflare.com/sign-up (basta un'email, nessuna carta).
2. **ID dell'account**: nella home della dashboard, menu dei tre puntini accanto al nome
   dell'account → *Copy account ID* (oppure lo trovi nell'indirizzo della pagina:
   `dash.cloudflare.com/<ID>/…`).
3. **Token**: https://dash.cloudflare.com/profile/api-tokens → *Create Token* → *Create Custom
   Token*. Nome «LIBRE VTT sito»; in *Permissions* scegli *Account* · *Cloudflare Pages* · *Edit*;
   *Continue to summary* → *Create Token*, e copia il token (si vede una volta sola).
4. Su GitHub, nel repository: *Settings → Secrets and variables → Actions*.
   - scheda **Secrets** → *New repository secret*: `CLOUDFLARE_API_TOKEN` (il token) e
     `CLOUDFLARE_ACCOUNT_ID` (l'ID).
   - scheda **Variables** → *New repository variable*: `SITO_WEB` = `cloudflare`, e
     `SITO_URL` = `https://libre-vtt.pages.dev` (serve a Google: sitemap e indirizzo ufficiale).
5. *Actions → Sito web → Run workflow*. La prima volta crea il progetto «libre-vtt» su Cloudflare.

Se il nome `libre-vtt` fosse già preso, aggiungi la variabile `SITO_CLOUDFLARE_NOME` con un altro
nome (es. `libre-vtt-edg`) e aggiorna `SITO_URL` di conseguenza.

### GitHub Pages (in alternativa, o anche insieme)

L'indirizzo sarà `https://edg-coder.github.io/Libre-VTT/`.

1. *Settings → Pages → Build and deployment → Source*: **GitHub Actions**.
2. Variabile `SITO_WEB` = `github` (oppure `cloudflare,github` per entrambi).
3. *Actions → Sito web → Run workflow*.

## Per farlo trovare su Google

Dopo la prima pubblicazione: apri https://search.google.com/search-console, aggiungi il sito
(«Prefisso URL» con l'indirizzo del sito), verificalo con il file HTML che ti danno (va messo in
`sviluppo/sito-web/pagina/`) e invia `sitemap.xml`. Aiuta anche mettere l'indirizzo nel campo
*Website* del repository e nel README.
