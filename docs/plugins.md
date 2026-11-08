# LIBRE VTT plugins

A plugin adds or changes something on the table: colours, compendium packs, chat commands, buttons, rules. They
are managed from the ⚙ gear on the home screen: *Settings › Plugin › 🧩 Manage plugins*.

## Your first plugin in 2 minutes

1. Home › ⚙ › *Manage plugins* › pick the `empty-plugin` template › **＋ Create**. The new folder opens.
2. Tick the plugin in the list. Open the table and type `/hello` in chat.
3. Change `client.js` or `locales/en.json`, then untick and tick it again: the table takes the new version.

## The folder

A plugin is a folder inside *Documents › LIBRE VTT › Plugins* (on phones, inside the app). Everything is optional
except `plugin.json`:

```
my-plugin/
  plugin.json          required
  style.css            a theme
  client.js            the code (sandbox or full access)
  locales/it.json      the texts players see, one language per file
  locales/en.json
  data/compendium/<pack>/pacchetto.json   compendium packs, in the same format as the campaigns' ones
  images/              images used by the theme
  README.md
```

It is shared as a folder or as a `.zip` (*Install from .zip…*: if there is already a plugin with the same `id`,
the old one goes into `Plugins/.cestino`, the bin).

To take a plugin off the list, press 🗑 on its row and confirm: its folder is moved to the system Trash
(the Recycle Bin on Windows; nothing is erased, you can put it back in the plugins folder) and LIBRE VTT forgets it was applied and any consent given to it.
Templates are not touched: you can always create a new plugin from them. In the phone and tablet apps the
plugins included in the app cannot be deleted, only switched off.

## plugin.json

Code, field names and function names are in English; the texts players see can have one version per language.

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

| Field | What it is |
| --- | --- |
| `id` | Lowercase, no spaces: `a-z`, `0-9`, `.`, `_`, `-` |
| `name`, `description` | A text, or one text per language |
| `version` | `1.0.0` |
| `libreVtt` | The LIBRE VTT versions it works with: `>=3.8`, `>=3.8 <4`, `^3.8` |
| `api` | The plugin API version (today `1`) |
| `access` | `sandbox` (normal) or `full` (full access, with the two warnings) |
| `permissions` | Only for `sandbox`: `chat.read`, `chat.write`, `chat.commands`, `ui.buttons`, `ui.notify` |
| `requires` | Other plugins needed: `{ "calendar": ">=1.2" }` |
| `after` | Plugins to apply before this one: `["parchment-theme"]` |
| `conflicts` | Plugins that cannot be applied together with this one |
| `style`, `client` | If the files are not called `style.css` and `client.js` |
| `scope` | `client` (normal) or `network` if the plugin changes what or how the table communicates |

If something is wrong (a missing file, a dependency, the consent), the manager writes it under the plugin.

## A theme (style.css)

The stable way to change the look is the table's variables:

```css
:root, :root[data-theme="dark"], :root[data-theme="light"] {
  --bg: #d9c7a1; --panel: #efe3c6; --panel-2: #e6d6b2; --panel-3: #dccaa2; --line: #b59d6e;
  --text: #2b1d0e; --text-soft: #4a3720; --muted: #6f5a3c;
  --msg: #e6d3ac; --roll-bg: #e9d9b5; --roll-text: #7a2e12;
  --hint-bg: rgba(239, 227, 198, .85); --hint-text: #4a3720;
  --accent: #8a3b12; --board-fill: #efe3c6;
}
```

You can also use the table's classes, but they can change from one version to the next. The CSS cannot load
anything from the internet: `@import` and `url(https://…)` are removed. Images go in the plugin folder
(`url("images/paper.webp")`). Plugin themes come after the table's styles, in the order of the list.

## The code (client.js)

`client.js` is a JavaScript module that exports `activate(vtt)` and, if needed, `deactivate(vtt)`.

```js
export function activate(vtt) {
  vtt.on('chat.message', msg => { /* every new message, rolls included */ });
  vtt.commands.add('coin', args => vtt.chat.write(vtt.t('coin', { side: 'heads' })));
  vtt.ui.button({ label: '🪙', title: vtt.t('coin.button'), onClick: () => vtt.chat.write('…') });
  vtt.ui.notify(vtt.t('hello'));
  vtt.storage.set('count', 1);           // plugin data, stays on this computer
}
export function deactivate(vtt) {}
```

| | Sandbox | Full access |
| --- | --- | --- |
| Where it runs | An invisible frame, with no origin and no internet | Inside the table page |
| What it can do | Only the API below, with the declared permissions | Everything: the API, `vtt.hook(...)` and anything in the page |
| Calls | Asynchronous (they return a Promise) | Synchronous |
| Before applying it | The permissions are shown | Two warnings, the plugin's name must be typed |
| Files | Just one (`client.js`, no `import`) | It can import other files from its folder |

### The API (`vtt`)

| Function | Permission (sandbox) | What it does |
| --- | --- | --- |
| `vtt.id`, `vtt.lang` | — | The plugin's id, the table's language (`it`, `en`) |
| `vtt.t(key, {values})` | — | The text from `locales/<language>.json` (if missing: English, then the key itself). `{name}` becomes the value |
| `vtt.on('chat.message', fn)` | `chat.read` | Every new message: `{ kind, text, label, total, rolls, sides, mod, by, secret, provisional, id }` |
| `vtt.on('scene.changed', fn)` | — | The scene changed: `{ id }` |
| `vtt.chat.write(text)` | `chat.write` | Writes in chat on behalf of whoever uses the plugin |
| `vtt.commands.add(name, fn)` | `chat.commands` | `/name arguments` in chat calls `fn(arguments, text)` instead of sending the message |
| `vtt.ui.button({ label, title, onClick })` | `ui.buttons` | A button at the top centre of the table |
| `vtt.ui.notify(text)` | `ui.notify` | A notice that disappears after 5 seconds |
| `vtt.storage.get(k)`, `vtt.storage.set(k, v)` | — | Plugin data on this computer |
| `vtt.hook(name, { before, replace, after })` | full access only | Hooks into a table function (see below) |
| `vtt.registry.list()` | full access only | All the functions you can hook into |
| `vtt.onCleanup(fn)` | full access only | `fn` is called when the plugin is removed |

### Hooks (full access only)

Every table function declared with `function name()` (about 400) can be hooked:

```js
vtt.hook('dice.roll', {
  before: (sides) => { if (sides === 20) return [20]; },               // new arguments, or { cancel: true, value }
  replace: (original, sides) => original(sides),                       // instead of the function
  after: (result, args) => { console.log('rolled', args[0]); }          // another result, or nothing
});
```

The stable names, to prefer because they will not change: `chat.add`, `chat.send`, `chat.command`, `chat.render`,
`dice.roll`, `dice.rollExpression`, `net.send`, `net.receive`, `net.applyRole`, `scene.show`, `scene.switch`,
`scene.renderList`, `board.render`, `sheet.open`, `sheet.renderList`. Other functions are hooked by their internal
name (`vtt.registry.list().functions`), which can change from one version to the next.

When the plugin is removed, LIBRE VTT removes hooks, commands, buttons and listeners by itself. Whatever you changed
by hand in the page must be put back in `deactivate()` (or with `vtt.onCleanup`).

## Three states

*Downloaded* (the folder is there), *loaded* (the table has already read the files and keeps them in memory),
*applied*. Every 4 seconds the table checks what is ticked on the home screen: unticking brings the plugin back to
*loaded* and ticking it again re-applies it instantly. If you change the files, the plugin reloads by itself (the
files' fingerprint changed).

## Sharing a plugin with the players

When you host a game, you can send your plugins to the players. In *⚙ › Plugin*, under an applied plugin:

- **Share with the players**: whoever joins your game is offered it. Nothing is downloaded and nothing runs until
  they say yes; they can also play without it.
- **Needed to join** (only for a shared plugin): whoever joins sees the list of what you ask for and stays in front
  of the door until they accept. *Leave* is always there. In the session panel they show up as
  «🧩 looking at the plugins» and you cannot let them in by hand: they enter when they accept.

What the player sees before saying yes: the name, the version, the author, the size, whether it is a theme,
sandboxed code (with its permissions) or full access. A full-access plugin goes through the same two warnings as in
the home, with its name to type.

How it travels and where it stays:

- The files go in pieces through the game connection (direct link or the relay of the website). The player checks
  them against the fingerprint (SHA-256 of all the files) your app announced: the consent is tied to exactly those
  files. A plugin that changes (a new version, a single file) is asked again; a plugin you stop sharing is taken
  away from the players' tables at once.
- They are kept **only in memory**: on the player's computer nothing is written to the plugins folder. The yes (and
  the no to an optional one) is remembered for those files, so next time they are loaded without asking.
- Up to 8 MB per plugin. The compendium packs (`data/compendium`) are not sent: the players get your compendium as
  always, from the table.
- `/plugin master` in the chat shows the list again, to take a plugin or remove one.

What can run where:

| | Theme | Sandboxed code | Full access |
| --- | --- | --- | --- |
| Desktop app | ✓ | ✓ | ✓ (after the two warnings) |
| Website | ✓ | ✓ | — |
| Phone and tablet apps | ✓ | — | — |

If a plugin you made necessary cannot run where a player is (a full-access one, from the website), they are told
why and cannot join from there. Players with a LIBRE VTT from before this feature cannot receive plugins: if one is
necessary they are told to update. A dedicated server (`--server`) does not share plugins yet.

## Security

- Sandboxed plugins cannot see the page or the data saved in the browser (where your game identity is), and cannot
  use the internet.
- Full-access plugins can do everything LIBRE VTT does. That is why consent is tied to the SHA-256 fingerprint of
  all the plugin's files: if even one changes, consent must be given again. While one is applied, there is a red
  dot a few pixels wide at the top left of the table (hovering it says which plugins they are). You hide it by
  typing `/plugin pallino` in chat and confirming with a click; the same command brings it back. Command and click
  must be real (keyboard and mouse): a plugin cannot hide it this way.
- In any case, in a network game the master's server decides: a plugin on a player's computer does not give them
  powers the master did not give them.
- If a plugin breaks the table, untick it on the home screen (*Remove all* removes them all).

## Licenses

Plugins belong to whoever makes them. Do not put in the plugins you publish texts from official books you do not
have the right to distribute.
