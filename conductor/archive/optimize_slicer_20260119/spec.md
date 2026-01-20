# Track Specification: Optimize Slicer for ECMWF AIFS Open Data & Parquet Export

## 1. Goal
To refine the "Cloud Slicer" backend (Python) to fully integrate the ECMWF AIFS (AI Integrated Forecasting System) Open Data stream, implement efficient spatial cropping, and finalize the transition to Parquet serialization for maximum data compression (beating the Protobuf baseline). This directly supports the "Extreme Data Efficiency" value proposition.

## 2. Context
The "Pacific Seed" audit confirmed that Parquet outperforms Protobuf for our specific gridded weather data needs (2.1 MB vs 2.5 MB). The Slicer currently exists in a scaffolded state. We need to move from "scaffolding" to a robust, production-ready pipeline that can ingest the massive 10GB global files, slice them on-demand, and output the optimized Parquet "Seeds".

## 3. Requirements

### Functional Requirements
*   **Data Ingestion:** Reliable ingestion of ECMWF AIFS GRIB2 data via the Open Data API.
*   **Spatial Slicing:** Accurate cropping of global data to a user-defined bounding box (e.g., 500nm radius) with a 2.5-degree buffer to prevent edge artifacts.
*   **Variable Pruning:** Ability to filter variables, keeping only essential fields for the "Chart Table" (Wind, Pressure, Wave Height).
*   **Serialization:** Output data in **Parquet** format with Zstandard (zstd) compression.
*   **Quantization:** Apply lossy compression techniques validated in the audit:
    *   Wind Speed: 0.5kt precision.
    *   Wind Direction: 5° precision.

### Non-Functional Requirements
*   **Performance:** Slicing operation should complete in < 30 seconds for a typical request.
*   **Size Target:** The final "Seed" for a 72-hour regional forecast must be < 2.5 MB.
*   **Reliability:** Robust error handling for upstream ECMWF API failures.

## 4. Out of Scope
*   Mobile app integration (this is a separate track).
*   Signal K integration.
*   User authentication or billing.

## 5. Proposed Solution
*   Refactor `conductor/slicer.py` and related modules to prioritize `xarray` + `pandas` (Parquet engine) over raw Protobuf construction.
*   Implement a dedicated `QuantizationConfig` class to manage variable-specific precision settings.
*   Create a `SeedBuilder` class that orchestrates the Fetch -> Slice -> Prune -> Quantize -> Serialize pipeline.
*   Add integration tests using a local sample of AIFS data to verify output size and integrity.
