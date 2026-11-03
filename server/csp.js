// Le regole di sicurezza (Content-Security-Policy) delle nostre pagine.
// Gli script vengono solo dai nostri file (e, per la musica, da YouTube); gli script scritti dentro
// la pagina sono permessi solo se sono esattamente quelli che abbiamo scritto noi (con il loro hash).
// Nessun altro sito può mettere le nostre pagine dentro una sua cornice (frame-ancestors).
'use strict';
const crypto = require('crypto');

const cache = new Map();          // testo della pagina -> intestazione già calcolata

/** L'intestazione per una pagina HTML. `youtube`: la pagina può far partire il lettore di YouTube. */
function cspPagina(html, { youtube = false } = {}) {
  const testo = Buffer.isBuffer(html) ? html.toString('utf8') : String(html);
  const chiave = (youtube ? 'y' : 'n') + testo;
  if (cache.has(chiave)) return cache.get(chiave);
  const hash = [];
  for (const m of testo.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    hash.push(`'sha256-${crypto.createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
  }
  const yt = youtube ? ' https://www.youtube.com https://s.ytimg.com' : '';
  const v = [
    "default-src 'self'",
    `script-src 'self' 'wasm-unsafe-eval'${yt}${hash.length ? ' ' + hash.join(' ') : ''}`,
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    // immagini, suoni e collegamenti possono arrivare dal server di gioco locale e da indirizzi scelti da chi gioca
    "img-src * data: blob:",
    "media-src * data: blob:",
    "connect-src * ws://127.0.0.1:* ws://localhost:* data: blob:",
    "font-src 'self' data:",
    // 'self': la cornice senza origine dove gira il codice dei plugin in sandbox (plugin-sandbox.html)
    youtube ? "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com" : "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; ');
  if (cache.size > 20) cache.clear();
  cache.set(chiave, v);
  return v;
}

/** Le intestazioni da aggiungere a ogni pagina HTML. */
const intestazioniPagina = (html, opz) => ({
  'Content-Security-Policy': cspPagina(html, opz),
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff'
});

// Sul telefono anche le altre app possono parlare con 127.0.0.1: i server rispondono solo alla finestra
// di LIBRE VTT, che ha il cookie «libre_k» con il segreto avuto dall'app (lo mette l'avviatore, e vale
// per tutte le porte di 127.0.0.1). Sul computer il segreto non c'è e non si controlla niente.
const SEGRETO = String(process.env.LIBRE_SEGRETO || '');
delete process.env.LIBRE_SEGRETO;
function segretoOk(req) {
  if (!SEGRETO) return true;
  const ck = /(?:^|;\s*)libre_k=([^;]*)/.exec(req.headers.cookie || '');
  let dato = ''; try { dato = ck ? decodeURIComponent(ck[1]) : ''; } catch {}
  return dato.length === SEGRETO.length && crypto.timingSafeEqual(Buffer.from(dato), Buffer.from(SEGRETO));
}

module.exports = { cspPagina, intestazioniPagina, segretoOk };
