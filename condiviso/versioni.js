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

  /** Una scena o una scheda cambiata: solo i campi cambiati (per le schede anche dentro a «f», i valori della
   *  scheda: un punto ferita in meno sono poche decine di byte invece della scheda intera).
   *  { p: [[percorso, valore]…], v: [percorso…] }, con percorso = ['campo'] o ['f', 'campo']. */
  function toppa(vecchio, nuovo) {
    const p = [], v = [], j = x => JSON.stringify(x === undefined ? null : x);
    const ogg = x => x && typeof x === 'object' && !Array.isArray(x);
    const c = (o, k) => o[k] !== undefined;                       // un campo undefined è come se non ci fosse
    for (const k of Object.keys(nuovo)) {
      if (!c(nuovo, k)) continue;
      if (k === 'f' && ogg(vecchio.f) && ogg(nuovo.f)) {
        for (const fk of Object.keys(nuovo.f)) if (c(nuovo.f, fk) && j(vecchio.f[fk]) !== j(nuovo.f[fk])) p.push([['f', fk], nuovo.f[fk]]);
        for (const fk of Object.keys(vecchio.f)) if (!c(nuovo.f, fk)) v.push(['f', fk]);
      } else if (j(vecchio[k]) !== j(nuovo[k])) p.push([[k], nuovo[k]]);
    }
    for (const k of Object.keys(vecchio)) if (!c(nuovo, k)) v.push([k]);
    return { p, v };
  }

  /** Applica una differenza { set: {chiave: valore}, via: [chiavi], toppe: {chiave: toppa} } ai pezzi.
   *  Restituisce i campi del mondo toccati. */
  function applica(P, d) {
    const toccati = new Set();
    for (const k of d.via || []) { P.delete(k); toccati.add(campo(k)); }
    for (const k of Object.keys(d.set || {})) { P.set(k, d.set[k]); toccati.add(campo(k)); }
    for (const k of Object.keys(d.toppe || {})) {
      const o = P.get(k), t = d.toppe[k];
      if (!o || typeof o !== 'object') continue;
      for (const pp of t.v || []) { if (pp.length === 2) { if (o[pp[0]]) delete o[pp[0]][pp[1]]; } else delete o[pp[0]]; }
      for (const [pp, val] of t.p || []) {
        if (pp.length === 2) { if (!o[pp[0]] || typeof o[pp[0]] !== 'object') o[pp[0]] = {}; o[pp[0]][pp[1]] = val; }
        else o[pp[0]] = val;
      }
      toccati.add(campo(k));
    }
    return toccati;
  }

  return { pezzi, ricomponi, applica, campo, toppa };
});
