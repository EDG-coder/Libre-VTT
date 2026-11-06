# La versione sito web

Oltre all'app e al server dedicato, LIBRE VTT ha una versione **sito web**:

- `/` la pagina di presentazione (cos'è, immagini, «Gioca ora» con il codice, download diretti da GitHub)
- `/gioca/` il tavolo per i **giocatori**: si incolla il codice del master, si sceglie un nome e si entra,
  senza account e senza installare niente, anche dal telefono

Dal sito si gioca **solo da giocatori**: nessuno può fare il master dal browser (né con la chiave del
master, né facendosi dare il ruolo dal pannello). Per condurre serve l'app.

## Come funziona

```
 giocatore (browser) ──wss──▶ relay (Cloudflare) ◀──wss── app del master (Node)
                                                           │
 giocatore (app) ─────────── uffa-link (p2p) ──────────────┘
```

1. Il master apre la partita con l'app («Conduco io») e, nella schermata della partita aperta, accende
   **🌐 Partita pubblica**. L'app si collega al relay come master della **stanza del suo codice** e lo
   dimostra firmando con la chiave del codice (il codice è la sua chiave pubblica): nessun altro può fare
   il master di quella stanza.
2. Il giocatore apre il sito, incolla il codice ed entra. Il browser calcola il nome della stanza
   (un'impronta del codice: il relay non vede mai il codice) e si collega lì.
3. Il relay è un postino: i messaggi di un giocatore vanno solo al master, quelli del master solo a quel
   giocatore. Non salva niente. Tutto il resto (permessi, nebbia, dadi, chi vede cosa) lo decide l'app del
   master, esattamente come per i giocatori che entrano con l'app. Senza master collegato non si gioca.
4. Le immagini (mappe, segnalini) arrivano dal master a pezzi, il browser controlla l'impronta e le tiene
   nella sua cache (`sw-asset.js`), così la volta dopo sono già lì.

I giocatori con l'app continuano a entrare come sempre (collegamento diretto con uffa-link); i due modi
convivono nella stessa partita.

Il codice: relay in `relay/`, lato master `server/relay-host.js` (+ `game-server.js`, `launcher.js`,
`launcher.html`), lato giocatore `sviluppo/sito-web/gioca/` (+ `NET.relay` in `web/js/base/net.js`).

## Come si costruisce e si prova in locale

    node sviluppo/sito-web/costruisci.mjs          # crea _site/ (SITO_RELAY=wss://… per relay.json)
    cd relay && npx wrangler@4.149.0 dev           # il relay su http://127.0.0.1:8787

Il master: `LIBRE_RELAY=ws://127.0.0.1:8787 LIBRE_RELAY_CHIAVE=<file con la chiave> node server/game-server.js host`
(dall'app lo fa da sé). Il giocatore: servi `_site/` (es. `python3 -m http.server 8000` dentro `_site`) e apri
`http://localhost:8000/gioca/?relay=ws://127.0.0.1:8787#<codice>`.

## Come si pubblica (una volta sola, poi va da sé)

Lo fa il workflow **Sito web** (`.github/workflows/sito-web.yml`): parte da solo alla fine di ogni
**Rilascio** che pubblica una versione, oppure a mano da *Actions → Sito web → Run workflow*. Pubblica il
relay (Cloudflare Workers) e il sito (Cloudflare Pages), e scrive l'indirizzo del relay in `relay.json`
sul sito, da dove lo leggono il tavolo e l'app del master.

### Cloudflare (gratis)

L'indirizzo del sito sarà `https://libre-vtt.pages.dev`.

1. Crea un account gratuito su https://dash.cloudflare.com/sign-up (basta un'email, nessuna carta).
2. Apri una volta **Workers & Pages** nel menu a sinistra: la prima volta ti chiede di scegliere il tuo
   sottodominio `….workers.dev` (es. `edg-coder`). Scegline uno e conferma.
3. **ID dell'account**: nella home della dashboard, menu dei tre puntini accanto al nome dell'account →
   *Copy account ID* (oppure lo trovi nell'indirizzo della pagina: `dash.cloudflare.com/<ID>/…`).
4. **Token**: https://dash.cloudflare.com/profile/api-tokens → *Create Token* → *Create Custom Token*.
   Nome «LIBRE VTT sito»; in *Permissions* aggiungi due righe: *Account* · *Cloudflare Pages* · *Edit* e
   *Account* · *Workers Scripts* · *Edit*. *Continue to summary* → *Create Token*, e copia il token (si vede
   una volta sola).
5. Su GitHub, nel repository: *Settings → Secrets and variables → Actions*.
   - scheda **Secrets** → *New repository secret*: `CLOUDFLARE_API_TOKEN` (il token) e
     `CLOUDFLARE_ACCOUNT_ID` (l'ID).
   - scheda **Variables** → *New repository variable*: `SITO_WEB` = `cloudflare`, e
     `SITO_URL` = `https://libre-vtt.pages.dev` (serve a Google: sitemap e indirizzo ufficiale).
6. *Actions → Sito web → Run workflow*.

Se il nome `libre-vtt` fosse già preso su Pages, aggiungi la variabile `SITO_CLOUDFLARE_NOME` con un altro
nome (es. `libre-vtt-edg`) e aggiorna `SITO_URL`. L'app del master cerca `relay.json` su
`https://libre-vtt.pages.dev`: con un altro indirizzo va cambiato `SITO_WEB` in `server/launcher.js`
(o la variabile d'ambiente `LIBRE_SITO`).

### GitHub Pages (solo il sito, in alternativa)

GitHub Pages non può far girare il relay: va bene solo insieme a un relay pubblicato altrove (variabile
`SITO_RELAY` = `wss://…`). *Settings → Pages → Source*: **GitHub Actions**, poi variabile
`SITO_WEB` = `github` (o `cloudflare,github`).

## Limiti del piano gratuito di Cloudflare

- **Sito (Pages)**: traffico senza limiti, file fino a 25 MiB, 500 pubblicazioni al mese.
- **Relay (Workers + Durable Objects)**: 100.000 richieste al giorno. Ogni messaggio che arriva al relay
  conta 1/20 di richiesta; una partita con 5 giocatori dal sito per 4 ore ne usa qualche migliaio. Poi
  13.000 GB-s al giorno di tempo di lavoro: circa 28 ore di stanze attive al giorno. Si azzera a mezzanotte
  UTC; se si sfora, il relay dà errore fino al giorno dopo (non si paga niente). Il piano a pagamento è
  5 $ al mese.
- Chi vuole può pubblicare **un relay suo** (stessi passi, sul suo account) e scriverne l'indirizzo
  nell'app, in «Partita pubblica → Un relay tuo».

## Per farlo trovare su Google

Dopo la prima pubblicazione: apri https://search.google.com/search-console, aggiungi il sito
(«Prefisso URL» con l'indirizzo del sito), verificalo con il file HTML che ti danno (va messo in
`sviluppo/sito-web/pagina/`) e invia `sitemap.xml`. Aiuta anche mettere l'indirizzo nel campo
*Website* del repository e nel README.
