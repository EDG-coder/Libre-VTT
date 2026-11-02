#!/usr/bin/env node
// Da un manuale (PDF o .txt) al JSON di compendio di LIBRE VTT, dal terminale.
//   node manuale-a-json.mjs Manuale.pdf [--da 207 --a 289] [--tipo incantesimo] [--nome "Manuale del Giocatore"] [--lingua en|it] [-o uscita.json]
// Per i PDF serve pdf.js: una volta sola, in questa cartella,  npm install pdfjs-dist@4
// Con un .txt (testo già estratto) non serve niente.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const P = require('../../../web/js/regole/manuale-lettore.js'), SRD = require('../../../web/js/regole/manuale-srd.js'), PAROLE = require('../../../web/js/regole/manuale-parole.js');

const arg = process.argv.slice(2), opz = {}, file = [];
for (let i = 0; i < arg.length; i++) {
  const a = arg[i];
  if (a === '-o') opz.o = arg[++i];
  else if (a.startsWith('--')) opz[a.slice(2)] = arg[++i];
  else file.push(a);
}
if (!file.length) { console.error('Uso: node manuale-a-json.mjs Manuale.pdf|testo.txt [--da N] [--a N] [--tipo T] [--nome "…"] [--lingua en|it] [-o out.json]'); process.exit(1); }
const f = file[0], nome = opz.nome || path.basename(f).replace(/\.(pdf|txt)$/i, '');
let righe;
if (/\.pdf$/i.test(f)) {
  let pdfjs;
  try { pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs'); }
  catch { console.error('Per leggere i PDF dal terminale serve pdf.js: in questa cartella lancia  npm install pdfjs-dist@4\n(oppure usa «Importa da un manuale che possiedi» nel compendio del VTT).'); process.exit(1); }
  righe = await P.righeDaPdf(pdfjs, fs.readFileSync(f), { da: +opz.da || 1, a: +opz.a || 0, avanza: (n, t) => process.stderr.write(`\rpagina ${n}/${t}   `) });
  process.stderr.write('\n');
} else {
  righe = P.righeDaTesto(fs.readFileSync(f, 'utf8'));
}
const lingua = opz.lingua || (() => { const s = righe.slice(0, 3000).map(r => r.t).join(' ').toLowerCase(); return (s.match(/\b(il|della|che|una|per|sono|gli)\b/g) || []).length > (s.match(/\b(the|of|and|you|your|with)\b/g) || []).length ? 'it' : 'en'; })();
const { voci } = P.leggi(righe, { srd: SRD, parole: PAROLE, modo: opz.tipo || '' });
const out = P.pacchetto(voci, { srd: SRD, nome, lingua });
const dest = opz.o || nome.replace(/[^\w.-]+/g, '_') + '.json';
fs.writeFileSync(dest, JSON.stringify(out, null, 1));
const conta = Object.entries(out.voci).map(([k, v]) => `${v.length} ${k}`).join(', ');
console.error(`Fatto: ${dest} — ${conta || 'nessuna voce'}. In LIBRE VTT: Compendio → Pacchetti → Importa.`);
