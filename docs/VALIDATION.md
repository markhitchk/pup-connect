# Implementation checklist and release gate

Development branch: `react-native-migration`. Original baseline preserved in `archive/java-xml-v0.1.0` at `30686f2` and `legacy/java-xml/`. The 61 original source/resource files were compared by Git blob hash. `main` remains unchanged. This is a beta candidate, not a physically verified full release.

## Automated results

| Check | Result | Scope and limits |
| --- | --- | --- |
| App and signaling TypeScript | PASS | `npm run typecheck`; standalone server compilation also passes |
| Signaling/protocol tests | PASS: 11 | Admission/host approval, private invitations, limits, resume, duplicate sessions, lock/close, expiry, throttling, schemas, TURN HMAC, invitation parsing and receipt ordering |
| Controller tests | PASS: 17 | Persist before send/ack, retry/dedupe, monotonic receipts, read privacy, storage failure, restored history/settings, room isolation, call acceptance/history, capture choices, early ICE, interrupted recovery, termination retry, offline presence and ending during a stats poll |
| React Native UI and URL tests | PASS: 4 | Four navigation screens, appearance/dialog/configuration behavior, standards-compliant custom invitation/WSS parsing; native dependencies mocked |
| Real libwebrtc integration | PASS in CI | Real two-way DataChannel, synthetic two-way audio/video and ICE restart through signaling in an isolated Node process; not Android hardware media |
| Actual coturn relay integration | PASS in CI | UDP and TCP client transports, member-scoped short-lived credentials, real bidirectional DataChannel/synthetic media, relay candidate statistics and ICE restart; one controlled CI host, not public NAT/TLS or Android hardware |
| Android debug and bundled beta | PASS locally and in CI | JDK 17, SDK/target 36, minimum 26, ARM64 + x86_64; final build completed 338 tasks |
| Beta signature and ZIP alignment | PASS locally and for downloaded CI beta | Test signature; 16 KB zip alignment. Exact artifact SHA-256 and certificate below |
| Native ELF alignment | PASS | All 26 shared libraries in the downloaded CI beta have LOAD alignment ≥ 16 KB |
| Signaling Docker image | PASS in CI | Standalone multi-stage image build; production not provisioned |
| Android emulator beta installation and launch | PASS in CI | API 36 x86_64 Google APIs emulator, bundled JS without Metro |
| Native encrypted persistence | PASS in CI | Real Keystore/SQLite save, force-stop, restart and retained display name/navigation; this is not an original-certificate upgrade test |
| Emulator navigation/lifecycle | PASS in CI | Chats/Calls/Pack/Settings, custom invitation URI parsing and join-attempt/cancel against an intentionally unreachable hostname, system theme, rotation, home/foreground, no fatal runtime errors |
| Physical Android devices | NOT RUN | No physical device is connected to this executor |

Locally, **32 tests pass and one real-WebRTC test explicitly skips** because this executor denies network-interface enumeration/ICE gathering. CI ran all **33 tests with no skips**. The libwebrtc test runs in a disposable Node process because the test-only native addon has a Node 24 shutdown/destructor issue; Android uses the React Native WebRTC binding instead.

APK source tested in CI: [`d749b05`](https://github.com/markhitchk/pup-connect/commit/d749b05e36ed344cfb8e1c451a08807829036f61). CI evidence: [workflow run 44073717785](https://github.com/markhitchk/pup-connect/actions/runs/44073717785). Additional TURN checks: [workflow run 44078351913, checks job](https://github.com/markhitchk/pup-connect/actions/runs/44078351913/job/134022123995), source `13870e7`. Both UDP and TCP relay modes passed alongside the existing 33 tests. Only test/deployment documentation and automation changed; the delivered APK remains the previously verified binary. Local proxy trust, full-JDK installation and a disk-backed Gradle cache are executor setup, not shipped app configuration.

Downloaded CI beta SHA-256: `13fc83827fa79245203cb1f0b57c4560c5beeb9339d0664f8ffb026b083063b8`. Test certificate SHA-256: `a7ea59c36c0e359acfb274b5a9ab9101aaa3b1b421c9652b3b709835341dd1a9`. This certificate is not asserted compatible with v0.1.0.

API 36 meets the [published Google Play target requirement](https://developer.android.com/google/play/requirements/target-sdk) checked November 17, 2026. Android 17/API 37 behavior has **not** been tested. Minimum-API support is configured, not verified on every Android release. The final emulator screenshots were inspected: portrait 1080×1920, landscape 1920×1080, distinct HCF light/dark palettes; the runtime fatal-error log is empty.

## Implementation and outstanding validation

| Area | Implemented | Still required |
| --- | --- | --- |
| Bare RN/TS, same package, HCF assets/palettes, branding | Yes | Physical visual comparison with the original |
| Chats/Calls/Pack/Settings, identity, search and history | Yes | Device keyboard, touch and accessibility review |
| System/light/dark, safe areas, responsive layout | Yes | Tablet, split-screen, Chromebook and Samsung desktop windows |
| DataChannel chat, outbox, acknowledgments, read/typing | Yes | Two physical phones exchanging real messages |
| Keystore-encrypted SQLite and legacy history import | Yes | Original-signed v0.1 upgrade and real-device retention tests |
| Voice/video, incoming/outgoing, accept/decline/end | Yes | Two-way physical microphone/camera tests |
| Audio routes, Bluetooth, camera controls, call history | Yes | Physical headset, front/rear camera and audio-focus tests |
| Foreground service, private notifications, native ring timeout | Yes | Background/lock-screen, interruption and long-call tests |
| Presence, bounded reconnect, data/media ICE recovery | Yes | Wi-Fi/mobile transitions and real network interruptions |
| WSS signaling, membership authorization, quotas/expiry | Yes | Production DNS/TLS/host provisioning and operations |
| STUN/coturn, short-lived credentials, relay-only mode | Yes | Production NAT/TLS, Android relay traffic and long-call credential-refresh tests |
| Copy/share/private invitation, QR generation/scanning | Yes | Actual Android share/scan; scanner needs Google Play services |
| Custom URI and optional verified HTTPS App Links | Yes | Owned domain, matching certificate and assetlinks verification |
| APK CI and secure release configuration | Yes | Original compatible release identity and stable beta-key secret |
| Killed-app incoming calls / offline cloud delivery | No | Separate opt-in push/identity architecture; see ARCHITECTURE.md |

No production host/domain, push account, analytics or durable message backend has been provisioned. Both apps must be online for delivery. Production settings contain no embedded hostname or secret. The delivered beta certificate differs from the archived v0.1.0 certificate and cannot update that installation. The original private key remains unavailable; its known certificate fingerprint is recorded in SIGNING.md. Clean CI runners generate different test identities unless `PUP_BETA_KEYSTORE_BASE64` is configured; see SIGNING.md. No independently verified end-to-end identity/encryption claim is made.

## Physical acceptance run — NOT RUN

Use a production WSS/coturn deployment and two real Android devices. Record app commit, APK SHA-256, signing fingerprint, device model/Android build, network types, test time and observed results. Keep tokens, SDP, IPs and message bodies out of public logs.

1. Install and cold-launch on both devices without Metro. Include Android 8 where available, Samsung Galaxy/Android 17 and tablet sizing.
2. Create a room, join by six-digit code and approve as host. Repeat with private invitation and QR; decline an unwanted request, lock the room, reject expired/invalid invitations and a third member.
3. Put one phone on Wi-Fi and the other on mobile data. Check real Online state, two-way messages, timestamps, delivered/read receipts and typing/privacy controls.
4. Kill/relaunch with retained data. Check history and supported room restoration. Local display alone is not remote delivery evidence.
5. Make two-way voice calls. Test accept/decline/cancel/missed timeout, mute, speaker/earpiece, real Bluetooth, duration, quality and history.
6. Make two-way video calls. Verify both cameras, front/rear switching, disabling/enabling capture and ending from either phone.
7. Interrupt networking temporarily and switch Wi-Fi/mobile mid-call. Verify stale status, bounded backoff, recovery and no duplicate messages or restart loops.
8. Repeat with TURN relay-only enabled on fresh connections. Verify actual relay candidate/coturn traffic and sustained calls beyond credential refresh.
9. Rotate/resize, split-screen, lock, background/foreground, interrupt with a phone call, and deny/revoke permissions. Verify capture and foreground-service cleanup, including ending while disconnected.
10. Visit every primary screen; search, edit settings, change themes, manage permissions/notifications and clear test history. Verify notification privacy.

All ten user acceptance criteria remain unverified on physical devices. **Do not merge to main or advertise a full operational release until this run passes.**
