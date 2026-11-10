// La pagina di presentazione: italiano o inglese (come il tavolo, ricordato in questo browser), il riquadro
// «Gioca ora» che porta al tavolo con il codice del master, e il sistema di chi guarda messo per primo.
(function () {
  const EN = {
    'Gioca ora': 'Play now',
    'Come funziona': 'How it works',
    'Scarica': 'Download',
    'Il tavolo da gioco virtuale libero: il master sul suo computer, i giocatori anche dal browser.': 'The free virtual tabletop: the GM on their computer, players right from the browser.',
    'Mappe, segnalini, nebbia di guerra, luce dinamica, schede collegate ai segnalini e dadi in chat. Gratis, senza account, senza pubblicità.': 'Maps, tokens, fog of war, dynamic lighting, sheets linked to tokens and dice in chat. Free, no account, no ads.',
    "Scarica l'app": 'Download the app',
    'Una sessione nel bosco: segnalini sulla griglia e dadi in chat': 'A session in the woods: tokens on the grid and dice in chat',
    'Gioca ora, senza installare niente': 'Play now, with nothing to install',
    'Incolla il codice che ti ha mandato il tuo master. Niente account e niente download: si entra come giocatore, direttamente dal browser, anche dal telefono.': 'Paste the code your GM sent you. No account and no download: you join as a player straight from the browser, even on a phone.',
    'Codice della partita': 'Game code',
    'Incolla qui il codice del master': "Paste the GM's code here",
    'Entra': 'Join',
    "Il master deve avere l'app aperta con «Partita pubblica» accesa. Dal sito si gioca solo da giocatori: per condurre serve l'app.": 'The GM needs the app open with “Public game” turned on. On the website you can only play as a player: running a game needs the app.',
    'Il codice non va bene: è lungo 96 caratteri (64 quelli di prima), fatto di numeri e lettere da a a f.': "That code isn't right: it is 96 characters long (64 for older codes), made of digits and the letters a to f.",
    'Nebbia e luce dinamica': 'Fog and dynamic lighting',
    'Muri, porte e finestre bloccano la vista: ogni giocatore vede solo quello che vede il suo personaggio, il master vede attraverso il velo.': 'Walls, doors and windows block sight: each player sees only what their character sees, while the GM sees through the veil.',
    'Schede e compendio': 'Sheets and compendium',
    'Schede collegate ai segnalini, tiri con un clic e un compendio con le regole SRD 5.1 e 5.2 (licenza Creative Commons), con segnalini già pronti.': 'Sheets linked to tokens, one-click rolls and a compendium with the SRD 5.1 and 5.2 rules (Creative Commons license), with ready-made tokens.',
    'I tuoi file restano tuoi': 'Your files stay yours',
    'La campagna sta sul computer del master, non su un server di qualcun altro. Si può esportare, copiare e portare dove si vuole.': "The campaign lives on the GM's computer, not on someone else's server. It can be exported, copied and taken anywhere.",
    'Libero e aperto': 'Free and open',
    'Il codice è pubblico con licenza AGPL: chiunque può leggerlo, migliorarlo e aggiungere plugin.': 'The code is public under the AGPL license: anyone can read it, improve it and add plugins.',
    'La cripta con la nebbia di guerra': 'The crypt with fog of war',
    'La nebbia di guerra: il master vede attraverso il velo.': 'Fog of war: the GM sees through the veil.',
    'La scheda di un goblin': 'A goblin sheet',
    'Le schede, collegate ai segnalini.': 'Sheets, linked to tokens.',
    'Il master apre la partita': 'The GM opens the game',
    "Scarica l'app, sceglie «Conduco io» e la campagna, e accende «Partita pubblica». L'app gli dà un codice.": 'They download the app, choose “I run the game” and the campaign, and turn on “Public game”. The app gives them a code.',
    'Manda il codice ai giocatori': 'They send the code to the players',
    "Su WhatsApp, Telegram, Discord, dove volete. Il codice resta lo stesso da una sessione all'altra, finché il master non lo cambia.": 'On WhatsApp, Telegram, Discord, wherever you like. The code stays the same from one session to the next until the GM changes it.',
    'I giocatori entrano': 'Players join',
    "Dal browser con «Gioca ora», oppure con l'app («Mi unisco») per il collegamento diretto. Senza il master collegato non si gioca.": 'From the browser with “Play now”, or with the app (“I join”) for a direct connection. Without the GM connected there is no game.',
    'Ultima versione:': 'Latest version:',
    'I file si scaricano direttamente da GitHub.': 'Files download directly from GitHub.',
    'Windows 10 e 11, 64 bit (Intel, AMD e ARM)': 'Windows 10 and 11, 64-bit (Intel, AMD and ARM)',
    "Scarica l'installatore (.exe)": 'Download the installer (.exe)',
    'In alternativa: Installa-LIBRE-VTT-Windows.cmd': 'Alternatively: Installa-LIBRE-VTT-Windows.cmd',
    'macOS 11 o più recente, Apple Silicon e Intel': 'macOS 11 or later, Apple Silicon and Intel',
    'Scarica LIBRE-VTT.dmg': 'Download LIBRE-VTT.dmg',
    'La prima volta: Impostazioni di Sistema › Privacy e sicurezza › Apri comunque.': 'The first time: System Settings › Privacy & Security › Open Anyway.',
    '64 bit: Intel, AMD, ARM e RISC-V': '64-bit: Intel, AMD, ARM and RISC-V',
    "Scarica l'installatore (.sh)": 'Download the installer (.sh)',
    'Poi: bash Installa-LIBRE-VTT-Linux.sh': 'Then: bash Installa-LIBRE-VTT-Linux.sh',
    'Android 7 o più recente, telefoni e tablet': 'Android 7 or later, phones and tablets',
    "Scarica l'APK (quasi tutti i telefoni)": 'Download the APK (almost all phones)',
    'Telefoni più vecchi: APK universale': 'Older phones: universal APK',
    'Per giocare basta il browser: «Gioca ora» qui sopra.': 'To play, the browser is enough: “Play now” above.',
    'App (.ipa, con Sideloadly o AltStore)': 'App (.ipa, with Sideloadly or AltStore)',
    'Progetto Xcode (.zip)': 'Xcode project (.zip)',
    "Dentro c'è già tutto, anche Node.js: non serve installare altro né avere permessi da amministratore.": 'Everything is included, even Node.js: nothing else to install and no administrator rights needed.',
    'Codice sorgente su GitHub': 'Source code on GitHub',
    'LIBRE VTT è software libero (AGPL-3.0).': 'LIBRE VTT is free software (AGPL-3.0).',
    'Codice e segnalazioni su GitHub': 'Code and issues on GitHub'
  };
  const $ = id => document.getElementById(id);
  const CHIAVE = 'libre-lingua';                     // la stessa del tavolo (web/js/base/i18n.js)
  let lingua = '';
  try { lingua = localStorage.getItem(CHIAVE) || ''; } catch {}
  if (lingua !== 'it' && lingua !== 'en') lingua = /^it\b/i.test(navigator.language || '') ? 'it' : 'en';
  const t = s => lingua === 'en' ? (EN[s] || s) : s;

  const titoli = { it: document.title, en: 'LIBRE VTT · free and open virtual tabletop' };
  function applica() {
    document.documentElement.lang = lingua;
    document.title = titoli[lingua];
    for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
    for (const el of document.querySelectorAll('[data-ta]')) el.alt = t(el.dataset.ta);
    for (const el of document.querySelectorAll('[data-p]')) el.placeholder = t(el.dataset.p);
    const b = $('lingua');
    b.textContent = lingua === 'en' ? 'IT' : 'EN';
    b.setAttribute('aria-label', lingua === 'en' ? 'Italiano' : 'English');
  }
  $('lingua').addEventListener('click', () => {
    lingua = lingua === 'en' ? 'it' : 'en';
    try { localStorage.setItem(CHIAVE, lingua); } catch {}
    applica();
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
    location.assign(new URL('gioca/#' + codice, location.href).href);
  });

  // il sistema di chi guarda per primo
  const ua = navigator.userAgent || '', piatt = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  const so = /android/i.test(ua) ? 'android' : /iphone|ipad|ipod/i.test(ua) || (/mac/i.test(piatt) && navigator.maxTouchPoints > 1) ? 'ios'
    : /win/i.test(piatt) ? 'windows' : /mac/i.test(piatt) ? 'mac' : /linux/i.test(piatt) ? 'linux' : '';
  const mio = so && document.querySelector('.sistemi [data-so="' + so + '"]');
  if (mio) { mio.classList.add('tuo'); mio.parentNode.prepend(mio); }
})();
