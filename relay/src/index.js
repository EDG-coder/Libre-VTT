// ---------- Il relay di LIBRE VTT (Cloudflare Workers + Durable Objects) ----------
// Fa entrare nella partita i giocatori che giocano dal sito, senza installare niente.
// È un postino e basta: non salva niente, non legge i messaggi, non decide niente.
//
//   - una partita = una «stanza» = un Durable Object. Il nome della stanza è l'impronta del codice del
//     master (sha256 di «libre-vtt-stanza|<codice>»): il relay non riceve mai il codice dai giocatori.
//   - il master (il programma che conduce, in Node) entra con ?ruolo=master e si fa riconoscere firmando con
//     la chiave del codice (il codice È la sua chiave pubblica Ed25519): nessun altro può fare il master.
//   - i messaggi di un giocatore vanno solo al master; quelli del master solo al giocatore a cui sono
//     diretti. I giocatori non si vedono tra loro: la nebbia e le cose nascoste le filtra il master.
//   - senza master collegato non si gioca: il giocatore viene chiuso (4004) e il suo browser riprova.
//
// Protocollo (v1), tutto testo:
//   master → relay  {"t":"master","codice":…,"ts":…,"firma":…}   la prima volta, poi:
//                   "<id>\n<messaggio>"  al giocatore <id>         "x<id>"  chiudi il giocatore <id>
//   relay → master  {"t":"pronto"}  "+<id>" è entrato  "-<id>" è uscito  "<id>\n<messaggio>" da <id>
//   giocatore ↔ relay  il messaggio così com'è
//
// Usa la Hibernation API: mentre nessuno scrive, la stanza dorme e non consuma.

const VERSIONE = 'v1';
const MAX_GIOCATORI = 40;
const MAX_MSG_GIOCATORE = 512 * 1024;          // i pezzi di un'immagine sono ~64 KB
const RAFFICA = { n: 300, ms: 10000 };         // al massimo 300 messaggi in 10 secondi per giocatore
const FIRMA_VALIDA_MS = 5 * 60 * 1000;

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const daHex = h => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));
async function sha256Hex(s) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))); }
export const nomeStanza = codice => sha256Hex('libre-vtt-stanza|' + codice);

function risposta(testo, stato = 200, extra = {}) {
  return new Response(testo, { status: stato, headers: { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*', ...extra } });
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (u.pathname === '/' || u.pathname === '/' + VERSIONE) return risposta('Relay di LIBRE VTT (' + VERSIONE + '): qui non c\'è niente da vedere.\n');
    const m = u.pathname.match(/^\/v1\/stanza\/([a-f0-9]{64})$/);
    if (!m) return risposta('Non trovato.', 404);
    if (req.headers.get('Upgrade') !== 'websocket') return risposta('Serve un WebSocket.', 426);
    // (facoltativo) solo dai siti scritti in ORIGINI, separati da virgole; il programma del master non ne manda
    const origini = String(env.ORIGINI || '').split(',').map(s => s.trim()).filter(Boolean);
    const org = req.headers.get('Origin');
    if (org && origini.length && !origini.includes(org)) return risposta('Sito non ammesso.', 403);
    const id = env.STANZE.idFromName(m[1]);
    return env.STANZE.get(id).fetch(req);
  }
};

export class Stanza {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this.raffiche = new Map(); }

  master() { return this.ctx.getWebSockets('master').find(ws => (ws.deserializeAttachment() || {}).ok) || null; }
  giocatore(id) { return this.ctx.getWebSockets('g:' + id)[0] || null; }

  async fetch(req) {
    const u = new URL(req.url);
    const stanza = u.pathname.split('/').pop();
    const ruolo = u.searchParams.get('ruolo') === 'master' ? 'master' : 'giocatore';
    const [client, server] = Object.values(new WebSocketPair());
    if (ruolo === 'master') {
      this.ctx.acceptWebSocket(server, ['master']);
      server.serializeAttachment({ ruolo, stanza, ok: false, da: Date.now() });
    } else {
      const m = this.master();
      const quanti = this.ctx.getWebSockets().length - this.ctx.getWebSockets('master').length;
      let id = '';
      for (let i = 0; i < 5 && (!id || this.giocatore(id)); i++) id = hex(crypto.getRandomValues(new Uint8Array(4)));
      this.ctx.acceptWebSocket(server, ['g:' + id]);
      server.serializeAttachment({ ruolo, id });
      // senza master (o stanza piena) lo si accetta solo per dirgli perché, e lo si chiude: il browser riprova
      if (!m) server.close(4004, 'Il master non ha aperto la partita (o non è collegato).');
      else if (quanti >= MAX_GIOCATORI) server.close(4029, 'La stanza è piena.');
      else m.send('+' + id);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, dati) {
    if (typeof dati !== 'string') return;                 // solo testo
    const a = ws.deserializeAttachment() || {};
    if (a.ruolo === 'master') {
      if (!a.ok) return this.presentazione(ws, a, dati);
      if (dati[0] === 'x') { const g = this.giocatore(dati.slice(1, 9)); if (g) try { g.close(4000, 'Chiuso dal master.'); } catch {} return; }
      const i = dati.indexOf('\n');
      if (i <= 0) return;
      const g = this.giocatore(dati.slice(0, i));
      if (g) try { g.send(dati.slice(i + 1)); } catch {}
      return;
    }
    // un giocatore: solo verso il master, con il suo numero davanti
    if (dati.length > MAX_MSG_GIOCATORE) { try { ws.close(4009, 'Messaggio troppo grande.'); } catch {} return; }
    const ora = Date.now();
    let r = this.raffiche.get(a.id);
    if (!r || ora - r.da > RAFFICA.ms) this.raffiche.set(a.id, r = { da: ora, n: 0 });
    if (++r.n > RAFFICA.n) { try { ws.close(4008, 'Troppi messaggi: rallenta.'); } catch {} return; }
    const m = this.master();
    if (!m) { try { ws.close(4004, 'Il master si è scollegato.'); } catch {} return; }
    try { m.send(a.id + '\n' + dati); } catch {}
  }

  /** Il primo messaggio del master: il codice e la firma fatta con la sua chiave. */
  async presentazione(ws, a, dati) {
    let p; try { p = JSON.parse(dati); } catch { p = null; }
    const no = motivo => { try { ws.send(JSON.stringify({ t: 'rifiutato', motivo })); ws.close(4003, motivo); } catch {} };
    if (!p || p.t !== 'master' || !/^[a-f0-9]{64}$/.test(p.codice || '') || !/^[a-f0-9]{128}$/.test(p.firma || '')) return no('Presentazione non valida.');
    if (Math.abs(Date.now() - (+p.ts || 0)) > FIRMA_VALIDA_MS) return no('L\'orologio del computer del master è sbagliato di più di 5 minuti.');
    if (await nomeStanza(p.codice) !== a.stanza) return no('Il codice non è quello di questa stanza.');
    let buona = false;
    try {
      const k = await crypto.subtle.importKey('raw', daHex(p.codice), { name: 'Ed25519' }, false, ['verify']);
      buona = await crypto.subtle.verify({ name: 'Ed25519' }, k, daHex(p.firma), new TextEncoder().encode(`libre-vtt-relay|${VERSIONE}|${a.stanza}|${p.ts}`));
    } catch { buona = false; }
    if (!buona) return no('Firma sbagliata: non sei il master di questa partita.');
    // un master nuovo prende il posto di quello vecchio (lo stesso programma che si è ricollegato)
    for (const vecchio of this.ctx.getWebSockets('master')) if (vecchio !== ws) try { vecchio.close(4002, 'Sostituito da un collegamento nuovo.'); } catch {}
    ws.serializeAttachment({ ...a, ok: true });
    ws.send(JSON.stringify({ t: 'pronto', versione: VERSIONE }));
    // i giocatori rimasti dal master di prima rientrano da capo: il master nuovo non li conosce
    for (const g of this.ctx.getWebSockets()) {
      const x = g.deserializeAttachment() || {};
      if (x.ruolo === 'giocatore') try { g.close(4001, 'Il master si è ricollegato.'); } catch {}
    }
  }

  async webSocketClose(ws, codice) { this.via(ws); try { ws.close(codice === 1005 ? 1000 : codice, 'ciao'); } catch {} }
  async webSocketError(ws) { this.via(ws); }
  via(ws) {
    const a = ws.deserializeAttachment() || {};
    if (a.ruolo === 'master') {
      if (!a.ok || this.master()) return;
      // il master se n'è andato: senza di lui non si gioca
      for (const g of this.ctx.getWebSockets()) {
        const x = g.deserializeAttachment() || {};
        if (x.ruolo === 'giocatore') try { g.close(4004, 'Il master si è scollegato.'); } catch {}
      }
    } else if (a.id) {
      this.raffiche.delete(a.id);
      const m = this.master();
      if (m) try { m.send('-' + a.id); } catch {}
    }
  }
}
