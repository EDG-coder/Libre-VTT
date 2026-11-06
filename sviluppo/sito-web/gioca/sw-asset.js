// Solo sul sito. Le immagini della partita (mappe, segnalini, compendio del master) arrivano dal master
// attraverso il relay, a pezzi, dentro il WebSocket: il tavolo però le chiede come sempre, con un indirizzo
// «asset/<hash>». Questo service worker risponde a quegli indirizzi: dalla cache del browser se ci sono già,
// altrimenti chiede alla pagina di farsele mandare (gioca-web.js) e aspetta.
const CACHE = 'libre-asset-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  const m = u.pathname.match(/\/asset\/([a-f0-9]{64})$/);
  if (!m) return;
  e.respondWith(dai(m[1], e.clientId));
});

async function dai(hash, clientId) {
  const cache = await caches.open(CACHE);
  const chiave = new URL('asset/' + hash, self.registration.scope).href;
  let r = await cache.match(chiave);
  if (r) return r;
  const pagine = [];
  if (clientId) { const c = await self.clients.get(clientId); if (c) pagine.push(c); }
  if (!pagine.length) pagine.push(...await self.clients.matchAll({ type: 'window' }));
  for (const c of pagine) {
    const ok = await new Promise(res => {
      const ch = new MessageChannel();
      const t = setTimeout(() => res(false), 120000);
      ch.port1.onmessage = ev => { clearTimeout(t); res(!!ev.data); };
      c.postMessage({ t: 'libre-asset', hash }, [ch.port2]);
    });
    if (ok && (r = await cache.match(chiave))) return r;
  }
  return new Response('', { status: 404, statusText: 'Immagine non arrivata' });
}
