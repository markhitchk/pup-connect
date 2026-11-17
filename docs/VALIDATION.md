# Implementation checklist and release gate

Development branch: `react-native-migration`. Baseline archived: `archive/java-xml-v0.1.0` at `30686f2`. This document distinguishes implemented code from observed device behavior; unchecked acceptance items block full-release status.

## Automated results in the development executor

- **PASS** app TypeScript and signaling TypeScript (`npm run typecheck`).
- **PASS** 10 signaling/protocol tests: host admission, private invitations, two-person limits, dropped-socket resume, duplicate sessions, lock/close, room and pending-request expiry, throttling, schema rejection, TURN HMAC, invitation parsing and receipt ordering.
- **PASS** 11 controller tests: persistence-before-send, receipt monotonicity, offline queue retry, duplicate incoming messages, read privacy, storage failure without false acknowledgment, explicit incoming-call acceptance/decline, retained history/settings restoration, isolation of the outbox when rooms change, capture privacy while ringing, and ICE before SDP.
- **PASS** 2 React Native component tests: all four navigation screens, dark-theme selection, room dialog and configuration failure handling. Native dependencies are mocked in these tests. They are **not** device communication tests.
- **PASS** standalone server TypeScript compilation.
- **PASS in GitHub Actions** real libwebrtc loopback DataChannel, synthetic two-way audio/video and ICE restart. The native test harness runs in an isolated Node process to avoid the test-only addon's Node 24 shutdown destructor issue. This executor cannot gather ICE candidates because network-interface enumeration is denied, so this one test explicitly skips locally; CI ran all 24 tests without skipping. This is not Android microphone/camera verification.
- **PASS** Android debug and bundled beta compilation, ARM64 + x86_64, JDK 17 / SDK 36. Local Gradle build: 338 tasks, successful. Environment proxy trust, a full JDK and disk-backed Gradle cache were required; these local environment adjustments are not shipped in the repository.
- **PASS** beta APK signature verification (test certificate), package `com.harleytg.pupconnect`, min SDK 26 / target 36, 16 KB APK zip alignment and native ELF LOAD segment alignment. This certificate is not asserted compatible with v0.1.0.
- **PASS in GitHub Actions** standalone signaling container build. Production deployment is not provisioned.
- Android emulator install/launch/navigation/rotation/theme/foreground smoke: **pending the workflow run after the SDK setup correction**. No physical device tests have run.

CI evidence: [24 tests and signaling container checks](https://github.com/markhitchk/pup-connect/actions/runs/44055101599). The Android job in that run stopped before compilation because the setup action requested Google's removed legacy `tools` package. The workflow now explicitly installs `platform-tools` instead. See the latest workflow run for the subsequent Android results.

## Source checklist

| Area                                                      | Implemented     | Validation remaining                                                      |
| --------------------------------------------------------- | --------------- | ------------------------------------------------------------------------- |
| Bare RN/TS, package ID, archive, HCF assets and palettes  | Yes             | Device visual comparison with original                                    |
| Chats/Calls/Pack/Settings and identity, search            | Yes             | Device touch/keyboard and accessibility review                            |
| System/light/dark, narrow/wide windows, safe areas        | Yes             | Actual rotation, split-screen, Chromebook/Samsung testing                 |
| DataChannel messages, outbox, dedupe, receipts, typing    | Yes             | Two physical Android devices                                              |
| SQLite + Keystore encryption; legacy history import       | Yes             | Native encryption/upgrade/device restart verification                     |
| Voice/video, incoming/outgoing, accept/decline, controls  | Yes             | Two-way physical microphone/camera testing                                |
| Audio route, Bluetooth, interruptions, foreground service | Yes             | Physical headset, audio focus, background and long-call checks            |
| Presence, network backoff, data/media ICE restart         | Yes             | Real Wi-Fi → mobile and airplane-mode interruption                        |
| WSS signaling, authorizations, quotas, TTL and heartbeat  | Yes             | Production TLS/DNS and service operations                                 |
| STUN + coturn REST credentials, relay-only mode           | Yes             | Real coturn provision and relay traffic verification                      |
| Copy/share invitations, QR generation/scanning            | Yes             | Installed-app share/scan on actual devices                                |
| Custom URI + optional HTTPS verified links                | Yes             | Owned domain + actual certificate assetlinks verification                 |
| Private notifications and permission settings             | Yes             | Android permission/lifecycle variants                                     |
| Debug/beta/release signing workflow                       | Yes             | Compilation/signature checked; installation and original release credentials remain            |
| Killed-app incoming calls / offline cloud delivery        | Not implemented | Separate opt-in push/identity architecture, documented in ARCHITECTURE.md |

No claim of an independently verified end-to-end encryption design or compatibility with an unknown previous signing certificate is made.

## Physical acceptance run — NOT RUN

Use an unrestricted production WSS/coturn deployment and two real Android devices. Record app commit, APK SHA-256, signing fingerprint, device model/Android build, network types, test time and observed results. Do not include tokens, SDP, IPs or message content in public logs.

1. Install and launch on both devices. Check cold start without Metro, Android 8 where available, Samsung Galaxy/Android 17 and tablet sizing.
2. Host creates room; guest joins using six-digit code; host approves. Repeat with invitation link and QR. Decline an unwanted code request, lock joining, try expired/invalid invitations and third-member join.
3. Put one device on Wi-Fi and the other on mobile data. Both show real **Online** state. Exchange messages in both directions; verify timestamps, delivered/read receipts and typing privacy toggles.
4. Kill/relaunch the client with retained data. Confirm local history and supported room resume. Never infer remote delivery from local display alone.
5. Make two-way voice calls; test accept/decline/cancel/missed timeout, microphone mute, speaker/earpiece, actual Bluetooth headset, history, duration and quality indication.
6. Make two-way video calls; verify both cameras, front/rear switching, disabling/enabling camera and microphone, ending from each device.
7. Toggle airplane mode temporarily. Check stale status, backoff, restored messaging, no duplicate messages, ICE restart and call recovery. Switch Wi-Fi/mobile mid-call.
8. Repeat in TURN relay-only mode from a fresh peer connection; verify candidate-pair type in controlled diagnostics/coturn counters. Verify sustained calls beyond credential refresh and restrictive NAT.
9. Rotate, resize/split-screen, lock screen, background/foreground, receive a regular phone call/audio-focus interruption and deny/revoke permissions. Check no unintended microphone/camera capture or leaked service.
10. Visit every primary screen; search conversations, edit name/connection, change theme, manage notification permissions, clear test history and verify private notification previews.

All ten acceptance criteria remain unverified on physical devices. **Do not merge to main or advertise a full operational release until this run passes.**
