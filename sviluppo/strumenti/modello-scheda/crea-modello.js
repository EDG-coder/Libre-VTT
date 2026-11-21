// Prepara il modello PDF della scheda (web/modelli/scheda-5e.pdf) partendo dal PDF compilabile
// «Scheda editabile D&D 5 2023» (3 pagine, in italiano).
//
//   node sviluppo/strumenti/modello-scheda/crea-modello.js <scheda-originale.pdf> [uscita.pdf]
//
// Cosa fa:
//  1. toglie il logo «Dungeons & Dragons» (e il simbolo ®) dalle tre pagine: il disegno del logo sta dentro
//     un riquadro di ritaglio, che si riduce a niente (le figure e il resto della grafica restano);
//  2. ripara la rubrica dei campi: il file salvato da macOS (Anteprima) ha due copie di ogni campo, una nel
//     modulo e una sulla pagina, e le due non si parlano; si tiene quella sulla pagina;
//  3. svuota tutti i campi (il PDF originale ha dentro un personaggio d'esempio);
//  4. aggiunge un campo «CharacterName» (il nome) sulle prime due pagine, dove nell'originale c'è il nastro vuoto.
// L'esportazione dal VTT (scheda-pdf-export.js) riempie questo modello e mette il segnalino del personaggio
// nell'immagine «Aspetto del personaggio» (campo Image1_af_image, pagina 2).
const fs = require('fs');
const path = require('path');
const L = require(path.join(__dirname, '../../../web/lib/pdf-lib.min.js'));

const NOME = L.PDFName.of;

async function main() {
  const [entrata, uscita = path.join(__dirname, '../../../web/modelli/scheda-5e.pdf')] = process.argv.slice(2);
  if (!entrata) { console.error('Uso: node crea-modello.js <scheda-originale.pdf> [uscita.pdf]'); process.exit(1); }
  const doc = await L.PDFDocument.load(fs.readFileSync(entrata), { ignoreEncryption: true, updateMetadata: false });
  const ctx = doc.context;
  const pagine = doc.getPages();

  // 1. il logo: i riquadri di ritaglio in alto a sinistra che contengono le lettere (e il ®)
  let tolti = 0;
  pagine.forEach(pg => {
    const c = pg.node.Contents();
    const flussi = c instanceof L.PDFArray ? [...Array(c.size()).keys()].map(k => c.lookup(k)) : [c];
    const testo = flussi.map(s => Buffer.from(L.decodePDFRawStream(s).decode()).toString('latin1')).join('\n');
    // il titolo in cima alla pagina 1 («Scheda editabile D&D 5 - 2023») cita il marchio: via
    const senzaTitolo = testo.replace(/BT\s+6\.828\s+0\s+0\s+6\.828\s+[\d.]+\s+833\.035\s+Tm[^]*?\bET/g, () => { tolti++; return ''; });
    const nuovo = senzaTitolo.replace(/q\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+re\s+W\s+n/g, (m, x, y, w, h) => {
      x = +x; y = +y; w = +w; h = +h;
      if (y > 700 && w > 50 && w < 260 && h < 60) { tolti++; return 'q 0 0 0 0 re W n'; }
      return m;
    });
    const rif = ctx.register(ctx.flateStream(Buffer.from(nuovo, 'latin1')));
    pg.node.set(NOME('Contents'), rif);
  });
  console.log('gruppi del logo tolti:', tolti);

  // 2. la rubrica dei campi: quelli sulla pagina
  const acro = doc.catalog.lookup(NOME('AcroForm'), L.PDFDict);
  const campi = ctx.obj([]);
  const visti = new Set();
  pagine.forEach(pg => {
    const an = pg.node.Annots();
    for (let k = 0; k < an.size(); k++) {
      const rif = an.get(k), d = an.lookup(k, L.PDFDict);
      const T = d.lookup(NOME('T'));
      if (!T || visti.has(String(rif))) continue;
      visti.add(String(rif));
      campi.push(rif);
      d.set(NOME('P'), pg.ref);
    }
  });
  acro.set(NOME('Fields'), campi);

  // 3. campi vuoti
  const form = doc.getForm();
  for (const f of form.getFields()) {
    const d = f.acroField.dict;
    if (f instanceof L.PDFTextField) { if (!(f.acroField.getFlags() & 1)) d.delete(NOME('V')); }   // il «10» in alto è di sola lettura: resta
    if (f instanceof L.PDFCheckBox) { d.set(NOME('V'), NOME('Off')); d.set(NOME('AS'), NOME('Off')); }
  }

  // 4. il nome del personaggio
  const nome = form.createTextField('CharacterName');
  const POS = [[1, 56, 752, 190, 22], [2, 56, 752, 190, 22]];      // la pagina 3 ha già il suo riquadro («Classe da incantatore»)
  for (const [p, x, y, w, h] of POS) nome.addToPage(pagine[p - 1], { x, y, width: w, height: h, borderWidth: 0, borderColor: undefined, backgroundColor: undefined });
  nome.setFontSize(14);

  doc.setTitle('Scheda del personaggio');
  doc.setProducer('Libre VTT');
  doc.setCreator('Libre VTT');
  fs.mkdirSync(path.dirname(uscita), { recursive: true });
  fs.writeFileSync(uscita, await doc.save({ updateFieldAppearances: false }));
  console.log('scritto', uscita, form.getFields().length, 'campi');
}
main().catch(e => { console.error(e); process.exit(1); });
