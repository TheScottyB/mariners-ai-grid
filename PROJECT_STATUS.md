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
*   **State Management:** TanStack Query (server/weather state) + Zustand (client UI state).
*   **Maps:** Mapbox GL Native (`@rnmapbox/maps`).
*   **Storage:** `expo-sqlite/vec` (Vector storage for social hazards), Parquet (Weather Seeds).

### **B. The Conductor (Backend/Slicer)**
*   **Language:** Python 3.12+ (Managed via `uv`).
*   **Core Role:** Downloads ECMWF HRES data, slices it to a 500nm radius, prunes variables, and compresses it for satellite transmission.
*   **Key Libraries:** `xarray`, `cfgrib`, `zstandard`, `protobuf`, `pyarrow`.
*   **Output:** `.seed.zst` files (High-efficiency payloads).

### **C. The Bridge (Hardware)**
*   **Protocol:** Signal K (WebSocket) over NMEA 2000.
*   **Function:** Ingests local boat sensors (Wind, Barometer, GPS) to "ground truth" the AI model.

---

## 3. Current Implementation Status

### ✅ **Completed**
*   **Project Structure:** Monorepo-style setup established (`app/` for mobile, `conductor/` for backend).
*   **Dependency Management:** Migrated Python tooling to `uv` for speed and determinism.
*   **The Slicer (Prototype):**
    *   Functional `ECMWFHRESSlicer` logic.
    *   `BoundingBox` and `VariablePruner` logic implemented.
    *   Export support for **Parquet** and **Protobuf+Zstd**.
    *   CLI tool (`mag-slicer`) operational.
*   **Testing:** Full test suite for the Slicer is passing (including fixed Protobuf roundtrip fidelity).

### 🚧 **In Progress**
*   **Mobile App Scaffold:** Initial Expo setup (pending UI implementation).
*   **AI Model Integration:** GraphCast ONNX runtime scaffolding.

---

## 4. 90-Day Roadmap

| Phase | Duration | Focus | Key Deliverables |
| :--- | :--- | :--- | :--- |
| **Phase 1** | **Days 1-15** | **Data Ingest (Conductor)** | Automated ECMWF AIFS/HRES download & Slicer optimization. (✅ *In Progress*) |
| **Phase 2** | **Days 16-30** | **The Slicer (Refinement)** | Maximize compression ratios (<5MB goal), edge-case handling. |
| **Phase 3** | **Days 31-60** | **The App (Frontend)** | Expo UI, Mapbox integration, reading `.seed.zst` files locally. |
| **Phase 4** | **Days 61-90** | **The Bridge (Hardware)** | Signal K integration, "Data Freshness" UI, Social reporting. |

---

## 5. Next Immediate Actions (for AI Agents)

1.  **Claude Code (Mobile):** Begin scaffolding the React Native UI. Focus on the "Map View" and "Route Planning" screens using the design principles defined in `app.json`.
2.  **Gemini Conductor (Backend):** Refine the `slicer.py` logic to handle real ECMWF API tokens and implement the "Data Freshness" metadata tagging.
3.  **Integration:** Create a shared schema (Protobuf definitions) that both the Python backend and TypeScript frontend adhere to for Seed parsing.

---

**Guidance for Agents:**
*   **Do not** suggest "ejecting" from Expo.
*   **Do** use `uv` for all Python operations.
*   **Do** prioritize offline-first architecture in all TS code.
