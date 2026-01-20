# ECMWF 9km HRES Quick Start Guide

## Why 9km Resolution Matters for Maritime Use

**9km (HRES)** vs **28km (AIFS)** comparison:

| Aspect | HRES 9km ✅ | AIFS 28km |
|--------|------------|-----------|
| Coastal wind gradients | ✅ Resolved | ⚠️ Smoothed |
| Island wake effects | ✅ Visible | ❌ Missing |
| Harbor approaches | ✅ Accurate | ⚠️ Approximate |
| Squall lines | ✅ Detailed | ⚠️ Generalized |
| Data latency | ~3-4 hours | ~1-2 hours |
| Update frequency | 2x daily | 4x daily |

**Bottom line**: Use HRES 9km for navigation, AIFS 28km for long-range planning.

---

## Access URLs

### HRES 9km (0.1° resolution)
```
https://data.ecmwf.int/forecasts/YYYYMMDD/HHz/ifs/0p1/YYYYMMDD{HH}0000-{step}h-oper-fc.grib2
```

### AIFS 28km (0.25° resolution) - Fallback
```
https://data.ecmwf.int/forecasts/YYYYMMDD/HHz/aifs/0p25/YYYYMMDD{HH}0000-{step}h-oper-fc.grib2
```

**Parameters:**
- `YYYYMMDD`: Date (e.g., 20260119)
- `HH`: Run time (00 or 12 for HRES; 00, 06, 12, 18 for AIFS)
- `{step}`: Forecast hour (6, 12, 18, 24, ...)

---

## Python Example

```python
from ecmwf.opendata import Client

# Initialize for HRES 9km
client = Client(source="ecmwf", model="ifs", resol="hres")

# Fetch Pacific crossing forecast
client.retrieve(
    date=0,          # Today's run
    time=0,          # 00Z
    step=[6, 12, 18, 24, 30, 36],  # 6-hourly out to 36h
    type="fc",
    param=[
        "10u", "10v",    # Wind components at 10m
        "msl",           # Mean sea level pressure
        "swh",           # Significant wave height
        "mwd",           # Mean wave direction
        "mwp",           # Mean wave period
    ],
    target="pacific_9km.grib2"
)
```

---

## Curl Example

```bash
# Download latest 00Z run, +6h forecast, 9km resolution
DATE=$(date -v-1d +%Y%m%d)  # Yesterday (data has ~1 day lag)

curl -o hres_9km.grib2 \
  "https://data.ecmwf.int/forecasts/${DATE}/00z/ifs/0p1/${DATE}000000-6h-oper-fc.grib2"
```

---

## Marine Variables (HRES 9km)

| Param | Description | Units | Priority |
|-------|-------------|-------|----------|
| `10u` | 10m U-wind (eastward) | m/s | ⭐⭐⭐ Critical |
| `10v` | 10m V-wind (northward) | m/s | ⭐⭐⭐ Critical |
| `msl` | Mean sea level pressure | Pa | ⭐⭐⭐ Critical |
| `swh` | Significant wave height | m | ⭐⭐⭐ Critical |
| `mwd` | Mean wave direction | degrees | ⭐⭐ Important |
| `mwp` | Mean wave period | s | ⭐⭐ Important |
| `gust` | Wind gust speed | m/s | ⭐ Useful |
| `tp` | Total precipitation | m | ⭐ Useful |

---

## File Size Estimates

**Single timestep, all marine variables:**
- HRES 9km: ~500KB (single parameter) to ~5MB (all marine params)
- AIFS 28km: ~150KB (single parameter) to ~1.5MB (all marine params)

**72-hour forecast, 6-hourly steps (12 timesteps):**
- HRES 9km: ~60MB (all params, uncompressed GRIB2)
- After Mariner's Grid slicing (500nm radius): ~2-5MB compressed seed

---

## Testing

```bash
# Test access with curl
./scripts/test_ecmwf_curl.sh

# Test Python client
cd conductor
python tests/test_ecmwf_access.py

# Generate real 9km seed
cd conductor
uv run mag-slicer slice --lat 30 --lon -140 --radius 500 --resolution 9km
```

---

## Production Recommendations

1. **Always try HRES 9km first** for offshore passages
2. **Fall back to AIFS 28km** if:
   - HRES run is delayed (check after 4 hours from run time)
   - You need 4x daily updates (AIFS has 06Z and 18Z)
   - Forecast range >10 days required
3. **Cache aggressively** - HRES data doesn't change once published
4. **Retry with exponential backoff** - ECMWF rate limits are real

---

## No Credentials Required ✅

As of **October 2025**, all ECMWF open data (HRES and AIFS) is:
- ✅ No API key needed
- ✅ No registration required
- ✅ Direct HTTP downloads
- ✅ Free under CC-BY-4.0 license

**Authentication has been removed** - this is production-ready for the Mariner's AI Grid.
