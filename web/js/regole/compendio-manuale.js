// ---------- Importare da un manuale che possiedi (PDF o testo incollato) ----------
// La lettura vera la fa manuale-lettore.js (window.ManualeParser), caricato solo quando si apre la
// finestra insieme ai suoi dizionari (manuale-srd.js: i nomi dell'SRD; manuale-parole.js: le parole
// inglesi). Il lettore mette in ordine le pagine a due colonne, ripulisce gli errori tipici dei PDF
// passati in OCR (titoli «A c id S p l a s h», parole spezzate «W hen», «6 th-level») e riconosce
// incantesimi, mostri, oggetti, talenti, suppliche, specie, classi (con le sottoclassi), background e
// condizioni. Si vedono tutte in un'anteprima, si correggono, e si salvano in un pacchetto «uso personale».
// Se il manuale è in inglese e il browser ha un traduttore (Chrome/Edge recenti), con la casella
// «Traduci in italiano» ogni voce riceve il testo italiano (in «testoIt», l'originale resta).
// La stessa traduzione si può chiedere quando si importa un pacchetto (.librepack/.json): vedi
// compendioTraduciPacchetto, usata da «Importa un pacchetto» in compendio.js.
//
// Le voci lette da un manuale finiscono in un pacchetto «privato»: restano solo su questo dispositivo
// (catalogo privato dell'app o, sul sito, il browser), non vanno al master, ai giocatori, al relay o al
// sito e non si esportano. Ognuno importa il proprio manuale. Prima di scegliere il file si conferma di
// possederlo; i PDF protetti (password, DRM, copia vietata) si rifiutano: vedi apriPdf in manuale-lettore.js.
(function () {
  'use strict';
  const tr = window.tr || (s => s);
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- 1. il traduttore del browser ----------
  const dalCompendio = (nome, da) => {
    const voci = (window.COMPENDIO && COMPENDIO.voci) || [], n = String(nome).toLowerCase();
    const v = voci.find(x => (da === 'en' ? x.en : (x.it || x._nomeOrig || x.nome)) && String(da === 'en' ? x.en : (x.it || x._nomeOrig || x.nome)).toLowerCase() === n);
    if (!v) return null;
    return da === 'en' ? (v.it || v._nomeOrig || v.nome) : v.en;
  };
  const nessuno = new Set();                             // coppie di lingue che il browser non ha: non si richiede
  async function traduttore(da, a) {
    if (nessuno.has(da + a)) return null;
    const t = await traduttore1(da, a);
    if (!t) nessuno.add(da + a);
    return t;
  }
  async function traduttore1(da, a) {
    try {
      if (!('Translator' in self)) return null;
      // alcuni browser hanno il traduttore ma non rispondono mai: dopo qualche secondo si va avanti senza
      const entro = (pr, ms) => Promise.race([pr, new Promise(ok => setTimeout(() => ok(null), ms))]);
      const st = await entro(Translator.availability({ sourceLanguage: da, targetLanguage: a }), 4000);
      if (!st || st === 'unavailable') return null;
      return await entro(Translator.create({ sourceLanguage: da, targetLanguage: a }), st === 'available' ? 8000 : 60000);
    } catch { return null; }
  }
  // ---------- 2. tradurre un pacchetto già importato (.librepack, .json) ----------
  // Le voci in inglese ricevono il testo italiano in «testoIt» (il VTT lo mostra con il compendio in
  // italiano) e il nome italiano (dal compendio SRD se c'è, altrimenti dal traduttore), con l'originale in «en».
  const inglese = t => { const s = String(t || '').toLowerCase(); return (s.match(/\b(the|of|and|you|your|with|this|that)\b/g) || []).length > (s.match(/\b(il|della|che|una|per|sono|gli|delle)\b/g) || []).length; };
  async function traduciVociIt(voci, t, avanza) {
    const T = async s => { if (!s || typeof s !== 'string') return s; try { return await t.translate(s); } catch { return s; } };
    const nomeIt = async o => { if (!o.nome || (o.en && o.en !== o.nome)) return; o.en = o.en || o.nome; o.nome = dalCompendio(o.nome, 'en') || await T(o.nome) || o.nome; };
    let fatte = 0, tradotte = 0;
    for (const v of voci) {
      avanza && avanza(++fatte, voci.length);
      if (v.testoIt || !inglese([v.testo, v.superiore, v.privilegio && v.privilegio.testo, ...(v.tratti || []).map(o => o.testo), ...(v.azioni || []).map(o => o.testo), ...(v.privilegi || []).map(o => o.testo), ...(v.livelli || []).flatMap(l => (Array.isArray(l.privilegi) ? l.privilegi : []).map(o => o.testo))].join(' '))) continue;
      tradotte++;
      await nomeIt(v);
      if (v.testo) v.testoIt = await T(v.testo);
      if (v.superiore && !v.superioreEn) { v.superioreEn = v.superiore; v.superiore = await T(v.superiore); }
      for (const k of ['tratti', 'azioni', 'azioniBonus', 'reazioni', 'leggendarie', 'privilegi'])
        for (const o of v[k] || []) { await nomeIt(o); if (o.testo && !o.testoEn) { o.testoEn = o.testo; o.testo = await T(o.testo); } }
      for (const l of v.livelli || []) for (const o of (Array.isArray(l.privilegi) ? l.privilegi : [])) { await nomeIt(o); if (o.testo && !o.testoEn) { o.testoEn = o.testo; o.testo = await T(o.testo); } }
      for (const ss of v.sottospecie || []) { await nomeIt(ss); if (ss.testo) ss.testo = await T(ss.testo); for (const o of ss.tratti || []) { await nomeIt(o); if (o.testo && !o.testoEn) { o.testoEn = o.testo; o.testo = await T(o.testo); } } }
      if (v.privilegio && v.privilegio.testo && !v.privilegio.en) { v.privilegio.en = v.privilegio.nome; v.privilegio.nome = await T(v.privilegio.nome); v.privilegio.testo = await T(v.privilegio.testo); }
    }
    return tradotte;
  }
  // il traduttore del browser c'è? (per la casella «traduci» dell'import)
  window.compendioTraduttoreDisponibile = async () => { const t = await traduttore('en', 'it'); if (t && t.destroy) t.destroy(); return !!t; };
  // traduce in italiano le voci inglesi del pacchetto «id» della campagna e le salva al loro posto
  window.compendioTraduciPacchetto = async function (id, avanza) {
    const t = await traduttore('en', 'it'); if (!t) throw new Error(tr('Questo browser non ha un traduttore.'));
    const r = await fetch('api/compendio', { cache: 'no-cache' }).then(x => x.json());
    const p = (r.pacchetti || []).find(x => x.id === id && !x.base); if (!p) throw new Error(tr('Pacchetto non trovato.'));
    const per = {};
    for (const tipo of p.tipi || []) { const a = await fetch(p.url + 'voci/' + tipo + '.json', { cache: 'no-cache' }).then(x => x.ok ? x.json() : []).catch(() => []); if (a.length) per[tipo] = a; }
    const tutte = Object.values(per).flat();
    const n = await traduciVociIt(tutte, t, avanza);
    if (n) {
      const s = await fetch('api/compendio/pacchetto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pacchetto: { id }, voci: per, unisci: id }) });
      if (!s.ok) throw new Error(await s.text());
    }
    return n;
  };

  // ---------- 3. il lettore, caricato quando serve ----------
  const carica = src => new Promise((ok, no) => {
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error(src)); document.head.appendChild(s);
  });
  async function lettore() {
    if (!window.ManualeParser) await carica('js/regole/manuale-lettore.js');
    if (!window.SRD_NOMI) await carica('js/regole/manuale-srd.js');
    if (!window.PAROLE_INGLESI) await carica('js/regole/manuale-parole.js');
    return window.ManualeParser;
  }
  let pdfjs = null;
  async function caricaPdfjs() {
    if (!pdfjs) {
      pdfjs = await import(new URL('lib/pdfjs.min.js', location.href).href);
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('lib/pdfjs.worker.min.js', location.href).href;
    }
    return pdfjs;
  }
  // per le prove: dal testo alle voci, come fa la finestra
  window.compendioManualeLeggi = async (txt, modo) => { const P = await lettore(); return P.leggi(P.righeDaTesto(txt), { srd: window.SRD_NOMI, parole: window.PAROLE_INGLESI, modo }).voci; };

  // ---------- 4. la finestra ----------
  const TIPI_V = [['', 'Riconosci da solo (tutto il manuale)'], ['incantesimo', 'Incantesimi'], ['mostro', 'Mostri'], ['oggetto', 'Oggetti magici'], ['talento', 'Talenti'], ['condizione', 'Condizioni'], ['specie', 'Specie'], ['background', 'Background'], ['classe', 'Classi e sottoclassi'], ['regola', 'Regole (divide ai titoli)']];
  const NOMI_T = { incantesimo: 'Incantesimo', mostro: 'Mostro', oggetto: 'Oggetto', talento: 'Talento', condizione: 'Condizione', specie: 'Specie', background: 'Background', classe: 'Classe', sottoclasse: 'Sottoclasse', regola: 'Regola' };
  const quanti = a => (Array.isArray(a) ? a.length : 0);
  const riassunto = v => v.tipo === 'incantesimo' ? `${v.livello ? tr('livello {n}', { n: v.livello }) : tr('trucchetto')} · ${v.scuola || ''}${v.tempo ? ' · ' + v.tempo : ''}`
    : v.tipo === 'mostro' ? `${[v.taglia, v.tipoCreatura].filter(Boolean).join(' ')} · CA ${v.ca ?? '?'} · PF ${v.pf ?? '?'} · GS ${v.gs ?? '?'} · ${quanti(v.azioni)} ${tr('azioni')}`
      : v.tipo === 'oggetto' ? `${v.categoria || ''} · ${v.rarita || ''}${v.sintonia ? ' · ' + tr('sintonia') : ''}`
        : v.tipo === 'specie' ? tr('{n} tratti, {s} sottospecie', { n: quanti(v.tratti), s: quanti(v.sottospecie) })
          : v.tipo === 'classe' ? tr('{n} privilegi nei 20 livelli', { n: (v.livelli || []).reduce((s, l) => s + quanti(l.privilegi), 0) })
            : v.tipo === 'sottoclasse' ? `${v.classe || ''}${v.famiglia ? ' · ' + v.famiglia : ''} · ${tr('{n} privilegi', { n: quanti(v.privilegi) })}`
              : v.tipo === 'background' ? (v.privilegio && v.privilegio.nome ? tr('Privilegio: {p}', { p: v.privilegio.nome }) : (v.testo || '').slice(0, 90))
                : (v.testo || '').slice(0, 90);

  window.apriImportaManuale = function () {
    const dlg = document.createElement('dialog'); dlg.className = 'compDlg compMan';
    dlg.innerHTML = `<h3>📖 ${esc(tr('Importa da un manuale che possiedi'))}</h3>
      <p class="note">${esc(tr('Per i manuali che hai comprato (PDF con il testo, anche scansioni passate in OCR).'))}</p>
      <div class="compManPatto">
        <p class="note">🔒 ${esc(tr('Le voci restano solo su questo dispositivo, in un catalogo privato: non vanno al master, agli altri giocatori, al relay o al sito, e non si esportano. Ognuno importa il proprio manuale.'))}</p>
        <p class="note">🛡 ${esc(tr('LIBRE VTT non toglie protezioni: i PDF con password, DRM o con la copia del testo vietata non si leggono.'))}</p>
        <label class="check"><input type="checkbox" data-k="patto"> ${esc(tr('Confermo che possiedo questo manuale e che lo importo solo per uso personale.'))}</label>
      </div>
      <div class="compEdG">
        <label>${esc(tr('Che cosa contiene'))}<select data-k="tipo">${TIPI_V.map(([k, n]) => `<option value="${k}">${esc(tr(n))}</option>`).join('')}</select></label>
        <label>${esc(tr('Lingua del manuale'))}<select data-k="lingua"><option value="">${esc(tr('La riconosco io'))}</option><option value="it">Italiano</option><option value="en">English</option></select></label>
        <label>${esc(tr('Pagine (da–a)'))}<span class="row"><input data-k="da" type="number" min="1" placeholder="1" style="width:70px"> – <input data-k="a" type="number" min="1" placeholder="${esc(tr('fine'))}" style="width:70px"></span></label>
        <label>${esc(tr('Nome del pacchetto'))}<input data-k="nome" placeholder="${esc(tr('es. Manuale del Giocatore'))}"></label>
      </div>
      <label class="check"><input type="checkbox" data-k="trad" disabled> ${esc(tr('Traduci in italiano le voci in inglese'))}</label>
      <p class="note" data-k="tradNota">${esc(tr('Controllo se il browser ha un traduttore…'))}</p>
      <div class="row compManFonte"><button type="button" class="btn" data-a="pdf" disabled>📄 ${esc(tr('Scegli il PDF…'))}</button><button type="button" class="btn ghost" data-a="incolla" disabled>📋 ${esc(tr('Incolla il testo…'))}</button></div>
      <textarea data-k="testo" rows="8" hidden placeholder="${esc(tr('Incolla qui il testo copiato dal manuale, poi premi «Leggi il testo».'))}"></textarea>
      <div class="row" data-k="leggiRiga" hidden><button type="button" class="btn" data-a="leggi" disabled>${esc(tr('Leggi il testo'))}</button></div>
      <p class="note" data-k="stato"></p>
      <div class="row compManStrum" data-k="strum" hidden><label class="check"><input type="checkbox" data-k="soloDubbi"> ${esc(tr('Mostra solo le voci da controllare'))}</label></div>
      <p class="note" data-k="iaNota" hidden></p>
      <div class="compManLista" data-k="lista"></div>
      <div class="dialogBtns"><button type="button" class="btn ghost" data-a="tutti" hidden>${esc(tr('Seleziona tutti'))}</button><span style="flex:1"></span><button type="button" class="btn ghost" data-a="chiudi">${esc(tr('Chiudi'))}</button><button type="button" class="btn" data-a="salva" hidden>${esc(tr('Salva nel compendio'))}</button></div>`;
    document.body.appendChild(dlg); dlg.showModal();
    dlg.addEventListener('close', () => dlg.remove());
    const $d = k => dlg.querySelector(`[data-k="${k}"]`);
    const stato = t => { $d('stato').textContent = t || ''; };
    let voci = [], lingua = 'en', fileNome = '';
    // senza la conferma non si sceglie niente
    const patto = () => $d('patto').checked;
    $d('patto').addEventListener('change', () => { dlg.querySelectorAll('[data-a=pdf],[data-a=incolla],[data-a=leggi]').forEach(b => { b.disabled = !patto(); }); });
    window.compendioTraduttoreDisponibile().then(ok => {
      $d('trad').disabled = !ok; $d('trad').checked = ok;
      $d('tradNota').textContent = ok ? tr('Il testo lo traduce il traduttore del browser, sul tuo computer: ci vuole qualche minuto per un manuale intero. Controlla le voci importanti.')
        : tr('Questo browser non ha un traduttore (c\'è in Chrome e in Edge recenti, non in Brave, Safari o Firefox): il testo resta nella sua lingua. Puoi tradurlo dopo con «Scarica il file da tradurre», o aprire il VTT in Chrome e importarlo di nuovo.');
    });
    lettore().catch(() => {});                           // si comincia a scaricare il lettore subito
    const indovinaLingua = righe => {
      const s = righe.slice(0, 400).map(r => r.t).join(' ').toLowerCase();
      const it = (s.match(/\b(il|della|delle|che|una|per|con|sono|dei|gli)\b/g) || []).length, en = (s.match(/\b(the|of|and|to|with|you|your|is|are|this)\b/g) || []).length;
      return it > en ? 'it' : 'en';
    };
    function mostra() {
      $d('lista').innerHTML = voci.length ? voci.map((v, i) => `<details class="compManV" data-i="${i}"><summary><input type="checkbox" data-c="ok" ${v._no ? '' : 'checked'}>
          <select data-c="tipo">${Object.entries(NOMI_T).map(([k, n]) => `<option value="${k}" ${k === v.tipo ? 'selected' : ''}>${esc(tr(n))}</option>`).join('')}</select>
          <input data-c="nome" value="${esc(v.nome)}"> ${v._dubbi ? `<span class="compManDubbio" title="${esc(v._dubbi.join(' · '))}">⚠</span>` : ''} <small>${esc(riassunto(v))}</small></summary>
          ${v._dubbi ? `<p class="note compManDubbi">⚠ ${esc(tr('Da controllare:'))} ${esc(v._dubbi.join(' · '))}</p>` : ''}
          <textarea data-c="testo" rows="6">${esc(v.testo || '')}</textarea>
          ${v.tipo === 'mostro' ? `<p class="note">${esc(tr('Azioni lette:'))} ${esc([...(v.tratti || []), ...(v.azioni || []), ...(v.azioniBonus || []), ...(v.reazioni || []), ...(v.leggendarie || [])].map(a => a.nome).join(' · ') || '—')}</p>` : ''}
          ${v.tipo === 'specie' || v.tipo === 'sottoclasse' ? `<p class="note">${esc([...(v.tratti || []), ...(v.privilegi || [])].map(a => a.nome).join(' · ') || '—')}</p>` : ''}
          <p class="note">${esc(tr('Il resto (per esempio le caratteristiche o le azioni) lo correggi dopo nel compendio, con «Modifica».'))}</p></details>`).join('')
        : `<p class="note">${esc(tr('Non ho trovato voci. Prova a scegliere il tipo a mano (per esempio «Condizioni»), o un intervallo di pagine più preciso.'))}</p>`;
      dlg.querySelector('[data-a=salva]').hidden = !voci.length;
      dlg.querySelector('[data-a=tutti]').hidden = !voci.length;
      const dubbi = voci.filter(v => v._dubbi).length;
      $d('strum').hidden = !dubbi;
      filtra();
      if (dubbi) notaDubbi(); else $d('iaNota').hidden = true;
    }
    function filtra() { const solo = $d('soloDubbi').checked; dlg.querySelectorAll('.compManV').forEach(el => { el.hidden = solo && !voci[+el.dataset.i]._dubbi; }); }
    function notaDubbi() { $d('iaNota').hidden = false; $d('iaNota').textContent = tr('{n} voci da controllare: sono segnate con ⚠ e il motivo. Correggile qui sotto prima di salvare, o dopo nel compendio.', { n: voci.filter(v => v._dubbi).length }); }
    dlg.addEventListener('input', e => {
      const box = e.target.closest('.compManV'); if (!box) return;
      const v = voci[+box.dataset.i], c = e.target.dataset.c;
      if (c === 'ok') v._no = !e.target.checked; else if (c && c !== 'tipo') v[c] = e.target.value;
    });
    $d('soloDubbi').addEventListener('change', filtra);
    dlg.addEventListener('change', e => { const box = e.target.closest('.compManV'); if (box && e.target.dataset.c === 'tipo') voci[+box.dataset.i].tipo = e.target.value; });
    async function leggi(righe) {
      stato(tr('Ripulisco il testo e cerco le voci…'));
      await new Promise(ok => setTimeout(ok, 30));      // fa vedere il messaggio prima del lavoro lungo
      const P = await lettore();
      lingua = $d('lingua').value || indovinaLingua(righe);
      voci = P.leggi(righe, { srd: window.SRD_NOMI, parole: window.PAROLE_INGLESI, modo: $d('tipo').value }).voci;
      const conta = {}; for (const v of voci) conta[v.tipo] = (conta[v.tipo] || 0) + 1;
      stato(tr('{n} voci trovate (manuale in {l}). Controlla, togli la spunta a quelle che non vuoi e salva.', { n: voci.length, l: tr(lingua === 'it' ? 'italiano' : 'inglese') })
        + (voci.length ? ' (' + Object.entries(conta).map(([k, n]) => `${tr(NOMI_T[k] || k)}: ${n}`).join(', ') + ')' : ''));
      mostra();
    }
    dlg.addEventListener('click', async e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'chiudi') return dlg.close();
      if ((a === 'pdf' || a === 'incolla' || a === 'leggi' || a === 'salva') && !patto()) return stato(tr('Prima conferma che possiedi il manuale.'));
      if (a === 'tutti') { voci.forEach(v => { v._no = false; }); dlg.querySelectorAll('[data-c=ok]').forEach(x => { x.checked = true; }); return; }
      if (a === 'incolla') { $d('testo').hidden = false; $d('leggiRiga').hidden = false; $d('testo').focus(); return; }
      if (a === 'leggi') {
        fileNome = fileNome || tr('Testo incollato');
        try { const P = await lettore(); return await leggi(P.righeDaTesto($d('testo').value)); }
        catch (err) { return stato(tr('Non riesco a leggere questo testo: {e}', { e: err.message })); }
      }
      if (a === 'pdf') {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.pdf,application/pdf';
        inp.onchange = async () => {
          const f = inp.files && inp.files[0]; if (!f) return;
          fileNome = f.name.replace(/\.pdf$/i, '');
          if (!$d('nome').value) $d('nome').value = fileNome;
          try {
            stato(tr('Leggo il PDF…'));
            const [P, lib] = await Promise.all([lettore(), caricaPdfjs()]);
            const righe = await P.righeDaPdf(lib, await f.arrayBuffer(), { da: +$d('da').value || 1, a: +$d('a').value || 0, avanza: (n, t) => stato(tr('Leggo la pagina {n} di {t}…', { n, t })) });
            if (!righe.some(r => r.t)) return stato(tr('In questo PDF non c\'è testo: probabilmente è una scansione senza OCR. Non lo posso leggere.'));
            await leggi(righe);
          } catch (err) {
            if (err && err.code === 'PDF_PROTETTO') stato(tr('Questo PDF è protetto ({m}): LIBRE VTT non toglie le protezioni e non lo legge. Usa un PDF senza protezioni del manuale che possiedi.', { m: tr(err.motivo) }));
            else stato(tr('Non riesco a leggere questo PDF: {e}', { e: err.message }));
          }
        };
        inp.click(); return;
      }
      if (a === 'salva') {
        const scelte = voci.filter(v => !v._no && v.nome);
        if (!scelte.length) return stato(tr('Scegli almeno una voce.'));
        b.disabled = true;
        try {
          const P = await lettore();
          const nomeP = $d('nome').value.trim() || fileNome || tr('Manuale');
          const out = P.pacchetto(scelte, { srd: window.SRD_NOMI, nome: nomeP, lingua });
          out.pacchetto.licenza = tr('Copiato da un manuale che possiedi: solo per uso personale, non va condiviso.');
          out.pacchetto.privato = true; out.pacchetto.usoPersonale = true;
          const tutte = Object.values(out.voci).flat();
          let tradotte = 0, nota = '';
          if ($d('trad').checked && lingua === 'en') {
            const t = await traduttore('en', 'it');
            if (t) {
              try { tradotte = await traduciVociIt(tutte, t, (n, tot) => stato(tr('Traduco in italiano: {n} di {t}…', { n, t: tot }))); }
              catch (err) { nota = ' ' + tr('La traduzione non è riuscita: {e}', { e: err.message }); }
            } else nota = ' ' + tr('Questo browser non ha un traduttore.');
          }
          stato(tr('Salvo…'));
          await compendioSalvaPacchetto(out.pacchetto, out.voci);
          stato('');
          alert(tr('{n} voci salvate nel pacchetto «{p}».', { n: tutte.length, p: nomeP }) + (tradotte ? ' ' + tr('{n} voci tradotte in italiano.', { n: tradotte }) : '') + nota);
          dlg.close();
        } catch (err) { stato(tr('Non sono riuscito a salvarle: {e}', { e: err.message })); b.disabled = false; }
      }
    });
  };
})();
