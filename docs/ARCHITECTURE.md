# Hive architecture and privacy

React Native owns the only runtime UI. Kotlin provides encrypted SQLite, permissions, audio routing/focus, notifications, foreground call lifetime, barcode scanning and same-Wi-Fi NSD discovery. [HIVE.md](HIVE.md) describes the current network and limits.

## Transport and identity

An embedded Bare worklet runs Hyperswarm/HyperDHT. Shared DHT routing peers discover endpoints; Android NSD adds nearby Wi-Fi DHT nodes. There is no required Pup Connect WSS room service. Each room owner persists membership locally and enforces approval, invitation, lock, expiry and two-member capacity. Noise streams authenticate peer keys and encrypt admission/SDP/ICE. Private invitations pin the host public key; code-only discovery has no independently verified host identity and global code collisions are possible.

Chat, receipts, typing and call invitations use a direct WebRTC SCTP/DTLS DataChannel. Audio/video use separate encrypted WebRTC media connections. This is a distributed discovery/signaling swarm, not generic multi-hop forwarding or offline storage. Direct media can fail behind restrictive NATs; this build has no central TURN fallback. Public STUN is configurable and disabled with shared internet discovery. Discovery operators and communicating peers can observe networking metadata.

Persistent Noise keys identify an installation, not a verified human. Display names are self-asserted. There is no account service, contact directory, cloud history, push registration or independent security audit. This implementation claims encrypted transports and local encrypted storage, not a fully verified end-to-end identity/security design. Compromised endpoints remain outside that claim.

## Local storage and delivery

The Kotlin worker serializes operations on private SQLite. Each JSON record is encrypted with a distinct Android-generated AES-GCM nonce and row ID as authenticated data. The non-exportable AES key remains in Android Keystore (hardware backing depends on the device). Message bodies, display names, settings and room tokens, Hive identity seeds and room snapshots are encrypted; row IDs expose record grouping/counts to someone with database-file access. Backups are disabled. Keys and database are lost on uninstall. No cloud backup/sync is silently introduced.

An outgoing message is persisted before transport. A receiver persists before sending delivered acknowledgment. IDs deduplicate retried messages and receipt progression is monotonic: queued → sent → delivered → read. Opening the active conversation while foregrounded marks it read; sending read receipts and typing can be disabled. Receipts indicate remote app processing, not proof that a human read the text. Device-provided timestamps depend on the sender clock. Entire local history is currently loaded on startup; large-history pagination is a future performance improvement.

Legacy plaintext SharedPreferences messages are first copied into an encrypted import record, then imported as stable archived conversations and removed from preferences. Import failure retains the encrypted source record. Flash wear-leveling can retain old plaintext/encrypted remnants; no forensic erasure claim is made.

## Lifecycle

Hyperswarm manages peer discovery/reconnect; actual network changes restart the worklet and resume a retained seat. Host controls offer creation for the data lane, avoiding offer glare. ICE candidates are buffered until remote description exists and identified by lane/generation. Heartbeats detect stale peers; queues retry after channel recovery. Room ID is distinct from the six-digit code, preventing recycled codes from opening another conversation’s history. Either participant leaving permanently closes the room.

Call invitations require explicit acceptance before capture. Runtime microphone/camera permissions are requested only for calls. A visible-activity start creates a microphone/camera foreground service before media capture. Its ongoing notification can return to or end the call. An Android-side 30-second deadline stops unconnected outgoing/accepted calls even when React Native timers pause in the background; it is cancelled when media connects. Audio focus interruptions pause capture or terminate on permanent focus loss; mute/camera choices are restored after a transient interruption. Bluetooth availability/routing depends on the actual Android device and connected accessory.

Without an active call the app requests a signaling/data disconnect after 30 seconds in the background. The Bare worklet also follows app lifecycle suspension. Android can defer JavaScript timers or suspend networking; availability is not guaranteed. During a call the worklet is kept active. During an active call, the foreground service keeps the process eligible to continue native media. Android can still kill processes, revoke permission, restrict background execution or interrupt media; killed-app incoming calls are not supported. A future reliable incoming-call architecture would need opt-in push tokens, wake-up signaling, a durable identity/routing service, Android Telecom integration and explicit data-retention/privacy decisions. None has been silently provisioned.

Private notifications hide peer identity and message text and never capture media on notification receipt. Google Code Scanner may download its Play services scanning module; it is not a chat backend. Without compatible Google Play services, paste a code or invitation.
