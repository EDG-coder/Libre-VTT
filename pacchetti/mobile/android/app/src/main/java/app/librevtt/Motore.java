package app.librevtt;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.res.AssetManager;
import android.system.Os;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.SecureRandom;

/**
 * Accende, una volta sola per processo, i due motori dell'app:
 *   - il collegamento a distanza (libreria Rust), che apre la sua porta di controllo;
 *   - Node.js, che esegue lo stesso avviatore del computer (launcher.js) in modalità «android».
 * Quando l'avviatore è pronto scrive il suo indirizzo in un file: la finestra lo aspetta e lo apre.
 *
 * Le cartelle:
 *   files/nodejs-project   il programma (copiato dall'APK alla prima apertura e a ogni aggiornamento)
 *   files/utente           impostazioni, campagne recenti, file in arrivo e in uscita
 *   Android/data/app.librevtt/files/Campagne   le campagne (le si vede anche collegando il telefono al computer)
 */
final class Motore {
    private Motore() {}

    static final String TAG = "LIBRE VTT";
    private static boolean avviato;
    static String segreto;
    static File pronto, utente, campagne;
    static int portaCollegamento;

    static synchronized void avvia(Context ctx) {
        if (avviato) return;
        avviato = true;
        final Context app = ctx.getApplicationContext();
        final File dati = app.getFilesDir();
        final File progetto = new File(dati, "nodejs-project");
        utente = new File(dati, "utente");
        File esterna = app.getExternalFilesDir(null);
        campagne = new File(esterna != null ? esterna : dati, "Campagne");
        pronto = new File(app.getCacheDir(), "pronto.txt");
        utente.mkdirs();
        campagne.mkdirs();
        //noinspection ResultOfMethodCallIgnored
        pronto.delete();
        segreto = casuale();

        try {
            copiaProgettoSeServe(app, progetto);
        } catch (IOException e) {
            Log.e(TAG, "Non riesco a copiare il programma", e);
        }

        try {
            System.loadLibrary("uffa_link");
            portaCollegamento = Nativo.avviaCollegamento(app, segreto);
        } catch (Throwable t) {
            Log.e(TAG, "Il collegamento a distanza non parte", t);
        }

        try {
            Os.setenv("HOME", dati.getAbsolutePath(), true);
            Os.setenv("TMPDIR", app.getCacheDir().getAbsolutePath(), true);
            Os.setenv("MYVTT_MOBILE", "android", true);
            Os.setenv("MYVTT_USERDIR", utente.getAbsolutePath(), true);
            Os.setenv("MYVTT_CAMPAGNE", campagne.getAbsolutePath(), true);
            Os.setenv("MYVTT_LINK_CONTROLLO", String.valueOf(portaCollegamento), true);
            Os.setenv("MYVTT_SEGRETO", segreto, true);
            Os.setenv("MYVTT_PRONTO_FILE", pronto.getAbsolutePath(), true);
            Os.setenv("UI_PORT", "4100", true);
            Os.unsetenv("NODE_OPTIONS");
        } catch (Exception e) {
            Log.e(TAG, "Variabili d'ambiente", e);
        }

        System.loadLibrary("node");
        System.loadLibrary("avvio-node");
        final String script = new File(new File(progetto, "server"), "launcher.js").getAbsolutePath();
        Thread t = new Thread(null, new Runnable() {
            @Override public void run() {
                int esito = Nativo.avviaNode(new String[]{"node", script});
                Log.w(TAG, "Node si è fermato (" + esito + ")");
            }
        }, "node", 16L * 1024 * 1024);
        t.start();
    }

    /** Il programma sta dentro l'APK: Node vuole file veri, lo si copia (solo quando cambia). */
    private static void copiaProgettoSeServe(Context app, File dest) throws IOException {
        String firma;
        try {
            PackageInfo pi = app.getPackageManager().getPackageInfo(app.getPackageName(), 0);
            firma = pi.versionName + "/" + pi.lastUpdateTime;
        } catch (Exception e) {
            firma = String.valueOf(System.currentTimeMillis());
        }
        File stampa = new File(dest, ".versione");
        if (stampa.exists() && firma.equals(leggi(stampa))) return;
        cancella(dest);
        copiaAsset(app.getAssets(), "nodejs-project", dest);
        scrivi(stampa, firma);
    }

    private static void copiaAsset(AssetManager am, String da, File a) throws IOException {
        String[] figli = am.list(da);
        if (figli == null || figli.length == 0) {
            File su = a.getParentFile();
            if (su != null) su.mkdirs();
            try (InputStream in = am.open(da); OutputStream out = new FileOutputStream(a)) { copia(in, out); }
            return;
        }
        a.mkdirs();
        for (String f : figli) copiaAsset(am, da + "/" + f, new File(a, f));
    }

    static void copia(InputStream in, OutputStream out) throws IOException {
        byte[] buf = new byte[64 * 1024];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
    }

    static void cancella(File f) {
        File[] figli = f.listFiles();
        if (figli != null) for (File c : figli) cancella(c);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }

    static String leggi(File f) {
        try (InputStream in = new java.io.FileInputStream(f)) {
            java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
            copia(in, b);
            return b.toString("UTF-8").trim();
        } catch (IOException e) {
            return null;
        }
    }

    private static void scrivi(File f, String s) throws IOException {
        try (OutputStream out = new FileOutputStream(f)) { out.write(s.getBytes("UTF-8")); }
    }

    private static String casuale() {
        byte[] b = new byte[24];
        new SecureRandom().nextBytes(b);
        StringBuilder s = new StringBuilder();
        for (byte x : b) s.append(String.format("%02x", x & 0xff));
        return s.toString();
    }
}
