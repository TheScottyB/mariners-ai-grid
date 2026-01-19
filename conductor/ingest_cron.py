#!/usr/bin/env python3
# Mariner's AI Grid - Backend Data Ingest Cron
# SPDX-License-Identifier: Apache-2.0

"""
Backend Ingest Cron Job.

This script is designed to run on a schedule (e.g., every 6 hours) to:
1. Detect the latest available ECMWF AIFS model run (00Z, 06Z, 12Z, 18Z).
2. Download the global parameter set required for the Slicer.
3. Cache these "Master Files" to persistent storage.

This decouples the heavy download (100MB-1GB) from the user-facing Slicer API,
ensuring that user requests are fast (local I/O only) and bandwidth-efficient.

Usage:
    python ingest_cron.py --target /path/to/persistent/cache
"""

import argparse
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from ecmwf.opendata import Client

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("mag-ingest")

class IngestManager:
    def __init__(self, cache_dir: Path):
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.client = Client("ecmwf", model="aifs-single")
        
    def get_latest_run_time(self) -> datetime:
        """
        Determine the latest plausible run time.
        ECMWF data is typically available ~6-7 hours after run time.
        """
        now = datetime.now(timezone.utc)
        
        # Check standard run times: 00, 06, 12, 18
        # Simple heuristic: look back 7 hours to be safe on availability
        target_time = now - timedelta(hours=7)
        
        # Round down to nearest 6-hour interval
        hour = (target_time.hour // 6) * 6
        run_time = target_time.replace(hour=hour, minute=0, second=0, microsecond=0)
        
        return run_time

    def fetch_global_state(self, date: datetime):
        """
        Download global fields for the specified run date.
        """
        date_str = date.strftime("%Y%m%d")
        time_str = date.strftime("%H%z")
        logger.info(f"Starting ingest for Run: {date_str} {time_str}")

        # Define parameters (Must match AIFSSlicer needs)
        # We download 0h to 240h (10 days) to cover all potential user requests
        # But for 'Seed' efficiency, maybe we only grab 0-72h high res?
        # Let's grab 72h at 3h steps, then 6h steps to 240h.
        
        # Slicer typically asks for up to 72h. Let's stick to that for now to save backend disk.
        steps = list(range(0, 73, 3))
        
        # Surface Params
        sfc_params = ["msl", "10u", "10v", "2t"]
        target_sfc = self.cache_dir / f"aifs_sfc_{date_str}_{date.hour:02d}.grib2"
        
        if target_sfc.exists():
            logger.info(f"Surface data already exists: {target_sfc}")
        else:
            logger.info(f"Downloading Surface data to {target_sfc}...")
            try:
                self.client.retrieve(
                    date=date,
                    time=date.hour,
                    step=steps,
                    type="fc",
                    param=sfc_params,
                    target=str(target_sfc)
                )
                logger.info("Surface download complete.")
            except Exception as e:
                logger.error(f"Failed to download surface data: {e}")
                # Don't raise immediately, try upper air
        
        # Upper Air Params
        pl_params = ["z", "q", "t", "u", "v"]
        levels = [1000, 850, 500]
        target_pl = self.cache_dir / f"aifs_pl_{date_str}_{date.hour:02d}.grib2"
        
        if target_pl.exists():
            logger.info(f"Upper Air data already exists: {target_pl}")
        else:
            logger.info(f"Downloading Upper Air data to {target_pl}...")
            try:
                self.client.retrieve(
                    date=date,
                    time=date.hour,
                    step=steps,
                    type="fc",
                    levtype="pl",
                    levelist=levels,
                    param=pl_params,
                    target=str(target_pl)
                )
                logger.info("Upper Air download complete.")
            except Exception as e:
                logger.error(f"Failed to download upper air data: {e}")

        # Update 'latest' symlink or pointer
        self._update_latest_pointer(target_sfc, target_pl)

    def _update_latest_pointer(self, sfc_path: Path, pl_path: Path):
        """
        Update symlinks 'aifs_sfc_latest.grib2' and 'aifs_pl_latest.grib2'
        to point to the newly downloaded files.
        """
        if sfc_path.exists():
            link = self.cache_dir / "aifs_sfc.grib2"
            if link.exists() or link.is_symlink():
                link.unlink()
            link.symlink_to(sfc_path.name)
            logger.info(f"Updated latest Surface link -> {sfc_path.name}")

        if pl_path.exists():
            link = self.cache_dir / "aifs_pl.grib2"
            if link.exists() or link.is_symlink():
                link.unlink()
            link.symlink_to(pl_path.name)
            logger.info(f"Updated latest Upper Air link -> {pl_path.name}")

def main():
    parser = argparse.ArgumentParser(description="ECMWF AIFS Ingest Cron")
    parser.add_argument("--target", type=Path, default=Path("/tmp/mag_cache"),
                      help="Directory to store downloaded GRIB files")
    parser.add_argument("--force", action="store_true", help="Force download even if exists")
    
    args = parser.parse_args()
    
    manager = IngestManager(args.target)
    
    # 1. Calculate latest run
    run_time = manager.get_latest_run_time()
    logger.info(f"Targeting Run: {run_time}")
    
    # 2. Fetch
    manager.fetch_global_state(run_time)
    
    # 3. Cleanup old files? (TODO: Implement LRU or simple day-based cleanup)

if __name__ == "__main__":
    main()
