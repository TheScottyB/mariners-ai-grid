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
*   **Inference:** `MarinerInference.ts` utilizing `onnxruntime-react-native` for NPU-accelerated GraphCast execution.
*   **Social:** `SocialLayer.ts` for spatial hazard queries using `expo-sqlite/vec`.

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
    *   Shared Schema: `weather_seed.proto` defined for cross-platform data contract.
    *   CLI tool (`mag-slicer`) operational with detailed cost estimates.
    *   Production-grade compression (Quantization) verified via "Truth Layer Audit".
*   **Mobile Core:**
    *   `MarinerInference.ts` scaffolded for NPU execution.
    *   `SocialLayer.ts` scaffolded for vector search.
*   **Testing:** Full test suite for the Slicer is passing (including fixed Protobuf roundtrip fidelity).

### 🚧 **In Progress**
*   **Mobile App UI:** Initial Expo setup with Identity integration (pending Map UI wiring).
*   **AI Model Integration:** GraphCast ONNX model weight loading and tensor binding.

---

## 4. 90-Day Roadmap

| Phase | Duration | Focus | Key Deliverables |
| :--- | :--- | :--- | :--- |
| **Phase 1** | **Days 1-15** | **Data Ingest (Conductor)** | Automated ECMWF AIFS/HRES download & Slicer optimization. (✅ *Complete*) |
| **Phase 2** | **Days 16-30** | **The Slicer (Refinement)** | Maximize compression ratios (<5MB goal), edge-case handling. (✅ *Complete*) |
| **Phase 3** | **Days 31-60** | **The App (Frontend)** | Expo UI, Mapbox integration, reading `.seed.zst` files locally. (🚧 *Active*) |
| **Phase 4** | **Days 61-90** | **The Bridge (Hardware)** | Signal K integration, "Data Freshness" UI, Social reporting. |

---

## 5. Next Immediate Actions (for AI Agents)

1.  **Claude Code (Mobile):** Wire up the `MarinerMap.tsx` component to the `MarinerInference` service to visualize the first AI-generated wind barbs.
2.  **Gemini Conductor (Backend):** Monitor the AIFS Slicer for real-time data stability.
3.  **Integration:** Perform a full end-to-end test: Slicer -> Seed -> Mobile -> Map.

---

**Guidance for Agents:**
*   **Do not** suggest "ejecting" from Expo.
*   **Do** use `uv` for all Python operations.
*   **Do** prioritize offline-first architecture in all TS code.