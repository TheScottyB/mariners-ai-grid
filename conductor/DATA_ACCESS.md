# Data Access: ECMWF Open Data

**Source of Truth for Mariner's AI Grid Data Ingest**

## Overview
The Mariner's AI Grid Slicer uses **ECMWF HRES** (High Resolution) at **9km native resolution** as the primary data source for maritime weather forecasting. This provides the highest fidelity for coastal and offshore navigation.

### Resolution Priority
1. **HRES 9km** (Primary) - Physics-based, highest accuracy for marine
2. **AIFS 28km** (Fallback) - AI-based, faster updates, good for long-range

**Why 9km matters for mariners:**
- Resolves coastal wind gradients and island effects
- Captures localized wave states in coastal waters
- Better represents mesoscale phenomena (sea breezes, squalls)
- Critical for safe harbor approaches and narrow passages

## Access Policy (Updated October 2025)
*   **License:** Creative Commons CC-BY-4.0 (Free, Open).
*   **Authentication:** ✅ **NO API KEY REQUIRED** (as of October 2025)
    *   ECMWF AIFS data is now **fully open access**
    *   Direct HTTP/HTTPS downloads work without credentials
    *   Python `ecmwf-opendata` client requires **zero configuration**
    *   Legacy `cdsapi` is **deprecated** for AIFS data

## Technical Details

### 1. Library
We use the `ecmwf-opendata` Python package (added to `pyproject.toml`).
```python
from ecmwf.opendata import Client
client = Client("ecmwf", model="aifs-single")
```

### 2. Model Specifications

#### HRES (Primary - 9km)
*   **Model Name:** `ifs-hres` (Deterministic High Resolution)
*   **Resolution:** 0.1° (~9km native resolution)
*   **Update Frequency:** 2x Daily (00Z, 12Z)
*   **Forecast Horizon:** 0 to 240 hours (10 days)
*   **Format:** GRIB2
*   **Best for:** Offshore passages, coastal navigation, harbor approaches

#### AIFS (Fallback - 28km)
*   **Model Name:** `aifs` (AI Integrated Forecasting System)
*   **Resolution:** 0.25° (~28km)
*   **Update Frequency:** 4x Daily (00Z, 06Z, 12Z, 18Z)
*   **Forecast Horizon:** 0 to 360 hours (15 days)
*   **Format:** GRIB2
*   **Best for:** Long-range planning, open ocean

### 3. Usage in Slicer
The `ECMWFHRESSlicer` class will be refactored to support an `AIFSClient` adapter that preferentially fetches from this open source before falling back to the slower/restricted CDS API.

## Code Examples

### Fetch HRES 9km Data (Primary)
```python
from ecmwf.opendata import Client

def fetch_hres_9km():
    """Fetch high-resolution (9km) marine forecast"""
    client = Client(source="ecmwf", model="ifs", resol="hres")
    client.retrieve(
        date=0,      # Today
        time=0,      # 00Z run
        step=24,     # +24h forecast
        type="fc",
        param=["10u", "10v", "msl", "swh", "mwd", "mwp"],
        target="hres_9km.grib2"
    )
```

### Fetch AIFS 28km Data (Fallback)
```python
def fetch_aifs_28km():
    """Fallback to AI model for extended range or faster updates"""
    client = Client(source="ecmwf", model="aifs")
    client.retrieve(
        date=0,
        time=0,
        step=24,
        type="fc",
        param=["10u", "10v", "msl"],
        target="aifs_28km.grib2"
    )
```

## Why this matters for the MVP
1.  **Cost:** Free (vs. paid commercial API).
2.  **Speed:** Direct download from Azure/AWS open buckets is significantly faster than the CDS queue system.
3.  **Simplicity:** No user registration required for the end-user (though we proxy this via the Slicer).
