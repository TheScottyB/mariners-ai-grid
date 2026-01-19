# Tech Stack Specification: Mariner’s AI Grid (2026)

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