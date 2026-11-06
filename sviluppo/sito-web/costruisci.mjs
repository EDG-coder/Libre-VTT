#!/usr/bin/env node
// Costruisce la versione sito web di LIBRE VTT in una cartella di file statici (di base _site/),
// pronta per Cloudflare Pages o GitHub Pages. Non serve nessun pacchetto: solo Node.
//
//   node sviluppo/sito-web/costruisci.mjs [cartella]      SITO_URL=https://… per robots e sitemap
//
//   /             la pagina di presentazione (sviluppo/sito-web/pagina/)
//   /gioca/       il tavolo (web/) con accanto condiviso/, sistemi/ e gli sfondi: gira tutto nel
//                 browser, senza programma, e salva solo in quel browser
//   /immagini/    le foto della pagina (docs/immagini/)
//
// Sul sito non vanno la home delle campagne (launcher.html) e il pannello del master (panel.html):
// parlano solo col programma. Il tavolo sa di essere sul sito da window.LIBRE_WEB.
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(process.argv[2] || join(RADICE, '_site'));
const URL_SITO = (process.env.SITO_URL || '').replace(/\/+$/, '');
const MAX = 25 * 1024 * 1024;                       // Cloudflare Pages non accetta file più grandi

const versione = JSON.parse(readFileSync(join(RADICE, 'package.json'), 'utf8')).version;
const da = p => join(RADICE, p);
const salta = s => !/(^|[\\/])(\.DS_Store|Thumbs\.db|\.git\w*)$/.test(s);

// prima di cancellare la cartella di uscita: mai il progetto (o una sua cartella madre), mai una
// cartella piena di altro
const rel = relative(OUT, RADICE);
if (rel === '' || !rel.startsWith('..')) { console.error('Cartella di uscita non valida: ' + OUT); process.exit(1); }
if (existsSync(OUT) && readdirSync(OUT).length && !existsSync(join(OUT, 'gioca', 'js', 'base', 'versione-web.js'))) {
  console.error('La cartella ' + OUT + ' non è vuota e non è un sito già costruito: non la tocco.');
  process.exit(1);
}
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// ---------- il tavolo ----------
const GIOCA = join(OUT, 'gioca');
cpSync(da('web'), GIOCA, { recursive: true, filter: salta });
for (const f of ['launcher.html', 'panel.html']) rmSync(join(GIOCA, f), { force: true });
cpSync(da('condiviso'), join(GIOCA, 'condiviso'), { recursive: true, filter: salta });
cpSync(da('sistemi'), join(GIOCA, 'sistemi'), { recursive: true, filter: salta });
cpSync(da('assets/Sfondi'), join(GIOCA, 'assets/Sfondi'), { recursive: true, filter: salta });

// il segnale «sei sul sito», prima di tutti gli altri script
writeFileSync(join(GIOCA, 'js/base/versione-web.js'),
  readFileSync(join(RADICE, 'sviluppo/sito-web/versione-web.js'), 'utf8').replace('__VERSIONE__', versione.replace(/[^\w.-]/g, '')));
const tavolo = join(GIOCA, 'index.html');
let html = readFileSync(tavolo, 'utf8');
const primo = '<script src="js/plugins/base.js"></script>';
if (!html.includes(primo)) throw new Error('web/index.html: non trovo ' + primo + ' (va aggiornato costruisci.mjs)');
html = html.replace(primo, '<script src="js/base/versione-web.js"></script>\n' + primo);
writeFileSync(tavolo, html);

// ---------- la pagina di presentazione ----------
cpSync(join(RADICE, 'sviluppo/sito-web/pagina'), OUT, { recursive: true, filter: salta });
cpSync(da('docs/immagini'), join(OUT, 'immagini'), { recursive: true, filter: salta });
const pagina = join(OUT, 'index.html');
let p = readFileSync(pagina, 'utf8').replace('<!--VERSIONE-->', versione);
if (URL_SITO) p = p.replace('<!--SITO_URL-->', `<link rel="canonical" href="${URL_SITO}/">\n<meta property="og:url" content="${URL_SITO}/">`)
  .replace('content="immagini/bosco.webp"', `content="${URL_SITO}/immagini/bosco.webp"`);
writeFileSync(pagina, p.replace('<!--SITO_URL-->\n', ''));

// ---------- per i motori di ricerca e per Cloudflare ----------
writeFileSync(join(OUT, 'robots.txt'), 'User-agent: *\nAllow: /\n' + (URL_SITO ? `Sitemap: ${URL_SITO}/sitemap.xml\n` : ''));
if (URL_SITO) writeFileSync(join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  `  <url><loc>${URL_SITO}/</loc></url>\n  <url><loc>${URL_SITO}/gioca/</loc></url>\n</urlset>\n`);
// Cloudflare Pages legge _headers (GitHub Pages lo ignora): il tavolo non va indicizzato a pezzi,
// e i file non devono finire dentro le pagine di altri siti.
writeFileSync(join(OUT, '_headers'), [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  X-Frame-Options: SAMEORIGIN',
  '/gioca/*',
  '  X-Robots-Tag: noindex',
  '/gioca/sistemi/*',
  '  Cache-Control: public, max-age=3600',
  '/gioca/condiviso/token-srd/*',
  '  Cache-Control: public, max-age=86400',
  '/immagini/*',
  '  Cache-Control: public, max-age=86400',
  ''
].join('\n'));
writeFileSync(join(OUT, '404.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>LIBRE VTT · pagina non trovata</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#1b1f27;color:#e8ecf3;font:16px system-ui,sans-serif;text-align:center;padding:16px}a{color:#9b82ff}</style>
<div><h1>404</h1><p>Questa pagina non c'è. · This page doesn't exist.</p><p><a href="/">LIBRE VTT</a></p></div>\n`);
writeFileSync(join(OUT, '.nojekyll'), '');

// ---------- controlli ----------
let tot = 0, n = 0;
const grandi = [];
(function giro(d) {
  for (const x of readdirSync(d)) {
    const f = join(d, x), s = statSync(f);
    if (s.isDirectory()) giro(f);
    else { tot += s.size; n++; if (s.size > MAX) grandi.push(relative(OUT, f)); }
  }
})(OUT);
if (grandi.length) { console.error('File oltre 25 MiB (Cloudflare Pages non li accetta): ' + grandi.join(', ')); process.exit(1); }
if (n > 20000) { console.error(n + ' file: Cloudflare Pages ne accetta al massimo 20.000.'); process.exit(1); }
console.log(`Sito web LIBRE VTT ${versione} in ${OUT}: ${n} file, ${(tot / 1048576).toFixed(1)} MB.`);
