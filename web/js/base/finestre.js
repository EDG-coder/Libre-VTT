// ---------- Strumenti come finestre mobili (solo con il mouse, non su telefono e tablet) ----------
// Quando uno strumento del menu si apre (classe «open» sul suo pulsante) il pannello non si allarga
// dentro il pulsante: compare accanto, come una finestra. Il pulsante resta dov'è (si sposta solo se
// lo trascina l'utente). La finestra si sposta tenendo la sua barra, si ridimensiona dalla maniglia ◢,
// si chiude con la X o riclicchando l'icona; posto e misura si ricordano per ogni strumento.
//
// Il pannello (.tbody, o #diceBody per i dadi) resta dov'è nel documento, quindi le regole di stile e i
// gestori di ogni strumento continuano a funzionare. Per farlo uscire dal pulsante, che è dentro il menu
// (con sfocatura e trasformazioni), si usa il livello superiore dei popover: lì il posto è sempre quello
// dello schermo. Senza popover (browser vecchi) tutto resta come prima.
(() => {
  const R = document.documentElement;
  const PREF = 'libre-finestre';
  const MIN_W = 200, MIN_H = 110, MARGINE = 6;
  const ok = typeof HTMLElement.prototype.showPopover === 'function';
  const aperte = new Map();                        // strumento -> { corpo, barra, maniglia }

  const leggi = () => { try { return JSON.parse(localStorage.getItem(PREF)) || {}; } catch { return {}; } };
  const salva = (id, g) => {
    try { const v = leggi(); v[id] = g; localStorage.setItem(PREF, JSON.stringify(v)); } catch {}
  };
  const permesso = () => ok && !R.classList.contains('ui-touch') && !R.classList.contains('ui-tel') && !document.getElementById('tutGuida');
  const attivo = () => permesso();

  const corpoDi = t => t.el.querySelector('.tbody') || t.el.querySelector('#diceBody');
  const dentro = (v, a, b) => Math.max(a, Math.min(b, v));

  function geometria(t, corpo) {
    const salvata = leggi()[t.id];
    const maxW = innerWidth - 2 * MARGINE, maxH = innerHeight - 2 * MARGINE;
    let w, h, x, y;
    if (salvata && isFinite(salvata.w) && isFinite(salvata.h)) { w = salvata.w; h = salvata.h; }
    else {
      const tw = parseFloat(getComputedStyle(t.el).getPropertyValue('--tw')) || (t.id === 'dice' ? 296 : 240);
      w = tw + 4;
      h = corpo.scrollHeight + 4;                 // il pannello ha già 58 px di margine sopra: bastano per la barra e il respiro
    }
    w = dentro(w, MIN_W, maxW); h = dentro(h, MIN_H, maxH);
    if (salvata && isFinite(salvata.x) && isFinite(salvata.y)) { x = salvata.x; y = salvata.y; }
    else {                                           // accanto al pulsante: a destra, o a sinistra se non c'è posto
      const r = t.grip.getBoundingClientRect();   // l'icona, non il pulsante (che per un attimo può ancora essere largo)
      x = r.right + 12;
      if (x + w > innerWidth - MARGINE) x = r.left - 12 - w;
      y = r.top;
    }
    x = dentro(x, MARGINE, Math.max(MARGINE, innerWidth - w - MARGINE));
    y = dentro(y, MARGINE, Math.max(MARGINE, innerHeight - h - MARGINE));
    return { x, y, w, h };
  }
  function metti(corpo, g) {
    corpo.style.setProperty('--fx', g.x + 'px'); corpo.style.setProperty('--fy', g.y + 'px');
    corpo.style.setProperty('--fw', g.w + 'px'); corpo.style.setProperty('--fh', g.h + 'px');
  }
  const leggiG = corpo => ({ x: parseFloat(corpo.style.getPropertyValue('--fx')), y: parseFloat(corpo.style.getPropertyValue('--fy')),
    w: parseFloat(corpo.style.getPropertyValue('--fw')), h: parseFloat(corpo.style.getPropertyValue('--fh')) });

  function portaInCima(corpo) {                      // l'ultima finestra mostrata sta sopra le altre
    try { corpo.hidePopover(); corpo.showPopover(); } catch {}
  }

  function aggancia(t, corpo) {
    const barra = document.createElement('div');
    barra.className = 'finBar'; barra.dataset.noi18n = '';
    const titolo = document.createElement('span'); titolo.className = 'finTit'; titolo.textContent = t.name || '';
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'finX'; x.textContent = '✕'; x.setAttribute('aria-label', 'Chiudi'); x.title = 'Chiudi';
    barra.append(titolo, x);
    const maniglia = document.createElement('div');
    maniglia.className = 'finMan'; maniglia.setAttribute('aria-hidden', 'true'); maniglia.title = 'Trascina per ridimensionare'; maniglia.textContent = '◢';
    corpo.prepend(barra); corpo.append(maniglia);

    x.addEventListener('click', e => { e.stopPropagation(); t.grip.click(); });

    // sposta: si tiene la barra
    let mossa = null;
    barra.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target === x) return;
      e.preventDefault();
      const g = leggiG(corpo);
      mossa = { id: e.pointerId, sx: e.clientX, sy: e.clientY, g };
      barra.setPointerCapture(e.pointerId); corpo.classList.add('finMuove');
      portaInCima(corpo);
    });
    barra.addEventListener('pointermove', e => {
      if (!mossa || e.pointerId !== mossa.id) return;
      const g = { ...mossa.g };
      g.x = dentro(mossa.g.x + e.clientX - mossa.sx, MARGINE - g.w + 80, innerWidth - 80);
      g.y = dentro(mossa.g.y + e.clientY - mossa.sy, 0, innerHeight - 34);
      metti(corpo, g);
    });
    const fineMossa = e => {
      if (!mossa || e.pointerId !== mossa.id) return;
      mossa = null; corpo.classList.remove('finMuove');
      salva(t.id, leggiG(corpo));
    };
    barra.addEventListener('pointerup', fineMossa); barra.addEventListener('pointercancel', fineMossa);

    // ridimensiona: la maniglia in basso a destra
    let largo = null;
    maniglia.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      largo = { id: e.pointerId, sx: e.clientX, sy: e.clientY, g: leggiG(corpo) };
      maniglia.setPointerCapture(e.pointerId); corpo.classList.add('finMuove');
    });
    maniglia.addEventListener('pointermove', e => {
      if (!largo || e.pointerId !== largo.id) return;
      const g = { ...largo.g };
      g.w = dentro(largo.g.w + e.clientX - largo.sx, MIN_W, innerWidth - g.x - MARGINE);
      g.h = dentro(largo.g.h + e.clientY - largo.sy, MIN_H, innerHeight - g.y - MARGINE);
      metti(corpo, g);
    });
    const fineLargo = e => {
      if (!largo || e.pointerId !== largo.id) return;
      largo = null; corpo.classList.remove('finMuove');
      salva(t.id, leggiG(corpo));
    };
    maniglia.addEventListener('pointerup', fineLargo); maniglia.addEventListener('pointercancel', fineLargo);

    // un clic dentro la finestra la porta sopra le altre
    corpo.addEventListener('pointerdown', () => { if (corpo !== ultima) portaInCima(corpo); }, true);
    return { corpo, barra, maniglia };
  }
  let ultima = null;

  function apri(t) {
    if (aperte.has(t) || !permesso()) return;
    const corpo = corpoDi(t);
    if (!corpo) return;
    t.el.classList.add('finAperta');                 // prima di misurare: il pulsante non si allarga né si sposta (finestre.css)
    R.classList.add('finestre');
    const g = geometria(t, corpo);
    metti(corpo, g);
    const f = corpo.querySelector(':scope > .finBar') ? { corpo } : aggancia(t, corpo);
    aperte.set(t, f);
    corpo.classList.add('finW'); R.classList.add('finestre');
    corpo.dataset.finId = t.id;
    corpo.setAttribute('popover', 'manual');
    try { corpo.showPopover(); } catch { chiudiTecnico(t); return; }
    ultima = corpo;
    // se il contenuto cambia misura la finestra resta com'è: si scorre
  }
  function chiudiTecnico(t) {                        // toglie la finestra, lasciando lo strumento com'è
    const f = aperte.get(t);
    if (!f) return;
    aperte.delete(t);
    const c = f.corpo;
    try { c.hidePopover(); } catch {}
    c.removeAttribute('popover'); c.classList.remove('finW', 'finMuove');
    t.el.classList.remove('finAperta');
    if (ultima === c) ultima = null;
    if (!aperte.size) R.classList.remove('finestre');
  }

  const osservate = new WeakSet();
  function registra(t) {
    if (!ok || !t || !t.el || osservate.has(t.el)) return;
    osservate.add(t.el);
    const sync = () => {
      const open = t.el.classList.contains('open');
      if (open && !aperte.has(t)) apri(t);
      else if (!open && aperte.has(t)) chiudiTecnico(t);
    };
    new MutationObserver(sync).observe(t.el, { attributes: true, attributeFilter: ['class'] });
    sync();
  }

  // se la finestra del programma si stringe fino a diventare «telefono», si torna al pannello nel pulsante
  addEventListener('resize', () => {
    if (!permesso()) { for (const t of [...aperte.keys()]) chiudiTecnico(t); return; }
    for (const [t, f] of aperte) {                   // e le finestre restano dentro lo schermo
      const g = leggiG(f.corpo);
      g.w = Math.min(g.w, innerWidth - 2 * MARGINE); g.h = Math.min(g.h, innerHeight - 2 * MARGINE);
      g.x = dentro(g.x, MARGINE, Math.max(MARGINE, innerWidth - g.w - MARGINE));
      g.y = dentro(g.y, MARGINE, Math.max(MARGINE, innerHeight - g.h - MARGINE));
      metti(f.corpo, g);
    }
  });
  // Esc chiude la finestra su cui si sta lavorando
  addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const a = document.activeElement && document.activeElement.closest && document.activeElement.closest('.finW');
    if (!a) return;
    for (const [t, f] of aperte) if (f.corpo === a) { t.grip.click(); e.preventDefault(); break; }
  });

  window.LibreFinestre = { registra, attivo, aperte: () => [...aperte.keys()].map(t => t.id), ripristina: () => { try { localStorage.removeItem(PREF); } catch {} } };
})();
