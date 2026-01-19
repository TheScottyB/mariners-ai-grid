# Data Access: ECMWF AIFS (AI Integrated Forecasting System)

**Source of Truth for Mariner's AI Grid Data Ingest**

## Overview
The Mariner's AI Grid Slicer primarily relies on the **ECMWF AIFS** model. This is a data-driven forecast model (AI-based) that competes with traditional physics-based HRES models but is computationally faster and often more accurate for certain metrics.

## Access Policy
*   **License:** Creative Commons CC-BY-4.0 (Free, Open).
*   **Authentication:** **No API key is required** for the `ecmwf-opendata` client.
    *   *Note:* The legacy `cdsapi` requires a key, but for real-time AIFS open data, we use the open bucket access.

## Technical Details

### 1. Library
We use the `ecmwf-opendata` Python package (added to `pyproject.toml`).
```python
from ecmwf.opendata import Client
client = Client("ecmwf", model="aifs-single")
```

### 2. Model Specifications
*   **Model Name:** `aifs-single` (Deterministic) or `aifs-ens` (Ensemble).
*   **Resolution:** 0.25° (approx 28km).
*   **Update Frequency:** 4x Daily (00Z, 06Z, 12Z, 18Z).
*   **Forecast Horizon:** 0 to 360 hours (15 days).
*   **Format:** GRIB2.

### 3. Usage in Slicer
The `ECMWFHRESSlicer` class will be refactored to support an `AIFSClient` adapter that preferentially fetches from this open source before falling back to the slower/restricted CDS API.

## Code Example (Snippet)

```python
from ecmwf.opendata import Client

def fetch_aifs_sample():
    client = Client(source="ecmwf", model="aifs-single")
    client.retrieve(
        date=0,      # Today
        time=0,      # 00Z run
        step=24,     # +24h forecast
        type="fc",
        param=["msl", "10u", "10v"],
        target="aifs_sample.grib2"
    )
```

## Why this matters for the MVP
1.  **Cost:** Free (vs. paid commercial API).
2.  **Speed:** Direct download from Azure/AWS open buckets is significantly faster than the CDS queue system.
3.  **Simplicity:** No user registration required for the end-user (though we proxy this via the Slicer).
