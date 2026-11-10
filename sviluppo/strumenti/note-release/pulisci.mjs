// Toglie dalle note delle release già pubblicate i nomi dei manuali ufficiali e del marchio D&D
// (le note nuove partono già da .github/note-rilascio.md, che dice «compatibile con la 5ª edizione (SRD)»).
// Lo lancia il workflow «Pulisci note release» (Actions → Run workflow). Con PROVA=1 mostra soltanto cosa
// cambierebbe, senza toccare niente.
//   GITHUB_TOKEN=… GITHUB_REPOSITORY=proprietario/repo [PROVA=1] node pulisci.mjs
const SOSTITUZIONI = [
  ['Sul Manuale del Giocatore 2014 trova circa 530 voci.', 'Su un manuale di 5e completo trova circa 530 voci.'],
  ['Sul Monster Manual 2014 scansionato trova', 'Su un bestiario di 5e scansionato trova'],
  ['il tavolo da gioco virtuale per D&D 5e.', 'il tavolo da gioco virtuale per giochi di ruolo, compatibile con la 5ª edizione (SRD).'],
  ["regole dell'SRD 5.1 (D&D 2014) e 5.2 (D&D 2024)", "regole dell'SRD 5.1 (5e 2014) e 5.2 (5e 2024)"],
  ['scegli D&D 5e (2014), D&D 5.5 (2024) o un sistema', 'scegli 5e (2014), 5e (2024) o un sistema'],
  ['(per esempio quella ufficiale di D&D 5e)', '(per esempio quella ufficiale della 5ª edizione)']
];
export function pulisci(testo) {
  let t = String(testo || '');
  for (const [da, a] of SOSTITUZIONI) t = t.split(da).join(a);
  return t;
}

const TOKEN = process.env.GITHUB_TOKEN, REPO = process.env.GITHUB_REPOSITORY, PROVA = process.env.PROVA === '1';
if (TOKEN && REPO) {
  const api = (p, o = {}) => fetch('https://api.github.com/repos/' + REPO + p, {
    ...o, headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', ...(o.headers || {}) }
  }).then(async r => { if (!r.ok) throw new Error(p + ': ' + r.status + ' ' + await r.text()); return r.json(); });
  let cambiate = 0;
  for (let pagina = 1; ; pagina++) {
    const rel = await api(`/releases?per_page=100&page=${pagina}`);
    if (!rel.length) break;
    for (const r of rel) {
      const nuovo = pulisci(r.body);
      if (nuovo === (r.body || '')) continue;
      cambiate++;
      console.log(`${PROVA ? '[prova] ' : ''}${r.tag_name}: note da correggere`);
      for (const [da] of SOSTITUZIONI) if ((r.body || '').includes(da)) console.log('   - ' + da);
      if (!PROVA) await api('/releases/' + r.id, { method: 'PATCH', body: JSON.stringify({ body: nuovo }) });
    }
  }
  console.log(cambiate ? `${cambiate} release ${PROVA ? 'da correggere (prova: nessuna modifica fatta)' : 'corrette'}.` : 'Niente da correggere.');
}
