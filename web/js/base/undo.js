// ---------- Annulla / ripeti (Cmd/Ctrl+Z, Cmd/Ctrl+Maiusc+Z o Ctrl+Y) ----------
// Vale per tutto quello che sta nelle scene: segnalini (aggiunti, spostati, cancellati, rinominati),
// scene aggiunte o tolte, sfondo, griglia, nebbia e disegni.
// Funziona a fotografie: ogni volta che la mappa si salva (dopo una pausa di 400 ms) si tiene una
// copia di com'era prima. Non tocca la vista (zoom e posizione restano dove sono) né la scena aperta.
// Solo chi conduce (o chi gioca da solo): ai giocatori arriva il mondo del master.
(function () {
  const MAX = 60;
  const indietro = [], avanti = [];
  let ultima = null, ripristino = false;

  // le scene senza la vista: spostare la mappa o fare zoom non è una modifica da annullare
  const foto = () => JSON.stringify(scenes.map(sc => ({ ...sc, view: undefined })));
  const posso = () => typeof isMaster !== 'function' || isMaster();
  const daAltri = () => typeof NET !== 'undefined' && NET.applying;

  // Una modifica è «mia» se la chiede questa pagina (scheduleBoardSave chiamato fuori da quando
  // arriva il mondo dal server); quelle arrivate dagli altri diventano solo il nuovo punto di partenza.
  let mia = false;
  const primaSched = window.scheduleBoardSave;
  window.scheduleBoardSave = function () {
    if (!ripristino && !daAltri()) mia = true;
    return primaSched.apply(this, arguments);
  };
  const prima = window.saveBoard;
  window.saveBoard = function (flush) {
    const r = prima(flush);
    if (!boardReady) return r;
    const ora = foto(), eraMia = mia;
    mia = false;
    if (ultima === null || ripristino || !eraMia) { ultima = ora; return r; }
    if (ora !== ultima) {
      indietro.push(ultima);
      if (indietro.length > MAX) indietro.shift();
      avanti.length = 0;
      ultima = ora;
    }
    return r;
  };

  // il punto di partenza: la mappa appena caricata, e ogni volta che arriva il mondo dal server
  const base = () => { if (boardReady && (!mia || ultima === null)) ultima = foto(); };
  const primaDopo = window.afterBoardLoad;
  window.afterBoardLoad = function () { const r = primaDopo && primaDopo.apply(this, arguments); mia = false; base(); return r; };
  if (typeof applyWorld === 'function') {
    const primaMondo = window.applyWorld;
    window.applyWorld = async function () { try { return await primaMondo.apply(this, arguments); } finally { base(); } };
  }

  async function vaiA(testo) {
    const viste = new Map(scenes.map(sc => [sc.id, sc.view]));
    const qui = cur && cur.id, v = { x: view.x, y: view.y, s: view.s };
    const nuove = JSON.parse(testo);
    for (const sc of nuove) sc.view = viste.get(sc.id) || null;
    ripristino = true;
    try {
      scenes = nuove;
      cur = null;                                    // showScene non deve rifotografare la scena vecchia
      const sc = scenes.find(s => s.id === qui) || scenes[0];
      await showScene(sc);
      if (sc.id === qui) { Object.assign(view, v); applyView(); }
      if (typeof fogApply === 'function') fogApply();
      if (typeof turniDisegna === 'function') turniDisegna();
      ultima = testo;
      clearTimeout(boardTimer);
      saveBoard();                                   // salva e (in rete) manda a tutti
    } finally { ripristino = false; }
  }
  async function annulla() {
    if (!indietro.length) return false;
    clearTimeout(boardTimer); if (boardTimer) saveBoard();     // prima la modifica che stava per salvarsi
    if (!indietro.length) return false;
    avanti.push(foto());
    await vaiA(indietro.pop());
    return true;
  }
  async function ripeti() {
    if (!avanti.length) return false;
    indietro.push(foto());
    await vaiA(avanti.pop());
    return true;
  }
  window.annullaMappa = annulla;
  window.ripetiMappa = ripeti;

  addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const t = e.target;
    if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;   // nei campi resta l'annulla del testo
    if (document.querySelector('dialog[open]')) return;
    const k = e.key.toLowerCase();
    const indietroK = k === 'z' && !e.shiftKey, avantiK = (k === 'z' && e.shiftKey) || (k === 'y' && e.ctrlKey && !e.metaKey);
    if (!indietroK && !avantiK) return;
    if (!posso() || !boardReady) return;
    e.preventDefault();
    (indietroK ? annulla() : ripeti()).then(ok => {
      if (!ok && typeof setStatus === 'function') setStatus(indietroK ? tr('Niente da annullare') : tr('Niente da ripetere'));
    });
  });
})();
