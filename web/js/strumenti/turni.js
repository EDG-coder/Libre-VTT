// Ordine dei turni (iniziativa). Lo tiene chi conduce; i giocatori lo vedono e, quando tirano
// «Iniziativa» dalla loro scheda, il risultato finisce da solo nella loro riga (anche se tirano prima
// che il master accenda i turni). Una barra in alto mostra a tutti di chi è il turno.
//   settings.turni = { on, round, cur, desde, righe: [{ id, nome, ini, des, sheet, pid }] }
// cur = indice (nell'ordine) di chi sta giocando; desde = da quando si raccolgono i tiri.
(function () {
  const tr = window.tr || (s => s);
  const $ = id => document.getElementById(id);
  const conduco = () => typeof isMaster !== 'function' || isMaster();
  const nuovo = () => ({ on: false, round: 1, cur: 0, desde: 0, iniziato: false, righe: [] });
  let T = nuovo();                                   // quello che si vede (per i giocatori arriva dal server)
  const stato = () => conduco() ? (settings.turni || (settings.turni = nuovo())) : T;
  const idRiga = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const numero = v => v === '' || v == null || !Number.isFinite(+v) ? null : Math.round(+v);

  // modificatore di Destrezza dalla scheda collegata (per lo spareggio)
  function desDi(r) {
    const s = r.sheet && typeof sheets !== 'undefined' && sheets.find(x => x.id === r.sheet);
    const v = s && s.f && parseInt(s.f.dex, 10);
    return Number.isFinite(v) ? Math.floor((v - 10) / 2) : (Number.isFinite(r.des) ? r.des : 0);
  }
  // dall'iniziativa più alta alla più bassa; a parità decide la Destrezza (se la regola è accesa)
  function ordina(st) {
    const chi = st.righe[st.cur] && st.righe[st.cur].id;
    const spareggio = settings.spareggioDes !== false;
    st.righe.forEach((r, i) => { r._i = i; r.des = desDi(r); });
    st.righe.sort((a, b) => {
      const ia = a.ini == null ? -Infinity : a.ini, ib = b.ini == null ? -Infinity : b.ini;
      if (ib !== ia) return ib - ia;
      if (spareggio && b.des !== a.des) return b.des - a.des;
      return a._i - b._i;
    });
    st.righe.forEach(r => delete r._i);
    const k = st.righe.findIndex(r => r.id === chi);
    st.cur = st.iniziato && k >= 0 ? k : 0;            // prima del primo «Avanti» tocca a chi ha l'iniziativa più alta
  }
  function salva() { ordina(stato()); disegna(); scheduleBoardSave(); }

  function aggiungi(el) {
    const st = stato();
    const pid = el.dataset.pid || (el.dataset.pid = (typeof uid === 'function' ? uid() : idRiga()));
    if (st.righe.some(r => r.pid === pid)) return false;
    // lo stesso personaggio (stessa scheda) già in fila col segnalino di un'altra scena, o senza segnalino (il suo
    // tiro d'iniziativa è arrivato prima): resta una riga sola, che ora segue questo segnalino. Prima diventavano
    // due righe uguali («Tocca a: Ari · Poi: Ari»). Due segnalini nella stessa scena restano due righe (i mostri).
    const gia = el.dataset.sheet && st.righe.find(r => r.sheet === el.dataset.sheet);
    if (gia && !(gia.pid && world.querySelector(`.photo[data-pid="${CSS.escape(gia.pid)}"]`))) { gia.pid = pid; return false; }
    const s = el.dataset.sheet && sheets.find(x => x.id === el.dataset.sheet);
    st.righe.push({ id: idRiga(), nome: (s && s.name) || el.dataset.name || tr('Segnalino'), ini: null, sheet: el.dataset.sheet || undefined, pid });
    return true;
  }
  function segnaliniScena() {
    let n = 0;
    for (const el of world.querySelectorAll('.photo')) {
      if (el._shape || (el.dataset.layer || 'tokens') !== 'tokens') continue;
      if (!el.dataset.sheet && !el.dataset.name) continue;      // solo quelli che hanno un nome
      if (aggiungi(el)) n++;
    }
    return n;
  }
  function avanti(passo) {
    const st = stato(); if (!st.righe.length) return;
    st.iniziato = true;
    st.cur += passo;
    if (st.cur >= st.righe.length) { st.cur = 0; st.round++; }
    if (st.cur < 0) { if (st.round > 1) { st.round--; st.cur = st.righe.length - 1; } else st.cur = 0; }
    disegna(); scheduleBoardSave();
  }

  // ---------- il segnalino collegato: cerchio giallo ----------
  let timerEvid = 0;
  function segnalinoDi(r) {
    if (!r) return null;
    const tutti = [...world.querySelectorAll('.photo')];
    return tutti.find(e => r.pid && e.dataset.pid === r.pid) || tutti.find(e => r.sheet && e.dataset.sheet === r.sheet) || null;
  }
  function evidenzia(r, ms) {
    clearTimeout(timerEvid);
    world.querySelectorAll('.photo.turnoEvid').forEach(e => e.classList.remove('turnoEvid'));
    const el = segnalinoDi(r);
    if (el) el.classList.add('turnoEvid');
    if (ms) timerEvid = setTimeout(() => evidenzia(null), ms);
  }

  // ---------- il pannello ----------
  const box = mk('div', 'tool glass',
    `<button class="tgrip" type="button" aria-label="Ordine dei turni" title="Ordine dei turni">${ICON('<path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M9.5 17.5L21 6V3h-3L6.5 14.5M11 19l-6-6M8 16l-4 4M5 21l-2-2"/>')}</button>
     <div class="tbody" inert>
       <div class="trow turniTesta"><b id="turniRound"></b><span class="sp"></span><label class="soloMaster"><input id="turniOn" type="checkbox"> Attivo</label></div>
       <div class="turniLista"><table id="turniTab"><tbody></tbody></table></div>
       <p class="tnote" id="turniVuoto">Nessuno in fila. Aggiungi i segnalini della scena, oppure clic destro su un segnalino → «Aggiungi ai turni».</p>
       <div class="trow soloMaster"><button id="turniPrec" type="button" title="Turno precedente">◀</button><button id="turniAvanti" type="button" class="primo">Avanti ▶</button></div>
       <div class="trow soloMaster"><button id="turniAgg" type="button">＋ Segnalini della scena</button><button id="turniSvuota" type="button">Svuota</button></div>
       <label class="trow soloMaster" id="turniMovRiga" title="Senza la spunta i giocatori muovono i segnalini quanto vogliono (i muri contano lo stesso)"><input id="turniMov" type="checkbox"><span>Conta il movimento in questa mappa (Velocità della scheda)</span></label>
       <p class="tnote">Quando un giocatore tira «Iniziativa» dalla sua scheda, il risultato arriva qui da solo.</p>
     </div>`);
  box.id = 'turniBox';
  document.body.appendChild(box);

  // ---------- la barra in alto: «Round 2 · Tocca a: Ari · Poi: Goblin» ----------
  // Fuori dal menu degli strumenti: il pannello sta dentro un contenitore che, chiuso o nascosto (telefono
  // con chat o schede aperte), lo porta fuori dallo schermo. La barra si vede a tutti finché i turni sono
  // attivi; un tocco la apre con l'ordine completo.
  const barra = document.createElement('div');
  barra.id = 'turniBarra'; barra.hidden = true; barra.setAttribute('role', 'status');
  barra.innerHTML = '<button type="button" class="tbTesta" aria-expanded="false"></button><ol class="tbLista" hidden></ol>';
  document.body.appendChild(barra);
  const tbTesta = barra.querySelector('.tbTesta'), tbLista = barra.querySelector('.tbLista');
  const apriLista = ap => { tbLista.hidden = !ap; tbTesta.setAttribute('aria-expanded', ap); };
  tbTesta.addEventListener('click', () => apriLista(tbLista.hidden));
  // l'elenco aperto si chiude toccando fuori dalla barra (prima restava aperto sopra la mappa)
  addEventListener('pointerdown', e => { if (!tbLista.hidden && !barra.contains(e.target)) apriLista(false); }, true);
  // l'avviso del collegamento («Collegato», «Scatto tolto»…) sta anche lui in alto al centro: la barra scende
  // sotto di lui invece di finirci sotto
  function sottoAvviso() {
    const nb = document.getElementById('netBar');
    const r = nb && !nb.hidden && nb.getBoundingClientRect();
    barra.style.top = r && r.height ? Math.round(r.bottom + 6) + 'px' : '';
  }
  const nbEl = document.getElementById('netBar');
  if (nbEl) {
    new MutationObserver(sottoAvviso).observe(nbEl, { attributes: true, attributeFilter: ['hidden', 'class'], childList: true, subtree: true, characterData: true });
    addEventListener('resize', sottoAvviso);
  }
  function disegnaBarra(st) {
    const on = !!st.on && st.righe.length > 0;
    barra.hidden = !on;
    if (!on) return;
    const ora = st.righe[st.cur] || st.righe[0], poi = st.righe.length > 1 ? st.righe[(st.cur + 1) % st.righe.length] : null;
    tbTesta.replaceChildren();
    const pezzo = (t, cl) => { const e = document.createElement('span'); e.textContent = t; if (cl) e.className = cl; e.setAttribute('data-noi18n', ''); tbTesta.append(e); };
    pezzo(tr('Round {n}', { n: st.round || 1 }), 'tbRound');
    pezzo(tr('Tocca a: {n}', { n: ora.nome }), 'tbOra');
    if (poi) pezzo(tr('Poi: {n}', { n: poi.nome }), 'tbPoi');
    tbLista.replaceChildren(...st.righe.map((r, i) => {
      const li = document.createElement('li'); li.setAttribute('data-noi18n', '');
      li.textContent = r.nome + (r.ini == null ? '' : ' · ' + r.ini);
      if (i === st.cur) li.className = 'ora';
      li.addEventListener('mouseenter', () => evidenzia(r)); li.addEventListener('mouseleave', () => evidenzia(null));
      return li;
    }));
  }

  function disegna() {
    const st = stato(), master = conduco();
    disegnaBarra(st);
    box.classList.toggle('daGiocatore', !master);
    $('turniRound').textContent = tr('Round {n}', { n: st.round || 1 });
    $('turniOn').checked = !!st.on;
    box.classList.toggle('toolOn', !!st.on);
    $('turniVuoto').hidden = st.righe.length > 0;
    const tb = $('turniTab').tBodies[0];
    tb.replaceChildren(...st.righe.map((r, i) => {
      const riga = document.createElement('tr');
      riga.dataset.id = r.id;
      if (st.on && i === st.cur) { riga.className = 'ora'; riga.setAttribute('aria-current', 'true'); }
      const n = document.createElement('td'); n.className = 'tnNome'; n.textContent = r.nome; n.setAttribute('data-noi18n', '');
      const v = document.createElement('td'); v.className = 'tnIni';
      if (master) {
        const inp = document.createElement('input');
        inp.type = 'text'; inp.inputMode = 'numeric'; inp.value = r.ini == null ? '' : r.ini; inp.setAttribute('aria-label', tr('Iniziativa'));
        inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); });
        inp.addEventListener('change', () => { r.ini = numero(inp.value.replace(',', '.')); salva(); });
        v.append(inp);
      } else v.textContent = r.ini == null ? '—' : r.ini;
      const x = document.createElement('td'); x.className = 'tnX';
      if (master) {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = '✕'; b.title = tr('Togli dai turni'); b.setAttribute('aria-label', tr('Togli dai turni'));
        b.onclick = () => { const k = st.righe.indexOf(r); st.righe.splice(k, 1); if (k < st.cur) st.cur--; if (st.cur >= st.righe.length) st.cur = 0; disegna(); scheduleBoardSave(); };
        x.append(b);
      }
      riga.append(n, v, x);
      riga.addEventListener('mouseenter', () => evidenzia(r));
      riga.addEventListener('mouseleave', () => evidenzia(null));
      riga.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') evidenzia(r, 2000); });
      return riga;
    }));
    // la riga di chi gioca resta in vista nell'elenco. Solo l'elenco scorre: scrollIntoView spostava anche il
    // pannello (da chiuso l'icona finiva fuori dal suo cerchio e il pulsante «spariva») e la pagina sul telefono
    const ora = tb.querySelector('tr.ora'), lista = box.querySelector('.turniLista');
    if (ora && lista && box.classList.contains('open')) {
      const a = ora.offsetTop - lista.offsetTop, b = a + ora.offsetHeight;
      if (a < lista.scrollTop) lista.scrollTop = a; else if (b > lista.scrollTop + lista.clientHeight) lista.scrollTop = b - lista.clientHeight;
    }
    if (!box.classList.contains('open')) box.scrollTop = 0;
    disegnaMovimento();
    if (box.classList.contains('open') && typeof misuraPannello === 'function') misuraPannello(box);
  }
  // ---------- conteggio del movimento nella scena di adesso (lo stesso interruttore di Visibilità › Muri) ----------
  // Nelle mappe di battaglia il server ferma i segnalini dei giocatori alla Velocità della scheda; qui il master
  // lo spegne per la mappa aperta (per esempio in una mappa di guerra, dove si muovono eserciti e non persone).
  function disegnaMovimento() {
    const inp = $('turniMov'), riga = $('turniMovRiga');
    if (!inp || typeof luceVelocita !== 'function') { if (riga) riga.hidden = true; return; }
    const cin = typeof cur !== 'undefined' && cur && cur.type === 'cinematic';
    riga.hidden = !!cin;                                // nelle scene cinematiche non si conta mai
    inp.checked = luceVelocita();
  }
  $('turniMov').addEventListener('input', e => { if (typeof luceVelocita === 'function') luceVelocita(e.target.checked); disegnaMovimento(); });
  if (typeof showScene === 'function') {
    const prima = showScene;
    showScene = function () {                                       // eslint-disable-line no-global-assign
      const r = prima.apply(this, arguments);
      Promise.resolve(r).then(disegnaMovimento, () => {});
      return r;
    };
  }

  window.turniDisegna = () => { if (conduco()) ordina(stato()); disegna(); };

  $('turniOn').addEventListener('input', e => {
    const st = stato(); st.on = e.target.checked;
    if (st.on) { st.desde = Date.now(); if (!st.round) st.round = 1; if (st.round === 1 && !st.iniziato) st.cur = 0; mettiInAttesa(); }
    disegna(); scheduleBoardSave();
  });
  $('turniAvanti').addEventListener('click', () => avanti(1));
  $('turniPrec').addEventListener('click', () => avanti(-1));
  $('turniAgg').addEventListener('click', () => { segnaliniScena(); salva(); });
  $('turniSvuota').addEventListener('click', () => {
    if (!confirm('Svuotare l\'ordine dei turni?')) return;
    const st = stato(); st.righe = []; st.cur = 0; st.round = 1; st.iniziato = false; disegna(); scheduleBoardSave();
  });
  box.querySelector('.tgrip').addEventListener('click', () => { toggleOpen(box, !box.classList.contains('open')); disegna(); });
  const strumento = registerTool('turni', box, box.querySelector('.tgrip'), 'Ordine dei turni');
  if (slotsEl.children[1]) slotsEl.insertBefore(strumento.slot, slotsEl.children[1]);   // subito sotto i dadi: si apre in alto

  // ---------- i tiri di iniziativa arrivano da soli ----------
  const visti = new Set();
  const prevAdd = addChat;
  window.addChat = function (m) {
    const r = prevAdd(m);
    try { iniziativaDaChat(m); } catch {}
    return r;
  };
  // «Ari · Iniziativa», «Ari · Initiative» (gioco in inglese), anche con «(vantaggio)» o altro dopo
  const RE_INI = /^(.*?)\s+·\s+(?:iniziativa|initiative)(?:\s*[(·:].*)?$/i;
  // i tiri arrivati prima che il master accenda i turni: si tengono 15 minuti e si mettono in fila dopo
  const ATTESA_MS = 15 * 60 * 1000;
  let inAttesa = [];
  function mettiInAttesa() {
    const ora = Date.now(), tieni = inAttesa.filter(x => ora - x.t < ATTESA_MS);
    inAttesa = [];
    for (const x of tieni) segna(x.nome, x.tot);
    if (tieni.length) ordina(stato());
  }
  function iniziativaDaChat(m) {
    if (!m || m.kind !== 'roll' || m.hidden || !conduco()) return;
    const st = stato();
    if (!Number.isFinite(+m.total)) return;
    const k = RE_INI.exec(String(m.label || '').trim());
    if (!k) return;
    const chiave = m.id || (m.label + m.total + (m.ts || ''));
    if (visti.has(chiave)) return; visti.add(chiave);
    const nome = k[1].trim();
    if (!nome) return;
    if (!st.on) {                                   // i turni non sono ancora accesi: lo teniamo da parte
      inAttesa = inAttesa.filter(x => x.nome !== nome && Date.now() - x.t < ATTESA_MS);
      inAttesa.push({ nome, tot: Math.round(+m.total), t: Date.now() });
      return;
    }
    segna(nome, Math.round(+m.total));
    salva();
  }
  function segna(nome, tot) {
    const st = stato();
    const s = typeof sheets !== 'undefined' && sheets.find(x => x.name === nome);
    let r = st.righe.find(x => s && x.sheet === s.id) || st.righe.find(x => x.nome === nome);
    if (!r) {                                       // non c'era: lo si mette in fila
      const el = s && [...world.querySelectorAll('.photo')].find(e => e.dataset.sheet === s.id);
      r = { id: idRiga(), nome, ini: null, sheet: s ? s.id : undefined, pid: el ? el.dataset.pid : undefined };
      st.righe.push(r);
    }
    r.ini = tot;
  }

  // ---------- menu del segnalino ----------
  window.turniVoceMenu = function (group) {
    if (!conduco()) return [];
    const st = stato(), segn = group.filter(e => !e._shape);
    if (!segn.length) return [];
    const dentro = segn.every(e => st.righe.some(r => r.pid && r.pid === e.dataset.pid));
    return dentro
      ? [{ label: '⚔ Togli dai turni', fn: () => { st.righe = st.righe.filter(r => !segn.some(e => e.dataset.pid === r.pid)); st.cur = Math.min(st.cur, Math.max(0, st.righe.length - 1)); disegna(); scheduleBoardSave(); } }]
      : [{ label: '⚔ Aggiungi ai turni', fn: () => { segn.forEach(aggiungi); salva(); } }];
  };

  // ---------- dal server (giocatori) e dal salvataggio ----------
  let eraAcceso = null;
  window.turniDaMondo = function (t) {
    T = t && Array.isArray(t.righe) ? t : nuovo();
    // quando il master avvia i turni, il pannello si apre da solo anche ai giocatori (solo lettura); se poi
    // lo chiudono, l'icona col puntino resta accesa e lo riaprono quando vogliono
    // (sul telefono il menu degli strumenti può essere chiuso o nascosto: lì si vede la barra in alto)
    if (eraAcceso !== true && T.on && !box.classList.contains('open') && !document.documentElement.classList.contains('ui-tel')) { toggleOpen(box, true); }
    eraAcceso = !!T.on;
    disegna();
  };
  window.turniDaSalvataggio = function (t) {
    if (!t || !Array.isArray(t.righe)) return;
    settings.turni = { ...nuovo(), ...t, righe: t.righe.filter(r => r && r.id).map(r => ({ id: String(r.id), nome: String(r.nome || '').slice(0, 60), ini: numero(r.ini), sheet: r.sheet || undefined, pid: r.pid || undefined, des: r.des })) };
    disegna();
  };
  disegna();
})();
