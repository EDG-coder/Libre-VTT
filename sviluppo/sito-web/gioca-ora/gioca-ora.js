// «Gioca ora»: le partite a cui ci si è uniti da questo browser, un riquadro ciascuna (come «Mi unisco» nell'app).
// L'elenco lo scrive il tavolo (/gioca/, gioca-web.js) quando si entra in una partita e lo aggiorna con la
// miniatura dell'ultima scena vista; qui si legge, si aggiunge una partita col codice e si toglie dall'elenco.
// Sta solo in questo browser (localStorage): il sito non lo manda da nessuna parte.
(function () {
  const K = 'libre-web-partite', K_COD = 'libre-web-codice', K_LING = 'libre-lingua';
  const $ = id => document.getElementById(id);
  const ls = { get(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  let lingua = ls.get(K_LING);
  if (lingua !== 'it' && lingua !== 'en') lingua = /^it\b/i.test(navigator.language || '') ? 'it' : 'en';

  const EN = {
    'Home': 'Home', 'Scarica': 'Download', 'Gioca ora': 'Play now',
    'Le partite a cui ti sei unito da questo browser. Un tocco e sei dentro; puoi tenerne aperte più di una, ognuna nella sua scheda.': 'The games you joined from this browser. One tap and you are in; you can keep more than one open, each in its own tab.',
    'Non hai ancora partite salvate. Incolla qui sotto il codice del tuo master: da quel momento la ritrovi in questa pagina.': 'You have no saved games yet. Paste your GM\'s code below: from then on you will find the game on this page.',
    "Un'altra partita?": 'Another game?', 'Una partita': 'A game', 'Hai già una partita?': 'Already have a game?',
    'Incolla il codice che ti ha mandato il tuo master. Niente account e niente download: si entra come giocatore, direttamente dal browser, anche dal telefono.': 'Paste the code your GM sent you. No account and no download: you join as a player straight from the browser, even on a phone.',
    'Codice della partita': 'Game code', 'Incolla qui il codice del master': "Paste the GM's code here", 'Entra': 'Join',
    'Il master deve avere l\'app aperta con «Partita pubblica» accesa. Dal sito si gioca solo da giocatori: per condurre serve l\'app.': 'The GM must have the app open with «Public game» on. From the website you can only play as a player: to run a game you need the app.',
    'Le partite sono ricordate solo in questo browser, sul tuo dispositivo: il sito non le salva da nessuna parte.': 'Games are remembered only in this browser, on your device: the website does not store them anywhere.',
    'Il codice non va bene: è lungo 96 caratteri (64 quelli di prima), fatto di numeri e lettere da a a f.': 'The code is not right: it is 96 characters long (64 for older codes), made of digits and letters a to f.',
    'Campagna': 'Campaign', 'Giochi come {n}': 'You play as {n}', 'Ultimo ingresso: {q}': 'Last visit: {q}', 'Togli dall\'elenco': 'Remove from the list',
    'Togliere «{n}» dall\'elenco? Per rientrare servirà di nuovo il codice.': 'Remove «{n}» from the list? You will need the code again to rejoin.',
    'Apri la partita {n}': 'Open the game {n}', 'adesso': 'just now'
  };
  const t = (s, v) => { let r = lingua === 'en' ? (EN[s] || s) : s; if (v) for (const k in v) r = r.replace('{' + k + '}', v[k]); return r; };

  const HEX64 = /^[a-f0-9]{64}(?:[a-f0-9]{32})?$/;
  const MINI = /^data:image\/(?:jpeg|webp|png);base64,[A-Za-z0-9+/=]{20,90000}$/;
  const leggi = () => {
    try {
      const v = JSON.parse(ls.get(K) || '[]');
      return (Array.isArray(v) ? v : []).filter(e => e && typeof e.codice === 'string' && /^[a-f0-9]{64}$/.test(e.codice) && /^[a-f0-9]{64}(?:[a-f0-9]{32})?$/.test(String(e.intero || e.codice)))
        .sort((a, b) => (b.ultimo || 0) - (a.ultimo || 0));
    } catch { return []; }
  };
  const scrivi = v => ls.set(K, JSON.stringify(v.slice(0, 40)));

  function quando(ms) {
    if (!ms) return '';
    const g = Math.floor((Date.now() - ms) / 86400000);
    if (g <= 0) return Date.now() - ms < 3600000 ? t('adesso') : (lingua === 'en' ? 'today' : 'oggi');
    if (g === 1) return lingua === 'en' ? 'yesterday' : 'ieri';
    if (g < 30) return lingua === 'en' ? g + ' days ago' : g + ' giorni fa';
    try { return new Date(ms).toLocaleDateString(lingua === 'en' ? 'en' : 'it'); } catch { return ''; }
  }
  // l'indirizzo del tavolo: solo cifre esadecimali (il codice rifatto da un alfabeto fisso)
  const HEX = '0123456789abcdef';
  const pulito = c => Array.from(c, ch => HEX[HEX.indexOf(ch)]).join('');
  const via = e => '../gioca/?entra=1#' + pulito(e.intero || e.codice);

  function disegna() {
    const lista = leggi(), box = $('partite');
    box.replaceChildren(...lista.map(e => {
      const nome = e.nome || (t('Campagna') + ' ' + e.codice.slice(0, 6));
      const r = document.createElement('article'); r.className = 'partita';
      const a = document.createElement('a'); a.className = 'apri'; a.href = via(e);
      a.target = 'libre-' + e.codice.slice(0, 12); a.rel = 'noopener';     // la stessa partita si riapre nella stessa scheda, un'altra in una nuova
      a.setAttribute('aria-label', t('Apri la partita {n}', { n: nome }));
      const foto = document.createElement('div'); foto.className = 'foto';
      if (e.mini && MINI.test(e.mini)) foto.style.backgroundImage = 'url("' + e.mini + '")'; else { foto.textContent = '🧭'; foto.setAttribute('aria-hidden', 'true'); }
      const n = document.createElement('div'); n.className = 'nome'; n.textContent = nome; n.title = nome;
      a.append(foto, n);
      if (e.giocatore) { const c = document.createElement('div'); c.className = 'come'; c.textContent = t('Giochi come {n}', { n: e.giocatore }); a.append(c); }
      const q = document.createElement('div'); q.className = 'quando'; q.textContent = t('Ultimo ingresso: {q}', { q: quando(e.ultimo) }); a.append(q);
      const x = document.createElement('button'); x.type = 'button'; x.className = 'via'; x.textContent = '✕'; x.title = t('Togli dall\'elenco'); x.setAttribute('aria-label', t('Togli dall\'elenco'));
      x.onclick = () => { if (!confirm(t('Togliere «{n}» dall\'elenco? Per rientrare servirà di nuovo il codice.', { n: nome }))) return; scrivi(leggi().filter(z => z.codice !== e.codice)); disegna(); };
      r.append(a, x);
      return r;
    }));
    $('vuoto').hidden = lista.length > 0;
    $('nuovaTit').textContent = t(lista.length ? "Un'altra partita?" : 'Hai già una partita?');
  }

  function applica() {
    document.documentElement.lang = lingua;
    for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
    for (const el of document.querySelectorAll('[data-p]')) el.placeholder = t(el.dataset.p);
    const b = $('lingua'); b.textContent = lingua === 'en' ? 'IT' : 'EN'; b.setAttribute('aria-label', lingua === 'en' ? 'Italiano' : 'English');
    document.title = (lingua === 'en' ? 'Play now' : 'Gioca ora') + ' · LIBRE VTT';
    disegna();
  }
  $('lingua').addEventListener('click', () => { lingua = lingua === 'en' ? 'it' : 'en'; ls.set(K_LING, lingua); applica(); });

  // un codice incollato (anche dentro un link o un messaggio): si aggiunge all'elenco e si entra
  $('entra').addEventListener('submit', e => {
    e.preventDefault();
    const m = $('codice').value.toLowerCase().match(/[a-f0-9]{64}(?:[a-f0-9]{32})?/);
    if (!m || !HEX64.test(m[0])) { $('codiceErr').textContent = t('Il codice non va bene: è lungo 96 caratteri (64 quelli di prima), fatto di numeri e lettere da a a f.'); $('codice').focus(); return; }
    $('codiceErr').textContent = '';
    const intero = pulito(m[0]), codice = intero.slice(0, 64), v = leggi(), ex = v.find(z => z.codice === codice);
    if (ex) { ex.intero = intero; ex.ultimo = Date.now(); } else v.push({ codice, intero, ultimo: Date.now() });
    scrivi(v); ls.set(K_COD, intero);
    $('codice').value = '';
    location.assign(via({ codice, intero }));
  });
  applica();
})();
