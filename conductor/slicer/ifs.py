# Mariner's AI Grid - IFS Slicer
# SPDX-License-Identifier: Apache-2.0

"""
IFS Slicer (Integrated Forecasting System).

Fetches high-resolution (HRES) physics-based data from ECMWF Open Data.
Provides the native 9km resolution baseline for the AI Grid.

As of Oct 1, 2025, IFS HRES is available at native 9km resolution 
under the ECMWF Open Data policy.
"""

import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import numpy as np
import xarray as xr
from ecmwf.opendata import Client

from slicer.core import BoundingBox, WeatherSeed
from slicer.variables import MARINE_VARIABLES, STANDARD_VARIABLES

logger = logging.getLogger(__name__)

class IFSSlicer:
    """
    Slices ECMWF IFS HRES Open Data.
    """
    
    # IFS HRES Native Resolution is ~9km (0.1 deg)
    RESOLUTION = 0.1
    
    def __init__(self, cache_dir: Optional[Path] = None):
        self.cache_dir = cache_dir or Path("/tmp/mag_cache")
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        # model="ifs" for physics-driven high-res model
        self.client = Client("ecmwf", model="ifs")

    def slice(
        self,
        bbox: BoundingBox,
        forecast_hours: int = 72,
        time_step_hours: int = 3,
        variables: Optional[list[str]] = None,
    ) -> WeatherSeed:
        """
        Extract a regional weather slice from IFS HRES.
        """
        # Determine variables
        var_names = variables or STANDARD_VARIABLES
        
        steps = list(range(0, forecast_hours + 1, time_step_hours))
        
        # Surface params
        # Note: IFS param names might differ slightly from AIFS in the API
        # but ecmwf-opendata handles common short names.
        sfc_params = [v for v in var_names if v in ["u10", "v10", "msl", "2t", "swh", "mwp", "mwd", "tp"]]
        
        target_file = self.cache_dir / f"ifs_hres_{bbox.cache_key()}.grib2"
        
        try:
            logger.info(f"Fetching IFS HRES (9km) for {bbox}...")
            # Optimization: check cache handled by ingest_cron or similar?
            # For now, direct fetch
            self.client.retrieve(
                date=0,      # Latest
                time=0,      # 00Z (fallback logic could be added)
                step=steps,
                type="fc",
                param=sfc_params,
                target=str(target_file)
            )
            model_run_date = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        except Exception as e:
            logger.error(f"IFS retrieval failed: {e}")
            raise RuntimeError("Could not fetch IFS data.") from e

        # Parse and Crop
        ds = xr.open_dataset(target_file, engine="cfgrib")
        
        ds_sliced = ds.sel(
            latitude=slice(bbox.lat_max, bbox.lat_min),
            longitude=slice(bbox.lon_min, bbox.lon_max)
        )
        
        variables_data = {}
        for var_name in ds_sliced.data_vars:
            variables_data[var_name] = ds_sliced[var_name].values.astype(np.float32)
            
        times = [model_run_date + timedelta(hours=h) for h in steps]
        
        return WeatherSeed(
            seed_id=f"ifs_hres_{model_run_date.strftime('%Y%m%d%H')}",
            created_at=datetime.now(timezone.utc),
            model_source="ecmwf_ifs_hres",
            model_run=model_run_date,
            bounding_box=bbox,
            resolution_deg=self.RESOLUTION,
            forecast_start=times[0],
            forecast_end=times[-1],
            time_step_hours=time_step_hours,
            variables=variables_data,
            latitudes=ds_sliced.latitude.values,
            longitudes=ds_sliced.longitude.values,
            times=times,
            metadata={"source": "ecmwf_opendata", "resolution": "9km"}
        )
