package app.librevtt;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Dialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.hardware.input.InputManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.webkit.ConsoleMessage;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.io.File;

/**
 * L'unica finestra dell'app: una pagina web (la stessa del computer) che parla con il Node
 * che gira dentro l'app. Qui si aspetta che Node sia pronto, si gestiscono il tasto «indietro»,
 * i file da scegliere, le finestre che la pagina apre e i cambi di DeX, mouse e tastiera.
 */
public final class MainActivity extends Activity {
    private static final int RICHIESTA_FILE = 21;
    private static final long ATTESA_MASSIMA = 90_000;

    private final Handler h = new Handler(Looper.getMainLooper());
    private FrameLayout radice;
    private WebView web;
    private View caricamento;
    private TextView scritta;
    private Ponte ponte;
    private ValueCallback<Uri[]> fileScelti;
    private long inizio;
    private boolean caricata;
    private InputManager input;
    private Object indietro;   // OnBackInvokedCallback (Android 13+)

    private final InputManager.InputDeviceListener dispositivi = new InputManager.InputDeviceListener() {
        @Override public void onInputDeviceAdded(int id) { avvisaPagina(); }
        @Override public void onInputDeviceRemoved(int id) { avvisaPagina(); }
        @Override public void onInputDeviceChanged(int id) { avvisaPagina(); }
    };

    @Override
    protected void onCreate(Bundle stato) {
        super.onCreate(stato);
        Motore.avvia(this);
        aTuttoSchermo();
        costruisci();
        iconeBarre();
        inizio = System.currentTimeMillis();
        aspettaNode();
        input = (InputManager) getSystemService(INPUT_SERVICE);
        registraIndietro();
    }

    // ------------------------------------------------------------------ la finestra

    /** Si disegna anche sotto le barre di sistema, e i margini giusti li mettiamo noi. */
    @SuppressWarnings("deprecation")
    private void aTuttoSchermo() {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
        if (Build.VERSION.SDK_INT < 35) {
            w.setStatusBarColor(Color.TRANSPARENT);
            w.setNavigationBarColor(Color.TRANSPARENT);
        }
        if (Build.VERSION.SDK_INT >= 28) {
            w.getAttributes().layoutInDisplayCutoutMode = Build.VERSION.SDK_INT >= 30
                    ? android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
                    : android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void costruisci() {
        radice = new FrameLayout(this);
        radice.setBackgroundColor(colore(R.color.sfondo));

        web = new WebView(this);
        web.setBackgroundColor(colore(R.color.sfondo));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);   // la musica parte quando la fa partire il master
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);   // la dimensione del testo di sistema romperebbe la disposizione della mappa
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " LibreVTT-Android");
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) WebView.setWebContentsDebuggingEnabled(true);

        ponte = new Ponte(this, web);
        web.addJavascriptInterface(ponte, "LibreAndroid");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        radice.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // la schermata di attesa mentre Node si accende
        LinearLayout attesa = new LinearLayout(this);
        attesa.setOrientation(LinearLayout.VERTICAL);
        attesa.setGravity(Gravity.CENTER);
        attesa.setBackgroundColor(colore(R.color.sfondo));
        attesa.setClickable(true);
        TextView titolo = new TextView(this);
        titolo.setText(R.string.app_name);
        titolo.setTextColor(colore(R.color.testo));
        titolo.setTextSize(28);
        titolo.setLetterSpacing(0.12f);
        titolo.setGravity(Gravity.CENTER);
        attesa.addView(titolo);
        ProgressBar giro = new ProgressBar(this);
        giro.setIndeterminate(true);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(40), dp(40));
        lp.topMargin = dp(24);
        lp.bottomMargin = dp(16);
        attesa.addView(giro, lp);
        scritta = new TextView(this);
        scritta.setText(R.string.avvio);
        scritta.setTextColor(colore(R.color.testo_piano));
        scritta.setTextSize(14);
        scritta.setGravity(Gravity.CENTER);
        scritta.setPadding(dp(24), 0, dp(24), 0);
        attesa.addView(scritta);
        caricamento = attesa;
        radice.addView(attesa, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // barre di sistema, tacca della fotocamera e tastiera: la pagina sta nello spazio che resta
        radice.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override @SuppressWarnings("deprecation")
            public WindowInsets onApplyWindowInsets(View v, WindowInsets ins) {
                int l, t, r, b;
                if (Build.VERSION.SDK_INT >= 30) {
                    android.graphics.Insets i = ins.getInsets(WindowInsets.Type.systemBars()
                            | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                    l = i.left; t = i.top; r = i.right; b = i.bottom;
                } else {
                    l = ins.getSystemWindowInsetLeft(); t = ins.getSystemWindowInsetTop();
                    r = ins.getSystemWindowInsetRight(); b = ins.getSystemWindowInsetBottom();
                    if (Build.VERSION.SDK_INT >= 28 && ins.getDisplayCutout() != null) {
                        android.view.DisplayCutout c = ins.getDisplayCutout();
                        l = Math.max(l, c.getSafeInsetLeft()); t = Math.max(t, c.getSafeInsetTop());
                        r = Math.max(r, c.getSafeInsetRight()); b = Math.max(b, c.getSafeInsetBottom());
                    }
                }
                v.setPadding(l, t, r, b);
                return Build.VERSION.SDK_INT >= 30 ? WindowInsets.CONSUMED : ins.consumeSystemWindowInsets();
            }
        });
        setContentView(radice);
    }

    @SuppressWarnings("deprecation")
    private int colore(int id) {
        return Build.VERSION.SDK_INT >= 23 ? getColor(id) : getResources().getColor(id);
    }

    private boolean scuro() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    /** Icone della barra in alto scure sul tema chiaro, chiare sul tema scuro (come la pagina). */
    @SuppressWarnings("deprecation")
    private void iconeBarre() {
        boolean chiaro = !scuro();
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            android.view.WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                int m = android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                        | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(chiaro ? m : 0, m);
            }
        } else if (Build.VERSION.SDK_INT >= 23) {
            View d = w.getDecorView();
            int f = d.getSystemUiVisibility();
            f = chiaro ? f | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR : f & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= 26) {
                f = chiaro ? f | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : f & ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            }
            d.setSystemUiVisibility(f);
        }
        if (radice != null) {
            radice.setBackgroundColor(colore(R.color.sfondo));
            web.setBackgroundColor(colore(R.color.sfondo));
        }
    }

    private int dp(int x) {
        return Math.round(x * getResources().getDisplayMetrics().density);
    }

    // ------------------------------------------------------------------ aspettare Node

    private void aspettaNode() {
        File f = Motore.pronto;
        String url = f != null && f.isFile() ? Motore.leggi(f) : null;
        if (url != null && url.startsWith("http://127.0.0.1:")) {
            Log.i(Motore.TAG, "Apro " + url.replaceAll("k=[^&]*", "k=…"));
            web.loadUrl(url);
            return;
        }
        long passati = System.currentTimeMillis() - inizio;
        if (passati > ATTESA_MASSIMA) {
            scritta.setText(R.string.avvio_fallito);
            return;
        }
        if (passati > 15_000) scritta.setText(R.string.avvio_lento);
        h.postDelayed(new Runnable() {
            @Override public void run() { aspettaNode(); }
        }, 150);
    }

    private void nascondiCaricamento() {
        if (caricata) return;
        caricata = true;
        caricamento.animate().alpha(0f).setDuration(220).withEndAction(new Runnable() {
            @Override public void run() { caricamento.setVisibility(View.GONE); }
        }).start();
    }

    // ------------------------------------------------------------------ la pagina

    static boolean locale(Uri u) {
        String host = u.getHost();
        return ("http".equals(u.getScheme()) || "ws".equals(u.getScheme()))
                && ("127.0.0.1".equals(host) || "localhost".equals(host));
    }

    /** Un indirizzo che non è dell'app (un sito, una mail…) si apre con le altre app. */
    void apriFuori(String indirizzo) {
        try {
            Uri u = Uri.parse(indirizzo);
            String sch = u.getScheme();
            if (sch == null) return;
            if (!sch.equals("http") && !sch.equals("https") && !sch.equals("mailto") && !sch.equals("tel") && !sch.equals("intent")) return;
            Intent i = sch.equals("intent") ? Intent.parseUri(indirizzo, Intent.URI_INTENT_SCHEME) : new Intent(Intent.ACTION_VIEW, u);
            i.addCategory(Intent.CATEGORY_BROWSABLE);
            i.setComponent(null);
            i.setSelector(null);
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            Log.w(Motore.TAG, "Nessuna app per " + indirizzo);
        } catch (Exception e) {
            Log.w(Motore.TAG, "Indirizzo non valido: " + indirizzo);
        }
    }

    private final class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (locale(u) || "about".equals(u.getScheme()) || "data".equals(u.getScheme()) || "blob".equals(u.getScheme())) return false;
            apriFuori(u.toString());
            return true;
        }

        @Override
        public void onPageFinished(WebView v, String url) {
            if (url != null && url.startsWith("http://127.0.0.1")) {
                nascondiCaricamento();
                ponte.inviaInfo();
            }
        }

        @Override
        public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail d) {
            // la pagina si è chiusa da sola (memoria finita): si ricomincia, Node è ancora lì
            Log.w(Motore.TAG, "La pagina si è chiusa, la riapro");
            recreate();
            return true;
        }
    }

    private final class Chrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
            if (fileScelti != null) fileScelti.onReceiveValue(null);
            fileScelti = cb;
            Intent i;
            try {
                i = p.createIntent();
            } catch (Exception e) {
                i = new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
            }
            String[] tipi = p.getAcceptTypes();
            if (tipi != null && tipi.length > 1) {
                i.setType("*/*");
                i.putExtra(Intent.EXTRA_MIME_TYPES, tipi);
            }
            if (p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            try {
                startActivityForResult(i, RICHIESTA_FILE);
                return true;
            } catch (ActivityNotFoundException e) {
                fileScelti = null;
                return false;
            }
        }

        /** La pagina apre una finestra nuova (per esempio il pannello della sessione). */
        @Override @SuppressLint("SetJavaScriptEnabled")
        public boolean onCreateWindow(WebView v, boolean dialogo, boolean gesto, Message risposta) {
            final Dialog d = new Dialog(MainActivity.this, android.R.style.Theme_Material_NoActionBar_Fullscreen);
            final WebView figlia = new WebView(MainActivity.this);
            figlia.getSettings().setJavaScriptEnabled(true);
            figlia.getSettings().setDomStorageEnabled(true);
            figlia.getSettings().setTextZoom(100);
            figlia.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView w, WebResourceRequest req) {
                    if (locale(req.getUrl())) return false;
                    apriFuori(req.getUrl().toString());
                    if (w.getUrl() == null || w.getUrl().isEmpty() || "about:blank".equals(w.getUrl())) d.dismiss();
                    return true;
                }
            });
            figlia.setWebChromeClient(new WebChromeClient() {
                @Override public void onCloseWindow(WebView w) { d.dismiss(); }
            });
            d.setContentView(figlia);
            d.setOnDismissListener(new android.content.DialogInterface.OnDismissListener() {
                @Override public void onDismiss(android.content.DialogInterface x) { figlia.destroy(); }
            });
            d.show();
            WebView.WebViewTransport t = (WebView.WebViewTransport) risposta.obj;
            t.setWebView(figlia);
            risposta.sendToTarget();
            return true;
        }

        @Override
        public boolean onConsoleMessage(ConsoleMessage m) {
            if (m.messageLevel() == ConsoleMessage.MessageLevel.ERROR) Log.w(Motore.TAG, "pagina: " + m.message() + " (" + m.sourceId() + ":" + m.lineNumber() + ")");
            return true;
        }
    }

    @Override
    protected void onActivityResult(int richiesta, int esito, Intent dati) {
        if (ponte != null && ponte.risultato(richiesta, esito, dati)) return;
        if (richiesta == RICHIESTA_FILE) {
            ValueCallback<Uri[]> cb = fileScelti;
            fileScelti = null;
            if (cb == null) return;
            Uri[] r = null;
            if (esito == RESULT_OK && dati != null) {
                ClipData clip = dati.getClipData();
                if (clip != null && clip.getItemCount() > 0) {
                    r = new Uri[clip.getItemCount()];
                    for (int i = 0; i < r.length; i++) r[i] = clip.getItemAt(i).getUri();
                } else if (dati.getData() != null) {
                    r = new Uri[]{ dati.getData() };
                }
            }
            cb.onReceiveValue(r);
            return;
        }
        super.onActivityResult(richiesta, esito, dati);
    }

    // ------------------------------------------------------------------ indietro

    private void registraIndietro() {
        if (Build.VERSION.SDK_INT >= 33) {
            android.window.OnBackInvokedCallback cb = new android.window.OnBackInvokedCallback() {
                @Override public void onBackInvoked() { indietro(); }
            };
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, cb);
            indietro = cb;
        }
    }

    @Override @SuppressWarnings("deprecation")
    public void onBackPressed() {
        indietro();
    }

    /** Prima si chiude quello che è aperto nella pagina (menu, schede…), poi si torna indietro, poi si esce. */
    private void indietro() {
        if (!caricata) { moveTaskToBack(true); return; }
        web.evaluateJavascript("(function(){try{return !!(window.LIBRE_INDIETRO&&window.LIBRE_INDIETRO())}catch(e){return false}})()", new ValueCallback<String>() {
            @Override public void onReceiveValue(String r) {
                if ("true".equals(r)) return;
                if (web.canGoBack()) web.goBack();
                else moveTaskToBack(true);
            }
        });
    }

    // ------------------------------------------------------------------ DeX, mouse, tastiera, rotazione

    private void avvisaPagina() {
        if (ponte != null && caricata) ponte.inviaInfo();
    }

    @Override
    public void onConfigurationChanged(Configuration c) {
        super.onConfigurationChanged(c);
        iconeBarre();
        avvisaPagina();
    }

    @Override
    public void onMultiWindowModeChanged(boolean multi, Configuration c) {
        super.onMultiWindowModeChanged(multi, c);
        avvisaPagina();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (input != null) input.registerInputDeviceListener(dispositivi, h);
        avvisaPagina();
    }

    @Override
    protected void onPause() {
        if (input != null) input.unregisterInputDeviceListener(dispositivi);
        super.onPause();
    }

    /** Android 13+: per la notifica della partita in corso serve il permesso (lo si chiede una volta). */
    void chiediNotifiche() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            if (getPreferences(MODE_PRIVATE).getBoolean("notifiche_chieste", false)) return;
            getPreferences(MODE_PRIVATE).edit().putBoolean("notifiche_chieste", true).apply();
            requestPermissions(new String[]{ Manifest.permission.POST_NOTIFICATIONS }, 31);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }

    @Override
    protected void onDestroy() {
        h.removeCallbacksAndMessages(null);
        if (Build.VERSION.SDK_INT >= 33 && indietro != null) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback((android.window.OnBackInvokedCallback) indietro);
        }
        if (web != null) {
            radice.removeView(web);
            web.destroy();
        }
        super.onDestroy();
    }
}
