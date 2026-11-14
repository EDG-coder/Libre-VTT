#!/usr/bin/env node
// Controlla che il codice che gira anche dentro le app per telefono non usi cose che il Node di
// nodejs-mobile non ha. Quel Node è compilato senza le tabelle Unicode (Intl):
//   - una regex scritta con \p{…} (es. /[\p{L}]/u) è un errore di sintassi già alla lettura del file,
//     Node si ferma e l'app si chiude all'avvio (è successo con la 3.10.0);
//   - Intl non esiste.
// Per le lettere di ogni lingua si usa new RegExp('\\p{L}', 'u') dentro un try, con un'alternativa
// (vedi server/server.js, NON_NOME). Uso: node sviluppo/strumenti/controlla-node-mobile.js
'use strict';
const fs = require('fs');
const path = require('path');

const RADICE = path.join(__dirname, '..', '..');
// le cartelle che finiscono nell'APK in assets/nodejs-project ed eseguite da Node (vedi build.gradle)
const CARTELLE = ['server', 'condiviso', 'sistemi', 'plugins-inclusi'];
const VIETATI = [
  { re: /(^|[^\\])\\[pP]\{/, cosa: 'regex con \\p{…} (scrivila con new RegExp dentro un try, vedi server.js)' },
  { re: /\bIntl\s*\./, cosa: 'Intl (non c\'è nel Node delle app)' },
];

function fileJs(dir, fuori = []) {
  if (!fs.existsSync(dir)) return fuori;
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) { if (d.name !== 'node_modules') fileJs(p, fuori); }
    else if (/\.(c|m)?js$/.test(d.name)) fuori.push(p);
  }
  return fuori;
}

// solo il codice: via le righe di commento e i commenti in fondo alla riga
const senzaCommenti = r => {
  const t = r.trim();
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return '';
  return r.replace(/\s\/\/\s.*$/, '');
};

const errori = [];
for (const c of CARTELLE) {
  for (const f of fileJs(path.join(RADICE, c))) {
    // il codice dei plugin che gira nel browser (client) non passa da Node
    if (c === 'plugins-inclusi' && /client/i.test(path.basename(f))) continue;
    fs.readFileSync(f, 'utf8').split('\n').forEach((riga, i) => {
      const codice = senzaCommenti(riga);
      for (const v of VIETATI) if (v.re.test(codice)) errori.push(`${path.relative(RADICE, f)}:${i + 1}: ${v.cosa}`);
    });
  }
}

if (errori.length) {
  console.error('Il Node delle app per telefono non regge queste righe:\n  ' + errori.join('\n  '));
  process.exit(1);
}
console.log('Codice per il Node delle app: tutto a posto.');
