package com.harleytg.pupconnect
import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
class CallService:Service() {
    override fun onBind(intent:Intent?):IBinder?=null
    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
        if(intent?.action=="end") {PupModule.instance?.emit("pupEndCall","ended");stopSelf();return START_NOT_STICKY}
        val manager=getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(NotificationChannel("pup-call","Active calls",NotificationManager.IMPORTANCE_LOW))
        val open=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val end=PendingIntent.getService(this,1,Intent(this,CallService::class.java).setAction("end"),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n=Notification.Builder(this,"pup-call").setSmallIcon(R.drawable.ic_paw).setContentTitle("Pup Connect call").setContentText("Tap to return to call").setContentIntent(open).setOngoing(true).setCategory(Notification.CATEGORY_CALL).setVisibility(Notification.VISIBILITY_PRIVATE).addAction(Notification.Action.Builder(null,"End call",end).build()).build()
        if(Build.VERSION.SDK_INT>=29)startForeground(1,n,ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or if(intent?.getBooleanExtra("video",false)==true) ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA else 0) else startForeground(1,n)
        return START_NOT_STICKY
    }
    override fun onTaskRemoved(rootIntent:Intent?) {PupModule.instance?.emit("pupEndCall","ended");stopSelf();super.onTaskRemoved(rootIntent)}
}
