# Mariner's AI Grid - S3 Data Provider
# SPDX-License-Identifier: Apache-2.0

import logging
import requests
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, List

logger = logging.getLogger(__name__)

class S3DataProvider:
    """
    Provides access to ECMWF Open Data hosted on AWS S3.
    Bucket: ecmwf-forecasts (Public) 
    
    Supports byte-range requests for efficient regional slicing.
    """
    
    BUCKET_URL = "https://ecmwf-forecasts.s3.amazonaws.com"
    
    def __init__(self, cache_dir: Optional[Path] = None):
        self.cache_dir = cache_dir or Path("/tmp/mag_s3_cache")
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.session = requests.Session()

    def get_grib_url(self, date: datetime, time_z: str, model: str, resol: str, stream: str, step: int) -> str:
        """
        Construct S3 URL for a specific GRIB2 file.
        Example: https://ecmwf-forecasts.s3.amazonaws.com/20260119/12z/ifs/0p25/oper/20260119120000-0h-oper-fc.grib2
        """
        date_str = date.strftime("%Y%m%d")
        # time_z is "00z", "12z", etc.
        # step is forecast hour
        filename = f"{date_str}{time_z.replace('z', '0000')}-{step}h-{stream}-fc.grib2"
        return f"{self.BUCKET_URL}/{date_str}/{time_z}/{model}/{resol}/{stream}/{filename}"

    def download_full(self, url: str, target_path: Path) -> bool:
        """Download entire file from S3."""
        logger.info(f"Downloading from S3: {url}")
        resp = self.session.get(url, stream=True)
        if resp.ok:
            with open(target_path, 'wb') as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    f.write(chunk)
            return True
        logger.error(f"S3 Download failed: {resp.status_code}")
        return False

    def download_range(self, url: str, start_byte: int, length: int, target_path: Path) -> bool:
        """Download a specific byte range from S3 (Slicing)."""
        headers = {"Range": f"bytes={start_byte}-{start_byte + length - 1}"}
        resp = self.session.get(url, headers=headers)
        if resp.status_code == 206:
            with open(target_path, 'wb') as f:
                f.write(resp.content)
            return True
        return False

    def get_index(self, grib_url: str) -> Optional[List[dict]]:
        """Fetch and parse the .index file for a GRIB resource."""
        index_url = grib_url.replace(".grib2", ".index")
        resp = self.session.get(index_url)
        if resp.ok:
            import json
            lines = resp.text.strip().split('\n')
            return [json.loads(line) for line in lines]
        return None
