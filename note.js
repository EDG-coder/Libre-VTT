// ---------- 📝 Note ----------
// Due fogli: «Mie», che vede solo chi le scrive (restano su questo computer o dispositivo), e
// «Del gruppo», uguali per tutti: le scrive chi conduce e, se lui lo permette, anche i giocatori.
// In rete le note del gruppo le tiene il server (world.notes = { text, editable, by, at }).
// Da solo (o per chi conduce) stanno anche nello stato della campagna: persist 'notes'.
(function () {
  const tr = window.tr || (s => s);
  const $ = id => document.getElementById(id);
  const inRete = () => typeof NET !== 'undefined' && NET.on;
  const conduco = () => typeof isMaster !== 'function' || isMaster();

  const N = { mie: '', gruppo: { text: '', editable: false }, scheda: 'mie' };
  let pronto = false, timerMie = 0, timerGruppo = 0, arrivata = null;

  const box = mk('div', 'tool glass',
    `<button class="tgrip" type="button" aria-label="Note" title="Note">${ICON('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>')}</button>
     <div class="tbody" inert>
       <div class="trow noteTabs" role="tablist">
         <button type="button" role="tab" data-n="mie">Mie</button><button type="button" role="tab" data-n="gruppo">Del gruppo</button>
       </div>
       <textarea id="noteTesto" spellcheck="true" placeholder="Scrivi qui…"></textarea>
       <p class="tnote" id="noteInfo"></p>
       <label class="trow noteEdit"><input id="noteEdit" type="checkbox"> Anche i giocatori possono scrivere</label>
     </div>`);
  box.id = 'noteBox';
  document.body.appendChild(box);
  const ta = $('noteTesto');

  const puoScrivereGruppo = () => !inRete() || conduco() || !!N.gruppo.editable;
  function disegna() {
    const g = N.scheda === 'gruppo';
    box.querySelectorAll('.noteTabs button').forEach(b => { const on = b.dataset.n === N.scheda; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
    if (document.activeElement !== ta) ta.value = g ? N.gruppo.text : N.mie;
    ta.readOnly = g && !puoScrivereGruppo();
    ta.placeholder = g ? (ta.readOnly ? tr('Il master non ha ancora scritto niente qui.') : tr('Le vedono tutti: luoghi, nomi, indizi…')) : tr('Le vedi solo tu.');
    $('noteInfo').textContent = !g ? tr('Solo tu vedi queste note.')
      : ta.readOnly ? tr('Le scrive chi conduce: tu puoi leggerle.')
        : inRete() && !conduco() ? tr('Il master ti lascia scrivere: le vedono tutti.')
          : tr('Le vedono tutti i giocatori.');
    const ed = box.querySelector('.noteEdit');
    ed.hidden = !g || !conduco() || !inRete();
    $('noteEdit').checked = !!N.gruppo.editable;
    if (box.classList.contains('open') && typeof misuraPannello === 'function') misuraPannello(box);
  }
  function salvaLocale() { if (pronto) persist.save('notes', { mie: N.mie, gruppo: { text: N.gruppo.text, editable: !!N.gruppo.editable } }); }

  ta.addEventListener('input', () => {
    if (N.scheda === 'mie') {
      N.mie = ta.value.slice(0, 20000);
      clearTimeout(timerMie); timerMie = setTimeout(salvaLocale, 500);
      return;
    }
    if (ta.readOnly) return;
    N.gruppo.text = ta.value.slice(0, 20000);
    clearTimeout(timerGruppo);
    timerGruppo = setTimeout(() => {
      if (inRete()) intent('notes.save', { text: N.gruppo.text });
      if (conduco()) salvaLocale();
    }, 600);
  });
  // quello che arriva mentre scrivi aspetta che tu finisca
  ta.addEventListener('blur', () => { if (arrivata) { const a = arrivata; arrivata = null; noteDalServer(a, false); } });
  ta.addEventListener('keydown', e => e.stopPropagation());       // Canc, frecce, Ctrl+Z restano del testo

  box.querySelector('.noteTabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-n]'); if (!b) return;
    N.scheda = b.dataset.n; ta.blur(); disegna();
  });
  $('noteEdit').addEventListener('input', e => {
    N.gruppo.editable = e.target.checked;
    if (inRete()) intent('notes.edit', { editable: N.gruppo.editable });
    salvaLocale(); disegna();
  });

  // dal server (all'ingresso e ogni volta che qualcuno le cambia)
  window.noteDalServer = function (n, mio) {
    if (!n) return;
    if (conduco() && !String(n.text || '') && N.gruppo.text && !n.at) {   // sessione nuova: il master porta le sue
      intent('notes.save', { text: N.gruppo.text });
      if (N.gruppo.editable) intent('notes.edit', { editable: true });
      return;
    }
    if (mio) { N.gruppo.editable = !!n.editable; disegna(); return; }    // è l'eco di quello che ho scritto io
    if (document.activeElement === ta && N.scheda === 'gruppo') { arrivata = n; return; }
    N.gruppo = { text: String(n.text || ''), editable: !!n.editable };
    if (conduco()) salvaLocale();
    disegna();
  };

  box.querySelector('.tgrip').addEventListener('click', () => { toggleOpen(box, !box.classList.contains('open')); disegna(); });
  const strumento = registerTool('note', box, box.querySelector('.tgrip'), 'Note');
  // in alto, sotto dadi e turni: in fondo al menu si aprirebbe fuori dallo schermo
  if (typeof slotsEl !== 'undefined' && slotsEl.children[2]) slotsEl.insertBefore(strumento.slot, slotsEl.children[2]);

  // lo stato della campagna si legge quando la mappa è pronta (prima non si sa se c'è il server)
  const primaDopo = window.afterBoardLoad;
  window.afterBoardLoad = function () { const r = primaDopo && primaDopo.apply(this, arguments); carica(); return r; };
  const carica = () => persist.load('notes').then(v => {
    if (v && typeof v === 'object') {
      N.mie = String(v.mie || '');
      if (!inRete() && v.gruppo) N.gruppo = { text: String(v.gruppo.text || ''), editable: !!v.gruppo.editable };
      else if (conduco() && v.gruppo && !N.gruppo.text) N.gruppo = { text: String(v.gruppo.text || ''), editable: !!v.gruppo.editable };
    }
    pronto = true; disegna();
  });
})();
