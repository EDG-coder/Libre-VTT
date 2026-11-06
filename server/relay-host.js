// ---------- Il master apre la partita anche ai giocatori del sito (relay) ----------
// I giocatori che giocano dal sito (senza installare niente) non possono usare uffa-link: arrivano dal relay
// (relay/src/index.js, su Cloudflare). Qui il programma del master si collega al relay come «master» della
// stanza del suo codice, firmando con la chiave del codice (così nessun altro può farlo), e ogni giocatore del
// relay diventa un collegamento come quelli di uffa-link, con in più `web: true` (non può mai fare il master).
//
//   const relay = require('./relay-host.js')({ entra, esce })
//   relay.avvia(url, fileChiave)    relay.ferma()    relay.stato()
//
// entra(c) / esce(c): il server di gioco aggiunge e toglie il collegamento c, che ha send(msg), close(),
// ingorgo() e riceve i messaggi con c.onRaw(testo) (lo imposta il server).
'use strict';
const fs = require('fs'), crypto = require('crypto');

const VERSIONE = 'v1';
const nomeStanza = codice => crypto.createHash('sha256').update('libre-vtt-stanza|' + codice).digest('hex');
function chiavePrivata(hex) {
  return crypto.createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(hex, 'hex')]), format: 'der', type: 'pkcs8' });
}
function codiceDa(k) { return Buffer.from(crypto.createPublicKey(k).export({ format: 'jwk' }).x, 'base64url').toString('hex'); }

module.exports = function relayHost({ entra, esce, avvisa }) {
  let url = '', fileChiave = '', ws = null, timer = 0, tentativi = 0, fermo = true;
  let stato = { attivo: false, collegato: false, errore: null, codice: null };
  const giocatori = new Map();                 // id del relay → collegamento
  const dici = () => { try { avvisa && avvisa({ ...stato }); } catch {} };

  function chiudiGiocatori() { for (const c of giocatori.values()) esce(c); giocatori.clear(); }

  function collega() {
    clearTimeout(timer); timer = 0;
    if (fermo) return;
    if (typeof WebSocket !== 'function') { stato.errore = 'Questo Node.js è troppo vecchio per il relay (serve la versione 22).'; dici(); return; }
    let chiave;
    try {
      const hex = fs.readFileSync(fileChiave, 'utf8').trim();
      if (!/^[a-f0-9]{64}$/.test(hex)) throw new Error('chiave non valida');
      chiave = chiavePrivata(hex);
    } catch (e) { stato.errore = 'Manca la chiave del codice della partita: ' + e.message; dici(); return riprova(); }
    const codice = codiceDa(chiave), stanza = nomeStanza(codice);
    stato.codice = codice;
    let w;
    try { w = new WebSocket(url.replace(/\/+$/, '') + '/' + VERSIONE + '/stanza/' + stanza + '?ruolo=master'); } catch (e) { stato.errore = 'Indirizzo del relay non valido.'; dici(); return; }
    ws = w;
    w.onopen = () => {
      const ts = Date.now();
      const firma = crypto.sign(null, Buffer.from(`libre-vtt-relay|${VERSIONE}|${stanza}|${ts}`), chiave).toString('hex');
      w.send(JSON.stringify({ t: 'master', codice, ts, firma }));
    };
    w.onmessage = e => {
      if (ws !== w) return;
      const d = String(e.data);
      if (d[0] === '{') {
        let m; try { m = JSON.parse(d); } catch { return; }
        if (m.t === 'pronto') { tentativi = 0; stato.collegato = true; stato.errore = null; dici(); console.log('Relay: partita aperta anche ai giocatori del sito.'); }
        else if (m.t === 'rifiutato') { stato.errore = String(m.motivo || 'rifiutato').slice(0, 200); dici(); }
        return;
      }
      if (d[0] === '+') {
        const id = d.slice(1, 9);
        const c = {
          kind: 'link', web: true, relayId: id,
          send(msg) { try { if (ws === w && w.readyState === 1) w.send(id + '\n' + JSON.stringify(msg)); } catch {} },
          close() { try { if (ws === w && w.readyState === 1) w.send('x' + id); } catch {} },
          ingorgo: () => w.bufferedAmount || 0
        };
        giocatori.set(id, c);
        entra(c);
        return;
      }
      if (d[0] === '-') { const c = giocatori.get(d.slice(1, 9)); if (c) { giocatori.delete(c.relayId); esce(c); } return; }
      const i = d.indexOf('\n');
      if (i <= 0) return;
      const c = giocatori.get(d.slice(0, i));
      if (c && c.onRaw) c.onRaw(d.slice(i + 1));
    };
    // (il WebSocket di Node, se il collegamento non riesce, dà solo «error» senza «close»: tutti e due finiscono qui)
    const giu = e => {
      if (ws !== w) return;
      ws = null;
      try { w.close(); } catch {}
      chiudiGiocatori();
      const eraSu = stato.collegato;
      stato.collegato = false;
      if (e && e.code === 4003) stato.errore = e.reason || stato.errore || 'Il relay non ti riconosce come master.';
      else if (!stato.errore || eraSu) stato.errore = eraSu ? 'Collegamento col relay caduto: riprovo…' : 'Il relay non risponde: riprovo…';
      dici();
      riprova();
    };
    w.onclose = giu;
    w.onerror = () => giu();
  }
  function riprova() {
    if (fermo) return;
    tentativi++;
    clearTimeout(timer);
    timer = setTimeout(collega, Math.min(60000, 1000 * Math.pow(2, Math.min(tentativi, 6))));
  }

  return {
    avvia(nuovoUrl, nuovoFile) {
      if (!/^wss?:\/\/[^\s]+$/i.test(String(nuovoUrl || ''))) { stato = { attivo: false, collegato: false, errore: 'Indirizzo del relay non valido.', codice: null }; dici(); return false; }
      this.ferma(true);
      url = String(nuovoUrl); fileChiave = nuovoFile; fermo = false; tentativi = 0;
      stato = { attivo: true, collegato: false, errore: null, codice: null, url };
      dici();
      collega();
      return true;
    },
    /** Di nuovo da capo (per esempio con il codice nuovo). */
    ricollega() { if (fermo) return; const w = ws; ws = null; chiudiGiocatori(); try { w && w.close(1000); } catch {} tentativi = 0; collega(); },
    ferma(zitto) {
      fermo = true; clearTimeout(timer); timer = 0;
      const w = ws; ws = null;
      chiudiGiocatori();
      try { w && w.close(1000); } catch {}
      stato = { attivo: false, collegato: false, errore: null, codice: null };
      if (!zitto) dici();
    },
    stato: () => ({ ...stato }),
    nomeStanza
  };
};
module.exports.nomeStanza = nomeStanza;
