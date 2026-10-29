// ---------- La scurovisione nella scheda: un campo che si scrive come viene ----------
// «60», «60 ft», «18 m», «scurovisione 120», «no». Senza unità vale quella della campagna (quella del
// righello). Sotto il campo si legge come è stato capito («60 ft = 12 caselle») o un avviso; intanto,
// attorno ai segnalini collegati alla scheda, un cerchio tratteggiato mostra fin dove arriva. L'interprete
// è lo stesso del server (condiviso/luce-calcolo.js). La vecchia casella «Scurovisione» vale 60 ft.
(function () {
  'use strict';
  const tr = window.tr || (s => s);
  const C = window.LUCE_CALCOLO;
  if (!C || !C.leggiDistanza) return;
  const NS = 'http://www.w3.org/2000/svg';
  const unita = () => (settings.unit === 'm' ? 'm' : 'ft');
  const misura = c => settings.unit === 'm' ? `${+(c * 1.5).toFixed(1)} m` : `${+(c * 5).toFixed(1)} ft`;

  function nota(inp, s) {
    const r = C.leggiDistanza(inp.value, unita());
    const box = inp.parentElement && inp.parentElement.querySelector('.scuroNota');
    const testo = !r.ok ? tr('Non capisco: scrivi per esempio 60 ft') : !String(inp.value).trim() ? '' : r.caselle ? tr('{m} = {n} caselle', { m: misura(r.caselle), n: +r.caselle.toFixed(1) }) : tr('nessuna');
    inp.classList.toggle('nonCapito', !r.ok);
    inp.dataset.nota = testo;
    const t = testo || tr('Scurovisione: per esempio 60 ft, 18 m, no');
    inp.title = t; setTimeout(() => { inp.title = t; }, 0);           // la scheda Standard mette come titolo il valore: qui vale la nota
    if (box) box.textContent = testo;
    return r;
  }

  // il cerchio attorno ai segnalini della scheda, per qualche secondo
  let cerchi = null, via = 0;
  function anteprima(s, caselle) {
    if (!cerchi) { cerchi = document.createElementNS(NS, 'svg'); cerchi.id = 'scuroAnte'; cerchi.setAttribute('overflow', 'visible'); }
    if (cerchi.parentNode !== world) world.appendChild(cerchi);
    const cs = typeof grid !== 'undefined' && grid.size > 0 ? grid.size : 50, R = caselle * cs, k = 1 / (view.s || 1);
    cerchi.innerHTML = [...world.querySelectorAll('.photo')].filter(p => p.dataset.sheet === s.id).map(p => {
      const r = rectOf(p), x = r.x + r.w / 2, y = r.y + r.h / 2;
      return R > 0 ? `<circle cx="${x}" cy="${y}" r="${R}" fill="rgba(124,92,255,.08)" stroke="#9b82ff" stroke-width="${2 * k}" stroke-dasharray="${8 * k} ${6 * k}"/>
        <text x="${x}" y="${y - R - 6 * k}" text-anchor="middle" font-size="${13 * k}" font-weight="700" fill="#fff" stroke="#000" stroke-width="${3 * k}" paint-order="stroke">${misura(caselle)}</text>` : '';
    }).join('');
    clearTimeout(via); via = setTimeout(() => { if (cerchi) cerchi.innerHTML = ''; }, 3500);
  }

  let rid = 0;
  function collega(w) {
    const id = w && w.dataset.id, s = id && sheets.find(x => x.id === id);
    const inp = w && w.querySelector('[data-f="scuroV"]');
    if (!s || !inp || inp._scuro) return;
    inp._scuro = true;
    if (!String(s.f.scuroV || '').trim() && (s.f.darkv === '1' || s.f.darkv === true)) { s.f.scuroV = '60 ft'; inp.value = '60 ft'; }   // la vecchia casella
    nota(inp, s);
    inp.addEventListener('input', () => {
      const r = nota(inp, s);
      if (r.ok) anteprima(s, r.caselle);
      clearTimeout(rid); rid = setTimeout(() => { if (typeof luceRidisegna === 'function') luceRidisegna(); }, 150);
    });
  }
  if (typeof openSheet === 'function') {
    const prima = openSheet;
    openSheet = function (id) { const w = prima.apply(this, arguments); try { collega(w || (typeof wins !== 'undefined' && wins.get(id))); } catch (e) { console.warn(e); } return w; };   // eslint-disable-line no-global-assign
  }
  window.scuroNota = nota;
})();
