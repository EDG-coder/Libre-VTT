// ---------- Schede in un file: salvarle, importarle, tenerle sincronizzate ----------
// Una scheda si salva in un file .json, dove vuoi tu (menu della finestra → «Salva in un file…»).
// Il file si importa in qualsiasi partita, anche in quella di un altro dove giochi come giocatore
// («Nuova scheda» → «Importa da un file…»). Se vuoi, il file resta collegato alla scheda: ogni
// modifica che fai (o che fa il master) finisce anche nel file.
//
// Come si scrive il file:
//   computer (Chrome/Edge):  File System Access API, il file si riscrive da solo
//   Android:                 l'app tiene il permesso sul file scelto e lo riscrive (nativo.js)
//   iPhone/iPad, altri browser: salvare e importare sì, la sincronizzazione no

const FORMATO_SCHEDA = 'libre-vtt-scheda';
const NATF = window.LIBRE_NATIVO || { disponibile: false };
const FS_API = typeof window.showSaveFilePicker === 'function' && typeof window.showOpenFilePicker === 'function';
const SINCRO_POSSIBILE = FS_API || NATF.piattaforma === 'android';
const TIPI_JSON = [{ description: 'Scheda di LIBRE VTT', accept: { 'application/json': ['.json'] } }];

/** Una modifica fatta da qui (non scrivendo in un campo): si salva e, in rete, la si manda. */
function schedaCambiata(s) {
  scheduleSheets();
  if (typeof NET === 'undefined' || !NET.on || NET.applying) return;
  if (isMaster()) { if (typeof netPushBoard === 'function') netPushBoard(); return; }
  const srv = sheets.find(x => x.id === s.id);
  const mia = o => o && (o._access === 'rw' || (NET.me && o.owner === NET.me.token) || o._mia);
  if (mia(s) || mia(srv)) intent('sheet.save', { id: s.id, name: s.name, f: s.f, icon: s.icon });
}

// ---------- Il contenuto del file ----------
const immaginiCache = new Map();
const dataImg = v => typeof v === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(v) && v.length < 4e6;

/** Un'immagine della scheda, rimpicciolita e messa dentro il file (così il file basta da solo). */
async function immagineDentro(o, lato = 384) {
  const url = resolveUrl(o);
  if (!url) return null;
  if (dataImg(url) && url.length < 300000) return url;
  if (immaginiCache.has(url)) return immaginiCache.get(url);
  let out = null;
  try {
    const r = await fetch(url);
    if (r.ok) {
      const bmp = await createImageBitmap(await r.blob());
      const k = Math.min(1, lato / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      out = c.toDataURL('image/webp', 0.85);
      if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/png');
    }
  } catch { out = null; }
  immaginiCache.set(url, out);
  return out;
}

async function fileDiScheda(s) {
  const campi = { ...s.f };
  const immagini = { icona: s.icon ? await immagineDentro(s.icon, 256) : null };
  for (const k of ['img_portrait', 'img_symbol']) {
    if (campi[k]) immagini[k] = await immagineDentro({ url: campi[k], aid: campi[k + '_aid'] });
    delete campi[k]; delete campi[k + '_aid'];
  }
  return {
    formato: FORMATO_SCHEDA, versione: 1, programma: 'LIBRE VTT',
    salvata: new Date().toISOString(),
    scheda: { nome: s.name, modello: s.tpl, campi },
    immagini
  };
}
const testoDiFile = j => JSON.stringify(j, null, 1);
const nomeFile = s => (String(s.name || 'Personaggio').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Personaggio') + '.json';

function leggiScheda(testo) {
  let j;
  try { j = JSON.parse(testo); } catch { throw new Error('Questo file non si legge: non è una scheda di LIBRE VTT.'); }
  if (!j || j.formato !== FORMATO_SCHEDA || !j.scheda || typeof j.scheda.campi !== 'object') throw new Error('Questo file non è una scheda di LIBRE VTT.');
  return j;
}
/** Dal file ai pezzi della scheda (solo valori semplici: niente di strano entra nella partita). */
function contenutoDa(j) {
  const f = {};
  for (const [k, v] of Object.entries(j.scheda.campi || {})) {
    if (typeof v === 'string' && /^[\w-]{1,40}$/.test(k)) f[k] = v.slice(0, 30000);
  }
  const imm = j.immagini || {};
  for (const k of ['img_portrait', 'img_symbol']) if (dataImg(imm[k])) f[k] = imm[k];
  const tpl = ['standard', 'dnd5e', 'simple'].includes(j.scheda.modello) ? j.scheda.modello : 'dnd5e';
  return { name: String(j.scheda.nome || 'Personaggio').slice(0, 40), tpl, f, icon: dataImg(imm.icona) ? { url: imm.icona } : null };
}

// ---------- I collegamenti scheda ↔ file (si ricordano anche chiudendo il programma) ----------
// id della scheda → { tipo: 'fs'|'android', handle|uri, nome, salvata }
const SINCRO = new Map();
let dbSincro = null;
function apriDb() {
  if (dbSincro) return dbSincro;
  dbSincro = new Promise(res => {
    try {
      const r = indexedDB.open('libre-vtt-schede', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('sincro');
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch { res(null); }
  });
  return dbSincro;
}
async function registro(op, id, val) {
  const db = await apriDb();
  if (!db) return null;
  return new Promise(res => {
    try {
      const t = db.transaction('sincro', op === 'get' ? 'readonly' : 'readwrite'), st = t.objectStore('sincro');
      const r = op === 'put' ? st.put(val, id) : op === 'del' ? st.delete(id) : st.getAll();
      const k = op === 'get' ? st.getAllKeys() : null;
      t.oncomplete = () => res(op === 'get' ? { keys: k.result, vals: r.result } : true);
      t.onerror = () => res(null);
    } catch { res(null); }
  });
}
const salvaCollegamento = (id, e) => registro('put', id, { tipo: e.tipo, handle: e.handle, uri: e.uri, nome: e.nome, salvata: e.salvata });
async function caricaCollegamenti() {
  const r = await registro('get');
  if (!r) return;
  r.keys.forEach((id, i) => { const v = r.vals[i]; if (v && (v.handle || v.uri)) SINCRO.set(id, { ...v, stato: 'attesa' }); });
}

async function permesso(e, chiedi) {
  if (e.tipo !== 'fs') return true;
  try {
    const o = { mode: 'readwrite' };
    if (await e.handle.queryPermission(o) === 'granted') return true;
    return chiedi ? (await e.handle.requestPermission(o)) === 'granted' : false;
  } catch { return false; }
}
async function scriviCollegato(e, testo) {
  if (e.tipo === 'fs') {
    const w = await e.handle.createWritable();
    await w.write(testo); await w.close();
    return;
  }
  const r = await NATF.scriviFile(e.uri, testo);
  if (r !== true) throw new Error((r && r.errore) || 'il file non si scrive');
}
async function leggiCollegato(e) {
  if (e.tipo === 'fs') return (await e.handle.getFile()).text();
  const r = await NATF.leggiFile(e.uri);
  if (!r || typeof r.testo !== 'string') throw new Error((r && r.errore) || 'il file non si legge');
  return r.testo;
}
const firmaDi = s => JSON.stringify([s.name, s.tpl, s.f, s.icon && s.icon.url]);

/** Ogni pochi secondi: le schede cambiate finiscono nei loro file. */
let giroInCorso = false;
async function giroSincro() {
  if (giroInCorso || !SINCRO.size || typeof sheets === 'undefined' || !sheetsReady) return;
  giroInCorso = true;
  try {
    for (const [id, e] of SINCRO) {
      const s = sheets.find(x => x.id === id);
      if (!s) continue;
      if (!(await permesso(e, false))) { segnaStato(id, e, 'permesso'); continue; }
      if (!e.controllato) { e.controllato = true; await controllaFile(s, e); }
      if (e.stato !== 'errore') segnaStato(id, e, 'ok');
      const firma = firmaDi(s);
      if (e.firma === undefined) { e.firma = firma; continue; }   // appena aperto: non si scrive niente
      if (firma === e.firma) continue;
      try {
        const j = await fileDiScheda(s);
        await scriviCollegato(e, testoDiFile(j));
        e.firma = firma; e.salvata = j.salvata;
        salvaCollegamento(id, e);
        segnaStato(id, e, 'ok');
      } catch (err) {
        segnaStato(id, e, 'errore');
        if (e.avvisato !== 'errore') { e.avvisato = 'errore'; avvisoScheda(`Non riesco ad aggiornare il file «${e.nome}» della scheda «${s.name}»: ${err.message}`); }
      }
    }
  } finally { giroInCorso = false; }
}
setInterval(giroSincro, 2500);

/** Il file è stato cambiato altrove (un'altra partita, un altro dispositivo)? Si chiede che cosa tenere. */
async function controllaFile(s, e) {
  let j;
  try { j = leggiScheda(await leggiCollegato(e)); } catch { return; }
  if (!e.salvata || j.salvata === e.salvata) return;
  const quando = new Date(j.salvata).toLocaleString(window.LIBRE_I18N ? LIBRE_I18N.lingua : 'it', { dateStyle: 'short', timeStyle: 'short' });
  if (confirm(`Il file «${e.nome}» della scheda «${s.name}» è stato cambiato da un'altra parte (${quando}).\n\nOK: carico nella scheda la versione del file.\nAnnulla: tengo questa scheda (e alla prossima modifica il file si aggiorna con questa).`)) {
    applicaFile(s, j, e);
  } else {
    e.salvata = j.salvata; salvaCollegamento(s.id, e);
  }
}

function applicaFile(s, j, e) {
  const c = contenutoDa(j);
  s.name = c.name; s.f = c.f; if (c.icon) s.icon = c.icon;
  if (e) { e.salvata = j.salvata; e.firma = firmaDi(s); salvaCollegamento(s.id, e); }
  const w = wins.get(s.id);
  if (w) { const r = w.getBoundingClientRect(); closeWin(w); const n = openSheet(s.id); if (n) { n.style.left = r.left + 'px'; n.style.top = r.top + 'px'; } }
  renderSheetList(); updateTokenBars();
  schedaCambiata(s);
}

function segnaStato(id, e, st) {
  e.stato = st;
  const w = wins.get(id);
  if (!w) return;
  w.classList.toggle('sincro', st === 'ok');
  w.classList.toggle('sincroFerma', st !== 'ok');
  w._name.title = st === 'ok' ? `Sincronizzata con il file «${e.nome}»` : st === 'permesso' ? 'Sincronizzazione in pausa: menu della finestra → «Riattiva la sincronizzazione»' : `Il file «${e.nome}» non si aggiorna`;
}
function avvisoScheda(t) {
  if (typeof addChat === 'function') addChat({ kind: 'text', text: t });
  else alert(t);
}

// ---------- Salvare ----------
async function salvaSuFile(s) {
  const j = await fileDiScheda(s), testo = testoDiFile(j), nome = nomeFile(s);
  let e = null;
  if (FS_API && !NATF.disponibile) {
    let handle;
    try { handle = await showSaveFilePicker({ suggestedName: nome, types: TIPI_JSON }); }
    catch (err) { if (err && err.name === 'AbortError') return; throw err; }
    const w = await handle.createWritable(); await w.write(testo); await w.close();
    e = { tipo: 'fs', handle, nome: handle.name, salvata: j.salvata };
  } else if (NATF.disponibile) {
    const r = await NATF.salvaFile(nome, testo);
    if (!r) return;
    if (r.errore) throw new Error(r.errore);
    if (r.uri) e = { tipo: 'android', uri: r.uri, nome: r.nome || nome, salvata: j.salvata };
    else { avvisoScheda(`Scheda «${s.name}» salvata in «${r.nome || nome}».`); return; }
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([testo], { type: 'application/json' }));
    a.download = nome; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    avvisoScheda(`Scheda «${s.name}» salvata nei download come «${nome}». (Con questo browser il file non si può tenere sincronizzato: usa l'app di LIBRE VTT.)`);
    return;
  }
  if (confirm(`Scheda salvata in «${e.nome}».\n\nVuoi tenerla sincronizzata? Ogni modifica a questa scheda verrà scritta anche nel file.`)) collega(s, e);
  else avvisoScheda(`Scheda «${s.name}» salvata in «${e.nome}».`);
}

function collega(s, e) {
  e.firma = firmaDi(s); e.controllato = true;
  SINCRO.set(s.id, e);
  salvaCollegamento(s.id, e);
  segnaStato(s.id, e, 'ok');
  avvisoScheda(`🔗 La scheda «${s.name}» è sincronizzata con il file «${e.nome}».`);
}
function scollega(s) {
  SINCRO.delete(s.id); registro('del', s.id);
  const w = wins.get(s.id); if (w) { w.classList.remove('sincro', 'sincroFerma'); w._name.title = ''; }
}

// ---------- Il menu della finestra ----------
function vociFileScheda(w) {
  const s = w._sheet, e = SINCRO.get(s.id), out = ['-'];
  out.push({ label: '💾 Salva in un file…', fn: () => salvaSuFile(s).catch(err => avvisoScheda('Non sono riuscito a salvare la scheda: ' + err.message)) });
  if (e) {
    if (e.stato === 'permesso') out.push({ label: '🔗 Riattiva la sincronizzazione', fn: async () => {
      if (await permesso(e, true)) { e.controllato = false; segnaStato(s.id, e, 'ok'); giroSincro(); } else avvisoScheda('Senza il permesso di scrivere il file la sincronizzazione resta in pausa.');
    } });
    out.push({ label: `⟳ Ricarica dal file «${e.nome}»`, fn: async () => {
      try { if (!(await permesso(e, true))) return; applicaFile(s, leggiScheda(await leggiCollegato(e)), e); }
      catch (err) { avvisoScheda('Non riesco a leggere il file: ' + err.message); }
    } });
    out.push({ label: '⛓ Smetti di sincronizzare', fn: () => { scollega(s); avvisoScheda(`La scheda «${s.name}» non è più collegata al file «${e.nome}».`); } });
  }
  return out;
}

// ---------- Importare ----------
document.body.insertAdjacentHTML('beforeend', `
<dialog id="importSheetDialog"><form method="dialog" id="importSheetForm">
  <h3>Importa una scheda</h3>
  <p id="importSheetInfo"></p>
  <label class="check" id="importSheetSyncRow"><input type="checkbox" id="importSheetSync"> Tieni sincronizzato il file: le modifiche che fai qui (e quelle del master) finiscono anche nel file</label>
  <p class="note" id="importSheetNoSync" hidden>Su questo dispositivo la scheda si importa così com'è, ma il file non si può tenere sincronizzato.</p>
  <p class="err" id="importSheetErr" hidden></p>
  <div class="dialogBtns"><button type="button" id="importSheetCancel" class="btn ghost">Annulla</button><button type="submit" class="btn">Importa</button></div>
</form></dialog>`);

let daImportare = null;   // { j, e }

async function scegliFileScheda() {
  if (FS_API && !NATF.disponibile) {
    let handle;
    try { [handle] = await showOpenFilePicker({ types: TIPI_JSON, multiple: false }); }
    catch (err) { if (err && err.name === 'AbortError') return null; throw err; }
    const testo = await (await handle.getFile()).text();
    return { testo, e: { tipo: 'fs', handle, nome: handle.name } };
  }
  if (NATF.disponibile) {
    const r = await NATF.apriFile();
    if (!r) return null;
    if (r.errore) throw new Error(r.errore);
    return { testo: r.testo, e: r.uri && r.scrivibile ? { tipo: 'android', uri: r.uri, nome: r.nome || 'scheda.json' } : null };
  }
  return new Promise(res => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = '.json,application/json';
    i.onchange = async () => { const f = i.files && i.files[0]; res(f ? { testo: await f.text(), e: null } : null); };
    i.click();
  });
}

$('sheetImport').addEventListener('click', async () => {
  let scelto;
  try { scelto = await scegliFileScheda(); } catch (err) { alert('Non riesco ad aprire il file: ' + err.message); return; }
  if (!scelto) return;
  let j;
  try { j = leggiScheda(scelto.testo); } catch (err) { alert(err.message); return; }
  daImportare = { j, e: scelto.e };
  const c = contenutoDa(j), modello = { standard: 'Standard', dnd5e: 'Open D&D 5e', simple: 'Open semplice' }[c.tpl];
  const quando = j.salvata ? new Date(j.salvata).toLocaleString(window.LIBRE_I18N ? LIBRE_I18N.lingua : 'it', { dateStyle: 'short', timeStyle: 'short' }) : '';
  $('importSheetInfo').textContent = `«${c.name}» · scheda ${modello}` + (c.f.class ? ` · ${c.f.class}${c.f.level ? ' ' + c.f.level : ''}` : '') + (quando ? ` · salvata il ${quando}` : '');
  const puo = !!scelto.e;
  $('importSheetSyncRow').hidden = !puo; $('importSheetSync').checked = puo;
  $('importSheetNoSync').hidden = puo;
  $('importSheetErr').hidden = true;
  $('sheetDialog').close();
  $('importSheetDialog').showModal();
});
$('importSheetCancel').addEventListener('click', () => { daImportare = null; $('importSheetDialog').close(); });
$('importSheetForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  if (!daImportare) return;
  const { j, e } = daImportare;
  const vuoleSincro = e && $('importSheetSync').checked;
  if (vuoleSincro && !(await permesso(e, true))) {
    $('importSheetErr').textContent = 'Per tenerla sincronizzata serve il permesso di scrivere il file: riprova e consenti, oppure togli la spunta.';
    $('importSheetErr').hidden = false;
    return;
  }
  const c = contenutoDa(j);
  const s = { id: uid(), icon: c.icon, name: c.name, tpl: c.tpl, f: c.f };
  sheets.push(s); renderSheetList(); scheduleSheets();
  if (typeof onSheetCreated === 'function') onSheetCreated(s);
  daImportare = null;
  $('importSheetDialog').close();
  openSheet(s.id);
  if (vuoleSincro) { e.salvata = j.salvata; collega(s, e); }
  else avvisoScheda(`Scheda «${s.name}» importata.`);
});

// all'avvio: si ritrovano i collegamenti, e le finestre aperte mostrano se sono sincronizzate
caricaCollegamenti().then(() => setTimeout(giroSincro, 1500));
