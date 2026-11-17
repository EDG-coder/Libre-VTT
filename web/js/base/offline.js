// ---------- (master) Quello che i giocatori hanno fatto mentre non c'eri ----------
// Il server del master tiene le richieste (vedi «Il master non c'è» in server/game-server.js): qui si avvisa e si
// sceglie che cosa applicare, una cosa per volta o tutto insieme. Il testo viene dai giocatori: si mette sempre
// come testo, mai come HTML.
(function () {
  'use strict';
  let lista = [], aperta = null, avvisate = '';

  const ora = t => { try { return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
  const conta = () => lista.reduce((n, r) => n + r.cambi.length, 0);

  function chiudi() { if (aperta) { aperta.remove(); aperta = null; } }
  function decidi(r, scelti) { netSend({ t: 'offline.decidi', id: r.id, scelti }); }

  function disegna() {
    if (!aperta) return;
    const corpo = aperta.querySelector('.offCorpo');
    corpo.replaceChildren();
    if (!lista.length) { const v = document.createElement('p'); v.textContent = tr('Non c\'è niente da decidere.'); corpo.append(v); return; }
    for (const r of lista) {
      const box = document.createElement('section'); box.className = 'offRichiesta';
      const t = document.createElement('h3');
      t.textContent = r.cambi.length === 1 ? tr('{n}: una cosa, arrivata alle {h}', { n: r.name || tr('Giocatore'), h: ora(r.arrivo) })
        : tr('{n}: {c} cose, arrivate alle {h}', { n: r.name || tr('Giocatore'), c: r.cambi.length, h: ora(r.arrivo) });
      box.append(t);
      const checks = [];
      for (const c of r.cambi) {
        const riga = document.createElement('label'); riga.className = 'offCambio';
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !(c.conflitto && c.conflitto.length);
        checks.push([c.i, cb]);
        const tx = document.createElement('span'); tx.textContent = c.testo;
        riga.append(cb, tx);
        if (c.conflitto && c.conflitto.length) {
          const w = document.createElement('small'); w.className = 'offConflitto';
          w.textContent = ' ⚠ ' + tr('l\'hai cambiato anche tu: {c}', { c: c.conflitto.join(', ') });
          riga.append(w);
        }
        box.append(riga);
      }
      if (r.scartati) { const p = document.createElement('p'); p.className = 'offNota'; p.textContent = r.scartati === 1 ? tr('Una cosa non ammessa senza di te è stata ignorata.') : tr('{n} cose non ammesse senza di te sono state ignorate.', { n: r.scartati }); box.append(p); }
      const az = document.createElement('div'); az.className = 'offAzioni';
      const ok = document.createElement('button'); ok.type = 'button'; ok.className = 'go'; ok.textContent = tr('Applica le selezionate');
      ok.onclick = () => decidi(r, checks.filter(([, cb]) => cb.checked).map(([i]) => i));
      const no = document.createElement('button'); no.type = 'button'; no.textContent = tr('Scarta tutto');
      no.onclick = () => decidi(r, []);
      az.append(ok, no); box.append(az);
      corpo.append(box);
    }
  }

  function apri() {
    if (aperta) { disegna(); return; }
    aperta = document.createElement('div'); aperta.className = 'offModal';
    aperta.innerHTML = '<div class="offScheda" role="dialog" aria-modal="true"><div class="offTesta"><strong></strong><button type="button" class="offX" aria-label="×">×</button></div><div class="offCorpo"></div></div>';
    aperta.querySelector('strong').textContent = tr('Modifiche fatte mentre non c\'eri');
    aperta.querySelector('.offX').onclick = chiudi;
    aperta.addEventListener('mousedown', e => { if (e.target === aperta) chiudi(); });
    document.body.append(aperta);
    disegna();
  }

  window.libreOffline = {
    apri,
    richieste(l) {
      lista = Array.isArray(l) ? l : [];
      if (aperta) { if (!lista.length) chiudi(); else disegna(); }
      if (!lista.length) { avvisate = ''; return; }
      const chiave = lista.map(r => r.id).join(',');
      if (chiave === avvisate) return;          // già detto
      avvisate = chiave;
      const n = lista.length;
      netSay(n === 1 ? tr('{n} ha fatto delle modifiche mentre non c\'eri.', { n: lista[0].name || tr('Un giocatore') }) : tr('{n} giocatori hanno fatto delle modifiche mentre non c\'eri.', { n }),
        'live', { label: tr('Vedi'), fn: apri });
    },
    quante: conta
  };
})();
