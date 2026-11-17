# Hive network model

Status: implemented on the `hive-network` development branch; native builds and real peer tests must pass before a new APK is delivered. Physical-device acceptance remains unverified.

## Components

| Component | Responsibility |
| --- | --- |
| React Native HCF UI | Existing Chats/Calls/Pack/Settings, invitations, permissions and local history |
| HiveSignaling | Starts/stops the native worklet, validates protocol packets and persists private identity/room state |
| Bare worklet | Runs maintained Hyperswarm/HyperDHT without requiring a Node server process outside the app |
| Distributed discovery | Shared DHT bootstrap/routing peers, plus Android NSD on the same Wi-Fi |
| Room owner app | Creates a six-digit code, approves joins, holds an authorized two-member room and enforces expiry/lock |
| Noise peer connection | Authenticated encrypted connection setup, bound to each device's public key |
| WebRTC | Existing direct DataChannel messages and audio/video; no media acquisition before explicit call acceptance |

The old mandatory WSS endpoint is removed from Settings. No Pup Connect VPS, centralized room registry, durable account service or message backend is used. Shared public DHT nodes still help a fresh internet node find its first routing peers; this is not a claim that the internet swarm has zero bootstrap participants. In local-only mode the application supplies an empty bootstrap list and omits public STUN endpoints; NSD introduces local DHT peers instead.

## Scope and connectivity

This version distributes discovery and signaling. It does **not** implement general multi-hop store-and-forward chat, anonymous routing, or forwarding arbitrary encoded call media across intermediary phones. Direct WebRTC connectivity still depends on the actual NAT/firewall. Public STUN is configurable and does not carry message contents; no app-owned TURN server is required or silently selected. A disconnected or suspended phone cannot serve as an always-on network node. A future peer-relay feature needs explicit battery/data budgets, endpoint-encrypted payloads and independently tested media forwarding; none is advertised as complete here.

Android NSD covers the same local Wi-Fi network. It does not establish a Wi-Fi Direct group, a Bluetooth mesh, or an internet bridge across disconnected networks. Android can suspend/kill the process. Active calls retain their existing foreground microphone/camera service, while idle connection availability is best effort. There is no hidden always-on background relay service.

## Identity and admission

Each install generates a random 32-byte seed, saved in the existing Keystore-encrypted vault before the worklet starts. The maintained cryptographic library derives a stable Noise peer key from it. Room membership binds to that key as well as an unguessable token. A peer with a stolen room token but a different Noise key cannot take over an existing seat. Room creation/admission/leave changes persist before acknowledgment.

Private invitations include the host peer key and a 256-bit random invitation. The expected host key restricts which peer can supply the joined session. Six-digit codes identify a DHT rendezvous topic and can collide across independently created rooms. They require host approval, expose discoverable metadata, and do not authenticate a person's identity. Prefer private QR/link invitations. Display names remain self-asserted.

The app does not claim an independently audited end-to-end identity/security design. The DHT sees lookup/address metadata; the two signaling endpoints see SDP and ICE. Private message bodies remain on WebRTC DataChannels and in the encrypted local vault. Relayed discovery does not mean third-party routing peers receive message bodies.

## Bounded operation

The worklet limits peer connections to eight and frames to 128 KiB, caps rate-key state, times out approval requests, rejects malformed signaling on the RN boundary and never logs SDP, tokens or message text. Room maximum lifetime is 24 hours. Room owner/member state can resume using the same private identity while valid. Uninstall or lost Keystore data destroys that identity; server-based room sessions are not imported as hive memberships, while their local conversation history is retained.

## Release gate

Run the real three-peer test, embedded-worklet Android smoke and full existing suite. Then test two physical Android devices on distinct networks, direct messages/calls, network transitions, camera/Bluetooth routes and background behavior. Record actual outcomes; a working local room code alone is not proof of an internet media connection. Android 8/9 cannot install this Hive build because react-native-bare-kit requires API 29; the archived older beta remains separate.
