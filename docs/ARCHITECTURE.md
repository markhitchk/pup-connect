# Architecture and privacy

React Native owns the only runtime UI. Small Kotlin modules provide encrypted SQLite operations, Android permission-dependent scanner integration, clipboard, audio routing/focus, private notifications and foreground call lifetime. Rotation/window resizing is handled without recreating the React Activity; safe areas protect system insets.

## Transport and identity

WSS carries room admission, ephemeral membership, SDP and ICE only. Two authorized peers establish an ordered WebRTC SCTP/DTLS DataChannel. Message bodies, message IDs/receipts, typing and call invitations travel on that channel. Separate WebRTC media PeerConnections use encrypted audio/video transport. TURN relays encrypted WebRTC traffic and does not become a message store. WebRTC signaling remains metadata visible to the service operator.

There is no durable account service, contact directory, cloud history, offline delivery or push registration. Display names are self-asserted, **not authenticated identity**. Tokens authorize a room seat, not a verified person. The signaling service controls peer discovery and SDP; there is no independent fingerprint/identity verification. This implementation claims encrypted WebRTC transport, **not a verified full end-to-end identity/security design**. A compromised endpoint or malicious signaling operator is outside that claim.

## Local storage and delivery

The Kotlin worker serializes operations on private SQLite. Each JSON record is encrypted with a distinct Android-generated AES-GCM nonce and row ID as authenticated data. The non-exportable AES key remains in Android Keystore (hardware backing depends on the device). Message bodies, display names, settings and room tokens are encrypted; row IDs expose record grouping/counts to someone with database-file access. Backups are disabled. Keys and database are lost on uninstall. No cloud backup/sync is silently introduced.

An outgoing message is persisted before transport. A receiver persists before sending delivered acknowledgment. IDs deduplicate retried messages and receipt progression is monotonic: queued → sent → delivered → read. Opening the active conversation while foregrounded marks it read; sending read receipts and typing can be disabled. Receipts indicate remote app processing, not proof that a human read the text. Device-provided timestamps depend on the sender clock. Entire local history is currently loaded on startup; large-history pagination is a future performance improvement.

Legacy plaintext SharedPreferences messages are first copied into an encrypted import record, then imported as stable archived conversations and removed from preferences. Import failure retains the encrypted source record. Flash wear-leveling can retain old plaintext/encrypted remnants; no forensic erasure claim is made.

## Lifecycle

Signaling reconnects use bounded exponential backoff/jitter and actual network state. Host controls offer creation for the data lane, avoiding offer glare. ICE candidates are buffered until remote description exists and identified by lane/generation. Heartbeats detect stale peers; queues retry after channel recovery. Room ID is distinct from the six-digit code, preventing recycled codes from opening another conversation’s history. Either participant leaving permanently closes the room.

Call invitations require explicit acceptance before capture. Runtime microphone/camera permissions are requested only for calls. A visible-activity start creates a microphone/camera foreground service before media capture. Its ongoing notification can return to or end the call. An Android-side 30-second deadline stops unconnected outgoing/accepted calls even when React Native timers pause in the background; it is cancelled when media connects. Audio focus interruptions pause capture or terminate on permanent focus loss; mute/camera choices are restored after a transient interruption. Bluetooth availability/routing depends on the actual Android device and connected accessory.

Without an active call the app requests a signaling/data disconnect after 30 seconds in the background. Android can defer that JavaScript timer; process suspension and server heartbeat timeouts also affect availability. During an active call, the foreground service keeps the process eligible to continue native media. Android can still kill processes, revoke permission, restrict background execution or interrupt media; killed-app incoming calls are not supported. A future reliable incoming-call architecture would need opt-in push tokens, wake-up signaling, a durable identity/routing service, Android Telecom integration and explicit data-retention/privacy decisions. None has been silently provisioned.

Private notifications hide peer identity and message text and never capture media on notification receipt. Google Code Scanner may download its Play services scanning module; it is not a chat backend. Without compatible Google Play services, paste a code or invitation.
