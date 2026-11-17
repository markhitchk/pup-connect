# Repository audit — 2026-11-17

Baseline: `30686f2` (main). Original source is retained in `legacy/java-xml/`, and local branch `archive/java-xml-v0.1.0` points to the unchanged baseline.

- One Java Activity, XML layouts and platform Material styles; AGP 8.7.3, Java 17, min 26, target/compile 35.
- Actual original tabs: Chats / Calls / New / Alerts / Me, plus drawer Settings. The requested Chats / Calls / Pack / Settings tabs consolidate New and rooms under Pack; identity and privacy live under Settings. Alerts become actual private system notifications.
- Local chat is plaintext SharedPreferences (`messages_<code>`), with no transport, delivery, read, typing, signaling, or media implementation. Calls only change labels after permission checks. Room codes are local random values, not server rooms.
- Exact resource colors and vector path data are reused. 56dp header, 50dp connection bar, 60dp navigation and 16dp cards are retained. Responsive content is constrained for large windows.
- No launcher icon was declared and no signing identity or Gradle wrapper was in the source. Paw vector supplies the migrated launcher icon; no assertion of certificate compatibility is possible without the original signing key/certificate.
- Original workflow produces an unsigned APK and exports signing tools; it does not provide a signed update workflow.

Implementation uses bare React Native 0.88.1 / React 19.3 / TypeScript, maintained react-native-webrtc 155.0.1, native Android Keystore AES-GCM with a private SQLite store, and independently deployed Node/WebSocket signaling. Android min 26 is retained. No WebView or cloud message database is introduced.
