# Technology Stack

## Frontend (Mobile App)
- **Framework:** React Native (Latest, React 19+) with Expo SDK 54 (Managed Workflow + CNG).
- **Language:** TypeScript.
- **Styling:** NativeWind (Tailwind CSS).
- **Maps:** Mapbox GL Native.
- **State/Identity:** "Shadow Auth" (Anonymous device-level identity) via `expo-secure-store`.

## Backend ("The Conductor" / Slicer)
- **Runtime:** Python 3.12+ (managed by `uv`).
- **Orchestration:** Docker Compose.
- **Core Libraries:** ECMWF AIFS data processing, `xarray`, `numpy`.
- **Compression:** Zstandard (zstd).

## Data & Storage (Local-First)
- **Database:** `op-sqlite` (High-performance SQLite) + `vlasky/sqlite-vec` (v0.2.4-alpha).
- **Access Pattern:** Synchronous JSI (JavaScript Interface) for zero-latency vector search.
- **Serialization:**
    -   **Protobuf (`.proto`):** Structured data.
    -   **Parquet:** Gridded weather data (superior dictionary encoding).

## Development Tools
- **Package Manager:** `pnpm` (JavaScript), `uv` (Python).
- **Testing:** `vitest`.
- **CI/CD:** GitHub Actions (implied standard).