// ---------- Modello «Mostro»: la scheda a due colonne dei mostri del compendio ----------
// A sinistra nome, CA, PF, velocità, iniziativa, caratteristiche, tiri salvezza, abilità, difese, sensi, sfida e tratti;
// a destra le azioni (azioni, azioni bonus, reazioni, azioni leggendarie). Si clicca:
//   · una caratteristica, l'iniziativa, un tiro salvezza, un'abilità, i PF a dadi → tira;
//   · il nome di un attacco → tira per colpire, e nel messaggio c'è il pulsante dei danni;
//   · il nome di un tratto o di un'azione senza attacco → ne scrive il testo in chat.
// Se un attacco ha anche una descrizione in più (la maledizione di un morso…) il VTT lo rileva e, dopo il tiro,
// chiede se scriverla in chat: la risposta si può fissare nella barra della scheda («Testo extra dell'attacco»).
//
// Il mostro sta in s.f.mz (JSON in una stringa, così viaggia con la scheda in rete, nei file e negli zip);
// le caratteristiche, i PF, la CA… stanno anche nei campi di sempre (str, hp, ac…) per i tiri e le barre dei segnalini.
// Si appoggia a sheets.js (ABIL, doRoll, sgn, scheduleSheets) e a tiri-scheda.js (la barra dei tiri).

(function () {
  const tr = window.tr || (s => s);
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mod = n => Math.floor((n - 10) / 2);
  const sg = n => (n >= 0 ? '+' : '−') + Math.abs(n);
  const sgE = n => (n >= 0 ? '+' : '') + n;
  const NOME_CAR = { str: 'Forza', dex: 'Destrezza', con: 'Costituzione', int: 'Intelligenza', wis: 'Saggezza', cha: 'Carisma' };
  const SEZIONI = [['azioni', 'Azioni'], ['azioniBonus', 'Azioni bonus'], ['reazioni', 'Reazioni'], ['leggendarie', 'Azioni leggendarie']];

  function dati(s) { try { const m = JSON.parse(s.f.mz); return m && typeof m === 'object' ? m : null; } catch { return null; } }

  // ---------- Il testo di un attacco: come si tira, i danni, e l'eventuale descrizione in più ----------
  // «Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 6 (1d8 + 2) piercing damage. Se il bersaglio…»
  const RE_COLPO = /\bHit:\s*(?:[^.]*?\bdamage\b)(?:\s*(?:,|plus|and|or)\s*[^.]*?\bdamage\b)*(?:[^.]*)\.?/i;
  function dividiAttacco(testo) {
    const t = String(testo || '').trim();
    const i = t.search(/\bHit:/i);
    if (i < 0) return { intro: t, colpo: '', extra: '' };
    const intro = t.slice(0, i).trim(), resto = t.slice(i);
    const m = RE_COLPO.exec(resto);
    if (!m) return { intro, colpo: resto.replace(/^Hit:\s*/i, '').trim(), extra: '' };
    return { intro, colpo: m[0].replace(/^Hit:\s*/i, '').trim(), extra: resto.slice(m.index + m[0].length).trim() };
  }
  window.mostroDividiAttacco = dividiAttacco;                 // anche per le prove

  // ---------- HTML ----------
  const riga = (et, v) => v ? `<p class="mzRiga"><b>${esc(tr(et))}</b> ${v}</p>` : '';
  const testoRiga = (et, v) => v ? riga(et, esc(v)) : '';
  function voce(m, sez, a, i) {
    const uso = a.uso ? ` (${esc(a.uso)})` : '';
    const nome = esc(a.nome) + uso;
    const attacco = Number.isFinite(a.colpire) && Number.isFinite(a.ai);
    const bottone = attacco
      ? `<button type="button" class="mzClick mzNomeV" data-r="atk:${a.ai}" data-sez="${sez}" data-i="${i}" title="${esc(tr('Tira per colpire; nel messaggio il pulsante dei danni'))}">${nome}.</button>`
      : `<button type="button" class="mzClick mzNomeV" data-say="${sez}:${i}" title="${esc(tr('Scrive il testo in chat'))}">${nome}.</button>`;
    let corpo;
    if (attacco) {
      const d = dividiAttacco(a.testo);
      corpo = (d.intro ? `<p class="mzIn"><i>${esc(d.intro)}</i></p>` : '') + (d.colpo ? `<p class="mzIn"><i>${esc(tr('Colpo'))}:</i> ${esc(d.colpo)}</p>` : '') + (d.extra ? `<p class="mzIn">${esc(d.extra)}</p>` : '');
    } else corpo = a.testo ? `<p class="mzIn">${esc(a.testo)}</p>` : '';
    return `<div class="mzVoce">${bottone}${corpo}</div>`;
  }
  function mostroHtml(s) {
    const m = dati(s);
    if (!m) return `<p class="note">${esc(tr('I dati di questo mostro non ci sono più.'))}</p>`;
    const car = m.car || {};
    const pf = esc(m.pf) +
      (m.dadiPf ? ` <button type="button" class="mzClick" data-pf="1" title="${esc(tr('Tira i dadi vita'))}">(${esc(String(m.dadiPf).replace(/([+-])/g, ' $1 '))})</button>` : '');
    const ts = m.ts && Object.keys(m.ts).length ? Object.entries(m.ts).map(([k, n]) =>
      `<button type="button" class="mzClick" data-rx="1d20${sgE(n)}" data-nome="${esc(tr('Tiro salvezza') + ' ' + tr(NOME_CAR[k] || k))}">${esc(tr(NOME_CAR[k] || k).slice(0, 3))} ${sg(n)}</button>`).join(', ') : '';
    const ab = m.abilita && Object.keys(m.abilita).length ? Object.entries(m.abilita).map(([k, n]) =>
      `<button type="button" class="mzClick" data-rx="1d20${sgE(n)}" data-nome="${esc(k)}">${esc(k)} ${sg(n)}</button>`).join(', ') : '';
    const caratt = (typeof ABIL !== 'undefined' ? ABIL : []).map(([k, sig, nm]) =>
      `<button type="button" class="mzClick mzAb" data-r="mod:${k}" title="${esc(tr('Prova di {c}', { c: nm }))}"><b>${esc(tr(sig))}</b><span>${esc(car[k] ?? 10)} (${sg(mod(+car[k] || 10))})</span></button>`).join('');
    const tratti = (m.tratti || []).map((a, i) => voce(m, 'tratti', a, i)).join('');
    const sezioni = SEZIONI.map(([k, nome]) => (m[k] || []).length ? `<h2 class="mzTit">${esc(tr(nome))}</h2>` + m[k].map((a, i) => voce(m, k, a, i)).join('') : '').join('');
    const sott = [m.taglia, m.tipoCreatura, m.sottotipo ? `(${m.sottotipo})` : ''].filter(Boolean).join(' ') + (m.allineamento ? ', ' + m.allineamento : '');
    return `<div class="mzScheda"><div class="mzCols">
      <div class="mzSx">
        <input type="text" class="mzNome" data-name maxlength="40" aria-label="${esc(tr('Nome del mostro'))}">
        <p class="mzSott">${esc(sott)}</p>
        <hr class="mzBar">
        ${riga('Classe Armatura', esc(m.ca) + (m.caNota ? ` (${esc(m.caNota)})` : ''))}
        ${riga('Punti Ferita', pf)}
        ${testoRiga('Velocità', m.velocita)}
        ${riga('Iniziativa', '<button type="button" class="mzClick" data-r="init" title="' + esc(tr('Tira l\'iniziativa')) + '"><span data-c="init"></span></button>')}
        <hr class="mzBar">
        <div class="mzCar">${caratt}</div>
        <hr class="mzBar">
        ${riga('Tiri salvezza', ts)}${riga('Abilità', ab)}
        ${testoRiga('Vulnerabilità ai danni', m.vulnerabilita)}${testoRiga('Resistenze ai danni', m.resistenze)}${testoRiga('Immunità ai danni', m.immunita)}${testoRiga('Immunità alle condizioni', m.immCondizioni)}
        ${testoRiga('Sensi', m.sensi)}${testoRiga('Linguaggi', m.lingue)}
        ${riga('Sfida', esc(m.gs) + (m.px != null ? ` (${esc(m.px)} ${esc(tr('PE'))})` : ''))}
        ${riga('Bonus di competenza', esc(sg(+m.competenza || 0)))}
        ${tratti ? '<hr class="mzBar">' + tratti : ''}
      </div>
      <div class="mzDx">${sezioni}</div>
    </div></div>`;
  }

  // ---------- Comportamento ----------
  function dillo(s, titolo, testo, privato) {
    addChat({ kind: 'rule', title: `${s.name} · ${titolo}`, text: privato ? tr('Il testo completo è nel tuo compendio: «{n}».', { n: titolo }) : testo });
  }
  function domanda(w, s, m, testo, titolo) {
    w.querySelectorAll('.mzAsk').forEach(x => x.remove());
    const d = document.createElement('div');
    d.className = 'mzAsk'; d.setAttribute('role', 'alertdialog'); d.setAttribute('aria-label', tr('Testo extra dell\'attacco'));
    d.innerHTML = `<p><b>${esc(titolo)}</b> ${esc(tr('ha una descrizione in più:'))}</p><blockquote>${esc(testo.length > 140 ? testo.slice(0, 140) + '…' : testo)}</blockquote>
      <p>${esc(tr('Scriverla in chat dopo l\'attacco?'))}</p>
      <div class="mzAskBtn"><button type="button" class="btn" data-v="si">${esc(tr('Sì'))}</button><button type="button" class="btn ghost" data-v="no">${esc(tr('No'))}</button>
        <button type="button" class="btn ghost" data-v="sempre">${esc(tr('Sì, sempre'))}</button><button type="button" class="btn ghost" data-v="mai">${esc(tr('No, mai'))}</button></div>`;
    d.addEventListener('click', e => {
      const b = e.target.closest('button[data-v]'); if (!b) return;
      const v = b.dataset.v;
      if (v === 'si' || v === 'sempre') dillo(s, titolo, testo, m._p);
      if (v === 'sempre' || v === 'mai') {
        s.f.testoExtra = v;
        const sel = w.querySelector('[data-f="testoExtra"]'); if (sel) sel.value = v;
        if (typeof schedaCambiata === 'function') schedaCambiata(s); else scheduleSheets();
      }
      d.remove();
    });
    w.append(d);
    const primo = d.querySelector('button'); if (primo) primo.focus();
  }
  function mostroSetup(w, root, s) {
    const m = dati(s); if (!m) return;
    root.addEventListener('click', e => {
      const rx = e.target.closest('[data-rx]');
      if (rx) { rollExpr(rx.dataset.rx, `${s.name} · ${rx.dataset.nome}`); return; }
      if (e.target.closest('[data-pf]')) { rollExpr(String(m.dadiPf).replace(/\s+/g, ''), `${s.name} · ${tr('PF')}`); return; }
      const say = e.target.closest('[data-say]');
      if (say) {
        const [sez, i] = say.dataset.say.split(':'), a = (m[sez] || [])[+i];
        if (a) dillo(s, a.nome + (a.uso ? ` (${a.uso})` : ''), a.testo, m._p);
        return;
      }
      // il tiro per colpire l'ha già fatto il pulsante [data-r] (bindSheet): qui si decide sul testo in più
      const at = e.target.closest('.mzNomeV[data-r^="atk:"]');
      if (at) {
        const a = (m[at.dataset.sez] || [])[+at.dataset.i];
        const extra = a && !m._p ? dividiAttacco(a.testo).extra : '';
        if (!extra) return;
        const modo = s.f.testoExtra;
        if (modo === 'mai') return;
        if (modo === 'sempre') { dillo(s, a.nome, extra, false); return; }
        domanda(w, s, m, extra, a.nome);
      }
    });
  }

  window.mostroHtml = mostroHtml;
  window.mostroSetup = mostroSetup;
  window.mostroDati = dati;
})();
