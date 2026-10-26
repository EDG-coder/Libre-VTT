// ---------- Il ponte con l'app per Android e per iPhone/iPad ----------
// Sul computer non fa niente (LIBRE_NATIVO.disponibile = false). Dentro le app:
//   Android: l'app mette a disposizione l'oggetto «LibreAndroid» (invia, info)
//   iOS:     l'app ascolta i messaggi «libre» (window.webkit.messageHandlers.libre)
// e risponde chiamando LIBRE_NATIVO._risposta(id, dati). Quando cambia qualcosa del
// dispositivo (DeX acceso o spento, mouse o tastiera collegati, rotazione) chiama
// LIBRE_NATIVO._info({...}) e qui parte l'evento «libre-nativo».
//
// info: { piattaforma, dex, desktop, tablet, telefono, mouse, tastiera, versione }
//   dex      Samsung DeX (o un'altra modalità desktop di Android) è acceso
//   desktop  si usa come un computer: DeX, Chromebook, iPad con mouse e tastiera…
(function () {
  'use strict';
  if (window.LIBRE_NATIVO) return;
  var A = window.LibreAndroid;
  var I = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.libre;
  var attese = {}, prossimo = 1;

  function chiama(cmd, dati) {
    return new Promise(function (risolvi) {
      if (!A && !I) { risolvi(null); return; }
      var id = prossimo++;
      attese[id] = risolvi;
      var msg = Object.assign({ id: id, cmd: cmd }, dati || {});
      try {
        if (A) A.invia(JSON.stringify(msg)); else I.postMessage(JSON.stringify(msg));
      } catch (e) { delete attese[id]; risolvi(null); }
    });
  }

  var N = window.LIBRE_NATIVO = {
    disponibile: !!(A || I),
    piattaforma: A ? 'android' : I ? 'ios' : null,
    info: {},
    _risposta: function (id, dati) {
      var r = attese[id];
      if (r) { delete attese[id]; r(dati == null ? null : dati); }
    },
    _info: function (info) {
      N.info = info || {};
      try { dispatchEvent(new CustomEvent('libre-nativo', { detail: N.info })); } catch (e) {}
    },
    /** tipo: 'zip' | 'cartella'. Risponde { sorgente, nome } (copiato in USERDIR/importa) o null. */
    importa: function (tipo) { return chiama('importa', { tipo: tipo || 'zip' }); },
    /** Condivide (o salva) un file che sta nelle cartelle dell'app. */
    condividiFile: function (file, mime, nome) { return chiama('condividiFile', { file: file, mime: mime || 'application/octet-stream', nome: nome || '' }); },
    condividiTesto: function (testo, titolo) { return chiama('condividiTesto', { testo: String(testo), titolo: titolo || '' }); },
    vibra: function (ms) { return chiama('vibra', { ms: ms || 12 }); },
    schermoAcceso: function (si) { return chiama('schermoAcceso', { si: !!si }); },
    apriEsterno: function (url) { return chiama('apriEsterno', { url: String(url) }); },
    /** Salva un testo in un file scelto dall'utente. Android risponde { uri } (lo si può riscrivere dopo). */
    salvaFile: function (nome, testo, mime) { return chiama('salvaFile', { nome: String(nome), testo: String(testo), mime: mime || 'application/json' }); },
    /** Fa scegliere un file e ne restituisce { testo, nome } (e su Android { uri, scrivibile }). */
    apriFile: function () { return chiama('apriFile', {}); },
    /** Android: riscrive / rilegge un file scelto prima. */
    scriviFile: function (uri, testo) { return chiama('scriviFile', { uri: String(uri), testo: String(testo) }); },
    leggiFile: function (uri) { return chiama('leggiFile', { uri: String(uri) }); },
    /** Android: scarica l'APK con la rete di Android e apre l'installazione. */
    scaricaApk: function (url, nome, byte) { return chiama('scaricaApk', { url: String(url), nome: String(nome), byte: +byte || 0 }); },
    /** Android: installa un APK scaricato dall'avviatore (Android chiede conferma). */
    installaApk: function (file) { return chiama('installaApk', { file: String(file) }); }
  };

  // le informazioni iniziali: Android le dà subito, iOS le mette in pagina prima che parta
  try { if (A && A.info) N._info(JSON.parse(A.info())); } catch (e) {}
  if (window.__LIBRE_INFO__) N._info(window.__LIBRE_INFO__);
  if (N.disponibile) document.documentElement.classList.add('app-' + N.piattaforma);
})();
