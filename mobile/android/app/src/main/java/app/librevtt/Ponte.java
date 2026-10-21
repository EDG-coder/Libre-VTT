package app.librevtt;

import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.util.Log;
import android.view.HapticFeedbackConstants;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;

/**
 * Il ponte tra la pagina e Android: la pagina chiama window.LibreAndroid.invia(json) e riceve
 * la risposta in LIBRE_NATIVO._risposta(id, dati). Vedi nativo.js per l'elenco dei comandi.
 */
final class Ponte {
    static final int RICHIESTA_ZIP = 11, RICHIESTA_CARTELLA = 12, RICHIESTA_SALVA = 13, RICHIESTA_SALVA_TESTO = 14, RICHIESTA_APRI_TESTO = 15;

    private final MainActivity att;
    private final WebView web;
    /** La richiesta che aspetta una finestra di Android (scelta del file, salvataggio). */
    private int inAttesa = -1;
    private File daSalvare;

    Ponte(MainActivity att, WebView web) {
        this.att = att;
        this.web = web;
    }

    // ------------------------------------------------------------------ dalla pagina

    @JavascriptInterface
    public String info() {
        return Dispositivo.info(att).toString();
    }

    @JavascriptInterface
    public void invia(final String json) {
        att.runOnUiThread(new Runnable() {
            @Override public void run() { esegui(json); }
        });
    }

    private void esegui(String json) {
        int id = -1;
        try {
            JSONObject m = new JSONObject(json);
            id = m.optInt("id", -1);
            String cmd = m.optString("cmd");
            switch (cmd) {
                case "importa":
                    importa(id, "cartella".equals(m.optString("tipo")));
                    return;
                case "condividiFile":
                    condividiFile(id, m.optString("file"), m.optString("mime"), m.optString("nome"));
                    return;
                case "condividiTesto":
                    condividiTesto(m.optString("testo"), m.optString("titolo"));
                    break;
                case "vibra":
                    vibra(m.optInt("ms", 12));
                    break;
                case "schermoAcceso":
                    schermoAcceso(m.optBoolean("si"));
                    break;
                case "salvaFile":
                    salvaFile(id, m.optString("nome"), m.optString("mime"), m.optString("testo"));
                    return;
                case "apriFile":
                    apriFile(id);
                    return;
                case "scriviFile":
                    scriviFile(id, m.optString("uri"), m.optString("testo"));
                    return;
                case "leggiFile":
                    leggiFile(id, m.optString("uri"));
                    return;
                case "scaricaApk":
                    scaricaApk(id, m.optString("url"), m.optString("nome"), m.optLong("byte", 0));
                    return;
                case "installaApk":
                    installaApk(id, m.optString("file"));
                    return;
                case "apriEsterno":
                    att.apriFuori(m.optString("url"));
                    break;
                default:
                    Log.w(Motore.TAG, "Comando sconosciuto: " + cmd);
            }
            rispondi(id, Boolean.TRUE);
        } catch (Exception e) {
            Log.e(Motore.TAG, "Ponte", e);
            rispondi(id, null);
        }
    }

    // ------------------------------------------------------------------ verso la pagina

    void rispondi(int id, Object dati) {
        if (id < 0) return;
        String valore = dati == null ? "null" : dati instanceof JSONObject ? dati.toString() : JSONObject.wrap(dati).toString();
        js("window.LIBRE_NATIVO&&LIBRE_NATIVO._risposta(" + id + "," + valore + ")");
    }

    void inviaInfo() {
        js("window.LIBRE_NATIVO&&LIBRE_NATIVO._info(" + Dispositivo.info(att) + ")");
    }

    private void js(final String codice) {
        att.runOnUiThread(new Runnable() {
            @Override public void run() { web.evaluateJavascript(codice, null); }
        });
    }

    // ------------------------------------------------------------------ importare una campagna

    private void importa(int id, boolean cartella) {
        if (inAttesa >= 0) rispondi(inAttesa, null);   // una richiesta vecchia rimasta appesa
        inAttesa = id;
        Intent i;
        if (cartella) {
            i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        } else {
            i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
                    .putExtra(Intent.EXTRA_MIME_TYPES, new String[]{ "application/zip", "application/x-zip-compressed", "application/x-zip", "application/octet-stream" });
        }
        try {
            att.startActivityForResult(i, cartella ? RICHIESTA_CARTELLA : RICHIESTA_ZIP);
        } catch (ActivityNotFoundException e) {
            inAttesa = -1;
            rispondi(id, errore("Su questo dispositivo non c'è un'app per scegliere i file."));
        }
    }

    /** Arriva da MainActivity.onActivityResult. Ritorna true se la richiesta era nostra. */
    boolean risultato(int richiesta, int esito, Intent dati) {
        if (richiesta == RICHIESTA_SALVA_TESTO || richiesta == RICHIESTA_APRI_TESTO) { risultatoTesto(richiesta, esito, dati); return true; }
        if (richiesta != RICHIESTA_ZIP && richiesta != RICHIESTA_CARTELLA && richiesta != RICHIESTA_SALVA) return false;
        final int id = inAttesa;
        inAttesa = -1;
        final Uri u = esito == MainActivity.RESULT_OK && dati != null ? dati.getData() : null;
        if (richiesta == RICHIESTA_SALVA) {
            final File f = daSalvare;
            daSalvare = null;
            if (u != null && f != null) salvaIn(f, u);
            return true;
        }
        if (u == null) { rispondi(id, null); return true; }
        final boolean cartella = richiesta == RICHIESTA_CARTELLA;
        Toast.makeText(att, R.string.importo, Toast.LENGTH_SHORT).show();
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    File arrivi = new File(new File(Motore.utente, "importa"), Long.toString(System.nanoTime(), 36));
                    arrivi.mkdirs();
                    String nome;
                    File dest;
                    if (cartella) {
                        Uri radice = DocumentsContract.buildDocumentUriUsingTree(u, DocumentsContract.getTreeDocumentId(u));
                        nome = pulisci(nomeDi(radice), "Campagna");
                        dest = new File(arrivi, nome);
                        copiaAlbero(u, DocumentsContract.getTreeDocumentId(u), dest, 0);
                    } else {
                        nome = pulisci(nomeDi(u), "Campagna.zip");
                        if (!nome.toLowerCase(Locale.ROOT).endsWith(".zip")) nome += ".zip";
                        dest = new File(arrivi, nome);
                        try (InputStream in = att.getContentResolver().openInputStream(u); OutputStream out = new FileOutputStream(dest)) {
                            if (in == null) throw new IOException("non si apre");
                            Motore.copia(in, out);
                        }
                    }
                    JSONObject r = new JSONObject();
                    r.put("sorgente", dest.getAbsolutePath());
                    r.put("nome", nome);
                    rispondi(id, r);
                } catch (Exception e) {
                    Log.e(Motore.TAG, "Importazione", e);
                    rispondi(id, errore("Non riesco a leggere quello che hai scelto: " + e.getMessage()));
                }
            }
        }, "importa").start();
        return true;
    }

    private String nomeDi(Uri u) {
        try (Cursor c = att.getContentResolver().query(u, new String[]{ OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignorata) {
            // sotto
        }
        return u.getLastPathSegment();
    }

    /** Copia una cartella scelta con il selettore di Android (non sono file veri: si passa dai «documenti»). */
    private void copiaAlbero(Uri albero, String docId, File dest, int profondita) throws IOException {
        if (profondita > 24) return;
        dest.mkdirs();
        ContentResolver cr = att.getContentResolver();
        Uri figli = DocumentsContract.buildChildDocumentsUriUsingTree(albero, docId);
        String[] col = { DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_MIME_TYPE };
        try (Cursor c = cr.query(figli, col, null, null, null)) {
            if (c == null) return;
            while (c.moveToNext()) {
                String id = c.getString(0);
                String nome = pulisci(c.getString(1), null);
                if (nome == null) continue;
                File f = new File(dest, nome);
                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(c.getString(2))) {
                    copiaAlbero(albero, id, f, profondita + 1);
                } else {
                    try (InputStream in = cr.openInputStream(DocumentsContract.buildDocumentUriUsingTree(albero, id));
                         OutputStream out = new FileOutputStream(f)) {
                        if (in != null) Motore.copia(in, out);
                    }
                }
            }
        }
    }

    /** Un nome di file senza sorprese (niente «/», niente «..»). */
    private static String pulisci(String nome, String predefinito) {
        if (nome == null) return predefinito;
        nome = nome.replaceAll("[/\\\\:*?\"<>|\\x00-\\x1f]", "_").trim();
        if (nome.isEmpty() || nome.equals(".") || nome.equals("..")) return predefinito;
        return nome;
    }

    private static JSONObject errore(String testo) {
        JSONObject o = new JSONObject();
        try { o.put("errore", testo); } catch (JSONException ignorata) { /* no */ }
        return o;
    }

    // ------------------------------------------------------------------ condividere e salvare

    private void condividiFile(final int id, String percorso, String mime, String nome) {
        final File f = new File(percorso);
        if (!f.isFile()) { rispondi(id, errore("Il file non c'è.")); return; }
        final String tipo = mime == null || mime.isEmpty() ? Condivisi.tipo(f.getName()) : mime;
        final String titolo = nome == null || nome.isEmpty() ? f.getName() : nome;
        new AlertDialog.Builder(att)
                .setTitle(titolo)
                .setItems(new CharSequence[]{ att.getString(R.string.condividi), att.getString(R.string.salva_in) }, new android.content.DialogInterface.OnClickListener() {
                  @Override public void onClick(android.content.DialogInterface d, int scelta) {
                    if (scelta == 0) {
                        Uri u = Condivisi.indirizzo(f);
                        Intent i = new Intent(Intent.ACTION_SEND).setType(tipo).putExtra(Intent.EXTRA_STREAM, u)
                                .putExtra(Intent.EXTRA_SUBJECT, titolo).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        i.setClipData(ClipData.newRawUri(titolo, u));
                        avvia(Intent.createChooser(i, titolo));
                    } else {
                        if (inAttesa >= 0) rispondi(inAttesa, null);
                        inAttesa = -1;
                        daSalvare = f;
                        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                                .setType(tipo).putExtra(Intent.EXTRA_TITLE, titolo);
                        try {
                            att.startActivityForResult(i, RICHIESTA_SALVA);
                        } catch (ActivityNotFoundException e) {
                            daSalvare = null;
                            Toast.makeText(att, R.string.nessuna_app, Toast.LENGTH_LONG).show();
                        }
                    }
                  }
                })
                .setNegativeButton(android.R.string.cancel, null)
                .show();
        rispondi(id, Boolean.TRUE);
    }

    private void salvaIn(final File f, final Uri u) {
        new Thread(new Runnable() {
            @Override public void run() {
                boolean ok;
                try (InputStream in = new FileInputStream(f); OutputStream out = att.getContentResolver().openOutputStream(u, "w")) {
                    if (out == null) throw new IOException("non si apre");
                    Motore.copia(in, out);
                    ok = true;
                } catch (Exception e) {
                    Log.e(Motore.TAG, "Salvataggio", e);
                    ok = false;
                }
                final boolean fatto = ok;
                att.runOnUiThread(new Runnable() {
                    @Override public void run() {
                        Toast.makeText(att, fatto ? R.string.salvato : R.string.non_salvato, Toast.LENGTH_SHORT).show();
                    }
                });
            }
        }, "salva").start();
    }

    private void condividiTesto(String testo, String titolo) {
        Intent i = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, testo);
        if (titolo != null && !titolo.isEmpty()) i.putExtra(Intent.EXTRA_SUBJECT, titolo);
        avvia(Intent.createChooser(i, titolo == null || titolo.isEmpty() ? null : titolo));
    }

    private void avvia(Intent i) {
        try {
            att.startActivity(i);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(att, R.string.nessuna_app, Toast.LENGTH_LONG).show();
        }
    }

    // ------------------------------------------------------------------ file di testo scelti dall'utente
    // Le schede si salvano in un file (dove vuole l'utente) e si possono tenere sincronizzate:
    // Android dà un permesso «persistente» su quel file, così lo si può riscrivere anche dopo.

    private int testoInAttesa = -1;
    private String testoDaSalvare;

    private void salvaFile(int id, String nome, String mime, String testo) {
        if (testoInAttesa >= 0) rispondi(testoInAttesa, null);
        testoInAttesa = id;
        testoDaSalvare = testo;
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                .setType(mime == null || mime.isEmpty() ? "application/json" : mime)
                .putExtra(Intent.EXTRA_TITLE, nome == null || nome.isEmpty() ? "scheda.json" : nome);
        try {
            att.startActivityForResult(i, RICHIESTA_SALVA_TESTO);
        } catch (ActivityNotFoundException e) {
            testoInAttesa = -1;
            rispondi(id, errore("Su questo dispositivo non c'è un'app per scegliere dove salvare."));
        }
    }

    private void apriFile(int id) {
        if (testoInAttesa >= 0) rispondi(testoInAttesa, null);
        testoInAttesa = id;
        testoDaSalvare = null;
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
                .putExtra(Intent.EXTRA_MIME_TYPES, new String[]{ "application/json", "text/plain", "application/octet-stream" })
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        try {
            att.startActivityForResult(i, RICHIESTA_APRI_TESTO);
        } catch (ActivityNotFoundException e) {
            testoInAttesa = -1;
            rispondi(id, errore("Su questo dispositivo non c'è un'app per scegliere i file."));
        }
    }

    /** Si tiene il permesso sul file anche dopo aver chiuso l'app (per la sincronizzazione). */
    private boolean tieniPermesso(Uri u, Intent dati) {
        int f = dati.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        try {
            att.getContentResolver().takePersistableUriPermission(u, f | Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            return true;
        } catch (Exception e) {
            try { att.getContentResolver().takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (Exception ignorata) { /* solo questa volta */ }
            return (f & Intent.FLAG_GRANT_WRITE_URI_PERMISSION) != 0;
        }
    }

    private void risultatoTesto(final int richiesta, int esito, final Intent dati) {
        final int id = testoInAttesa;
        final String testo = testoDaSalvare;
        testoInAttesa = -1;
        testoDaSalvare = null;
        final Uri u = esito == MainActivity.RESULT_OK && dati != null ? dati.getData() : null;
        if (u == null) { rispondi(id, null); return; }
        final boolean scrivibile = tieniPermesso(u, dati);
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    JSONObject r = new JSONObject();
                    r.put("uri", u.toString());
                    r.put("nome", nomeDi(u));
                    r.put("scrivibile", scrivibile || richiesta == RICHIESTA_SALVA_TESTO);
                    if (richiesta == RICHIESTA_SALVA_TESTO) scrivi(u, testo);
                    else r.put("testo", leggi(u));
                    rispondi(id, r);
                } catch (Exception e) {
                    Log.e(Motore.TAG, "File", e);
                    rispondi(id, errore("Non riesco a usare quel file: " + e.getMessage()));
                }
            }
        }, "file").start();
    }

    private void scriviFile(final int id, final String uri, final String testo) {
        new Thread(new Runnable() {
            @Override public void run() {
                try { scrivi(Uri.parse(uri), testo); rispondi(id, Boolean.TRUE); }
                catch (Exception e) { rispondi(id, errore("Non riesco a scrivere il file: " + e.getMessage())); }
            }
        }, "scrivi").start();
    }

    private void leggiFile(final int id, final String uri) {
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    JSONObject r = new JSONObject();
                    r.put("testo", leggi(Uri.parse(uri)));
                    rispondi(id, r);
                } catch (Exception e) { rispondi(id, errore("Non riesco a leggere il file: " + e.getMessage())); }
            }
        }, "leggi").start();
    }

    private void scrivi(Uri u, String testo) throws IOException {
        try (OutputStream out = att.getContentResolver().openOutputStream(u, "wt")) {
            if (out == null) throw new IOException("non si apre");
            out.write((testo == null ? "" : testo).getBytes("UTF-8"));
        }
    }

    private String leggi(Uri u) throws IOException {
        try (InputStream in = att.getContentResolver().openInputStream(u)) {
            if (in == null) throw new IOException("non si apre");
            java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[64 * 1024];
            int n, tot = 0;
            while ((n = in.read(buf)) > 0) {
                tot += n;
                if (tot > 30 * 1024 * 1024) throw new IOException("il file è troppo grande");
                b.write(buf, 0, n);
            }
            return b.toString("UTF-8");
        }
    }

    // ------------------------------------------------------------------ aggiornare l'app

    /** L'APK scaricato dall'avviatore, in attesa che l'utente permetta a LIBRE VTT di installare app. */
    private File apkInAttesa;

    private void installaApk(int id, String percorso) {
        File f = new File(percorso);
        File cartella = new File(Motore.utente, "aggiornamenti");
        try {
            if (!f.isFile() || !f.getCanonicalPath().startsWith(cartella.getCanonicalPath() + File.separator) || !f.getName().endsWith(".apk")) {
                rispondi(id, errore("Il file dell'aggiornamento non c'è più: riprova."));
                return;
            }
        } catch (IOException e) {
            rispondi(id, errore("Il file dell'aggiornamento non si legge: riprova."));
            return;
        }
        // Android 8+: serve il permesso «installa app sconosciute» per LIBRE VTT (si dà una volta sola)
        if (Build.VERSION.SDK_INT >= 26 && !att.getPackageManager().canRequestPackageInstalls()) {
            apkInAttesa = f;
            try {
                att.startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + att.getPackageName())));
            } catch (ActivityNotFoundException e) {
                apkInAttesa = null;
                rispondi(id, errore("Apri Impostazioni → App → LIBRE VTT → Installa app sconosciute, attivalo e riprova."));
                return;
            }
            JSONObject r = new JSONObject();
            try { r.put("permesso", true); } catch (JSONException ignorata) { /* no */ }
            rispondi(id, r);
            return;
        }
        apriInstallazione(f);
        rispondi(id, Boolean.TRUE);
    }

    /**
     * Scarica l'APK nuovo con la rete di Android (gli stessi certificati del browser: il Node dentro
     * l'app non sempre riesce a parlare con GitHub) e poi apre l'installazione.
     */
    private void scaricaApk(final int id, final String indirizzo, String nome, final long attesi) {
        final String pulito = nome == null ? "" : nome.replaceAll("[^A-Za-z0-9._-]", "_");
        if (!indirizzo.startsWith("https://") || !pulito.endsWith(".apk")) { rispondi(id, errore("Indirizzo dell'aggiornamento non valido.")); return; }
        new Thread(new Runnable() {
            @Override public void run() {
                File cartella = new File(Motore.utente, "aggiornamenti");
                cartella.mkdirs();
                File[] vecchi = cartella.listFiles();
                if (vecchi != null) for (File v : vecchi) //noinspection ResultOfMethodCallIgnored
                    v.delete();
                File dest = new File(cartella, pulito), parte = new File(cartella, pulito + ".part");
                java.net.HttpURLConnection c = null;
                try {
                    String url = indirizzo;
                    for (int salti = 0; ; salti++) {             // GitHub rimanda a un altro indirizzo: lo si segue
                        c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                        c.setInstanceFollowRedirects(false);
                        c.setConnectTimeout(20000);
                        c.setReadTimeout(60000);
                        c.setRequestProperty("User-Agent", "LIBRE-VTT");
                        int code = c.getResponseCode();
                        if (code >= 300 && code < 400 && salti < 6) {
                            String dove = c.getHeaderField("Location");
                            c.disconnect();
                            if (dove == null) throw new IOException("rimando senza indirizzo");
                            url = new java.net.URL(new java.net.URL(url), dove).toString();
                            if (!url.startsWith("https://")) throw new IOException("rimando non sicuro");
                            continue;
                        }
                        if (code != 200) throw new IOException("HTTP " + code);
                        break;
                    }
                    long tot = c.getContentLengthLong(), got = 0, ultimo = 0;
                    if (tot <= 0) tot = attesi;
                    try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(parte)) {
                        byte[] buf = new byte[64 * 1024];
                        int n;
                        while ((n = in.read(buf)) > 0) {
                            out.write(buf, 0, n);
                            got += n;
                            long ora = System.currentTimeMillis();
                            if (tot > 0 && ora - ultimo > 700) {
                                ultimo = ora;
                                js("window.LIBRE_AGG_PROGRESSO&&LIBRE_AGG_PROGRESSO(" + (got * 100 / tot) + ")");
                            }
                        }
                    }
                    if (attesi > 0 && parte.length() != attesi) throw new IOException("il file scaricato è incompleto");
                    if (!parte.renameTo(dest)) throw new IOException("non riesco a salvare il file");
                    att.runOnUiThread(new Runnable() {
                        @Override public void run() { installaApk(id, dest.getAbsolutePath()); }
                    });
                } catch (Exception e) {
                    Log.e(Motore.TAG, "Aggiornamento", e);
                    //noinspection ResultOfMethodCallIgnored
                    parte.delete();
                    rispondi(id, errore("Scaricamento non riuscito (" + e.getMessage() + "): riprova."));
                } finally {
                    if (c != null) c.disconnect();
                }
            }
        }, "aggiornamento").start();
    }

    /** Dopo aver dato il permesso si torna nell'app: l'installazione riparte da sola. */
    void riprovaInstallazione() {
        if (apkInAttesa == null) return;
        if (Build.VERSION.SDK_INT >= 26 && !att.getPackageManager().canRequestPackageInstalls()) return;
        File f = apkInAttesa;
        apkInAttesa = null;
        if (f.isFile()) apriInstallazione(f);
    }

    private void apriInstallazione(File f) {
        Uri u = Condivisi.indirizzo(f);
        Intent i = new Intent(Intent.ACTION_VIEW).setDataAndType(u, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        i.setClipData(ClipData.newRawUri(f.getName(), u));
        avvia(i);
    }

    // ------------------------------------------------------------------ vibrazione e schermo

    @SuppressWarnings("deprecation")
    private void vibra(int ms) {
        ms = Math.max(1, Math.min(ms, 400));
        if (ms <= 30) {   // un tocco leggero: quello del sistema (rispetta le impostazioni dell'utente)
            web.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
            return;
        }
        Vibrator v = (Vibrator) att.getSystemService(MainActivity.VIBRATOR_SERVICE);
        if (v == null || !v.hasVibrator()) return;
        if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
        else v.vibrate(ms);
    }

    /** In partita: lo schermo non si spegne e l'app resta viva se si passa ad altro. */
    private void schermoAcceso(boolean si) {
        if (si) att.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else att.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (si) att.chiediNotifiche();
        Servizio.accendi(att, si);
    }
}
