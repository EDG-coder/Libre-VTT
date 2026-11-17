// La pagina di presentazione: italiano o inglese (come il tavolo, ricordato in questo browser), il riquadro
// «Gioca ora» che porta al tavolo con il codice del master, e il sistema di chi guarda messo per primo.
(function () {
  const EN = window.PAGINA_EN || {};
  const $ = id => document.getElementById(id);
  const BASE = window.LIBRE_BASE || '';               // «../» nelle pagine /it/ e /eng/
  const CHIAVE = 'libre-lingua';                     // la stessa del tavolo (web/js/base/i18n.js)
  let lingua = window.LIBRE_LINGUA || '';             // la decide lingua.js nel <head>, prima delle foto
  if (lingua !== 'it' && lingua !== 'en') { try { lingua = localStorage.getItem(CHIAVE) || ''; } catch {} }
  if (lingua !== 'it' && lingua !== 'en') lingua = /^it\b/i.test(navigator.language || '') ? 'it' : 'en';

  // Le foto del tavolo hanno una versione per lingua (data-foto = il nome, dall'elenco FOTO; «-en» per l'inglese).
  // Al cambio di lingua la foto nuova si scarica e si decodifica a parte, e solo quando è pronta prende il posto
  // della vecchia: non si vede mai una foto vuota o che si ricarica. Le altre si preparano in anticipo, con calma.
  const FOTO = ['bosco', 'cripta', 'scheda'];
  const pronte = new Map();
  const prepara = url => {
    if (!pronte.has(url)) { const im = new Image(); im.decoding = 'async'; im.src = url; pronte.set(url, (im.decode ? im.decode() : Promise.resolve()).catch(() => {})); }
    return pronte.get(url);
  };
  const fotoDi = (el, l) => { const nome = FOTO.find(f => f === el.dataset.foto); return nome ? `${BASE}immagini/${nome}${l === 'en' ? '-en' : ''}.webp` : null; };
  function foto() {
    for (const el of document.querySelectorAll('img[data-foto]')) {
      const voluta = fotoDi(el, lingua);
      if (!voluta || el.getAttribute('src') === voluta) continue;
      prepara(voluta).then(() => { if (fotoDi(el, lingua) === voluta) { el.src = voluta; el.dataset.lingua = lingua; } });
    }
  }
  addEventListener('load', () => {
    const dopo = window.requestIdleCallback || (f => setTimeout(f, 1500));
    dopo(() => { for (const el of document.querySelectorAll('img[data-foto]')) { const u = fotoDi(el, lingua === 'en' ? 'it' : 'en'); if (u) prepara(u); } });
  });
  const t = s => lingua === 'en' ? (EN[s] || s) : s;

  const titoli = { it: document.title, en: (window.PAGINA_META_EN || {}).titolo || document.title };
  function applica() {
    document.documentElement.lang = lingua;
    document.title = titoli[lingua];
    for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
    for (const el of document.querySelectorAll('[data-ta]')) el.alt = t(el.dataset.ta);
    for (const el of document.querySelectorAll('[data-p]')) el.placeholder = t(el.dataset.p);
    foto();
    const b = $('lingua');
    b.textContent = lingua === 'en' ? 'IT' : 'EN';
    b.setAttribute('aria-label', lingua === 'en' ? 'Italiano' : 'English');
  }
  // il pulsante porta a un altro indirizzo: /it/ o /eng/ (e ricorda la scelta per la pagina senza lingua)
  $('lingua').addEventListener('click', () => {
    const nuova = lingua === 'en' ? 'it' : 'en';
    try { localStorage.setItem(CHIAVE, nuova); } catch {}
    location.assign(new URL(BASE + (nuova === 'en' ? 'eng/' : 'it/'), location.href).href);
  });
  applica();

  // «Gioca ora»: al tavolo, con il codice (anche incollato dentro un link o un messaggio)
  try { const c = localStorage.getItem('libre-web-codice'); if (c) $('codice').value = c; } catch {}
  $('entra').addEventListener('submit', e => {
    e.preventDefault();
    const m = $('codice').value.toLowerCase().match(/[a-f0-9]{64}(?:[a-f0-9]{32})?/);
    if (!m) { $('codiceErr').textContent = t('Il codice non va bene: è lungo 96 caratteri (64 quelli di prima), fatto di numeri e lettere da a a f.'); $('codice').focus(); return; }
    // il codice rifatto carattere per carattere da un alfabeto fisso: nell'indirizzo finiscono solo cifre esadecimali
    const HEX = '0123456789abcdef', codice = Array.from(m[0], ch => HEX[HEX.indexOf(ch)]).join('');
    try { localStorage.setItem('libre-web-codice', codice); } catch {}
    location.assign(new URL(BASE + 'gioca/#' + codice, location.href).href);
  });

  // il sistema di chi guarda per primo
  const ua = navigator.userAgent || '', piatt = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  const so = /android/i.test(ua) ? 'android' : /iphone|ipad|ipod/i.test(ua) || (/mac/i.test(piatt) && navigator.maxTouchPoints > 1) ? 'ios'
    : /win/i.test(piatt) ? 'windows' : /mac/i.test(piatt) ? 'mac' : /linux/i.test(piatt) ? 'linux' : '';
  const mio = so && document.querySelector('.sistemi [data-so="' + so + '"]');
  if (mio) { mio.classList.add('tuo'); mio.parentNode.prepend(mio); }
})();
