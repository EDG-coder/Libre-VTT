// ---------- Movimento dei giocatori: indizio durante il trascinamento e «Scatta» ----------
// Il server decide al rilascio (muri non attraversabili, Velocità nelle scene di battaglia: game-server.js,
// controllaMovimento). Mentre il giocatore trascina, ogni tanto gli chiede «ci arrivo?»: se no, il
// segnalino si tinge di rosso con due parole sul perché. Niente errori durante il trascinamento: passare
// sopra un muro non è una colpa, conta dove lo lasci. I muri non arrivano mai al browser del giocatore.
// «Scatta» raddoppia la velocità per il turno (senza turni: per il prossimo movimento).
(function () {
  'use strict';
  const tr = window.tr || (s => s);
  const inRete = () => typeof NET !== 'undefined' && NET.on;
  const giocatore = () => inRete() && typeof isMaster === 'function' && !isMaster();

  let prova = null, n = 0, ultimaRisp = 0, nota = null;
  function etichetta(el, testo) {
    if (!nota) { nota = document.createElement('div'); nota.id = 'percorsoNota'; document.body.appendChild(nota); }
    if (!testo) { nota.hidden = true; return; }
    const r = el.getBoundingClientRect();
    nota.textContent = testo; nota.hidden = false;
    nota.style.transform = `translate(${Math.round(r.left + r.width / 2)}px, ${Math.round(r.bottom + 6)}px) translateX(-50%)`;
  }
  function pulisci() {
    if (prova) { prova.el.classList.remove('nonArrivi'); prova = null; }
    etichetta(null, '');
  }
  viewport.addEventListener('pointermove', () => {
    if (!giocatore() || typeof mode === 'undefined' || mode !== 'photo' || !activeEl) return;
    const el = activeEl, id = el.dataset.pid;
    if (!id || id === 'pending') return;
    const ora = performance.now();
    if (prova && prova.el === el && ora - prova.t < 220) { if (el.classList.contains('nonArrivi')) etichetta(el, nota && nota.textContent); return; }
    prova = { el, t: ora };
    intent('percorso.prova', { scene: cur.id, id, n: ++n, pos: { l: num(el, 'left'), t: num(el, 'top'), w: num(el, 'width'), h: num(el, 'height') } });
  });
  window.percorsoRisposta = m => {
    if (!prova || m.n < ultimaRisp) return;
    ultimaRisp = m.n;
    if (prova.el.dataset.pid !== m.id || typeof mode === 'undefined' || mode !== 'photo') return;
    prova.el.classList.toggle('nonArrivi', !m.ok);
    etichetta(prova.el, m.ok ? '' : tr(m.perche));
  };
  addEventListener('pointerup', () => setTimeout(pulisci, 0), true);
  addEventListener('pointercancel', () => setTimeout(pulisci, 0), true);

  // ---------- «Scatta» ----------
  const datiDi = el => {
    const sc = NET.world && (NET.world.scenes || []).find(s => s.id === (cur && cur.id));
    return sc && (sc.photos || []).find(p => p.id === el.dataset.pid);
  };
  const scattoAttivo = p => !!(p && p.scatta);
  window.scatta = function (el, on) {
    if (!inRete() || !el || !el.dataset.pid) return;
    intent('scatta', { scene: cur.id, id: el.dataset.pid, on });
    netSay(on ? tr('🏃 Scatto: velocità doppia per questo turno.') : tr('Scatto tolto.'));
  };
  if (typeof tokenMenu === 'function') {
    const prima = tokenMenu;
    tokenMenu = function (el) {                                      // eslint-disable-line no-global-assign
      const items = prima.apply(this, arguments);
      if (!inRete() || el._shape || (el.dataset.layer || 'tokens') !== 'tokens' || !el.dataset.pid) return items;
      if (giocatore() && typeof netCanMove === 'function' && !netCanMove(el)) return items;
      const on = scattoAttivo(datiDi(el));
      const i = items.indexOf('-');
      items.splice(i >= 0 ? i : 0, 0, { label: (on ? '✓ ' : '') + tr('🏃 Scatta (velocità doppia)'), fn: () => scatta(el, !on) });
      return items;
    };
  }
  // nella barra in cima alla scheda: lo scatto per i segnalini di quella scheda nella scena
  if (typeof openSheet === 'function') {
    const prima = openSheet;
    openSheet = function (id) {                                      // eslint-disable-line no-global-assign
      const w = prima.apply(this, arguments);
      const bar = w && w.querySelector(':scope > .sbody > .tiroBar');
      if (bar && !bar.querySelector('.scattaBtn')) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'scattaBtn soloRete'; b.textContent = tr('🏃 Scatta');
        b.title = tr('Velocità doppia per questo turno (senza turni: per il prossimo movimento)');
        b.addEventListener('click', () => {
          const miei = [...world.querySelectorAll('.photo')].filter(p => p.dataset.sheet === w.dataset.id && p.dataset.pid);
          if (!miei.length) { netSay(tr('Questa scheda non ha un segnalino nella scena.'), 'warn'); return; }
          const on = !miei.some(p => scattoAttivo(datiDi(p)));
          for (const p of miei) scatta(p, on);
        });
        bar.insertBefore(b, bar.querySelector('.livSu') || null);
      }
      return w;
    };
  }
})();
