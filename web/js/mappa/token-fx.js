// Effetti sui segnalini (pallini colorati, X rossa) e le tre caselle che compaiono sopra il
// segnalino selezionato. Li tocca solo chi conduce; i giocatori vedono pallini e X.
//   dataset.fx      = "rosso,blu"   gli effetti accesi, nell'ordine in cui sono stati accesi
//   dataset.crossed = "1"           la X rossa
//   dataset.vals    = "12|3|"       le tre caselle (verde, rossa, blu); vuoto = niente
(function () {
  // ogni effetto ha anche una forma, così si distinguono pure senza i colori
  const EFFETTI = [
    ['rosso', 'Rosso', '#ff4d4d', 'cerchio'], ['giallo', 'Giallo', '#ffd23f', 'quadrato'],
    ['blu', 'Blu', '#3d7bff', 'rombo'], ['verde', 'Verde', '#2ee66b', 'triangolo'],
    ['magenta', 'Magenta', '#ff3df2', 'esagono'], ['ciano', 'Ciano', '#2fe0ff', 'stella']
  ];
  const PER_NOME = new Map(EFFETTI.map(e => [e[0], e]));
  const MAX_PALLINI = 4;                       // oltre: «+N»
  const CASELLE = [['g', 'Verde'], ['r', 'Rossa'], ['b', 'Blu']];
  const tr = window.tr || (s => s);
  const $ = id => document.getElementById(id);
  const conduco = () => typeof isMaster !== 'function' || isMaster();
  const eSegnalino = el => el && el.classList.contains('photo') && !el._shape && (el.dataset.layer || 'tokens') !== 'map';

  const leggiFx = el => (el.dataset.fx || '').split(',').filter(k => PER_NOME.has(k));
  const leggiVals = el => { const v = (el.dataset.vals || '').split('|'); return [0, 1, 2].map(i => v[i] === undefined || v[i] === '' ? null : +v[i]); };

  // ---------- sul segnalino ----------
  function disegnaFx(el) {
    let box = el.querySelector(':scope > .tfx'), x = el.querySelector(':scope > .tcross');
    const fx = leggiFx(el);
    if (fx.length) {
      if (!box) { box = document.createElement('div'); box.className = 'tfx'; el.appendChild(box); }
      const vis = fx.length > MAX_PALLINI ? fx.slice(0, MAX_PALLINI - 1) : fx;
      box.replaceChildren(...vis.map(k => {
        const [, nome, col, forma] = PER_NOME.get(k), d = document.createElement('span');
        d.className = 'tfxD ' + forma; d.style.setProperty('--c', col); d.title = tr(nome);
        return d;
      }));
      if (vis.length < fx.length) {
        const piu = document.createElement('span');
        piu.className = 'tfxPiu'; piu.textContent = '+' + (fx.length - vis.length);
        piu.title = fx.slice(vis.length).map(k => tr(PER_NOME.get(k)[1])).join(', ');
        box.append(piu);
      }
      box.title = fx.map(k => tr(PER_NOME.get(k)[1])).join(', ');
    } else if (box) box.remove();
    if (el.dataset.crossed) { if (!x) { x = document.createElement('div'); x.className = 'tcross'; el.appendChild(x); } }
    else if (x) x.remove();
  }
  // dai dati salvati (o arrivati dal server) al segnalino
  window.fxDaDati = function (el, p) {
    if (p.fx) el.dataset.fx = p.fx; else delete el.dataset.fx;
    if (p.crossed) el.dataset.crossed = '1'; else delete el.dataset.crossed;
    if (p.vals) el.dataset.vals = p.vals; else delete el.dataset.vals;
    disegnaFx(el);
    if (hud.el === el) hudDisegna();
  };

  // ---------- le caselle sopra il segnalino ----------
  // «+5» «-3» «*2» «/2» cambiano il valore che c'era, un numero lo sostituisce; il resto non vale.
  // La divisione arrotonda per difetto, dividere per zero non fa niente, sotto lo zero non si va.
  window.calcolaCasella = function (prima, testo) {
    const s = String(testo).trim().replace(',', '.').replace(/[×x]/i, '*').replace('÷', '/').replace('−', '-');
    if (s === '') return { vuoto: true };
    const op = /^([+\-*/])\s*(\d+(?:\.\d+)?)$/.exec(s);
    if (op) {
      const n = +op[2], v = prima == null ? 0 : prima;
      let r;
      if (op[1] === '+') r = v + n;
      else if (op[1] === '-') r = v - n;
      else if (op[1] === '*') r = v * n;
      else { if (n === 0) return null; r = Math.floor(v / n); }
      return { valore: Math.max(0, Math.round(r)) };
    }
    if (/^\d+(?:\.\d+)?$/.test(s)) return { valore: Math.round(+s) };
    return null;
  };

  const hud = { el: null, box: null, raf: 0 };
  function creaHud() {
    const d = document.createElement('div');
    d.id = 'tokHud'; d.hidden = true;
    d.innerHTML = `<div class="thCaselle">${CASELLE.map(([k], i) => `<label class="thCas ${k}"><span class="thLab"></span>` +
      `<input type="text" inputmode="text" enterkeyhint="done" autocomplete="off" spellcheck="false" data-i="${i}"></label>`).join('')}</div>` +
      `<div class="thFx" role="group" aria-label="Effetti">${EFFETTI.map(([k, nome, col, forma]) =>
        `<button type="button" data-fx="${k}" title="${nome}" aria-label="${nome}" aria-pressed="false"><span class="tfxD ${forma}" style="--c:${col}"></span></button>`).join('')}` +
      `<button type="button" data-x="1" title="X rossa sul segnalino" aria-label="X rossa sul segnalino" aria-pressed="false"><span class="thX">✕</span></button>` +
      `<button type="button" data-cas="1" class="thCasBtn" aria-pressed="true"><span class="thTre"><i class="g"></i><i class="r"></i><i class="b"></i></span></button></div>`;
    document.body.appendChild(d);
    d.addEventListener('pointerdown', e => e.stopPropagation());
    d.addEventListener('mousedown', e => e.stopPropagation());
    d.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || !hud.el) return;
      const el = hud.el;
      if (b.dataset.fx) {
        const fx = leggiFx(el), k = b.dataset.fx;
        const nuovi = fx.includes(k) ? fx.filter(x => x !== k) : fx.concat(k);
        if (nuovi.length) el.dataset.fx = nuovi.join(','); else delete el.dataset.fx;
      } else if (b.dataset.x) {
        if (el.dataset.crossed) delete el.dataset.crossed; else el.dataset.crossed = '1';
      } else if (b.dataset.cas) {                     // le tre caselle: si mostrano o no (preferenza di chi conduce, su questo dispositivo)
        casellePref(!casellePref());
        hudDisegna(); return;
      }
      disegnaFx(el); hudDisegna(); scheduleBoardSave();
    });
    for (const inp of d.querySelectorAll('input')) {
      inp.addEventListener('focus', () => inp.select());
      inp.addEventListener('keydown', e => {
        e.stopPropagation();                       // Canc, frecce e lettere non devono muovere o cancellare il segnalino
        if (e.key === 'Enter') { e.preventDefault(); applica(inp); inp.blur(); }
        else if (e.key === 'Escape') { e.preventDefault(); hudDisegna(true); inp.blur(); }
      });
      inp.addEventListener('blur', () => applica(inp));
    }
    return d;
  }
  function applica(inp) {
    const el = hud.el; if (!el) return;
    const i = +inp.dataset.i, vals = leggiVals(el), prima = vals[i];
    const shown = prima == null ? '' : String(prima);
    if (inp.value === shown) return;
    const r = calcolaCasella(prima, inp.value);
    if (!r) { inp.value = shown; inp.classList.add('no'); setTimeout(() => inp.classList.remove('no'), 600); return; }   // non valido: resta com'era
    vals[i] = r.vuoto ? null : r.valore;
    if (vals.every(v => v == null)) delete el.dataset.vals; else el.dataset.vals = vals.map(v => v == null ? '' : v).join('|');
    inp.value = vals[i] == null ? '' : String(vals[i]);
    scheduleBoardSave();
  }
  // le tre caselle verde, rossa e blu sopra il segnalino: chi conduce le può nascondere (resta la riga degli effetti)
  function casellePref(v) {
    try {
      if (v === undefined) return localStorage.getItem('libre-tre-caselle') !== '0';
      localStorage.setItem('libre-tre-caselle', v ? '1' : '0');
    } catch {}
    return v !== false;
  }
  window.hudDisegna = function (forza) {
    const d = hud.box, el = hud.el;
    if (!d || !el) return;
    const conCaselle = casellePref();
    d.classList.toggle('senzaCaselle', !conCaselle);
    const cb = d.querySelector('[data-cas]'), t = tr(conCaselle ? 'Nascondi le tre caselle' : 'Mostra le tre caselle');
    cb.setAttribute('aria-pressed', String(conCaselle)); cb.title = t; cb.setAttribute('aria-label', t);
    const vals = leggiVals(el), fx = leggiFx(el), lab = (typeof settings !== 'undefined' && settings.boxLabels) || [];
    d.querySelectorAll('.thCas').forEach((c, i) => {
      const nome = lab[i] || '', inp = c.querySelector('input');
      c.querySelector('.thLab').textContent = nome;
      c.classList.toggle('senzaNome', !nome);
      inp.setAttribute('aria-label', nome || tr(CASELLE[i][1]));
      inp.title = nome || tr(CASELLE[i][1]);
      if (forza || document.activeElement !== inp) inp.value = vals[i] == null ? '' : String(vals[i]);
    });
    d.querySelectorAll('[data-fx]').forEach(b => b.setAttribute('aria-pressed', String(fx.includes(b.dataset.fx))));
    d.querySelector('[data-x]').setAttribute('aria-pressed', String(!!el.dataset.crossed));
  };
  // sopra il segnalino; se è vicino al bordo di sopra, sotto
  function posiziona() {
    hud.raf = 0;
    const d = hud.box, el = hud.el;
    if (!d || !el || d.hidden) return;
    if (!el.isConnected) { nascondi(); return; }
    const r = el.getBoundingClientRect(), h = d.offsetHeight, w = d.offsetWidth;
    let top = r.top - h - 10;
    const nome = el.dataset.name ? 22 : 0;
    if (top < 56) top = r.bottom + 12 + nome + (el.dataset.hp ? 8 : 0);
    let left = r.left + r.width / 2 - w / 2;
    left = Math.max(8, Math.min(innerWidth - w - 8, left));
    d.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    hud.raf = requestAnimationFrame(posiziona);       // segue il segnalino mentre lo sposti o fai zoom
  }
  function mostra(el) {
    if (!hud.box) hud.box = creaHud();
    if (hud.el !== el && document.activeElement && hud.box.contains(document.activeElement)) document.activeElement.blur();
    hud.el = el; hud.box.hidden = false;
    hudDisegna(true);
    if (!hud.raf) hud.raf = requestAnimationFrame(posiziona);
  }
  function nascondi() {
    if (hud.box) {
      if (document.activeElement && hud.box.contains(document.activeElement)) document.activeElement.blur();   // salva quello che stavi scrivendo
      hud.box.hidden = true;
    }
    hud.el = null;
    if (hud.raf) { cancelAnimationFrame(hud.raf); hud.raf = 0; }
  }
  function aggiorna() {
    const sel = typeof selection !== 'undefined' ? selection : [];
    const el = sel.length === 1 ? sel[0] : null;
    if (el && eSegnalino(el) && conduco()) mostra(el); else nascondi();
  }
  // la selezione cambia sempre da qui
  if (typeof setSelection === 'function') {
    const prima = setSelection;
    window.setSelection = function (list) { const r = prima(list); aggiorna(); return r; };
  }

  // i segnalini già sulla mappa (campagna caricata prima di questo file)
  if (typeof world !== 'undefined') world.querySelectorAll('.photo').forEach(disegnaFx);
})();
