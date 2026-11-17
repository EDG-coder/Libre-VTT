// La lingua della pagina, decisa prima che si disegni (questo file sta nel <head>, senza defer): così chi
// legge in inglese vede subito le foto del tavolo in inglese, senza vederle cambiare dopo.
// Le foto con data-foto hanno nell'src quella italiana; in inglese l'src si cambia appena l'<img> compare,
// prima del primo disegno della pagina. Il resto (testi e cambio di lingua col pulsante) lo fa pagina.js.
(function () {
  var l = '', p = location.pathname;
  // /it/ e /eng/ hanno la lingua nell'indirizzo; la pagina senza lingua usa quella scelta o quella del browser
  window.LIBRE_BASE = /\/(it|eng)\/?(index\.html)?$/.test(p) ? '../' : '';
  if (/\/it\/?(index\.html)?$/.test(p)) l = 'it'; else if (/\/eng\/?(index\.html)?$/.test(p)) l = 'en';
  if (!l) { try { l = localStorage.getItem('libre-lingua') || ''; } catch (e) {} }
  if (l !== 'it' && l !== 'en') l = /^it\b/i.test(navigator.language || '') ? 'it' : 'en';
  window.LIBRE_LINGUA = l;
  document.documentElement.lang = l;
  if (l !== 'en' || typeof MutationObserver !== 'function') return;
  // il nome si prende dall'elenco qui sotto, mai dalla pagina: nell'src finisce solo un indirizzo scritto qui
  var FOTO = ['bosco', 'cripta', 'scheda'];
  function inglese(img) {
    var nome = null, chiesto = img.getAttribute('data-foto');
    for (var i = 0; i < FOTO.length; i++) if (FOTO[i] === chiesto) nome = FOTO[i];
    if (!nome || img.getAttribute('data-lingua') === 'en') return;
    img.setAttribute('data-lingua', 'en');
    img.setAttribute('src', window.LIBRE_BASE + 'immagini/' + nome + '-en.webp');
  }
  var mo = new MutationObserver(function (lista) {
    for (var i = 0; i < lista.length; i++) for (var j = 0; j < lista[i].addedNodes.length; j++) {
      var n = lista[i].addedNodes[j];
      if (n.nodeName === 'IMG') inglese(n);
      else if (n.querySelectorAll) { var dentro = n.querySelectorAll('img[data-foto]'); for (var k = 0; k < dentro.length; k++) inglese(dentro[k]); }
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', function () {
    mo.disconnect();
    var tutte = document.querySelectorAll('img[data-foto]');
    for (var i = 0; i < tutte.length; i++) inglese(tutte[i]);
  });
})();
