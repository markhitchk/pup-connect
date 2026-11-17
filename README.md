# Pup Connect — Hive beta

Bare React Native Android / TypeScript client for Harley's Studios. HCF interface, package `com.harleytg.pupconnect`, **0.3.0-hive-beta.1**, Android **10 / API 29+**. The maintained Bare mobile runtime requires API 29; the archived 0.2 build supported API 26. No WebView.

## App-to-app network

The Hive beta removes the required WSS room server. Room creation, approval, membership and expiration run on participating devices. A native Bare worklet runs Hyperswarm/HyperDHT for distributed peer discovery and encrypted connection setup. Same-Wi-Fi discovery uses Android NSD to introduce local routing peers. Shared internet discovery uses the Holepunch public DHT bootstrap/routing peers; these are network participants, not a Pup Connect account or message backend. No hosting account, database service or paid server has been provisioned.

This is a **discovery/signaling swarm**. Chat and calls still travel over direct WebRTC DataChannels and encrypted media connections. It does not yet forward or store other users' messages or media across arbitrary intermediate phones. Restrictive NAT/firewalls can still prevent a direct connection; the beta does not promise universal Wi-Fi/mobile connectivity or secretly fall back to a central TURN relay. Keep both apps open while connecting. See [Hive architecture and limits](docs/HIVE.md).

## Connect two devices

1. Install the same Hive beta on both Android 10+ devices. Open Pup Connect.
2. Create Room on one device. No server address is required.
3. Share its private invitation or QR; the invitation pins the host's public peer key. Alternatively, enter the six-digit rendezvous code and approve the request on the host. Codes are discoverable hints and are not globally unique or authenticated identities.
4. Wait for real **Online** status before messaging or calling. Calls require explicit acceptance and contextual microphone/camera permissions.
5. To use only the local network, disable **Shared internet peer discovery** before joining/creating a room. That also disables public STUN requests. Both devices must be on the same Wi-Fi; Wi-Fi Direct/Bluetooth discovery is not implemented.

Public discovery/STUN peers can observe network metadata. Private invitations should be shared privately. No cloud chat history, push registration or killed-app wakeup service is added. Local history, hive identity and membership tokens remain encrypted with Android Keystore AES-GCM in private SQLite. A room has two members; either member explicitly leaving closes it. Room state is retained locally until its 24-hour expiration.

## Development and builds

Node 24, full JDK 17, SDK/build tools 36, NDK 27.1.12297006, CMake 3.22.1.

```sh
npm ci
npm run typecheck
npm test
npm start
# With a connected Android device/emulator:
npm run android
# Bundled, non-debuggable test APK:
npm run android:beta
```

`npm ci` packs the Bare worker and links its Android native addons through `hive/prepare.cjs`. Generated `hive/generated` and `android/hive-resources` are ignored; rerun `npm run hive:prepare` after changing worker code. The build pins Bare Kit Kotlin v0.2.6 and aligns the RN adapter's Gradle metadata with SDK 36. No native source is replaced by a WebView.

Unit tests cover membership/admission/privacy and existing messaging/call logic. The real three-peer integration test requires unrestricted native interface enumeration and runs in CI; a restricted executor must explicitly report the skip. Android smoke now exercises the embedded worker's local room creation, QR, durable close, persistence, navigation, rotation and themes. These are not two-physical-device or hardware-media verification.

See [signing](docs/SIGNING.md) and [validation](docs/VALIDATION.md). Test certificates do not update an installation signed with the original v0.1 identity. Keep signing keys/passwords outside Git. The original Java/XML application remains archived under `legacy/java-xml/` and `archive/java-xml-v0.1.0`; the previous server-based beta is preserved on `react-native-migration`. The standalone server remains development/reference code and is not required by this Hive runtime.
