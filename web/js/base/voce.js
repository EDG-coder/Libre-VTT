// ---------- 🔊 Voce: lettore dello schermo e lettore della chat ----------
// Legge ad alta voce con la sintesi vocale del dispositivo: niente servizi esterni, niente esce dal computer.
// Al primo avvio (nella home dell'app, o al tavolo per chi entra dal sito) chiede che cosa si vuole:
//   «schermo»  il lettore dello schermo: legge quello su cui vai con Tab, che tocchi o su cui fermi il mouse,
//              le finestre che si aprono, gli avvisi e i nuovi messaggi della chat;
//   «chat»     solo i nuovi messaggi della chat (si spegne dal 🔊 accanto a «Invia» o dalle impostazioni);
//   «no»       niente voce.
// Si cambia dalla rotellina ⚙ della home e dalle Impostazioni del tavolo (sezione «Voce e lettore dello schermo»).
// Scorciatoie: Alt+Maiusc+L legge lo schermo, Alt+Maiusc+S la selezione, Alt+Maiusc+P pausa, Esc ferma.
// In chat: /leggi e /silenzio. La stessa pagina serve la home (launcher.html) e il tavolo (index.html).
// Sul telefono Android la WebView non ha la sintesi vocale: parla l'app (comandi «parla» e «zitto» del ponte).
(function () {
  'use strict';
  if (window.LIBRE_VOCE) return;
  const tr = window.tr || (s => s);
  const $ = id => document.getElementById(id);
  const CH = 'libre-voce';
  const MODI = ['schermo', 'chat', 'no'];
  const BASE = { modo: null, t: 0, chat: true, nomi: true, miei: false, tiri: true, mouse: true, voce: '', vel: 1, tono: 1, vol: 1 };
  const MAX_PEZZO = 200, MAX_SCHERMO = 8000, MAX_CODA = 30;

  // ---------- le traduzioni inglesi (stanno qui, così il file è tutto suo) ----------
  const EN = {
    'Voce e lettore dello schermo': 'Voice and screen reader',
    'Lettore dello schermo': 'Screen reader',
    'LIBRE VTT può leggere ad alta voce.': 'LIBRE VTT can read aloud.',
    'Vuoi tenere il lettore dello schermo? Legge quello che tocchi, su cui vai con Tab o su cui fermi il mouse, le finestre che si aprono, gli avvisi e i nuovi messaggi della chat.': 'Do you want to keep the screen reader? It reads what you tap, move to with Tab or rest the mouse on, the windows that open, notices and new chat messages.',
    'Altrimenti resta solo la lettura dei nuovi messaggi della chat, che puoi spegnere quando vuoi.': 'Otherwise only new chat messages are read aloud, and you can switch that off at any time.',
    '🔊 Sì, tieni il lettore dello schermo': '🔊 Yes, keep the screen reader',
    '💬 No, leggi solo la chat': '💬 No, read only the chat',
    'Niente voce': 'No voice',
    'Se usi già VoiceOver, TalkBack o un altro lettore del sistema, scegli «Niente voce» per non sentire tutto due volte. Puoi cambiare idea dalla rotellina ⚙.': 'If you already use VoiceOver, TalkBack or another system screen reader, choose «No voice» so you do not hear everything twice. You can change your mind from the ⚙ gear.',
    'Lettore dello schermo acceso.': 'Screen reader on.',
    'Lettura della chat accesa.': 'Chat reading on.',
    'Voce': 'Voice',
    'Solo chat': 'Chat only',
    'Leggi i nuovi messaggi della chat': 'Read new chat messages',
    'Dì chi ha scritto': 'Say who wrote it',
    'Leggi anche i miei messaggi': 'Also read my own messages',
    'Leggi anche tiri di dado e calcoli': 'Also read dice rolls and calculations',
    'Leggi quello su cui fermi il mouse': 'Read what the mouse rests on',
    'Automatica': 'Automatic',
    'Velocità': 'Speed',
    'Tono': 'Pitch',
    'Volume': 'Volume',
    'Prova': 'Test',
    'Questa è la voce del tavolo.': 'This is the voice of the table.',
    '▶ Leggi lo schermo': '▶ Read the screen',
    '⏯ Pausa': '⏯ Pause',
    '■ Stop': '■ Stop',
    'Alt+Maiusc+L legge lo schermo · Alt+Maiusc+S la selezione · Alt+Maiusc+P pausa · Esc ferma. In chat: /leggi e /silenzio.': 'Alt+Shift+L reads the screen · Alt+Shift+S the selection · Alt+Shift+P pause · Esc stops. In chat: /leggi and /silenzio.',
    'Lettura della chat: accesa (clic per spegnerla)': 'Chat reading: on (click to switch it off)',
    'Lettura della chat: spenta (clic per accenderla)': 'Chat reading: off (click to switch it on)',
    'Lettura della chat spenta.': 'Chat reading off.',
    'Questo dispositivo non ha la sintesi vocale: la voce non può partire.': 'This device has no speech synthesis: the voice cannot start.',
    'Non c\'è niente da leggere sullo schermo.': 'There is nothing to read on the screen.',
    'Nessun testo selezionato.': 'No text selected.',
    'Le voci le dà il sistema: se manca la tua lingua, aggiungi una voce nelle impostazioni del dispositivo.': 'The voices come from the system: if your language is missing, add a voice in the device settings.',
    'pulsante': 'button', 'link': 'link', 'casella': 'checkbox', 'spuntata': 'checked', 'non spuntata': 'not checked',
    'scelta': 'option', 'selezionata': 'selected', 'cursore': 'slider', 'campo di testo': 'text field', 'vuoto': 'empty',
    'menu': 'menu', 'scheda': 'tab', 'premuto': 'pressed', 'aperto': 'expanded', 'chiuso': 'collapsed',
    'non disponibile': 'unavailable', 'titolo': 'heading', 'finestra': 'window', 'sezione': 'section'
  };
  try { const L = window.LIBRE_LINGUE = window.LIBRE_LINGUE || {}; L.en = Object.assign(L.en || {}, EN); } catch {}

  // ---------- le impostazioni ----------
  const leggi = () => { try { return { ...BASE, ...(JSON.parse(localStorage.getItem(CH)) || {}) }; } catch { return { ...BASE }; } };
  let imp = leggi();
  const scrivi = () => { try { localStorage.setItem(CH, JSON.stringify(imp)); } catch {} };
  const lingua = () => (window.LIBRE_I18N && LIBRE_I18N.lingua) || 'it';
  const bcp = () => ({ it: 'it-IT', en: 'en-US' })[lingua()] || lingua();
  const clamp = (v, a, b, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d; };
  imp.vel = clamp(imp.vel, .5, 2, 1); imp.tono = clamp(imp.tono, .5, 2, 1); imp.vol = clamp(imp.vol, 0, 1, 1);
  if (!MODI.includes(imp.modo)) imp.modo = null;

  const CASA = !!$('sceltaLingua');          // la home dell'app (launcher.html)
  const TAVOLO = !!$('chatLog');             // il tavolo (index.html)

  // Al tavolo la scelta fatta nella home arriva nell'indirizzo (pref): vale se è più nuova di quella di qui.
  if (TAVOLO) {
    try {
      const p = JSON.parse(new URLSearchParams(location.search).get('pref'));
      if (p && MODI.includes(p.voce) && +p.voceT > (imp.t || 0)) { imp.modo = p.voce; imp.t = +p.voceT; scrivi(); }
    } catch {}
  }

  // ---------- il motore: sintesi del browser, o dell'app su Android ----------
  const NAT = window.LIBRE_NATIVO;
  const android = !!(NAT && NAT.disponibile && NAT.piattaforma === 'android' && typeof NAT.parla === 'function');
  const synth = !android && window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined' ? window.speechSynthesis : null;
  const puo = android || !!synth;

  const pulisci = s => String(s == null ? '' : s)
    .replace(/[\p{Extended_Pictographic}️‍←-⇿■-◿]/gu, ' ')   // emoji, frecce e simboli: si leggerebbero a parole
    .replace(/([^.!?…:;,\s])[ \t]*\n+[ \t]*/g, '$1. ').replace(/\s*\n+\s*/g, ' ')        // a capo = pausa
    .replace(/\s+/g, ' ').trim();
  function pezzi(testo) {
    const out = [], frasi = testo.match(/[^.!?…]+[.!?…]*\s*/g) || [testo];
    let buf = '';
    const via = () => { if (buf.trim()) out.push(buf.trim()); buf = ''; };
    for (let s of frasi) {
      while (s.length > MAX_PEZZO) {
        let cut = s.lastIndexOf(',', MAX_PEZZO); if (cut < 60) cut = s.lastIndexOf(' ', MAX_PEZZO); if (cut < 1) cut = MAX_PEZZO;
        via(); out.push(s.slice(0, cut + 1).trim()); s = s.slice(cut + 1);
      }
      if ((buf + s).length > MAX_PEZZO) via();
      buf += s;
    }
    via();
    return out.filter(Boolean);
  }

  let voci = [], inCoda = 0, giro = 0, daRiprovare = '';
  const vivi = new Set();                 // gli enunciati restano vivi fino alla fine: alcuni browser li perdono
  const caricaVoci = () => { if (synth) { try { voci = synth.getVoices() || []; } catch { voci = []; } } return voci; };
  function voceScelta() {
    if (!voci.length) caricaVoci();
    const l = lingua().toLowerCase();
    const mia = voci.find(v => v.voiceURI === imp.voce);
    if (mia && (mia.lang || '').toLowerCase().startsWith(l)) return mia;       // quella scelta, se è della lingua giusta
    return voci.find(v => (v.lang || '').toLowerCase().startsWith(l) && v.default)
      || voci.find(v => (v.lang || '').toLowerCase().startsWith(l) && v.localService)
      || voci.find(v => (v.lang || '').toLowerCase().startsWith(l)) || mia || null;
  }
  function parla(testo, { interrompi = false } = {}) {
    const t = pulisci(testo);
    if (!t || !puo) return false;
    if (interrompi) zitto(true);
    else if (inCoda >= MAX_CODA) return false;                     // la chat corre più della voce: si salta
    if (android) {
      NAT.parla(t, { lingua: bcp(), vel: imp.vel, tono: imp.tono, vol: imp.vol, coda: !interrompi });
      return true;
    }
    const v = voceScelta(), g = giro;
    for (const p of pezzi(t)) {
      const u = new SpeechSynthesisUtterance(p);
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = bcp();
      u.rate = imp.vel; u.pitch = imp.tono; u.volume = imp.vol;
      vivi.add(u); inCoda++;
      const fine = e => {
        if (g !== giro) return;
        vivi.delete(u); inCoda = Math.max(0, inCoda - 1);
        // Chrome e Safari non parlano prima del primo clic o tasto: si riprova appena c'è
        if (e && e.error === 'not-allowed') daRiprovare = (daRiprovare ? daRiprovare + ' ' : '') + p;
      };
      u.onend = fine; u.onerror = fine;
      try { synth.speak(u); } catch { fine(); }
    }
    if (synth.paused) try { synth.resume(); } catch {}
    return true;
  }
  function zitto(senzaAltro) {
    giro++; vivi.clear(); inCoda = 0;
    if (android) NAT.zitto();
    else if (synth) try { synth.cancel(); } catch {}
    if (!senzaAltro) daRiprovare = '';
  }
  function pausa() { if (!synth) return; try { synth.paused ? synth.resume() : synth.pause(); } catch {} }
  // il primo gesto sblocca la voce (iPhone, Chrome): quello che non è riuscito a dire, lo dice adesso
  const sblocca = () => { if (daRiprovare) { const t = daRiprovare; daRiprovare = ''; parla(t, { interrompi: true }); } };
  addEventListener('pointerdown', sblocca, true);
  addEventListener('keydown', sblocca, true);
  if (synth && typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', () => { caricaVoci(); riempiVoci(); });

  // ---------- come si chiama una cosa sullo schermo ----------
  const breve = s => { s = pulisci(s); return s.length > 300 ? s.slice(0, 300) + '…' : s; };
  function testoDi(el) {
    // il testo come si vede (innerText mette gli spazi tra i pulsanti e salta quello nascosto)
    if (el.isConnected && !el.querySelector('[aria-hidden="true"]') && typeof el.innerText === 'string') return el.innerText;
    // altrimenti senza i pezzi nascosti agli aiuti (aria-hidden) e senza le icone svg
    const c = el.cloneNode(true);
    c.querySelectorAll('[aria-hidden="true"],svg,script,style,[hidden]').forEach(x => x.remove());
    return c.textContent;
  }
  function nomeDi(el) {
    const a = el.getAttribute('aria-label');
    if (a) return a;
    const lb = el.getAttribute('aria-labelledby');
    if (lb) { const t = lb.split(/\s+/).map(id => $(id)).filter(Boolean).map(testoDi).join(' '); if (pulisci(t)) return t; }
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
      let t = '';
      if (el.id) { try { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) t = testoDi(l); } catch {} }
      if (!pulisci(t)) { const l = el.closest('label'); if (l) { const c = l.cloneNode(true); c.querySelectorAll('input,select,textarea,output').forEach(x => x.remove()); t = c.textContent; } }
      return pulisci(t) ? t : (el.getAttribute('placeholder') || el.title || '');
    }
    if (el.tagName === 'IMG') return el.alt || el.title || '';
    const t = testoDi(el);
    return pulisci(t) ? t : (el.title || el.getAttribute('data-tip') || '');
  }
  function descrivi(el) {
    if (!el || el.nodeType !== 1) return '';
    const tag = el.tagName, ruolo = el.getAttribute('role') || '', tipo = (el.getAttribute('type') || '').toLowerCase();
    const nome = breve(nomeDi(el));
    const pz = [nome];
    if (tag === 'INPUT' && (tipo === 'checkbox' || ruolo === 'switch')) pz.push(tr('casella'), tr(el.checked ? 'spuntata' : 'non spuntata'));
    else if (tag === 'INPUT' && tipo === 'radio') pz.push(tr('scelta'), el.checked ? tr('selezionata') : '');
    else if (tag === 'INPUT' && tipo === 'range') pz.push(tr('cursore'), el.value);
    else if (tag === 'SELECT') pz.push(tr('menu'), el.selectedOptions && el.selectedOptions[0] ? el.selectedOptions[0].textContent : '');
    else if (tag === 'TEXTAREA' || (tag === 'INPUT' && !/^(button|submit|reset|file|color|hidden|image)$/.test(tipo))) pz.push(tr('campo di testo'), tipo === 'password' ? '' : (el.value || tr('vuoto')));
    else if (ruolo === 'tab' || el.classList.contains('tab')) pz.push(tr('scheda'), el.getAttribute('aria-selected') === 'true' || el.classList.contains('active') ? tr('selezionata') : '');
    else if (tag === 'BUTTON' || ruolo === 'button' || (tag === 'INPUT' && /^(button|submit|reset)$/.test(tipo))) pz.push(tr('pulsante'));
    else if (tag === 'A' && el.hasAttribute('href')) pz.push(tr('link'));
    else if (tag === 'SUMMARY') pz.push(tr('sezione'), tr(el.parentElement && el.parentElement.open ? 'aperto' : 'chiuso'));
    else if (/^H[1-6]$/.test(tag)) pz.push(tr('titolo'));
    if (el.getAttribute('aria-pressed') === 'true') pz.push(tr('premuto'));
    const esp = el.getAttribute('aria-expanded');
    if (esp && tag !== 'SUMMARY') pz.push(tr(esp === 'true' ? 'aperto' : 'chiuso'));
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') pz.push(tr('non disponibile'));
    return pz.filter(x => x && pulisci(x)).join(', ');
  }
  const INTERATTIVI = 'button,a[href],input,select,textarea,summary,[role="button"],[role="tab"],[role="menuitem"],[role="checkbox"],[role="switch"],[role="option"],[tabindex]:not([tabindex="-1"])';
  function bersaglio(t) {
    if (!t || t.nodeType !== 1 || t.closest('canvas,svg:not(button svg),#voceScelta [data-zitto]')) return null;
    const i = t.closest(INTERATTIVI);
    if (i) return i;
    // un testo semplice: il pezzo più piccolo che ha del testo, non un contenitore grande
    for (let el = t; el && el !== document.body; el = el.parentElement) {
      const s = pulisci(el.textContent);
      if (!s) continue;
      return s.length <= 400 ? el : null;
    }
    return null;
  }
  let ultimoEl = null, ultimoQuando = 0;
  function leggiEl(el) {
    if (!el) return;
    const ora = Date.now();
    if (el === ultimoEl && ora - ultimoQuando < 1500) return;      // lo stesso tocco arriva da più eventi
    ultimoEl = el; ultimoQuando = ora;
    const d = descrivi(el);
    if (d) parla(d, { interrompi: true });
  }

  // ---------- tutto lo schermo ----------
  function visibile(el) {
    if (!el || el.closest('[hidden],[aria-hidden="true"],script,style,noscript,template')) return false;
    if (typeof el.checkVisibility === 'function') return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }
  const zonaDi = el => el.closest('dialog[open],[role="dialog"]') ? 'dialog' : el.closest('#side') ? 'side' : 'main';
  function testoSchermo() {
    const voci = [], vw = innerWidth, vh = innerHeight;
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) {
      const t = n.nodeValue.replace(/\s+/g, ' ').trim();
      if (!t) continue;
      const el = n.parentElement;
      if (!visibile(el)) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      const rc = (r.getClientRects && r.getClientRects()[0]) || r.getBoundingClientRect();
      if (!rc || (!rc.width && !rc.height) || rc.bottom < 0 || rc.top > vh || rc.right < 0 || rc.left > vw) continue;
      voci.push({ t, top: rc.top, left: rc.left, zona: zonaDi(el) });
    }
    // una finestra aperta ha la precedenza: è lì che si sta lavorando
    const zone = voci.some(i => i.zona === 'dialog') ? ['dialog'] : ['main', 'side'];
    const righe = [];
    for (const z of zone) {
      const l = voci.filter(i => i.zona === z).sort((a, b) => a.top - b.top || a.left - b.left), qui = [];
      for (const it of l) { const u = qui[qui.length - 1]; if (u && Math.abs(it.top - u.top) < 8) u.p.push(it); else qui.push({ top: it.top, p: [it] }); }
      for (const r of qui) righe.push(r.p.sort((a, b) => a.left - b.left).map(p => p.t).join(' '));
    }
    return righe.reduce((acc, r) => acc + (acc ? (/[.!?…:;,]$/.test(acc) ? ' ' : '. ') : '') + r, '').slice(0, MAX_SCHERMO);
  }
  const avvisa = msg => { parla(tr(msg), { interrompi: true }); };
  function leggiSchermo() { const t = testoSchermo(); if (t) parla(t, { interrompi: true }); else avvisa('Non c\'è niente da leggere sullo schermo.'); }
  function leggiSelezione() {
    const a = document.activeElement;
    let t = '';
    if (a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT') && a.selectionEnd > a.selectionStart) t = a.value.slice(a.selectionStart, a.selectionEnd);
    else { const s = getSelection && getSelection(); t = s && !s.isCollapsed ? s.toString() : ''; }
    if (pulisci(t)) parla(t, { interrompi: true }); else avvisa('Nessun testo selezionato.');
  }

  // ---------- il lettore dello schermo (modo «schermo») ----------
  const schermo = () => imp.modo === 'schermo';
  // Tab e frecce: quello che prende il fuoco
  addEventListener('focusin', e => { if (schermo() && !(e.target === document.body)) leggiEl(bersaglio(e.target)); }, true);
  // dito o penna: quello che tocchi (il tocco fa anche quello che fa sempre)
  let giu = null;
  addEventListener('pointerdown', e => { giu = e.pointerType !== 'mouse' ? { x: e.clientX, y: e.clientY, t: Date.now() } : null; }, true);
  addEventListener('pointerup', e => {
    if (!schermo() || !giu || e.pointerType === 'mouse') return;
    const lungo = Math.hypot(e.clientX - giu.x, e.clientY - giu.y) > 12 || Date.now() - giu.t > 800;   // un trascinamento non si legge
    giu = null;
    if (!lungo) leggiEl(bersaglio(e.target));
  }, true);
  // mouse: quello su cui ti fermi per un attimo
  let fermo = 0;
  addEventListener('pointermove', e => {
    if (!schermo() || !imp.mouse || e.pointerType !== 'mouse' || e.buttons) return;
    clearTimeout(fermo);
    const t = e.target;
    fermo = setTimeout(() => leggiEl(bersaglio(t)), 650);
  }, true);
  addEventListener('pointerleave', () => clearTimeout(fermo), true);

  // le finestre che si aprono, e le zone che avvisano da sole (aria-live, role=status/alert, la barra della rete)
  const VIVE = '[aria-live]:not([aria-live="off"]),[role="status"],[role="alert"],#netBar';
  const detti = new WeakMap(), daDire = new Set();
  let timerVive = 0;
  function titoloFinestra(d) {
    const lb = d.getAttribute('aria-labelledby'), h = (lb && $(lb)) || d.querySelector('h1,h2,h3,h4');
    return d.getAttribute('aria-label') || (h ? testoDi(h) : '');
  }
  const oss = new MutationObserver(lista => {
    if (!schermo()) return;
    for (const m of lista) {
      if (m.type === 'attributes') {
        const d = m.target;
        if (d.tagName === 'DIALOG' && d.open && m.oldValue === null) {
          const tit = pulisci(titoloFinestra(d)), corpo = breve(testoDi(d));
          // prima la finestra, poi la cosa su cui è finito il fuoco (che si legge da sola un attimo prima)
          setTimeout(() => {
            parla([tr('finestra'), tit, corpo.startsWith(tit) ? corpo.slice(tit.length) : corpo].filter(x => pulisci(x)).join('. '), { interrompi: true });
            const f = document.activeElement;
            if (f && f !== d && d.contains(f)) parla(descrivi(bersaglio(f)));
          }, 30);
        }
        continue;
      }
      const n = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      if (!n || n.closest('#chatLog')) continue;
      const z = n.closest(VIVE);
      if (z) daDire.add(z);
    }
    if (daDire.size) {
      clearTimeout(timerVive);
      timerVive = setTimeout(() => {
        for (const z of daDire) {
          const s = pulisci(testoDi(z));
          if (s && detti.get(z) !== s && visibile(z)) { detti.set(z, s); parla(s); }
        }
        daDire.clear();
      }, 300);
    }
  });
  function osserva() {
    oss.disconnect();
    if (schermo()) oss.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['open'], attributeOldValue: true });
  }

  // ---------- la chat ----------
  function mio(m) {
    const N = typeof NET !== 'undefined' ? NET : null;   // NET è una const di net.js: non sta su window
    if (N && N.on) return !!(N.me && m.byId === N.me.token);
    return !m.by;                                                 // da soli: i messaggi senza nome li scrivi tu
  }
  function leggiMessaggio(m) {
    if (!m || imp.modo === 'no' || !imp.modo || !imp.chat || m.inAttesa) return;
    const testo = m.kind === 'text' || m.kind === 'rule';
    if (!testo && !imp.tiri) return;
    if (testo && mio(m) && !imp.miei) return;
    const log = $('chatLog'); if (!log) return;
    // si legge quello che compare davvero (un messaggio di un'altra scheda della chat, o nascosto, no)
    const el = [...log.children].reverse().find(c => c.dataset && c.dataset.id === String(m.id));
    if (!el) return;
    let chi = '';
    const parti = [];
    for (const n of el.childNodes) {
      if (n.nodeType === 1 && (n.tagName === 'BUTTON' || n.matches('[aria-hidden="true"]'))) continue;
      if (n.nodeType === 1 && n.classList.contains('who')) { chi = pulisci(n.textContent); continue; }
      const s = pulisci(n.nodeType === 1 ? testoDi(n) : n.textContent);
      if (s) parti.push(s);
    }
    if (!parti.length) return;
    parla((imp.nomi && chi ? chi + ': ' : '') + parti.join(', '));
  }
  if (TAVOLO && typeof window.addChat === 'function') {
    // eslint-disable-next-line no-global-assign
    addChat = (prima => function (m) {
      const r = prima.apply(this, arguments);
      try { leggiMessaggio(m); } catch {}
      return r;
    })(addChat);
  }
  if (TAVOLO && typeof window.chatCommand === 'function') {
    // eslint-disable-next-line no-global-assign
    chatCommand = (prima => function (text) {
      const c = String(text || '').trim().toLowerCase();
      if (c === '/leggi') { leggiSchermo(); return true; }
      if (c === '/silenzio') { zitto(); return true; }
      return prima.apply(this, arguments);
    })(chatCommand);
  }
  // per gli aiuti del sistema (VoiceOver, TalkBack, NVDA): la chat è un registro che avvisa da solo
  if (TAVOLO) { const l = $('chatLog'); if (l && !l.hasAttribute('role')) { l.setAttribute('role', 'log'); l.setAttribute('aria-live', 'polite'); } }

  // ---------- scorciatoie ----------
  addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (inCoda > 0 || (synth && synth.speaking)) zitto(); return; }   // senza fermare l'Esc del tavolo
    if (!imp.modo || imp.modo === 'no' || !e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
    if (e.code === 'KeyL') { e.preventDefault(); leggiSchermo(); }
    else if (e.code === 'KeyS') { e.preventDefault(); leggiSelezione(); }
    else if (e.code === 'KeyP') { e.preventDefault(); pausa(); }
  }, true);

  // ---------- cambiare modo ----------
  const listeners = new Set();
  function imposta(modo, { daHome = false, quando = Date.now() } = {}) {
    if (!MODI.includes(modo)) return;
    imp.modo = modo; imp.t = quando;
    if (modo === 'chat') imp.chat = true;
    scrivi(); osserva();
    // nella home: si ricorda anche nelle impostazioni dell'app, così il tavolo lo sa
    if (CASA && !daHome) try { if (typeof mandaPref === 'function') mandaPref({ voce: modo, voceT: quando }); } catch {}
    listeners.forEach(f => { try { f(); } catch {} });
  }

  // ---------- la domanda del primo avvio ----------
  const STILE = `
    #voceScelta { max-width: min(520px, calc(100vw - 32px)); }
    #voceScelta.voceFinestra { border: 1px solid var(--line); border-radius: 16px; padding: 20px 22px; background: var(--panel); color: var(--text); box-shadow: 0 20px 60px rgba(0, 0, 0, .6); }
    #voceScelta.voceFinestra::backdrop { background: rgba(0, 0, 0, .55); }
    #voceScelta.voceFinestra h2 { margin: 0 0 10px; font-size: 1.25rem; }
    #voceScelta.voceFinestra p { margin: 0 0 8px; line-height: 1.4; }
    #voceScelta .nota, #voceScelta .note { font-size: .85rem; opacity: .8; }
    #voceScelta .voceBottoni { display: flex; flex-direction: column; gap: 8px; margin: 14px 0 6px; }
    #voceScelta .voceBottoni button { min-height: 48px; font-size: 1.02rem; text-align: left; padding: 10px 14px; }
    #voceScelta.voceFinestra .btn.ghost { background: transparent; color: var(--text); border: 1px solid var(--line); }
    #voceScelta .voceNiente { background: none; border: 0; color: inherit; opacity: .8; text-decoration: underline; cursor: pointer; padding: 6px 0; font: inherit; }
    #voceChat[aria-pressed="false"] { opacity: .55; }
    .voceSect .row output { min-width: 2.5em; text-align: right; }
    .voceSect .voceTasti { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
    .voceSeg { display: flex; flex-wrap: wrap; gap: 6px; }
    .voceSeg button[aria-pressed="true"] { outline: 2px solid currentColor; }`;
  const stile = document.createElement('style'); stile.textContent = STILE; document.head.append(stile);

  function domanda() {
    if ($('voceScelta')) return;
    const d = document.createElement('dialog');
    d.id = 'voceScelta'; d.className = CASA ? 'pref' : 'voceFinestra';
    d.setAttribute('aria-labelledby', 'voceSceltaTit'); d.setAttribute('aria-describedby', 'voceSceltaTesto');
    const btn = CASA ? 'b' : 'btn';
    d.innerHTML = `<h2 id="voceSceltaTit"></h2>
      <div id="voceSceltaTesto"><p></p><p></p><p></p></div>
      <div class="voceBottoni">
        <button type="button" class="${btn} go" data-v="schermo"></button>
        <button type="button" class="${btn}${CASA ? '' : ' ghost'}" data-v="chat"></button>
      </div>
      <button type="button" class="voceNiente" data-v="no"></button>
      <p class="${CASA ? 'nota' : 'note'}"></p>`;
    d.querySelector('h2').textContent = tr('Lettore dello schermo');
    const ps = d.querySelectorAll('#voceSceltaTesto p');
    ps[0].textContent = tr('LIBRE VTT può leggere ad alta voce.');
    ps[1].textContent = tr('Vuoi tenere il lettore dello schermo? Legge quello che tocchi, su cui vai con Tab o su cui fermi il mouse, le finestre che si aprono, gli avvisi e i nuovi messaggi della chat.');
    ps[2].textContent = tr('Altrimenti resta solo la lettura dei nuovi messaggi della chat, che puoi spegnere quando vuoi.');
    d.querySelector('[data-v="schermo"]').textContent = tr('🔊 Sì, tieni il lettore dello schermo');
    d.querySelector('[data-v="chat"]').textContent = tr('💬 No, leggi solo la chat');
    d.querySelector('[data-v="no"]').textContent = tr('Niente voce');
    d.querySelector('p.nota, p.note').textContent = tr('Se usi già VoiceOver, TalkBack o un altro lettore del sistema, scegli «Niente voce» per non sentire tutto due volte. Puoi cambiare idea dalla rotellina ⚙.');
    if (!puo) d.querySelector('[data-v="schermo"]').hidden = true;
    d.addEventListener('cancel', e => e.preventDefault());           // una scelta va fatta
    d.addEventListener('click', e => {
      const b = e.target.closest('button[data-v]'); if (!b) return;
      imposta(b.dataset.v);
      d.close(); d.remove();
      if (b.dataset.v === 'schermo') parla(tr('Lettore dello schermo acceso.'), { interrompi: true });
      else if (b.dataset.v === 'chat') parla(tr('Lettura della chat accesa.'), { interrompi: true });
      else zitto();
    });
    // Finché si sceglie la voce prova già a leggere (il browser la lascia partire al primo tasto o tocco):
    // chi non vede lo schermo sente la domanda e i pulsanti.
    const domandaAVoce = () => tr('Lettore dello schermo') + '. ' + [ps[0].textContent, ps[1].textContent, ps[2].textContent].join(' ');
    document.body.append(d);
    try { d.showModal(); } catch { d.setAttribute('open', ''); }
    parla(domandaAVoce(), { interrompi: true });
    const primo = d.querySelector('button[data-v]:not([hidden])');
    if (primo) { if (document.activeElement !== primo) primo.focus(); parla(descrivi(primo)); }      // dopo la domanda, il pulsante su cui sei
    d.addEventListener('focusin', e => { if (!schermo() && e.target.matches('button')) parla(descrivi(e.target), { interrompi: true }); });
  }
  // la si fa quando non c'è nessun'altra finestra aperta (nella home: dopo lingua e ID)
  function quandoLibero(fn) {
    let n = 0;
    const prova = () => {
      if (imp.modo) return;
      const pronta = !CASA || (() => { try { return !prefPrima; } catch { return n > 20; } })();   // nella home: quando sono arrivate le impostazioni dell'app
      if (pronta && !document.querySelector('dialog[open]')) return fn();
      if (++n < 2400) setTimeout(prova, 500);                       // al più 20 minuti
    };
    setTimeout(prova, 600);
  }
  // nella home: la scelta già salvata nelle impostazioni dell'app (anche se il browser ha perso la sua)
  function daPrefHome() {
    try { if (typeof PREF !== 'undefined' && PREF && MODI.includes(PREF.voce) && +PREF.voceT > (imp.t || 0)) imposta(PREF.voce, { daHome: true, quando: +PREF.voceT }); } catch {}
  }
  if (CASA) {
    let k = 0;
    const attendi = () => { let ok = false; try { ok = !prefPrima; } catch {} if (ok) daPrefHome(); else if (++k < 120) setTimeout(attendi, 250); };
    attendi();
  }
  if (CASA || TAVOLO) quandoLibero(domanda);

  // ---------- le impostazioni: nella home (rotellina) ----------
  function bottoniModo(box) {
    const voci = [['schermo', 'Lettore dello schermo'], ['chat', 'Solo chat'], ['no', 'Niente voce']];
    box.replaceChildren(...voci.map(([v, l]) => {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.v = v; b.textContent = tr(l);
      if (v === 'schermo' && !puo) b.disabled = true;
      b.onclick = () => { imposta(v); segna(); };
      return b;
    }));
    const segna = () => box.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === imp.modo)));
    segna(); listeners.add(segna);
  }
  if (CASA) {
    const dlg = $('impostazioni'), prima = dlg && [...dlg.querySelectorAll('h3')].find(h => /Plugin/.test(h.textContent));
    if (dlg) {
      const h = document.createElement('h3'); h.textContent = tr('Voce');
      const box = document.createElement('div'); box.className = 'seg'; box.id = 'impVoce';
      const nota = document.createElement('p'); nota.className = 'nota';
      nota.textContent = tr('Alt+Maiusc+L legge lo schermo · Alt+Maiusc+S la selezione · Alt+Maiusc+P pausa · Esc ferma. In chat: /leggi e /silenzio.');
      if (prima) prima.before(h, box, nota); else (dlg.querySelector('.piede') || dlg).before(h, box, nota);
      bottoniModo(box);
    }
  }

  // ---------- le impostazioni: al tavolo (Impostazioni › Voce e lettore dello schermo) ----------
  let riempiVoci = () => {};
  const sect = TAVOLO && document.querySelector('.sect[data-sect="voce"]');
  if (sect) {
    const box = document.createElement('div'); box.className = 'voceSect';
    (sect.querySelector('.sectContent') || sect).append(box);
    const el = (tag, props = {}, ...figli) => { const n = Object.assign(document.createElement(tag), props); figli.forEach(f => f != null && n.append(f)); return n; };
    const modo = el('div', { className: 'voceSeg' }); bottoniModo(modo);
    const spunta = (k, testo) => {
      const i = el('input', { type: 'checkbox', checked: !!imp[k] });
      i.addEventListener('change', () => { imp[k] = i.checked; scrivi(); listeners.forEach(f => f()); });
      listeners.add(() => { i.checked = !!imp[k]; });
      return el('label', { className: 'check' }, i, ' ' + tr(testo));
    };
    const cursore = (k, testo, min, max) => {
      const out = el('output', { textContent: imp[k].toFixed(1) });
      const i = el('input', { type: 'range', min, max, step: .1, value: imp[k] });
      i.addEventListener('input', () => { imp[k] = +i.value; out.textContent = imp[k].toFixed(1); });
      i.addEventListener('change', scrivi);
      return el('label', { className: 'row' }, tr(testo) + ' ', i, out);
    };
    const sel = el('select', { id: 'voceVoce' }); sel.setAttribute('data-noi18n', '');
    sel.addEventListener('change', () => { imp.voce = sel.value; scrivi(); });
    riempiVoci = () => {
      const l = lingua().toLowerCase(), mie = v => (v.lang || '').toLowerCase().startsWith(l) ? 0 : 1;
      const tutte = [...caricaVoci()].sort((a, b) => mie(a) - mie(b) || a.name.localeCompare(b.name));
      const auto = el('option', { value: '', textContent: tr('Automatica') });
      sel.replaceChildren(auto, ...tutte.map(v => el('option', { value: v.voiceURI, textContent: v.name + ' (' + v.lang + ')' })));
      sel.value = tutte.some(v => v.voiceURI === imp.voce) ? imp.voce : '';
    };
    const tasti = el('div', { className: 'voceTasti' },
      el('button', { type: 'button', className: 'btn', textContent: tr('▶ Leggi lo schermo'), onclick: leggiSchermo }),
      synth ? el('button', { type: 'button', className: 'btn ghost', textContent: tr('⏯ Pausa'), onclick: pausa }) : null,
      el('button', { type: 'button', className: 'btn ghost', textContent: tr('■ Stop'), onclick: () => zitto() }),
      el('button', { type: 'button', className: 'btn ghost', textContent: tr('Prova'), onclick: () => parla(tr('Questa è la voce del tavolo.'), { interrompi: true }) }));
    const mouse = spunta('mouse', 'Leggi quello su cui fermi il mouse');
    box.append(modo,
      spunta('chat', 'Leggi i nuovi messaggi della chat'), spunta('nomi', 'Dì chi ha scritto'),
      spunta('miei', 'Leggi anche i miei messaggi'), spunta('tiri', 'Leggi anche tiri di dado e calcoli'), mouse,
      synth ? el('label', { className: 'row' }, tr('Voce') + ' ', sel) : null,
      cursore('vel', 'Velocità', .5, 2), cursore('tono', 'Tono', .5, 2), cursore('vol', 'Volume', 0, 1),
      tasti,
      el('p', { className: 'note', textContent: tr('Alt+Maiusc+L legge lo schermo · Alt+Maiusc+S la selezione · Alt+Maiusc+P pausa · Esc ferma. In chat: /leggi e /silenzio.') }),
      el('p', { className: 'note', textContent: puo ? tr('Le voci le dà il sistema: se manca la tua lingua, aggiungi una voce nelle impostazioni del dispositivo.') : tr('Questo dispositivo non ha la sintesi vocale: la voce non può partire.') }));
    const vedi = () => { mouse.hidden = !schermo(); };
    listeners.add(vedi); vedi(); riempiVoci();
    addEventListener('lingua', riempiVoci);
  }

  // ---------- il 🔊 accanto a «Invia»: accende e spegne la lettura della chat ----------
  const invia = TAVOLO && $('chatSend');
  if (invia) {
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'voceChat'; b.className = 'btn ghost'; b.textContent = '🔊';
    const segna = () => {
      b.hidden = !imp.modo || imp.modo === 'no';
      b.setAttribute('aria-pressed', String(!!imp.chat));
      const t = tr(imp.chat ? 'Lettura della chat: accesa (clic per spegnerla)' : 'Lettura della chat: spenta (clic per accenderla)');
      b.title = t; b.setAttribute('aria-label', t);
    };
    b.addEventListener('click', () => {
      imp.chat = !imp.chat; scrivi(); listeners.forEach(f => f());
      if (imp.chat) parla(tr('Lettura della chat accesa.'), { interrompi: true }); else { zitto(); if (schermo()) parla(tr('Lettura della chat spenta.')); }
    });
    invia.before(b);
    listeners.add(segna); segna();
  }

  osserva();
  window.LIBRE_VOCE = { parla, zitto, pausa, leggiSchermo, leggiSelezione, imposta, get modo() { return imp.modo; }, disponibile: puo };
})();
