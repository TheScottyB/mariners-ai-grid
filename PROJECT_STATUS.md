# Mariner's AI Grid - Project Status Report
**Generated: January 18, 2026**

This document serves as the "Source of Truth" for AI agents (Claude Code, Gemini Conductor) and developers working on the Mariner's AI Grid.

---

## 1. App Identity & Vision
*   **Name:** Mariner’s AI: Waze for Sailors
*   **Core Promise:** "The Waze of the Ocean. Run GraphCast AI locally. Real-time boat crowdsourcing."
*   **Mission:** Democratize safety-critical weather intelligence by bridging the high-bandwidth cloud and low-bandwidth boat using local AI.
*   **Key Differentiator:** Proprietary "Slicer" technology (10GB global → 5MB local seed) and offline-first "Agentic AI."

---

## 2. Technical Architecture

### **A. Mobile Application (Frontend)**
*   **Framework:** Expo SDK 54 (Managed Workflow + CNG).
*   **Language:** TypeScript (Strict Mode).
*   **Identity:** "Shadow Auth" (Device-Level Identity via `expo-secure-store`).
*   **State Management:** TanStack Query (server/weather state) + Zustand (client UI state).
*   **Maps:** Mapbox GL Native (`@rnmapbox/maps`).
*   **Storage:** `expo-sqlite/vec` (Vector storage for social hazards), Parquet (Weather Seeds).
*   **Inference:** `MarinerInference.ts` utilizing `onnxruntime-react-native` for NPU-accelerated GraphCast execution (implemented).
*   **Social:** `SocialLayer.ts` and `GridSync.ts` for spatial hazard queries and fleet-wide CC0 synchronization (implemented).

### **B. The Conductor (Backend/Slicer)**
*   **Language:** Python 3.12+ (Managed via `uv`).
*   **Core Role:** Downloads ECMWF HRES data, slices it to a 500nm radius, prunes variables, and compresses it for satellite transmission.
*   **Key Libraries:** `xarray`, `cfgrib`, `zstandard`, `protobuf`, `pyarrow`.
*   **Output:** `.seed.zst` files (High-efficiency payloads with variable-specific quantization).
*   **Cost Model:** Integrated 2026 satellite rates (Starlink, Iridium) for user transparency.

### **C. The Bridge (Hardware)**
*   **Protocol:** Signal K (WebSocket) over NMEA 2000.
*   **Implementation:** `SignalKBridge.ts` using `ReconnectingWebSocket` and `expo-network`.
*   **Function:** Ingests local boat sensors (Wind, Barometer, GPS) to "ground truth" the AI model.

---

## 3. Current Implementation Status

### ✅ **Completed**
*   **Project Structure:** Monorepo-style setup established (`app/` for mobile, `conductor/` for backend).
*   **Dependency Management:** Migrated Python tooling to `uv` for speed and determinism.
*   **Identity:** Implemented "Shadow Auth" service for anonymous, device-level user tracking.
*   **The Bridge:** Functional `SignalKBridge` for real-time NMEA 2000 telemetry ingest.
*   **The Slicer (Prototype):**
    *   Functional `ECMWFHRESSlicer` logic with AIFS integration.
    *   `BoundingBox` and `VariablePruner` logic implemented.
    *   Export support for **Parquet** and **Protobuf+Zstd**.
    *   **Performance Breakthrough:** Cracked the 1MB barrier! Hit **1.25MB Protobuf Payload** (3.3x compression) for a 72h regional forecast.
    *   Shared Schema: `weather_seed.proto` defined for cross-platform data contract.
    *   CLI tool (`mag-slicer`) operational with detailed cost estimates.
    *   Production-grade compression (Quantization) verified via "Truth Layer Audit".
*   **Mobile Core:**
    *   `MarinerInference.ts`: Adoption of `expo-file-system/next` for bridge-less binary reading.
    *   `SocialLayer.ts`: Vector-based 'Waze' hazard search using `expo-sqlite/vec`.
    *   `VesselSnapshot.ts`: Privacy-preserving "Truth Layer" capture of divergence events.
    *   `GridSync.ts`: Fleet-wide CC0 synchronization with background fetch support.
    *   **PatternAlert UI:** Tactical display with double-tap haptic feedback for DIVERGENT consensus.
*   **Integration:**
    *   `SeedUploader.ts` utility for cloud distribution.
    *   `MockNMEAStreamer.ts` utility for "Storm Sim" stress testing.
*   **Testing:**
    *   Full test suite for the Slicer is passing (including fixed Protobuf roundtrip fidelity).
    *   **Storm Sim Field Test:** ✅ Passed. Successfully triggered DIVERGENT state during simulated pressure plunge.

### 🚧 **In Progress**
*   **End-to-End Integration:** Wiring Slicer -> Cloud -> Mobile -> Map for live Pacific Crossing data.
*   **AI Model Integration:** GraphCast ONNX model weight loading and tensor binding.

---

## 4. 90-Day Roadmap

| Phase | Duration | Focus | Key Deliverables |
| :--- | :--- | :--- | :--- |
| **Phase 1** | **Days 1-15** | **Data Ingest (Conductor)** | Automated ECMWF AIFS/HRES download & Slicer optimization. (✅ *Complete*) |
| **Phase 2** | **Days 16-30** | **The Slicer (Refinement)** | Maximize compression ratios (<1MB goal), edge-case handling. (✅ *Complete*) |
| **Phase 3** | **Days 31-60** | **The App (Frontend)** | Expo UI, Mapbox integration, reading `.seed.zst` files locally. (🚧 *Active*) |
| **Phase 4** | **Days 61-90** | **The Bridge (Hardware)** | Signal K integration, "Data Freshness" UI, Social reporting. (✅ *Foundation Ready*) |

---

## 5. Next Immediate Actions (for AI Agents)

1.  **End-to-End Verification:** Perform a full pipeline test using a real AIFS download and visualize the first AI-generated wind barb on the mobile map.
2.  **UX Polish:** Add haptic feedback on hazard report submission; implement route waypoint input UI.
3.  **App Store Readiness:** Finalize marketing metadata and prepare EAS build profiles for the July 2026 beta launch.
4.  **Refine Slicer fallbacks:** Implement logic for physics-based HRES fallback if AIFS open data buckets are delayed.

---

**Guidance for Agents:**
*   **Do not** suggest "ejecting" from Expo.
*   **Do** use `uv` for all Python operations.
*   **Do** prioritize offline-first architecture in all TS code.