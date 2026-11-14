// La lingua della pagina, decisa prima che si disegni (questo file sta nel <head>, senza defer): così chi
// legge in inglese vede subito le foto del tavolo in inglese, senza vederle cambiare dopo.
// Le foto con data-en hanno nell'src quella italiana; in inglese l'src si cambia appena l'<img> compare,
// prima del primo disegno della pagina. Il resto (testi e cambio di lingua col pulsante) lo fa pagina.js.
(function () {
  var l = '';
  try { l = localStorage.getItem('libre-lingua') || ''; } catch (e) {}
  if (l !== 'it' && l !== 'en') l = /^it\b/i.test(navigator.language || '') ? 'it' : 'en';
  window.LIBRE_LINGUA = l;
  document.documentElement.lang = l;
  if (l !== 'en' || typeof MutationObserver !== 'function') return;
  function inglese(img) {
    if (!img.getAttribute('data-en') || img.getAttribute('data-it')) return;
    img.setAttribute('data-it', img.getAttribute('src'));
    img.setAttribute('src', img.getAttribute('data-en'));
  }
  var mo = new MutationObserver(function (lista) {
    for (var i = 0; i < lista.length; i++) for (var j = 0; j < lista[i].addedNodes.length; j++) {
      var n = lista[i].addedNodes[j];
      if (n.nodeName === 'IMG') inglese(n);
      else if (n.querySelectorAll) { var dentro = n.querySelectorAll('img[data-en]'); for (var k = 0; k < dentro.length; k++) inglese(dentro[k]); }
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', function () {
    mo.disconnect();
    var tutte = document.querySelectorAll('img[data-en]');
    for (var i = 0; i < tutte.length; i++) inglese(tutte[i]);
  });
})();
