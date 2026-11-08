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
  e.respondWith(dai(m[1], e.clientId).then(r => r.ok ? aPezzi(r, e.request.headers.get('range')) : r));
});

// I video (sfondi animati) il browser li chiede a pezzi, con «Range»: Safari (iPhone, iPad, Mac) senza
// una risposta 206 non li fa partire. Dalla cache si ritaglia il pezzo chiesto.
async function aPezzi(r, range) {
  const q = /^bytes=(\d*)-(\d*)$/.exec(String(range || '').trim());
  if (!q || !(q[1] || q[2])) return r;
  const blob = await r.blob(), n = blob.size;
  const da = q[1] ? +q[1] : Math.max(0, n - +q[2]), a = q[1] && q[2] ? Math.min(+q[2], n - 1) : n - 1;
  const testa = new Headers(r.headers);
  if (da >= n || da > a) { testa.set('Content-Range', 'bytes */' + n); return new Response('', { status: 416, headers: testa }); }
  testa.set('Content-Range', `bytes ${da}-${a}/${n}`); testa.set('Content-Length', String(a - da + 1)); testa.set('Accept-Ranges', 'bytes');
  return new Response(blob.slice(da, a + 1), { status: 206, headers: testa });
}

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
