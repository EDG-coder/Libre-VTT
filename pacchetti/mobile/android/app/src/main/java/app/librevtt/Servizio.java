package app.librevtt;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

/**
 * Finché si è in partita (si ospita o si è collegati) l'app resta viva anche se si passa a
 * un'altra app per un momento: Android lo permette solo con una notifica fissa, che è questa.
 * Chiudendo l'app dalle app recenti la partita si chiude.
 */
public final class Servizio extends Service {
    private static final String CANALE = "partita";
    private static final int ID = 1;

    static void accendi(Context c, boolean si) {
        Intent i = new Intent(c, Servizio.class);
        try {
            if (!si) c.stopService(i);
            else if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
            else c.startService(i);
        } catch (Exception e) {
            // Android può rifiutarlo (per esempio se l'app non è in primo piano): pazienza
            Log.w(Motore.TAG, "Servizio in primo piano: " + e);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm != null) {
            NotificationChannel ch = new NotificationChannel(CANALE, getString(R.string.canale_partita), NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        Intent apri = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, apri,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CANALE) : new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_notifica)
                .setContentTitle(getString(R.string.app_name))
                .setContentText(getString(R.string.notifica_partita))
                .setContentIntent(pi)
                .setOngoing(true)
                .setShowWhen(false);
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        try {
            if (Build.VERSION.SDK_INT >= 34) startForeground(ID, b.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            else startForeground(ID, b.build());
        } catch (Exception e) {
            Log.w(Motore.TAG, "startForeground: " + e);
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // l'utente ha chiuso l'app dalle recenti: la partita finisce davvero
        stopSelf();
        android.os.Process.killProcess(android.os.Process.myPid());
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
