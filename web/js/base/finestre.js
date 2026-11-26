// ---------- Strumenti come finestre mobili (con il mouse e con le dita, anche su telefono e tablet) ----------
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
  const permesso = () => ok && !document.getElementById('tutGuida');
  // la parte di schermo dove una finestra può stare: dentro i margini, e su telefono fuori da tacca, isola
  // dinamica, angoli arrotondati e barra della home (--sa-*, misurati da mobile.js)
  const sa = k => parseFloat(getComputedStyle(R).getPropertyValue('--sa-' + k)) || 0;
  const bordi = () => ({ L: MARGINE + sa('left'), T: MARGINE + sa('top'), R: innerWidth - MARGINE - sa('right'), B: innerHeight - MARGINE - sa('bottom') });
  const attivo = () => permesso();

  const corpoDi = t => t.el.querySelector('.tbody') || t.el.querySelector('#diceBody');
  const dentro = (v, a, b) => Math.max(a, Math.min(b, v));

  function geometria(t, corpo) {
    const salvata = leggi()[t.id], z = bordi();
    const maxW = z.R - z.L, maxH = z.B - z.T;
    let w, h, x, y;
    if (salvata && isFinite(salvata.w) && isFinite(salvata.h) && !salvata.auto) { w = salvata.w; h = salvata.h; }
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
      if (x + w > z.R) x = r.left - 12 - w;
      y = r.top;
    }
    x = dentro(x, z.L, Math.max(z.L, z.R - w));
    y = dentro(y, z.T, Math.max(z.T, z.B - h));
    // finché non la si ridimensiona dalla maniglia, l'altezza segue il contenuto (auto): un testo che arriva dopo
    // (la musica che non trova YouTube, un tiro nei dadi) non resta tagliato in fondo
    const auto = !(salvata && isFinite(salvata.h) && !salvata.auto);
    return { x, y, w, h, auto };
  }
  function metti(corpo, g) {
    corpo.style.setProperty('--fx', g.x + 'px'); corpo.style.setProperty('--fy', g.y + 'px');
    corpo.style.setProperty('--fw', g.w + 'px'); corpo.style.setProperty('--fh', g.h + 'px');
    corpo.classList.toggle('finAuto', !!g.auto);
  }
  const leggiG = corpo => ({ x: parseFloat(corpo.style.getPropertyValue('--fx')), y: parseFloat(corpo.style.getPropertyValue('--fy')),
    w: parseFloat(corpo.style.getPropertyValue('--fw')),
    h: corpo.classList.contains('finAuto') ? Math.round(corpo.getBoundingClientRect().height) : parseFloat(corpo.style.getPropertyValue('--fh')),
    auto: corpo.classList.contains('finAuto') });

  // altezza automatica: se il contenuto cresce (un avviso, un tiro) e la finestra uscirebbe in fondo, sale
  function alza(corpo) {
    if (!corpo.classList.contains('finAuto') || !corpo.matches(':popover-open') || corpo.classList.contains('finMuove')) return;
    const z = bordi(), g = leggiG(corpo), serve = Math.min(corpo.scrollHeight, z.B - z.T);
    if (g.y + serve > z.B) metti(corpo, { ...g, y: Math.max(z.T, z.B - serve) });
  }
  function portaInCima(corpo) {                      // l'ultima finestra mostrata sta sopra le altre
    try { corpo.hidePopover(); corpo.showPopover(); ultima = corpo; } catch {}   // ricordarla: sopra(w) la scambia con una scheda
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
      const g = { ...mossa.g }, z = bordi();
      g.x = dentro(mossa.g.x + e.clientX - mossa.sx, z.L - g.w + 80, z.R - 80);
      g.y = dentro(mossa.g.y + e.clientY - mossa.sy, z.T - MARGINE, z.B - 34);   // la barra mai sotto la tacca
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
      const g = { ...largo.g, auto: false }, z = bordi();   // ridimensionata a mano: da qui in poi l'altezza è quella scelta
      g.w = dentro(largo.g.w + e.clientX - largo.sx, Math.min(MIN_W, z.R - g.x), z.R - g.x);
      g.h = dentro(largo.g.h + e.clientY - largo.sy, Math.min(MIN_H, z.B - g.y), z.B - g.y);
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

  // Le finestre delle schede (e le altre finestre del tavolo) stanno sotto, nella pagina normale: una finestra
  // di strumento aperta, che sta nel livello superiore, le coprirebbe sempre e non si potrebbe più
  // toccarle. Finché c'è una finestra di strumento aperta, anche la finestra su cui si clicca passa nel livello
  // superiore, in cima. Chiuse tutte le finestre di strumento, tornano com'erano (menù e avvisi restano sopra).
  function sopra(w) {
    if (!w || !aperte.size || !permesso() || !w.isConnected) return;
    if (w.matches(':popover-open')) { if (w === ultima) return; }
    else w.setAttribute('popover', 'manual');
    try { if (w.matches(':popover-open')) w.hidePopover(); w.showPopover(); ultima = w; } catch {}
  }
  // Il menu del clic destro e le tendine (incantesimo, capacità) stanno nella pagina normale: con una finestra di
  // strumento aperta (la cartella delle schede, per esempio) le finestre delle schede salgono nel livello superiore e
  // li coprirebbero. Finché sono visibili, anche loro passano nel livello superiore, dopo le finestre: restano sopra.
  const MENU_SOPRA = '#ctx, #spellPop, .capPop';
  function menuSopra(el) {
    if (el.hidden) {
      if (el.hasAttribute('popover')) { try { el.hidePopover(); } catch {} el.removeAttribute('popover'); }
      return;
    }
    if (!aperte.size || !permesso()) return;
    el.setAttribute('popover', 'manual');
    try { if (el.matches(':popover-open')) el.hidePopover(); el.showPopover(); } catch {}
  }
  new MutationObserver(ms => { for (const m of ms) if (m.target.matches && m.target.matches(MENU_SOPRA)) menuSopra(m.target); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['hidden'], subtree: true });

  function riportaGiu() {
    for (const w of document.querySelectorAll('.sheetWin[popover]')) { try { w.hidePopover(); } catch {} w.removeAttribute('popover'); }
    for (const m of document.querySelectorAll(MENU_SOPRA)) if (m.hasAttribute('popover')) { try { m.hidePopover(); } catch {} m.removeAttribute('popover'); }
  }

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
    // altezza automatica: misurata ora, dentro la finestra vera (prima, dentro il pulsante, il testo andava a capo
    // in un altro modo), e la finestra si alza se non ci starebbe sotto
    if (g.auto) { alza(corpo); if (!corpo._alza) { corpo._alza = new MutationObserver(() => requestAnimationFrame(() => alza(corpo))); corpo._alza.observe(corpo, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'class'] }); } }
    // se il contenuto cambia misura la finestra resta com'è: si scorre
  }
  function chiudiTecnico(t) {                        // toglie la finestra, lasciando lo strumento com'è
    const f = aperte.get(t);
    if (!f) return;
    aperte.delete(t);
    const c = f.corpo;
    try { c.hidePopover(); } catch {}
    c.removeAttribute('popover'); c.classList.remove('finW', 'finMuove', 'finAuto');
    t.el.classList.remove('finAperta');
    if (ultima === c) ultima = null;
    if (!aperte.size) { R.classList.remove('finestre'); riportaGiu(); }
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

  // finestra del programma ridimensionata, telefono girato: le finestre restano dentro lo schermo (aspettando
  // un fotogramma, perché i margini della tacca, misurati da mobile.js, cambino anche loro)
  addEventListener('resize', () => requestAnimationFrame(() => {
    if (!permesso()) { for (const t of [...aperte.keys()]) chiudiTecnico(t); return; }
    const z = bordi();
    for (const [t, f] of aperte) {
      const g = leggiG(f.corpo);
      g.w = Math.min(g.w, z.R - z.L); g.h = Math.min(g.h, z.B - z.T);
      g.x = dentro(g.x, z.L, Math.max(z.L, z.R - g.w));
      g.y = dentro(g.y, z.T, Math.max(z.T, z.B - g.h));
      metti(f.corpo, g);
    }
  }));
  // Esc chiude la finestra su cui si sta lavorando
  addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const a = document.activeElement && document.activeElement.closest && document.activeElement.closest('.finW');
    if (!a) return;
    for (const [t, f] of aperte) if (f.corpo === a) { t.grip.click(); e.preventDefault(); break; }
  });

  window.LibreFinestre = { registra, attivo, sopra, aperte: () => [...aperte.keys()].map(t => t.id), ripristina: () => { try { localStorage.removeItem(PREF); } catch {} } };
})();
