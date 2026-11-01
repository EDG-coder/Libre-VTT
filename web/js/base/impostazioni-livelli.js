// ---------- Impostazioni a due livelli: predefinite per le campagne nuove, e «Applica a:» ----------
// Solo per chi conduce, da soli o come master (i giocatori non hanno campagne da cambiare).
(function () {
  'use strict';
  const tr = window.tr || (s => s);
  const $ = id => document.getElementById(id);
  const sect = $('livelliSect'); if (!sect) return;
  const chiamo = (metodo, url, corpo) => fetch(url, { method: metodo, headers: corpo ? { 'Content-Type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json(); });
  async function aggiorna() {
    const gioc = typeof netAs === 'function' && netAs() && typeof isMaster === 'function' && !isMaster();
    sect.hidden = gioc; if (gioc) return;
    try {
      const p = await chiamo('GET', 'api/predefinite');
      $('predSalva').disabled = !p.disponibile;
      $('predTogli').hidden = !p.settings;
      $('predStato').textContent = !p.disponibile ? tr('Le predefinite si salvano aprendo LIBRE VTT dall\'app.')
        : p.settings ? tr('Predefinite salvate il {d}: le campagne nuove partono con queste.', { d: new Date(p.quando).toLocaleString(window.LIBRE_I18N ? LIBRE_I18N.lingua : 'it', { dateStyle: 'short', timeStyle: 'short' }) })
        : tr('Le campagne nuove partono con le impostazioni di base.');
    } catch { $('predStato').textContent = ''; }
    try {
      const c = await chiamo('GET', 'api/campagne-vicine');
      const lista = $('applicaLista');
      lista.replaceChildren(...(c.campagne || []).map(x => { const l = document.createElement('label'); l.className = 'check'; const i = document.createElement('input'); i.type = 'checkbox'; i.value = x.id; const n = document.createElement('span'); n.textContent = x.nome; n.setAttribute('data-noi18n', ''); l.append(i, ' ', n); return l; }));
      if (!lista.children.length) { const p = document.createElement('p'); p.className = 'note'; p.textContent = tr('Nessun\'altra campagna nella cartella delle campagne.'); lista.append(p); }
      $('applicaVai').hidden = !(c.campagne || []).length;
    } catch {}
  }
  $('predSalva').addEventListener('click', async () => {
    try { await chiamo('PUT', 'api/predefinite', { settings }); aggiorna(); if (typeof setStatus === 'function') setStatus(tr('⭐ Impostazioni salvate per le prossime campagne.')); }
    catch (e) { alert(e.message); }
  });
  $('predTogli').addEventListener('click', async () => { if (!confirm(tr('Le campagne nuove ripartono dalle impostazioni di base?'))) return; await chiamo('DELETE', 'api/predefinite').catch(() => {}); aggiorna(); });
  $('applicaVai').addEventListener('click', async () => {
    const scelte = [...$('applicaLista').querySelectorAll('input:checked')].map(i => i.value);
    if (!scelte.length) { alert(tr('Spunta almeno una campagna.')); return; }
    if (!confirm(tr('Copiare queste impostazioni in {n} campagne? Le loro impostazioni attuali vengono sostituite (scene e schede no).', { n: scelte.length }))) return;
    try { const r = await chiamo('POST', 'api/applica-impostazioni', { campagne: scelte, settings }); alert(tr('Impostazioni copiate in {n} campagne.', { n: r.campagne.length })); }
    catch (e) { alert(e.message); }
  });
  document.querySelector('.tab[data-tab=settings]')?.addEventListener('click', aggiorna);
  setTimeout(aggiorna, 2000);
})();
