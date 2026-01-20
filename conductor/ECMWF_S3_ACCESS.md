# ECMWF AWS S3 Bucket Access

## Overview
ECMWF provides free, open access to forecast data via AWS S3 bucket (`ecmwf-forecasts`) in the `eu-central-1` region. This provides faster, more reliable downloads compared to the main ECMWF HTTP endpoints.

**Key Benefits:**
- ✅ No rate limiting (vs HTTP 429 on main endpoints)
- ✅ No API credentials required
- ✅ S3 transfer acceleration available
- ✅ Direct integration with AWS tools (aws-cli, boto3, etc.)
- ✅ `.index` files available for partial downloads

## Available Data

### S3 Bucket Structure
```
https://ecmwf-forecasts.s3.amazonaws.com/
└── {YYYYMMDD}/              # Date: 20260118
    └── {RUN}z/              # Run: 00z, 06z, 12z, 18z
        ├── aifs-ens/        # AIFS Ensemble (AI model)
        │   └── 0p25/        # 0.25° (~28km)
        │       └── enfo/
        ├── aifs-single/     # AIFS Deterministic
        │   └── 0p25/
        │       └── oper/
        └── ifs/             # IFS HRES (Physics model)
            └── 0p25/        # 0.25° (~28km) - Note: 0.1° not in S3
                ├── oper/    # Operational forecast
                ├── enfo/    # Ensemble forecast
                ├── waef/    # Wave ensemble
                └── wave/    # Wave forecast
```

### File Naming Convention
```
{YYYYMMDD}{HH}{MM}{SS}-{STEP}h-{TYPE}-{STREAM}.grib2
```

**Examples:**
- `20260118000000-0h-oper-fc.grib2` - Initial conditions (T+0)
- `20260118000000-24h-oper-fc.grib2` - 24-hour forecast
- `20260118000000-240h-oper-fc.grib2` - 10-day forecast

**Companion files:**
- `.grib2` - GRIB2 data file (~100-120 MB per timestep)
- `.index` - Index file for partial downloads (<1 MB)

## Resolution Comparison

| Model | S3 Available | HTTP Available | Resolution | Grid Spacing |
|-------|--------------|----------------|------------|--------------|
| IFS HRES 9km | ❌ No | ✅ Yes | 0.1° | ~9km |
| IFS HRES 28km | ✅ Yes | ✅ Yes | 0.25° | ~28km |
| AIFS 28km | ✅ Yes | ✅ Yes | 0.25° | ~28km |

**Trade-off:**
- **S3 (0.25°):** Faster downloads, no rate limiting, but coarser resolution
- **HTTP (0.1°):** Higher resolution for coastal navigation, but rate-limited and slower

## Download Methods

### 1. Direct HTTP/HTTPS (curl)
```bash
# Download single file
curl -O "https://ecmwf-forecasts.s3.amazonaws.com/20260118/00z/ifs/0p25/oper/20260118000000-0h-oper-fc.grib2"

# Download with progress bar
curl -# -O "https://ecmwf-forecasts.s3.amazonaws.com/20260118/00z/ifs/0p25/oper/20260118000000-24h-oper-fc.grib2"

# Check file size before downloading (HEAD request)
curl -sI "https://ecmwf-forecasts.s3.amazonaws.com/20260118/00z/ifs/0p25/oper/20260118000000-0h-oper-fc.grib2" | grep -i content-length
```

### 2. AWS CLI (fastest, requires aws-cli installed)
```bash
# List available files for a run
aws s3 ls s3://ecmwf-forecasts/20260118/00z/ifs/0p25/oper/ --no-sign-request

# Download single file
aws s3 cp s3://ecmwf-forecasts/20260118/00z/ifs/0p25/oper/20260118000000-0h-oper-fc.grib2 . --no-sign-request

# Download entire run (all timesteps)
aws s3 sync s3://ecmwf-forecasts/20260118/00z/ifs/0p25/oper/ ./data/ --no-sign-request

# Download with multipart (faster for large files)
aws s3 cp s3://ecmwf-forecasts/20260118/00z/ifs/0p25/oper/20260118000000-0h-oper-fc.grib2 . \
  --no-sign-request \
  --region eu-central-1
```

### 3. Python (boto3)
```python
import boto3
from botocore import UNSIGNED
from botocore.config import Config

# Anonymous S3 client (no credentials needed)
s3 = boto3.client('s3', 
                  region_name='eu-central-1',
                  config=Config(signature_version=UNSIGNED))

# List files
response = s3.list_objects_v2(
    Bucket='ecmwf-forecasts',
    Prefix='20260118/00z/ifs/0p25/oper/',
    MaxKeys=100
)

for obj in response.get('Contents', []):
    print(f"{obj['Key']} - {obj['Size']/1e6:.1f} MB")

# Download file
s3.download_file(
    'ecmwf-forecasts',
    '20260118/00z/ifs/0p25/oper/20260118000000-0h-oper-fc.grib2',
    'local_file.grib2'
)
```

### 4. Python (requests with streaming)
```python
import requests

url = "https://ecmwf-forecasts.s3.amazonaws.com/20260118/00z/ifs/0p25/oper/20260118000000-0h-oper-fc.grib2"

# Stream download with progress
response = requests.get(url, stream=True)
total_size = int(response.headers.get('content-length', 0))

with open('output.grib2', 'wb') as f:
    downloaded = 0
    for chunk in response.iter_content(chunk_size=8192):
        f.write(chunk)
        downloaded += len(chunk)
        print(f"\rDownloaded: {downloaded/1e6:.1f}/{total_size/1e6:.1f} MB", end='')
```

## Index Files for Partial Downloads

Each `.grib2` file has a corresponding `.index` file that maps parameter locations within the GRIB2 file. This enables downloading only specific variables (e.g., U/V wind components, MSLP) instead of the entire ~100MB file.

### Index File Format (JSON Lines)

The S3 index files use **JSON Lines format** - one JSON object per line:

```json
{"domain": "g", "date": "20260119", "time": "1200", "expver": "0001", "class": "od", "type": "fc", "stream": "oper", "step": "0", "levtype": "sfc", "param": "msl", "_offset": 37624858, "_length": 528908}
{"domain": "g", "date": "20260119", "time": "1200", "expver": "0001", "class": "od", "type": "fc", "stream": "oper", "step": "0", "levtype": "sfc", "param": "10u", "_offset": 73427469, "_length": 871707}
{"domain": "g", "date": "20260119", "time": "1200", "expver": "0001", "class": "od", "type": "fc", "stream": "oper", "step": "0", "levtype": "sfc", "param": "10v", "_offset": 76633662, "_length": 865035}
```

**Key Fields:**
- `param` - Parameter short name (e.g., `"10u"`, `"10v"`, `"msl"`, `"2t"`)
- `levtype` - Level type (`"sfc"` = surface, `"pl"` = pressure level, etc.)
- `levelist` - Level value (e.g., `"1000"` for 1000 hPa) - only for pressure levels
- `_offset` - Byte offset in GRIB2 file where this parameter starts
- `_length` - Length in bytes of this parameter's data
- `step` - Forecast step (e.g., `"0"`, `"3"`, `"6"`, etc.)
- `date`, `time` - Reference date and time

**Common Marine Parameters:**
- `10u` - U-component of wind at 10m above surface
- `10v` - V-component of wind at 10m above surface
- `msl` - Mean sea level pressure
- `2t` - 2m temperature
- `fg10` - Wind gust at 10m
- `swh` - Significant wave height (in wave files)
- `mwd` - Mean wave direction (in wave files)

### Partial Download Example
```python
import requests
import json

# 1. Download index file
index_url = "https://ecmwf-forecasts.s3.amazonaws.com/20260119/12z/ifs/0p25/oper/20260119120000-0h-oper-fc.index"
index_response = requests.get(index_url)

# 2. Parse JSON Lines format to find wind parameters
params = {}
for line in index_response.text.strip().split('\n'):
    entry = json.loads(line)
    param_name = entry['param']
    levtype = entry['levtype']
    key = f"{param_name}:{levtype}"
    params[key] = {
        'offset': entry['_offset'],
        'length': entry['_length']
    }

# 3. Download only wind data using HTTP Range header
grib_url = "https://ecmwf-forecasts.s3.amazonaws.com/20260119/12z/ifs/0p25/oper/20260119120000-0h-oper-fc.grib2"

# Download U-component (10u)
u_wind = params['10u:sfc']
start = u_wind['offset']
end = start + u_wind['length'] - 1
headers = {'Range': f'bytes={start}-{end}'}
u_data = requests.get(grib_url, headers=headers).content
print(f"Downloaded {len(u_data)/1e6:.2f} MB (vs ~118 MB for full file)")
# Output: Downloaded 0.87 MB (vs ~118 MB for full file)

# Download V-component (10v)
v_wind = params['10v:sfc']
start = v_wind['offset']
end = start + v_wind['length'] - 1
headers = {'Range': f'bytes={start}-{end}'}
v_data = requests.get(grib_url, headers=headers).content

# Download mean sea level pressure (msl)
mslp = params['msl:sfc']
start = mslp['offset']
end = start + mslp['length'] - 1
headers = {'Range': f'bytes={start}-{end}'}
mslp_data = requests.get(grib_url, headers=headers).content

# Total: ~2.3 MB downloaded vs ~118 MB for full file (98% reduction)
```

## Performance Considerations

### File Sizes (IFS 0.25° operational)
- Single timestep: ~100-120 MB (full GRIB2 file)
- Single surface parameter (10u, 10v, msl): ~0.5-0.9 MB each
- 10-day forecast (240h): ~80 files = ~8-10 GB (full)
- With 3-hour steps (0h, 3h, 6h...240h): 81 timesteps

### Bandwidth Usage
- **Full download** (all parameters, all levels): ~118 MB per timestep
- **Marine surface parameters only** (10u, 10v, msl, 2t): ~2.3 MB per timestep (98% reduction)
- **10-day forecast:**
  - Full: ~10 GB
  - Surface only: ~200 MB
- **Monthly (2x daily runs):**
  - Full: ~600 GB
  - Surface only: ~12 GB (98% reduction)

### Recommendations
1. **Use index files** to download only needed parameters
2. **Use AWS CLI** in `eu-central-1` region for fastest downloads
3. **Cache downloads** - files are immutable once published
4. **Filter timesteps** - Only download needed forecast hours (e.g., 0-120h instead of 0-240h)

## Integration with Mariners AI Grid

### Current Slicer Implementation
The `conductor/slicer.py` downloads from HTTP endpoints:
```python
# Current: HTTP endpoint (rate-limited, 0.1° available)
url = f"https://data.ecmwf.int/forecasts/{date}/{run}/ifs/0p1/{filename}"
```

### Recommended S3 Integration
```python
# Option 1: Direct S3 HTTP (no dependencies)
url = f"https://ecmwf-forecasts.s3.amazonaws.com/{date}/{run}z/ifs/0p25/oper/{filename}"

# Option 2: boto3 with parallel downloads
import boto3
from concurrent.futures import ThreadPoolExecutor

s3 = boto3.client('s3', config=Config(signature_version=UNSIGNED))

def download_timestep(step_hour):
    key = f"{date}/{run}z/ifs/0p25/oper/{date}{run}0000-{step_hour}h-oper-fc.grib2"
    s3.download_file('ecmwf-forecasts', key, f"data/{step_hour}h.grib2")

with ThreadPoolExecutor(max_workers=4) as executor:
    executor.map(download_timestep, range(0, 241, 3))
```

### Resolution Trade-off Decision
Since S3 only provides 0.25° (28km) data:
- **For open ocean:** S3 0.25° is sufficient and much faster
- **For coastal navigation:** Use HTTP 0.1° despite rate limits
- **Hybrid approach:** Download global 0.25° from S3, refine coastal regions with 0.1° HTTP on-demand

## Testing S3 Access

```bash
# Test 1: List latest run
aws s3 ls s3://ecmwf-forecasts/$(date -u +%Y%m%d)/00z/ifs/0p25/oper/ --no-sign-request | head

# Test 2: Download small index file
curl -O "https://ecmwf-forecasts.s3.amazonaws.com/20260118/00z/ifs/0p25/oper/20260118000000-0h-oper-fc.index"

# Test 3: Check file metadata (no download)
curl -sI "https://ecmwf-forecasts.s3.amazonaws.com/20260118/00z/ifs/0p25/oper/20260118000000-0h-oper-fc.grib2"

# Test 4: Download first 10MB to verify accessibility
curl -r 0-10485760 "https://ecmwf-forecasts.s3.amazonaws.com/20260118/00z/ifs/0p25/oper/20260118000000-0h-oper-fc.grib2" -o test_sample.grib2
```

## License & Attribution
- **License:** CC-BY-4.0 (Creative Commons Attribution)
- **Attribution required:** Yes - credit ECMWF in any derivative products
- **Commercial use:** Allowed
- **Access policy:** Open data, no credentials required (as of October 2025)

## References
- S3 Bucket: `s3://ecmwf-forecasts` (region: `eu-central-1`)
- HTTP Endpoint: `https://ecmwf-forecasts.s3.amazonaws.com/`
- ECMWF Open Data: https://www.ecmwf.int/en/forecasts/datasets/open-data
- AWS S3 API: https://docs.aws.amazon.com/s3/
