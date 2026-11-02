// Crea web/js/regole/manuale-srd.js dal compendio SRD 5.1 della repo: nomi inglese → italiano per tipo,
// classi degli incantesimi, nomi di tratti e privilegi. Si rilancia solo se cambia l'SRD.
//   node crea-dizionario.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const qui = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(qui, '../../../sistemi/dnd5e-2014/compendio/srd-5.1/voci');
const perTipo = {}, classi = {}, tratti = {}, nomi = {}, parole = {};
for (const f of fs.readdirSync(dir)) {
  for (const v of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) {
    // le parole inglesi dei testi dell'SRD: un piccolo dizionario per ricucire le parole spezzate dall'OCR
    for (const w of JSON.stringify(v).split(/[^A-Za-z’']+/)) { const k = w.toLowerCase().replace(/[’'](s|t|d|ll|re|ve|m)?$/, ''); if (k.length >= 2) parole[k] = (parole[k] || 0) + 1; }
    if (!v.en) continue;
    (perTipo[v.tipo] ||= {})[v.en.toLowerCase()] = v.nome;
    nomi[v.en] = 1;
    if (v.tipo === 'incantesimo' && v.classi && v.classi.length) classi[v.en.toLowerCase()] = v.classi;
    const metti = o => { if (o && o.en && o.nome && o.en !== o.nome) tratti[o.en.toLowerCase()] = o.nome; };
    for (const k of ['tratti', 'azioni', 'azioniBonus', 'reazioni', 'leggendarie', 'privilegi']) (v[k] || []).forEach(metti);
    for (const l of v.livelli || []) (l.privilegi || []).forEach(metti);
    for (const s of v.sottospecie || []) { (perTipo.sottospecie ||= {})[s.en.toLowerCase()] = s.nome; nomi[s.en] = 1; (s.tratti || []).forEach(metti); }
  }
}
// le condizioni hanno sempre lo stesso nome, anche fuori dall'SRD
const out = { perTipo, classi, tratti, nomi, parole: Object.keys(parole).filter(k => parole[k] >= 2 && /^[a-z]+$/.test(k)).join(' ') };
fs.writeFileSync(path.join(qui, '../../../web/js/regole/manuale-srd.js'), '// generato da crea-dizionario.mjs (SRD 5.1, CC-BY-4.0): non modificare a mano\n(function (r) { const D = ' + JSON.stringify(out) + ';\n  if (typeof module === "object" && module.exports) module.exports = D; else r.SRD_NOMI = D; })(typeof globalThis !== "undefined" ? globalThis : this);\n');
console.log('web/js/regole/manuale-srd.js:', Object.entries(perTipo).map(([k, v]) => k + ' ' + Object.keys(v).length).join(', '), '· tratti', Object.keys(tratti).length);
