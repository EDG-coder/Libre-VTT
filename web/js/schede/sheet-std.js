// ---------- Modello «Standard»: la scheda 5e in italiano, 3 pagine ordinate ----------
// Base (tutto quello che serve per giocare), Bio e Incantesimi: le colonne si adattano alla finestra.
// Il disegno (cornici, riquadri delle caratteristiche) è originale di questo file.
//
// Si appoggia a sheets.js: usa le stesse convenzioni (data-f per i campi, data-c per i valori
// calcolati, data-r per i tiri, .stabs/.spage per le pagine), quindi bindSheet() funziona già.

const eh = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rep = (n, fn) => Array.from({ length: n }, (_, i) => fn(i)).join('');

// spiegazioni brevi per i campi meno ovvi
const INFO_FOLLIA = 'Regola facoltativa (Guida del Dungeon Master, «Follia»): quando un personaggio vive qualcosa di sconvolgente il master può dargli un livello di follia, con i suoi effetti (breve, lunga, indefinita). «CD prova abilità» è la difficoltà del tiro salvezza o della prova per resistere. Si accende da ⚙ Impostazioni › Regole (o, nella home, ⚙ › Impostazioni avanzate).';

// ---------- Elenchi ----------
// Le abilità nell'ordine della scheda italiana (alfabetico), con la caratteristica abbreviata.
const STD_SK = [
  ['acro', 'Acrobazia', 'Des'], ['anim', 'Addestrare Animali', 'Sag'], ['arca', 'Arcano', 'Int'],
  ['athl', 'Atletica', 'For'], ['stea', 'Furtività', 'Des'], ['inve', 'Indagare', 'Int'],
  ['dece', 'Inganno', 'Car'], ['inti', 'Intimidire', 'Car'], ['perf', 'Intrattenere', 'Car'],
  ['insi', 'Intuizione', 'Sag'], ['medi', 'Medicina', 'Sag'], ['natu', 'Natura', 'Int'],
  ['perception', 'Percezione', 'Sag'], ['pers', 'Persuasione', 'Car'], ['slei', 'Rapidità di Mano', 'Des'],
  ['reli', 'Religione', 'Int'], ['surv', 'Sopravvivenza', 'Sag'], ['hist', 'Storia', 'Int']
];
const COINS = [['mr', 'MR'], ['ma', 'MA'], ['me', 'ME'], ['mo', 'MO'], ['mp', 'MP']];
const SPELL_LINES = [8, 13, 13, 13, 9, 9, 9, 9, 7, 7];   // righe per livello, dai trucchetti al 9°

// ---------- Calcoli: aggiungo la competenza doppia (il pallino piccolo) ----------
const SK_AB = Object.fromEntries(SKILLS.map(x => [x[0], x[2]]));
const stdSkill = (s, k) => {
  const mod = abMod(s, SK_AB[k]), comp = profB(s), ke = !!s.f['ke_' + k], kp = !!s.f['kp_' + k];
  return regola('abilita', { mod, competente: kp ? 1 : 0, maestria: ke ? 1 : 0, competenza: comp }, () => mod + comp * (ke ? 2 : kp ? 1 : 0)) + mezzaCompetenza(s, k);
};
var calcValue = (prev => function (s, key) {
  const [t, a] = key.split(':');
  if (t === 'skill') return stdSkill(s, a);
  if (t === 'pp') return 10 + stdSkill(s, 'perception');
  return prev(s, key);
})(calcValue);

// ======================= Le tre pagine =======================
// La scheda in tre pagine ordinate che si adattano alla finestra (3, 2 o 1 colonna):
//   Base         tutto quello che serve per giocare, nello stesso ordine in cui lo si cerca
//   Bio          aspetto, ritratto, personalità, fazione, tratti aggiuntivi (e la follia, se è accesa)
//   Incantesimi  classe, CD e bonus di attacco, slot e righe per ogni livello
// I campi (data-f), i valori calcolati (data-c) e i tiri (data-r) sono quelli di sempre: le schede
// già fatte si aprono uguali, e la scheda Open (sheet-open.js) ha le stesse pagine nello stesso ordine.
const ZS_AB = [['str', 'Forza'], ['dex', 'Destrezza'], ['con', 'Costituzione'], ['int', 'Intelligenza'], ['wis', 'Saggezza'], ['cha', 'Carisma']];
const ZS_INV = 45, ZS_ATK = 5;

const zsInp = (k, cls = '', type = 'text') => `<input class="zsF ${cls}" type="${type}" data-f="${k}" autocomplete="off">`;
const zsNum = (k, cls = '') => zsInp(k, cls, 'number');
const zsChk = (k, cls = '', t = '') => `<input class="zsK ${cls}" type="checkbox" data-f="${k}"${t ? ` title="${t}" aria-label="${t}"` : ''}>`;
const zsVal = (c, roll, cls = '') => roll
  ? `<button type="button" class="zsV zsRoll ${cls}" data-c="${c}" data-r="${roll}"></button>`
  : `<output class="zsV ${cls}" data-c="${c}"></output>`;
const zsLab = (t, cls = '') => `<span class="zsLab ${cls}">${t}</span>`;
const zsFld = (t, body, cls = '') => `<label class="zsFld ${cls}">${zsLab(t)}${body}</label>`;
const zsCard = (t, body, cls = '') => `<section class="zsCard ${cls}"><h3>${t}</h3>${body}</section>`;
const zsBox = (t, body) => `<div class="zsBox">${body}${zsLab(t)}</div>`;
// area di testo: il titolo è il primo figlio (il 💬 lo usa come titolo del messaggio in chat)
const zsTa = (k, t, cls = '') => `<div class="sTa zsTa ${cls}">${zsLab(t)}<textarea data-f="${k}"></textarea><button type="button" class="sendRule" data-send="${k}" title="Manda questo testo in chat">💬</button></div>`;
const zsDado = (r, t, s = '◎') => `<button type="button" class="zsDie" data-r="${r}" title="${t}" aria-label="${t}">${s}</button>`;
const zsName = () => `<div class="zsName"><input class="zsF zsBig" type="text" data-sname maxlength="40" autocomplete="off" aria-label="Nome del personaggio">${zsLab('Nome del personaggio')}</div>`;

const zsAtkRow = i => `<div class="zsAtkRow">${zsInp('an' + i)}${zsInp('ab' + i, 'zsC')}${zsInp('ad' + i)}${zsDado('atk:' + i, 'Tira per colpire')}${zsDado('dmg:' + i, 'Tira i danni', '◆')}</div>`;
const zsInvRow = i => `<div class="zsInvRow">${zsInp('iv' + i + 'n')}${zsInp('iv' + i + 'w', 'zsC')}</div>`;

function stdPagBase() {
  const head = `<header class="zsHead">${zsName()}
    <div class="zsMeta">${[['class', 'Classe'], ['level', 'Livello'], ['race', 'Razza'], ['bg', 'Background'], ['align', 'Allineamento'], ['player', 'Giocatore']].map(([k, t]) => zsFld(t, zsInp(k))).join('')}</div></header>`;

  const colA = `<div class="zsCol">
    <div class="zsAbs">${ZS_AB.map(([k, t]) => `<div class="zsAb">${zsLab(t)}${zsNum(k, 'zsScore')}${zsVal('mod:' + k, 'mod:' + k, 'zsMod')}</div>`).join('')}</div>
    <div class="zsDue">${zsBox('Ispirazione', `<span class="zsInsp">${rep(4, i => zsChk('insp' + (i + 1), '', 'Ispirazione'))}</span>`)}${zsBox('Bonus competenza', `<input class="zsF zsScore" type="number" data-f="profb" data-ph="prof" title="Lascialo vuoto per calcolarlo dal livello" autocomplete="off">`)}</div>
    ${zsCard('Tiri salvezza', ZS_AB.map(([k, t]) => `<div class="zsLine">${zsChk('sp_' + k, '', 'Competenza')}${zsVal('save:' + k, 'save:' + k)}<span>${t}</span></div>`).join(''))}
    ${zsCard('Abilità', STD_SK.map(([k, t, a]) => `<div class="zsLine">${zsChk('ke_' + k, 'zsMini', 'Maestria (competenza doppia)')}${zsChk('kp_' + k, '', 'Competenza')}${zsVal('skill:' + k, 'skill:' + k)}<span>${t} <i>(${a})</i></span></div>`).join('') +
      `<div class="zsLine zsPass">${zsVal('pp', null)}<span>Saggezza (Percezione) passiva</span></div>`)}
    ${zsCard('Competenze e linguaggi', `<div class="zsLine zsTicks">${zsLab('Armature')}${[['pa_l', 'Leggere'], ['pa_m', 'Medie'], ['pa_p', 'Pesanti'], ['pa_s', 'Scudi']].map(([k, t]) => `<label class="zsTick">${zsChk(k)}${t}</label>`).join('')}</div>
      <div class="zsLine zsTicks">${zsLab('Armi')}${[['pw_s', 'Semplici'], ['pw_g', 'Da guerra'], ['pw_a', 'Altro']].map(([k, t]) => `<label class="zsTick">${zsChk(k)}${t}</label>`).join('')}${zsInp('pw_other')}</div>
      ${zsFld('Altre competenze', zsInp('prof_text1') + zsInp('prof_text2'))}${zsFld('Strumenti', zsInp('tools1') + zsInp('tools2') + zsInp('tools3'))}${zsFld('Linguaggi', zsInp('langs1') + zsInp('langs2'))}`)}
  </div>`;

  const colB = `<div class="zsCol">
    <div class="zsQuattro">${zsBox('Classe armatura', zsNum('ac', 'zsScore'))}${zsBox('CA temp.', zsNum('actemp', 'zsScore'))}${zsBox('Iniziativa', zsVal('init', 'init', 'zsScore'))}${zsBox('Velocità', zsInp('speed', 'zsScore'))}</div>
    ${zsCard('Punti ferita', `<div class="zsTre">${zsBox('Attuali', zsNum('hp', 'zsScore'))}${zsBox('Massimi', zsNum('hpmax', 'zsScore'))}${zsBox('Temporanei', zsNum('hpt', 'zsScore'))}</div>`)}
    <div class="zsDue">${zsCard('Dadi vita', `<div class="zsDvHead">${zsLab('Dado')}${zsLab('Totali')}${zsLab('Usati')}</div>` +
      ['', '2'].map(x => `<div class="zsDv">${zsInp('hd' + x, 'zsC')}${zsNum('hdt' + x, 'zsC')}${zsNum('hdu' + x, 'zsC')}</div>`).join(''))}
      ${zsCard('TS contro morte', `<div class="zsMorte">${zsLab('Successi')}<span>${rep(3, i => zsChk('ds' + (i + 1), '', 'Successo'))}</span>${zsLab('Fallimenti')}<span>${rep(3, i => zsChk('df' + (i + 1), '', 'Fallimento'))}</span></div>`)}</div>
    <div class="zsTre">${zsBox('Affaticamento', zsInp('fatigue', 'zsScore'))}${zsBox('Scurovisione', zsInp('scuroV', 'zsScore scuroStd'))}${zsBox('Visione', zsInp('vision', 'zsScore'))}</div>
    ${zsCard('Attacchi', `<div class="zsAtkHead">${zsLab('Arma')}${zsLab('Bonus')}${zsLab('Danni / tipo')}</div><div class="zsAtk">${rep(ZS_ATK, zsAtkRow)}</div>
      <button type="button" class="zsPlus" data-zs="atk">＋ Attacco</button>
      <div class="zsAmmoHead">${zsLab('Munizioni')}${zsLab('Q.tà')}</div>${rep(3, i => `<div class="zsInvRow">${zsInp('am' + i + 'n')}${zsNum('am' + i + 'q', 'zsC')}</div>`)}`)}
    ${zsCard('Equipaggiamento', `<div class="zsArm">${zsFld('Armatura', zsInp('ar_name'))}${zsFld('CA', zsNum('ar_ca', 'zsC'))}${zsFld('Des max', zsInp('ar_dexmax', 'zsC'))}${zsFld('For', zsInp('ar_for', 'zsC'))}${zsFld('Scudo', zsInp('ar_shield', 'zsC'))}</div>
      <label class="zsLine zsSvant">${zsChk('ar_dis')}<span>Svantaggio in Furtività</span></label>
      <div class="zsCinque">${COINS.map(([k, t]) => zsBox(t, zsNum(k, 'zsScore'))).join('')}</div>`)}
    ${zsCard('Inventario', `<div class="zsInvHead">${zsLab('Oggetto')}${zsLab('Peso')}</div><div class="zsInv" data-list="iv">${rep(ZS_INV, zsInvRow)}</div>
      <button type="button" class="zsPlus" data-zs="more" data-for="iv">＋ Righe</button>
      <div class="zsPeso">${zsLab('Peso trasportato')}${zsVal('wsum', null)}${zsLab('Massimo')}${zsVal('wmax', null)}${zsLab('kg')}</div>`)}
  </div>`;

  const colC = `<div class="zsCol">
    ${zsCard('Privilegi e tratti limitati', `<div class="zsLfHead">${zsLab('Nome')}${zsLab('Recupero')}${zsLab('Tot.')}${zsLab('Usi')}</div>` +
      rep(6, i => `<div class="zsLf">${zsInp('lf' + i + 'n')}<span class="zsRec">${zsChk('lf' + i + 'b', '', 'Riposo breve')}${zsChk('lf' + i + 'l', '', 'Riposo lungo')}${zsChk('lf' + i + 'a', '', 'Alba')}</span>${zsNum('lf' + i + 't', 'zsC')}${zsNum('lf' + i + 'u', 'zsC')}</div>`) +
      `<div class="zsHint">Si recuperano con: RB riposo breve · RL riposo lungo · AL all'alba</div>`, 'zsLimitati')}
    ${zsTa('classf', 'Privilegi di classe')}${zsTa('racial', 'Tratti razziali e privilegi da background')}${zsTa('feats', 'Talenti')}
    ${zsCard('Consumabili e oggetti magici', `<div class="zsInvHead">${zsLab('Consumabile')}${zsLab('Usi')}</div>` + rep(6, i => `<div class="zsInvRow">${zsInp('cn' + i + 'n')}${zsNum('cn' + i + 'u', 'zsC')}</div>`) +
      `<div class="zsHint">Oggetti magici armonizzati (massimo 3)</div>` + rep(3, i => zsInp('mi' + i)))}
  </div>`;

  return `${head}<div class="zsCols">${colA}${colB}${colC}</div>`;
}

function stdPagBio() {
  return `<header class="zsHead">${zsName()}
      <div class="zsMeta zsMeta7">${[['age', 'Età'], ['sex', 'Sesso'], ['height', 'Altezza'], ['weight', 'Peso'], ['eyes', 'Occhi'], ['skin', 'Carnagione'], ['hair', 'Capelli']].map(([k, t]) => zsFld(t, zsInp(k))).join('')}</div></header>
    <div class="zsCols zsColsPari">
      <div class="zsCol">${zsCard('Aspetto', `<div class="sImg zsImg" data-img="portrait"><span>Clic per scegliere un'immagine</span></div>`)}${zsTa('look', 'Descrizione dell’aspetto')}</div>
      <div class="zsCol">${[['traits', 'Tratti caratteriali'], ['ideals', 'Ideali'], ['bonds', 'Legami'], ['flaws', 'Difetti']].map(([k, t]) => zsTa(k, t)).join('')}</div>
      <div class="zsCol">${zsCard('Fazione', `${zsFld('Nome', zsInp('faction'))}<div class="sImg zsImg zsImgSm" data-img="symbol"><span>Simbolo</span></div>`)}${zsTa('faction_text', 'Note sulla fazione')}${zsTa('enemies', 'Nemici')}</div>
    </div>
    <div class="zsCols zsCols2">
      ${zsTa('extra', 'Tratti e privilegi aggiuntivi', 'zsAlto')}
      ${zsCard('Livello di follia', `<div class="zsDue">${zsBox('Livello', zsInp('madness', 'zsScore'))}${zsBox('CD prova abilità', zsNum('madcd', 'zsScore'))}</div>
        <button type="button" class="sInfo zsPlus" data-info="follia" title="${eh(INFO_FOLLIA)}">che cos'è?</button>`, 'folliaBox')}
    </div>`;
}

function stdPagIncantesimi() {
  const livello = L => {
    const slot = L ? `<div class="zsSlot">${zsLab('Slot totali')}${zsNum('sl' + L + 't', 'zsC')}${zsLab('spesi')}${zsNum('sl' + L + 'u', 'zsC')}</div>` : '';
    const righe = rep(SPELL_LINES[L], i => `<div class="zsSp">${L ? zsChk(`spk_${L}_${i}`, '', 'Preparato') : ''}<span class="zsSpLine"><input class="zsF" type="text" data-f="sp${L}_${i}" autocomplete="off"><button type="button" class="sMore" data-more="sp${L}_${i}" title="Scrivi la descrizione">▾</button><button type="button" class="sDie" data-die="sp${L}_${i}" title="Tira, oppure manda in chat">🎲</button></span></div>`);
    return zsCard(L ? `Livello ${L}` : 'Trucchetti', `${slot}<div class="zsSpList" data-list="sp${L}">${righe}</div><button type="button" class="zsPlus" data-zs="more" data-for="sp${L}">＋ Righe</button>`, 'zsSpCard');
  };
  return `<header class="zsHead zsSpHead">${zsFld('Classe da incantatore', zsInp('sc_class', 'zsBig'))}
      <div class="zsQuattro zsQuattroSp">${zsBox('Caratteristica', zsInp('sc_ab', 'zsScore'))}${zsBox('CD tiro salvezza', zsNum('spcd', 'zsScore'))}
      <div class="zsBox"><span class="zsRiga">${zsNum('spatk', 'zsScore')}${zsDado('spatk', 'Tira l’attacco con incantesimo')}</span>${zsLab('Bonus di attacco')}</div></div></header>
    <div class="zsSpGrid">${rep(10, livello)}</div>`;
}

function standardHtml() {
  const pagine = [['Base', stdPagBase()], ['Bio', stdPagBio()], ['Incantesimi', stdPagIncantesimi()]];
  return `<div class="stabs">${pagine.map(([t], i) => `<button type="button"${i ? '' : ' class="on"'} data-pg="${i + 1}">${t}</button>`).join('')}
      <span class="sZoomWrap"><button type="button" class="sZoom" data-z="-" title="Rimpicciolisci" aria-label="Rimpicciolisci"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button><button type="button" class="sZoom" data-z="+" title="Ingrandisci" aria-label="Ingrandisci"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h8M6 2v8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button></span>
    </div>` +
    pagine.map(([, h], i) => `<div class="spage zsPage" data-pg="${i + 1}"${i ? ' hidden' : ''}><div class="zsIn">${h}</div></div>`).join('');
}

// ======================= Comportamenti in più ======================
// Ingrandire o rimpicciolire (pulsanti − +, pizzico col touchpad o con due dita): con lo zoom le
// colonne si ridispongono da sole, come se la finestra fosse più stretta.
function stdFit(win) {
  const k = win._sZoom || 1;
  win.querySelectorAll('.zsPage').forEach(p => { p.style.zoom = k === 1 ? '' : String(k); });
}
function stdZoom(win, fattore) {
  win._sZoom = clamp((win._sZoom || 1) * fattore, 0.6, 2.5);
  stdFit(win);
}
// Due dita sulla scheda: lo zoom è quello della scheda, non della pagina.
function stdBindPinch(win, root) {
  const dita = new Map();
  let d0 = 0;
  const dist = () => { const [a, b] = [...dita.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  root.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' || !e.target.closest('.zsPage')) return;
    dita.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (dita.size === 2) d0 = dist();
  });
  root.addEventListener('pointermove', e => {
    if (!dita.has(e.pointerId)) return;
    dita.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (dita.size === 2 && d0 > 20) { const d = dist(); stdZoom(win, d / d0); d0 = d; e.preventDefault(); }
  });
  const via = e => { dita.delete(e.pointerId); if (dita.size < 2) d0 = 0; };
  root.addEventListener('pointerup', via); root.addEventListener('pointercancel', via);
}

// ---------- Elenchi lunghi: si vede solo quello che serve ----------
// Inventario e incantesimi hanno tante righe: quelle vuote in fondo restano nascoste, se ne vedono un paio
// dopo l'ultima scritta e «＋ Righe» ne mostra altre. Vale per ogni [data-list] (anche nella scheda Open).
function schedaListe(root, s) {
  const extra = root._listeExtra || (root._listeExtra = {});
  root.querySelectorAll('[data-list]').forEach(list => {
    const id = list.dataset.list, righe = [...list.children];
    const piena = r => [...r.querySelectorAll('[data-f]')].some(el => {
      const k = el.dataset.f;
      return String(s.f[k] ?? '').trim() || String(s.f[k + '_d'] ?? '').trim() || el === document.activeElement;
    });
    let ultima = -1;
    righe.forEach((r, i) => { if (piena(r)) ultima = i; });
    const quante = Math.min(righe.length, ultima + 1 + (extra[id] ?? 2));
    righe.forEach((r, i) => r.classList.toggle('zsHide', i >= quante));
    const piu = root.querySelector(`[data-zs="more"][data-for="${id}"]`);
    if (piu) piu.hidden = quante >= righe.length;
  });
}
function schedaBindListe(root, s) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-zs="more"]');
    if (!b) return;
    const ex = root._listeExtra || (root._listeExtra = {});
    ex[b.dataset.for] = (ex[b.dataset.for] ?? 2) + 4;
    schedaListe(root, s);
  });
  root.addEventListener('input', e => { if (e.target.closest('[data-list]')) schedaListe(root, s); });
  schedaListe(root, s);
}

// ---------- Attacchi: quanti ne servono ----------
const ATK_RE = /^a[nbd](\d+)$/;
function quantiAttacchi(s) {                       // righe usate: l'ultima che ha qualcosa scritto
  let n = 0;
  for (const k of Object.keys(s.f)) {
    const m = ATK_RE.exec(k);
    if (m && String(s.f[k] ?? '').trim()) n = Math.max(n, +m[1] + 1);
  }
  return Math.min(n, 200);
}
function stdBindAttacchi(root, s) {
  const lista = root.querySelector('.zsAtk');
  if (!lista) return;
  const aggiungi = fino => {
    const n = lista.children.length;
    if (n >= fino) return;
    lista.insertAdjacentHTML('beforeend', rep(fino - n, j => zsAtkRow(n + j)));
    [...lista.children].slice(n).forEach(r => r.querySelectorAll('[data-f]').forEach(el => bindField(el, root, s)));
  };
  aggiungi(quantiAttacchi(s));                      // tutte quelle già scritte, almeno cinque
  root.addEventListener('click', e => {
    if (!e.target.closest('[data-zs="atk"]')) return;
    const n = lista.children.length;
    if (n >= 200) return;
    aggiungi(n + 1);
    lista.lastElementChild.querySelector('input').focus();
  });
}

// Immagini (ritratto e simbolo) della seconda pagina: vengono dagli assets.
function stdBindImages(root, s) {
  root.querySelectorAll('.sImg').forEach(el => {
    const key = 'img_' + el.dataset.img;
    const paint = () => {
      const url = resolveUrl(s.f[key] ? { url: s.f[key], aid: s.f[key + '_aid'] } : null);
      el.classList.toggle('has', !!url);
      el.style.backgroundImage = url ? `url("${url}")` : '';
    };
    el.addEventListener('click', () => pickAsset(a => {
      s.f[key] = a.url; s.f[key + '_aid'] = a.id;
      paint(); scheduleSheets();
    }));
    el.addEventListener('contextmenu', e => {
      e.preventDefault();
      delete s.f[key]; delete s.f[key + '_aid'];
      paint(); scheduleSheets();
    });
    paint();
  });
}

const bodyKey = k => k + '_d';

/** Tira tutte le [[espressioni]] del titolo e della descrizione; se non ce ne sono, manda in chat. */
function stdFire(s, k) {
  const title = String(s.f[k] || '').trim();
  const body = String(s.f[bodyKey(k)] || '').trim();
  const all = (title + '\n' + body);
  const ms = [...all.matchAll(/\[\[\s*([^\]|]+?)\s*(?:\|\s*([^\]]+?)\s*)?\]\]/g)];
  if (ms.length) { for (const m of ms) rollExpr(typeof conCaratteristiche === 'function' ? conCaratteristiche(s, m[1]) : m[1], `${s.name} · ${m[2] || m[1]}`); return; }
  const bare = title.match(/(\d*d\d+(?:\s*[+-]\s*\d+)?)/i);
  if (bare && rollExpr(bare[1], `${s.name} · ${title.slice(0, 28)}`)) return;
  if (title || body) stdSend(s, k);
}
/** Manda titolo e descrizione in chat, come una regola. */
function stdSend(s, k) {
  const title = String(s.f[k] || '').trim(), body = String(s.f[bodyKey(k)] || '').trim();
  if (!title && !body) return;
  // in chat le [[2d6 | Danni]] si leggono come «Danni (2d6)»: il tiro resta sul pulsante
  const plain = t => t.replace(/\[\[\s*([^\]|]+?)\s*(?:\|\s*([^\]]+?)\s*)?\]\]/g,
    (_, expr, nm) => (nm ? `${nm} (${expr})` : expr));
  addChat({ kind: 'rule', title: `${s.name} · ${plain(title) || 'Incantesimo'}`, text: plain(body || title) });
}

// Il dado a fine riga, e la tendina della descrizione.
function stdBindLines(root, s) {
  root.addEventListener('click', e => {
    const d = e.target.closest('.sDie');
    if (d) { stdFire(s, d.dataset.die); return; }
    const m = e.target.closest('.sMore');
    if (m) { stdOpenSpell(s, m.dataset.more, m); return; }
  });
  stdMarkLines(root, s);
}
/** Un puntino sulle righe che hanno una descrizione scritta. */
function stdMarkLines(root, s) {
  root.querySelectorAll('.sMore').forEach(b => {
    b.classList.toggle('has', !!String(s.f[bodyKey(b.dataset.more)] || '').trim());
  });
}

// ---------- La tendina dell'incantesimo ----------
document.body.insertAdjacentHTML('beforeend', `
<div id="spellPop" class="temaScheda" hidden>
  <header><input id="spellTitle" type="text" maxlength="80" placeholder="Nome dell'incantesimo" autocomplete="off">
    <button type="button" id="spellClose" aria-label="Chiudi">✕</button></header>
  <textarea id="spellBody" placeholder="Scrivi qui l'effetto: scuola, tempo di lancio, gittata, durata…&#10;Metti [[8d6 | Danni]] per avere il tiro pronto."></textarea>
  <footer>
    <button type="button" id="spellRoll">🎲 Tira</button>
    <button type="button" id="spellChat">💬 Manda in chat</button>
    <span class="spellHint">Si salva da solo</span>
  </footer>
</div>`);

const spellPop = $('spellPop');
let spellCur = null;                       // { sheet, key, root }

function stdOpenSpell(s, k, anchor) {
  spellCur = { s, k, root: anchor.closest('.sbody') };
  $('spellTitle').value = s.f[k] || '';
  $('spellBody').value = s.f[bodyKey(k)] || '';
  spellPop.hidden = false;
  const r = anchor.getBoundingClientRect();
  const w = spellPop.offsetWidth, h = spellPop.offsetHeight;
  spellPop.style.left = Math.max(8, Math.min(r.left - w / 2, innerWidth - w - 8)) + 'px';
  spellPop.style.top = (r.bottom + h + 10 > innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
  setTimeout(() => $('spellTitle').select(), 0);
}
function stdCloseSpell() { spellPop.hidden = true; spellCur = null; }
function stdSpellSave() {
  if (!spellCur) return;
  const { s, k, root } = spellCur;
  s.f[k] = $('spellTitle').value;
  s.f[bodyKey(k)] = $('spellBody').value;
  const inp = root && root.querySelector(`[data-f="${k}"]`);
  if (inp) inp.value = s.f[k];
  if (root) stdMarkLines(root, s);
  scheduleSheets();
}
$('spellTitle').addEventListener('input', stdSpellSave);
$('spellBody').addEventListener('input', stdSpellSave);
$('spellClose').addEventListener('click', stdCloseSpell);
$('spellRoll').addEventListener('click', () => { if (spellCur) stdFire(spellCur.s, spellCur.k); });
$('spellChat').addEventListener('click', () => { if (spellCur) stdSend(spellCur.s, spellCur.k); });
addEventListener('pointerdown', e => {
  if (spellPop.hidden) return;
  if (!spellPop.contains(e.target) && !e.target.closest('.sMore')) stdCloseSpell();
}, true);
addEventListener('keydown', e => { if (e.key === 'Escape' && !spellPop.hidden) stdCloseSpell(); });

// La casella «competenza doppia» ha senso solo se c'è la competenza semplice.
function stdBindExpertise(root, s) {
  root.addEventListener('change', e => {
    const el = e.target;
    if (!el.dataset || !el.dataset.f) return;
    const k = el.dataset.f;
    if (k.startsWith('ke_') && el.checked) {
      const base = root.querySelector(`[data-f="kp_${k.slice(3)}"]`);
      if (base && !base.checked) { base.checked = true; s.f[base.dataset.f] = '1'; }
    }
    if (k.startsWith('kp_') && !el.checked) {
      const exp = root.querySelector(`[data-f="ke_${k.slice(3)}"]`);
      if (exp && exp.checked) { exp.checked = false; s.f[exp.dataset.f] = ''; }
    }
    recalc(root, s);
  });
}

// I valori calcolati compaiono anche come segnaposto dei campi scrivibili (es. il bonus di competenza).
var recalc = (prev => function (root, s) {
  prev(root, s);
  root.querySelectorAll('[data-ph]').forEach(i => { i.placeholder = sgn(calcValue(s, i.dataset.ph)); });
})(recalc);

// Le schede create con il vecchio modello avevano gli incantesimi in un'unica area per livello:
// la prima riga di ogni livello se li riprende, così non si perde niente.
function stdMigrate(s) {
  if (s.f._stdv) return;
  const take = (from, to) => { if (s.f[from] && !s.f[to]) s.f[to] = String(s.f[from]).replace(/\s*\n\s*/g, ' · ').slice(0, 300); };
  take('cantrips', 'sp0_0');
  for (let L = 1; L <= 9; L++) take('sp' + L, 'sp' + L + '_0');
  take('known', 'sp1_1');
  if (s.f.insp && !s.f.insp1) s.f.insp1 = '1';
  s.f._stdv = '2';
}

function stdSetup(win, root, s) {
  win._sZoom = 1;
  root.querySelector('.nameBox')?.remove();          // il nome sta già dentro la scheda
  root.querySelectorAll('[data-sname]').forEach(i => {
    i.value = s.name;
    i.addEventListener('input', () => {
      s.name = i.value;
      win._name.textContent = s.name;
      root.querySelectorAll('[data-sname]').forEach(o => { if (o !== i) o.value = s.name; });
      renderSheetList(); scheduleSheets();
    });
  });
  stdBindImages(root, s);
  stdBindAttacchi(root, s);
  stdBindLines(root, s);
  stdBindExpertise(root, s);
  schedaBindListe(root, s);
  stdBindPinch(win, root);
  root.addEventListener('click', e => {
    const b = e.target.closest('.sInfo');
    if (b) alert(b.title);                     // anche con il dito (il «title» col mouse si vede passandoci sopra)
  });
  root.addEventListener('click', e => {
    const z = e.target.closest('.sZoom');
    if (!z) return;
    stdZoom(win, z.dataset.z === '+' ? 1.15 : 1 / 1.15);
  });
  stdFit(win);
}
