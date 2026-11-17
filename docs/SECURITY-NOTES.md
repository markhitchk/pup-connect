# Dependency review for the Hive beta

`npm audit` on November 17, 2026 reports 66 high-severity dependency entries, propagated from one picomatch ReDoS advisory: [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf). The registry latest is 4.0.7 and the advisory lists no patched version. A forced Jest major upgrade is not a verified fix for that advisory.

The installed paths are Jest/Metro/build-time globbing through picomatch 2.3.2 and React Native tinyglobby through 4.0.7. The application does not expose glob pattern input to peers and the generated Hive worklet bundle contains no picomatch module. This is a limited code-path assessment, not proof that the entire dependency tree is secure. Do not process untrusted repository paths/patterns in the build environment. Recheck the advisory and update compatible patched packages when published. CI retains the raw audit report. An offline audit with an empty advisory cache is not evidence of zero vulnerabilities.

The beta has no independent security audit. See HIVE.md for network metadata, identity, NAT and background limits and SIGNING.md for test-certificate limitations. A production release remains gated by dependency review and physical-device acceptance.
