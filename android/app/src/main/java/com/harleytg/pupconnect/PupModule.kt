package com.harleytg.pupconnect

import android.app.*
import android.content.*
import android.database.sqlite.SQLiteDatabase
import android.media.*
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.common.LifecycleState
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.ViewManager
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import java.security.KeyStore
import java.util.UUID
import java.util.concurrent.Executors
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

class PupPackage : ReactPackage {
    override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(PupModule(context))
    override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

class PupModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
    companion object { var instance: PupModule? = null }
    private val worker = Executors.newSingleThreadExecutor()
    private val db by lazy {ctx.openOrCreateDatabase("pup-encrypted.sqlite",0,null).apply {
        execSQL("CREATE TABLE IF NOT EXISTS vault (id TEXT PRIMARY KEY, payload BLOB NOT NULL)")
        // This PRAGMA returns a row; Android rejects it through execSQL.
        rawQuery("PRAGMA secure_delete=ON",null).use {it.moveToFirst()}
    }}
    private val key: SecretKey by lazy {
        val store = KeyStore.getInstance("AndroidKeyStore").apply {load(null)}
        (store.getKey("pup-vault-v1",null) as? SecretKey) ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("pup-vault-v1",KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setRandomizedEncryptionRequired(true).build())
        }.generateKey()
    }
    private val audio by lazy {ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager}
    private var focus: AudioFocusRequest? = null
    private val hive by lazy {HiveDiscovery(ctx) {emit("pupHivePeer",it)}}
    private val callDeadline = Handler(Looper.getMainLooper())
    @Volatile private var activeCallId: String? = null
    init {instance=this}
    override fun getName() = "PupNative"
    override fun getConstants(): Map<String,Any> = mapOf("version" to BuildConfig.VERSION_NAME,"build" to BuildConfig.VERSION_CODE,"inviteHost" to BuildConfig.INVITE_HOST)
    fun emit(event:String, value:String) {ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(event,value)}
    @ReactMethod fun addListener(name:String) {}
    @ReactMethod fun removeListeners(count:Int) {}
    @ReactMethod(isBlockingSynchronousMethod=true) fun randomId():String = UUID.randomUUID().toString()
    @ReactMethod(isBlockingSynchronousMethod=true) fun randomSecret():String {val bytes=ByteArray(32);java.security.SecureRandom().nextBytes(bytes);return bytes.joinToString("") {(it.toInt() and 255).toString(16).padStart(2,'0')}}
    @ReactMethod fun hiveStart(port:Int) {hive.start(port)}
    @ReactMethod fun hiveStop() {hive.stop()}
    private fun crypt(id:String, bytes:ByteArray, decrypt:Boolean=false):ByteArray {
        val cipher=Cipher.getInstance("AES/GCM/NoPadding")
        if(decrypt)cipher.init(Cipher.DECRYPT_MODE,key,GCMParameterSpec(128,bytes.copyOfRange(0,12))) else cipher.init(Cipher.ENCRYPT_MODE,key)
        cipher.updateAAD(id.toByteArray(Charsets.UTF_8))
        return if(decrypt)cipher.doFinal(bytes.copyOfRange(12,bytes.size)) else cipher.iv+cipher.doFinal(bytes)
    }
    private fun job(promise:Promise, block:()->Any?) {worker.execute {try {promise.resolve(block())}catch(e:Exception){promise.reject("PUP_STORAGE","Secure operation failed; data was retained.",e)}}}
    private fun put(id:String,value:String) {val data=ContentValues().apply {put("id",id);put("payload",crypt(id,value.toByteArray(Charsets.UTF_8)))};db.insertWithOnConflict("vault",null,data,SQLiteDatabase.CONFLICT_REPLACE).also {check(it!=-1L)}}
    @ReactMethod fun set(id:String,value:String,p:Promise) = job(p){put(id,value);null}
    @ReactMethod fun get(id:String,p:Promise) = job(p){db.query("vault",arrayOf("payload"),"id=?",arrayOf(id),null,null,null).use {if(it.moveToFirst())String(crypt(id,it.getBlob(0),true),Charsets.UTF_8) else null}}
    @ReactMethod fun all(prefix:String,p:Promise) = job(p){val out=Arguments.createArray();db.rawQuery("SELECT id,payload FROM vault WHERE substr(id,1,?)=? ORDER BY rowid",arrayOf(prefix.length.toString(),prefix)).use {while(it.moveToNext())out.pushString(String(crypt(it.getString(0),it.getBlob(1),true),Charsets.UTF_8))};out}
    @ReactMethod fun remove(prefix:String,p:Promise) = job(p){db.delete("vault","substr(id,1,?)=?",arrayOf(prefix.length.toString(),prefix));null}
    @ReactMethod fun importLegacy(p:Promise) = job(p){
        val prefs=ctx.getSharedPreferences("pup_connect",Context.MODE_PRIVATE)
        val old=prefs.all
        if(old.isNotEmpty()) {
            val json=JSONObject();old.forEach {(k,v)->if(k.startsWith("messages_")||k=="identity_name")json.put(k,v)}
            if(json.length()>0) {put("legacy-import",json.toString());prefs.edit().clear().commit()}
        };null
    }
    @ReactMethod fun scan(p:Promise) {val activity=ctx.currentActivity;if(activity==null){p.reject("PUP_SCAN","Open Pup Connect to scan.");return};activity.runOnUiThread {GmsBarcodeScanning.getClient(activity).startScan().addOnSuccessListener {p.resolve(it.rawValue)}.addOnFailureListener {p.reject("PUP_SCAN","Scanner unavailable. Update Google Play services or paste the invitation.",it)}.addOnCanceledListener {p.resolve(null)}}}
    @ReactMethod fun copy(text:String) {(ctx.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager).setPrimaryClip(ClipData.newPlainText("Pup Connect room",text))}
    @ReactMethod fun notifyEvent(kind:String) {
        val manager=ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(NotificationChannel("pup-events","Messages and incoming calls",NotificationManager.IMPORTANCE_HIGH).apply {lockscreenVisibility=Notification.VISIBILITY_PRIVATE})
        val open=PendingIntent.getActivity(ctx,0,Intent(ctx,MainActivity::class.java),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n=Notification.Builder(ctx,"pup-events").setSmallIcon(R.drawable.ic_paw).setContentTitle("Pup Connect").setContentText(if(kind=="call")"Incoming call — open to answer" else "New message").setVisibility(Notification.VISIBILITY_PRIVATE).setContentIntent(open).setAutoCancel(true)
        if(kind=="call")n.setCategory(Notification.CATEGORY_CALL).setTimeoutAfter(30000)
        try {manager.notify(if(kind=="call")2 else 3,n.build())}catch(_:SecurityException){}
    }
    @ReactMethod fun clearNotifications() {(ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).apply {cancel(2);cancel(3)}}
    @ReactMethod fun startCall(video:Boolean,id:String,p:Promise) {
        try {
            val activity=ctx.currentActivity
            if(activity==null || activity.isFinishing || activity.isDestroyed || ctx.lifecycleState!=LifecycleState.RESUMED) {p.reject("PUP_CALL","Open Pup Connect before starting or accepting a call.");return}
            ctx.startForegroundService(Intent(ctx,CallService::class.java).putExtra("video",video))
            audio.mode=AudioManager.MODE_IN_COMMUNICATION
            focus=AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()).setOnAudioFocusChangeListener {change->if(change<0)emit("pupInterruption",if(change==AudioManager.AUDIOFOCUS_LOSS)"ended" else "pause") else emit("pupInterruption","resume")}.build()
            if(audio.requestAudioFocus(focus!!)!=AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {stopCall();p.reject("PUP_AUDIO","Audio is in use by another app.");return}
            activeCallId=id
            callDeadline.removeCallbacksAndMessages(null)
            // RN frame timers pause in the background; ringing must still stop.
            callDeadline.postDelayed({if(activeCallId==id){stopCall();emit("pupCallExpired",id)}},30000)
            p.resolve(null)
        }catch(e:Exception){stopCall();p.reject("PUP_CALL","Unable to start call service.",e)}
    }
    @ReactMethod fun callConnected(id:String) {if(activeCallId==id)callDeadline.removeCallbacksAndMessages(null)}
    @ReactMethod fun stopCall() {activeCallId=null;callDeadline.removeCallbacksAndMessages(null);ctx.stopService(Intent(ctx,CallService::class.java));focus?.let {audio.abandonAudioFocusRequest(it)};focus=null;if(Build.VERSION.SDK_INT>=31)audio.clearCommunicationDevice() else {audio.stopBluetoothSco();audio.isSpeakerphoneOn=false};audio.mode=AudioManager.MODE_NORMAL;clearNotifications()}
    @ReactMethod fun route(route:String,p:Promise) {
        try {if(Build.VERSION.SDK_INT>=31){val type=when(route){"speaker"->AudioDeviceInfo.TYPE_BUILTIN_SPEAKER;"bluetooth"->AudioDeviceInfo.TYPE_BLUETOOTH_SCO;else->AudioDeviceInfo.TYPE_BUILTIN_EARPIECE};val device=audio.availableCommunicationDevices.firstOrNull {it.type==type||(route=="bluetooth"&&it.type==AudioDeviceInfo.TYPE_BLE_HEADSET)};if(device==null||!audio.setCommunicationDevice(device)){p.reject("PUP_AUDIO","Requested audio device is unavailable.");return}}
        else {audio.isSpeakerphoneOn=route=="speaker";if(route=="bluetooth") {audio.startBluetoothSco();audio.isBluetoothScoOn=true} else {audio.stopBluetoothSco();audio.isBluetoothScoOn=false}}
        p.resolve(null)}catch(e:Exception){p.reject("PUP_AUDIO","Audio route unavailable.",e)}
    }
}
