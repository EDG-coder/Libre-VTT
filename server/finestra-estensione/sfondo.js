// Il browser della finestra di LIBRE VTT ha un profilo tutto suo. Se ci si apre una finestra normale
// (⌘N, ⌘T, un link aperto in una scheda nuova, un clic sull'icona del browser nel Dock, un link da
// un'altra app), sembra il browser di tutti i giorni ma è vuoto: niente segnalibri, accessi, cronologia.
// E con ⌘Q si chiudeva anche LIBRE VTT. Qui quelle pagine si mandano al browser vero e si chiudono.
// Le pagine di LIBRE VTT (127.0.0.1, localhost) restano dove sono.
const PORTA = __PORTA__;
const decise = new Set(), daGuardare = new Set();
const locale = u => /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i.test(u);
const nuovaScheda = u => /^(chrome|brave|edge|vivaldi):\/\/(newtab|new-tab-page|vivaldi-webui\/startpage)/i.test(u);

async function guarda(tab, url) {
  if (!daGuardare.has(tab.id) || decise.has(tab.id)) return;
  if (!url || /^about:/i.test(url)) return;                 // pagina non ancora partita: si aspetta l'indirizzo vero
  decise.add(tab.id); daGuardare.delete(tab.id);
  if (locale(url)) return;                                   // una pagina di LIBRE VTT: resta qui
  const esterna = /^https?:\/\//i.test(url);
  if (!esterna && !nuovaScheda(url)) return;                 // impostazioni del browser e simili: si lasciano
  try {
    const w = await chrome.windows.get(tab.windowId);
    if (w.type !== 'normal') return;                         // la finestra di LIBRE VTT e i popup non si toccano
    const r = await fetch(`http://127.0.0.1:${PORTA}/api/fuori`, {
      method: 'POST', headers: { 'X-Libre-VTT': 'fuori', 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: esterna ? url : '' })
    });
    if (r.ok) await chrome.tabs.remove(tab.id);
  } catch {}                                                 // LIBRE VTT già spento: la scheda resta com'è
}

chrome.tabs.onCreated.addListener(tab => { daGuardare.add(tab.id); guarda(tab, tab.pendingUrl || tab.url); });
chrome.tabs.onUpdated.addListener((id, info, tab) => { if (info.url || info.status === 'loading') guarda(tab, info.url || tab.pendingUrl || tab.url); });
chrome.tabs.onRemoved.addListener(id => { decise.delete(id); daGuardare.delete(id); });
