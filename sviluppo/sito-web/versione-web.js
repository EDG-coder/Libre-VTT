// Solo nella versione sito web (costruisci.mjs lo mette prima di tutti gli altri script del tavolo).
// Sul sito non c'è il programma: le richieste al suo server (api/…, sistema/…, compendio/… della
// campagna) rispondono subito «non c'è», senza andare in rete, e il tavolo usa quello che ha già
// (salvataggio nel browser, sistema e compendio di base).
window.LIBRE_WEB = true;
window.LIBRE_WEB_VERSIONE = '__VERSIONE__';
(function () {
  const originale = window.fetch.bind(window);
  const SOLO_PROGRAMMA = /^(api|sistema|compendio)\//;
  window.fetch = function (risorsa, opzioni) {
    try {
      const u = new URL(typeof risorsa === 'string' || risorsa instanceof URL ? String(risorsa) : risorsa.url, location.href);
      const base = new URL('./', location.href);
      if (u.origin === base.origin && u.pathname.startsWith(base.pathname) && SOLO_PROGRAMMA.test(u.pathname.slice(base.pathname.length)))
        return Promise.resolve(new Response('', { status: 404, statusText: 'Versione web' }));
    } catch {}
    return originale(risorsa, opzioni);
  };
})();
