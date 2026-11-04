# Plugin di LIBRE VTT

Un plugin aggiunge o cambia qualcosa del tavolo: i colori, i pacchetti del compendio, comandi in chat,
pulsanti, regole. Si gestiscono dalla rotellina ⚙ della home: *Impostazioni › Plugin › Gestisci i plugin*.

*English summary at the end.*

## Il tuo primo plugin in 2 minuti

1. Home › ⚙ › *Gestisci i plugin* › scegli il modello `empty-plugin` › **＋ Crea**. Si apre la cartella nuova.
2. Spunta il plugin nell'elenco. Apri il tavolo e scrivi `/hello` in chat.
3. Cambia `client.js` o `locales/it.json`, poi togli e rimetti la spunta: il tavolo prende la versione nuova.

## La cartella

Un plugin è una cartella dentro *Documenti › LIBRE VTT › Plugins* (sui telefoni, dentro l'app). Tutto è
facoltativo tranne `plugin.json`:

```
my-plugin/
  plugin.json          obbligatorio
  style.css            un tema
  client.js            il codice (sandbox o accesso completo)
  locales/it.json      i testi che vede chi gioca, una lingua per file
  locales/en.json
  data/compendium/<pacchetto>/pacchetto.json   pacchetti del compendio, nello stesso formato di quelli delle campagne
  images/              immagini usate dal tema
  README.md
```

Si condivide come cartella o come `.zip` (*Installa da .zip…*: se c'è già un plugin con lo stesso `id`, quello
vecchio va in `Plugins/.cestino`).

## plugin.json

Il codice, i nomi dei campi e delle funzioni sono in inglese; i testi per chi gioca possono avere una versione per lingua.

```json
{
  "id": "travel-weather",
  "name": { "it": "Meteo di viaggio", "en": "Travel weather" },
  "description": { "it": "Il tempo che fa, tirato a ogni giornata di viaggio.", "en": "The weather, rolled for each day of travel." },
  "version": "1.0.0",
  "author": "Mario",
  "license": "MIT",
  "libreVtt": ">=3.8",
  "access": "sandbox",
  "permissions": ["chat.write", "chat.commands", "ui.buttons"]
}
```

| Campo | Che cos'è |
| --- | --- |
| `id` | Minuscolo, senza spazi: `a-z`, `0-9`, `.`, `_`, `-` |
| `name`, `description` | Un testo, oppure un testo per lingua |
| `version` | `1.0.0` |
| `libreVtt` | Le versioni di LIBRE VTT con cui funziona: `>=3.8`, `>=3.8 <4`, `^3.8` |
| `api` | La versione dell'API dei plugin (oggi `1`) |
| `access` | `sandbox` (normale) oppure `full` (accesso completo, con i due avvisi) |
| `permissions` | Solo per `sandbox`: `chat.read`, `chat.write`, `chat.commands`, `ui.buttons`, `ui.notify` |
| `requires` | Altri plugin necessari: `{ "calendar": ">=1.2" }` |
| `after` | Plugin da applicare prima di questo: `["parchment-theme"]` |
| `conflicts` | Plugin che non possono stare applicati insieme a questo |
| `style`, `client` | Se i file non si chiamano `style.css` e `client.js` |
| `scope` | `client` (normale) oppure `network` se il plugin cambia cosa o come il tavolo comunica |

Se qualcosa non va (manca un file, una dipendenza, il consenso), il gestore lo scrive sotto il plugin.

## Un tema (style.css)

Il modo stabile di cambiare la grafica sono le variabili del tavolo:

```css
:root, :root[data-theme="dark"], :root[data-theme="light"] {
  --bg: #d9c7a1; --panel: #efe3c6; --panel-2: #e6d6b2; --panel-3: #dccaa2; --line: #b59d6e;
  --text: #2b1d0e; --text-soft: #4a3720; --muted: #6f5a3c;
  --msg: #e6d3ac; --roll-bg: #e9d9b5; --roll-text: #7a2e12;
  --hint-bg: rgba(239, 227, 198, .85); --hint-text: #4a3720;
  --accent: #8a3b12; --board-fill: #efe3c6;
}
```

Si possono usare anche le classi del tavolo, ma possono cambiare da una versione all'altra. Il CSS non può
caricare niente da internet: `@import` e `url(https://…)` vengono tolti. Le immagini vanno nella cartella del
plugin (`url("images/carta.webp")`). I temi dei plugin vengono dopo gli stili del tavolo, nell'ordine dell'elenco.

## Il codice (client.js)

`client.js` è un modulo JavaScript che esporta `activate(vtt)` e, se serve, `deactivate(vtt)`.

```js
export function activate(vtt) {
  vtt.on('chat.message', msg => { /* ogni messaggio nuovo, tiri compresi */ });
  vtt.commands.add('coin', args => vtt.chat.write(vtt.t('coin', { side: 'heads' })));
  vtt.ui.button({ label: '🪙', title: vtt.t('coin.button'), onClick: () => vtt.chat.write('…') });
  vtt.ui.notify(vtt.t('hello'));
  vtt.storage.set('count', 1);           // dati del plugin, restano su questo computer
}
export function deactivate(vtt) {}
```

| | Sandbox | Accesso completo |
| --- | --- | --- |
| Dove gira | Una cornice invisibile, senza origine, senza internet | Dentro la pagina del tavolo |
| Che cosa può fare | Solo l'API qui sotto, con i permessi dichiarati | Tutto: l'API, `vtt.hook(...)` e qualsiasi cosa della pagina |
| Chiamate | Asincrone (restituiscono una Promise) | Sincrone |
| Prima di applicarlo | Si vedono i permessi | Due avvisi, va scritto il nome del plugin |
| File | Uno solo (`client.js`, niente `import`) | Può importare altri file della sua cartella |

### L'API (`vtt`)

| Funzione | Permesso (sandbox) | Che cosa fa |
| --- | --- | --- |
| `vtt.id`, `vtt.lang` | — | L'id del plugin, la lingua del tavolo (`it`, `en`) |
| `vtt.t(chiave, {valori})` | — | Il testo da `locales/<lingua>.json` (se manca: inglese, poi la chiave stessa). `{nome}` diventa il valore |
| `vtt.on('chat.message', fn)` | `chat.read` | Ogni messaggio nuovo: `{ kind, text, label, total, rolls, sides, mod, by, secret, provisional, id }` |
| `vtt.on('scene.changed', fn)` | — | La scena è cambiata: `{ id }` |
| `vtt.chat.write(testo)` | `chat.write` | Scrive in chat a nome di chi usa il plugin |
| `vtt.commands.add(nome, fn)` | `chat.commands` | `/nome argomenti` in chat chiama `fn(argomenti, testo)` invece di mandare il messaggio |
| `vtt.ui.button({ label, title, onClick })` | `ui.buttons` | Un pulsante in alto al centro del tavolo |
| `vtt.ui.notify(testo)` | `ui.notify` | Un avviso che sparisce dopo 5 secondi |
| `vtt.storage.get(k)`, `vtt.storage.set(k, v)` | — | Dati del plugin su questo computer |
| `vtt.hook(nome, { before, replace, after })` | solo accesso completo | Si aggancia a una funzione del tavolo (vedi sotto) |
| `vtt.registry.list()` | solo accesso completo | Tutte le funzioni a cui ci si può agganciare |
| `vtt.onCleanup(fn)` | solo accesso completo | `fn` viene chiamata quando il plugin viene tolto |

### Agganci (solo accesso completo)

Ogni funzione del tavolo dichiarata con `function nome()` (circa 400) si può agganciare:

```js
vtt.hook('dice.roll', {
  before: (sides) => { if (sides === 20) return [20]; },               // nuovi argomenti, o { cancel: true, value }
  replace: (original, sides) => original(sides),                       // al posto della funzione
  after: (result, args) => { console.log('rolled', args[0]); }          // un altro risultato, o niente
});
```

I nomi stabili, da preferire perché non cambieranno: `chat.add`, `chat.send`, `chat.command`, `chat.render`,
`dice.roll`, `dice.rollExpression`, `net.send`, `net.receive`, `net.applyRole`, `scene.show`, `scene.switch`,
`scene.renderList`, `board.render`, `sheet.open`, `sheet.renderList`. Le altre funzioni si agganciano con il
loro nome interno (`vtt.registry.list().functions`), che può cambiare da una versione all'altra.

Quando il plugin viene tolto, LIBRE VTT toglie da solo agganci, comandi, pulsanti e ascoltatori. Quello che hai
cambiato a mano nella pagina va rimesso a posto in `deactivate()` (o con `vtt.onCleanup`).

## Tre stati

*Scaricato* (la cartella c'è), *caricato* (il tavolo ha già letto i file e li tiene in memoria), *applicato*. Il
tavolo controlla ogni 4 secondi che cosa è spuntato nella home: togliere la spunta riporta il plugin a *caricato*
e rimetterla lo riapplica all'istante. Se cambi i file, il plugin si ricarica da solo (l'impronta dei file è cambiata).

## Sicurezza

- I plugin in sandbox non vedono la pagina, i dati salvati nel browser (dove c'è la tua identità di gioco) e non
  possono usare internet.
- I plugin ad accesso completo possono fare tutto quello che fa LIBRE VTT. Per questo il consenso è legato
  all'impronta SHA-256 di tutti i file del plugin: se ne cambia anche uno solo, va dato di nuovo. Finché è
  applicato, in alto a sinistra sul tavolo c'è un pallino rosso di pochi pixel (passandoci sopra dice quali
  plugin sono). Si nasconde scrivendo `/plugin pallino` in chat e confermando con un clic; lo stesso comando
  lo rimette. Comando e clic devono essere veri (tastiera e mouse): un plugin non può nasconderlo così.
- In ogni caso, in una partita in rete decide il server del master: un plugin sul computer di un giocatore non
  gli dà poteri che il master non gli ha dato.
- Se un plugin rompe il tavolo, togli la spunta dalla home (*Togli tutti* li toglie tutti).

## Licenze

I plugin sono di chi li fa. Non mettere nei plugin che pubblichi testi dei manuali ufficiali che non hai il
diritto di distribuire.

---

## English summary

A plugin is a folder in *Documents › LIBRE VTT › Plugins* with a `plugin.json` (`id`, `name`, `version`,
`libreVtt`) and optionally `style.css` (a theme: override the CSS variables above), `client.js` (an ES module
exporting `activate(vtt)` / `deactivate(vtt)`), `locales/<lang>.json` (the texts users see, read with `vtt.t`)
and `data/compendium/<pack>/` (compendium packs). Manage plugins from the gear in the home screen: tick to apply,
arrows to reorder, *＋ Create* to start from a template, *Install from .zip…*.

Code runs either in a **sandbox** (default: an origin-less iframe with no network; only the API above, gated by
`permissions`) or with **full access** (`"access": "full"`: runs in the table page, can `vtt.hook()` any of the
~400 table functions with `before` / `replace` / `after`). Full access is applied only after two warnings, and the
consent is bound to the SHA-256 of the plugin's files. Plugins switched off stay loaded in memory and come back
instantly.
