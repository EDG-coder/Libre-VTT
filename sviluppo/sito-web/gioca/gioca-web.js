// Solo sul sito (costruisci.mjs lo mette dopo tutti gli altri script del tavolo).
// Dal sito si gioca solo da giocatore, nella partita di un master che ha l'app e ha acceso «Partita pubblica»:
//   - la schermata d'ingresso: il codice della partita (quello che il master manda a tutti) e il nome
//   - il collegamento passa dal relay (relay/src/index.js), nella stanza del codice (vedi NET.relay in net.js)
//   - le immagini arrivano dal master a pezzi dentro il collegamento: qui si rimettono insieme, si controlla
//     l'impronta e si mettono nella cache del browser, da dove le dà sw-asset.js agli indirizzi «asset/<hash>»
(function () {
  if (!window.LIBRE_WEB || typeof NET === 'undefined') return;
  const tr = window.tr || (s => s);
  const $ = id => document.getElementById(id);
  const CACHE = 'libre-asset-v1', K_CODICE = 'libre-web-codice';
  const MIME_OK = /^(image\/(webp|png|jpeg|gif|avif|bmp|svg\+xml)|application\/json)$/;
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  const ls = { get(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  NET.port = 0;                                  // sul sito non c'è nessun programma su questo computer

  // ---------- il service worker delle immagini ----------
  let swPronto = Promise.resolve(false);
  if ('serviceWorker' in navigator) {
    swPronto = navigator.serviceWorker.register('sw-asset.js').then(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise(r => { navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }); setTimeout(r, 3000); });
      return !!navigator.serviceWorker.controller;
    }).catch(() => false);
    navigator.serviceWorker.addEventListener('message', e => {
      if (!e.data || e.data.t !== 'libre-asset' || !e.ports[0]) return;
      prendi(String(e.data.hash || '')).then(ok => e.ports[0].postMessage(ok), () => e.ports[0].postMessage(false));
    });
  }

  // ---------- le immagini chieste al master ----------
  const attese = new Map();                       // hash → { parti, byte, mime, prove, timer, done, promise }
  function prendi(hash) {
    if (!/^[a-f0-9]{64}$/.test(hash)) return Promise.resolve(false);
    let w = attese.get(hash);
    if (w) return w.promise;
    w = { parti: [], byte: 0, mime: '', prove: 0 };
    w.promise = new Promise(res => { w.done = res; });
    attese.set(hash, w);
    chiedi(hash, w);
    return w.promise;
  }
  function chiedi(hash, w) {
    clearTimeout(w.timer);
    if (!NET.on) { w.timer = setTimeout(() => chiedi(hash, w), 2000); return; }   // scollegati: si aspetta il ritorno
    if (++w.prove > 4) { attese.delete(hash); w.done(false); return; }
    netSend({ t: 'intent', op: 'asset.get', hash, da: w.byte });
    w.timer = setTimeout(() => chiedi(hash, w), 30000);
  }
  function fine(hash, w, ok) { clearTimeout(w.timer); attese.delete(hash); w.done(ok); }
  window.libreWebAsset = async m => {
    const w = attese.get(m.hash);
    if (!w) return;
    if (m.t === 'asset.miss') return fine(m.hash, w, false);
    if (typeof m.off === 'number' && m.off !== w.byte) return;              // doppio o fuori posto
    let bin;
    try { bin = Uint8Array.from(atob(String(m.data || '')), c => c.charCodeAt(0)); } catch { return fine(m.hash, w, false); }
    w.parti.push(bin); w.byte += bin.length; w.mime = w.mime || String(m.mime || '').toLowerCase();
    w.prove = 0; clearTimeout(w.timer); w.timer = setTimeout(() => chiedi(m.hash, w), 30000);
    if (w.byte > 12 * 1024 * 1024 || (w.mime && !MIME_OK.test(w.mime))) return fine(m.hash, w, false);
    if (!m.last) return;
    clearTimeout(w.timer);
    const blob = new Blob(w.parti, { type: w.mime });
    try {
      if (hex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())) !== m.hash) return fine(m.hash, w, false);
      const c = await caches.open(CACHE);
      await c.put(new URL('asset/' + m.hash, location.href).href, new Response(blob, { headers: {
        'Content-Type': w.mime || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff',
        // aperta da sola in una scheda, non può eseguire niente
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox"
      } }));
      fine(m.hash, w, true);
    } catch { fine(m.hash, w, false); }
  };

  // ---------- dove sta il relay ----------
  async function indirizzoRelay() {
    const q = new URLSearchParams(location.search).get('relay');
    if (q && (/^wss:\/\/[\w.-]+(:\d+)?(\/[\w./-]*)?$/i.test(q) || /^ws:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/[\w./-]*)?$/i.test(q))) return q.replace(/\/+$/, '');
    try {
      const j = await (await fetch('../relay.json', { cache: 'no-cache' })).json();
      if (j && /^wss:\/\/[\w.-]+(:\d+)?(\/[\w./-]*)?$/i.test(String(j.relay || ''))) return j.relay.replace(/\/+$/, '');
    } catch {}
    return null;
  }
  const stanzaDi = async codice => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('libre-vtt-stanza|' + codice)));
  const codiceDa = testo => { const m = String(testo || '').toLowerCase().match(/[a-f0-9]{64}/); return m ? m[0] : null; };

  // ---------- la schermata d'ingresso ----------
  const st = document.createElement('style');
  st.textContent = `
  #webEntra { position: fixed; inset: 0; z-index: 2147483000; display: grid; place-items: center; padding: 16px;
    background: radial-gradient(circle at 30% 20%, #2a2350, #12151c 60%); color: #e8ecf3; font: 16px/1.5 system-ui, sans-serif;
    padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); }
  #webEntra[hidden] { display: none; }
  #webEntra form { width: min(440px, 100%); background: #1a1f2b; border: 1px solid #2a3040; border-radius: 14px; padding: 22px; box-shadow: 0 20px 50px rgba(0,0,0,.4); }
  #webEntra h1 { margin: 0 0 6px; font-size: 22px; letter-spacing: .04em; }
  #webEntra h1 span { color: #9b82ff; }
  #webEntra p { margin: 0 0 14px; color: #c3cad8; font-size: 15px; }
  #webEntra label { display: block; font-size: 14px; color: #c3cad8; margin: 12px 0 5px; }
  #webEntra input { width: 100%; box-sizing: border-box; padding: 11px 12px; border-radius: 8px; border: 1px solid #2a3040; background: #0c0e13; color: #e8ecf3; font: inherit; font-size: 16px; }
  #webEntra input:focus { outline: 2px solid #7c5cff; outline-offset: 1px; }
  #webEntra button { width: 100%; margin-top: 18px; padding: 12px; border: 0; border-radius: 9px; background: #7c5cff; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
  #webEntra button:disabled { opacity: .6; cursor: default; }
  #webEntra .err { color: #ff8a80; font-size: 14px; margin: 12px 0 0; min-height: 1em; }
  #webEntra .piccolo { font-size: 13px; color: #9aa3b5; margin: 14px 0 0; }
  #webEntra a { color: #b9a8ff; }`;
  document.head.append(st);
  const box = document.createElement('div');
  box.id = 'webEntra';
  box.innerHTML = `<form autocomplete="off" novalidate>
    <h1>LIBRE <span>VTT</span></h1>
    <p data-t="Entra nella partita del tuo master: ti serve il codice che ti ha mandato.">Entra nella partita del tuo master: ti serve il codice che ti ha mandato.</p>
    <label for="weCodice" data-t="Codice della partita">Codice della partita</label>
    <input id="weCodice" spellcheck="false" autocapitalize="off" inputmode="text" data-p="Incolla qui il codice (o il link)">
    <label for="weNome" data-t="Il tuo nome">Il tuo nome</label>
    <input id="weNome" maxlength="40" autocomplete="nickname" data-p="Come ti vedranno gli altri">
    <button type="submit" id="weVai" data-t="Entra">Entra</button>
    <p class="err" id="weErr" role="alert"></p>
    <p class="piccolo"><span data-t="Dal sito si gioca solo come giocatore. Per condurre una partita serve l'app.">Dal sito si gioca solo come giocatore. Per condurre una partita serve l'app.</span> <a href="../#scarica" data-t="Scarica l'app">Scarica l'app</a></p>
  </form>`;
  document.body.append(box);
  for (const el of box.querySelectorAll('[data-t]')) el.textContent = tr(el.dataset.t);
  for (const el of box.querySelectorAll('[data-p]')) el.placeholder = tr(el.dataset.p);
  $('weCodice').value = codiceDa(location.hash) || ls.get(K_CODICE);
  $('weNome').value = ls.get('uffa-name');
  const errore = t => { $('weErr').textContent = t || ''; };
  // le finestre del tavolo (per esempio il benvenuto) stanno sopra a tutto: finché si è qui, restano chiuse
  const chiudiDialoghi = () => { if (!box.hidden) document.querySelectorAll('dialog[open]').forEach(d => { try { d.close(); } catch {} }); };
  new MutationObserver(chiudiDialoghi).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
  chiudiDialoghi();
  let entrato = false;

  async function entra(codice) {
    const relay = await indirizzoRelay();
    if (!relay) { errore(tr('Questo sito non ha ancora un relay: per ora si gioca solo con l\'app.')); return false; }
    if (!(await swPronto)) errore(tr('Questo browser non lascia arrivare le immagini della partita: prova con un altro (Chrome, Edge, Firefox o Safari aggiornati).'));
    NET.relay = relay + '/v1/stanza/' + await stanzaDi(codice);
    ls.set(K_CODICE, codice);
    entrato = true;
    netReconnectNow();
    return true;
  }
  box.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault();
    const codice = codiceDa($('weCodice').value), nome = $('weNome').value.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!codice) { errore(tr('Il codice non va bene: è lungo 64 caratteri, fatto di numeri e lettere da a a f.')); $('weCodice').focus(); return; }
    if (nome.length < 2) { errore(tr('Scrivi un nome di almeno due lettere.')); $('weNome').focus(); return; }
    errore('');
    ls.set('uffa-name', nome);
    $('weVai').disabled = true;
    try { if (await entra(codice)) box.hidden = true; } finally { $('weVai').disabled = false; }
  });

  // Il master ha cambiato codice: si passa alla stanza nuova (il codice vecchio non vale più).
  window.libreWebNuovoCodice = async codice => {
    ls.set(K_CODICE, codice);
    netSay(tr('Il master ha cambiato il codice: passo a quello nuovo…'), 'retry');
    NET.relay = NET.relay.replace(/[a-f0-9]{64}$/, await stanzaDi(codice));
    setTimeout(netReconnectNow, 3000);
  };

  // Scollegati a mano o allontanati: si torna alla schermata d'ingresso.
  setInterval(() => {
    if (!box.hidden || !entrato || NET.on || !(NET.manual || NET.stopped)) return;
    entrato = false;
    errore(netBar && !netBar.hidden ? netBar.querySelector('.nbTxt').textContent : '');
    box.hidden = false;
  }, 1000);
})();
