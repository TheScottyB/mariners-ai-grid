# Tech Stack Specification: Mariner's AI Grid (2026)

## 1. Core Framework

- **Framework:** Expo SDK 54 (Managed Workflow + Continuous Native Generation)
- **Language:** TypeScript (Strict Mode)
- **State Management:** TanStack Query (weather data caching) + Zustand (UI state)

### Hardware Targets

| Device | Role | NPU Performance |
|--------|------|-----------------|
| iPhone 11 (A13) | The Floor | ~0.6 TOPS - Sovereign AI baseline |
| Pixel 10 (Tensor G5) | Android Standard | ~8 TOPS - Background Watchkeeper |
| **iPad Pro (M4/M5)** | **The Chart Table** | **38 TOPS** - Primary target |
| MacBook Pro (M5) | The Supercomputer | 40+ TOPS - 10-day reruns |

### Minimum Requirements

| Platform | Minimum Device | OS Version | Architecture |
|----------|---------------|------------|--------------|
| iOS | iPhone 11 (A13 Bionic) | iOS 16.0+ | arm64 only |
| Android | Snapdragon 865 / Tensor G5 | API 26 (Android 8.0+) | arm64-v8a only |

**Rationale:** Edge AI inference (GraphCast ONNX, CoreML), Live Activities, and modern iOS 16+ APIs require these minimums.

### The iPad "Chart Table" Advantage

In 2026, the iPad Pro M4/M5 is the definitive bridge hardware:
- **60x faster** AI tasks than iPhone 11 baseline
- **Sustained thermals** for multi-day storm-tracking
- **Screen real estate** for Hybrid Query + 9km IFS maps side-by-side
- **Laydown form factor** for chart table mounting

### Android High-Performance Targets (2026)

| Device | Chipset | Role |
|--------|---------|------|
| **Pixel 10 / 10 Pro** | Tensor G5 (Laguna) | The AI Standard - NPU 990, local-only inference |
| **Galaxy S26 Ultra** | Snapdragon 8 Elite | Raw Power - 4.74GHz, ideal for GraphCast reruns |
| **Oppo Find X9 Pro** | Dimensity 9500 | Battery Sovereign - 7,500mAh for offshore |
| **Xiaomi 16 Ultra** | Snapdragon 8 Elite | Professional Bridge - 1TB storage, advanced cooling |
| **Galaxy Tab S11** | Snapdragon 8 Elite | Android Chart Table - Split View UI |

### Memory Scaling by Device RAM

| RAM | LRU Cache | Regional Seeds | Coverage |
|-----|-----------|----------------|----------|
| 4-8GB | 50MB | ~25 seeds | Trans-Pac voyage |
| 12GB | 100MB | ~50 seeds | Pacific basin |
| 16GB+ | 200MB | ~100 seeds | Full ocean basin |

---

## 2. AI & Data Architecture

### SQLite + Vector Search Stack

| Component | Choice | Purpose |
|-----------|--------|---------|
| **Engine** | `op-sqlite` | Synchronous JSI Bridge for "Zero Latency" - ingests 2.1MB seeds without bridge overhead |
| **Extension** | `vlasky/sqlite-vec` (v0.2.4-alpha) | Range queries ("how many around me") and semantic "vibe" searches |
| **Workflow** | Expo SDK + CNG | Automatic native compilation via package.json config |

**Configuration:**
```json
// package.json - This is the ONLY configuration needed
{
  "op-sqlite": {
    "sqliteVec": true
  }
}
```

> **Full Technical Rationale:** See [VECTOR_DB_DECISION.md](./VECTOR_DB_DECISION.md) for the complete Architecture Decision Record.

### CNG-Only Principle

Agents should **NEVER** create or edit:
- `plugins/` directory (should not exist)
- `modules/` directory (should not exist)
- `ios/` or `android/` folders (auto-generated, ephemeral)

### Other AI & Data Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| Local Inference | ONNX Runtime / CoreML | NPU-accelerated GraphCast execution |
| Ingest Pipeline | Apache Arrow + Parquet | <50ms ingest, columnar compression |
| Model Storage | Expo FileSystem | Regional .zarr / .parquet storage |
| LRU Caching | 50MB limit | ~25 regional seeds (Trans-Pac voyage) |
| Telemetry | Signal K Client | WebSocket-based NMEA 2000 bridge |
| Offline Maps | @rnmapbox/maps (v11+) | Mapbox GL Native with offline tiles |

---

## 3. DevOps & Deployment

| Component | Technology | Purpose |
|-----------|------------|---------|
| Build System | EAS (Expo Application Services) | Cloud-based CI/CD |
| CI/CD | GitHub Actions -> EAS Build | TestFlight/Google Play delivery |
| Updates | Expo Updates (OTA) | 5-minute JS hotfixes without App Review |
| Metadata | EAS Metadata | Automated App Store store-front updates |

---

## 4. Hardware Integration (The Bridge)

| Component | Technology | Purpose |
|-----------|------------|---------|
| NMEA 2000 | Native module via `expo-module-scripts` | Marine instrument bridge |
| Sensors | `expo-sensors` | Barometer, Accelerometer, Gyroscope truth-checking |
| Connectivity | `expo-network` | Metered vs. Starlink/WiFi detection |

---

## 5. Why Expo SDK in 2026

### Continuous Native Generation (CNG)
- Custom native modules for specialized hardware (NMEA 2000 listeners)
- Config Plugins for native configuration
- Clean Expo workflow while AI agents handle Xcode/Android Studio complexity

### EAS as Co-worker Automation
- Cloud-based CI/CD for code signing and builds
- Automated screenshot generation
- Single-command App Store submission (`eas submit`)

### OTA (Over-The-Air) Updates
- Push JavaScript updates directly to users without App Store review
- Critical for safety-critical weather app bug fixes (5 minutes vs. 2-day review)
- Social "Waze" layer can be updated independently

### Development Philosophy

Expo SDK in 2026 is not a beginner's trade-off - it's the most sophisticated way to build for the App Store, especially when orchestrating with AI agents. The managed workflow with CNG provides enterprise-grade native access while maintaining the automation and tooling benefits that make AI-driven development efficient.

---

## 6. Tablet Responsive UI: GridSync

For both iPad Pro and Android tablets (Galaxy Tab S11), implement **Split View**:

```
+-----------------------------+---------------------------+
|   LEFT: 3D Tactical Map     |   RIGHT: AI Conductor     |
|   - Wave direction          |   - AIFS vs. HRES compare |
|   - Debris paths            |   - 6-hour nudge status   |
|   - Social hazards          |   - Model confidence      |
+-----------------------------+---------------------------+
```
