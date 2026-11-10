// ---------- I manuali importati: un catalogo privato, solo su questo dispositivo ----------
// Le voci lette da un manuale che l'utente possiede (PDF o testo incollato, vedi compendio-manuale.js) non
// stanno nella cartella della campagna: stanno in una cartella dell'utente (LIBRE_MANUALI, la passa
// l'avviatore: <dati dell'app>/manuali-privati). Così non finiscono nelle campagne esportate, copiate su
// un server o in iCloud, e non le vedono il master o i giocatori: il tavolo non le manda mai in rete
// (vedi COMPENDIO.perRete in compendio.js), e il deposito del server di gioco le rifiuta (game-server.js).
//
// Pacchetti di prima (versioni fino alla 3.9.0) importati da un manuale stanno ancora nella campagna
// (compendio/manuale-…): si riconoscono da qui (èManuale) e vengono trattati allo stesso modo.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');

// la licenza che il lettore dei manuali scrive nel pacchetto, in italiano o in inglese
const LICENZA_MANUALE = /^\s*(Copiato da un manuale che possiedi|Copied from a book you own|Copied from a manual you own)/i;

/** Il pacchetto (il suo pacchetto.json, o la testa che il master manda) viene da un manuale importato? */
function èManuale(j) {
  if (!j || typeof j !== 'object') return false;
  if (j.privato === true) return true;
  if (LICENZA_MANUALE.test(String(j.licenza || ''))) return true;
  return !!(j.usoPersonale && /^manuale-/.test(String(j.id || '')));
}

/** Un JSON del deposito (il file di un pacchetto che il master manda ai giocatori) contiene un manuale? */
function jsonConManuale(testo) {
  let j; try { j = JSON.parse(testo); } catch { return false; }
  return !!(j && typeof j === 'object' && j.pacchetto && èManuale(j.pacchetto));
}

/** La cartella del catalogo privato. */
function cartellaManuali() {
  if (process.env.LIBRE_MANUALI) return path.resolve(process.env.LIBRE_MANUALI);
  // avviato a mano (npm start): nella cartella dell'utente, mai in quella del programma o della campagna
  return path.join(os.homedir(), '.libre-vtt', 'manuali-privati');
}

/** Le sottocartelle compendio/<id> della campagna che contengono un manuale importato con le versioni di prima. */
function manualiNellaCampagna(campagna) {
  const comp = path.join(campagna, 'compendio'), out = [];
  let nomi = []; try { nomi = fs.readdirSync(comp); } catch { return out; }
  for (const n of nomi) {
    if (n.startsWith('.')) continue;
    let j = null; try { j = JSON.parse(fs.readFileSync(path.join(comp, n, 'pacchetto.json'), 'utf8')); } catch {}
    if (j && èManuale({ ...j, id: j.id || n })) out.push(n);
  }
  return out;
}

module.exports = { èManuale, jsonConManuale, cartellaManuali, manualiNellaCampagna, LICENZA_MANUALE };
