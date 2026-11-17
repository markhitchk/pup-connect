# Pup Connect

Bare React Native Android / TypeScript communication client for Harley’s Studios. Package ID: `com.harleytg.pupconnect`. Version: **0.2.0-beta.1**. No WebView.

**Migration development branch, not a verified full release.** The implementation includes real WebRTC DataChannel messaging and voice/video call flows. Production signaling/TURN provisioning and the two-physical-device acceptance run remain release requirements. See [validation](docs/VALIDATION.md) for results and remaining work.

## Develop

Node 24, JDK 17 (a full JDK), Android Studio / SDK 36, build tools 36.0.0, NDK 27.1.12297006, CMake 3.22.1. Android 8.0 / API 26 minimum. React Native 0.88.1, React 19.3, react-native-webrtc 155.0.1. Gradle wrapper included.

```sh
npm ci
npm run typecheck
npm test
npm start
# In another terminal, with a device/emulator connected:
npm run android
```

`android/local.properties` may contain your local `sdk.dir`; it is ignored. Debug uses Metro. Beta bundles JavaScript and starts without Metro:

```sh
# Standard Android debug identity, for TEST builds only:
# Android Gradle Plugin creates its default test identity when needed.
npm run android:beta
adb install -r android/app/build/outputs/apk/beta/app-beta.apk
```

Do not overwrite an existing debug key. Debug and beta use the test identity; production release requires the original compatible signing identity. See [signing](docs/SIGNING.md).

## Connect two phones

1. Deploy [signaling and coturn](docs/DEPLOYMENT.md) with TLS and real DNS.
2. On both phones, Settings → Connection → save the same `wss://<your-domain>/ws` URL. No production hostname or secret is embedded in the APK.
3. Create Room on the first phone. Pack shows its expiring six-digit code and private QR/link invitation.
4. On the second phone, join with the code (host approval required), or scan/paste the private invitation (access token authorizes joining).
5. Wait for **Online**, send text, then use Calls to start a voice/video call. Accept on the other phone. Keep both apps open while waiting for incoming communication.
6. Use different networks for release acceptance: Wi-Fi on one, mobile data on the other. Repeat with **Use TURN relay only** enabled before establishing a fresh room connection.

One room has two participants; each app has one active room. Previous conversations remain searchable on the device. Both peers must be online for delivery; locally queued outgoing messages retry while that room remains valid. Rooms expire after 24 hours, or after 10 minutes with both peers disconnected. Either peer leaving closes the room to avoid silently replacing a conversation participant. Server restarts invalidate rooms; local history remains.

## Implementation

- HCF palettes, vector paths, paw branding, card shapes, 56dp header, connection bar, and responsive layout derived from original resources. Requested tabs: Chats, Calls, Pack, Settings. Narrow/wide windows, safe areas, keyboard resize, system/light/dark themes.
- Ordered reliable WebRTC DataChannel, durable local outbox, deduplication, delivered/read receipts, typing and real heartbeat/connection state.
- Separate media PeerConnection: incoming/outgoing/accept/decline/end, audio mute/routing, Bluetooth request, camera controls, call history/duration and actual RTT quality. Foreground microphone/camera service and private call notifications.
- Private SQLite records encrypted using Android Keystore AES-GCM, including settings and session tokens. Automatic import of original local SharedPreferences history as archived conversations. Backups disabled. No private messages in signaling or application logs.
- Memory-only Node/WebSocket signaling, strict schemas, cryptographic codes/tokens, host authorization, room TTLs, connection/admission quotas, heartbeat cleanup and short-lived TURN credentials.
- Custom invitation URI and optional verified HTTPS Android App Links. QR scanning uses Google Code Scanner / Google Play services; devices without it can paste an invitation or code.

[Architecture and privacy](docs/ARCHITECTURE.md) · [Original audit](docs/AUDIT.md) · [Deployment](docs/DEPLOYMENT.md) · [Signing and APKs](docs/SIGNING.md) · [Validation and acceptance](docs/VALIDATION.md)

The original Java/XML app is preserved under `legacy/java-xml/` and branch `archive/java-xml-v0.1.0`. It is not included as a second Android app or runtime interface.
