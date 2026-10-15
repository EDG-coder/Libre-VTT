package app.librevtt;

import android.app.Activity;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.os.Build;
import android.view.InputDevice;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Com'è fatto il dispositivo in questo momento: serve alla pagina per scegliere tra i comandi
 * per le dita e quelli per mouse e tastiera, e tra la disposizione da telefono e quella da tablet.
 *
 *   dex       Samsung DeX acceso (sul monitor o sul tablet)
 *   desktop   si usa come un computer: DeX, Chromebook, modalità «scrivania» di Android
 *   mouse     c'è un mouse (o un touchpad che muove un puntatore) collegato
 *   tastiera  c'è una tastiera vera collegata
 *   tablet    lo schermo è grande (il lato corto supera i 600 dp)
 */
final class Dispositivo {
    private Dispositivo() {}

    static JSONObject info(Activity a) {
        Configuration c = a.getResources().getConfiguration();
        boolean dex = dex(c);
        boolean scrivania = (c.uiMode & Configuration.UI_MODE_TYPE_MASK) == Configuration.UI_MODE_TYPE_DESK;
        boolean chromebook = chromebook(a);
        boolean tablet = c.smallestScreenWidthDp >= 600;
        boolean tastiera = c.keyboard == Configuration.KEYBOARD_QWERTY
                && c.hardKeyboardHidden == Configuration.HARDKEYBOARDHIDDEN_NO;
        boolean mouse = mouse();
        boolean finestra = Build.VERSION.SDK_INT >= 24 && a.isInMultiWindowMode();

        JSONObject o = new JSONObject();
        try {
            o.put("piattaforma", "android");
            o.put("dex", dex);
            o.put("desktop", dex || chromebook || scrivania);
            o.put("chromebook", chromebook);
            o.put("tablet", tablet);
            o.put("telefono", !tablet);
            o.put("mouse", mouse);
            o.put("tastiera", tastiera);
            o.put("finestra", finestra);
            o.put("android", Build.VERSION.SDK_INT);
            o.put("versione", versione(a));
        } catch (JSONException ignorata) {
            // put() con valori semplici non fallisce
        }
        return o;
    }

    /**
     * Samsung DeX: Samsung aggiunge alla Configuration due campi suoi. Si leggono "di nascosto"
     * (riflessione), così l'app funziona uguale sui telefoni che non sono Samsung.
     */
    static boolean dex(Configuration c) {
        try {
            Class<?> k = c.getClass();
            int acceso = k.getField("SEM_DESKTOP_MODE_ENABLED").getInt(k);
            int stato = k.getField("semDesktopModeEnabled").getInt(c);
            return acceso == stato;
        } catch (Throwable t) {
            return false;
        }
    }

    private static boolean chromebook(Activity a) {
        PackageManager pm = a.getPackageManager();
        return pm.hasSystemFeature("org.chromium.arc") || pm.hasSystemFeature("org.chromium.arc.device_management");
    }

    /** Un mouse vero: lo schermo touch non conta (non ha il bit «mouse»). */
    static boolean mouse() {
        int[] ids = InputDevice.getDeviceIds();
        if (ids == null) return false;
        for (int id : ids) {
            InputDevice d = InputDevice.getDevice(id);
            if (d == null || d.isVirtual()) continue;
            int s = d.getSources();
            if ((s & InputDevice.SOURCE_MOUSE) == InputDevice.SOURCE_MOUSE) return true;
            if (Build.VERSION.SDK_INT >= 26 && (s & InputDevice.SOURCE_MOUSE_RELATIVE) == InputDevice.SOURCE_MOUSE_RELATIVE) return true;
        }
        return false;
    }

    private static String versione(Activity a) {
        try {
            return a.getPackageManager().getPackageInfo(a.getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "";
        }
    }
}
