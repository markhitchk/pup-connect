# Signaling, TURN and invitations

Deploy on a Linux host with public networking, Docker Compose and a domain you control. A serverless HTTP deployment that cannot retain WebSockets/UDP is insufficient. Provisioning is not automatic and may incur your hosting provider’s charges. No hosting account or DNS is silently created.

## Configure

1. Point `connect.<your-domain>` and `turn.<your-domain>` DNS to the server. Open TCP 80/443, UDP/TCP 3478, TCP 5349, and UDP 49160–49200. TURN behind NAT needs correct `external-ip=PUBLIC_IP/PRIVATE_IP` plus forwarding.
2. Copy `deploy/.env.example` to `deploy/.env`, replace the example domains. Generate a secret with `openssl rand -hex 32`; set it as `TURN_SHARED_SECRET`. Keep the file mode 600. Do not commit it.
3. Create `deploy/private/`; copy `deploy/turnserver.conf.example` to `deploy/private/turnserver.conf`. Set the realm/server-name and the same random `static-auth-secret`. Put a valid TURN-domain TLS full chain and private key in `deploy/private/tls/fullchain.pem` and `privkey.pem`, readable by the coturn container. Arrange automatic renewal and coturn restart. These files are excluded from Git.
4. Start from the repository root: `docker compose --project-directory deploy -f deploy/compose.yaml up --build -d`. Caddy provisions HTTPS for `SIGNAL_DOMAIN`. Check `https://<signal-domain>/healthz`; enter `wss://<signal-domain>/ws` in both apps.
5. Restrict the signaling container to the private Docker network. `TRUST_PROXY=1` is for this single reverse-proxy topology only: the backend takes the rightmost forwarded address supplied by Caddy. Leave it off for direct public deployments. Do not expose port 8080 publicly when trusting proxy headers.
6. Native apps send no browser Origin. Browser origins are rejected unless explicitly listed, comma-separated, in `ALLOWED_ORIGINS`.

Use maintained, reviewed image versions and pin production image digests after validating the deployed combination. Example Compose uses Caddy 2 and coturn 4 stable channels. Monitor resource usage without retaining signaling payloads, private invitations, or access tokens. Caddy access logging is not enabled by this configuration. The service itself prints only startup status.

## Environment

| Variable             | Purpose                                                           |
| -------------------- | ----------------------------------------------------------------- |
| `HOST`               | Listener, default `127.0.0.1`; Docker uses `0.0.0.0` behind Caddy |
| `PORT`               | Listener port, default 8080                                       |
| `STUN_URLS`          | Comma-separated STUN URLs; none embedded by default               |
| `TURN_URLS`          | UDP/TCP/TLS TURN URLs; empty disables TURN                        |
| `TURN_SHARED_SECRET` | Coturn REST shared secret; remains server-side                    |
| `ALLOWED_ORIGINS`    | Explicit browser origins; native clients need none                |
| `TRUST_PROXY`        | `1` only behind the documented single trusted proxy               |
| `SIGNAL_DOMAIN`      | Caddy public TLS hostname                                         |

TURN credentials expire after 600 seconds, include the peer ID, and use coturn REST HMAC-SHA1. Only room members can request credentials. The client refreshes its ICE configuration every five minutes while running. Do not reduce TTL below the refresh interval; verify long calls and ICE restarts on the deployed coturn service. Coturn quotas limit credential abuse; credentials are bearer grants for their short lifetime and are not a durable identity.

The service defaults to 1,000 rooms, 2,000 sockets, 30 connection attempts/min/IP, 20 admission attempts/10min/IP and 600 packets/min/IP. Its rate-key map is bounded. All requests are schema-validated, payload size capped, and compression disabled. Six-digit code-only admission always needs host approval; an unguessable 256-bit invitation authorizes direct joining. Never post invitation links publicly.

Rooms are memory-only with 24h maximum lifetime and 10min idle cleanup. Active sockets are pinged every 25s. Pending approval expires after 30s. Do not horizontally scale independent instances without shared ephemeral room routing/state; use one instance for this deployment. Restarting loses room membership and expires reconnect tokens. The server never stores chat content.

## Verified Android App Links

By default invitations use `pupconnect://join?code=...&invite=...`. They work on devices with Pup Connect installed, but custom schemes are not proof of domain ownership.

For verified HTTPS links:

1. Set GitHub repository variable `PUP_INVITE_HOST` to your invitation domain, matching Caddy, and rebuild the APK.
2. Copy `deploy/public/.well-known/assetlinks.json.example` to `assetlinks.json`; replace the fingerprint with **that APK’s actual signing certificate** (`apksigner verify --print-certs`). The package remains `com.harleytg.pupconnect`.
3. Serve `https://<domain>/.well-known/assetlinks.json` without auth/redirects with JSON content type. Configure correct content type in your web server if required.
4. Check `adb shell pm verify-app-links --re-verify com.harleytg.pupconnect`, then `adb shell pm get-app-links com.harleytg.pupconnect`.
5. Test a privately shared link and QR on both physical phones. The `/join` fallback page can open the custom scheme and contains no analytics.

Until DNS, TLS, assetlinks and the certificate are configured and verified, HTTPS App Links are **not verified**. Never advertise otherwise.

## Automated relay preflight

On an unrestricted Linux development/CI host with coturn (`turnserver`) and the root npm dependencies installed, run `node server/test/coturn-runner.mjs`. It starts a disposable coturn process with a random secret in a mode-600 temporary config, obtains peer-scoped credentials from the real signaling service, forces both peers to relay, verifies selected candidate types, exchanges DataChannel messages and synthetic audio/video, and restarts ICE. UDP and TCP client transports must both pass. Only outcome flags are logged; the temporary service/config are removed.

This test deliberately allows a private CI interface and disables TURN TLS for its isolated local fixture. It is not a production configuration or a public-network/TLS/physical-device acceptance test. Use the hardened deployment template above for production and complete VALIDATION.md on two phones.
