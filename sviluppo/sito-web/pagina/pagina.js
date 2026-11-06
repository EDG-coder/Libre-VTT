// La pagina di presentazione: italiano o inglese (come il tavolo, ricordato in questo browser)
// e il pulsante di download del sistema operativo di chi guarda messo in evidenza.
(function () {
  const EN = {
    'Come si gioca': 'How to play',
    'Scarica': 'Download',
    'Il tavolo da gioco virtuale libero, sul tuo computer o nel browser.': 'The free virtual tabletop, on your computer or in your browser.',
    'Mappe, segnalini, nebbia di guerra, luce dinamica, schede collegate ai segnalini e dadi in chat. Gratis, senza account, senza pubblicità.': 'Maps, tokens, fog of war, dynamic lighting, sheets linked to tokens and dice in chat. Free, no account, no ads.',
    'Gioca ora nel browser': 'Play now in your browser',
    "Scarica l'app": 'Download the app',
    "Nel browser si prova tutto da soli, senza installare niente. Per le partite in rete con gli amici serve l'app (presto anche dal browser).": 'In the browser you can try everything on your own, with nothing to install. Online games with friends need the app (soon from the browser too).',
    'Una sessione nel bosco: segnalini sulla griglia e dadi in chat': 'A session in the woods: tokens on the grid and dice in chat',
    'Nebbia e luce dinamica': 'Fog and dynamic lighting',
    'Muri, porte e finestre bloccano la vista: ogni giocatore vede solo quello che vede il suo personaggio, il master vede attraverso il velo.': 'Walls, doors and windows block sight: each player sees only what their character sees, while the GM sees through the veil.',
    'Schede e compendio': 'Sheets and compendium',
    'Schede collegate ai segnalini, tiri con un clic e un compendio con le regole SRD 5.1 e 5.2 (licenza Creative Commons), con segnalini già pronti.': 'Sheets linked to tokens, one-click rolls and a compendium with the SRD 5.1 and 5.2 rules (Creative Commons license), with ready-made tokens.',
    'I tuoi file restano tuoi': 'Your files stay yours',
    "Le campagne stanno sul tuo computer, non su un server di qualcun altro. Puoi esportarle, copiarle e portarle dove vuoi.": "Campaigns live on your computer, not on someone else's server. You can export them, copy them and take them anywhere.",
    'Libero e aperto': 'Free and open',
    'Il codice è pubblico con licenza AGPL: chiunque può leggerlo, migliorarlo e aggiungere plugin.': 'The code is public under the AGPL license: anyone can read it, improve it and add plugins.',
    'La cripta con la nebbia di guerra': 'The crypt with fog of war',
    'La nebbia di guerra: il master vede attraverso il velo.': 'Fog of war: the GM sees through the veil.',
    'La scheda di un goblin': 'A goblin sheet',
    'Le schede, collegate ai segnalini.': 'Sheets, linked to tokens.',
    'Tre modi di giocare': 'Three ways to play',
    'Nel browser': 'In the browser',
    'Apri la pagina e giochi. Ottimo per provare, preparare mappe o giocare tutti allo stesso schermo. Tutto resta salvato solo in quel browser.': 'Open the page and play. Great for trying it out, preparing maps or playing around one screen. Everything is saved only in that browser.',
    'Gioca ora': 'Play now',
    "Con l'app": 'With the app',
    'Il master conduce dal suo computer e i giocatori si uniscono da casa con un codice, anche dal telefono. Le campagne vanno nella cartella Documenti.': 'The GM runs the game from their computer and players join from home with a code, even from a phone. Campaigns go in the Documents folder.',
    'Con un server dedicato': 'With a dedicated server',
    'Per chi ha un computer sempre acceso o un piccolo server Linux: la partita resta aperta anche quando il master spegne il suo.': 'For anyone with an always-on computer or a small Linux server: the game stays open even when the GM turns theirs off.',
    'Come si fa': 'How to',
    'Ultima versione:': 'Latest version:',
    'Tutti i file e le novità della versione': "All files and what's new",
    'LIBRE VTT è software libero (AGPL-3.0).': 'LIBRE VTT is free software (AGPL-3.0).',
    'Codice e segnalazioni': 'Code and issues'
  };
  const CHIAVE = 'libre-lingua';                     // la stessa del tavolo (web/js/base/i18n.js)
  let lingua = 'it';
  try { lingua = localStorage.getItem(CHIAVE) || ''; } catch {}
  if (lingua !== 'it' && lingua !== 'en') lingua = /^it\b/i.test(navigator.language || '') ? 'it' : 'en';

  const titoli = { it: document.title, en: 'LIBRE VTT · free and open virtual tabletop' };
  function applica() {
    document.documentElement.lang = lingua;
    document.title = titoli[lingua];
    for (const el of document.querySelectorAll('[data-t]')) el.textContent = lingua === 'en' ? (EN[el.dataset.t] || el.dataset.t) : el.dataset.t;
    for (const el of document.querySelectorAll('[data-ta]')) el.alt = lingua === 'en' ? (EN[el.dataset.ta] || el.dataset.ta) : el.dataset.ta;
    const b = document.getElementById('lingua');
    b.textContent = lingua === 'en' ? 'IT' : 'EN';
    b.setAttribute('aria-label', lingua === 'en' ? 'Italiano' : 'English');
  }
  document.getElementById('lingua').addEventListener('click', () => {
    lingua = lingua === 'en' ? 'it' : 'en';
    try { localStorage.setItem(CHIAVE, lingua); } catch {}
    applica();
  });
  applica();

  // il file giusto per questo dispositivo (iPhone e iPad: l'app non è ancora negli store, c'è il browser)
  const ua = navigator.userAgent || '', piatt = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  const so = /android/i.test(ua) ? 'android' : /iphone|ipad|ipod/i.test(ua) || (/mac/i.test(piatt) && navigator.maxTouchPoints > 1) ? 'ios'
    : /win/i.test(piatt) ? 'windows' : /mac/i.test(piatt) ? 'mac' : /linux/i.test(piatt) ? 'linux' : '';
  const mio = so && document.querySelector('.file [data-so="' + so + '"]');
  if (mio) { mio.classList.add('tuo'); mio.parentNode.prepend(mio); }
})();
