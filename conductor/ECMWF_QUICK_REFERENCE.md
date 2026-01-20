# ECMWF Data Sources - Quick Reference

## Model Comparison

| Model | Resolution | S3 Access | HTTP Access | Updates | Forecast | Best For |
|-------|------------|-----------|-------------|---------|----------|----------|
| **IFS HRES** | 9 km native | ❌ No | ✅ Yes (rate-limited) | Every 6h | 15 days | Coastal navigation, high accuracy |
| **IFS Open-Data** | 0.25° (~25km) | ✅ Yes | ✅ Yes | Every 6h | 15 days | Open ocean, bulk downloads |
| **AIFS Single** | 0.25° (~28km) | ✅ Yes | ✅ Yes | Every 6h | 15 days | AI-based alternative |

## Quick Decision Tree

```
Need weather data?
│
├─ Coastal/harbor navigation (9km resolution)?
│   └─ Use Open-Meteo API (ECMWF HRES, no rate limits!) ⭐
│
├─ Open ocean routing (25km sufficient)?
│   └─ Use Official ECMWF API with Azure mirror
│
└─ Large-scale gridded analysis?
    ├─ Open ocean: S3 direct access with index files
    └─ Coastal: Open-Meteo grid queries
```

## Recommended: Official Python API (No Rate Limits)

**Package:** `ecmwf-opendata` (uses Azure/AWS/Google mirrors)

### Install
```bash
uv pip install ecmwf-opendata
```

### Quick Download
```bash
# Download marine surface params from Azure mirror (no rate limits!)
cd conductor
uv run ecmwf_downloader.py --params 10u,10v,msl

# Download 0.1° (9km) high-res from Azure
uv run ecmwf_downloader.py --resolution 0.1 --params 10u,10v,msl

# Download multiple timesteps (0-120h every 3h)
uv run ecmwf_downloader.py --steps 0:120:3 --params 10u,10v --output-dir ./data/
```

### Python Example
```python
from ecmwf.opendata import Client

# Use Azure mirror to avoid rate limits
client = Client(source="azure")

client.retrieve(
    date=-1,           # Yesterday (today's run may not be ready)
    time=12,           # 12z run
    step=24,           # T+24h forecast
    type="fc",         # Forecast
    param=["10u", "10v", "msl"],
    target="forecast.grib2",
    resol="0p25"       # 0.25° resolution (or "0p1" for 9km)
)
# Downloaded: ~2.3 MB (vs ~118 MB for full file)
```

## S3 Access (IFS Open-Data)

**Bucket:** `s3://ecmwf-forecasts` (region: `eu-central-1`)
**Note:** Official API (above) is recommended - easier and uses same cloud mirrors

### Direct HTTP Download
```bash
# Single file (T+0, today 12z run)
curl -O "https://ecmwf-forecasts.s3.amazonaws.com/$(date -u +%Y%m%d)/12z/ifs/0p25/oper/$(date -u +%Y%m%d)120000-0h-oper-fc.grib2"

# Just the index file (< 1 MB)
curl -O "https://ecmwf-forecasts.s3.amazonaws.com/$(date -u +%Y%m%d)/12z/ifs/0p25/oper/$(date -u +%Y%m%d)120000-0h-oper-fc.index"
```

### Partial Download (Marine Surface Params Only)
```python
import requests, json

# Download index
idx_url = "https://ecmwf-forecasts.s3.amazonaws.com/20260119/12z/ifs/0p25/oper/20260119120000-0h-oper-fc.index"
params = {json.loads(line)['param']+':'+json.loads(line)['levtype']: 
          (json.loads(line)['_offset'], json.loads(line)['_length'])
          for line in requests.get(idx_url).text.strip().split('\n')}

# Download only U-wind (10u)
grib_url = "https://ecmwf-forecasts.s3.amazonaws.com/20260119/12z/ifs/0p25/oper/20260119120000-0h-oper-fc.grib2"
offset, length = params['10u:sfc']
headers = {'Range': f'bytes={offset}-{offset+length-1}'}
data = requests.get(grib_url, headers=headers).content
# Result: ~0.87 MB vs ~118 MB for full file
```

## HTTP Access (IFS HRES - 9km)

**Endpoint:** `https://data.ecmwf.int/forecasts/`

### Download Example
```bash
# 9km HRES data (rate-limited - expect HTTP 429)
DATE=$(date -u +%Y%m%d)
RUN="00"
curl -O "https://data.ecmwf.int/forecasts/${DATE}/${RUN}/ifs/0p1/${DATE}${RUN}0000-0h-oper-fc.grib2"
```

**Note:** Expect rate limiting (HTTP 429). Use S3 for bulk downloads.

## Bandwidth Comparison

### Single Timestep
- **Full GRIB2:** ~118 MB
- **Marine surface only** (10u, 10v, msl, 2t): ~2.3 MB (98% reduction)

### 15-Day Forecast (86 timesteps)
- **Full:** ~10 GB
- **Surface only:** ~200 MB

### Monthly (120 runs)
- **Full:** ~1.2 TB
- **Surface only:** ~24 GB (98% reduction)

## Common Parameters

| Parameter | Description | Level | Size |
|-----------|-------------|-------|------|
| `10u` | U-component of wind at 10m | Surface | ~0.87 MB |
| `10v` | V-component of wind at 10m | Surface | ~0.87 MB |
| `msl` | Mean sea level pressure | Surface | ~0.53 MB |
| `2t` | Temperature at 2m | Surface | ~0.68 MB |
| `fg10` | Wind gust at 10m | Surface | ~0.85 MB |
| `swh` | Significant wave height | Surface | ~0.52 MB |
| `mwd` | Mean wave direction | Surface | ~0.48 MB |

## Temporal Resolution

| Model | 0-90h | 90-144h | 144-360h |
|-------|-------|---------|----------|
| IFS HRES | 1-hourly | 3-hourly | 6-hourly |
| IFS Open-Data | 3-hourly | 3-hourly | 6-hourly |
| AIFS Single | 6-hourly | 6-hourly | 6-hourly |

## Update Schedule

All models update **4 times daily:**
- 00z (midnight UTC)
- 06z (6am UTC)
- 12z (noon UTC)
- 18z (6pm UTC)

**Latency:** ~6-7 hours (e.g., 00z run available around 06z-07z)

## License

**CC-BY-4.0** (Creative Commons Attribution)
- ✅ Free for commercial use
- ✅ No API credentials required
- ⚠️  Attribution required: Credit ECMWF in derivative products

## Testing

```bash
# Test S3 access
python3 conductor/tests/test_ecmwf_s3.py

# Quick curl test
curl -sI "https://ecmwf-forecasts.s3.amazonaws.com/20260119/12z/ifs/0p25/oper/20260119120000-0h-oper-fc.grib2" | grep -i "content-length\|last-modified"
```

## References

- **Full documentation:** `conductor/ECMWF_S3_ACCESS.md`
- **Test script:** `conductor/tests/test_ecmwf_s3.py`
- **Open-Meteo API docs:** https://open-meteo.com/
- **ECMWF Open Data:** https://www.ecmwf.int/en/forecasts/datasets/open-data
