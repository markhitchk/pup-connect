# Pup Connect

Pup Connect is a native Android peer-to-peer communication app for the Harley's Clan ecosystem.

## Current status

**UI foundation / Alpha**

The first implementation establishes the HCF-inspired Android design system and room UI. WebRTC signaling, voice/video, and DataChannel messaging will be added as separate networking modules.

## Android

- Package: `com.harleytg.pupconnect`
- Minimum Android: API 26
- Compile/target SDK: 35
- Native Java + XML
- No Compose
- No third-party UI dependencies

## UI foundation

- HCF-style cyan accent (`#00b8f0`)
- Automatic light/dark resource palettes
- Pup Connect app header and connection status
- Create Room and Join Room actions
- Six-digit room code UI flow
- Recent conversation cards
- Chats / Calls / Pack / Settings bottom navigation

## Planned WebRTC stack

- WebRTC DataChannel for real-time messages
- WebRTC audio/video calls
- Lightweight signaling service for SDP/ICE exchange
- STUN plus TURN fallback
- Invite links and QR room joining
- Local chat history
- Presence, typing, read status, and room host controls

Pup Connect is part of the Harley's Clan / Harley's Studios app family.
