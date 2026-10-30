// ---------- 📚 Il compendio ----------
// Un archivio con ricerca dentro il tavolo: mostri, incantesimi, oggetti, talenti, classi,
// sottoclassi, specie, background, condizioni e regole. Arriva tutto da «pacchetti»:
//   - quelli di base del sistema (SRD 5.1 per il 2014, SRD 5.2 per il 2024), dentro il programma;
//   - quelli della campagna (importati da file, da Open5e, dall'homebrew di 5etools, da CSV, o fatti a mano).
// Il master sceglie cosa vedono i giocatori (pacchetti interi o singole voci); in partita gli manda
// l'elenco e, per i pacchetti della campagna, il contenuto come un file del deposito (gs:<hash>).
//
// Una voce: { id, tipo, nome, en?, fonte, testo, …campi del suo tipo } (vedi strumenti/srd/converti.js).
(function () {
  const tr = window.tr || (s => s);
  const $ = id => document.getElementById(id);
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const conduco = () => typeof isMaster !== 'function' || isMaster();
  const inRete = () => typeof NET !== 'undefined' && NET.on;
  const giocatore = () => inRete() && !conduco();

  const TIPI = [
    ['mostro', 'Mostri', 'Mostro'], ['incantesimo', 'Incantesimi', 'Incantesimo'], ['oggetto', 'Oggetti', 'Oggetto'],
    ['talento', 'Talenti', 'Talento'], ['classe', 'Classi', 'Classe'], ['sottoclasse', 'Sottoclassi', 'Sottoclasse'],
    ['specie', 'Specie', 'Specie'], ['background', 'Background', 'Background'], ['condizione', 'Condizioni', 'Condizione'], ['regola', 'Regole', 'Regola']
  ];
  const nomeTipo = t => tr((TIPI.find(x => x[0] === t) || [, , t])[2]);

  // ---------- i dati ----------
  const C = window.COMPENDIO = {
    pacchetti: [],               // { id, nome, base, url | hash, tipi, licenza, fonte, usoPersonale, nascoste? }
    voci: [],                    // tutte, con _p (id del pacchetto)
    vis: { pacchetti: {}, voci: {}, giocatoriImportano: false },
    pronto: false, caricando: null
  };
  const chiave = v => v._p + '|' + v.id;
  const visibilePack = p => (C.vis.pacchetti[p.id] || p.visibile || 'tutti') !== 'master';
  const visibileVoce = v => (C.vis.voci[chiave(v)] || (visibilePack(C.pacchetti.find(p => p.id === v._p) || {}) ? 'tutti' : 'master')) !== 'master';

  const prendi = u => fetch(u, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null);
  async function caricaPack(p, filtro) {
    const voci = [];
    if (p.hash) {                                     // arrivato dal master: un file solo con tutto dentro
      const j = await prendi(typeof netAssetUrl === 'function' ? netAssetUrl(p.hash) : 'asset/' + p.hash);
      if (j && j.voci) for (const arr of Object.values(j.voci)) voci.push(...arr);
    } else {
      for (const t of p.tipi || []) { const arr = await prendi(p.url + 'voci/' + t + '.json'); if (Array.isArray(arr)) voci.push(...arr); }
    }
    for (const v of voci) v._p = p.id;
    return filtro ? voci.filter(filtro) : voci;
  }
  async function carica() {
    if (C.caricando) return C.caricando;
    C.caricando = (async () => {
      stato(tr('Carico il compendio…'));
      let elenco = [];
      if (giocatore()) {
        const w = NET.world && NET.world.compendio;
        const sis = (NET.world && NET.world.sistema && NET.world.sistema.id) || 'dnd5e-2014';
        for (const p of (w && w.pacchetti) || []) {
          const x = { ...p };
          if (p.base && !p.hash) x.url = /^[\w.-]+$/.test(sis) && sis !== 'personalizzato' ? `sistemi/${sis}/compendio/${p.id}/` : null;
          if (x.url || x.hash) elenco.push(x);
        }
        C.vis = { pacchetti: {}, voci: {}, giocatoriImportano: !!(w && w.giocatoriImportano) };
        if (C.vis.giocatoriImportano) {                 // i pacchetti che il giocatore ha importato per sé
          const mio = await prendi('api/compendio');
          for (const p of (mio && mio.pacchetti) || []) if (!p.base) elenco.push({ ...p, mio: true });
        }
      } else {
        const r = await prendi('api/compendio');
        if (r) { elenco = r.pacchetti || []; C.vis = { pacchetti: {}, voci: {}, giocatoriImportano: false, ...(r.visibilita || {}) }; }
        else {                                          // senza server: almeno quello di base
          const sis = (typeof SISTEMA !== 'undefined' && SISTEMA.id) || 'dnd5e-2014';
          for (const id of ['srd-5.1', 'srd-5.2']) { const p = await prendi(`sistemi/${sis}/compendio/${id}/pacchetto.json`); if (p) elenco.push({ ...p, base: true, url: `sistemi/${sis}/compendio/${id}/`, tipi: Object.keys(p.voci || {}) }); }
        }
      }
      C.pacchetti = elenco;
      const tutte = [];
      for (const p of elenco) {
        const nasc = new Set(p.nascoste || []);
        tutte.push(...await caricaPack(p, nasc.size ? v => !nasc.has(v.id) : null));
      }
      // in inglese si mostrano i nomi originali (quelli italiani restano per cercare)
      if (window.LIBRE_I18N && LIBRE_I18N.lingua === 'en') for (const v of tutte) if (v.en && v.en !== v.nome) { v.it = v.nome; v.nome = v.en; }
      C.voci = tutte;
      C.pronto = true;
      stato('');
      riempiFiltri(); disegna();
      dispatchEvent(new CustomEvent('libre-compendio'));
      if (conduco() && inRete() && typeof scheduleBoardSave === 'function') { C._rete = null; scheduleBoardSave(); }
      C.caricando = null;
    })();
    return C.caricando;
  }
  window.ricaricaCompendio = () => { C.pronto = false; C.caricando = null; return carica(); };
  const stato = t => { const e = $('compStato'); if (e) { e.textContent = t || ''; e.hidden = !t; } };

  // ---------- in partita: cosa vedono i giocatori ----------
  // Il master manda l'elenco dei pacchetti visibili; per quelli della campagna prepara un file JSON
  // con le sole voci visibili e lo mette nel deposito (come le immagini). Si rifà solo quando cambia.
  C.perRete = async function () {
    if (!C.pronto || !conduco()) return null;
    const firma = JSON.stringify([C.pacchetti.map(p => p.id), C.vis]);
    if (C._rete && C._reteFirma === firma) return C._rete;
    const out = { pacchetti: [], giocatoriImportano: !!C.vis.giocatoriImportano };
    for (const p of C.pacchetti) {
      if (!visibilePack(p) && !Object.entries(C.vis.voci).some(([k, v]) => k.startsWith(p.id + '|') && v === 'tutti')) continue;
      const sue = C.voci.filter(v => v._p === p.id);
      const nascoste = sue.filter(v => !visibileVoce(v)).map(v => v.id);
      const testa = { id: p.id, nome: p.nome, base: !!p.base, licenza: p.licenza, fonte: p.fonte, tipi: p.tipi };
      if (p.base) { out.pacchetti.push({ ...testa, nascoste }); continue; }
      const voci = {};
      for (const v of sue) if (visibileVoce(v)) { const c = { ...v }; delete c._p; (voci[v.tipo] = voci[v.tipo] || []).push(c); }
      const buf = new TextEncoder().encode(JSON.stringify({ pacchetto: testa, voci }));
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(b => b.toString(16).padStart(2, '0')).join('');
      if (typeof netPutAsset === 'function' && !(NET.assetKnown && NET.assetKnown.has(hash))) { if (await netPutAsset(hash, buf, 'application/json', p.nome + '.json')) NET.assetKnown && NET.assetKnown.add(hash); }
      out.pacchetti.push({ ...testa, hash });
    }
    C._rete = out; C._reteFirma = firma;
    return out;
  };
  window.compendioDalMaster = function (w) {
    if (!giocatore() || !w) return;
    const f = JSON.stringify(w);
    if (f === C._daMaster) return;
    C._daMaster = f;
    window.ricaricaCompendio();
  };

  // ---------- ricerca e filtri ----------
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const F = { q: '', tipo: '', extra: {} };
  function riempiFiltri() {
    const sel = $('compTipo');
    if (!sel.options.length) {
      sel.append(new Option(tr('Tutti i tipi'), ''), ...TIPI.map(([k, pl]) => new Option(tr(pl), k)));
      sel.value = 'mostro'; F.tipo = 'mostro';
    }
    filtriExtra();
  }
  const valori = (fn) => [...new Set(C.voci.filter(v => v.tipo === F.tipo).map(fn).filter(x => x !== undefined && x !== null && x !== ''))];
  function filtriExtra() {
    const box = $('compFiltri'); box.replaceChildren();
    const sel = (k, nome, opz) => {
      const s = document.createElement('select'); s.dataset.k = k; s.setAttribute('aria-label', tr(nome));
      s.append(new Option(tr(nome) + ': ' + tr('tutti'), ''), ...opz.map(o => Array.isArray(o) ? new Option(o[1], o[0]) : new Option(o, o)));
      s.value = F.extra[k] || '';
      s.addEventListener('change', () => { F.extra[k] = s.value; disegna(); });
      box.append(s);
    };
    const GSN = g => g === '1/8' ? 0.125 : g === '1/4' ? 0.25 : g === '1/2' ? 0.5 : +g;
    if (F.tipo === 'mostro') {
      const g = valori(v => v.gs).sort((a, b) => GSN(a) - GSN(b));
      sel('gsMin', 'GS da', g); sel('gsMax', 'GS fino a', g);
      sel('creatura', 'Tipo', valori(v => v.tipoCreatura).sort());
    } else if (F.tipo === 'incantesimo') {
      sel('livello', 'Livello', valori(v => v.livello).sort((a, b) => a - b).map(l => [String(l), l ? tr('Livello {n}', { n: l }) : tr('Trucchetti')]));
      sel('scuola', 'Scuola', valori(v => v.scuola).sort());
      sel('classe', 'Classe', [...new Set(C.voci.filter(v => v.tipo === 'incantesimo').flatMap(v => v.classi || []))].sort());
    } else if (F.tipo === 'oggetto') {
      sel('categoria', 'Categoria', valori(v => v.categoria).sort());
      sel('rarita', 'Rarità', valori(v => v.rarita));
    }
    if (C.pacchetti.length > 1) sel('pack', 'Fonte', C.pacchetti.map(p => [p.id, p.nome]));
  }
  function filtra() {
    const q = norm(F.q).trim(), x = F.extra;
    const GSN = g => g === '1/8' ? 0.125 : g === '1/4' ? 0.25 : g === '1/2' ? 0.5 : +g;
    return C.voci.filter(v => {
      if (F.tipo && v.tipo !== F.tipo) return false;
      if (x.pack && v._p !== x.pack) return false;
      if (q && !norm(v.nome).includes(q) && !norm(v.en).includes(q) && !norm(v.it).includes(q)) return false;
      if (v.tipo === 'mostro' && F.tipo === 'mostro') {
        if (x.gsMin && GSN(v.gs) < GSN(x.gsMin)) return false;
        if (x.gsMax && GSN(v.gs) > GSN(x.gsMax)) return false;
        if (x.creatura && v.tipoCreatura !== x.creatura) return false;
      }
      if (v.tipo === 'incantesimo' && F.tipo === 'incantesimo') {
        if (x.livello !== undefined && x.livello !== '' && String(v.livello) !== x.livello) return false;
        if (x.scuola && v.scuola !== x.scuola) return false;
        if (x.classe && !(v.classi || []).includes(x.classe)) return false;
      }
      if (v.tipo === 'oggetto' && F.tipo === 'oggetto') {
        if (x.categoria && v.categoria !== x.categoria) return false;
        if (x.rarita && v.rarita !== x.rarita) return false;
      }
      return true;
    });
  }
  function riassunto(v) {
    if (v.tipo === 'mostro') return `${tr('GS')} ${v.gs} · ${v.taglia || ''} ${v.tipoCreatura || ''}`.trim();
    if (v.tipo === 'incantesimo') return (v.livello ? tr('Livello {n}', { n: v.livello }) : tr('Trucchetto')) + ' · ' + (v.scuola || '');
    if (v.tipo === 'oggetto') return [v.categoria, v.rarita, v.costo].filter(Boolean).join(' · ');
    if (v.tipo === 'sottoclasse') return v.classe || '';
    if (v.tipo === 'talento') return v.categoria || '';
    return nomeTipo(v.tipo);
  }
  const MAX = 250;
  function disegna() {
    const L = $('compLista'); if (!L) return;
    if (!C.pronto) { L.replaceChildren(); return; }
    const tutte = filtra();
    const righe = tutte.slice(0, MAX).map(v => {
      const d = document.createElement('div');
      d.className = 'compVoce' + (conduco() && !visibileVoce(v) ? ' nascosta' : '');
      d.setAttribute('role', 'listitem'); d.dataset.k = chiave(v); d.draggable = true; d.tabIndex = 0;
      const b = document.createElement('b'); b.textContent = v.nome;
      const sm = document.createElement('small'); sm.textContent = riassunto(v) + (v.en && v.en !== v.nome ? ' · ' + v.en : '');
      d.append(b, sm);
      if (conduco() && !visibileVoce(v)) { const n = document.createElement('span'); n.className = 'compNasc'; n.textContent = '🙈'; n.title = tr('I giocatori non la vedono'); d.append(n); }
      d.addEventListener('click', () => apri(v));
      d.addEventListener('keydown', e => { if (e.key === 'Enter') apri(v); });
      d.addEventListener('dragstart', e => { e.dataTransfer.setData('application/x-voce', chiave(v)); e.dataTransfer.effectAllowed = 'copy'; });
      return d;
    });
    L.replaceChildren(...righe);
    if (tutte.length > MAX) { const p = document.createElement('p'); p.className = 'note'; p.textContent = tr('… e altre {n}: scrivi qualcosa per restringere.', { n: tutte.length - MAX }); L.append(p); }
    if (!tutte.length) { const p = document.createElement('p'); p.className = 'note'; p.textContent = C.voci.length ? tr('Niente con questi filtri.') : tr('Il compendio è vuoto: importa un pacchetto o crea una voce.'); L.append(p); }
  }
  const trovaK = k => C.voci.find(v => chiave(v) === k);
  window.voceCompendio = trovaK;

  // ---------- la finestra di una voce ----------
  function md(t) {                                        // un markdown molto piccolo, sicuro (tutto viene «escaped»)
    const righe = String(t || '').replace(/\r/g, '').split('\n');
    let out = '', lista = false, tab = false;
    const inl = s => esc(s).replace(/\[\[\s*([^\]|]+?)\s*(?:\|\s*([^\]]+?)\s*)?\]\]/g, (_, e, n) => tira(e, n || e)).replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\W)[*_](\S.*?\S|\S)[*_](?=\W|$)/g, '$1<i>$2</i>');
    const chiudi = () => { if (lista) { out += '</ul>'; lista = false; } if (tab) { out += '</table>'; tab = false; } };
    for (const r0 of righe) {
      const r = r0.trim();
      if (!r) { chiudi(); continue; }
      let m;
      if ((m = /^#{1,6}\s+(.*)$/.exec(r))) { chiudi(); out += `<h5>${inl(m[1])}</h5>`; continue; }
      if (/^\|.*\|$/.test(r)) {
        if (/^\|[\s:|-]+\|$/.test(r)) continue;
        if (!tab) { chiudi(); out += '<table class="compTab">'; tab = true; }
        out += '<tr>' + r.slice(1, -1).split('|').map(c => `<td>${inl(c.trim())}</td>`).join('') + '</tr>';
        continue;
      }
      if ((m = /^[-*•]\s+(.*)$/.exec(r))) { if (tab) chiudi(); if (!lista) { out += '<ul>'; lista = true; } out += `<li>${inl(m[1])}</li>`; continue; }
      chiudi(); out += `<p>${inl(r)}</p>`;
    }
    chiudi();
    return out;
  }
  const lbKg = lb => lb == null ? '' : `${String(lb).replace('.', ',')} lb (${String(Math.round(lb * 0.5 * 100) / 100).replace('.', ',')} kg)`;
  const mod = n => Math.floor((n - 10) / 2), sg = n => (n >= 0 ? '+' : '−') + Math.abs(n);
  const CARN = { str: 'FOR', dex: 'DES', con: 'COS', int: 'INT', wis: 'SAG', cha: 'CAR' };
  const tira = (expr, nome) => `<button type="button" class="chipRoll" data-tiro="${esc(expr)}" data-nome="${esc(nome)}" title="${esc(expr)}">🎲 ${esc(nome)}</button>`;
  const riga = (et, val) => val === undefined || val === null || val === '' ? '' : `<div class="cvR"><span>${esc(tr(et))}</span><b>${typeof val === 'string' && val.startsWith('<') ? val : esc(val)}</b></div>`;

  function corpoVoce(v) {
    let h = `<div class="cvTesta"><small>${esc(nomeTipo(v.tipo))}${v.en && v.en !== v.nome ? ' · ' + esc(v.en) : ''} · ${esc(v.fonte || '')}</small></div>`;
    const azioni = (titolo, arr) => arr && arr.length ? `<h4>${esc(tr(titolo))}</h4>` + arr.map(a => {
      let bt = '';
      if (Number.isFinite(a.colpire)) bt += tira('1d20' + (a.colpire >= 0 ? '+' : '') + a.colpire, a.nome);
      for (const d of a.danni || []) bt += tira(d.dadi, `${a.nome}: ${d.tipo || tr('danni')}`);
      if (a.cd) bt += `<span class="cvCd">${esc(tr('CD {n}', { n: a.cd.valore }))}${a.cd.car ? ' ' + esc(CARN[a.cd.car] || '') : ''}</span>`;
      return `<div class="cvAz"><p><b><i>${esc(a.nome)}${a.uso ? ` (${esc(a.uso)})` : ''}.</i></b> ${md(a.testo).replace(/^<p>|<\/p>$/g, '')}</p>${bt ? `<div class="cvTiri">${bt}</div>` : ''}</div>`;
    }).join('') : '';
    switch (v.tipo) {
      case 'mostro': {
        h += `<p class="cvSott">${esc([v.taglia, v.tipoCreatura, v.sottotipo ? `(${v.sottotipo})` : ''].filter(Boolean).join(' '))}${v.allineamento ? ', ' + esc(v.allineamento) : ''}</p>`;
        h += '<div class="cvGriglia">' + riga('Classe armatura', `${v.ca ?? ''}${v.caNota ? ` (${v.caNota})` : ''}`) +
          riga('Punti ferita', v.dadiPf ? `<span>${esc(v.pf)} ${tira(v.dadiPf, tr('PF'))}</span>` : v.pf) + riga('Velocità', v.velocita) + riga('Grado di sfida', `${v.gs}${v.px != null ? ` (${v.px} ${tr('PE')})` : ''}`) + '</div>';
        if (v.car) h += '<div class="cvCar">' + Object.entries(v.car).map(([k, n]) => `<button type="button" class="cvCarB" data-tiro="1d20${mod(n) >= 0 ? '+' : ''}${mod(n)}" data-nome="${esc(tr('Prova di {c}', { c: CARN[k] }))}"><small>${CARN[k]}</small><b>${n}</b><span>${sg(mod(n))}</span></button>`).join('') + '</div>';
        h += '<div class="cvGriglia">' +
          riga('Tiri salvezza', v.ts ? Object.entries(v.ts).map(([k, n]) => `${CARN[k]} ${sg(n)}`).join(', ') : '') +
          riga('Abilità', v.abilita ? Object.entries(v.abilita).map(([k, n]) => `${k} ${sg(n)}`).join(', ') : '') +
          riga('Vulnerabilità', v.vulnerabilita) + riga('Resistenze', v.resistenze) + riga('Immunità', v.immunita) + riga('Immunità alle condizioni', v.immCondizioni) +
          riga('Sensi', v.sensi) + riga('Linguaggi', v.lingue) + '</div>';
        h += azioni('Tratti', v.tratti) + azioni('Azioni', v.azioni) + azioni('Azioni bonus', v.azioniBonus) + azioni('Reazioni', v.reazioni) + azioni('Azioni leggendarie', v.leggendarie);
        if (v.testo) h += md(v.testo);
        break;
      }
      case 'incantesimo':
        h += `<p class="cvSott">${esc(v.livello ? tr('Livello {n}', { n: v.livello }) + ' · ' + (v.scuola || '') : tr('Trucchetto') + ' · ' + (v.scuola || ''))}${v.rituale ? ' · ' + esc(tr('rituale')) : ''}</p>`;
        h += '<div class="cvGriglia">' + riga('Tempo di lancio', v.tempo) + riga('Gittata', v.gittata) + riga('Componenti', v.componenti) + riga('Durata', (v.concentrazione ? tr('Concentrazione') + ', ' : '') + (v.durata || '')) + riga('Classi', (v.classi || []).join(', ')) + '</div>';
        if (v.danni) h += `<div class="cvTiri">${tira(v.danni, v.nome + (v.tipoDanno ? ' (' + v.tipoDanno + ')' : ''))}</div>`;
        h += md(v.testo);
        if (v.superiore) h += `<h4>${esc(tr('A livelli superiori'))}</h4>` + md(v.superiore);
        break;
      case 'oggetto':
        h += `<p class="cvSott">${esc([v.categoria, v.sottocategoria, v.rarita, v.sintonia ? tr('richiede sintonia') : ''].filter(Boolean).join(' · '))}</p>`;
        h += '<div class="cvGriglia">' + riga('Costo', v.costo) + riga('Peso', v.peso != null ? lbKg(v.peso) : '') +
          riga('Danni', v.danno ? `<span>${tira(v.danno, v.nome)} ${esc(v.tipoDanno || '')}${v.dueMani ? ` · ${esc(tr('a due mani'))} ${esc(v.dueMani)}` : ''}</span>` : '') +
          riga('Proprietà', (v.proprieta || []).join(', ')) + riga('Maestria', v.maestria) + riga('Gittata', v.gittata || v.lancio) + riga('Portata', v.portata) +
          riga('Classe armatura', v.ca != null ? `${v.ca}${v.caDes === 'sì' ? ' + DES' : v.caDes && v.caDes.startsWith('max') ? ` + DES (${v.caDes})` : ''}` : '') +
          riga('Forza minima', v.forzaMin) + riga('Furtività', v.svantaggioFurtivita ? tr('svantaggio') : '') + riga('Contenuto', v.contenuto) + '</div>';
        if (v.testo) h += md(v.testo);
        break;
      case 'classe':
        h += '<div class="cvGriglia">' + riga('Dado vita', v.dadoVita ? 'd' + v.dadoVita : '') + riga('Tiri salvezza', (v.ts || []).map(k => CARN[k]).join(', ')) +
          riga('Caratteristica da incantatore', v.incantatore ? CARN[v.incantatore] : '') + riga('Competenze', (v.competenze || []).join(', ')) + riga('Sottoclassi', (v.sottoclassi || []).join(', ')) + '</div>';
        if (v.testo) h += md(v.testo);
        if (v.equipaggiamento) h += `<h4>${esc(tr('Equipaggiamento'))}</h4>` + md(v.equipaggiamento.split('\n').map(x => '- ' + x).join('\n'));
        if (v.livelli) {
          h += `<h4>${esc(tr('Livelli'))}</h4><table class="compTab"><tr><th>${esc(tr('Liv.'))}</th><th>${esc(tr('Comp.'))}</th><th>${esc(tr('Privilegi'))}</th></tr>` +
            v.livelli.map(l => `<tr><td>${l.livello}</td><td>+${l.competenza ?? ''}</td><td>${esc((l.privilegi || []).map(p => p.nome).join(', '))}</td></tr>`).join('') + '</table>';
          const visti = new Set();
          for (const l of v.livelli) for (const p of l.privilegi || []) { if (visti.has(p.nome) || !p.testo) continue; visti.add(p.nome); h += `<details class="cvPriv"><summary>${esc(p.nome)} <small>(${esc(tr('livello {n}', { n: l.livello }))})</small></summary>${md(p.testo)}</details>`; }
        }
        break;
      case 'sottoclasse':
        h += `<p class="cvSott">${esc([v.classe, v.tipo].filter(Boolean).join(' · '))}</p>` + md(v.testo);
        for (const p of v.privilegi || []) h += `<details class="cvPriv" open><summary>${esc(p.nome)} <small>(${esc(tr('livello {n}', { n: p.livello }))})</small></summary>${md(p.testo)}</details>`;
        break;
      case 'specie':
        h += '<div class="cvGriglia">' + riga('Taglia', v.taglia) + riga('Velocità', v.velocita ? v.velocita + ' ft' : '') +
          riga('Aumenti', (v.aumenti || []).map(a => `${CARN[a.car]} +${a.bonus}`).join(', ')) + riga('Linguaggi', (v.lingue || []).join(', ')) + '</div>';
        if (v.testo) h += md(v.testo);
        for (const t of v.tratti || []) h += `<details class="cvPriv" open><summary>${esc(t.nome)}</summary>${md(t.testo)}</details>`;
        for (const s of v.sottospecie || []) h += `<details class="cvPriv"><summary>${esc(s.nome)}${s.aumenti && s.aumenti.length ? ' · ' + esc(s.aumenti.map(a => `${CARN[a.car]} +${a.bonus}`).join(', ')) : ''}</summary>${md(s.testo || '')}${(s.tratti || []).map(t => `<p><b>${esc(t.nome)}.</b></p>${md(t.testo)}`).join('')}</details>`;
        break;
      case 'background':
        h += '<div class="cvGriglia">' + riga('Competenze', (v.competenze || []).join(', ')) + riga('Aumenti (una tra)', (v.caratteristiche || []).map(k => CARN[k]).join(', ')) + riga('Talento', v.talento) + '</div>';
        if (v.equipaggiamento) h += `<h4>${esc(tr('Equipaggiamento'))}</h4>` + md(v.equipaggiamento);
        if (v.privilegio) h += `<h4>${esc(v.privilegio.nome)}</h4>` + md(v.privilegio.testo);
        if (v.testo) h += md(v.testo);
        break;
      default:
        if (v.categoria || v.prerequisiti) h += `<p class="cvSott">${esc([v.categoria, v.prerequisiti ? tr('Prerequisito: {p}', { p: v.prerequisiti }) : ''].filter(Boolean).join(' · '))}</p>`;
        h += md(v.testo);
    }
    const p = C.pacchetti.find(x => x.id === v._p);
    if (p && p.licenza) h += `<p class="cvLic">${esc(p.licenza)}</p>`;
    return h;
  }
  function pulsantiVoce(v) {
    const b = [];
    b.push(['💬', 'Mostra in chat', () => inChat(v)]);
    if (v.tipo === 'mostro' && conduco()) b.push(['🎯', 'Sulla mappa', () => mostroSullaMappa(v)]);
    if (v.tipo === 'oggetto' || v.tipo === 'incantesimo') b.push(['➕', 'Aggiungi a una scheda', () => sceltaScheda(v)]);
    if (conduco()) b.push([visibileVoce(v) ? '🙈' : '👁', visibileVoce(v) ? 'Nascondi ai giocatori' : 'Mostra ai giocatori', () => nascondi(v)]);
    const p = C.pacchetti.find(x => x.id === v._p);
    if (p && !p.base && !p.hash && conduco()) { b.push(['✎', 'Modifica', () => editor(v)]); b.push(['🗑', 'Elimina', () => eliminaVoce(v)]); }
    return b;
  }
  const finestre = new Map();
  function apri(v) {
    const k = chiave(v);
    const vecchia = finestre.get(k);
    if (vecchia && vecchia.isConnected) { bringWin(vecchia); return vecchia; }
    const w = makeFrame('voce:' + k, 'vocWin');
    w._name.textContent = v.nome;
    w._ic.src = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="19" fill="#3db8ff"/><text x="20" y="27" font-size="20" text-anchor="middle">${({ mostro: '🐉', incantesimo: '✨', oggetto: '🗡', talento: '⭐', classe: '🛡', sottoclasse: '🛡', specie: '🧝', background: '📜', condizione: '⚠', regola: '📖' })[v.tipo] || '📖'}</text></svg>`);
    const barra = document.createElement('div'); barra.className = 'cvBarra';
    for (const [ic, nome, fn] of pulsantiVoce(v)) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ghost'; b.textContent = ic + ' ' + tr(nome); b.addEventListener('click', fn); barra.append(b); }
    const corpo = document.createElement('div'); corpo.className = 'cvCorpo'; corpo.innerHTML = corpoVoce(v);
    w._body.replaceChildren(barra, corpo);
    w._body.addEventListener('click', e => {
      const t = e.target.closest('[data-tiro]'); if (!t) return;
      if (typeof rollExpr === 'function' && !rollExpr(t.dataset.tiro, `${v.nome} · ${t.dataset.nome}`)) addChat({ kind: 'text', text: tr('Tiro non valido') + ': ' + t.dataset.tiro });
    });
    w._onClose = () => finestre.delete(k);
    finestre.set(k, w);
    dispatchEvent(new CustomEvent('libre-voce-aperta', { detail: { w, mostro: v.tipo === 'mostro' } }));
    if (typeof dentroLoSchermo === 'function') dentroLoSchermo(w);
    return w;
  }
  window.apriVoceCompendio = k => { const v = trovaK(k); if (v) apri(v); };

  // ---------- chat: «@Palla di fuoco» ----------
  function inChat(v) {
    const sint = riassunto(v);
    if (typeof addChat === 'function') addChat({ kind: 'text', text: `@${v.nome}${sint ? ' — ' + sint : ''}` });
  }
  // i nomi (anche lunghi, anche in inglese) che seguono una @ diventano un link alla voce
  function cercaNome(testo, da) {
    const resto = testo.slice(da);
    const parole = resto.split(/(\s+)/);
    for (let n = Math.min(parole.length, 13); n > 0; n--) {
      const cand = parole.slice(0, n).join('').replace(/[.,;:!?)»"]+$/, '');
      if (!cand.trim()) continue;
      const nc = norm(cand);
      const v = C.voci.find(x => norm(x.nome) === nc) || C.voci.find(x => norm(x.en) === nc) || C.voci.find(x => x.it && norm(x.it) === nc);
      if (v) return { v, len: cand.length };
    }
    return null;
  }
  function conLink(s) {                                 // un pezzo di testo → testo e pulsanti 📖
    const out = []; let i, da = 0, inizio = 0;
    while ((i = s.indexOf('@', da)) >= 0) {
      const m = cercaNome(s, i + 1);
      if (!m) { da = i + 1; continue; }
      if (i > inizio) out.push(document.createTextNode(s.slice(inizio, i)));
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chipVoce'; b.textContent = '📖 ' + m.v.nome; b.title = nomeTipo(m.v.tipo);
      b.dataset.k = chiave(m.v);
      b.addEventListener('click', () => { const v = trovaK(b.dataset.k); if (v) apri(v); });
      out.push(b);
      inizio = da = i + 1 + m.len;
    }
    if (inizio < s.length) out.push(document.createTextNode(s.slice(inizio)));
    return out;
  }
  if (typeof testoConTiri === 'function') {
    const prima = testoConTiri;
    testoConTiri = function (t) {                       // eslint-disable-line no-global-assign
      const parti = prima(t);
      if (!C.pronto || !String(t).includes('@')) return parti;
      return parti.flatMap(p => p.nodeType === 3 && p.nodeValue.includes('@') ? conLink(p.nodeValue) : [p]);
    };
  }
  // suggerimenti mentre scrivi «@…» in chat
  const sugg = document.createElement('div'); sugg.id = 'compSugg'; sugg.hidden = true; sugg.setAttribute('role', 'listbox');
  document.body.appendChild(sugg);
  const ci = $('chatInput');
  function suggerisci() {
    if (!C.pronto || !ci) { sugg.hidden = true; return; }
    const pos = ci.selectionStart, prima = ci.value.slice(0, pos), m = /@([^@\n]{2,40})$/.exec(prima);
    if (!m) { sugg.hidden = true; return; }
    const q = norm(m[1]);
    const tro = C.voci.filter(v => norm(v.nome).startsWith(q) || norm(v.en).startsWith(q)).slice(0, 7);
    if (!tro.length) { sugg.hidden = true; return; }
    sugg.replaceChildren(...tro.map(v => {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'option');
      b.innerHTML = `<b>${esc(v.nome)}</b> <small>${esc(nomeTipo(v.tipo))}</small>`;
      b.addEventListener('mousedown', e => { e.preventDefault(); ci.value = prima.slice(0, m.index) + '@' + v.nome + ' ' + ci.value.slice(pos); sugg.hidden = true; ci.focus(); });
      return b;
    }));
    const r = ci.getBoundingClientRect();
    sugg.style.left = r.left + 'px'; sugg.style.bottom = (innerHeight - r.top + 6) + 'px'; sugg.style.width = Math.max(220, r.width) + 'px';
    sugg.hidden = false;
  }
  if (ci) { ci.addEventListener('input', suggerisci); ci.addEventListener('blur', () => setTimeout(() => { sugg.hidden = true; }, 150)); }

  // ---------- un mostro sulla mappa: segnalino + scheda collegata ----------
  // I segnalini dei mostri dell'SRD (condiviso/token-srd/): indice.json lega il nome inglese al file.
  // Nelle partite in rete l'immagine finisce nel deposito come le altre (netEnsureWorldAssets).
  let tokenSrd = null;
  fetch('/condiviso/token-srd/indice.json').then(r => r.ok ? r.json() : null).then(j => { tokenSrd = j; }).catch(() => {});
  function tokenDelMostro(v) {
    if (!tokenSrd) return null;
    const k = n => String(n || '').toLowerCase().replace(/’/g, "'").replace(/\s+/g, ' ').trim();
    const f = tokenSrd[k(v.en)] || tokenSrd[k(v.nome)] || tokenSrd[k(v.it)];
    return f ? { url: '/condiviso/token-srd/' + f } : null;
  }
  function schedaDaMostro(v) {
    const D = typeof SISTEMA !== 'undefined' && SISTEMA.dati;
    const vuoi = D && Array.isArray(D.schede) ? D.schede : ['standard', 'dnd5e', 'simple'];
    const tpl = vuoi.includes('dnd5e') ? 'dnd5e' : vuoi.includes('standard') ? 'standard' : 'simple';
    const s = newSheet(v.nome, tpl);
    const f = s.f;
    const icona = tokenDelMostro(v); if (icona) s.icon = icona;
    if (tpl !== 'simple') {
      for (const [k, n] of Object.entries(v.car || {})) f[k] = String(n);
      f.ac = String(v.ca ?? ''); f.hpmax = String(v.pf ?? ''); f.hp = String(v.pf ?? '');
      f.speed = v.velocita || ''; f.profb = String(v.competenza ?? ''); f.class = [v.taglia, v.tipoCreatura].filter(Boolean).join(' '); f.level = '';
      f.align = v.allineamento || ''; f.race = tr('GS {g}', { g: v.gs });
      for (const [k, n] of Object.entries(v.ts || {})) if (n !== mod(v.car[k] || 10)) f['sp_' + k] = '1';
      let i = 0;
      for (const a of v.azioni || []) {
        if (!Number.isFinite(a.colpire) && !(a.danni && a.danni.length)) continue;
        f['an' + i] = a.nome; f['ab' + i] = Number.isFinite(a.colpire) ? (a.colpire >= 0 ? '+' : '') + a.colpire : a.cd ? 'CD ' + a.cd.valore : '';
        f['ad' + i] = (a.danni || []).map(d => d.dadi + (d.tipo ? ' ' + d.tipo.toLowerCase() : '')).join(' + ');
        i++;
      }
      const blocco = (tit, arr) => arr && arr.length ? `${tit}\n` + arr.map(a => `${a.nome}${a.uso ? ' (' + a.uso + ')' : ''}. ${a.testo}${Number.isFinite(a.colpire) ? ` [[1d20${a.colpire >= 0 ? '+' : ''}${a.colpire} | ${a.nome}]]` : ''}${(a.danni || []).map(d => ` [[${d.dadi} | ${a.nome} ${d.tipo || ''}]]`).join('')}`).join('\n\n') + '\n\n' : '';
      f.features = (blocco(tr('TRATTI'), v.tratti) + blocco(tr('AZIONI'), v.azioni) + blocco(tr('AZIONI BONUS'), v.azioniBonus) + blocco(tr('REAZIONI'), v.reazioni) + blocco(tr('AZIONI LEGGENDARIE'), v.leggendarie)).trim();
      f.racial = [v.sensi && tr('Sensi') + ': ' + v.sensi, v.lingue && tr('Linguaggi') + ': ' + v.lingue, v.resistenze && tr('Resistenze') + ': ' + v.resistenze, v.immunita && tr('Immunità') + ': ' + v.immunita, v.immCondizioni && tr('Immunità alle condizioni') + ': ' + v.immCondizioni].filter(Boolean).join('\n');
    } else {
      f.desc = [v.taglia, v.tipoCreatura, 'GS ' + v.gs, 'CA ' + v.ca, 'PF ' + v.pf].join(' · ');
      f.quick = (v.azioni || []).filter(a => Number.isFinite(a.colpire)).map(a => `[[1d20+${a.colpire} | ${a.nome}]] ${(a.danni || []).map(d => `[[${d.dadi} | ${a.nome}]]`).join(' ')}`).join('\n');
    }
    return s;
  }
  function mostroSullaMappa(v, wx, wy) {
    const s = schedaDaMostro(v);
    sheets.push(s); renderSheetList(); scheduleSheets();
    if (typeof onSheetCreated === 'function') onSheetCreated(s);
    const x = wx ?? (innerWidth / 2 - view.x) / view.s, y = wy ?? (innerHeight / 2 - view.y) / view.s;
    // lo stesso mostro più volte: «Goblin 1», «Goblin 2» (come i segnalini fatti a mano)
    tokenFromSheet(s, x, y);
    const el = [...world.querySelectorAll('.photo')].reverse().find(e => e.dataset.sheet === s.id);
    if (el && typeof numeraNome === 'function') {
      const altri = [...world.querySelectorAll('.photo')].filter(o => o !== el && !o._shape);
      const nm = numeraNome(v.nome, altri);
      if (nm !== v.nome) { el.dataset.name = nm; s.name = nm; renderSheetList(); scheduleSheets(); }
    }
    if (typeof netSay === 'function' && inRete()) netSay(tr('«{nome}» è sulla mappa, con la sua scheda.', { nome: s.name }));
  }
  viewport.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('application/x-voce')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  viewport.addEventListener('drop', e => {
    const k = e.dataTransfer.getData('application/x-voce'); if (!k) return;
    e.preventDefault();
    const v = trovaK(k); if (!v) return;
    if (v.tipo === 'mostro' && conduco()) mostroSullaMappa(v, (e.clientX - view.x) / view.s, (e.clientY - view.y) / view.s);
    else apri(v);
  });

  // ---------- un oggetto o un incantesimo su una scheda ----------
  const iv = x => parseInt(x, 10) || 0;
  function aggiungiAScheda(s, v) {
    const f = s.f;
    if (v.tipo === 'oggetto') {
      let i = 0; while (i < 200 && (f['iv' + i + 'n'] || '').trim()) i++;
      f['iv' + i + 'n'] = v.nome; if (v.peso != null) f['iv' + i + 'w'] = String(Math.round(v.peso * 0.5 * 100) / 100).replace('.', ',');
      if (v.arma && v.danno) {                              // anche negli attacchi, con bonus e danni già fatti
        const accurata = (v.proprieta || []).some(p => /accurata|finesse/i.test(p));
        const distanza = /distanza|ranged/i.test((v.sottocategoria || '') + ' ' + (v.categoria || ''));
        const md = accurata ? Math.max(abMod(s, 'str'), abMod(s, 'dex')) : distanza ? abMod(s, 'dex') : abMod(s, 'str');
        const piu = iv(v.bonus);                              // armi +1, +2, +3: a colpire e ai danni
        const ab = md + profB(s) + piu, mdd = md + piu;
        let a = 0; while (a < 200 && ((f['an' + a] || '').trim() || (f['ab' + a] || '').trim() || (f['ad' + a] || '').trim())) a++;
        f['an' + a] = v.nome; f['ab' + a] = (ab >= 0 ? '+' : '') + ab;
        f['ad' + a] = v.danno + (mdd ? (mdd > 0 ? '+' : '') + mdd : '') + (v.tipoDanno ? ' ' + v.tipoDanno.toLowerCase() : '');
      } else if (!v.arma && iv(v.bonus) && (f.ac || '').trim()) {
        f.ac = String(iv(f.ac) + iv(v.bonus));                // armature +1, +2, +3: alla CA
      }
    } else if (v.tipo === 'incantesimo') {
      const L = v.livello || 0;
      let i = 0; while (i < 200 && ((f[`sp${L}_${i}`] || '').trim() || (f[`sp${L}_${i}_d`] || '').trim())) i++;
      f[`sp${L}_${i}`] = v.nome + (v.danni ? ` [[${v.danni} | ${v.nome}]]` : '');
      f[`sp${L}_${i}_d`] = [`${v.livello ? tr('Livello {n}', { n: v.livello }) : tr('Trucchetto')} · ${v.scuola || ''}`, `${v.tempo || ''} · ${v.gittata || ''} · ${v.componenti || ''} · ${v.concentrazione ? tr('Concentrazione') + ', ' : ''}${v.durata || ''}`, '', v.testo || '', v.superiore ? '\n' + v.superiore : ''].join('\n').trim();
    }
    scheduleSheets();
    const w = wins.get(s.id);
    if (w) { closeWin(w); openSheet(s.id); }                // si riapre per mostrare le righe nuove
    if (typeof netSay === 'function' && inRete()) netSay(tr('«{v}» aggiunto alla scheda «{s}».', { v: v.nome, s: s.name }));
    else setTimeout(() => alert(tr('«{v}» aggiunto alla scheda «{s}».', { v: v.nome, s: s.name })), 0);
  }
  function sceltaScheda(v) {
    const mie = sheets.filter(s => !s._access || s._access === 'rw');
    if (!mie.length) { alert(tr('Non c\'è nessuna scheda: creane una prima.')); return; }
    const dlg = document.createElement('dialog'); dlg.className = 'compDlg';
    dlg.innerHTML = `<h3>${esc(tr('A quale scheda?'))}</h3><div class="compScelte"></div><div class="dialogBtns"><button type="button" class="btn ghost">${esc(tr('Annulla'))}</button></div>`;
    dlg.querySelector('.compScelte').append(...mie.map(s => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ghost'; b.textContent = s.name; b.addEventListener('click', () => { dlg.close(); aggiungiAScheda(s, v); }); return b; }));
    dlg.querySelector('.dialogBtns button').addEventListener('click', () => dlg.close());
    dlg.addEventListener('close', () => dlg.remove());
    document.body.appendChild(dlg); dlg.showModal();
  }
  // trascinando una voce sulla finestra di una scheda
  document.addEventListener('dragover', e => { if (e.dataTransfer && e.dataTransfer.types.includes('application/x-voce') && e.target.closest && e.target.closest('.sheetWin:not(.vocWin)')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  document.addEventListener('drop', e => {
    const w = e.target.closest && e.target.closest('.sheetWin:not(.vocWin)'); if (!w || !w._sheet) return;
    const k = e.dataTransfer.getData('application/x-voce'); if (!k) return;
    e.preventDefault(); e.stopPropagation();
    const v = trovaK(k); if (v && (v.tipo === 'oggetto' || v.tipo === 'incantesimo')) aggiungiAScheda(w._sheet, v);
  }, true);

  // ---------- visibilità ----------
  async function salvaVis() {
    await fetch('api/compendio/visibilita', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(C.vis) }).catch(() => {});
    C._rete = null;
    if (typeof scheduleBoardSave === 'function') scheduleBoardSave();
  }
  function nascondi(v) {
    const k = chiave(v);
    C.vis.voci[k] = visibileVoce(v) ? 'master' : 'tutti';
    salvaVis(); disegna();
    const w = finestre.get(k); if (w) { closeWin(w); apri(v); }
  }

  // ---------- nuova voce / modifica (homebrew della campagna) ----------
  const CAMPI = {
    mostro: [['taglia', 'Taglia'], ['tipoCreatura', 'Tipo'], ['allineamento', 'Allineamento'], ['ca', 'Classe armatura', 'n'], ['pf', 'Punti ferita', 'n'], ['dadiPf', 'Dadi PF (es. 2d6)'], ['velocita', 'Velocità'], ['gs', 'Grado di sfida'], ['sensi', 'Sensi'], ['lingue', 'Linguaggi']],
    incantesimo: [['livello', 'Livello (0 = trucchetto)', 'n'], ['scuola', 'Scuola'], ['tempo', 'Tempo di lancio'], ['gittata', 'Gittata'], ['componenti', 'Componenti'], ['durata', 'Durata'], ['danni', 'Danni (es. 8d6)'], ['classi', 'Classi (separate da virgole)', 'l']],
    oggetto: [['categoria', 'Categoria'], ['rarita', 'Rarità'], ['costo', 'Costo'], ['peso', 'Peso (lb)', 'n'], ['danno', 'Danni (armi)'], ['tipoDanno', 'Tipo di danno'], ['proprieta', 'Proprietà (separate da virgole)', 'l'], ['ca', 'Classe armatura', 'n']],
    talento: [['categoria', 'Categoria'], ['prerequisiti', 'Prerequisiti']],
    classe: [['dadoVita', 'Dado vita (es. 8)', 'n']], sottoclasse: [['classe', 'Classe']], specie: [['taglia', 'Taglia'], ['velocita', 'Velocità', 'n']],
    background: [], condizione: [], regola: []
  };
  function editor(v) {
    const nuova = !v;
    v = v ? JSON.parse(JSON.stringify(v)) : { tipo: F.tipo || 'mostro', nome: '', testo: '' };
    const dlg = document.createElement('dialog'); dlg.className = 'compDlg compEd';
    const campi = () => (CAMPI[v.tipo] || []).map(([k, nome, t]) => `<label>${esc(tr(nome))}<input data-c="${k}" data-t="${t || ''}" value="${esc(Array.isArray(v[k]) ? v[k].join(', ') : v[k] ?? '')}"></label>`).join('');
    dlg.innerHTML = `<h3>${esc(nuova ? tr('Nuova voce') : tr('Modifica «{n}»', { n: v.nome }))}</h3>
      <div class="compEdG"><label>${esc(tr('Tipo'))}<select data-c="tipo" ${nuova ? '' : 'disabled'}>${TIPI.map(([k, , s]) => `<option value="${k}" ${k === v.tipo ? 'selected' : ''}>${esc(tr(s))}</option>`).join('')}</select></label>
      <label>${esc(tr('Nome'))}<input data-c="nome" value="${esc(v.nome)}" maxlength="80" required></label>
      <label>${esc(tr('Nome originale (facoltativo)'))}<input data-c="en" value="${esc(v.en || '')}" maxlength="80"></label>
      <div class="compEdCampi">${campi()}</div></div>
      <label class="compEdTesto">${esc(tr('Testo (anche **grassetto**, elenchi con «- » e tiri come [[1d20+5 | Attacco]])'))}<textarea data-c="testo" rows="10">${esc(v.testo || '')}</textarea></label>
      <div class="dialogBtns"><span style="flex:1"></span><button type="button" class="btn ghost" data-x="no">${esc(tr('Annulla'))}</button><button type="button" class="btn" data-x="si">${esc(tr('Salva'))}</button></div>`;
    dlg.querySelector('select[data-c=tipo]').addEventListener('change', e => { v.tipo = e.target.value; dlg.querySelector('.compEdCampi').innerHTML = campi(); });
    dlg.querySelector('[data-x=no]').addEventListener('click', () => dlg.close());
    dlg.querySelector('[data-x=si]').addEventListener('click', async () => {
      for (const i of dlg.querySelectorAll('[data-c]')) {
        const k = i.dataset.c; if (k === 'tipo') continue;
        let x = i.value.trim();
        if (i.dataset.t === 'n') x = x === '' ? undefined : +x.replace(',', '.');
        else if (i.dataset.t === 'l') x = x ? x.split(',').map(t => t.trim()).filter(Boolean) : undefined;
        v[k] = x === '' ? undefined : x;
      }
      if (!v.nome) { dlg.querySelector('[data-c=nome]').focus(); return; }
      v.fonte = v.fonte || tr('Homebrew');
      const pack = v._p || 'homebrew';
      delete v._p;
      const ok = await salvaVoci(pack, { [v.tipo]: [v] }, pack === 'homebrew' ? { id: 'homebrew', nome: tr('Homebrew della campagna'), autore: '', licenza: tr('Contenuti scritti per questa campagna.'), fonte: 'Homebrew' } : {});
      if (ok) { dlg.close(); await ricaricaCompendio(); const n = C.voci.find(x => x._p === pack && x.nome === v.nome && x.tipo === v.tipo); if (n) apri(n); }
    });
    dlg.addEventListener('close', () => dlg.remove());
    document.body.appendChild(dlg); dlg.showModal();
  }
  async function salvaVoci(pack, voci, pacchetto) {
    const r = await fetch('api/compendio/pacchetto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pacchetto: { id: pack, ...pacchetto }, voci, unisci: pack }) }).catch(() => null);
    if (!r || !r.ok) { alert(tr('Non sono riuscito a salvarla.') + (r ? ' ' + await r.text() : '')); return false; }
    return true;
  }
  window.compendioSalvaPacchetto = async (pacchetto, voci) => {
    const r = await fetch('api/compendio/pacchetto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pacchetto, voci }) }).catch(() => null);
    if (!r || !r.ok) throw new Error(r ? await r.text() : tr('server spento'));
    await ricaricaCompendio();
    return (await r.json()).id;
  };
  async function eliminaVoce(v) {
    if (!confirm(tr('Eliminare «{n}» dal compendio della campagna?', { n: v.nome }))) return;
    const c = { id: v.id, tipo: v.tipo, nome: v.nome, _via: true };
    if (await salvaVoci(v._p, { [v.tipo]: [c] }, {})) { const w = finestre.get(chiave(v)); if (w) closeWin(w); ricaricaCompendio(); }
  }

  // ---------- pacchetti: importa, esporta, visibilità ----------
  function importa() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.librepack,.zip,.json,.csv';
    inp.addEventListener('change', async () => {
      const f = inp.files[0]; if (!f) return;
      try {
        if (/\.(librepack|zip)$/i.test(f.name)) {
          const r = await fetch('api/compendio/importa', { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: f });
          if (!r.ok) throw new Error(await r.text());
          const j = await r.json(); await ricaricaCompendio();
          alert(tr('Pacchetto «{n}» importato.', { n: j.nome }));
        } else if (typeof window.importaFileCompendio === 'function') await window.importaFileCompendio(f);   // 5etools / CSV (compendio-import.js)
        else throw new Error(tr('Formato non riconosciuto.'));
      } catch (e) { alert(tr('Non sono riuscito a importarlo: {e}', { e: e.message })); }
    });
    inp.click();
  }
  function pacchetti() {
    const dlg = document.createElement('dialog'); dlg.className = 'compDlg compPack';
    const disegnaP = () => {
      dlg.innerHTML = `<h3>${esc(tr('Pacchetti del compendio'))}</h3><div class="compPL">${C.pacchetti.map(p => {
        const n = C.voci.filter(v => v._p === p.id).length, vis = visibilePack(p);
        return `<div class="compP" data-id="${esc(p.id)}"><div><b>${esc(p.nome)}</b> <small>${esc(tr('{n} voci', { n }))}${p.base ? ' · ' + esc(tr('di base')) : ''}${p.usoPersonale ? ' · ' + esc(tr('uso personale')) : ''}</small><br><small class="compLic">${esc(p.licenza || '')}</small></div>
          <div class="compPB">${conduco() && !giocatore() ? `<button type="button" class="btn ghost" data-a="vis" title="${esc(vis ? tr('Lo vedono anche i giocatori') : tr('Lo vedi solo tu'))}">${vis ? '👁 ' + esc(tr('Tutti')) : '🙈 ' + esc(tr('Solo master'))}</button>` : ''}
          ${!giocatore() || p.mio ? `<button type="button" class="btn ghost" data-a="esp">📤 ${esc(tr('Esporta'))}</button>` : ''}
          ${!p.base && (!giocatore() || p.mio) ? `<button type="button" class="btn ghost" data-a="via">🗑</button>` : ''}</div></div>`;
      }).join('') || `<p class="note">${esc(tr('Nessun pacchetto.'))}</p>`}</div>
      ${conduco() && !giocatore() ? `<label class="check"><input type="checkbox" id="compGioImp" ${C.vis.giocatoriImportano ? 'checked' : ''}> ${esc(tr('I giocatori possono importare pacchetti per sé'))}</label>` : ''}
      <div class="dialogBtns"><span style="flex:1"></span><button type="button" class="btn" data-a="chiudi">${esc(tr('Chiudi'))}</button></div>`;
    };
    disegnaP();
    dlg.addEventListener('click', async e => {
      const b = e.target.closest('button[data-a]'); if (!b) return;
      if (b.dataset.a === 'chiudi') return dlg.close();
      const id = b.closest('.compP') && b.closest('.compP').dataset.id, p = C.pacchetti.find(x => x.id === id);
      if (b.dataset.a === 'vis') { C.vis.pacchetti[id] = visibilePack(p) ? 'master' : 'tutti'; await salvaVis(); disegnaP(); disegna(); }
      else if (b.dataset.a === 'esp') {
        if (p.usoPersonale && !confirm(tr('Questo pacchetto è segnato «uso personale»: contiene materiale protetto (per esempio copiato da un manuale). Va bene per te e il tuo tavolo, ma non va condiviso pubblicamente. Lo esporto?'))) return;
        const a = document.createElement('a'); a.href = 'api/compendio/esporta?id=' + encodeURIComponent(id); a.download = (p.nome || id) + '.librepack'; document.body.append(a); a.click(); a.remove();
      } else if (b.dataset.a === 'via') {
        if (!confirm(tr('Togliere il pacchetto «{n}» dalla campagna?', { n: p.nome }))) return;
        await fetch('api/compendio?id=' + encodeURIComponent(id), { method: 'DELETE' }); await ricaricaCompendio(); disegnaP();
      }
    });
    dlg.addEventListener('change', async e => { if (e.target.id === 'compGioImp') { C.vis.giocatoriImportano = e.target.checked; await salvaVis(); } });
    dlg.addEventListener('close', () => dlg.remove());
    document.body.appendChild(dlg); dlg.showModal();
  }

  // ---------- collegamenti ----------
  $('compQ').addEventListener('input', e => { F.q = e.target.value; disegna(); });
  $('compTipo').addEventListener('change', e => { F.tipo = e.target.value; F.extra = { pack: F.extra.pack }; filtriExtra(); disegna(); });
  $('compNuova').addEventListener('click', () => editor(null));
  $('compImporta').addEventListener('click', importa);
  $('compPacchetti').addEventListener('click', pacchetti);
  $('compOpen5e').addEventListener('click', () => { if (typeof apriOpen5e === 'function') apriOpen5e(); });
  function pulsanti() {
    const m = !giocatore();
    $('compNuova').hidden = !m;
    $('compOpen5e').hidden = !m;
    $('compImporta').hidden = !(m || C.vis.giocatoriImportano);
  }
  addEventListener('libre-compendio', pulsanti);
  // si carica la prima volta che apri la scheda «Compendio» (o quando serve per @ in chat)
  document.querySelector('.tab[data-tab=comp]').addEventListener('click', () => { pulsanti(); if (!C.pronto) carica(); });
  addEventListener('libre-sistema', () => { if (C.pronto && !giocatore()) ricaricaCompendio(); });
  addEventListener('DOMContentLoaded', () => setTimeout(() => { if (!C.pronto) carica(); }, 2500));   // per le @ della chat
})();
