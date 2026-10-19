package app.librevtt;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.util.Locale;

/**
 * Fa vedere alle altre app (WhatsApp, Drive, la posta…) un file dell'app che l'utente ha deciso
 * di condividere, per esempio una campagna esportata. Solo in lettura, solo i file dell'app,
 * e solo all'app a cui si passa il file (permesso temporaneo).
 *
 * Indirizzo: content://app.librevtt.condivisi/f/<percorso del file>
 */
public final class Condivisi extends ContentProvider {
    static final String AUTORITA = "app.librevtt.condivisi";

    static Uri indirizzo(File f) {
        return new Uri.Builder().scheme("content").authority(AUTORITA)
                .appendPath("f").appendPath(f.getAbsolutePath()).build();
    }

    @Override public boolean onCreate() { return true; }

    /** Il file indicato, ma solo se sta davvero in una cartella dell'app (niente «../»). */
    private File file(Uri u) throws FileNotFoundException {
        if (u.getPathSegments().size() != 2 || !"f".equals(u.getPathSegments().get(0))) throw new FileNotFoundException(u.toString());
        Context c = getContext();
        if (c == null) throw new FileNotFoundException(u.toString());
        try {
            File f = new File(u.getPathSegments().get(1)).getCanonicalFile();
            File[] permesse = { c.getFilesDir(), c.getCacheDir(), c.getExternalFilesDir(null), c.getExternalCacheDir() };
            for (File p : permesse) {
                if (p == null) continue;
                String base = p.getCanonicalPath() + File.separator;
                if (f.getPath().startsWith(base) && f.isFile()) return f;
            }
        } catch (IOException ignorata) {
            // sotto
        }
        throw new FileNotFoundException(u.toString());
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String modo) throws FileNotFoundException {
        if (modo != null && !"r".equals(modo)) throw new SecurityException("Solo in lettura");
        return ParcelFileDescriptor.open(file(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Cursor query(Uri uri, String[] colonne, String sel, String[] args, String ordine) {
        File f;
        try { f = file(uri); } catch (FileNotFoundException e) { return null; }
        if (colonne == null) colonne = new String[]{ OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE };
        MatrixCursor m = new MatrixCursor(colonne, 1);
        Object[] riga = new Object[colonne.length];
        for (int i = 0; i < colonne.length; i++) {
            if (OpenableColumns.DISPLAY_NAME.equals(colonne[i])) riga[i] = f.getName();
            else if (OpenableColumns.SIZE.equals(colonne[i])) riga[i] = f.length();
        }
        m.addRow(riga);
        return m;
    }

    @Override
    public String getType(Uri uri) {
        return tipo(uri.getLastPathSegment());
    }

    static String tipo(String nome) {
        if (nome == null) return "application/octet-stream";
        int punto = nome.lastIndexOf('.');
        String est = punto < 0 ? "" : nome.substring(punto + 1).toLowerCase(Locale.ROOT);
        if ("zip".equals(est)) return "application/zip";
        if ("apk".equals(est)) return "application/vnd.android.package-archive";
        String t = MimeTypeMap.getSingleton().getMimeTypeFromExtension(est);
        return t != null ? t : "application/octet-stream";
    }

    @Override public Uri insert(Uri uri, ContentValues v) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String s, String[] a) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues v, String s, String[] a) { throw new UnsupportedOperationException(); }
}
