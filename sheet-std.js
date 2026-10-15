// ---------- Modello «Standard»: la scheda italiana di D&D 5e, 3 pagine ----------
// Ogni campo sta esattamente dove sta sulla scheda di carta: le coordinate sono quelle
// del PDF originale (pagina A4 di 595.276 x 841.89 punti), con l'origine in alto a sinistra.
// Le cornici, gli ornamenti e le intestazioni disegnate sono invece originali di questo file.
//
// Si appoggia a sheets.js: usa le stesse convenzioni (data-f per i campi, data-c per i valori
// calcolati, data-r per i tiri, .stabs/.spage per le pagine), quindi bindSheet() funziona già.

const PG_W = 595.276, PG_H = 841.89;

// ---------- Mattoncini ----------
const px = n => +(+n).toFixed(2);
const at = (x, y, w, h) => `left:${px(x)}px;top:${px(y)}px` + (w != null ? `;width:${px(w)}px` : '') + (h != null ? `;height:${px(h)}px` : '');
const eh = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// riquadro con la didascalia in basso, come sulla scheda di carta
const box = (x, y, w, h, cap, cls = '') =>
  `<div class="sB ${cls}" style="${at(x, y, w, h)}">${cap ? `<span class="sCap">${cap}</span>` : ''}</div>`;
// etichetta libera: a = allineamento (l, c, r)
const lab = (t, x, y, w, a = 'c', cls = '') =>
  `<div class="sL ${cls}" style="${at(x, y, w)};text-align:${a === 'l' ? 'left' : a === 'r' ? 'right' : 'center'}">${t}</div>`;
// campo di testo / numero
const inp = (k, x, y, w, h, cls = '', type = 'text') =>
  `<input class="sF ${cls}" type="${type}" data-f="${k}" style="${at(x, y, w, h)}" autocomplete="off">`;
const nmb = (k, x, y, w, h, cls = '') => inp(k, x, y, w, h, cls, 'number');
// casella da spuntare: tonda o quadrata
const chk = (k, x, y, s = 8.5, cls = '') =>
  `<input class="sK ${cls}" type="checkbox" data-f="${k}" style="${at(x, y, s, s)}">`;
// valore calcolato: se ha un tiro diventa un pulsante
const out = (c, x, y, w, h, roll, cls = '') => roll
  ? `<button type="button" class="sO sRoll ${cls}" data-c="${c}" data-r="${roll}" style="${at(x, y, w, h)}"></button>`
  : `<output class="sO ${cls}" data-c="${c}" style="${at(x, y, w, h)}"></output>`;
// area di testo con il pulsante «manda in chat»
const txa = (k, x, y, w, h, cls = '') =>
  `<div class="sTa ${cls}" style="${at(x, y, w, h)}"><textarea data-f="${k}"></textarea>` +
  `<button type="button" class="sendRule" data-send="${k}" title="Manda questo testo in chat">💬</button></div>`;
// Riga di incantesimo: il titolo si scrive qui, la descrizione si apre con ▾.
// Il dado tira le espressioni [[...]] scritte nel titolo o nella descrizione.
const line = (k, x, y, w, h, ph = '') =>
  `<span class="sLine" style="${at(x, y, w, h)}">` +
  `<input type="text" data-f="${k}" placeholder="${ph}" autocomplete="off">` +
  `<button type="button" class="sMore" data-more="${k}" title="Scrivi la descrizione">▾</button>` +
  `<button type="button" class="sDie" data-die="${k}" title="Tira, oppure manda in chat">🎲</button></span>`;
const rep = (n, fn) => Array.from({ length: n }, (_, i) => fn(i)).join('');

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
const STD_AB = [['str', 'FORZA'], ['dex', 'DESTREZZA'], ['con', 'COSTITUZIONE'], ['int', 'INTELLIGENZA'], ['wis', 'SAGGEZZA'], ['cha', 'CARISMA']];
const COINS = [['mr', 'MR'], ['ma', 'MA'], ['me', 'ME'], ['mo', 'MO'], ['mp', 'MP']];
const SPELL_LINES = [8, 13, 13, 13, 9, 9, 9, 9, 7, 7];   // righe per livello, dai trucchetti al 9°

// ---------- Calcoli: aggiungo la competenza doppia (il pallino piccolo) ----------
const SK_AB = Object.fromEntries(SKILLS.map(x => [x[0], x[2]]));
const stdSkill = (s, k) => abMod(s, SK_AB[k]) + profB(s) * (s.f['ke_' + k] ? 2 : s.f['kp_' + k] ? 1 : 0);
var calcValue = (prev => function (s, key) {
  const [t, a] = key.split(':');
  if (t === 'skill') return stdSkill(s, a);
  if (t === 'pp') return 10 + stdSkill(s, 'perception');
  return prev(s, key);
})(calcValue);

// ======================= Pagina 1 =======================
function stdPage1() {
  let h = '';

  // --- testata ---
  h += box(24, 46, 206, 36, '', 'sBanner');
  h += `<input class="sF sBig" type="text" data-sname maxlength="40" style="${at(30, 52, 194, 22)}" autocomplete="off">`;
  h += lab('NOME PERSONAGGIO', 30, 74, 194, 'c', 'sTiny');
  h += box(256, 44, 312, 46, '', 'sBanner');
  h += inp('class', 264, 48, 106, 16) + inp('level', 375, 48, 86, 16) + inp('player', 468, 48, 90, 16);
  h += lab('CLASSE', 264, 65, 106, 'l', 'sTiny') + lab('LIVELLO', 375, 65, 86, 'l', 'sTiny') + lab('NOME GIOCATORE', 468, 65, 90, 'l', 'sTiny');
  h += inp('race', 264, 74, 107, 16) + inp('bg', 374, 74, 78, 16) + inp('align', 456, 74, 46, 16) + inp('sex', 509, 74, 45, 16);
  h += lab('RAZZA', 264, 91, 107, 'l', 'sTiny') + lab('BACKGROUND', 374, 91, 78, 'l', 'sTiny') + lab('ALLINEAMENTO', 456, 92, 46, 'l', 'sMicro') + lab('SESSO', 509, 92, 45, 'l', 'sMicro');

  // --- colonna 1: le sei caratteristiche ---
  h += box(28, 140, 62, 420, '', 'sCol');
  STD_AB.forEach(([k, nm], i) => {
    const y = 148 + i * 70;
    h += box(32, y, 54, 60, '', 'sShield');
    h += lab(nm, 32, y + 2, 54, 'c', 'sTiny sStrong');
    h += nmb(k, 35, y + 11, 48, 22, 'sScore');
    h += out('mod:' + k, 42, y + 40, 34, 16, 'mod:' + k, 'sOval');
  });

  // --- colonna 2: ispirazione, competenza, TS, abilità ---
  h += box(92, 132, 114, 30, '', 'sPanel');
  h += rep(4, i => chk('insp' + (i + 1), 96 + (i % 2) * 9.5, 137 + Math.floor(i / 2) * 9.5, 8.5, 'sSq'));
  h += lab('ISPIRAZIONE', 118, 142, 84, 'c', 'sHead');
  h += box(92, 166, 114, 28, '', 'sPanel');
  h += box(94, 168, 28, 21, '', 'sOvalFrame');
  h += `<input class="sF sScore" type="number" data-f="profb" data-ph="prof" style="${at(96, 170, 24, 17)}" title="Lascialo vuoto per calcolarlo dal livello" autocomplete="off">`;
  h += lab('BONUS DI COMPETENZA', 124, 172, 78, 'c', 'sTiny');

  h += box(92, 200, 114, 100, 'TIRI SALVEZZA', 'sPanel');
  STD_AB.forEach(([k, nm], i) => {
    const y = 209 + i * 13.3;
    h += chk('sp_' + k, 98, y + 1, 7.5) + out('save:' + k, 109, y, 20, 11, 'save:' + k, 'sVal');
    h += lab(nm[0] + nm.slice(1).toLowerCase(), 133, y + 0.5, 70, 'l', 'sSk');
  });

  h += box(92, 306, 114, 266, 'ABILITÀ', 'sPanel');
  STD_SK.forEach(([k, nm, ab], i) => {
    const y = 315 + i * 13.53;
    h += chk('ke_' + k, 95.5, y + 1.5, 5.5, 'sMini') + chk('kp_' + k, 102, y + 0.5, 7.5);
    h += out('skill:' + k, 110, y, 20, 11, 'skill:' + k, 'sVal');
    h += lab(`${nm} <i>(${ab})</i>`, 132, y + 0.5, 72, 'l', 'sSk');
  });
  h += box(28, 578, 178, 28, '', 'sPanel');
  h += out('pp', 32, 581, 22, 20, null, 'sOvalSm');
  h += lab('SAGGEZZA (PERCEZIONE) PASSIVA', 56, 586, 146, 'c', 'sMicro');

  // --- colonna 1-2 in basso: competenze, linguaggi, talenti ---
  h += box(28, 610, 178, 90, 'COMPETENZE', 'sPanel');
  h += lab('ARMATURA', 30, 615, 30, 'r', 'sNano');
  [['pa_l', 'Leggere', 63, 24], ['pa_m', 'Medie', 96, 24], ['pa_p', 'Pesanti', 129, 24], ['pa_s', 'Scudi', 160, 20]].forEach(([k, t, x, w]) => {
    h += chk(k, x, 614, 7.5) + lab(t, x + 9, 615, w, 'l', 'sNano');
  });
  h += lab('ARMI', 30, 626, 30, 'r', 'sNano');
  [['pw_s', 'Semplici', 63, 24], ['pw_g', 'Da guerra', 96, 28], ['pw_a', 'Altro', 129, 18]].forEach(([k, t, x, w]) => {
    h += chk(k, x, 625, 7.5) + lab(t, x + 9, 626, w, 'l', 'sNano');
  });
  h += inp('pw_other', 146, 623, 54, 11, 'sRule');
  h += inp('prof_text1', 34, 635, 168, 11, 'sRule') + inp('prof_text2', 34, 647, 168, 11, 'sRule');
  h += lab('STRUMENTI', 34, 660, 32, 'l', 'sNano');
  h += inp('tools1', 68, 659, 134, 11, 'sRule') + inp('tools2', 34, 671, 168, 11, 'sRule') + inp('tools3', 34, 683, 168, 11, 'sRule');

  h += box(28, 704, 178, 34, 'LINGUAGGI', 'sPanel');
  h += inp('langs1', 32, 707, 152, 11, 'sRule') + inp('langs2', 32, 718, 152, 11, 'sRule');
  h += box(28, 742, 178, 66, 'TALENTI', 'sPanel');
  h += txa('feats', 32, 746, 150, 52);

  // --- colonna 3: combattimento ---
  h += box(212, 132, 174, 240, '', 'sPanel');
  h += box(222, 142, 42, 42, '', 'sShield') + nmb('ac', 227, 148, 32, 29, 'sScore');
  h += lab('CA', 222, 178, 42, 'c', 'sNano');
  h += box(278, 150, 40, 34, '', 'sShieldSm') + nmb('actemp', 283, 155, 29, 23, 'sScore');
  h += lab('CA TEMP.', 276, 143, 44, 'c', 'sNano');
  h += box(330, 140, 48, 46, '', 'sBox') + out('init', 336, 145, 36, 33, 'init', 'sScore sRoll');
  h += lab('INIZIATIVA', 328, 178, 52, 'c', 'sNano');

  h += box(220, 204, 46, 48, '', 'sDrop') + nmb('hpmax', 225, 210, 34, 31, 'sScore');
  h += lab('PF MAX', 220, 244, 46, 'c', 'sNano');
  h += box(276, 198, 102, 24, '', 'sBox') + nmb('hp', 280, 203, 94, 15, 'sScore');
  h += lab('PF ATTUALI', 280, 190, 94, 'l', 'sTiny');
  h += box(276, 228, 102, 22, '', 'sBox') + nmb('hpt', 279, 232, 95, 14, 'sScore');
  h += lab('PF TEMPORANEI', 279, 221, 95, 'l', 'sTiny');

  h += box(222, 260, 44, 46, '', 'sBox') + inp('fatigue', 227, 266, 36, 33, 'sScore');
  h += lab('AFFATICAMENTO', 216, 300, 56, 'c', 'sNano');
  h += box(274, 260, 50, 46, '', 'sBox') + chk('darkv', 280, 263, 8) + lab('SCUROVISIONE', 289, 264, 36, 'l', 'sNano');
  h += inp('vision', 282, 275, 36, 25, 'sScore') + lab('VISIONE', 274, 300, 50, 'c', 'sNano');
  h += box(330, 260, 48, 46, '', 'sBox') + inp('speed', 337, 266, 36, 33, 'sScore');
  h += lab('VELOCITÀ', 330, 300, 48, 'c', 'sNano');

  h += box(220, 310, 76, 58, 'DADI VITA', 'sPanel');
  h += lab('DV', 226, 313, 20, 'c', 'sNano') + lab('TOTALI', 248, 313, 22, 'c', 'sNano') + lab('USATI', 270, 313, 22, 'c', 'sNano');
  h += inp('hd', 230, 320, 14, 13, 'sScore') + nmb('hdt', 251, 320, 14, 13, 'sScore') + nmb('hdu', 273, 320, 14, 13, 'sScore');
  h += inp('hd2', 230, 336, 14, 13, 'sScore') + nmb('hdt2', 251, 336, 14, 13, 'sScore') + nmb('hdu2', 273, 336, 14, 13, 'sScore');
  h += box(302, 310, 80, 58, 'TS CONTRO MORTE', 'sPanel');
  h += lab('SUCCESSI', 303, 320, 35, 'r', 'sNano') + rep(3, i => chk('ds' + (i + 1), 340 + i * 12.5, 319, 9.5));
  h += lab('FALLIMENTI', 302, 336, 36, 'r', 'sNano') + rep(3, i => chk('df' + (i + 1), 340 + i * 12.5, 335, 9.5));

  // attacchi
  h += box(212, 376, 174, 206, 'ATTACCHI & INCANTESIMI', 'sPanel');
  h += lab('ARMA', 218, 385, 60, 'c', 'sNano') + lab('BONUS ATT.', 281, 385, 28, 'c', 'sNano') + lab('DANNI / TIPO', 312, 385, 56, 'c', 'sNano');
  h += rep(6, i => {
    const y = 391.89 + i * 18.2;
    return inp('an' + i, 218, y, 60, 14, 'sCell') + nmb('ab' + i, 281, y, 28, 14, 'sCell') + inp('ad' + i, 312, y, 56, 14, 'sCell') +
      `<button type="button" class="sHit" data-r="atk:${i}" style="${at(370, y + 1)}" title="Tira per colpire">◎</button>` +
      `<button type="button" class="sHit sDmg" data-r="dmg:${i}" style="${at(378, y + 1)}" title="Tira i danni">◆</button>`;
  });
  h += lab('MUNIZIONI', 219, 502, 51, 'c', 'sMicro') + lab('Q.TÀ', 275, 502, 19, 'c', 'sMicro');
  h += rep(3, i => inp('am' + i + 'n', 219, 509.89 + i * 18, 51, 14, 'sCell') + nmb('am' + i + 'q', 275, 509.89 + i * 18, 19, 14, 'sCell'));
  h += box(300, 520, 82, 34, '', 'sBox');
  h += nmb('spcd', 306, 527, 31, 18, 'sScore') + nmb('spatk', 346, 527, 31, 18, 'sScore');
  h += lab('CD TS<br>INCANTESIMI', 299, 546, 40, 'c', 'sNano') + lab('BONUS ATT.<br>INCANTESIMI', 341, 546, 42, 'c', 'sNano');
  h += `<button type="button" class="sHit" data-r="spatk" style="${at(371, 507)}" title="Tira l'attacco con incantesimo">◎</button>`;

  // armatura + consumabili + monete + oggetti magici
  h += box(212, 588, 174, 220, 'EQUIPAGGIAMENTO', 'sPanel');
  h += lab('ARMATURA', 219, 593, 42, 'l', 'sNano') + chk('ar_dis', 264, 592, 7.5) + lab('SVANTAGGIO<br>FURTIVITÀ', 273, 590, 30, 'l', 'sNano');
  h += lab('CA', 306, 593, 16, 'c', 'sNano') + lab('DES MAX', 325, 593, 22, 'c', 'sNano') + lab('FOR', 349, 593, 16, 'c', 'sNano') + lab('SCUDO', 367, 593, 18, 'c', 'sNano');
  h += inp('ar_name', 219, 601, 82, 14, 'sCell') + nmb('ar_ca', 306, 601, 16, 14, 'sCell') + inp('ar_dexmax', 325, 601, 22, 14, 'sCell') + inp('ar_for', 349, 601, 16, 14, 'sCell') + inp('ar_shield', 367, 601, 18, 14, 'sCell');
  h += lab('CONSUMABILI', 265, 620, 75, 'c', 'sNano') + lab('Nr. USI', 348, 620, 32, 'c', 'sNano');
  h += rep(6, i => inp('cn' + i + 'n', 265, 628.89 + i * 18.2, 75, 14, 'sCell') + nmb('cn' + i + 'u', 348, 628.89 + i * 18.2, 32, 14, 'sCell'));
  h += rep(5, i => box(216, 618 + i * 23.5, 44, 21, '', 'sCoin') + lab(COINS[i][1], 218, 624 + i * 23.5, 15, 'c', 'sNano sStrong') + nmb(COINS[i][0], 235, 621 + i * 23.5, 23, 16, 'sScore'));
  h += lab('OGGETTI MAGICI ARMONIZZATI <i>(massimo 3)</i>', 216, 740, 166, 'c', 'sNano');
  h += rep(3, i => inp('mi' + i, 220, 748.89 + i * 17.5, 159, 14, 'sCell'));

  // --- colonna 4: follia, privilegi limitati, tratti razziali, privilegi di classe ---
  h += box(394, 132, 178, 40, '', 'sPanel');
  h += box(398, 137, 30, 28, '', 'sBox') + inp('madness', 401, 140, 24, 21, 'sScore');
  h += lab('LIVELLO DI FOLLIA', 432, 146, 80, 'c', 'sTiny');
  h += box(518, 133, 52, 38, '', 'sBox') + nmb('madcd', 524, 137, 40, 20, 'sScore');
  h += lab('CD PROVA ABILITÀ', 518, 159, 52, 'c', 'sNano');

  h += box(394, 176, 178, 138, 'PRIVILEGI & TRATTI LIMITATI', 'sPanel');
  h += lab('NOME', 405, 178, 81, 'l', 'sNano') + lab('RECUPERO', 491, 178, 29, 'c', 'sNano') + lab('TOTALE', 524, 178, 22, 'c', 'sNano') + lab('USI', 547, 178, 18, 'c', 'sNano');
  h += rep(6, i => {
    const y = 192.39 + i * 17.3;
    return inp('lf' + i + 'n', 405, y, 81, 16, 'sCell') +
      lab('RB', 493, y - 4.5, 9, 'c', 'sNano') + lab('RL', 500, y - 4.5, 9, 'c', 'sNano') + lab('AL', 507.5, y - 4.5, 10, 'c', 'sNano') +
      chk('lf' + i + 'b', 494.5, y + 5, 6.5) + chk('lf' + i + 'l', 501.5, y + 5, 6.5) + chk('lf' + i + 'a', 508.5, y + 5, 6.5) +
      nmb('lf' + i + 't', 527, y, 17, 16, 'sCell') + nmb('lf' + i + 'u', 548, y, 17, 16, 'sCell');
  });
  h += lab('RB: riposo breve · RL: riposo lungo · AL: alba', 396, 298, 174, 'c', 'sNano');

  h += box(394, 320, 178, 100, 'TRATTI RAZZIALI & PRIVILEGI DA BACKGROUND', 'sPanel');
  h += txa('racial', 400, 325, 166, 76);
  h += box(394, 426, 178, 382, 'PRIVILEGI DI CLASSE', 'sPanel');
  h += txa('classf', 400, 431, 166, 366);
  return h;
}

// ======================= Pagina 2 =======================
function stdPage2() {
  let h = '';
  h += box(24, 46, 232, 36, '', 'sBanner');
  h += `<input class="sF sBig" type="text" data-sname maxlength="40" style="${at(30, 52, 220, 22)}" autocomplete="off">`;
  h += lab('NOME PERSONAGGIO', 30, 74, 220, 'c', 'sTiny');
  h += box(250, 44, 318, 46, '', 'sBanner');
  [['age', 'ETÀ', 257, 108], ['height', 'ALTEZZA', 367, 92], ['weight', 'PESO', 462, 95]].forEach(([k, t, x, w]) => {
    h += inp(k, x, 50, w, 17) + lab(t, x, 68, w, 'l', 'sTiny');
  });
  [['eyes', 'OCCHI', 257, 108], ['skin', 'CARNAGIONE', 367, 92], ['hair', 'CAPELLI', 462, 95]].forEach(([k, t, x, w]) => {
    h += inp(k, x, 75, w, 17) + lab(t, x, 93, w, 'l', 'sTiny');
  });

  // ritratto + aspetto
  h += box(24, 122, 178, 240, 'ASPETTO DEL PERSONAGGIO', 'sPanel');
  h += `<div class="sImg" data-img="portrait" style="${at(28, 127, 169, 181)}"><span>Clic per scegliere un'immagine</span></div>`;
  h += txa('look', 28, 310, 169, 46);
  h += box(24, 370, 178, 438, 'TRATTI & PRIVILEGI AGGIUNTIVI', 'sPanel');
  h += txa('extra', 32, 376, 162, 424);

  // fazione
  h += box(208, 122, 184, 302, 'FAZIONE', 'sPanel');
  h += lab('NOME', 228, 146, 30, 'l', 'sMicro') + inp('faction', 228, 153, 142, 16, 'sCell');
  h += `<div class="sImg" data-img="symbol" style="${at(226, 172, 145, 117)}"><span>Clic per scegliere</span></div>`;
  h += lab('SIMBOLO', 226, 291, 145, 'c', 'sTiny');
  h += txa('faction_text', 214, 306, 171, 109);

  // personalità
  h += box(398, 122, 174, 302, '', 'sCol');
  [['traits', 'TRATTI CARATTERIALI', 142.89, 44], ['ideals', 'IDEALI', 206.89, 36], ['bonds', 'LEGAMI', 261.89, 36],
   ['flaws', 'DIFETTI', 316.89, 35], ['enemies', 'NEMICI', 370.89, 37]].forEach(([k, t, y, hh]) => {
    h += box(402, y - 4, 166, hh + 20, t, 'sPanel');
    h += txa(k, 405, y, 155, hh);
  });

  // inventario
  h += box(208, 432, 364, 376, '', 'sPanel');
  h += lab('INVENTARIO', 213, 799, 120, 'l', 'sTiny');
  h += lab('EQUIPAGGIAMENTO', 213, 440, 161, 'c', 'sMicro') + lab('PESO', 374, 440, 15, 'c', 'sNano');
  h += lab('EQUIPAGGIAMENTO', 390, 440, 160, 'c', 'sMicro') + lab('PESO', 551, 440, 15, 'c', 'sNano');
  h += rep(24, i => inp('iv' + i + 'n', 213, 454.89 + i * 14.6, 161, 13, 'sRule') + inp('iv' + i + 'w', 374, 454.89 + i * 14.6, 15, 13, 'sRule sNum'));
  h += rep(21, i => inp('iv' + (i + 24) + 'n', 390, 454.89 + i * 14.6, 160, 13, 'sRule') + inp('iv' + (i + 24) + 'w', 551, 454.89 + i * 14.6, 15, 13, 'sRule sNum'));
  h += lab('PESO TRASPORTATO Kg:', 392, 768, 128, 'r', 'sTiny sStrong') + out('wsum', 524, 762, 24, 19, null, 'sScore sBoxed');
  h += lab('PESO MASSIMO TRASPORTABILE Kg:', 366, 790, 154, 'r', 'sTiny sStrong') + out('wmax', 524, 784, 24, 19, null, 'sScore sBoxed');
  return h;
}

// ======================= Pagina 3 =======================
function stdPage3() {
  let h = '';
  h += box(24, 46, 248, 44, '', 'sBanner');
  h += inp('sc_class', 40, 52, 212, 24, 'sBig');
  h += lab('CLASSE DA INCANTATORE', 30, 76, 232, 'c', 'sTiny');
  h += box(264, 44, 304, 48, '', 'sBanner');
  [['sc_ab', 'CARATTERISTICA<br>DA INCANTATORE', 273, 68], ['spcd', 'CD TIRO SALVEZZA<br>INCANTESIMI', 373, 68], ['spatk', 'BONUS DI ATTACCO<br>INCANTESIMI', 477, 67]]
    .forEach(([k, t, x, w]) => { h += box(x - 4, 52, w + 8, 32, '', 'sBox') + inp(k, x, 56, w, 28, 'sScore') + lab(t, x - 6, 84, w + 12, 'c', 'sMicro'); });

  // tre colonne: 0-1-2 | 3-4-5 | 6-7-8-9
  const COLS = [
    { x: 24, w: 178, lx: 27, lw: 170, lvl: [0, 1, 2] },
    { x: 208, w: 180, lx: 213, lw: 170, lvl: [3, 4, 5] },
    { x: 392, w: 180, lx: 397, lw: 170, lvl: [6, 7, 8, 9] }
  ];
  // posizioni prese dal PDF: inizio di ogni blocco e inizio delle righe
  const BLOCK = {
    0: { top: 145, slots: null, first: 181.89 },
    1: { top: 318, slots: [47, 333.89, 98], first: 362.89 },
    2: { top: 561, slots: [46, 576.89, 98], first: 603.89 },
    3: { top: 140, slots: [233, 155.89, 285], first: 182.89 },
    4: { top: 379, slots: [233, 394.89, 284], first: 422.89 },
    5: { top: 619, slots: [233, 634.89, 284], first: 663.89 },
    6: { top: 139, slots: [418, 154.89, 469], first: 182.89 },
    7: { top: 320, slots: [417, 335.89, 468], first: 362.89 },
    8: { top: 501, slots: [418, 516.89, 469], first: 543.89 },
    9: { top: 649, slots: [417, 664.89, 468], first: 693.89 }
  };
  for (const col of COLS) {
    const last = col.lvl[col.lvl.length - 1], b = BLOCK[last];
    h += box(col.x, 134, col.w, 674, '', 'sCol');
    for (const L of col.lvl) {
      const bl = BLOCK[L], n = SPELL_LINES[L], end = bl.first + n * 15 + 2;
      h += box(col.lx, bl.top, col.lw, end - bl.top, '', 'sPanel');
      if (L === 0) {
        h += box(col.lx + 14, bl.top + 10, col.lw - 24, 26, '', 'sScroll');
        h += lab('0', col.lx + 4, bl.top + 14, 22, 'c', 'sLvl') + lab('TRUCCHETTI', col.lx + 30, bl.top + 16, col.lw - 50, 'c', 'sHead');
      } else {
        const sy = bl.slots[1], x0 = col.lx;
        h += lab('SLOT TOTALI', x0 + 50, sy - 11, 54, 'c', 'sMicro') + lab('SLOT SPESI', x0 + 110, sy - 11, 54, 'c', 'sMicro');
        h += box(x0 + 14, sy - 1, col.lw - 28, 23, '', 'sScroll');
        h += lab(String(L), x0 + 2, sy + 2, 22, 'c', 'sLvl');
        h += nmb('sl' + L + 't', x0 + 56, sy + 2, 42, 17, 'sScore') + nmb('sl' + L + 'u', x0 + 110, sy + 2, 54, 17, 'sScore');
      }
      h += rep(n, i => {
        const y = bl.first + i * 15;
        return (L ? chk('spk_' + L + '_' + i, col.lx, y + 3, 8) : '') + line('sp' + L + '_' + i, col.lx + (L ? 10 : 1), y, col.lw - (L ? 10 : 1), 14);
      });
    }
    if (col.lvl[0] === 1 || col.lvl[0] === 0) h += lab('INCANTESIMI CONOSCIUTI', -70, 480, 180, 'c', 'sVert');
  }
  return h;
}

// ======================= Montaggio ======================
function standardHtml() {
  const pages = [stdPage1(), stdPage2(), stdPage3()];
  return `<div class="stabs">
      <button type="button" class="on" data-pg="1">Scheda</button>
      <button type="button" data-pg="2">Personaggio</button>
      <button type="button" data-pg="3">Incantesimi</button>
      <span class="sZoomWrap"><button type="button" class="sZoom" data-z="-">−</button><button type="button" class="sZoom" data-z="+">＋</button></span>
    </div>` +
    pages.map((p, i) => `<div class="spage stdSheet" data-pg="${i + 1}"${i ? ' hidden' : ''}>
      <div class="sPaper"><div class="sPage">${p}</div></div></div>`).join('');
}

// ======================= Comportamenti in più ======================
// Scala la pagina A4 alla larghezza disponibile (e tiene conto dello zoom scelto a mano).
function stdFit(win) {
  const extra = win._sZoom || 1;
  win.querySelectorAll('.sPaper').forEach(paper => {
    const w = paper.clientWidth;
    if (!w) return;
    const k = (w / PG_W) * extra;
    paper.style.setProperty('--k', k);
    paper.style.height = PG_H * k + 'px';
  });
}
const stdObserver = typeof ResizeObserver === 'function'
  ? new ResizeObserver(es => es.forEach(e => { const w = e.target.closest('.sheetWin') || e.target; stdFit(w); }))
  : null;

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
  if (ms.length) { for (const m of ms) rollExpr(m[1], `${s.name} · ${m[2] || m[1]}`); return; }
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
<div id="spellPop" hidden>
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
  stdBindLines(root, s);
  stdBindExpertise(root, s);
  root.addEventListener('click', e => {
    const z = e.target.closest('.sZoom');
    if (!z) return;
    win._sZoom = clamp(win._sZoom * (z.dataset.z === '+' ? 1.15 : 1 / 1.15), 0.6, 3);
    stdFit(win);
  });
  if (stdObserver) root.querySelectorAll('.sPaper').forEach(p => stdObserver.observe(p));
  requestAnimationFrame(() => stdFit(win));
}
