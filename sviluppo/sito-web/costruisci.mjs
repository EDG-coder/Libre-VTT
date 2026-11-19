#!/usr/bin/env node
// Costruisce la versione sito web di LIBRE VTT in una cartella di file statici (di base _site/),
// pronta per Cloudflare Pages o GitHub Pages. Non serve nessun pacchetto: solo Node.
//
//   node sviluppo/sito-web/costruisci.mjs [cartella]      SITO_URL=https://… per robots, sitemap e canonical
//
//   /             la pagina di presentazione (sviluppo/sito-web/pagina/)
//   /gioca/       il tavolo (web/) con accanto condiviso/, sistemi/ e gli sfondi: gira tutto nel
//                 browser, senza programma, e salva solo in quel browser
//   /gioca-ora/  le partite a cui ti sei unito da questo browser (riquadri con la foto) e il codice per una nuova
//   /immagini/    le foto della pagina (docs/immagini/)
//
// Sul sito non vanno la home delle campagne (launcher.html) e il pannello del master (panel.html):
// parlano solo col programma. Il tavolo sa di essere sul sito da window.LIBRE_WEB.
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const RADICE = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(process.argv[2] || join(RADICE, '_site'));
// senza SITO_URL vale l'indirizzo di Cloudflare Pages (robots.txt e sitemap.xml ci sono sempre)
const URL_SITO = (process.env.SITO_URL || 'https://libre-vtt.pages.dev').replace(/\/+$/, '');
// l'indirizzo del relay (wss://…): lo leggono il tavolo del sito e l'app del master (relay.json)
const RELAY = (process.env.SITO_RELAY || '').trim().replace(/^https:/i, 'wss:').replace(/\/+$/, '');
if (RELAY && !/^wss:\/\/[\w.-]+(:\d+)?(\/[\w./-]*)?$/i.test(RELAY)) { console.error('SITO_RELAY non valido: ' + RELAY); process.exit(1); }
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
// e dopo tutti: l'ingresso da giocatore con il codice del master, e le immagini che arrivano dal relay
cpSync(join(RADICE, 'sviluppo/sito-web/gioca'), GIOCA, { recursive: true, filter: salta });
if (!html.includes('</body>')) throw new Error('web/index.html: manca </body>');
html = html.replace('</body>', '<script src="gioca-web.js"></script>\n</body>');
// l'icona della scheda: anche .ico (Google e i vecchi browser) e quella per la schermata Home dell'iPhone
html = html.replace('<link rel="icon" type="image/svg+xml" href="favicon.svg">',
  '<link rel="icon" href="../favicon.ico" sizes="32x32">\n<link rel="icon" type="image/svg+xml" href="favicon.svg">\n<link rel="apple-touch-icon" href="../apple-touch-icon.png">');
writeFileSync(tavolo, html);

// ---------- la pagina di presentazione ----------
cpSync(join(RADICE, 'sviluppo/sito-web/pagina'), OUT, { recursive: true, filter: salta });
cpSync(da('docs/immagini'), join(OUT, 'immagini'), { recursive: true, filter: salta });
// «/» sceglie la lingua da sola (quella ricordata o quella del browser); «/it/» e «/eng/» sono la stessa pagina
// ma ferma in una lingua, per mandare un link per forza italiano o inglese. Il pulsante IT/EN porta dall'una all'altra.
const modello = readFileSync(join(OUT, 'index.html'), 'utf8').replace('<!--VERSIONE-->', versione);
const finestra = {};
new Function('window', readFileSync(join(RADICE, 'sviluppo/sito-web/pagina/pagina-en.js'), 'utf8'))(finestra);
const EN = finestra.PAGINA_EN, META = finestra.PAGINA_META_EN;
const esc = t => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const dec = t => t.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
const meta = (h, riga, valore) => h.replace(riga, (m, a, b) => a + esc(valore) + b);
function pagina(lingua) {                       // '' (da sola) | 'it' | 'eng'
  let h = modello;
  const dir = lingua || '';
  const indirizzo = `${URL_SITO}/${dir ? dir + '/' : ''}`;
  h = h.replace('<!--SITO_URL-->\n<!--LINGUE-->',
    `<link rel="canonical" href="${indirizzo}">\n<meta property="og:url" content="${indirizzo}">\n` +
    `<link rel="alternate" hreflang="it" href="${URL_SITO}/it/">\n<link rel="alternate" hreflang="en" href="${URL_SITO}/eng/">\n` +
    `<link rel="alternate" hreflang="x-default" href="${URL_SITO}/">`)
    .replace('content="immagini/bosco.webp"', `content="${URL_SITO}/immagini/bosco.webp"`);
  if (!dir) return h;
  // nelle sottocartelle i file della pagina e il tavolo stanno un livello più su
  h = h.replace(/(\b(?:src|href|action)=")(pagina\.css|lingua\.js|pagina\.js|pagina-en\.js|favicon\.ico|favicon\.svg|apple-touch-icon\.png|gioca-ora\/|gioca\/|immagini\/)/g, '$1../$2')
    .replace('href="./"', `href="../${dir}/"`)
    .replaceAll('href="../gioca-ora/"', `href="../gioca-ora/?lang=${dir === 'eng' ? 'en' : 'it'}"`);
  h = h.replace('<html lang="it">', `<html lang="${dir === 'eng' ? 'en' : 'it'}">`);
  if (dir === 'eng') {
    // l'inglese già scritto nel file (chi indicizza e chi ha JavaScript spento lo vede); pagina.js poi lo conferma
    h = h.replace(/<title>[^<]*<\/title>/, `<title>${esc(META.titolo)}</title>`);
    h = meta(h, /(<meta name="description" content=")[^"]*(")/, META.descrizione);
    h = meta(h, /(<meta name="keywords" content=")[^"]*(")/, META.parole);
    h = meta(h, /(<meta property="og:title" content=")[^"]*(")/, META.ogTitolo);
    h = meta(h, /(<meta property="og:description" content=")[^"]*(")/, META.ogDescrizione);
    h = h.replace(/(<[^<>]*\bdata-t="([^"]*)"[^<>]*>)([^<]*)(<\/)/g, (m, apre, chiave, testo, chiude) => EN[dec(chiave)] ? apre + esc(EN[dec(chiave)]).replace(/&quot;/g, '"') + chiude : m);
    h = h.replace(/(\balt=")([^"]*)("[^<>]*\bdata-ta="([^"]*)")/g, (m, a, v, c, chiave) => EN[dec(chiave)] ? a + esc(EN[dec(chiave)]) + c : m);
    h = h.replace(/(\bsrc="\.\.\/immagini\/\w+)(\.webp"[^<>]*\bdata-foto=)/g, '$1-en$2');
    h = h.replace('id="lingua" type="button" aria-label="English">EN<', 'id="lingua" type="button" aria-label="Italiano">IT<');
  }
  return h;
}
writeFileSync(join(OUT, 'index.html'), pagina(''));
for (const d of ['it', 'eng']) { mkdirSync(join(OUT, d), { recursive: true }); writeFileSync(join(OUT, d, 'index.html'), pagina(d)); }

// ---------- per i motori di ricerca e per Cloudflare ----------
if (RELAY) writeFileSync(join(OUT, 'relay.json'), JSON.stringify({ relay: RELAY }) + '\n');
else console.warn('Attenzione: SITO_RELAY non c\'è, dal sito non si potrà entrare nelle partite.');
writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${URL_SITO}/sitemap.xml\n`);
// le pagine di presentazione (senza lingua, /it/ e /eng/); il tavolo /gioca/ è noindex
writeFileSync(join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  `  <url><loc>${URL_SITO}/</loc></url>\n  <url><loc>${URL_SITO}/gioca-ora/</loc></url>\n  <url><loc>${URL_SITO}/it/</loc></url>\n  <url><loc>${URL_SITO}/eng/</loc></url>\n</urlset>\n`);
// la cornice dove gira il codice dei plugin del master in sandbox: come la serve il programma (server/server.js),
// senza rete e senza origine, con solo il suo script
const sandboxHtml = readFileSync(da('web/plugin-sandbox.html'), 'utf8');
const sandboxHash = [...sandboxHtml.matchAll(/<script>([\s\S]*?)<\/script[^>]*>/gi)].map(x => `'sha256-${createHash('sha256').update(x[1], 'utf8').digest('base64')}'`).join(' ');
if (!sandboxHash) throw new Error('web/plugin-sandbox.html: non trovo lo script');
const sandboxCsp = `  Content-Security-Policy: default-src 'none'; script-src ${sandboxHash} blob:; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'; sandbox allow-scripts`;
// Cloudflare Pages legge _headers (GitHub Pages lo ignora): il tavolo non va indicizzato a pezzi,
// e i file non devono finire dentro le pagine di altri siti.
writeFileSync(join(OUT, '_headers'), [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  X-Frame-Options: SAMEORIGIN',
  '/gioca/*',
  '  X-Robots-Tag: noindex',
  '/gioca/plugin-sandbox.html',
  sandboxCsp,
  '  Cache-Control: no-store',
  '/gioca/plugin-sandbox',
  sandboxCsp,
  '  Cache-Control: no-store',
  '/relay.json',
  '  Access-Control-Allow-Origin: *',
  '  Cache-Control: public, max-age=300',
  '/gioca/sistemi/*',
  '  Cache-Control: public, max-age=3600',
  '/gioca/condiviso/token-srd/*',
  '  Cache-Control: public, max-age=86400',
  '/immagini/*',
  '  Cache-Control: public, max-age=86400',
  ''
].join('\n'));
// scorciatoie per chi scrive l'indirizzo a mano (Cloudflare Pages legge _redirects; GitHub Pages lo ignora)
writeFileSync(join(OUT, '_redirects'), '/en /eng/ 301\n/en/ /eng/ 301\n/ita /it/ 301\n/ita/ /it/ 301\n');
writeFileSync(join(OUT, '404.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>LIBRE VTT · pagina non trovata</title>
<link rel="icon" href="/favicon.ico" sizes="32x32"><link rel="icon" type="image/svg+xml" href="/favicon.svg">
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
