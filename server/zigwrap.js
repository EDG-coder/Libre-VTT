// Fa passare zig per un normale compilatore C / linker, quando LIBRE VTT costruisce da solo il
// collegamento a distanza (vedi launcher.js, «costruisci»). Così non servono Visual Studio né
// build-essential: zig è un solo archivio, scaricato nella cartella privata di LIBRE VTT.
//
//   node zigwrap.js <zig> cc|c++|ar <target-zig> [argomenti come per gcc/clang]
//
// Rust e il crate «cc» parlano con il compilatore come se fosse gcc/clang: quasi tutto va bene
// anche a zig, tranne poche opzioni, che qui si tolgono.
'use strict';
const fs = require('fs');
const { spawnSync } = require('child_process');

const [zig, modo, target, ...grezzi] = process.argv.slice(2);

/** File «@risposta» (righe di comando lunghe): argomenti separati da spazi, con virgolette e \ */
function leggiRisposta(testo) {
  const out = []; let cur = '', dentro = null, c = false;
  for (let i = 0; i < testo.length; i++) {
    const ch = testo[i];
    if (ch === '\\' && i + 1 < testo.length) { cur += testo[++i]; c = true; continue; }
    if (dentro) { if (ch === dentro) dentro = null; else cur += ch; continue; }
    if (ch === '"' || ch === "'") { dentro = ch; c = true; continue; }
    if (/\s/.test(ch)) { if (c || cur) out.push(cur); cur = ''; c = false; continue; }
    cur += ch;
  }
  if (c || cur) out.push(cur);
  return out;
}
function espandi(args) {
  const out = [];
  for (const a of args) {
    if (a.startsWith('@') && a.length > 1) {
      try { out.push(...espandi(leggiRisposta(fs.readFileSync(a.slice(1), 'utf8')))); continue; } catch {}
    }
    out.push(a);
  }
  return out;
}

// Opzioni da togliere: il bersaglio lo decide zig (-target), il linker è sempre il suo.
const VIA = [
  /^--target=/,                      // il crate cc lo aggiunge per i compilatori «clang» con il nome di Rust
  /^-fuse-ld=/, /^-B/,               // Rust chiede il suo rust-lld: zig usa già lld
];
const VIA_COPPIA = new Set(['-target', '--target', '-arch']);   // questi si portano dietro il valore

// Opzioni del linker (dentro «-Wl,a,b,c») che lld di zig rifiuta con «unsupported linker arg».
// Si tolgono una per una, lasciando le altre della stessa lista.
const LINKER_VIA = [
  /^--fix-cortex-a53-8(43419|35769)$/,  // Rust le chiede su ARM64 Linux (Raspberry, Chromebook, ARM): lld le applica già da sé
  /^-znostart-stop-gc$/,
  /^--no-undefined-version$/,
  /^--compress-debug-sections=/,
];
function filtraWl(a) {
  const pezzi = a.slice(4).split(','), tieni = [];
  for (let i = 0; i < pezzi.length; i++) {
    const p = pezzi[i];
    if (p === '-z' && pezzi[i + 1] === 'nostart-stop-gc') { i++; continue; }
    if (LINKER_VIA.some(r => r.test(p))) continue;
    tieni.push(p);
  }
  return tieni.length ? '-Wl,' + tieni.join(',') : null;
}

const args = [];
const tutti = modo === 'ar' ? grezzi : espandi(grezzi);
for (let i = 0; i < tutti.length; i++) {
  let a = tutti[i];
  if (modo !== 'ar') {
    if (VIA_COPPIA.has(a)) { i++; continue; }
    if (VIA.some(r => r.test(a))) continue;
    if (a.startsWith('-Wl,')) { a = filtraWl(a); if (a === null) continue; }
    if (a === '-lgcc_s') a = '-lunwind';   // zig non ha libgcc_s: il suo libunwind fa lo stesso lavoro
  }
  args.push(a);
}

const finali = modo === 'ar' ? ['ar', ...args] : [modo, '-target', target, ...args];
const r = spawnSync(zig, finali, { stdio: 'inherit', windowsHide: true });
if (r.error) { console.error('zigwrap: ' + r.error.message); process.exit(1); }
process.exit(r.status == null ? 1 : r.status);
