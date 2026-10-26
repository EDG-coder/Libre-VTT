// ---------- Impostazioni → «Ordine degli strumenti» ----------
// Si sceglie in che ordine stanno le icone degli strumenti nel menu a sinistra (frecce ↑ ↓ o trascinando).
// L'ordine si salva in settings.toolOrder (elenco di id); gli strumenti nuovi o sconosciuti vanno in fondo
// nell'ordine predefinito. Uno strumento tirato fuori dal menu tiene comunque il suo posto (la casella vuota).
(function () {
  const tr = window.tr || (s => s);
  const lista = document.getElementById('ordineStrumenti');
  if (!lista || typeof TOOLS === 'undefined' || typeof slotsEl === 'undefined') return;
  const fissi = () => TOOLS.filter(t => !t.temp && t.slot);
  const predefinito = [...slotsEl.children].map(s => s.dataset.tool).filter(Boolean);   // ordine di partenza, dopo che tutti si sono registrati
  const ordine = () => {
    const ids = fissi().map(t => t.id), voluto = (settings.toolOrder || []).filter(id => ids.includes(id));
    const resto = predefinito.filter(id => ids.includes(id) && !voluto.includes(id));
    return [...voluto, ...resto, ...ids.filter(id => !voluto.includes(id) && !resto.includes(id))];
  };
  function applica() {
    const per = new Map(fissi().map(t => [t.id, t]));
    const fisse = new Set([...per.values()].map(t => t.slot)), altre = [...slotsEl.children].filter(c => !fisse.has(c));
    for (const id of ordine()) slotsEl.appendChild(per.get(id).slot);
    for (const c of altre) slotsEl.appendChild(c);                                  // le schede ridotte a icona restano in fondo
  }
  function disegna() {
    const per = new Map(fissi().map(t => [t.id, t])), ids = ordine();
    lista.innerHTML = '';
    ids.forEach((id, i) => {
      const t = per.get(id), li = document.createElement('li');
      li.dataset.id = id; li.draggable = true;
      const ic = t.grip.querySelector('svg');
      li.innerHTML = `<span class="ordIc"></span><span class="ordNome"></span>
        <button type="button" class="ordSu" aria-label="${tr('Sposta in su')}" title="${tr('Sposta in su')}"${i === 0 ? ' disabled' : ''}>↑</button><button type="button" class="ordGiu" aria-label="${tr('Sposta in giù')}" title="${tr('Sposta in giù')}"${i === ids.length - 1 ? ' disabled' : ''}>↓</button>`;
      if (ic) li.querySelector('.ordIc').append(ic.cloneNode(true));
      li.querySelector('.ordNome').textContent = tr(t.name || id);
      lista.append(li);
    });
  }
  function salva(ids) {
    settings.toolOrder = ids;
    applica(); disegna(); scheduleBoardSave();
  }
  lista.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const ids = ordine(), i = ids.indexOf(b.closest('li').dataset.id), j = i + (b.classList.contains('ordSu') ? -1 : 1);
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    salva(ids);
    const nuovo = lista.querySelector(`li[data-id="${ids[j]}"] .${b.classList.contains('ordSu') ? 'ordSu' : 'ordGiu'}`);
    if (nuovo && !nuovo.disabled) nuovo.focus();
  });
  // trascinare con il mouse (sui touch bastano le frecce)
  let preso = null;
  lista.addEventListener('dragstart', e => { preso = e.target.closest('li'); if (!preso) return; preso.classList.add('preso'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', preso.dataset.id); } catch {} });
  lista.addEventListener('dragover', e => {
    if (!preso) return; e.preventDefault();
    const li = e.target.closest('li'); if (!li || li === preso) return;
    const r = li.getBoundingClientRect();
    lista.insertBefore(preso, e.clientY > r.top + r.height / 2 ? li.nextSibling : li);
  });
  lista.addEventListener('drop', e => { if (preso) e.preventDefault(); });
  lista.addEventListener('dragend', () => {
    if (!preso) return; preso.classList.remove('preso'); preso = null;
    salva([...lista.children].map(li => li.dataset.id));
  });
  document.getElementById('ordineRipristina').addEventListener('click', () => salva(null));
  if (typeof afterBoardLoad === 'function') {
    const prima = afterBoardLoad;
    afterBoardLoad = function () { const r = prima.apply(this, arguments); applica(); disegna(); return r; };   // eslint-disable-line no-global-assign
  }
  applica(); disegna();
  window._ordineStrumenti = { applica, disegna, ordine };
})();
