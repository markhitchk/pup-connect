# Try the Hive beta on two phones

This is a testing build for Android 10 or newer. Install the same APK on both phones; its test certificate is not compatible with the original Alpha signing certificate. Keep any existing history safe before changing installations.

1. Open Settings on each phone and save a distinct display name. Keep **Use public discovery bootstrap** enabled for the initial internet test. No Pup Connect server address or hosting account is needed.
2. On the first phone open Pack, choose Create or join room, then Create Room.
3. Open Pack and use Share invitation or Show QR invitation. The private invitation includes the host peer key. On the second phone open the invitation link, paste it into Join Room, or choose Scan QR invitation. The scanner requires compatible Google Play services.
4. For a code-only join, enter the six digits and approve the request on the host. A third member is rejected. Private links are preferable because global short-code collisions are possible.
5. Wait for **Online**, then exchange messages. Delivered/read indicators reflect actual remote processing. Start voice/video from the conversation; the receiving phone must accept before media capture.
6. Briefly interrupt networking, restore it and check reconnection and retained history. Keep both apps open for this first test. Killed-app incoming calls and offline delivery are not available.

Try one phone on Wi-Fi and the other on mobile data. Direct WebRTC can fail behind restrictive NAT/firewalls; there is no hidden central TURN relay. This beta is a discovery/signaling swarm, not general forwarding of calls or stored messages through other phones. Public discovery still uses shared bootstrap/routing peers. Disabling public bootstrap removes initial public bootstrap and STUN requests, but learned peer routes may still be external; it is not a network firewall.

Report the APK checksum, device/OS, networks, outcome and exact error without publishing invitations, tokens, SDP or private messages. See VALIDATION.md for the full acceptance checklist.
