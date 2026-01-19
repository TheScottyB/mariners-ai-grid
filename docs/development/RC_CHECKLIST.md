# Release Candidate (RC) Checklist: Mariner's AI Grid (MAG) v1.0

**Target:** July 2026 "First Watch" Launch  
**Standard:** Cyber-Secure Class Notation Compliance

---

## 🛡️ Security & Integrity Hardening

- [x] **Code Obfuscation:** Verify `metro-minify-terser` is active in `eas.json` production profile.
- [ ] **Encrypted Storage:** Confirm `expo-secure-store` is used for all sensitive identifiers (Shadow ID) and vectors.
- [ ] **API Attestation:** Ensure `SeedUploader` enforces app attestation checks.
- [x] **SBOM Generation:** Generate Software Bill of Materials tracking `apache-arrow`, `mapbox`, `onnxruntime`, etc.

## 📡 Protocol & Hardware Stability

- [x] **Signal K Heartbeat:** Test auto-reconnect latency (<500ms on WiFi restore). (Verified via implementation audit)
- [ ] **NMEA Noise Filtering:** Validate `PatternMatcher` filtering logic against erratic barometer PGNs.
- [ ] **Thermal Stress Test:** Run `EmergencyMode` (10Hz polling) for 2 hours on device; monitor thermal throttling.
- [x] **Offline COP:** Verify map rendering and pattern matching functionality with zero network connectivity.

## 🌀 "Circular Truth" Loop Validation

- [x] **Slicer Fidelity:** Confirm 10GB -> 1.25MB compression maintains <0.03kt error margin.
- [x] **Divergence Logic:** Run `MockNMEAStreamer` storm scenario; verify `CONFIRMING` -> `EMERGENCY` transition logic.
- [ ] **Consensus Accuracy:** Validate `✓ CONSENSUS` badge against 0.25° grid resolution variance.

## 🚀 Deployment & Support Readiness

- [ ] **Feature Flags:** Verify "Night Watch" and "Social Reporting" are flagged for remote toggle.
- [ ] **Rollback Strategy:** Document `eas update --rollback` procedure for `op-sqlite` + `vlasky/sqlite-vec` v0.2.4-alpha issues.
- [ ] **Analytics:** Confirm "First Watch Complete" event fires in EAS Dashboard.

---

## 🚦 Go/No-Go Decision

**Authorization:** Deployment authorized only if all **High-Severity** items (Security & Signal K) are **RESOLVED**.
