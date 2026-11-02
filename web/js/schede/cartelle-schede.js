// ---------- Cartelle delle schede ----------
// Raggruppano le schede nella scheda «Schede» del menu laterale: cartelle dentro cartelle (fino a 5
// livelli), da aprire e chiudere, rinominare, spostare (anche trascinando) ed eliminare.
//
// Dove stanno: { cartelle: [{ id, nome, padre, chiusa }], dove: { idScheda: idCartella } }.
//  - chi conduce, o chi gioca da solo: in settings.cartelleSchede, salvate con la campagna;
//  - un giocatore in rete: le sue, solo su questo dispositivo (le schede che vede sono del master).
// Le schede stesse non cambiano: una campagna aperta con una versione vecchia le mostra in fila come
// prima, e chi non crea cartelle vede l'elenco di sempre. Eliminare una cartella non cancella le
// schede: tornano nella cartella di sopra.
const MAX_LIVELLI_SCHEDE = 5;
const csLocale = () => typeof isMaster === 'function' && !isMaster();
const csChiaveLocale = () => 'libre-cartelle-schede:' + ((typeof NET !== 'undefined' && NET.me && NET.me.token) || 'ospite');
const csPulite = new WeakSet();
let csGiocatore = null, csGiocatoreChiave = '';

function csPulisci(v) {
  const out = { cartelle: [], dove: {} };
  if (!v || typeof v !== 'object') return out;
  const ids = new Set();
  for (const c of Array.isArray(v.cartelle) ? v.cartelle.slice(0, 300) : []) {
    if (!c || typeof c.id !== 'string' || !c.id || ids.has(c.id)) continue;
    ids.add(c.id);
    out.cartelle.push({ id: c.id.slice(0, 60), nome: String(c.nome || 'Cartella').slice(0, 40), padre: typeof c.padre === 'string' ? c.padre : null, chiusa: !!c.chiusa });
  }
  for (const c of out.cartelle) if (c.padre && (!ids.has(c.padre) || c.padre === c.id)) c.padre = null;
  // un giro (A dentro B dentro A), da un file rovinato: si spezza mettendo la cartella in cima
  for (const c of out.cartelle) {
    const visti = new Set([c.id]);
    for (let x = out.cartelle.find(y => y.id === c.padre); x; x = out.cartelle.find(y => y.id === x.padre)) {
      if (visti.has(x.id)) { c.padre = null; break; }
      visti.add(x.id);
    }
  }
  if (v.dove && typeof v.dove === 'object') for (const [k, d] of Object.entries(v.dove)) if (typeof d === 'string' && ids.has(d)) out.dove[k] = d;
  csPulite.add(out);
  return out;
}
function cartelleSchede() {
  if (csLocale()) {
    const k = csChiaveLocale();
    if (csGiocatoreChiave !== k || !csGiocatore) {
      let v = null;
      try { v = JSON.parse(localStorage.getItem(k) || 'null'); } catch {}
      csGiocatore = csPulisci(v); csGiocatoreChiave = k;
    }
    return csGiocatore;
  }
  if (!csPulite.has(settings.cartelleSchede)) settings.cartelleSchede = csPulisci(settings.cartelleSchede);
  return settings.cartelleSchede;
}
function salvaCartelleSchede() {
  if (csLocale()) { try { localStorage.setItem(csGiocatoreChiave, JSON.stringify(csGiocatore)); } catch {} }
  else scheduleBoardSave();
}
const cartellaScheda = id => (id && cartelleSchede().cartelle.find(c => c.id === id)) || null;
const cartellaDellaScheda = id => { const d = cartelleSchede().dove[id]; return cartellaScheda(d) ? d : null; };
function livelloCartellaScheda(c) { let n = 0; for (let x = c; x && n < 20; x = cartellaScheda(x.padre)) n++; return n; }
const figlieCartella = padre => cartelleSchede().cartelle.filter(c => (cartellaScheda(c.padre) ? c.padre : null) === (padre || null));
/** id della cartella e di tutte quelle dentro. */
function discendentiCartella(id) {
  const out = new Set([id]);
  for (let cresciuto = true; cresciuto;) {
    cresciuto = false;
    for (const c of cartelleSchede().cartelle) if (c.padre && out.has(c.padre) && !out.has(c.id)) { out.add(c.id); cresciuto = true; }
  }
  return out;
}

/** Le righe dell'elenco: cartelle (col contenuto, se aperte) e schede, rientrate per livello. */
function alberoSchede(viste, rigaScheda) {
  const st = cartelleSchede();
  if (!st.cartelle.length) return viste.map(rigaScheda);
  const out = [], perCartella = new Map();
  for (const s of viste) {
    const d = cartellaDellaScheda(s.id);
    if (!perCartella.has(d)) perCartella.set(d, []);
    perCartella.get(d).push(s);
  }
  const quante = id => [...discendentiCartella(id)].reduce((n, x) => n + (perCartella.get(x) || []).length, 0);
  const giu = (padre, livello) => {
    for (const c of figlieCartella(padre)) {
      out.push(rigaCartellaScheda(c, livello, quante(c.id)));
      if (!c.chiusa) giu(c.id, livello + 1);
    }
    for (const s of perCartella.get(padre) || []) {
      const r = rigaScheda(s);
      if (livello) r.style.marginLeft = livello * 16 + 'px';
      out.push(r);
    }
  };
  giu(null, 0);
  return out;
}
function rigaCartellaScheda(c, livello, n) {
  const row = document.createElement('div');
  row.className = 'sheetFolder' + (c.chiusa ? ' chiusa' : ''); row.dataset.cartella = c.id;
  if (livello) row.style.marginLeft = livello * 16 + 'px';
  const apri = document.createElement('button');
  apri.type = 'button'; apri.className = 'pick'; apri.setAttribute('aria-expanded', String(!c.chiusa));
  apri.title = c.chiusa ? 'Apri la cartella' : 'Chiudi la cartella';
  const fr = document.createElement('span'), nm = document.createElement('span'), qt = document.createElement('small');
  fr.className = 'fr'; fr.textContent = (c.chiusa ? '▸' : '▾') + ' 📁';
  nm.className = 'nm'; nm.textContent = c.nome; nm.dataset.noi18n = '';
  qt.textContent = n;
  apri.append(fr, nm, qt);
  apri.addEventListener('click', () => { c.chiusa = !c.chiusa; renderSheetList(); salvaCartelleSchede(); });
  const altro = (txt, tit, fn) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mini'; b.textContent = txt; b.title = tit; b.setAttribute('aria-label', tit);
    b.addEventListener('click', fn); return b;
  };
  row.append(apri,
    altro('✎', 'Rinomina la cartella', () => rinominaCartellaScheda(c)),
    ...(livelloCartellaScheda(c) < MAX_LIVELLI_SCHEDE ? [altro('＋', 'Nuova cartella dentro', () => nuovaCartellaScheda(c.id))] : []),
    altro('🗑', 'Elimina la cartella', () => eliminaCartellaScheda(c)));
  // qui sopra si lascia cadere una scheda o un'altra cartella
  row.addEventListener('dragover', e => {
    if (!csTrascinabile(e)) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'; row.classList.add('sopra');
  });
  row.addEventListener('dragleave', () => row.classList.remove('sopra'));
  row.addEventListener('drop', e => { if (!csTrascinabile(e)) return; e.preventDefault(); e.stopPropagation(); row.classList.remove('sopra'); csLasciaCadere(e, c.id); });
  row.draggable = true;
  row.addEventListener('dragstart', e => { e.dataTransfer.setData('application/x-cartella-scheda', c.id); e.dataTransfer.effectAllowed = 'move'; });
  return row;
}
const csTrascinabile = e => e.dataTransfer.types.includes('application/x-sheet') || e.dataTransfer.types.includes('application/x-cartella-scheda');
function csLasciaCadere(e, dove) {
  const idS = e.dataTransfer.getData('application/x-sheet'), idC = e.dataTransfer.getData('application/x-cartella-scheda');
  if (idS) spostaScheda(idS, dove);
  else if (idC) spostaCartellaScheda(cartellaScheda(idC), dove);
}

// ---------- Le operazioni ----------
function spostaScheda(id, dove) {
  const st = cartelleSchede();
  dove = cartellaScheda(dove) ? dove : null;
  if (cartellaDellaScheda(id) === dove) return;
  if (dove) st.dove[id] = dove; else delete st.dove[id];
  const c = cartellaScheda(dove); if (c) c.chiusa = false;
  renderSheetList(); salvaCartelleSchede();
}
function spostaCartellaScheda(c, dove) {
  if (!c) return;
  dove = cartellaScheda(dove) ? dove : null;
  if (dove && discendentiCartella(c.id).has(dove)) return;                  // non dentro sé stessa
  if ((cartellaScheda(c.padre) ? c.padre : null) === dove) return;
  // tutta la cartella (con quelle dentro) deve restare entro i livelli
  const prof = id => 1 + Math.max(0, ...figlieCartella(id).map(x => prof(x.id)));
  if ((dove ? livelloCartellaScheda(cartellaScheda(dove)) : 0) + prof(c.id) > MAX_LIVELLI_SCHEDE) {
    return setStatus(tr('Al massimo {n} livelli di cartelle.', { n: MAX_LIVELLI_SCHEDE }));
  }
  c.padre = dove; const p = cartellaScheda(dove); if (p) p.chiusa = false;
  renderSheetList(); salvaCartelleSchede();
}
function nuovaCartellaScheda(padre = null, conScheda) {
  const st = cartelleSchede();
  if (padre && livelloCartellaScheda(cartellaScheda(padre)) >= MAX_LIVELLI_SCHEDE) return setStatus(tr('Al massimo {n} livelli di cartelle.', { n: MAX_LIVELLI_SCHEDE }));
  const n = prompt(tr('Nome della nuova cartella'), tr('Cartella') + ' ' + (st.cartelle.length + 1));
  if (!n || !n.trim()) return null;
  const c = { id: uid(), nome: n.trim().slice(0, 40), padre: cartellaScheda(padre) ? padre : null, chiusa: false };
  st.cartelle.push(c);
  const p = cartellaScheda(padre); if (p) p.chiusa = false;
  if (conScheda) st.dove[conScheda] = c.id;
  renderSheetList(); salvaCartelleSchede();
  return c;
}
function rinominaCartellaScheda(c) {
  const v = prompt(tr('Nuovo nome della cartella'), c.nome);
  if (!v || !v.trim()) return;
  c.nome = v.trim().slice(0, 40); renderSheetList(); salvaCartelleSchede();
}
function eliminaCartellaScheda(c) {
  if (!confirm(tr('Eliminare la cartella «{nome}»? Le schede restano: tornano fuori.', { nome: c.nome }))) return;
  const st = cartelleSchede(), su = cartellaScheda(c.padre) ? c.padre : null;
  for (const [k, d] of Object.entries(st.dove)) if (d === c.id) { if (su) st.dove[k] = su; else delete st.dove[k]; }
  for (const x of st.cartelle) if (x.padre === c.id) x.padre = su;
  st.cartelle = st.cartelle.filter(x => x !== c);
  renderSheetList(); salvaCartelleSchede();
}
/** Le cartelle come voci di menu (rientrate), per «Sposta in». esclusi = id da non offrire. */
function vociCartelleSchede(fn, attuale, esclusi = new Set()) {
  const voci = [{ label: (attuale === null ? '✓ ' : '') + tr('(fuori dalle cartelle)'), fn: () => fn(null) }];
  const giu = (padre, liv) => {
    for (const c of figlieCartella(padre)) {
      if (esclusi.has(c.id)) continue;
      voci.push({ label: (c.id === attuale ? '✓ ' : '') + ' '.repeat(liv) + '📁 ' + c.nome, fn: () => fn(c.id) });
      giu(c.id, liv + 1);
    }
  };
  giu(null, 0);
  return voci;
}
/** Le voci per il menu di una scheda. */
function menuCartellaPerScheda(id) {
  const ora = cartellaDellaScheda(id);
  const voci = cartelleSchede().cartelle.length ? vociCartelleSchede(d => spostaScheda(id, d), ora) : [];
  voci.push('-', { label: tr('＋ Nuova cartella…'), fn: () => nuovaCartellaScheda(ora, id) });
  return [{ label: '📁 Sposta in una cartella', items: voci }];
}
/** Il menu col clic destro (o tenendo premuto) su una cartella. */
function menuCartellaScheda(id) {
  const c = cartellaScheda(id);
  if (!c) return null;
  const via = discendentiCartella(c.id), su = cartellaScheda(c.padre) ? c.padre : null;
  return [
    { label: c.chiusa ? 'Apri la cartella' : 'Chiudi la cartella', fn: () => { c.chiusa = !c.chiusa; renderSheetList(); salvaCartelleSchede(); } },
    { label: '＋ Nuova scheda qui…', fn: () => { csNuovaQui = c.id; $('sheetNew').click(); } },
    ...(livelloCartellaScheda(c) < MAX_LIVELLI_SCHEDE ? [{ label: 'Nuova cartella dentro', fn: () => nuovaCartellaScheda(c.id) }] : []),
    { label: '✎ Rinomina', fn: () => rinominaCartellaScheda(c) },
    { label: '📁 Sposta in', items: vociCartelleSchede(d => spostaCartellaScheda(c, d), su, via) },
    '-', { label: 'Elimina la cartella', danger: true, fn: () => eliminaCartellaScheda(c) }
  ];
}
// Una scheda nuova: va nella cartella scelta nella finestra «Nuova scheda».
let csNuovaQui = null;
function cartellaNuovaScheda(s) {
  const v = $('sheetFolderIn') && !$('sheetFolderWrap').hidden ? $('sheetFolderIn').value : '';
  if (v && cartellaScheda(v)) { cartelleSchede().dove[s.id] = v; const c = cartellaScheda(v); c.chiusa = false; salvaCartelleSchede(); }
}
/** Una scheda copiata va nella stessa cartella dell'originale; una cancellata esce. */
function cartellaSchedaCopiata(da, a) { const d = cartellaDellaScheda(da); if (d) { cartelleSchede().dove[a] = d; salvaCartelleSchede(); } }
function cartellaSchedaTolta(id) { const st = cartelleSchede(); if (id in st.dove) { delete st.dove[id]; salvaCartelleSchede(); } }

// ---------- I comandi ----------
$('sheetNew').insertAdjacentHTML('afterend', '<button id="sheetFolderNew" type="button" class="btn ghost" title="Nuova cartella: raggruppa le schede">📁 ＋ Cartella</button>');
$('sheetFolderNew').addEventListener('click', () => nuovaCartellaScheda());
// nella finestra «Nuova scheda»: in quale cartella metterla
$('sheetNameIn').closest('label').insertAdjacentHTML('afterend', '<label class="field" id="sheetFolderWrap" hidden>Cartella <select id="sheetFolderIn"></select></label>');
$('sheetNew').addEventListener('click', () => {
  const st = cartelleSchede(), sel = $('sheetFolderIn'), qui = cartellaScheda(csNuovaQui) ? csNuovaQui : '';
  csNuovaQui = null;
  $('sheetFolderWrap').hidden = !st.cartelle.length;
  const opz = [['', tr('(fuori dalle cartelle)')]];
  const giu = (padre, liv) => { for (const c of figlieCartella(padre)) { opz.push([c.id, ' '.repeat(liv) + '📁 ' + c.nome]); giu(c.id, liv + 1); } };
  giu(null, 0);
  sel.replaceChildren(...opz.map(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; }));
  sel.value = qui;
});
// lasciando una scheda (o una cartella) sulla zona vuota dell'elenco, esce dalle cartelle
$('sheetList').addEventListener('dragover', e => { if (csTrascinabile(e) && cartelleSchede().cartelle.length) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } });
$('sheetList').addEventListener('drop', e => {
  if (!csTrascinabile(e) || e.target.closest('.sheetFolder')) return;
  e.preventDefault();
  // sopra una scheda dentro una cartella: va in quella cartella; altrove: fuori dalle cartelle
  const sopra = e.target.closest('.sheetItem');
  csLasciaCadere(e, sopra ? cartellaDellaScheda(sopra.dataset.id) : null);
});
