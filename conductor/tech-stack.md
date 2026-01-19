# Tech Stack Specification: Mariner's AI Grid (2026)

## 1. Core Framework
- **Framework:** Expo SDK (Latest Stable)
- **Workflow:** Managed with Continuous Native Generation (CNG)
- **Language:** TypeScript (Strict Mode)
- **State Management:** TanStack Query (for weather data caching) + Zustand (UI state)

## 2. AI & Data Architecture
- **Local Inference:** ONNX Runtime / CoreML (via custom Expo Modules)
- **Model Storage:** Expo FileSystem (Regional .zarr / .parquet storage)
- **Telemetry Ingest:** Signal K Client (WebSocket-based)
- **Offline Mapping:** Mapbox GL Native (via @rnmapbox/maps)

## 3. DevOps & Deployment
- **Build System:** EAS (Expo Application Services)
- **CI/CD:** GitHub Actions -> EAS Build -> TestFlight/Google Play
- **Updates:** Expo Updates (OTA enabled for "Waze" social layer)
- **Metadata Management:** EAS Metadata (for automated App Store store-front updates)

## 4. Hardware Integration (The Bridge)
- **NMEA 2000:** Native module bridging via `expo-module-scripts`
- **Sensors:** `expo-sensors` (Barometer, Accelerometer, Gyroscope for truth-checking)
- **Connectivity:** `expo-network` (Detection of Metered vs. Starlink/WiFi status)

## Why Expo SDK in 2026

### Continuous Native Generation (CNG)
In 2026, Expo no longer requires "ejecting" to access native code. CNG allows:
- Custom native modules for specialized hardware (NMEA 2000 listeners)
- Config Plugins for native configuration
- Clean Expo workflow while AI agents handle Xcode/Android Studio complexity

### EAS as Co-worker Automation
EAS (Expo Application Services) provides:
- Cloud-based CI/CD for code signing and builds
- Automated screenshot generation
- Single-command App Store submission (`eas submit`)
- Exactly the "get it approved for me" automation needed

### Regional Data "Slicer" Integration
- `expo-file-system` provides stable regional data slice downloads
- Background fetch capabilities easier to script than community CLI alternatives
- Better suited for AI agent automation

### OTA (Over-The-Air) Updates
- Push JavaScript updates directly to users without App Store review
- Critical for safety-critical weather app bug fixes (5 minutes vs. 2-day review)
- Essential for rapid iteration based on community feedback
- Social "Waze" layer can be updated independently

### Development Philosophy
Expo SDK in 2026 is not a beginner's trade-off—it's the most sophisticated way to build for the App Store, especially when orchestrating with AI agents. The managed workflow with CNG provides enterprise-grade native access while maintaining the automation and tooling benefits that make AI-driven development efficient.
