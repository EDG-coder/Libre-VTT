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
  const CACHE = 'libre-asset-v1', K_CODICE = 'libre-web-codice', K_ACCOUNT = 'libre-web-account';
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

  // ---------- l'account (codice dal master + password) ----------
  // La password non esce mai da qui così com'è: se ne manda un'impronta (PBKDF2-SHA256 con il codice come sale),
  // che il master ripassa con scrypt e un sale suo. L'impronta resta solo in memoria (NET.account): ricaricando
  // la pagina la password si riscrive.
  const codiceAcc = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const leggibile = k => (k.match(/.{1,4}/g) || []).join('-');
  async function chiaveDa(codice, password) {
    const enc = new TextEncoder();
    const k = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
    return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('libre-vtt-account|' + codice), iterations: 200000 }, k, 256));
  }

  // ---------- la schermata d'ingresso ----------
  const st = document.createElement('style');
  st.textContent = `
  .weBox { position: fixed; inset: 0; z-index: 2147483000; display: grid; place-items: center; padding: 16px;
    background: radial-gradient(circle at 30% 20%, #2a2350, #12151c 60%); color: #e8ecf3; font: 16px/1.5 system-ui, sans-serif;
    padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); }
  .weBox[hidden] { display: none; }
  .weBox form { width: min(440px, 100%); background: #1a1f2b; border: 1px solid #2a3040; border-radius: 14px; padding: 22px; box-shadow: 0 20px 50px rgba(0,0,0,.4); }
  .weBox h1 { margin: 0 0 6px; font-size: 22px; letter-spacing: .04em; }
  .weBox h1 span { color: #9b82ff; }
  .weBox p { margin: 0 0 14px; color: #c3cad8; font-size: 15px; }
  .weBox label { display: block; font-size: 14px; color: #c3cad8; margin: 12px 0 5px; }
  .weBox input { width: 100%; box-sizing: border-box; padding: 11px 12px; border-radius: 8px; border: 1px solid #2a3040; background: #0c0e13; color: #e8ecf3; font: inherit; font-size: 16px; }
  .weBox input:focus { outline: 2px solid #7c5cff; outline-offset: 1px; }
  .weBox button { width: 100%; margin-top: 18px; padding: 12px; border: 0; border-radius: 9px; background: #7c5cff; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
  .weBox button:disabled { opacity: .6; cursor: default; }
  .weBox .err { color: #ff8a80; font-size: 14px; margin: 12px 0 0; min-height: 1em; }
  .weBox .piccolo { font-size: 13px; color: #9aa3b5; margin: 14px 0 0; }
  .weBox a { color: #b9a8ff; }
  .weBox details { margin-top: 14px; border-top: 1px solid #2a3040; padding-top: 10px; }
  .weBox summary { cursor: pointer; color: #b9a8ff; font-size: 15px; }
  .weBox .codice { font: 700 20px/1.3 ui-monospace, Menlo, monospace; letter-spacing: .08em; text-align: center; background: #0c0e13; border: 1px solid #2a3040; border-radius: 8px; padding: 10px; margin: 6px 0 4px; user-select: all; }
  .weBox .due { display: flex; gap: 10px; }
  .weBox .due button { margin-top: 18px; }
  .weBox button.secondo { background: #2a3040; }`;
  document.head.append(st);
  const box = document.createElement('div');
  box.id = 'webEntra'; box.className = 'weBox';
  box.innerHTML = `<form autocomplete="off" novalidate>
    <h1>LIBRE <span>VTT</span></h1>
    <p data-t="Entra nella partita del tuo master: ti serve il codice che ti ha mandato.">Entra nella partita del tuo master: ti serve il codice che ti ha mandato.</p>
    <label for="weCodice" data-t="Codice della partita">Codice della partita</label>
    <input id="weCodice" spellcheck="false" autocapitalize="off" inputmode="text" data-p="Incolla qui il codice (o il link)">
    <label for="weNome" data-t="Il tuo nome">Il tuo nome</label>
    <input id="weNome" maxlength="40" autocomplete="nickname" data-p="Come ti vedranno gli altri">
    <details id="weAcc">
      <summary data-t="Ho un account (codice dal master)">Ho un account (codice dal master)</summary>
      <label for="weAccCodice" data-t="Codice dell'account">Codice dell'account</label>
      <input id="weAccCodice" autocomplete="username" spellcheck="false" autocapitalize="characters" data-p="Per esempio K7QM-2XPA-9RTD">
      <label for="wePass" data-t="Password">Password</label>
      <input id="wePass" type="password" autocomplete="current-password">
      <p class="piccolo" data-t="Con l'account rientri con lo stesso personaggio da qualsiasi browser. La prima volta la password la scegli tu, poi va scritta a ogni ingresso. Il master non la vede: se la dimentichi, può solo bloccare l'account e fartene uno nuovo.">Con l'account rientri con lo stesso personaggio da qualsiasi browser. La prima volta la password la scegli tu, poi va scritta a ogni ingresso. Il master non la vede: se la dimentichi, può solo bloccare l'account e fartene uno nuovo.</p>
    </details>
    <button type="submit" id="weVai" data-t="Entra">Entra</button>
    <p class="err" id="weErr" role="alert"></p>
    <p class="piccolo"><span data-t="Dal sito si gioca solo come giocatore. Per condurre una partita serve l'app.">Dal sito si gioca solo come giocatore. Per condurre una partita serve l'app.</span> <a href="../#scarica" data-t="Scarica l'app">Scarica l'app</a></p>
  </form>`;
  document.body.append(box);
  for (const el of box.querySelectorAll('[data-t]')) el.textContent = tr(el.dataset.t);
  for (const el of box.querySelectorAll('[data-p]')) el.placeholder = tr(el.dataset.p);
  $('weCodice').value = codiceDa(location.hash) || ls.get(K_CODICE);
  $('weNome').value = ls.get('uffa-name');
  $('weAccCodice').value = ls.get(K_ACCOUNT);
  if (ls.get(K_ACCOUNT)) $('weAcc').open = true;
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
    const acc = codiceAcc($('weAccCodice').value), pw = $('wePass').value;
    if (!codice) { errore(tr('Il codice non va bene: è lungo 64 caratteri, fatto di numeri e lettere da a a f.')); $('weCodice').focus(); return; }
    if (acc || pw) {
      $('weAcc').open = true;
      if (acc.length !== 12) { errore(tr('Il codice dell\'account è di 12 caratteri, lettere e numeri (i trattini non contano).')); $('weAccCodice').focus(); return; }
      if (pw.length < 6) { errore(tr('Scrivi la password dell\'account (almeno 6 caratteri).')); $('wePass').focus(); return; }
    } else if (nome.length < 2) { errore(tr('Scrivi un nome di almeno due lettere.')); $('weNome').focus(); return; }
    errore('');
    $('weVai').disabled = true;
    try {
      if (acc) {
        NET.account = { codice: acc, chiave: await chiaveDa(acc, pw) };
        ls.set(K_ACCOUNT, leggibile(acc));
        $('wePass').value = '';
      } else {
        NET.account = null;
        // si era entrati con un account e adesso no: questo browser diventa una persona nuova (il profilo
        // dell'account, dal sito, si prende solo con la password)
        if (ls.get(K_ACCOUNT)) { try { localStorage.removeItem(K_ACCOUNT); localStorage.removeItem('uffa-token'); localStorage.removeItem('uffa-firma'); } catch {} }
      }
      if (nome.length >= 2) ls.set('uffa-name', nome);
      if (await entra(codice)) box.hidden = true;
    } finally { $('weVai').disabled = false; }
  });

  // Il master ti ha dato un account mentre giochi: si sceglie la password da qui (due volte, per non sbagliarla).
  const acBox = document.createElement('div');
  acBox.id = 'webAccount'; acBox.className = 'weBox'; acBox.hidden = true;
  acBox.innerHTML = `<form autocomplete="on" novalidate>
    <h1 data-t="Il tuo account">Il tuo account</h1>
    <p data-t="Il master ti ha dato un account per questa campagna. Con il codice e una password rientri con questo personaggio da qualsiasi browser.">Il master ti ha dato un account per questa campagna. Con il codice e una password rientri con questo personaggio da qualsiasi browser.</p>
    <div class="codice" id="waCodice"></div>
    <input id="waUtente" autocomplete="username" hidden>
    <label for="waPass" data-t="Scegli una password">Scegli una password</label>
    <input id="waPass" type="password" autocomplete="new-password">
    <label for="waPass2" data-t="Scrivila di nuovo">Scrivila di nuovo</label>
    <input id="waPass2" type="password" autocomplete="new-password">
    <div class="due"><button type="button" class="secondo" id="waDopo" data-t="Più tardi">Più tardi</button><button type="submit" id="waVai" data-t="Salva la password">Salva la password</button></div>
    <p class="err" id="waErr" role="alert"></p>
    <p class="piccolo" data-t="Segnati il codice. Il master non vede la password: se la dimentichi, può solo bloccare l'account e fartene uno nuovo.">Segnati il codice. Il master non vede la password: se la dimentichi, può solo bloccare l'account e fartene uno nuovo.</p>
  </form>`;
  document.body.append(acBox);
  for (const el of acBox.querySelectorAll('[data-t]')) el.textContent = tr(el.dataset.t);
  let inAttesa = null;                             // { codice, chiave } mandata, in attesa della conferma
  window.libreWebAccount = m => {
    const acc = codiceAcc(m.codice);
    if (acc.length !== 12) return;
    ls.set(K_ACCOUNT, leggibile(acc));
    $('weAccCodice').value = leggibile(acc);
    if (m.password) {
      if (inAttesa && inAttesa.codice === acc) NET.account = inAttesa;
      inAttesa = null;
      if (!acBox.hidden) { acBox.hidden = true; netSay(tr('Password salvata: d\'ora in poi entri con il codice dell\'account e la password.'), 'live'); }
      return;
    }
    $('waCodice').textContent = leggibile(acc);
    $('waUtente').value = leggibile(acc);
    $('waErr').textContent = '';
    acBox.hidden = false;
  };
  $('waDopo').onclick = () => { acBox.hidden = true; };
  acBox.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault();
    const acc = codiceAcc($('waCodice').textContent), p1 = $('waPass').value, p2 = $('waPass2').value;
    if (p1.length < 6) { $('waErr').textContent = tr('La password deve avere almeno 6 caratteri.'); return; }
    if (p1 !== p2) { $('waErr').textContent = tr('Le due password non sono uguali.'); return; }
    if (!NET.on) { $('waErr').textContent = tr('Non sei collegato: riprova appena torna il collegamento.'); return; }
    $('waVai').disabled = true;
    try {
      inAttesa = { codice: acc, chiave: await chiaveDa(acc, p1) };
      netSend({ t: 'account.password', chiave: inAttesa.chiave });
      $('waPass').value = $('waPass2').value = '';
    } finally { $('waVai').disabled = false; }
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
