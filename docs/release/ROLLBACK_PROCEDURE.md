# Rollback Procedure: sqlite-vec & Native Engine

This document outlines the emergency rollback procedure for the Mariner's AI Grid mobile application, specifically for issues related to the `sqlite-vec` native extension or `op-sqlite` engine.

## Scenario: Native Engine Failure
If a production release (v1.0.0+) experiences crashes or data corruption due to the native database layer:

### 1. Fast Rollback (EAS Update)
If the issue is logic-based (JS/TS) but the native code is stable, use EAS Update to revert to the last known good state.

```bash
# 1. Identify the last successful update ID
eas update:list --branch production

# 2. Republish the old update to the production branch
eas update:republish --branch production --group <OLD_UPDATE_GROUP_ID>
```

### 2. Full Rollback (Native Binary)
If the native `sqlite-vec` binary itself is causing crashes (e.g., SIMD instruction errors on older devices):

1. **Revert the Commit**: Identify the stable commit before the breaking native change.
2. **Nuke and Rebuild**: 
   ```bash
   pnpm nuke
   ```
3. **Deploy Preview**:
   ```bash
   eas build --profile preview --platform ios
   ```
4. **App Store Submission**: Once verified, submit the stable build to the App Store as a hotfix (e.g., v1.0.1).

## Diagnostic Commands
To verify if `sqlite-vec` is the root cause, check the logs for:
- `[VecDB] sqlite-vec extension not loaded`
- `[op-sqlite] statement execution error`
- `illegal hardware instruction` (indicates SIMD mismatch)

## Mitigation Strategy
- **Managed CNG**: Always use `expo prebuild --clean` before creating a production build to ensure native links are fresh.
- **Fingerprinting**: Use `npx expo-fingerprint` to verify if a change actually requires a new native binary.
- **Staged Rollout**: Use the `RemoteConfig` service to disable "Social Reporting" if the vector DB becomes unstable.
