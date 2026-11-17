package com.harleytg.pupconnect

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Build
import android.os.Handler
import android.os.Looper
import java.net.Inet4Address
import java.util.ArrayDeque
import java.util.UUID
import org.json.JSONObject

/** Local DHT peer discovery only. Room membership and chat contents are never advertised. */
class HiveDiscovery(context: Context, private val found: (String) -> Unit) {
    private val nsd = context.getSystemService(Context.NSD_SERVICE) as NsdManager
    private val main = Handler(Looper.getMainLooper())
    private var generation = 0
    private var port = 0
    private var ownName = ""
    private var registration: NsdManager.RegistrationListener? = null
    private var discovery: NsdManager.DiscoveryListener? = null
    private val seen = mutableSetOf<String>()
    private val pending = ArrayDeque<NsdServiceInfo>()
    private var resolving = false
    private val type = "_puphive._udp."

    fun start(value: Int) { main.post {
        if(value !in 1..65535 || (port == value && discovery != null)) return@post
        stopNow()
        port = value
        val epoch = generation
        ownName = "PupHive-${UUID.randomUUID().toString().take(8)}"
        val r = object: NsdManager.RegistrationListener {
            override fun onServiceRegistered(info: NsdServiceInfo) {main.post {if(epoch == generation) ownName = info.serviceName}}
            override fun onRegistrationFailed(info: NsdServiceInfo, code: Int) {}
            override fun onServiceUnregistered(info: NsdServiceInfo) {}
            override fun onUnregistrationFailed(info: NsdServiceInfo, code: Int) {}
        }
        val d = object: NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(t: String) {}
            override fun onDiscoveryStopped(t: String) {}
            override fun onStartDiscoveryFailed(t: String, code: Int) {}
            override fun onStopDiscoveryFailed(t: String, code: Int) {}
            override fun onServiceLost(info: NsdServiceInfo) {main.post {seen.remove(info.serviceName)}}
            override fun onServiceFound(info: NsdServiceInfo) {main.post {
                if(epoch != generation || info.serviceName == ownName || !info.serviceType.startsWith("_puphive._udp") || seen.size >= 64) return@post
                if(seen.add(info.serviceName)) {pending.add(info); resolveNext(epoch)}
            }}
        }
        registration = r; discovery = d
        try {
            nsd.registerService(NsdServiceInfo().apply {serviceName = ownName; serviceType = type; port = value}, NsdManager.PROTOCOL_DNS_SD, r)
            nsd.discoverServices(type, NsdManager.PROTOCOL_DNS_SD, d)
        } catch(_: Exception) {stopNow()}
    }}
    @Suppress("DEPRECATION")
    private fun resolveNext(epoch: Int) {
        if(epoch != generation || resolving || pending.isEmpty()) return
        val service = pending.removeFirst()
        resolving = true
        try {nsd.resolveService(service, object: NsdManager.ResolveListener {
            override fun onResolveFailed(info: NsdServiceInfo, code: Int) {main.post {if(epoch == generation) {resolving = false; resolveNext(epoch)}}}
            override fun onServiceResolved(info: NsdServiceInfo) {main.post {
                if(epoch != generation) return@post
                resolving = false
                val host = if(Build.VERSION.SDK_INT >= 34) info.hostAddresses.firstOrNull {it is Inet4Address} ?: info.hostAddresses.firstOrNull() else info.host
                val address = host?.hostAddress
                if(address != null && info.port in 1..65535) found(JSONObject().put("host", address).put("port", info.port).toString())
                resolveNext(epoch)
            }}
        })} catch(_: Exception) {resolving = false; resolveNext(epoch)}
    }
    fun stop() {main.post {stopNow()}}
    private fun stopNow() {
        generation++
        discovery?.let {try {nsd.stopServiceDiscovery(it)} catch(_: Exception) {}}
        registration?.let {try {nsd.unregisterService(it)} catch(_: Exception) {}}
        discovery = null; registration = null; port = 0
        seen.clear(); pending.clear(); resolving = false
    }
}
