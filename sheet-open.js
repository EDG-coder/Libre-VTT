// ---------- Modello «Open D&D 5e»: tutto quello della scheda ufficiale, in un formato libero ----------
// Ha gli stessi campi (le stesse chiavi data-f) della scheda Standard di sheet-std.js: quello che
// scrivi in una lo ritrovi nell'altra (menu della finestra → «Vedi come scheda Standard/Open»).
// In più gli incantesimi sono un elenco che si allunga quanto serve: ogni incantesimo ha il suo
// titolo e, aprendolo, la descrizione, che si può mandare in chat.
//
// Si appoggia a sheets.js (fld, area, ck, rows, ABIL, SKILLS, bindField, chipsFor) e a
// sheet-std.js (COINS, stdSend, stdFire, stdBindImages, stdMigrate).

const OPEN_INV = 45;                       // righe dell'inventario, come sulla scheda di carta
const MAX_INCANTESIMI = 200;               // per livello: un limite solo per sicurezza

// ---------- Pezzi ----------
const oBox = (titolo, dentro, cls = '') => `<div class="box ${cls}"><h5>${titolo}</h5>${dentro}</div>`;
const oArea = (titolo, k, ph = '') => area(titolo, k, ph);
const oStat = (lab, dentro) => `<div class="stat"><span class="lab">${lab}</span>${dentro}</div>`;

function openPagina1() {
  const abil = ABIL.map(([k, , nm]) => `<div class="ab"><b title="${nm}">${nm.toUpperCase()}</b><input type="number" data-f="${k}" aria-label="Punteggio di ${nm}"><button type="button" class="rb" data-r="mod:${k}" data-c="mod:${k}" title="Prova di ${nm}"></button></div>`).join('');
  const saves = ABIL.map(([k, , nm]) => `<div class="rl2">${ck('sp_' + k, 'Competenza')}<span>${nm}</span><button type="button" class="rb" data-r="save:${k}" data-c="save:${k}"></button></div>`).join('');
  const skills = SKILLS.slice().sort((a, b) => a[1].localeCompare(b[1], 'it')).map(([k, nm, a]) => {
    const sh = ABIL.find(x => x[0] === a)[1];
    return `<div class="rl2">${ck('kp_' + k, 'Competenza')}${ck('ke_' + k, 'Maestria (competenza doppia)')}<span>${nm} <small>(${sh[0] + sh.slice(1).toLowerCase()})</small></span><button type="button" class="rb" data-r="skill:${k}" data-c="skill:${k}"></button></div>`;
  }).join('');
  const atk = rows(8, i => `<div class="atk"><input type="text" data-f="an${i}" placeholder="Arma o attacco"><input type="number" data-f="ab${i}" placeholder="Bonus att."><input type="text" data-f="ad${i}" placeholder="Danni / tipo (1d8+3)"><div class="bt"><button type="button" class="rb" data-r="atk:${i}">Tira per colpire</button><button type="button" class="rb" data-r="dmg:${i}">Tira i danni</button></div></div>`);
  const lim = rows(6, i => `<div class="lf"><input type="text" data-f="lf${i}n" placeholder="Nome"><span class="rest" title="Si recupera con: riposo breve, riposo lungo, all'alba">${ck('lf' + i + 'b', 'Riposo breve')}${ck('lf' + i + 'l', 'Riposo lungo')}${ck('lf' + i + 'a', 'Alba')}</span><input type="number" data-f="lf${i}t" placeholder="Tot."><input type="number" data-f="lf${i}u" placeholder="Usi"></div>`);
  return `<div class="sgrid">
    <div class="box full"><div class="hdr">${fld('Classe', 'class')}${fld('Livello', 'level', 'number')}${fld('Razza', 'race')}${fld('Background', 'bg')}${fld('Allineamento', 'align')}${fld('Sesso', 'sex')}${fld('Punti esperienza', 'xp')}${fld('Nome giocatore', 'player')}</div></div>
    ${oBox('Caratteristiche', `<div class="abil">${abil}</div>
      <div class="hdr" style="margin-top:8px">
        <div class="stat"><span class="lab">Ispirazione</span><span class="oInsp">${rows(4, i => ck('insp' + (i + 1), 'Ispirazione'))}</span></div>
        ${oStat('Bonus di competenza', '<output data-c="prof"></output>')}
        <label class="lab">Competenza a mano<input type="number" data-f="profb" placeholder="dal livello"></label></div>`)}
    ${oBox('Tiri salvezza', saves)}
    ${oBox('Abilità <small>(☐ competenza · ☐ maestria)</small>', skills + `<div class="stat" style="margin-top:6px"><span class="lab">Saggezza (Percezione) passiva</span><output data-c="pp"></output></div>`)}
    ${oBox('Combattimento', `
      <div class="hdr">${fld('Classe armatura', 'ac', 'number')}${fld('CA temporanea', 'actemp', 'number')}${fld('Velocità', 'speed')}</div>
      <div class="hdr" style="margin-top:8px">${fld('Bonus iniziativa', 'initb', 'number')}${oStat('Iniziativa', '<button type="button" class="rb" data-r="init" data-c="init"></button>')}</div>
      <div class="hp" style="margin-top:8px">${fld('PF massimi', 'hpmax', 'number')}${fld('PF attuali', 'hp', 'number')}${fld('PF temporanei', 'hpt', 'number')}</div>
      <div class="hp" style="margin-top:8px">${fld('Dadi vita', 'hd')}${fld('Totali', 'hdt', 'number')}${fld('Usati', 'hdu', 'number')}</div>
      <div class="hp" style="margin-top:4px">${fld('Altri dadi vita', 'hd2')}${fld('Totali', 'hdt2', 'number')}${fld('Usati', 'hdu2', 'number')}</div>
      <div class="hdr" style="margin-top:8px">${fld('Affaticamento', 'fatigue')}${fld('Visione', 'vision')}<label class="rl2">${ck('darkv')}<span>Scurovisione</span></label></div>
      <div class="ds"><span>Successi</span>${ck('ds1')}${ck('ds2')}${ck('ds3')}<span>Fallimenti</span>${ck('df1')}${ck('df2')}${ck('df3')}<small>Tiri salvezza contro la morte</small></div>`)}
    ${oBox('Livello di follia <button type="button" class="oInfo" title="' + eh(INFO_FOLLIA) + '">che cos\'è?</button>', `<div class="row2">${fld('Livello', 'madness')}${fld('CD prova abilità', 'madcd', 'number')}</div>`)}
    ${oBox('Attacchi', atk + `<h5 style="margin-top:8px">Munizioni</h5>` +
      rows(3, i => `<div class="am"><input type="text" data-f="am${i}n" placeholder="Munizione"><input type="number" data-f="am${i}q" placeholder="Q.tà"></div>`), 'full')}
    ${oBox('Privilegi &amp; tratti limitati <small>(si recuperano con: riposo breve · lungo · all\'alba)</small>', lim, 'full')}
    ${oArea('Privilegi di classe', 'classf', 'Es. Ira [[1d12 | Dado ira]]')}
    ${oArea('Tratti razziali &amp; privilegi da background', 'racial')}
    ${oArea('Talenti', 'feats')}
    ${oArea('Altri privilegi e tratti', 'features', 'Es. Attacco furtivo [[2d6 | Furtivo]]')}
    ${oBox('Competenze', `
      <div class="rl2"><span>Armature:</span>${ck('pa_l')} leggere ${ck('pa_m')} medie ${ck('pa_p')} pesanti ${ck('pa_s')} scudi</div>
      <div class="rl2"><span>Armi:</span>${ck('pw_s')} semplici ${ck('pw_g')} da guerra ${ck('pw_a')} altro</div>
      <input type="text" data-f="pw_other" placeholder="Altre armi">
      <input type="text" data-f="prof_text1" placeholder="Altre competenze" style="margin-top:4px">
      <input type="text" data-f="prof_text2" placeholder="Altre competenze" style="margin-top:4px">
      <h5 style="margin-top:8px">Strumenti</h5>${rows(3, i => `<input type="text" data-f="tools${i + 1}" style="margin-bottom:4px">`)}
      <h5 style="margin-top:8px">Linguaggi</h5><input type="text" data-f="langs1"><input type="text" data-f="langs2" style="margin-top:4px">`)}
  </div>`;
}

function openPagina2() {
  const inv = Array.from({ length: OPEN_INV }, (_, i) => `<div class="iv"><input type="text" data-f="iv${i}n" placeholder="Oggetto"><input type="text" inputmode="decimal" data-f="iv${i}w" placeholder="kg"></div>`);
  const meta = Math.ceil(OPEN_INV / 2);
  return `<div class="sgrid">
    ${oBox('Armatura', `<div class="hdr">${fld('Armatura', 'ar_name')}${fld('CA', 'ar_ca', 'number')}${fld('Des max', 'ar_dexmax')}${fld('For', 'ar_for')}${fld('Scudo', 'ar_shield')}<label class="rl2">${ck('ar_dis')}<span>Svantaggio in furtività</span></label></div>`, 'full')}
    ${oBox('Monete', `<div class="coins">${COINS.map(([k, l]) => fld(l, k, 'number')).join('')}</div>`)}
    ${oBox('Consumabili', rows(6, i => `<div class="am"><input type="text" data-f="cn${i}n" placeholder="Consumabile"><input type="number" data-f="cn${i}u" placeholder="Nr. usi"></div>`))}
    ${oBox('Oggetti magici armonizzati <small>(massimo 3)</small>', rows(3, i => `<input type="text" data-f="mi${i}" style="margin-bottom:4px">`))}
    ${oArea('Equipaggiamento', 'equip')}
    <div class="box full"><h5>Inventario</h5><div class="invgrid"><div>${inv.slice(0, meta).join('')}</div><div>${inv.slice(meta).join('')}</div></div>
      <div class="hdr" style="margin-top:8px">${oStat('Peso trasportato (kg)', '<output data-c="wsum"></output>')}${oStat('Peso massimo trasportabile (kg)', '<output data-c="wmax"></output>')}</div></div>
  </div>`;
}

function openPagina3() {
  return `<div class="sgrid">
    <div class="box full"><div class="hdr">${fld('Età', 'age')}${fld('Altezza', 'height')}${fld('Peso', 'weight')}${fld('Occhi', 'eyes')}${fld('Carnagione', 'skin')}${fld('Capelli', 'hair')}</div></div>
    ${oBox('Aspetto del personaggio', `<div class="sImg oImg" data-img="portrait"><span>Tocca per scegliere un'immagine</span></div><textarea data-f="look" placeholder="Com'è fatto"></textarea>`)}
    ${oBox('Fazione', `${fld('Nome', 'faction')}<div class="sImg oImg oImgSm" data-img="symbol"><span>Simbolo</span></div><textarea data-f="faction_text"></textarea>`)}
    ${oArea('Tratti caratteriali', 'traits')}${oArea('Ideali', 'ideals')}${oArea('Legami', 'bonds')}${oArea('Difetti', 'flaws')}${oArea('Nemici', 'enemies')}
    ${oArea('Tratti &amp; privilegi aggiuntivi', 'extra')}
    ${oArea('Note', 'notes')}
  </div>`;
}

function openPagina4() {
  const livelli = Array.from({ length: 10 }, (_, L) => `<div class="box full oLiv" data-liv="${L}">
      <h5>${L ? `Livello ${L}` : 'Trucchetti'}<small class="oConta"></small></h5>
      ${L ? `<div class="oSlot">${fld('Slot totali', 'sl' + L + 't', 'number')}${fld('Slot spesi', 'sl' + L + 'u', 'number')}</div>` : ''}
      <div class="oSpells"></div>
      <button type="button" class="oAdd">＋ ${L ? 'Aggiungi un incantesimo' : 'Aggiungi un trucchetto'}</button>
    </div>`).join('');
  return `<div class="sgrid">
    <div class="box full"><div class="hdr">${fld('Classe da incantatore', 'sc_class')}${fld('Caratteristica', 'sc_ab')}${fld('CD tiro salvezza', 'spcd', 'number')}
      <div class="stat"><span class="lab">Bonus di attacco</span><span class="row2"><input type="number" data-f="spatk"><button type="button" class="rb" data-r="spatk" title="Tira l'attacco con incantesimo">Tira</button></span></div></div>
      <p class="oHint">Scrivi il nome di ogni incantesimo nella sua riga; tocca ▸ per scriverne la descrizione. Con 💬 la mandi in chat, con 🎲 tiri i dadi scritti come <b>[[8d6 | Danni]]</b>. La casella a sinistra segna gli incantesimi preparati.</p></div>
    ${livelli}
    ${oArea('Altri appunti sugli incantesimi', 'spells', 'Es. Dardo incantato [[3d4+3 | Dardo]]')}
  </div>`;
}

function dndHtml() {
  return `<div class="stabs"><button type="button" class="on" data-pg="1">Scheda</button><button type="button" data-pg="2">Equipaggiamento</button><button type="button" data-pg="3">Personaggio</button><button type="button" data-pg="4">Incantesimi</button></div>` +
    [openPagina1(), openPagina2(), openPagina3(), openPagina4()]
      .map((h, i) => `<div class="spage" data-pg="${i + 1}"${i ? ' hidden' : ''}>${h}</div>`).join('');
}

// ---------- Gli incantesimi: un elenco che si allunga ----------
// Usano le stesse chiavi della scheda Standard: sp<livello>_<n> il nome, sp<livello>_<n>_d la
// descrizione, spk_<livello>_<n> «preparato». Qui le righe sono quante ne servono.
const spK = (L, i) => `sp${L}_${i}`;
const vuoto = v => !String(v ?? '').trim();
function quantiIncantesimi(s, L) {
  let n = 0;
  for (const k of Object.keys(s.f)) {
    const m = k.match(/^(?:sp|spk_)(\d)_(\d+)(?:_d)?$/);
    if (m && +m[1] === L && !vuoto(s.f[k])) n = Math.max(n, +m[2] + 1);
  }
  return Math.min(n, MAX_INCANTESIMI);
}

function rigaIncantesimo(L, i) {
  const k = spK(L, i);
  return `<div class="oSp" data-i="${i}">
    <div class="oSpHead">
      ${L ? `<input type="checkbox" data-f="spk_${L}_${i}" title="Preparato">` : ''}
      <button type="button" class="oTog" title="Mostra o nascondi la descrizione" aria-expanded="false">▸</button>
      <input type="text" data-f="${k}" placeholder="${L ? 'Nome dell\'incantesimo' : 'Nome del trucchetto'}" autocomplete="off">
      <button type="button" class="oDie" title="Tira i dadi scritti nell'incantesimo">🎲</button>
      <button type="button" class="oChat" title="Manda nome e descrizione in chat">💬</button>
      <button type="button" class="oDel" title="Togli questo incantesimo">✕</button>
    </div>
    <div class="oSpBody" hidden>
      <textarea data-f="${k}_d" placeholder="Scuola · tempo di lancio · gittata · componenti · durata&#10;&#10;Cosa fa. Metti [[8d6 | Danni]] per avere il tiro pronto."></textarea>
    </div>
  </div>`;
}

// l'area della descrizione cresce con il testo (fino a un certo punto, poi scorre)
function allunga(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(Math.max(ta.scrollHeight + 2, 90), 600) + 'px';
}

function openSetup(w, root, s) {
  stdMigrate(s);
  stdBindImages(root, s);
  const aperti = new Set();                          // le descrizioni aperte (solo in questa finestra)

  function disegnaLivello(box) {
    const L = +box.dataset.liv, n = quantiIncantesimi(s, L);
    const lista = box.querySelector('.oSpells');
    lista.innerHTML = Array.from({ length: n }, (_, i) => rigaIncantesimo(L, i)).join('');
    lista.querySelectorAll('[data-f]').forEach(el => bindField(el, root, s));
    lista.querySelectorAll('.oSp').forEach(r => segna(r, L));
    box.querySelector('.oConta').textContent = n ? ` · ${n}` : '';
  }
  function segna(riga, L) {
    const i = +riga.dataset.i, k = spK(L, i), on = aperti.has(k);
    const tog = riga.querySelector('.oTog'), corpo = riga.querySelector('.oSpBody');
    corpo.hidden = !on;
    tog.textContent = on ? '▾' : '▸';
    tog.setAttribute('aria-expanded', on);
    tog.classList.toggle('has', !vuoto(s.f[k + '_d']));
    if (on) allunga(corpo.querySelector('textarea'));
  }
  root.querySelectorAll('.oLiv').forEach(disegnaLivello);

  root.addEventListener('click', e => {
    const info = e.target.closest('.oInfo');
    if (info) { alert(info.title); return; }
    const box = e.target.closest('.oLiv');
    if (!box) return;
    const L = +box.dataset.liv;
    if (e.target.closest('.oAdd')) {
      const lista = box.querySelector('.oSpells');
      // le righe ancora vuote non sono salvate: si conta anche quelle già sullo schermo
      const i = Math.max(quantiIncantesimi(s, L), lista.children.length);
      if (i >= MAX_INCANTESIMI) return;
      lista.insertAdjacentHTML('beforeend', rigaIncantesimo(L, i));
      const r = lista.lastElementChild;
      r.querySelectorAll('[data-f]').forEach(el => bindField(el, root, s));
      aperti.add(spK(L, i)); segna(r, L);
      r.querySelector(`[data-f="${spK(L, i)}"]`).focus();
      box.querySelector('.oConta').textContent = ` · ${lista.children.length}`;
      return;
    }
    const riga = e.target.closest('.oSp');
    if (!riga) return;
    const i = +riga.dataset.i, k = spK(L, i);
    if (e.target.closest('.oTog')) {
      if (aperti.has(k)) aperti.delete(k); else aperti.add(k);
      segna(riga, L);
      if (aperti.has(k)) riga.querySelector('textarea').focus();
    } else if (e.target.closest('.oDie')) {
      stdFire(s, k);
    } else if (e.target.closest('.oChat')) {
      if (vuoto(s.f[k]) && vuoto(s.f[k + '_d'])) return;
      stdSend(s, k);
    } else if (e.target.closest('.oDel')) {
      const pieno = !vuoto(s.f[k]) || !vuoto(s.f[k + '_d']);
      if (pieno && !confirm(`Togliere «${String(s.f[k] || 'questo incantesimo').trim()}»?`)) return;
      // le righe dopo scalano di uno, così non restano buchi
      const n = Math.max(quantiIncantesimi(s, L), i + 1);
      for (let j = i; j < n; j++) {
        for (const suf of ['', '_d']) {
          const da = spK(L, j + 1) + suf, a = spK(L, j) + suf;
          if (s.f[da] !== undefined) s.f[a] = s.f[da]; else delete s.f[a];
        }
        const pa = `spk_${L}_${j}`, pb = `spk_${L}_${j + 1}`;
        if (s.f[pb] !== undefined) s.f[pa] = s.f[pb]; else delete s.f[pa];
        if (aperti.has(spK(L, j + 1))) aperti.add(spK(L, j)); else aperti.delete(spK(L, j));
      }
      disegnaLivello(box);
      schedaCambiata(s);
    }
  });
  root.addEventListener('input', e => {
    const ta = e.target.closest('.oSpBody textarea');
    if (ta) { allunga(ta); const r = ta.closest('.oSp'); segna(r, +ta.closest('.oLiv').dataset.liv); }
  });
}
