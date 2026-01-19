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

        steps = list(range(0, forecast_hours + 1, time_step_hours))
        
        # 3. Fetch Data with Fallback
        # Try today's 00Z run (date=0, time=0). If not available, try yesterday's 12Z (date=-1, time=12).
        
        # Surface
        sfc_params = ["msl", "10u", "10v", "2t"] 
        target_sfc = self.cache_dir / "aifs_sfc.grib2"
        
        # Upper Air
        pl_params = ["z", "q", "t", "u", "v"] 
        levels = [1000, 850, 500] 
        target_pl = self.cache_dir / "aifs_pl.grib2"
        
        try:
            logger.info("Attempting to fetch latest AIFS run (00Z)...")
            self._fetch_files(date=0, time=0, steps=steps, sfc_params=sfc_params, pl_params=pl_params, levels=levels, target_sfc=target_sfc, target_pl=target_pl)
            model_run_date = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        except Exception as e:
            logger.warning(f"00Z run not available: {e}. Falling back to previous 12Z...")
            try:
                self._fetch_files(date=-1, time=12, steps=steps, sfc_params=sfc_params, pl_params=pl_params, levels=levels, target_sfc=target_sfc, target_pl=target_pl)
                model_run_date = (datetime.now(timezone.utc) - timedelta(days=1)).replace(hour=12, minute=0, second=0, microsecond=0)
            except Exception as e2:
                logger.error(f"Fallback failed: {e2}")
                raise RuntimeError("Could not fetch AIFS data from ECMWF Open Data.") from e2

        # 4. Merge and Crop (Slicing)
        ds_sfc = xr.open_dataset(target_sfc, engine="cfgrib")
        ds_pl = xr.open_dataset(target_pl, engine="cfgrib")
        
        # Merge
        ds = xr.merge([ds_sfc, ds_pl])
        
        # Crop to buffered bbox
        # xarray slicing: latitude is usually descending in GRIB (90 -> -90)
        ds_sliced = ds.sel(
            latitude=slice(buffered_bbox.lat_max, buffered_bbox.lat_min),
            longitude=slice(buffered_bbox.lon_min, buffered_bbox.lon_max)
        )
        
        # 5. Create WeatherSeed
        variables = {}
        for var_name in ds_sliced.data_vars:
            variables[var_name] = ds_sliced[var_name].values.astype(np.float32)
            
        times = [model_run_date + timedelta(hours=h) for h in steps]
        
        return WeatherSeed(
            seed_id=f"aifs_seed_{model_run_date.strftime('%Y%m%d%H')}",
            created_at=datetime.now(timezone.utc),
            model_source="ecmwf_aifs_open",
            model_run=model_run_date,
            bounding_box=buffered_bbox,
            resolution_deg=self.RESOLUTION,
            forecast_start=times[0],
            forecast_end=times[-1],
            time_step_hours=time_step_hours,
            variables=variables,
            latitudes=ds_sliced.latitude.values,
            longitudes=ds_sliced.longitude.values,
            times=times,
            metadata={"buffered": "true", "buffer_deg": str(BUFFER_DEG)}
        )

    def _fetch_files(self, date, time, steps, sfc_params, pl_params, levels, target_sfc, target_pl):
        # Surface
        self.client.retrieve(
            date=date,
            time=time,
            step=steps,
            type="fc",
            param=sfc_params,
            target=str(target_sfc)
        )
        # Upper Air
        self.client.retrieve(
            date=date,
            time=time,
            step=steps,
            type="fc",
            levtype="pl",
            levelist=levels,
            param=pl_params,
            target=str(target_pl)
        )