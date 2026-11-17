# Hive beta validation and release gate

Branch: `hive-network`; version `0.3.0-hive-beta.1`. This replaces the 0.2 WSS-required runtime. The historical results in [VALIDATION-0.2.md](VALIDATION-0.2.md) do not verify the new Android worker.

## Current checks

| Check | Result | Scope |
| --- | --- | --- |
| TypeScript | PASS locally | React Native and retained standalone service |
| Hive room logic | 7 PASS locally | Durable state, Noise-key authorization, approval, invitations, lock/resume, expiry, third-member rejection |
| Other automated logic/UI tests | 34 PASS locally | Existing room/message/call/controller/navigation tests plus Hive STUN/invitation tests; native dependencies mocked |
| Real three-peer Hive integration | Pending CI | Skipped locally because native interface enumeration is denied; must test actual DHT, encrypted streams and reconnect after bootstrap removal |
| Real libwebrtc integration | Pending new CI | Skipped locally because ICE interface enumeration is denied; previous 0.2 CI passed |
| New Android compile/install | Pending CI | New Bare worklet and NSD code are not yet verified on Android |
| Physical devices | NOT RUN | No connected phones; cross-network chat, microphone/camera, backgrounding and Bluetooth remain unverified |

No full operational release is claimed. The branch is not ready to merge to main until the physical acceptance gate passes. The minimum is now Android 10/API 29 due to Bare Kit; target API remains 36. Android 17/API 37 is untested.

## Physical acceptance — NOT RUN

Record commit, APK checksum/certificate, phone model/OS, networks, time and observed outcome. Do not publish message contents, SDP, invitations or keys.

1. Install and cold-launch the bundled APK on two phones. Compare the HCF design with the original; check permissions and keyboard.
2. Create/join by code with host approval; repeat with private key-pinned invitation, share and QR. Reject a third member, declined requests, locked and expired rooms.
3. Test same Wi-Fi with shared internet discovery off. Then enable shared discovery and put one phone on Wi-Fi and one on mobile data. Verify actual DataChannel messages, timestamps, delivery/read receipts, typing and presence.
4. Force-stop/relaunch with retained data; check encrypted history, settings and supported room recovery. This is not an original-certificate upgrade test.
5. Test two-way voice and video, accept/decline/cancel/missed timeout, microphone mute, speaker, real Bluetooth, front/rear camera, camera off, duration, quality and history.
6. Interrupt/change networks and restore them. Verify status/recovery, bounded retries and no duplicated messages. Repeat while the initial discovery route is unavailable where supported.
7. Rotate, resize, split-screen, background/foreground, lock and interrupt calls. Deny/revoke permissions and verify capture/service cleanup.
8. Visit all primary screens and operate search/settings/privacy/clear-history. Test Samsung, tablets, Chromebook and desktop windows.

Restrictive NATs can prevent direct WebRTC communication: this Hive beta supplies no central TURN fallback and no generic peer media/message relay. Offline delivery and killed-app incoming calls are not implemented. Shared DHT bootstrap/routing peers remain an internet discovery dependency. See [HIVE.md](HIVE.md). Do not count synthetic media or emulator smoke as two physical phones passing these criteria.
