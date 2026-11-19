// «Gioca ora»: le partite a cui ci si è uniti da questo browser, come riquadri con la foto dell'ultima scena
// (l'elenco «Mi unisco» dell'app). Le voci le scrive il tavolo (gioca-web.js) in localStorage, «libre-web-unite»:
//   { <codice di 64 cifre>: { intero, nome, scena, foto (dato immagine piccolo), ultimo } }
// Un tocco su un riquadro porta al tavolo, che entra da solo se il nome è già noto.
(function () {
  const EN = window.PAGINA_EN || {};
  const $ = id => document.getElementById(id);
  const CHIAVE = 'libre-lingua', K_UNITE = 'libre-web-unite', K_CODICE = 'libre-web-codice';
  let lingua = window.LIBRE_LINGUA === 'en' ? 'en' : 'it';
  const t = (s, v) => { let r = lingua === 'en' ? (EN[s] || s) : s; if (v) for (const k in v) r = r.replace('{' + k + '}', v[k]); return r; };
  const ls = { get(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const HEX = '0123456789abcdef';

  const titoli = { it: document.title, en: 'Play now · LIBRE VTT' };
  function applica() {
    document.documentElement.lang = lingua;
    document.title = titoli[lingua];
    for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
    for (const el of document.querySelectorAll('[data-p]')) el.placeholder = t(el.dataset.p);
    const b = $('lingua');
    b.textContent = lingua === 'en' ? 'IT' : 'EN';
    b.setAttribute('aria-label', lingua === 'en' ? 'Italiano' : 'English');
    disegna();
  }
  $('lingua').addEventListener('click', () => { lingua = lingua === 'en' ? 'it' : 'en'; ls.set(CHIAVE, lingua); applica(); });

  function leggi() {
    let o = {};
    try { o = JSON.parse(ls.get(K_UNITE) || '{}') || {}; } catch {}
    return Object.values(o).filter(e => e && /^[a-f0-9]{64}$/.test(String(e.codice || ''))).sort((a, b) => (b.ultimo || 0) - (a.ultimo || 0));
  }
  function togli(codice) {
    let o = {};
    try { o = JSON.parse(ls.get(K_UNITE) || '{}') || {}; } catch {}
    delete o[codice];
    ls.set(K_UNITE, JSON.stringify(o));
    disegna();
  }
  // il codice rifatto carattere per carattere da un alfabeto fisso: nell'indirizzo finiscono solo cifre esadecimali
  const pulito = s => Array.from(String(s || ''), ch => HEX[HEX.indexOf(ch)]).join('');
  const vai = (intero, entra) => location.assign(new URL('../gioca/' + (entra ? '?entra=1' : '') + '#' + pulito(intero), location.href).href);

  function quando(ms) {
    if (!ms) return '';
    const g = Math.floor((Date.now() - ms) / 86400000);
    if (g <= 0) return t('oggi');
    if (g === 1) return t('ieri');
    return new Date(ms).toLocaleDateString(lingua === 'en' ? 'en' : 'it', { day: 'numeric', month: 'short', year: g > 300 ? 'numeric' : undefined });
  }
  function disegna() {
    const lista = leggi();
    $('vuoto').hidden = lista.length > 0;
    $('unite').replaceChildren(...lista.map(e => {
      const c = document.createElement('div'); c.className = 'unita';
      const b = document.createElement('button'); b.type = 'button'; b.className = 'apri';
      const foto = document.createElement('span'); foto.className = 'foto';
      if (/^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(e.foto || '')) foto.style.backgroundImage = 'url("' + e.foto + '")'; else foto.textContent = '🧭';
      const nome = document.createElement('span'); nome.className = 'nome';
      nome.textContent = e.nome || t('Partita') + ' ' + e.codice.slice(0, 6);
      const sotto = document.createElement('span'); sotto.className = 'stato';
      sotto.textContent = [e.scena ? t('Ultima scena: {s}', { s: e.scena }) : '', e.ultimo ? t('ultima volta {q}', { q: quando(e.ultimo) }) : ''].filter(Boolean).join(' · ');
      b.append(foto, nome, sotto);
      b.addEventListener('click', () => vai(e.intero || e.codice, true));
      const via = document.createElement('button'); via.type = 'button'; via.className = 'via'; via.textContent = '✕';
      via.title = via.ariaLabel = t('Togli dall\'elenco');
      via.addEventListener('click', () => { if (confirm(t('Togliere «{n}» dall\'elenco? Per rientrare servirà di nuovo il codice.', { n: nome.textContent }))) togli(e.codice); });
      c.append(b, via);
      return c;
    }));
  }

  $('nome').value = ls.get('uffa-name');
  $('entra').addEventListener('submit', ev => {
    ev.preventDefault();
    const m = $('codice').value.toLowerCase().match(/[a-f0-9]{64}(?:[a-f0-9]{32})?/);
    if (!m) { $('codiceErr').textContent = t('Il codice non va bene: è lungo 96 caratteri (64 quelli di prima), fatto di numeri e lettere da a a f.'); $('codice').focus(); return; }
    const nome = $('nome').value.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (nome.length >= 2) ls.set('uffa-name', nome);
    const intero = pulito(m[0]);
    ls.set(K_CODICE, intero);
    vai(intero, nome.length >= 2 || ls.get('uffa-name').length >= 2);
  });
  applica();
})();
