# Mariner's AI Grid - Context & Instruction Guide

## 🏴‍☠️ Project Overview: The "Maverick" Architecture
**Mariner's AI Grid (MAG)** is an offline-first, agentic weather platform built for deep-water navigation. It rejects the "Cloud-First" orthodoxy, treating the vessel as a sovereign compute node.

*   **Core Philosophy:** "Sovereign AI." The boat must be able to predict weather, detect hazards, and search historical patterns without any satellite connection.
*   **The "Circular Truth" Loop:**
    1.  **Slicer (Cloud):** Compresses 10GB global models into <5MB regional "Seeds".
    2.  **Seed (Transport):** Delivers high-res data via minimal satellite bandwidth (Parquet/Protobuf).
    3.  **Inference (Boat):** Runs GraphCast AI locally on the NPU.
    4.  **Bridge (Truth):** Validates AI against real-time NMEA 2000 sensors.

## 🛠️ Tech Stack & Key Conventions

### Mobile App (The "Watchkeeper")
*   **Framework:** Expo SDK 54 (Managed Workflow + Continuous Native Generation).
*   **Language:** TypeScript (Strict Mode).
*   **Minimum Requirements:**
    *   **iOS:** 16.0+ (iPhone 11 / A13 Bionic minimum, iPhone 12 / A14+ recommended)
    *   **Android:** API 26+ (Android 8.0, Snapdragon 865+ / arm64-v8a only)
    *   **Rationale:** Edge AI inference (GraphCast ONNX, CoreML), Live Activities, and modern iOS 16+ APIs
*   **Vector DB:** `sqlite-vec` (Native Extension via Custom Plugin).
    *   *Note:* We use a custom plugin (`plugins/with-sqlite-vec`) to bundle the static library for true offline capability, rather than relying on Expo's default dynamic loading.
*   **Maps:** `@rnmapbox/maps` (v11+) with offline vector tiles.
*   **State:** TanStack Query (Data) + Zustand (UI).

### The Conductor (Backend/Slicer)
*   **Engine:** Python 3.12+ (managed by `uv`).
*   **Data Source:** ECMWF AIFS (Open Data, Oct 1 2025).
    *   **Resolution:** 0.1° (~9km) native fetch.
*   **Logic:** `xarray` for multidimensional slicing, `eccodes` for GRIB handling.
*   **Compression:** Zstandard + Bit-shaving (Quantization) -> Parquet/Protobuf.

## 📂 Directory Map

| Path | Purpose | Key Files |
| :--- | :--- | :--- |
| **`conductor/`** | Python Backend & Slicer | `slicer/aifs.py` (Data Fetch), `slicer/variables.py` (Pruning Logic) |
| **`src/services/`** | Core Business Logic | `VecDB.ts` (Hybrid Query), `MarinerInference.ts` (NPU Engine), `SignalKBridge.ts` |
| **`src/components/`** | UI Components | `PatternAlert.tsx` (Liquid Glass UI), `MarinerMap.tsx` |
| **`plugins/`** | Expo Config Plugins | `with-sqlite-vec/withSqliteVec.js` (Native Build Logic) |
| **`scripts/`** | Automation | `deploy_fleet.sh` (EAS Build), `SeedUploader.ts` |

## 🧠 Key Logic & "Secret Sauce"

### 1. The Hybrid Query (`VecDB.ts`)
We don't just search vectors. We combine **Geospatial Filtering** with **Vector Similarity**:
```sql
SELECT ... FROM atmospheric_patterns
WHERE lat BETWEEN ? AND ?  -- Phase 1: Fast Geo Filter
AND vec_distance_cosine(...) < ? -- Phase 2: Vector Search
```
This enables "Vibe Search" ("Show me storms like this one nearby") without scanning the entire global database.

### 2. The Pacific Seed Audit (`conductor/slicer/`)
Our quantization strategy is "Perfectly Tuned" for maritime use:
*   **Wind:** 0.5kt precision (15% compression gain).
*   **Direction:** 5° precision (20% compression gain).
*   **Result:** 10GB Global GRIB -> **2.1 MB** Regional Seed.

### 3. Open Data Advantage (`slicer/aifs.py` & `slicer/ifs.py`)
Leverages the Oct 1, 2025 ECMWF Open Data transition.
*   **IFS HRES:** Provides the native **9km resolution** physics-based baseline. Best for tactical high-res navigation.
*   **AIFS:** Provides the **28km resolution** AI-driven model. Best for fast global trends and hurricane tracking.
*   **AIFS-ENS:** Provides the **Ensemble AI** model. Best for probabilistic risk assessment ("30% chance of gale").
*   **Fallback:** If `00Z` run is missing, automatically falls back to `12Z` (Yesterday).

## 🚀 Common Workflows

### Running the Slicer (Backend)
```bash
cd conductor
uv run mag-slicer slice --lat 34.0 --lon -119.0 --radius 100 --hours 24 --offline
```
*Use `--offline` for mock data generation if live ECMWF data is unavailable.*

### Building the Fleet (Mobile)
```bash
# Requires EXPO_PUBLIC_MAPBOX_TOKEN
./scripts/deploy_fleet.sh
```
*Select option 2 for "Foundation Fleet" (Ad Hoc build).*

### Mobile Development
```bash
npx expo start
```
*Note: Native modules (sqlite-vec) require a Development Build or Simulator, not Expo Go.*

## ⚠️ Critical "Gotchas"
1.  **Time Context:** Project launched January 2026. If this seems like the future, verify your system time is correct.
2.  **Native Rebuilds:** If you modify `plugins/with-sqlite-vec`, you **MUST** run `npx expo prebuild --clean` to regenerate the native project.
3.  **Environment Variables:** `EXPO_PUBLIC_MAPBOX_TOKEN` is mandatory for the map to render. Copy `.env.example` to `.env` and add your Mapbox keys before building.
