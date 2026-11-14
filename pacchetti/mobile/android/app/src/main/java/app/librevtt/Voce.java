package app.librevtt;

import android.content.Context;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.util.Log;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * La voce del lettore dello schermo e della chat (web/js/base/voce.js). La WebView di Android non ha la
 * sintesi vocale del browser (speechSynthesis): parla il motore di sintesi del telefono (TextToSpeech).
 * Si accende alla prima frase; quello che arriva prima che sia pronto aspetta in coda.
 */
final class Voce {
    private final Context ctx;
    private TextToSpeech tts;
    private boolean pronta = false, rotta = false;
    private final List<String[]> attesa = new ArrayList<>();
    private int n = 0;

    Voce(Context ctx) { this.ctx = ctx.getApplicationContext(); }

    /** lingua: «it-IT», «en-US»…; vel e tono: 1 = normale; vol da 0 a 1; coda = dopo quello che sta dicendo. */
    void parla(String testo, String lingua, float vel, float tono, float vol, boolean coda) {
        if (testo == null || testo.trim().isEmpty() || rotta) return;
        if (!coda) attesa.clear();
        if (!pronta) {
            attesa.add(new String[] { testo, lingua, Float.toString(vel), Float.toString(tono), Float.toString(vol) });
            if (tts == null) avvia();
            return;
        }
        dici(testo, lingua, vel, tono, vol, coda);
    }

    void zitto() {
        attesa.clear();
        if (tts != null && pronta) tts.stop();
    }

    void chiudi() {
        attesa.clear();
        if (tts != null) { try { tts.stop(); tts.shutdown(); } catch (Exception ignorata) { } }
        tts = null; pronta = false;
    }

    private void avvia() {
        try {
            tts = new TextToSpeech(ctx, stato -> {
                if (stato != TextToSpeech.SUCCESS) { rotta = true; attesa.clear(); Log.w(Motore.TAG, "Sintesi vocale non disponibile"); return; }
                pronta = true;
                boolean primo = true;
                for (String[] a : new ArrayList<>(attesa)) {
                    dici(a[0], a[1], Float.parseFloat(a[2]), Float.parseFloat(a[3]), Float.parseFloat(a[4]), !primo);
                    primo = false;
                }
                attesa.clear();
            });
        } catch (Exception e) {
            rotta = true;
            Log.w(Motore.TAG, "Sintesi vocale", e);
        }
    }

    private void dici(String testo, String lingua, float vel, float tono, float vol, boolean coda) {
        if (tts == null) return;
        try {
            if (lingua != null && !lingua.isEmpty()) {
                Locale l = Locale.forLanguageTag(lingua);
                if (tts.isLanguageAvailable(l) >= TextToSpeech.LANG_AVAILABLE) tts.setLanguage(l);
            }
            tts.setSpeechRate(Math.max(0.3f, Math.min(3f, vel)));
            tts.setPitch(Math.max(0.3f, Math.min(3f, tono)));
            Bundle b = new Bundle();
            b.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, Math.max(0f, Math.min(1f, vol)));
            // un testo lungo si spezza: il motore ha un limite per ogni frase
            int max = Math.max(200, TextToSpeech.getMaxSpeechInputLength() - 10);
            for (int da = 0; da < testo.length(); da += max) {
                String pezzo = testo.substring(da, Math.min(testo.length(), da + max));
                tts.speak(pezzo, coda || da > 0 ? TextToSpeech.QUEUE_ADD : TextToSpeech.QUEUE_FLUSH, b, "libre-" + (n++));
            }
        } catch (Exception e) {
            Log.w(Motore.TAG, "Sintesi vocale", e);
        }
    }
}
