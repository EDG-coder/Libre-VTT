// Tutorial guidato (nativo, non un plugin). Lo stesso file gira nella home (launcher.html) e al tavolo (index.html).
//
// Il percorso:
//   home     si parte dalla card «🎓 Tutorial guidato» della home (o dalla rotellina ⚙ › Tutorial): la home, poi
//            «Gioco da solo» e una campagna. Il tavolo si apre con &tut=guida (lo aggiunge urlTavolo, vedi param()).
//   tavolo   le cose di base del tavolo. Si va avanti solo facendo quello che chiede (spostare la vista, aprire i
//            dadi…); il resto dello schermo intanto è bloccato. Alla fine «Torna alla home» porta a /?tut=ritorno.
//   ritorno  di nuovo nella home, con la partita accesa: Apri il tavolo, Chiudi la partita, dove ritrovare il tutorial.
// Dopo la guida, al tavolo: la prima volta (da quando hai aperto l'app) che compare un pannello, una scheda o una
// finestra, un riquadro spiega tutte le sue funzioni, una alla volta, con una freccia sulla zona di cui parla.
// Al tavolo il tutorial sta in Impostazioni › Strumenti › 🎓 Tutorial (niente pulsanti sopra il tavolo).
//
// La home e il tavolo sono indirizzi diversi (porte diverse): ognuno tiene il suo stato in localStorage e si
// passano le informazioni con il parametro tut= nell'indirizzo. Niente va in rete e la partita non cambia.
(function () {
  'use strict';
  const PASSI = window.LIBRE_TUTORIAL_PASSI;
  if (!PASSI || window.LIBRE_TUTORIAL) return;
  const { HOME, RITORNO, TAVOLO, OVERVIEW, VIEWS, TESTI } = PASSI;
  const HOME_PAGINA = !!(document.currentScript && document.currentScript.dataset.pagina === 'home');   // launcher.html lo dice nel tag
  const Z = 2147483000;
  for (const v of VIEWS) for (const s of v.steps) { if (v.around && !s.around) s.around = v.around; if (v.before && !s.before) s.before = v.before; }
  const CAPITOLI = { home: HOME, tavolo: TAVOLO, ritorno: RITORNO };
  const ORDINE = ['home', 'tavolo', 'ritorno'];
  const SESSIONE = 'libre-tutorial-visti';
  // l'indirizzo si legge subito: il tavolo (net.js) lo ripulisce appena parte. Il resto aspetta che la pagina sia pronta.
  const QUERY = new URLSearchParams(location.search);

  // ---------- stato ----------
  const KEY = HOME_PAGINA ? 'libre-tutorial-home' : 'libre-tutorial-tavolo';
  function leggi() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
  function scrivi(m) { const v = { ...leggi(), ...m }; try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} return v; }
  // home:   { stato: 'nuovo' | 'home' | 'tavolo' | 'altavolo' | 'ritorno' | 'finita' | 'saltata', passo, spiega, mandaSpiega }
  // tavolo: { stato: 'nuovo' | 'tavolo' | 'finita' | 'saltata', passo, spento, spiegati: [] }
  const st = {
    get stato() { return leggi().stato || 'nuovo'; },
    get spento() { const s = leggi(); return HOME_PAGINA ? s.spiega === false : s.spento !== false; },   // al tavolo: spente finché qualcuno non le accende
    set spento(v) { scrivi(HOME_PAGINA ? { spiega: !v, mandaSpiega: true } : { spento: !!v }); },
    get spiegati() { return new Set(leggi().spiegati || []); },
    addSpiegato(id) { const s = this.spiegati; if (!s.has(id)) { s.add(id); scrivi({ spiegati: [...s] }); } }
  };
  function seenSession() { try { return new Set(JSON.parse(sessionStorage.getItem(SESSIONE) || '[]')); } catch { return new Set(); } }
  function markSeen(ids) {
    const s = seenSession();
    for (const id of ids) s.add(id);
    try { sessionStorage.setItem(SESSIONE, JSON.stringify([...s])); } catch {}
  }
  const introAttiva = () => !HOME_PAGINA && st.stato === 'tavolo';

  let root = null, raf = 0;
  let tour = null;            // { kind: 'intro' | 'view', cap, steps, i, enteredAt, done: Set, okAt, hist }
  let lastSig = '';
  let clicked = new Set();    // i selettori premuti mentre il passo aspetta un clic

  // ---------- la pagina ----------
  const touch = () => document.documentElement.classList.contains('ui-touch') || document.body.classList.contains('ui-touch')
    || (HOME_PAGINA && matchMedia('(pointer: coarse)').matches);
  function visible(el) {
    if (!el || !el.isConnected) return false;
    if (el.closest('[hidden]') || el.closest('dialog:not([open])')) return false;
    if (el.closest('.sect:not(.open) .sectBody')) return false;          // una sezione chiusa delle impostazioni
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05;
  }
  function find(sel) {
    if (!sel) return null;
    for (const s of [].concat(sel)) {
      let list = [];
      try { list = document.querySelectorAll(s); } catch { continue; }
      for (const el of list) if (visible(el) && !(root && root.contains(el))) return el;
    }
    return null;
  }
  const isVisible = sel => !!find(sel);
  function viewTransform() {
    const s = document.getElementById('stage');
    const m = s && /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/.exec(s.style.transform || '');
    return m ? { x: +m[1], y: +m[2], s: +m[3] } : null;
  }

  // ---------- i testi ----------
  const tr = (s, vars) => (window.LIBRE_I18N ? window.LIBRE_I18N.t(s, vars) : s);
  const ui = (k, vars) => tr(TESTI[k] || k, vars);
  function text(key) {
    const one = k => (TESTI[k] ? tr(TESTI[k]) : null);
    return (touch() && one(key + '.touch')) || one(key) || '';
  }
  function rich(el, s) {             // **grassetto** e a capo; mai HTML
    el.replaceChildren();
    String(s).split('\n').forEach((line, i) => {
      if (i) el.appendChild(document.createElement('br'));
      line.split(/(\*\*[^*]+\*\*)/).forEach(part => {
        if (/^\*\*[^*]+\*\*$/.test(part)) { const b = document.createElement('b'); b.textContent = part.slice(2, -2); el.appendChild(b); }
        else if (part) el.appendChild(document.createTextNode(part));
      });
    });
  }
  let toastT = 0;
  function notifica(msg) {
    let n = document.getElementById('tutToast');
    if (!n) { n = document.createElement('div'); n.id = 'tutToast'; n.dataset.noi18n = ''; n.setAttribute('role', 'status'); document.body.appendChild(n); }
    n.textContent = msg;
    n.style.zIndex = Z;
    n.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => n.classList.remove('on'), 4200);
  }

  // ---------- i passi ----------
  function stepOk(step) {
    if (!step) return false;
    if (step.only === 'touch' && !touch()) return false;
    if (step.only === 'mouse' && touch()) return false;
    if (step.need && !isVisible(step.need)) return false;
    return true;
  }
  function runBefore(step) {
    for (const b of step.before || []) {
      if (b.open) { const sec = document.querySelector(b.open); if (sec && !sec.classList.contains('open')) { const h = sec.querySelector('.sectHead'); if (h) h.click(); } continue; }
      if (b.scroll) { const s = document.querySelector(b.scroll); if (s) s.scrollIntoView({ block: 'center' }); continue; }
      if (b.show && !isVisible(b.show)) { const c = find(b.click) || document.querySelector(b.click); if (c) c.click(); }
      if (b.hide && isVisible(b.hide)) { const c = find(b.click) || document.querySelector(b.click); if (c) c.click(); }
    }
  }
  function doDone(step) {
    const d = step.do;
    if (!d) return true;
    if (tour.done.has(tour.i)) return true;
    if (d.click) return [].concat(d.click).some(s => clicked.has(s));
    if (d.visible) return isVisible(d.visible);
    if (d.hidden) {                                   // prima deve esserci stato (se no conterebbe come già fatto)
      if (isVisible(d.hidden)) { tour.visto = true; return false; }
      return !!tour.visto;
    }
    if (d.pan || d.zoom) {
      const v = viewTransform();
      if (!tour.view0) tour.view0 = v;                 // la vista non era ancora disegnata quando il passo è partito
      const a = tour.view0;
      if (!v || !a) return false;
      if (d.pan) return Math.hypot(v.x - a.x, v.y - a.y) > 12 && Math.abs(Math.log(v.s / a.s)) < 0.05;
      return Math.abs(Math.log(v.s / a.s)) > 0.12;
    }
    return false;
  }

  // ---------- i giri ----------
  function startTour(t) {
    tour = { i: 0, done: new Set(), hist: [], ...t };
    ensureRoot();
    enter(t.from || 0, 1);
    if (tour) loop();
  }
  function enter(i, dir) {
    // il primo passo che ha senso qui (salta quelli per altri schermi o altri ruoli)
    let pronto = -1;                                   // `need` si guarda dopo aver preparato (una volta sola: certi pulsanti aprono e chiudono)
    const ok = k => { const s = tour.steps[k]; if (s && s.need && s.before) { runBefore(s); pronto = k; } return stepOk(s); };
    while (i >= 0 && i < tour.steps.length && !ok(i)) i += dir;
    if (i < 0) i = tour.i;
    if (i >= tour.steps.length) return finish(true);
    if (dir > 0) tour.hist.push(i);
    else { while (tour.hist.length && tour.hist[tour.hist.length - 1] > i) tour.hist.pop(); if (tour.hist[tour.hist.length - 1] !== i) tour.hist.push(i); }
    tour.i = i;
    tour.enteredAt = performance.now();
    tour.okAt = 0;
    tour.cameBack = dir < 0;                           // tornato a un passo già fatto: aspetta Avanti
    tour.view0 = viewTransform();
    tour.visto = false;
    clicked = new Set();
    const step = tour.steps[i];
    if (pronto !== i) runBefore(step);
    if (tour.kind === 'intro') {
      if (HOME_PAGINA) {
        if (tour.cap === 'home') scrivi(step.segna ? { stato: 'tavolo', passo: 0 } : (st.stato === 'tavolo' ? {} : { stato: 'home', passo: i }));
        else scrivi({ stato: 'ritorno', passo: i });
      } else {
        scrivi({ stato: 'tavolo', passo: i });
        if (step.id) st.addSpiegato(step.id);
        for (const c of step.covers || []) st.addSpiegato(c);
      }
    }
    if (step.id) markSeen([step.id]);
    lastSig = '';
  }
  function next() {
    if (!tour) return;
    const step = tour.steps[tour.i];
    if (step && step.do && !doDone(step) && !fallbackOk()) return;
    tour.done.add(tour.i);
    enter(tour.i + 1, 1);
  }
  function prev() {
    if (!tour || tour.hist.length < 2) return;
    const i = tour.hist[tour.hist.length - 2];
    tour.done.add(i);                                  // si torna a un passo la cui azione è già fatta
    enter(i, -1);
  }
  function finish(completed) {
    const t = tour;
    tour = null;
    cancelAnimationFrame(raf); raf = 0;
    if (root) root.remove();
    if (!t) return;
    if (t.kind === 'intro' && completed) {
      if (HOME_PAGINA) {
        if (t.cap === 'ritorno') { const s = leggi(); scrivi({ stato: 'finita', passo: 0, spiega: s.spiega !== false }); aggiornaCard(); }
        // la parte della home finita: si prosegue al tavolo quando si apre (stato «tavolo» già scritto)
      } else {
        scrivi({ stato: 'finita', passo: 0, spento: false });
      }
    } else if (t.kind === 'view') {
      markSeen(t.steps.map(x => x.id).filter(Boolean));  // chiuso a metà: in questa sessione non si rispiega
    }
    if (!HOME_PAGINA) setTimeout(checkViews, 400);
  }
  function skipIntro() {
    if (HOME_PAGINA) { scrivi({ stato: 'saltata', passo: 0 }); aggiornaCard(); }
    else scrivi({ stato: 'saltata', passo: 0, spento: false });
    finish(false);
    notifica(ui('ui.saltata'));
  }
  function startIntro(cap, from) {
    const steps = CAPITOLI[cap];
    if (!steps) return;
    if (tour) finish(false);
    startTour({ kind: 'intro', cap, steps, from: from && from < steps.length ? from : 0 });
  }
  // un passo che aspetta un'azione il cui pulsante non c'è (un altro ruolo, il tavolo aperto senza la home…)
  // lascia andare avanti dopo un momento
  const fallbackOk = () => tour && performance.now() - tour.enteredAt > 1600 && !find(tour.steps[tour.i].el);

  // ---------- le spiegazioni quando compare qualcosa (solo al tavolo) ----------
  function pendingSteps(view, all) {
    const seen = seenSession(), told = st.spiegati;
    return view.steps.filter(s => s.id && stepOk(s) && (all || (!seen.has(s.id) && !told.has(s.id))) && (!s.el || find(s.el) || ((s.before || []).some(b => b.scroll) && document.querySelector([].concat(s.el)[0]))));
  }
  function checkViews() {
    if (HOME_PAGINA || tour || st.spento || introAttiva()) return;
    if (document.querySelector('#plgDotAsk, .plgGate, dialog.plgGate[open], .tutMenu')) return;
    for (const v of VIEWS) {
      if (!isVisible(v.when)) continue;
      const steps = pendingSteps(v, false);
      if (!steps.length) continue;
      // la prima volta si comincia dal titolo della vista
      const first = v.steps[0];
      const list = steps[0] === first || !first || seenSession().has(first.id) ? steps : [first, ...steps];
      startTour({ kind: 'view', steps: list });
      return;
    }
  }
  function explainNow() {
    if (tour) return;
    const steps = [];
    for (const v of VIEWS) if (isVisible(v.when)) steps.push(...pendingSteps(v, true));
    if (!steps.length) steps.push(...OVERVIEW.filter(s => stepOk(s) && (!s.el || find(s.el))));
    if (steps.length) startTour({ kind: 'view', steps });
    else notifica(ui('ui.niente'));
  }

  // ---------- il disegno ----------
  function ensureRoot() {
    if (!root) {
      root = document.createElement('div');
      root.id = 'tutGuida';
      root.dataset.noi18n = '';
      root.innerHTML = `
        <div class="tutBlk" data-b="t"></div><div class="tutBlk" data-b="b"></div><div class="tutBlk" data-b="l"></div><div class="tutBlk" data-b="r"></div>
        <div class="tutHole"></div><div class="tutRing"></div><div class="tutProbe"></div>
        <svg class="tutArrow" aria-hidden="true"><defs><marker id="tutHead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs><path class="tutLine" d="" marker-end="url(#tutHead)"/></svg>
        <div class="tutBox" role="dialog" aria-live="polite">
          <div class="tutHead"><span class="tutIc" aria-hidden="true">🎓</span><b class="tutTit"></b><span class="tutNum"></span></div>
          <div class="tutTxt"></div>
          <div class="tutTask"></div>
          <div class="tutConfirm" hidden><span></span><button type="button" class="tutYes"></button><button type="button" class="tutNo"></button></div>
          <div class="tutBtns">
            <button type="button" class="tutSkip"></button><span class="tutSp"></span>
            <button type="button" class="tutPrev"></button><button type="button" class="tutNext"></button>
          </div>
          <button type="button" class="tutOff"></button>
        </div>`;
      root.querySelector('.tutPrev').onclick = prev;
      root.querySelector('.tutNext').onclick = next;
      root.querySelector('.tutSkip').onclick = () => {
        if (tour && tour.kind === 'intro') askConfirm(ui('ui.saltaChiedi'), ui('ui.saltaSi'), skipIntro);
        else finish(false);
      };
      root.querySelector('.tutOff').onclick = () => askConfirm(ui('ui.spegniChiedi'), ui('ui.spegniSi'), () => { st.spento = true; finish(false); notifica(ui('ui.spento')); });
      root.querySelector('.tutNo').onclick = () => { root.querySelector('.tutConfirm').hidden = true; lastSig = ''; };
      // la pagina non deve reagire ai clic sulla guida (menu che si chiudono, la mappa che seleziona)
      for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'click', 'contextmenu', 'wheel', 'dblclick'])
        root.addEventListener(ev, e => { if (e.target.closest('.tutBox') || e.target.classList.contains('tutBlk') || e.target.classList.contains('tutHole')) e.stopPropagation(); }, { passive: ev !== 'contextmenu' });
      root.addEventListener('contextmenu', e => e.preventDefault());
    }
    return root;
  }
  function askConfirm(q, yes, fn) {
    const c = root.querySelector('.tutConfirm');
    rich(c.querySelector('span'), q);
    c.querySelector('.tutYes').textContent = yes;
    c.querySelector('.tutNo').textContent = ui('ui.no');
    c.querySelector('.tutYes').onclick = () => { c.hidden = true; fn(); };
    c.hidden = false;
    lastSig = '';
  }
  function mountPoint() {
    // un dialog modale rende inerte il resto della pagina: la guida va dentro, sopra tutto
    let modal = null;
    for (const d of document.querySelectorAll('dialog[open]')) { try { if (d.matches(':modal')) modal = d; } catch {} }
    return modal || document.body;
  }
  function loop() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { try { frame(); } catch (e) { console.error('[tutorial]', e); } if (tour) loop(); });
  }
  function frame() {
    if (!tour) return;
    const step = tour.steps[tour.i];
    if (!step) return finish(true);
    const mp = mountPoint();
    if (root.parentNode !== mp) mp.appendChild(root);
    const now = performance.now();

    // l'azione chiesta è fatta: al passo dopo, dopo un momento
    if (step.do && !tour.cameBack && doDone(step)) {
      if (!tour.okAt) tour.okAt = now;
      else if (now - tour.okAt > (step.do.pan || step.do.zoom ? 900 : 450)) { tour.done.add(tour.i); return enter(tour.i + 1, 1); }
    }
    const el = find(step.el);
    // una spiegazione la cui zona non è (più) sullo schermo: si salta, dopo una breve attesa per le animazioni
    if (step.el && !el && !step.do && now - tour.enteredAt > 700) { tour.hist.pop(); return enter(tour.i + 1, 1); }
    const W = innerWidth, H = innerHeight, pad = step.pad != null ? step.pad : 6;
    let r = null;
    if (el) {
      const b = el.getBoundingClientRect();
      r = { l: Math.max(0, b.left - pad), t: Math.max(0, b.top - pad), r: Math.min(W, b.right + pad), b: Math.min(H, b.bottom + pad) };
    }
    // il riquadro sta fuori da questa zona (il pannello intero), la freccia indica comunque la zona del passo
    let a = r;
    const aroundEl = r && find(step.around);
    if (aroundEl) {
      const b = aroundEl.getBoundingClientRect();
      a = { l: Math.max(0, Math.min(r.l, b.left - 4)), t: Math.max(0, Math.min(r.t, b.top - 4)), r: Math.min(W, Math.max(r.r, b.right + 4)), b: Math.min(H, Math.max(r.b, b.bottom + 4)) };
    }
    // montata dentro un dialog: le posizioni sono relative a lui se è trasformato; si corregge lo spostamento
    let ox = 0, oy = 0;
    if (root.parentNode !== document.body) {
      const pr = root.querySelector('.tutProbe').getBoundingClientRect();
      ox = pr.left; oy = pr.top;
    }
    const waiting = step.do && !doDone(step) && !fallbackOk();
    const sig = [tour.i, tour.kind, r && [r.l, r.t, r.r, r.b].map(Math.round).join(','), a && [a.l, a.t, a.r, a.b].map(Math.round).join(','), W, H, waiting, ox, oy, root.querySelector('.tutConfirm').hidden, touch()].join('|');
    if (sig === lastSig) return;
    lastSig = sig;

    root.style.zIndex = Z;
    root.dataset.passo = step.id || '';
    root.classList.toggle('tutDo', !!step.do);
    const blk = k => root.querySelector(`.tutBlk[data-b="${k}"]`);
    const place = (n, x, y, w, h) => { n.style.cssText = `left:${x - ox}px;top:${y - oy}px;width:${Math.max(0, w)}px;height:${Math.max(0, h)}px`; };
    const hole = root.querySelector('.tutHole'), ring = root.querySelector('.tutRing');
    if (r) {
      place(blk('t'), 0, 0, W, r.t);
      place(blk('b'), 0, r.b, W, H - r.b);
      place(blk('l'), 0, r.t, r.l, r.b - r.t);
      place(blk('r'), r.r, r.t, W - r.r, r.b - r.t);
      place(ring, r.l, r.t, r.r - r.l, r.b - r.t);
      ring.hidden = false;
      // solo spiegazione: neanche la zona evidenziata si preme; con un'azione da fare sì
      place(hole, r.l, r.t, r.r - r.l, r.b - r.t);
      hole.hidden = !!step.do;
    } else {
      place(blk('t'), 0, 0, W, H);
      for (const k of ['b', 'l', 'r']) place(blk(k), 0, 0, 0, 0);
      ring.hidden = true; hole.hidden = true;
    }

    // il riquadro
    const box = root.querySelector('.tutBox');
    const intro = tour.kind === 'intro';
    rich(box.querySelector('.tutTit'), text(step.id + '.t') || ui('ui.titolo'));
    rich(box.querySelector('.tutTxt'), text(step.id));
    const task = box.querySelector('.tutTask');
    const taskTxt = step.do ? (waiting ? text(step.id + '.do') : (fallbackOk() && !doDone(step) ? ui('ui.manca') : ui('ui.fatto'))) : '';
    rich(task, taskTxt || '');
    task.hidden = !taskTxt;
    task.classList.toggle('ok', !!step.do && !waiting);
    const pos = tour.hist.length, total = pos + tour.steps.slice(tour.i + 1).filter(stepOk).length;
    const parte = intro && (HOME_PAGINA || st.viaHome) ? ORDINE.indexOf(tour.cap) + 1 : 0;
    box.querySelector('.tutNum').textContent = parte ? ui('ui.capitolo', { n: parte, tot: ORDINE.length, p: pos, t: total }) : `${pos} / ${total}`;
    const prevB = box.querySelector('.tutPrev'), nextB = box.querySelector('.tutNext'), skipB = box.querySelector('.tutSkip'), offB = box.querySelector('.tutOff');
    prevB.textContent = '◀ ' + ui('ui.indietro');
    prevB.disabled = tour.hist.length < 2;
    const last = pos >= total;
    nextB.textContent = waiting ? ui('ui.aspetto') : last ? ui(intro && tour.cap === 'home' ? 'ui.continua' : 'ui.fine') : ui('ui.avanti') + ' ▶';
    nextB.disabled = !!waiting;
    nextB.hidden = !!step.hideNext;
    skipB.textContent = intro ? ui('ui.salta') : ui('ui.chiudi');
    offB.textContent = ui('ui.spegni');
    offB.hidden = intro || HOME_PAGINA;

    // dove va il riquadro: dal lato della zona con più spazio
    box.style.maxWidth = Math.min(380, W - 24) + 'px';
    box.style.left = '0px'; box.style.top = '0px';
    const bw = box.offsetWidth, bh = box.offsetHeight, gap = 46;
    let bx, by, side = null;
    if (!r) { bx = (W - bw) / 2; by = (H - bh) / 2; }
    else {
      const t = r;
      r = a;                                                           // si dispone intorno alla zona di riferimento
      const room = { bottom: H - r.b, top: r.t, right: W - r.r, left: r.l };
      const fits = { bottom: room.bottom > bh + gap + 8, top: room.top > bh + gap + 8, right: room.right > bw + gap + 8, left: room.left > bw + gap + 8 };
      side = ['right', 'left', 'bottom', 'top'].filter(k => fits[k]).sort((x, y) => room[y] - room[x])[0] || null;
      if (step.place && fits[step.place]) side = step.place;
      const cx = (r.l + r.r) / 2, cy = (r.t + r.b) / 2;
      if (side === 'bottom') { bx = cx - bw / 2; by = r.b + gap; }
      else if (side === 'top') { bx = cx - bw / 2; by = r.t - gap - bh; }
      else if (side === 'right') { bx = r.r + gap; by = cy - bh / 2; }
      else if (side === 'left') { bx = r.l - gap - bw; by = cy - bh / 2; }
      else {                                                           // la zona è (quasi) tutto lo schermo
        bx = (W - bw) / 2;
        by = r.b - r.t > H * 0.8 ? Math.max(12, H - bh - 90) : (r.t > H / 2 ? 16 : H - bh - 16);
      }
      if (side === 'left' || side === 'right') by = Math.max(t.t - 30, Math.min(by, t.b + 30 - bh));   // all'altezza della zona
      if (side === 'top' || side === 'bottom') bx = Math.max(t.l - 40, Math.min(bx, t.r + 40 - bw));
      r = t;
    }
    bx = Math.max(12, Math.min(W - bw - 12, bx)); by = Math.max(12, Math.min(H - bh - 12, by));
    box.style.left = (bx - ox) + 'px'; box.style.top = (by - oy) + 'px';

    // la freccia, dal riquadro alla zona
    const svg = root.querySelector('.tutArrow'), path = svg.querySelector('.tutLine');
    svg.style.cssText = `left:${-ox}px;top:${-oy}px;width:${W}px;height:${H}px`;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    if (r && side) {
      let x1, y1, x2, y2;
      const cx = (r.l + r.r) / 2, cy = (r.t + r.b) / 2;
      if (side === 'bottom') { x1 = Math.max(bx + 20, Math.min(bx + bw - 20, cx)); y1 = by - 2; x2 = Math.max(r.l + 4, Math.min(r.r - 4, x1)); y2 = r.b + 4; }
      else if (side === 'top') { x1 = Math.max(bx + 20, Math.min(bx + bw - 20, cx)); y1 = by + bh + 2; x2 = Math.max(r.l + 4, Math.min(r.r - 4, x1)); y2 = r.t - 4; }
      else if (side === 'right') { x1 = bx - 2; y1 = Math.max(by + 20, Math.min(by + bh - 20, cy)); x2 = r.r + 4; y2 = Math.max(r.t + 4, Math.min(r.b - 4, y1)); }
      else { x1 = bx + bw + 2; y1 = Math.max(by + 20, Math.min(by + bh - 20, cy)); x2 = r.l - 4; y2 = Math.max(r.t + 4, Math.min(r.b - 4, y1)); }
      const mx = (x1 + x2) / 2 + (side === 'top' || side === 'bottom' ? 18 : 0), my = (y1 + y2) / 2 + (side === 'left' || side === 'right' ? -18 : 0);
      path.setAttribute('d', `M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`);
      svg.removeAttribute('hidden');
    } else svg.setAttribute('hidden', '');

    // un passo che aspetta: il fuoco resta dove agisci; altrimenti lo prende Avanti
    if (!waiting && !nextB.hidden && !box.contains(document.activeElement) && !(document.activeElement && /input|textarea|select/i.test(document.activeElement.tagName))) {
      try { nextB.focus({ preventScroll: true }); } catch {}
    }
  }

  // ---------- ascoltatori ----------
  function onClick(e) {
    if (!tour || !e.isTrusted) return;
    const step = tour.steps[tour.i];
    if (!step || !step.do || !step.do.click) return;
    for (const s of [].concat(step.do.click)) {
      let hit = null;
      try { hit = e.target.closest && e.target.closest(s); } catch {}
      if (!hit) continue;
      clicked.add(s);
      // «Torna alla home» durante la guida: la home riprende con l'ultima parte
      if (!HOME_PAGINA && step.id === 'i.homeVai' && hit.href) {
        try { const u = new URL(hit.href); u.searchParams.set('tut', 'ritorno'); hit.href = u.href; } catch {}
        scrivi({ stato: 'finita', passo: 0, spento: false });
      }
    }
  }
  function onKey(e) {
    if (!tour || !root || !root.isConnected) return;
    const a = document.activeElement;
    const typing = a && (/^(input|textarea|select)$/i.test(a.tagName) || a.isContentEditable) && !root.contains(a);
    if (typing) return;
    const step = tour.steps[tour.i];
    if (e.key === 'ArrowRight' || (e.key === 'Enter' && root.contains(a))) { if (!step.hideNext && (!step.do || doDone(step) || fallbackOk())) next(); }
    else if (e.key === 'ArrowLeft') prev();
    else if (e.key === 'Escape') { if (tour.kind === 'intro') askConfirm(ui('ui.saltaChiedi'), ui('ui.saltaSi'), skipIntro); else finish(false); }
    else return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  // ---------- al tavolo: il menu in Impostazioni › Strumenti ----------
  function menu() {
    if (tour) finish(false);
    document.querySelectorAll('.tutMenu').forEach(m => m.remove());
    const items = [
      ['ui.menu.intro', () => { scrivi({ stato: 'tavolo', passo: 0, spento: false, viaHome: false }); chiudiLato(); startIntro('tavolo'); }],
      ['ui.menu.qui', () => { chiudiLato(); setTimeout(explainNow, 250); }],
      [st.spento ? 'ui.menu.accendi' : 'ui.menu.spegni', () => { st.spento = !st.spento; notifica(ui(st.spento ? 'ui.spento' : 'ui.acceso')); if (!st.spento) checkViews(); }],
      ['ui.menu.dimentica', () => { try { sessionStorage.removeItem(SESSIONE); } catch {} scrivi({ spiegati: [] }); notifica(ui('ui.dimenticato')); setTimeout(checkViews, 300); }]
    ];
    const box = document.createElement('div');
    box.className = 'tutMenu';
    box.dataset.noi18n = '';
    box.setAttribute('role', 'dialog');
    const h = document.createElement('b'); h.textContent = '🎓 ' + ui('ui.menu.titolo');
    box.appendChild(h);
    for (const [k, fn] of items) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = ui(k);
      b.onclick = () => { box.remove(); fn(); };
      box.appendChild(b);
    }
    const c = document.createElement('button'); c.type = 'button'; c.className = 'tutMenuX'; c.textContent = ui('ui.chiudi');
    c.onclick = () => box.remove();
    box.appendChild(c);
    box.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); box.remove(); } });
    box.style.zIndex = Z;
    mountPoint().appendChild(box);
    box.querySelector('button').focus();
  }
  // «spiegami quello che ho davanti» dal pannello di destra: si chiude, se no spiegherebbe solo le impostazioni
  function chiudiLato() { const t = document.getElementById('sideToggle'); if (t && isVisible('#side.open')) t.click(); }
  function bottoneTavolo() {
    const help = document.getElementById('helpOpen');
    if (!help || document.getElementById('tutImpBtn')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'tutImpBtn'; b.className = help.className || 'btn ghost';
    b.textContent = ui('ui.tavoloBottone');
    b.title = ui('ui.tavoloBottone.tip');
    b.dataset.noi18n = '';
    b.addEventListener('click', menu);
    help.after(b);
  }

  // ---------- nella home: la card e la sezione delle impostazioni ----------
  function aggiornaCard() {
    const c = document.getElementById('tutCard');
    if (!c) return;
    const s = st.stato;
    c.querySelector('.tutCardNuovo').hidden = s !== 'nuovo';
    c.querySelector('small').textContent = ui(s === 'finita' || s === 'saltata' ? 'ui.card.rifai' : 'ui.card.sotto');
  }
  function iniziaHome() {
    if (tour) finish(false);
    const dlg = document.getElementById('impostazioni');
    if (dlg && dlg.open) dlg.close();
    // con niente acceso si riparte dalla scelta (se si era dentro le campagne o il codice)
    const pronto = document.getElementById('boxPronto'), lavoro = document.getElementById('boxLavoro');
    if (typeof window.mostraSolo === 'function' && !isVisible('#boxPronto') && !isVisible('#boxLavoro') && pronto && lavoro) {
      try { window.mostraSolo('scelte'); } catch {}
    }
    const s = leggi();
    scrivi({ stato: 'home', passo: 0, spiega: s.spiega === false ? false : true, mandaSpiega: true });
    setTimeout(() => startIntro('home'), 60);
  }
  function home() {
    const scelte = document.getElementById('scelte');
    if (scelte && !document.getElementById('tutCard')) {
      const c = document.createElement('button');
      c.type = 'button'; c.id = 'tutCard'; c.className = 'card tutCard';
      c.dataset.noi18n = '';
      c.innerHTML = '<span class="ic" aria-hidden="true">🎓</span><span class="tutCardTesto"><b></b> <span class="tutCardNuovo"></span><small></small></span>';
      c.querySelector('b').textContent = ui('ui.card');
      c.querySelector('.tutCardNuovo').textContent = ui('ui.card.nuovo');
      c.setAttribute('aria-label', ui('ui.card'));
      c.addEventListener('click', iniziaHome);
      scelte.appendChild(c);
      aggiornaCard();
    }
    const avanzate = document.getElementById('impAvanzate');
    if (avanzate && !document.getElementById('tutImpSez')) {
      const sez = document.createElement('div');
      sez.id = 'tutImpSez';
      sez.dataset.noi18n = '';
      sez.innerHTML = '<h3></h3><button class="b" type="button" id="tutImpAvvia"></button>'
        + '<label class="spunta"><input type="checkbox" id="tutImpSpiega"> <span></span></label><p class="nota"></p>';
      sez.querySelector('h3').textContent = ui('ui.imp.titolo');
      sez.querySelector('#tutImpAvvia').textContent = ui('ui.imp.avvia');
      sez.querySelector('label span').textContent = ui('ui.imp.spiega');
      sez.querySelector('.nota').textContent = ui('ui.imp.nota');
      sez.querySelector('#tutImpAvvia').addEventListener('click', iniziaHome);
      const cb = sez.querySelector('#tutImpSpiega');
      cb.addEventListener('change', () => { st.spento = !cb.checked; });
      document.getElementById('ingranaggio')?.addEventListener('click', () => { cb.checked = !st.spento; });
      cb.checked = !st.spento;
      avanzate.before(sez);
    }
    // i testi messi da qui non passano dalla traduzione automatica: si rifanno quando cambia la lingua
    addEventListener('lingua', () => {
      document.getElementById('tutCard')?.remove();
      document.getElementById('tutImpSez')?.remove();
      home.rifai = true;
      home();
    });
    if (home.rifai) return;
    if (QUERY.get('tut') === 'ritorno') {
      const q = new URLSearchParams(location.search);
      q.delete('tut');
      try { history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); } catch {}
      setTimeout(() => startIntro('ritorno'), 900);           // la home deve prima mostrare la partita accesa
    } else if (st.stato === 'home') setTimeout(() => startIntro('home', leggi().passo), 900);
    else if (st.stato === 'ritorno') setTimeout(() => startIntro('ritorno', leggi().passo), 900);
  }
  // Quello che la home aggiunge all'indirizzo del tavolo (vedi urlTavolo in launcher.html).
  function param() {
    if (!HOME_PAGINA) return '';
    const s = leggi();
    if (s.stato === 'tavolo') { scrivi({ stato: 'altavolo', mandaSpiega: false }); return '&tut=guida'; }
    if (s.mandaSpiega && s.spiega !== undefined) { scrivi({ mandaSpiega: false }); return '&tut=' + (s.spiega ? 'si' : 'no'); }
    return '';
  }

  // ---------- al tavolo ----------
  function tavolo() {
    const tut = QUERY.get('tut');
    if (tut) {
      const q = new URLSearchParams(location.search);
      if (tut === 'guida') scrivi({ stato: 'tavolo', passo: 0, spento: false, viaHome: true });
      else if (tut === 'si') scrivi({ spento: false });
      else if (tut === 'no') scrivi({ spento: true });
      q.delete('tut');                                      // ricaricando la pagina non si ricomincia da capo
      try { history.replaceState(history.state, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); } catch {}
    }
    bottoneTavolo();
    addEventListener('lingua', () => { const b = document.getElementById('tutImpBtn'); if (b) { b.textContent = ui('ui.tavoloBottone'); b.title = ui('ui.tavoloBottone.tip'); } });
    setInterval(checkViews, 500);
    // la guida parte quando il tavolo si è disegnato
    if (st.stato === 'tavolo') setTimeout(() => { if (!tour && st.stato === 'tavolo') startIntro('tavolo', leggi().passo); }, 1200);
  }
  Object.defineProperty(st, 'viaHome', { get: () => !!leggi().viaHome });

  addEventListener('click', onClick, true);
  addEventListener('keydown', onKey, true);
  window.LIBRE_TUTORIAL = { param, inizia: () => (HOME_PAGINA ? iniziaHome() : startIntro('tavolo')), spiega: explainNow, menu };
  const via = () => (HOME_PAGINA ? home() : tavolo());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', via); else via();
})();
