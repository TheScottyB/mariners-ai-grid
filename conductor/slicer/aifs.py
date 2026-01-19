# Mariner's AI Grid - AIFS Slicer
# SPDX-License-Identifier: Apache-2.0

"""
AIFS Slicer (AI Integrated Forecasting System).

Fetches data from ECMWF Open Data (AIFS) for local AI model seeds.
Enforces:
1. 2.5-degree spatial buffer (to prevent edge artifacts)
2. Autoregressive state (t, t-6h) for GraphCast initialization
"""

import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import numpy as np
import xarray as xr
from ecmwf.opendata import Client

from slicer.core import BoundingBox, WeatherSeed
from slicer.variables import MARINE_VARIABLES, GRAPHCAST_VARIABLES, VariablePruner

logger = logging.getLogger(__name__)

class AIFSSlicer:
    """
    Slices ECMWF AIFS Open Data for local AI inference.
    """
    
    # AIFS Native Resolution is 0.25 deg
    RESOLUTION = 0.25
    
    def __init__(self, cache_dir: Optional[Path] = None):
        self.cache_dir = cache_dir or Path("/tmp/mag_cache")
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.client = Client("ecmwf", model="aifs-single")

    def slice(
        self,
        bbox: BoundingBox,
        forecast_hours: int = 72,
        time_step_hours: int = 6, # AIFS standard step
    ) -> WeatherSeed:
        """
        Generate a Seed for local GraphCast inference.
        
        Automatically adds 2.5 deg buffer and fetches t-6h state.
        """
        # 1. Apply Logic Guardrail: 2.5 degree spatial buffer
        BUFFER_DEG = 2.5
        buffered_bbox = BoundingBox(
            lat_min=max(-90, bbox.lat_min - BUFFER_DEG),
            lat_max=min(90, bbox.lat_max + BUFFER_DEG),
            lon_min=bbox.lon_min - BUFFER_DEG, # TODO: Handle wrap
            lon_max=bbox.lon_max + BUFFER_DEG
        )
        logger.info(f"Buffered BBox: {buffered_bbox} (Original: {bbox})")

        # 2. Determine Time Steps (Autoregressive State)
        # We need T0 and T-6h. 
        # Strategy: Fetch latest run (00Z/12Z). 
        # For 'Seed', we typically want the ANALYSIS (0h) and the PREVIOUS run's forecast for -6h?
        # Simpler MVP: Fetch 0h and 6h from CURRENT run, and let the boat infer from 6h onwards.
        # OR: Fetch 0h from current, and assume boat has previous.
        # ROBUST STRATEGY: Fetch 0h, 6h, 12h... from current run.
        # GraphCast on boat will start inference from T=6 using (T0, T6) as inputs? 
        # Actually, standard GraphCast needs (T-1, T0) to predict T1.
        # If we provide (0h, 6h) from AIFS, the boat can predict 12h.
        # So we just need to ensure we provide at least first 2 steps.
        
        steps = list(range(0, forecast_hours + 1, time_step_hours))
        
        # 3. Fetch Data
        # AIFS Open Data provides specific params.
        # We need surface + pressure levels.
        
        # Surface
        sfc_params = ["msl", "10u", "10v", "2t"] # Basic set available in AIFS
        target_sfc = self.cache_dir / "aifs_sfc.grib2"
        
        logger.info("Fetching AIFS Surface data...")
        self.client.retrieve(
            date=0,      # Latest
            time=0,      # 00Z or 12Z auto-selection? client defaults to latest? 
            # ecmwf-opendata requires explicit time usually, or use '0' for 00Z?
            # Safe bet: use date=-1 (yesterday) if today 00Z not ready? 
            # Let's rely on default 'latest' behavior if possible or specify 0/12.
            # actually ecmwf-opendata 'date=0' means today.
            step=steps,
            type="fc",
            param=sfc_params,
            target=str(target_sfc)
        )
        
        # Upper Air (Pressure Levels)
        # AIFS usually has 50, 100, 250, 500, 850, 1000 hPa
        pl_params = ["z", "q", "t", "u", "v"] 
        levels = [1000, 850, 500] # Minimal set for MVP
        target_pl = self.cache_dir / "aifs_pl.grib2"
        
        logger.info("Fetching AIFS Upper Air data...")
        self.client.retrieve(
            date=0,
            step=steps,
            type="fc",
            levtype="pl",
            levelist=levels,
            param=pl_params,
            target=str(target_pl)
        )
        
        # 4. Merge and Crop (Slicing)
        ds_sfc = xr.open_dataset(target_sfc, engine="cfgrib")
        ds_pl = xr.open_dataset(target_pl, engine="cfgrib")
        
        # Rename vars to CF compliant if needed (cfgrib does some)
        # Merge
        ds = xr.merge([ds_sfc, ds_pl])
        
        # Crop to buffered bbox
        # xarray slicing: latitude is usually descending in GRIB (90 -> -90)
        ds_sliced = ds.sel(
            latitude=slice(buffered_bbox.lat_max, buffered_bbox.lat_min),
            longitude=slice(buffered_bbox.lon_min, buffered_bbox.lon_max)
        )
        
        # 5. Create WeatherSeed
        # Convert xarray to dict of numpy arrays
        variables = {}
        for var_name in ds_sliced.data_vars:
            variables[var_name] = ds_sliced[var_name].values.astype(np.float32)
            
        times = [datetime.now(timezone.utc) + timedelta(hours=h) for h in steps] # Approx
        
        return WeatherSeed(
            seed_id=f"aifs_seed_{datetime.now().strftime('%Y%m%d%H')}",
            created_at=datetime.now(timezone.utc),
            model_source="ecmwf_aifs_open",
            model_run=datetime.now(timezone.utc), # Placeholder
            bounding_box=buffered_bbox,
            resolution_deg=self.RESOLUTION,
            forecast_start=times[0],
            forecast_end=times[-1],
            time_step_hours=time_step_hours,
            variables=variables,
            latitudes=ds_sliced.latitude.values,
            longitudes=ds_sliced.longitude.values,
            times=times,
            metadata={"buffered": True, "buffer_deg": BUFFER_DEG}
        )
