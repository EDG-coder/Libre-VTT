# The website version

Besides the app and the dedicated server, LIBRE VTT has a **website** version:

- `/` the landing page (what it is, pictures, «Play now» with the code, direct downloads from GitHub)
- `/gioca/` the table for **players**: paste the master's code, pick a name and you are in, with no account and
  nothing to install, even from a phone

From the website you can **only play as a player**: nobody can be the master from the browser (neither with the
master key, nor by getting the role from the panel). To run a game you need the app.

## How it works

```
 player (browser) ──wss──▶ relay (Cloudflare) ◀──wss── master's app (Node)
                                                         │
 player (app) ─────────── uffa-link (p2p) ───────────────┘
```

1. The master opens the game with the app («I'm the GM») and, on the open-game screen, switches on
   **🌐 Public game**. The app connects to the relay as master of **the room of its code** and proves it by
   signing with the code's key (the code is its public key): nobody else can be master of that room.
2. The player opens the website, pastes the code and joins. The browser computes the room name (a fingerprint of
   the code: the relay never sees the code) and connects there.
3. The relay is a postman: a player's messages go only to the master, the master's only to that player. It saves
   nothing. Everything else (permissions, fog, dice, who sees what) is decided by the master's app, exactly as for
   players who join with the app. Without the master connected there is no game.
4. Images (maps, tokens) come from the master in pieces; the browser checks their fingerprint and keeps them in
   its cache (`sw-asset.js`), so next time they are already there.

Players with the app keep joining as always (direct link with uffa-link); the two ways live together in the same
game.

### Accounts with a code (to play from more than one browser)

Without an account the master recognises a website player only by their browser (the signed token saved there):
changing device, or if the browser clears its data (Safari on iPhone does after 7 days), you come back as a new
person. With an account you don't:

1. In the **session panel** the master presses **🔑 Create account** on a player's profile. A 12-character code
   is created (for example `K7QM-2XPA-9RTD`), unique in the campaign. If the player is connected from the website
   they get it right away and can choose the password there; otherwise the master sends it to them.
2. The player, on the website's entry screen, opens **I have an account**, types code and password and joins with
   that profile (name, role, sheets) from any browser. The first time the player chooses the password; from then
   on it must be typed at every entry (reloading the page asks again). From the website, a profile with an account
   can no longer be taken with the browser token alone.
3. The master does not see the password and cannot change it. The only thing they can do is **⛔ Block account**:
   forever, the code stops working and the profile stays banned. If a player forgets the password, they come back
   from the website, the master creates a new account for them and gives the sheets back from «Permissions and
   sheets».

The code only works from the website (from the app you join as always). Everything is stored on the master's
computer, in the campaign's `players.json`. The password never travels as it is: the browser makes a fingerprint
of it (PBKDF2-SHA256, 200,000 rounds, with the code as salt) and sends that; the master hashes it again with
scrypt and a random salt and saves only the result. After 5 wrong passwords that code waits a quarter of an hour.

The code: relay in `relay/`, master side `server/relay-host.js` (+ `game-server.js`, `launcher.js`,
`launcher.html`), player side `sviluppo/sito-web/gioca/` (+ `NET.relay` in `web/js/base/net.js`).

## Building and testing locally

    node sviluppo/sito-web/costruisci.mjs          # creates _site/ (SITO_RELAY=wss://… for relay.json)
    cd relay && npx wrangler@4.149.0 dev           # the relay on http://127.0.0.1:8787

The master: `LIBRE_RELAY=ws://127.0.0.1:8787 LIBRE_RELAY_CHIAVE=<file with the key> node server/game-server.js host`
(the app does it by itself). The player: serve `_site/` (e.g. `python3 -m http.server 8000` inside `_site`) and
open `http://localhost:8000/gioca/?relay=ws://127.0.0.1:8787#<code>`.

## Publishing (only once, then it runs by itself)

The **Sito web** workflow (`.github/workflows/sito-web.yml`) does it: it starts by itself at the end of every
**Rilascio** (release) that publishes a version, or by hand from *Actions → Sito web → Run workflow*. It publishes
the relay (Cloudflare Workers) and the website (Cloudflare Pages), and writes the relay address in `relay.json` on
the website, where the table and the master's app read it.

### Cloudflare (free)

The website address will be `https://libre-vtt.pages.dev`.

1. Create a free account at https://dash.cloudflare.com/sign-up (an email is enough, no card).
2. Open **Workers & Pages** in the left menu once: the first time it asks you to choose your `….workers.dev`
   subdomain (e.g. `edg-coder`). Pick one and confirm.
3. **Account ID**: on the dashboard home, the three-dots menu next to the account name → *Copy account ID* (or
   you find it in the page address: `dash.cloudflare.com/<ID>/…`).
4. **Token**: https://dash.cloudflare.com/profile/api-tokens → *Create Token* → *Create Custom Token*.
   Name «LIBRE VTT sito»; in *Permissions* add two rows: *Account* · *Cloudflare Pages* · *Edit* and
   *Account* · *Workers Scripts* · *Edit*. In *Account Resources* choose *Include* · your account (not
   «All accounts»). *Continue to summary* → *Create Token*, and copy the token (it is shown only once).
   Do not paste it anywhere else: it only goes on GitHub, at step 5.
5. On GitHub, in the repository: *Settings → Environments → New environment*, name `cloudflare`.
   - *Deployment branches and tags* → *Selected branches and tags* → *Add deployment branch or tag rule*:
     branch `main`, then *Add* again → *Tag* `v*`. This way the secrets open only for the code of `main` and of
     published versions, not for a branch or a copy (fork) with a changed workflow.
   - further down, *Environment secrets* → *Add environment secret*: `CLOUDFLARE_API_TOKEN` (the token) and
     `CLOUDFLARE_ACCOUNT_ID` (the ID). Do not put them among the repository secrets.
   - then *Settings → Secrets and variables → Actions*, **Variables** tab → *New repository variable*:
     `SITO_WEB` = `cloudflare`, and `SITO_URL` = `https://libre-vtt.pages.dev` (Google needs it: sitemap and
     canonical address).
6. *Actions → Sito web → Run workflow*.

If the name `libre-vtt` were already taken on Pages, add the variable `SITO_CLOUDFLARE_NOME` with another name
(e.g. `libre-vtt-edg`) and update `SITO_URL`. The master's app looks for `relay.json` on
`https://libre-vtt.pages.dev`: with another address you must change `SITO_WEB` in `server/launcher.js` (or the
`LIBRE_SITO` environment variable).

### GitHub Pages (website only, as an alternative)

GitHub Pages cannot run the relay: it only works together with a relay published elsewhere (variable
`SITO_RELAY` = `wss://…`). *Settings → Pages → Source*: **GitHub Actions**, then variable
`SITO_WEB` = `github` (or `cloudflare,github`).

## Limits of the Cloudflare free plan

- **Website (Pages)**: unlimited traffic, files up to 25 MiB, 500 deployments a month.
- **Relay (Workers + Durable Objects)**: 100,000 requests a day. Each message reaching the relay counts as 1/20 of
  a request; a game with 5 website players for 4 hours uses a few thousand. Then 13,000 GB-s a day of work time:
  about 28 hours of active rooms a day. It resets at midnight UTC; if you go over, the relay gives errors until the
  next day (you pay nothing). The paid plan is $5 a month.
- Whoever wants to change the website or the relay publishes it **on their own account** (same steps): this
  repository's secrets do not reach copies (forks) or their pull requests.
- Anyone can publish **their own relay** (same steps, on their account) and write its address in the app, in
  ⚙ Settings › Advanced settings › Relay for the connection (your Cloudflare, your server or a third party's). The
  «Try» button checks that it answers; the link to give website players already carries the address (`?relay=`).
  The relay sees everything that goes to the website players: only use ones you trust.

## Making it findable on Google

After the first deployment: open https://search.google.com/search-console, add the site («URL prefix» with the
website address), verify it with the HTML file they give you (it goes in `sviluppo/sito-web/pagina/`) and submit
`sitemap.xml`. It also helps to put the address in the repository's *Website* field and in the README.

## Apps talking to each other through the relay (instead of iroh)

Usually two apps talk with iroh (direct link). If the network or the router does not let it through, in
⚙ Settings › Advanced settings › **Connection between apps** you can choose:

- **Direct (iroh)**: as always;
- **iroh first, then relay**: if the host does not answer in about half a minute, the bridge switches to the relay;
- **Relay only**: no uffa-link, everything goes through the relay.

Whoever connects through the relay joins the code's room like a website player: the host sees them as a «web»
connection (never master) and needs **🌐 Public game** switched on, with the **same relay** (the website's, or the
private one written by both in «Relay for the connection»). Through the relay there is no stable iroh channel.
