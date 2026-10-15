package app.librevtt;

import android.content.Context;

/** Le due librerie native dell'app. */
final class Nativo {
    private Nativo() {}

    /**
     * Il collegamento a distanza (uffa-link, Rust): accende la porta di controllo su 127.0.0.1
     * e ne restituisce il numero (0 se non è partito). Vedi uffa-link/src/lib.rs.
     */
    static native int avviaCollegamento(Context contesto, String segreto);

    /** Node.js (nodejs-mobile): non ritorna finché Node gira. Va chiamato in un thread suo. */
    static native int avviaNode(String[] argomenti);
}
