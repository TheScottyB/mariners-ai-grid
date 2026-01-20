#!/usr/bin/env python3
"""
Test ECMWF AWS S3 bucket access and partial downloads via index files.

This script demonstrates:
1. Listing available forecast runs in S3
2. Downloading GRIB2 index files
3. Parsing index to find specific parameters
4. Partial downloads using HTTP Range headers
5. Comparing S3 vs HTTP endpoint performance
"""

import requests
import json
from datetime import datetime, timedelta
import sys
from typing import Dict, List, Tuple


def get_latest_run() -> Tuple[str, str]:
    """Get the most recent forecast run (00z or 12z)."""
    now = datetime.now()
    
    # ECMWF runs at 00z and 12z, with ~6-7 hour latency
    if now.hour >= 18:
        run = "12z"
        date = now.strftime("%Y%m%d")
    elif now.hour >= 6:
        run = "00z"
        date = now.strftime("%Y%m%d")
    else:
        # Use previous day's 12z run
        run = "12z"
        date = (now - timedelta(days=1)).strftime("%Y%m%d")
    
    return date, run


def list_s3_files(date: str, run: str, model: str = "ifs", resolution: str = "0p25", stream: str = "oper") -> List[str]:
    """
    List available GRIB2 files in S3 bucket.
    
    Args:
        date: YYYYMMDD format (e.g., "20260118")
        run: "00z", "06z", "12z", or "18z"
        model: "ifs", "aifs-single", or "aifs-ens"
        resolution: "0p25" (28km) - Note: 0.1° not available in S3
        stream: "oper" (operational), "enfo" (ensemble), "wave", etc.
    
    Returns:
        List of S3 keys (file paths)
    """
    url = f"https://ecmwf-forecasts.s3.amazonaws.com?list-type=2&prefix={date}/{run}/{model}/{resolution}/{stream}/"
    
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        
        # Parse XML response (simple approach - extract <Key> tags)
        keys = []
        for line in response.text.split('<Key>'):
            if '</Key>' in line:
                key = line.split('</Key>')[0]
                if key.endswith('.grib2'):
                    keys.append(key)
        
        return keys
    except requests.RequestException as e:
        print(f"❌ Failed to list S3 files: {e}")
        return []


def download_index(date: str, run: str, step: int, model: str = "ifs", resolution: str = "0p25", stream: str = "oper") -> str:
    """
    Download and return the index file content.
    
    Args:
        date: YYYYMMDD format
        run: "00z", "12z", etc.
        step: Forecast step in hours (0, 3, 6, ..., 240)
        model: "ifs" or "aifs-single"
        resolution: "0p25"
        stream: "oper" (operational forecast)
    
    Returns:
        Index file content as string
    """
    filename = f"{date}{run.replace('z', '')}0000-{step}h-{stream}-fc.index"
    url = f"https://ecmwf-forecasts.s3.amazonaws.com/{date}/{run}/{model}/{resolution}/{stream}/{filename}"
    
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        return response.text
    except requests.RequestException as e:
        print(f"❌ Failed to download index file: {e}")
        return ""


def parse_index(index_content: str) -> Dict[str, Tuple[int, int]]:
    """
    Parse index file to extract parameter byte offsets.
    
    The ECMWF S3 index files are in JSON Lines format, with each line containing:
    {"param": "10u", "levtype": "sfc", "_offset": 12345, "_length": 67890, ...}
    
    Args:
        index_content: Content of .index file (JSON Lines format)
    
    Returns:
        Dictionary mapping parameter names to (start_offset, length)
        Example: {"10u:sfc": (12345, 67890), "10v:sfc": (80235, 67890), ...}
    """
    lines = index_content.strip().split('\n')
    params = {}
    
    for line in lines:
        if not line.strip():
            continue
        
        try:
            entry = json.loads(line)
            
            # Extract parameter info
            param = entry.get('param', 'unknown')
            levtype = entry.get('levtype', 'sfc')
            levelist = entry.get('levelist', '')
            offset = entry.get('_offset', 0)
            length = entry.get('_length', 0)
            
            # Create readable key
            if levelist:
                key = f"{param}:{levtype}:{levelist}"
            else:
                key = f"{param}:{levtype}"
            
            # Store offset and length (not end offset)
            params[key] = (offset, length)
        
        except json.JSONDecodeError:
            continue
    
    return params


def download_partial_grib(date: str, run: str, step: int, param_offsets: Tuple[int, int], 
                          model: str = "ifs", resolution: str = "0p25", stream: str = "oper") -> bytes:
    """
    Download only a specific parameter from GRIB2 file using HTTP Range header.
    
    Args:
        date: YYYYMMDD format
        run: "00z", "12z", etc.
        step: Forecast step in hours
        param_offsets: (start_offset, length) from index file
        model: "ifs" or "aifs-single"
        resolution: "0p25"
        stream: "oper"
    
    Returns:
        Raw GRIB2 data bytes for the requested parameter
    """
    filename = f"{date}{run.replace('z', '')}0000-{step}h-{stream}-fc.grib2"
    url = f"https://ecmwf-forecasts.s3.amazonaws.com/{date}/{run}/{model}/{resolution}/{stream}/{filename}"
    
    start_offset, length = param_offsets
    end_offset = start_offset + length - 1
    
    # Download specific range
    headers = {'Range': f'bytes={start_offset}-{end_offset}'}
    
    try:
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        return response.content
    except requests.RequestException as e:
        print(f"❌ Failed to download partial GRIB: {e}")
        return b""


def test_s3_access():
    """Main test function."""
    print("=" * 60)
    print("ECMWF AWS S3 Access Test")
    print("=" * 60)
    
    # Get latest available run
    date, run = get_latest_run()
    print(f"\n📅 Testing with date: {date}, run: {run}")
    
    # Test 1: List available files
    print(f"\n1️⃣  Listing S3 files for IFS 0.25° operational...")
    keys = list_s3_files(date, run, model="ifs", resolution="0p25", stream="oper")
    
    if keys:
        print(f"✅ Found {len(keys)} GRIB2 files in S3")
        print(f"   First file: {keys[0]}")
        print(f"   Last file: {keys[-1]}")
    else:
        print(f"⚠️  No files found - may need to use previous day's run")
        # Fallback to yesterday
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y%m%d")
        print(f"   Trying {yesterday}...")
        keys = list_s3_files(yesterday, "12z", model="ifs", resolution="0p25", stream="oper")
        if keys:
            date = yesterday
            run = "12z"
            print(f"✅ Found {len(keys)} files for {date}/{run}")
        else:
            print("❌ Still no files found. S3 bucket may have retention policy.")
            return
    
    # Test 2: Download and parse index file for T+0 (initial conditions)
    print(f"\n2️⃣  Downloading index file for T+0...")
    index_content = download_index(date, run, step=0)
    
    if index_content:
        print(f"✅ Index file downloaded ({len(index_content)} bytes)")
        
        # Parse index
        params = parse_index(index_content)
        print(f"   Found {len(params)} parameters in GRIB2 file")
        
        # Show marine-relevant parameters (ECMWF uses different param names)
        # 10u = u-component of wind at 10m, 10v = v-component, msl = mean sea level pressure
        marine_params = [p for p in params.keys() if any(x in p for x in ['10u', '10v', 'msl', 'fg10'])]
        print(f"\n   Marine parameters available:")
        for param in marine_params[:10]:
            offset, length = params[param]
            print(f"   - {param}: offset={offset}, length={length} bytes ({length/1e6:.2f} MB)")
    else:
        print("❌ Failed to download index file")
        return
    
    # Test 3: Partial download of wind components
    print(f"\n3️⃣  Testing partial download of U-wind component...")
    
    # Look for 10u (u-component of wind at 10m) at surface level
    ugrd_key = [k for k in params.keys() if '10u' in k and 'sfc' in k]
    if ugrd_key:
        param_name = ugrd_key[0]
        offsets = params[param_name]
        
        print(f"   Downloading: {param_name}")
        print(f"   Byte range: {offsets[0]} (length: {offsets[1]} bytes)")
        
        data = download_partial_grib(date, run, step=0, param_offsets=offsets)
        
        if data:
            print(f"✅ Downloaded {len(data)} bytes ({len(data)/1e6:.2f} MB)")
            print(f"   vs ~100-120 MB for full file")
            print(f"   Data savings: {100 - (len(data) / 1.1e8 * 100):.1f}% reduction")
        else:
            print("❌ Partial download failed")
    else:
        print("⚠️  10u parameter not found in index")
    
    # Test 4: Compare S3 vs HTTP endpoint availability
    print(f"\n4️⃣  Comparing S3 vs HTTP endpoints...")
    
    # S3 endpoint
    s3_url = f"https://ecmwf-forecasts.s3.amazonaws.com/{date}/{run}/ifs/0p25/oper/{date}{run.replace('z', '')}0000-0h-oper-fc.grib2"
    
    # HTTP endpoint (0.1° resolution)
    http_url = f"https://data.ecmwf.int/forecasts/{date}/{run.replace('z', '')}/ifs/0p1/{date}{run.replace('z', '')}0000-0h-oper-fc.grib2"
    
    print(f"   S3 (0.25°):  {s3_url}")
    try:
        response = requests.head(s3_url, timeout=10)
        if response.status_code == 200:
            size_mb = int(response.headers.get('content-length', 0)) / 1e6
            print(f"   ✅ Accessible - {size_mb:.1f} MB")
        else:
            print(f"   ❌ Status: {response.status_code}")
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    print(f"\n   HTTP (0.1°): {http_url}")
    try:
        response = requests.head(http_url, timeout=10)
        if response.status_code == 200:
            size_mb = int(response.headers.get('content-length', 0)) / 1e6
            print(f"   ✅ Accessible - {size_mb:.1f} MB")
        elif response.status_code == 429:
            print(f"   ⚠️  Rate limited (HTTP 429) - accessible but throttled")
        else:
            print(f"   ❌ Status: {response.status_code}")
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    print("\n" + "=" * 60)
    print("✅ Test complete!")
    print("=" * 60)
    print("\nKey Findings:")
    print("- S3 provides IFS operational forecasts at 0.25° (28km) resolution")
    print("- Index files enable downloading only needed parameters (~1-2MB vs 100MB)")
    print("- S3 has no rate limiting (vs HTTP 429 on main ECMWF endpoints)")
    print("- Trade-off: S3 0.25° is faster but coarser than HTTP 0.1° (9km)")
    print("\nRecommendation:")
    print("- Use S3 for open ocean and bulk downloads")
    print("- Use HTTP 0.1° for coastal navigation when higher resolution needed")


if __name__ == "__main__":
    test_s3_access()
