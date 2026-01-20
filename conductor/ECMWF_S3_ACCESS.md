# ECMWF Open Data - S3 Access Guide

The Mariner's AI Grid Slicer now supports direct access to the **ECMWF Open Data S3 Bucket**, providing high-performance, cost-free weather data retrieval.

## Bucket Information
* **Name**: `ecmwf-forecasts`
* **Region**: `us-east-1` (hosted by AWS Open Data Program)
* **URL**: `https://ecmwf-forecasts.s3.amazonaws.com`
* **License**: CC-BY-4.0

## Directory Structure
```
/{YYYYMMDD}/{HHz}/{model}/{resolution}/{stream}/{filename}
```
* **Date**: `20260119`
* **Run Time**: `00z`, `06z`, `12z`, `18z`
* **Model**: `ifs`, `aifs`
* **Resolution**: `0p25` (Confirmed available), `0p4-beta`
* **Stream**: `oper`, `enfo`, `scda`

## Why S3?
1. **Zero Cost**: Data transfer within AWS is free, and public access is open.
2. **Byte-Range Requests**: Supports `Accept-Ranges`, allowing the Slicer to grab specific variables (e.g., only wind U/V) without downloading the full 100MB+ GRIB file.
3. **Index Files**: Every `.grib2` file has a corresponding `.index` JSON file containing offsets and lengths for each message.

## Usage Example (Python)
```python
from slicer.s3_provider import S3DataProvider

provider = S3DataProvider()
url = provider.get_grib_url(date, "12z", "ifs", "0p25", "oper", 0)
index = provider.get_index(url)

# Find wind components
u10_info = next(m for m in index if m['param'] == '10u')
provider.download_range(url, u10_info['_offset'], u10_info['_length'], "wind_u.grib2")
```

## Status: 0.1° (9km) Resolution

⚠️ **Note**: As of current verification, the `0p1` resolution is **not available** in the public S3 bucket. The system defaults to `0p25` (28km) for all S3-based free tier operations.



### High-Resolution Alternative: Open-Meteo

For specific 9km (0.1°) spot checks (e.g., precise waypoints), use the [Open-Meteo API](https://open-meteo.com/), which redistributes the 9km feed.

* **Model**: `ecmwf_ifs`

* **Resolution**: 0.1° (~9km)

* **Format**: JSON/FlatBuffers (Point Data)

* **Use Case**: Routing validation, harbor approaches (Complementary to the S3 Grid Seed).
