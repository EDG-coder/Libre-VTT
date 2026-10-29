// ---------- Il mondo a pezzi: versioni e differenze (gli stessi conti sul server e nel browser) ----------
// Il server non rimanda più tutto il mondo a ogni modifica: lo divide in pezzi (ogni scena senza segnalini,
// ogni segnalino, ogni scheda, il sistema, il compendio, i turni…), si ricorda per ogni giocatore l'ultimo
// pezzo che gli ha mandato e gli manda solo quelli cambiati, con un numero di versione. Il browser fa gli
// stessi pezzi e rimette insieme il mondo. La chat non sta nei pezzi: i messaggi viaggiano da soli.
//
// Chiavi dei pezzi:  k:<nome> (un campo del mondo) · sco (l'ordine delle scene) · sc:<id> (la scena senza
// segnalini) · pho:<scena> (l'ordine dei segnalini) · ph:<scena>:<id> (un segnalino) · sho (l'ordine delle
// schede) · sh:<id> (una scheda).
(function (radice, fabbrica) {
  const m = fabbrica();
  if (typeof module === 'object' && module.exports) module.exports = m; else radice.VERSIONI = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Il nome di ogni elemento di un elenco: l'id, o (se manca o è doppio) la posizione. */
  function nomi(lista) {
    const visti = new Set();
    return lista.map((x, i) => {
      let n = x && x.id != null ? String(x.id) : '#' + i;
      if (visti.has(n)) n = n + '#' + i;
      visti.add(n);
      return n;
    });
  }

  /** Mondo → Map(chiave → valore). La chat resta fuori. */
  function pezzi(w) {
    const out = new Map();
    for (const k of Object.keys(w || {})) {
      if (k === 'scenes' || k === 'sheets' || k === 'chat' || w[k] === undefined) continue;
      out.set('k:' + k, w[k]);
    }
    const scene = Array.isArray(w.scenes) ? w.scenes : [];
    const nsc = nomi(scene);
    out.set('sco', nsc);
    scene.forEach((sc, i) => {
      const meta = {};
      for (const k of Object.keys(sc)) if (k !== 'photos' && sc[k] !== undefined) meta[k] = sc[k];
      out.set('sc:' + nsc[i], meta);
      const ph = Array.isArray(sc.photos) ? sc.photos : [];
      const nph = nomi(ph);
      out.set('pho:' + nsc[i], nph);
      ph.forEach((p, j) => out.set('ph:' + nsc[i] + ':' + nph[j], p));
    });
    const schede = Array.isArray(w.sheets) ? w.sheets : [];
    const nsh = nomi(schede);
    out.set('sho', nsh);
    schede.forEach((s, i) => out.set('sh:' + nsh[i], s));
    return out;
  }

  /** Map(chiave → valore) → mondo (senza chat). */
  function ricomponi(P) {
    const w = {};
    for (const [k, v] of P) if (k.startsWith('k:')) w[k.slice(2)] = v;
    w.scenes = (P.get('sco') || []).map(n => {
      const meta = P.get('sc:' + n);
      if (!meta) return null;
      return { ...meta, photos: (P.get('pho:' + n) || []).map(j => P.get('ph:' + n + ':' + j)).filter(Boolean) };
    }).filter(Boolean);
    w.sheets = (P.get('sho') || []).map(n => P.get('sh:' + n)).filter(Boolean);
    return w;
  }

  /** Quali campi del mondo tocca una chiave (per non rifare il lavoro sulle parti rimaste uguali). */
  function campo(k) {
    if (k === 'sco' || k.startsWith('sc:') || k.startsWith('pho:') || k.startsWith('ph:')) return 'scenes';
    if (k === 'sho' || k.startsWith('sh:')) return 'sheets';
    return k.slice(2);
  }

  /** Applica una differenza { set: {chiave: valore}, via: [chiavi] } ai pezzi. Restituisce i campi toccati. */
  function applica(P, d) {
    const toccati = new Set();
    for (const k of d.via || []) { P.delete(k); toccati.add(campo(k)); }
    for (const k of Object.keys(d.set || {})) { P.set(k, d.set[k]); toccati.add(campo(k)); }
    return toccati;
  }

  return { pezzi, ricomponi, applica, campo };
});
