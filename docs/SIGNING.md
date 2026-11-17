# Signing and beta APK builds

The previous v0.1.0 signing key/certificate is not in this repository. Matching the package ID alone cannot make an APK update compatible. Obtain the **original private signing identity** for in-place updates. Do not replace it and claim compatibility.

- `debug`: standard Android debug key, Metro required.
- `beta`: bundled JavaScript, non-debuggable build, signed with a **test** Android debug identity; same package ID. This is installable for testing but is not a production update certificate.
- `release`: original release signing identity supplied through environment variables only. The assemble/bundle release tasks reject an absent signing configuration.

Local release variables: `PUP_SIGNING_STORE` (absolute keystore path), `PUP_SIGNING_STORE_PASSWORD`, `PUP_SIGNING_ALIAS`, `PUP_SIGNING_KEY_PASSWORD`. Run `cd android && ./gradlew assembleRelease`. Keep secrets outside the checkout and shell history; do not pass passwords in command-line arguments.

GitHub Actions secrets:

| Secret                        | Value                                                                                                                                                                                                                             |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUP_BETA_KEYSTORE_BASE64`    | Optional stable test keystore, base64; using Android Gradle Plugin’s standard debug credentials. Only for test APKs. Without it, each clean CI runner creates an ephemeral test key and beta update compatibility is not guaranteed. |
| `PUP_RELEASE_KEYSTORE_BASE64` | Base64 of the **existing compatible** release keystore                                                                                                                                                                            |
| `PUP_RELEASE_STORE_PASSWORD`  | Release store password                                                                                                                                                                                                            |
| `PUP_RELEASE_KEY_ALIAS`       | Release key alias                                                                                                                                                                                                                 |
| `PUP_RELEASE_KEY_PASSWORD`    | Release key password                                                                                                                                                                                                              |

GitHub variable `PUP_INVITE_HOST` is a public domain, not a credential. Empty uses custom-scheme invitations and a non-production localhost manifest placeholder for the HTTPS filter.

The delivered beta targets ARM64 and x86_64; minimum API 26. Other source-configured ABIs require their own build and device validation.

The workflow runs checks, builds debug/beta, verifies the beta signature and alignment, uploads APKs and logs, and runs an Android emulator install/launch/navigation/rotation/theme/foreground smoke. It builds a production release only when release credentials exist. Secrets are not printed or uploaded. Release keystore files are removed after signing. Do not upload keystores as artifacts.

An `INSTALL_FAILED_UPDATE_INCOMPATIBLE` result means signing certificates differ. Preserve device data before deciding whether to uninstall an existing app; uninstalling removes history and Keystore material. No replacement certificate has been asserted compatible with v0.1.0.
